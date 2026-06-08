import fs from "node:fs";
import path from "node:path";
import {
	DeleteObjectsCommand,
	ListObjectsV2Command,
	S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import mime from "mime-types";

// 1. 初始化 S3 用戶端（連接到 Cloudflare R2）
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const bucketName = "dchubs";

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
// 🔴 修正點：加上 .output 的小數點，並使用 process.cwd() 確保相對路徑絕對正確
const LOCAL_DIR = path.resolve(process.cwd(), ".output/public/assets");
const REMOTE_PREFIX = "assets/"; // 對應 s3://dchubs/assets/

async function cleanUpStaleFiles(localFiles: string[]) {
	console.log("🧹 開始檢查並清理過期的舊版本檔案...");

	const localKeys = new Set(
		localFiles.map((filePath) => {
			const relativePath = path
				.relative(LOCAL_DIR, filePath)
				.replace(/\\/g, "/");
			return `${REMOTE_PREFIX}${relativePath}`;
		}),
	);

	const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
	const now = Date.now();

	try {
		const listCommand = new ListObjectsV2Command({
			Bucket: bucketName,
			Prefix: REMOTE_PREFIX,
		});
		const r2Objects = await s3Client.send(listCommand);

		if (!r2Objects.Contents) return;

		const keysToDelete: { Key: string }[] = [];
		let skippedCount = 0;

		for (const obj of r2Objects.Contents) {
			if (!obj.Key) continue;
			if (localKeys.has(obj.Key)) continue;

			const lastModifiedTime = obj.LastModified
				? obj.LastModified.getTime()
				: 0;
			const ageMs = now - lastModifiedTime;

			if (ageMs > SEVEN_DAYS_MS) {
				keysToDelete.push({ Key: obj.Key });
			} else {
				skippedCount++;
			}
		}

		if (keysToDelete.length === 0) {
			console.log(
				`✨ 沒有超過 7 天的舊檔案需要清理。（有 ${skippedCount} 個舊檔案還在 7 天緩衝期內）`,
			);
			return;
		}

		const deleteCommand = new DeleteObjectsCommand({
			Bucket: bucketName,
			Delete: { Objects: keysToDelete },
		});

		await s3Client.send(deleteCommand);
		console.log(
			`🗑️ 成功清理了 ${keysToDelete.length} 個過期舊檔案。（保留了 ${skippedCount} 個緩衝期內的舊檔案）`,
		);
	} catch (err) {
		console.error("❌ 清理舊檔案時發生錯誤:", err);
	}
}

// 遞迴獲取資料夾內所有檔案的函式
function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
	if (!fs.existsSync(dirPath)) {
		// 🔴 修正點：如果找不到目錄，直接噴錯中斷，防止部署無效檔案
		console.error(
			`❌ 錯誤：找不到本機目錄 ${dirPath}！請確認是否有先執行 build。`,
		);
		process.exit(1);
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
		const relativePath = path.relative(LOCAL_DIR, filePath).replace(/\\/g, "/");
		const r2Key = `${REMOTE_PREFIX}${relativePath}`;

		const contentType = mime.lookup(filePath) || "application/octet-stream";
		const fileStream = fs.createReadStream(filePath);

		try {
			const parallelUploads3 = new Upload({
				client: s3Client,
				params: {
					Bucket: bucketName,
					Key: r2Key,
					Body: fileStream,
					ContentType: contentType,
					// 🔴 確保這些帶有 Hash 的檔案被瀏覽器無限期快取 (Immutable)
					CacheControl: "public, max-age=31536000, immutable",
				},
			});

			await parallelUploads3.done();
			console.log(`✅ Uploaded: ${r2Key} (${contentType})`);
		} catch (err) {
			console.error(`❌ Failed to upload ${relativePath}:`, err);
		}
	}

	console.log("🎉 所有 Assets 同步完成！");
	await cleanUpStaleFiles(files);
}

// 執行
uploadSync();
