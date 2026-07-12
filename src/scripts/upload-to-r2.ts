import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import mime from "mime-types";

// ==================== 配置 ====================
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const bucketName = "dchubs";

const REMOTE_PREFIX = "assets/";
const MAX_CONCURRENT_UPLOADS = 20;

if (!accountId || !accessKeyId || !secretAccessKey) {
  console.error("❌ 錯誤：缺少必要的 R2 環境變數！");
  process.exit(1);
}

// ==================== HTTP Keep-Alive Handler ====================
const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 50, // 可依實際並發調整
  maxFreeSockets: 20,
});

const httpHandler = new NodeHttpHandler({
  httpsAgent,
  connectionTimeout: 30000,
  socketTimeout: 120000,
});

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
  requestHandler: httpHandler,
});

// ==================== 來源目錄 ====================
const LOCAL_DIRS = [
  path.resolve(process.cwd(), ".output/public/assets"),
  path.resolve(process.cwd(), "node_modules/.nitro/vite/services/ssr/assets"),
];

// ==================== 工具函式 ====================
function getAllFiles(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) return [];
  const files: string[] = [];

  const traverse = (current: string) => {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        traverse(fullPath);
      } else {
        files.push(fullPath);
      }
    }
  };

  traverse(dirPath);
  return files;
}

async function withConcurrency<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>) {
  const queue: Promise<void>[] = [];
  for (const item of items) {
    const p = fn(item).finally(() => {
      const idx = queue.indexOf(p);
      if (idx > -1) queue.splice(idx, 1);
    });
    queue.push(p);

    if (queue.length >= concurrency) {
      await Promise.race(queue);
    }
  }
  await Promise.all(queue);
}

// ==================== 從 R2 獲取現有檔案 ====================
async function getExistingR2Files(): Promise<Map<string, { size: number }>> {
  console.log("📋 正在從 R2 獲取現有檔案列表...");
  const existing = new Map<string, { size: number }>();
  let continuationToken: string | undefined;

  do {
    const listCommand = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: REMOTE_PREFIX,
      ContinuationToken: continuationToken,
    });

    const response = await s3Client.send(listCommand);
    continuationToken = response.NextContinuationToken;

    if (!response.Contents) break;

    for (const obj of response.Contents) {
      if (!obj.Key || obj.Size === undefined) continue;
      existing.set(obj.Key, { size: obj.Size });
    }
  } while (continuationToken);

  console.log(`📊 R2 上找到 ${existing.size} 個現有檔案`);
  return existing;
}

// ==================== 主流程 ====================
async function main() {
  console.log("🚀 開始同步 Assets 到 Cloudflare R2...");

  const allFilesToUpload: { localPath: string; r2Key: string }[] = [];

  for (const dir of LOCAL_DIRS) {
    if (!fs.existsSync(dir)) {
      console.warn(`⚠️ 目錄不存在（跳過）: ${dir}`);
      continue;
    }
    const files = getAllFiles(dir);
    for (const filePath of files) {
      const relative = path.relative(dir, filePath).replace(/\\/g, "/");
      allFilesToUpload.push({
        localPath: filePath,
        r2Key: `${REMOTE_PREFIX}${relative}`,
      });
    }
  }

  if (allFilesToUpload.length === 0) {
    console.error("❌ 沒有找到任何檔案，請確認 build 是否成功！");
    process.exit(1);
  }

  const uniqueFiles = Array.from(new Map(allFilesToUpload.map((f) => [f.r2Key, f])).values());
  console.log(`📦 共發現 ${uniqueFiles.length} 個唯一本地檔案`);

  const existingFiles = await getExistingR2Files();

  const filesToUpload: { localPath: string; r2Key: string }[] = [];
  let skippedCount = 0;

  for (const fileObj of uniqueFiles) {
    const localStats = fs.statSync(fileObj.localPath);
    const existing = existingFiles.get(fileObj.r2Key);

    if (existing && existing.size === localStats.size) {
      skippedCount++;
      console.log(`⏭️ 跳過（已存在且大小相同）: ${fileObj.r2Key}`);
      continue;
    }

    filesToUpload.push(fileObj);
  }

  console.log(`📤 決定上傳 ${filesToUpload.length} 個檔案（跳過 ${skippedCount} 個）`);

  if (filesToUpload.length === 0) {
    console.log("✨ 所有檔案均已最新，無需上傳！");
    return;
  }

  // 上傳
  const uploadedKeys = new Set<string>();
  let successCount = 0;
  let failedCount = 0;

  await withConcurrency(filesToUpload, MAX_CONCURRENT_UPLOADS, async (fileObj) => {
    if (uploadedKeys.has(fileObj.r2Key)) return;

    const contentType = mime.lookup(fileObj.localPath) || "application/octet-stream";

    try {
      const fileStream = fs.createReadStream(fileObj.localPath);

      const upload = new Upload({
        client: s3Client,
        params: {
          Bucket: bucketName,
          Key: fileObj.r2Key,
          Body: fileStream,
          ContentType: contentType,
          CacheControl: "public, max-age=31536000, immutable",
        },
      });

      await upload.done();
      uploadedKeys.add(fileObj.r2Key);
      successCount++;
      console.log(`✅ 上傳完成: ${fileObj.r2Key}`);
    } catch (err) {
      failedCount++;
      console.error(`❌ 上傳失敗 ${fileObj.r2Key}:`, err);
    }
  });

  console.log(`🎉 上傳完成！成功: ${successCount}，失敗: ${failedCount}`);
}

// 執行
main().catch((err) => {
  console.error("💥 程式執行失敗:", err);
  process.exit(1);
});
