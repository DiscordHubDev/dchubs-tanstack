import fs from "node:fs";
import path from "node:path";
import {
	DeleteObjectsCommand,
	ListObjectsV2Command,
	S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import mime from "mime-types";

// 1. 初始化 S3 用戶端
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

// 2. 🔴 定義「多個」本機來源目錄
const LOCAL_DIRS = [
	// 來源 1: Client 端的 JS/CSS (包含 Shadcn 等前端元件)
	path.resolve(process.cwd(), ".output/public/assets"),
	// 來源 2: SSR 端的 JS/CSS (伺服器渲染需要的 CSS 等)
	path.resolve(process.cwd(), "node_modules/.nitro/vite/services/ssr/assets"),
];

const REMOTE_PREFIX = "assets/";

// 遞迴獲取資料夾內所有檔案的函式
function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
	if (!fs.existsSync(dirPath)) return arrayOfFiles; // 如果目錄不存在就跳過

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

// 整理出所有需要上傳的檔案清單
const allFilesToUpload: { localPath: string; r2Key: string }[] = [];

for (const dir of LOCAL_DIRS) {
	if (fs.existsSync(dir)) {
		const files = getAllFiles(dir);
		for (const filePath of files) {
			const relativePath = path.relative(dir, filePath).replace(/\\/g, "/");
			allFilesToUpload.push({
				localPath: filePath,
				r2Key: `${REMOTE_PREFIX}${relativePath}`,
			});
		}
	} else {
		console.warn(`⚠️ 警告：找不到目錄 ${dir}，將跳過。`);
	}
}

async function cleanUpStaleFiles() {
	console.log("🧹 開始檢查並清理過期的舊版本檔案...");

	// 使用所有準備上傳的 R2 Key 建立現役檔案清單
	const localKeys = new Set(allFilesToUpload.map((f) => f.r2Key));
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

// 3. 執行上傳流程
async function uploadSync() {
	console.log("🚀 開始同步 SSR 與 Client Assets 到 Cloudflare R2...");

	if (allFilesToUpload.length === 0) {
		console.error(
			"❌ 錯誤：在所有指定的目錄中都沒有找到檔案，請確認是否有成功執行 build！",
		);
		process.exit(1);
	}

	// 利用 Set 去除重複檔案（如果 Client 和 SSR 產出了相同的檔案 Hash，只上傳一次）
	const uploadedKeys = new Set<string>();

	for (const fileObj of allFilesToUpload) {
		if (uploadedKeys.has(fileObj.r2Key)) continue;

		const contentType =
			mime.lookup(fileObj.localPath) || "application/octet-stream";
		const fileStream = fs.createReadStream(fileObj.localPath);

		try {
			const parallelUploads3 = new Upload({
				client: s3Client,
				params: {
					Bucket: bucketName,
					Key: fileObj.r2Key,
					Body: fileStream,
					ContentType: contentType,
					CacheControl: "public, max-age=31536000, immutable",
				},
			});

			await parallelUploads3.done();
			console.log(`✅ Uploaded: ${fileObj.r2Key} (${contentType})`);
			uploadedKeys.add(fileObj.r2Key);
		} catch (err) {
			console.error(`❌ Failed to upload ${fileObj.r2Key}:`, err);
		}
	}

	console.log("🎉 所有 Assets 同步完成！");
	await cleanUpStaleFiles();
}

// 執行
uploadSync();
