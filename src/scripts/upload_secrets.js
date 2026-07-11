const { execSync } = require("child_process");
const fs = require("fs");

// 讀取 .env 檔案
const envFile = fs.readFileSync(".env", "utf8");

// 解析 .env 內容
envFile.split("\n").forEach((line) => {
  // 過濾掉註解或空行
  const trimmedLine = line.trim();
  if (!trimmedLine || trimmedLine.startsWith("#")) return;

  const [key, ...valueParts] = trimmedLine.split("=");
  const value = valueParts.join("="); // 處理值裡面可能有等號的情況

  if (key && value) {
    console.log(`正在上傳密鑰: ${key}`);
    // 執行 wrangler secret put，透過 stdin 傳入值
    try {
      execSync(`echo "${value}" | npx wrangler secret put ${key} --name dchubs-tanstack`, {
        stdio: "inherit",
      });
    } catch (e) {
      console.error(`上傳 ${key} 失敗：`, e);
    }
  }
});
