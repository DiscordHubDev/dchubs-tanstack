import fs from "node:fs";
import path from "node:path";
import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import mime from "mime-types";

// 1. 初始化 S3 用戶端（連接到 Cloudflare R2）
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID; // R2 的 Access Key
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY; // R2 的 Secret Key
const bucketName = "dchubs"; // 你的 Bucket 名稱

if (!accountId || !accessKeyId || !secretAccessKey) {
	console.error("❌ 錯誤：缺少必要的 R2 環境變數！");
	process.exit(1);
}

const s3Client = new S3Client({
	region: "auto",
	endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
	credentials: {
		accessKeyId,
		secretAccessKey,
	},
});

// 2. 定義本機與遠端路徑
const LOCAL_DIR = path.resolve("./.output/public/assets");
const REMOTE_PREFIX = "assets/"; // 對應 s3://dchubs/assets/

// 遞迴獲取資料夾內所有檔案的函式
function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
	if (!fs.existsSync(dirPath)) {
		console.warn(`⚠️ 警告：找不到本機目錄 ${dirPath}，跳過上傳。`);
		return [];
	}

	const files = fs.readdirSync(dirPath);

	files.forEach((file) => {
		const filePath = path.join(dirPath, file);
		if (fs.statSync(filePath).isDirectory()) {
			arrayOfFiles = getAllFiles(filePath, arrayOfFiles);
		} else {
			arrayOfFiles.push(filePath);
		}
	});

	return arrayOfFiles;
}

// 3. 執行上傳流程
async function uploadSync() {
	console.log("🚀 開始同步 assets 到 Cloudflare R2...");

	const files = getAllFiles(LOCAL_DIR);
	if (files.length === 0) {
		console.log("✨ 沒有發現任何檔案需要上傳。");
		return;
	}

	for (const filePath of files) {
		// 計算在 R2 上的相對路徑
		const relativePath = path.relative(LOCAL_DIR, filePath).replace(/\\/g, "/");
		const r2Key = `${REMOTE_PREFIX}${relativePath}`;

		// 自動辨識 Content-Type，如果抓不到就用預設值
		const contentType = mime.lookup(filePath) || "application/octet-stream";
		const fileStream = fs.createReadStream(filePath);

		try {
			// 使用 Upload 類別，等同於 aws s3 sync 的上傳機制（支援大檔案分段）
			const parallelUploads3 = new Upload({
				client: s3Client,
				params: {
					Bucket: bucketName,
					Key: r2Key,
					Body: fileStream,
					ContentType: contentType,
					CacheControl: "public, max-age=31536000, immutable", // 你的快取設定
				},
			});

			await parallelUploads3.done();
			// 比照 --no-progress，我們只印出簡短的成功訊息，不跑進度條
			console.log(`✅ Uploaded: ${r2Key} (${contentType})`);
		} catch (err) {
			console.error(`❌ Failed to upload ${relativePath}:`, err);
		}
	}

	console.log("🎉 所有 Assets 同步完成！");
}

uploadSync();
