import fs from "node:fs";
import path from "node:path";
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import mime from "mime-types";

// ==================== 配置 ====================
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const bucketName = "dchubs";

const REMOTE_PREFIX = "assets/";
const MAX_CONCURRENT_UPLOADS = 20; // 可依網路調整 10~30
const STALE_DAYS = 7;
const MAX_KEYS_PER_DELETE = 1000; // S3 DeleteObjects 限制

if (!accountId || !accessKeyId || !secretAccessKey) {
  console.error("❌ 錯誤：缺少必要的 R2 環境變數！");
  process.exit(1);
}

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
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

// 簡單的並發控制
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

  // 去重（Client 與 SSR 可能產生相同 hash 檔案）
  const uniqueFiles = Array.from(new Map(allFilesToUpload.map((f) => [f.r2Key, f])).values());

  console.log(`📦 共發現 ${uniqueFiles.length} 個唯一檔案待上傳`);

  // 1. 上傳
  const uploadedKeys = new Set<string>();
  let successCount = 0;
  let failedCount = 0;

  await withConcurrency(uniqueFiles, MAX_CONCURRENT_UPLOADS, async (fileObj) => {
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
      console.log(`✅ ${fileObj.r2Key}`);
    } catch (err) {
      failedCount++;
      console.error(`❌ 上傳失敗 ${fileObj.r2Key}:`, err);
    }
  });

  console.log(`🎉 上傳完成！成功: ${successCount}，失敗: ${failedCount}`);

  // 2. 清理舊檔案
  if (successCount > 0) {
    await cleanUpStaleFiles(uniqueFiles.map((f) => f.r2Key));
  }
}

// ==================== 清理過期檔案（支援分頁） ====================
async function cleanUpStaleFiles(currentKeys: string[]) {
  console.log("🧹 開始清理過期舊檔案...");

  const localKeys = new Set(currentKeys);
  const staleMs = STALE_DAYS * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const keysToDelete: string[] = [];
  let skipped = 0;
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
      if (!obj.Key) continue;
      if (localKeys.has(obj.Key)) continue;

      const age = now - (obj.LastModified?.getTime() || 0);
      if (age > staleMs) {
        keysToDelete.push(obj.Key);
      } else {
        skipped++;
      }
    }
  } while (continuationToken);

  if (keysToDelete.length === 0) {
    console.log(`✨ 沒有超過 ${STALE_DAYS} 天的舊檔案需要清理（跳過 ${skipped} 個緩衝期檔案）`);
    return;
  }

  // 分批刪除（S3 限制每次最多 1000）
  for (let i = 0; i < keysToDelete.length; i += MAX_KEYS_PER_DELETE) {
    const batch = keysToDelete.slice(i, i + MAX_KEYS_PER_DELETE);
    await s3Client.send(
      new DeleteObjectsCommand({
        Bucket: bucketName,
        Delete: { Objects: batch.map((Key) => ({ Key })) },
      }),
    );
    console.log(`🗑️ 已刪除 ${batch.length} 個舊檔案`);
  }

  console.log(`✅ 清理完成，共刪除 ${keysToDelete.length} 個過期檔案`);
}

// 執行
main().catch((err) => {
  console.error("💥 程式執行失敗:", err);
  process.exit(1);
});
