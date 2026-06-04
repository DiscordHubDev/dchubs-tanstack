import 'dotenv/config'; // 確保讀取 .env 檔案
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

// 1. 檢查環境變數
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("❌ 錯誤：找不到 DATABASE_URL 環境變數，請檢查 .env 檔案！");
  process.exit(1);
}

console.log("📡 正在嘗試連線至資料庫...");
console.log(`🔗 連線字串開頭: ${connectionString.substring(0, 20)}...`);

// 2. 建立資料庫連線
const pool = new pg.Pool({
  connectionString: connectionString,
  max: 1,
});

const db = drizzle(pool);

// 3. 執行遷移
async function runMigration() {
  console.log("⏳ 開始執行 Drizzle 遷移 (正在讀取 ./drizzle 檔案夾)...");
  
  // 請確保這裡的 migrationsFolder 路徑對應你專案中放 SQL 遷移檔的資料夾
  await migrate(db, { migrationsFolder: 'src/drizzle' });
  
  console.log("✅ 遷移成功完成！");
  await pool.end();
}

runMigration().catch((error) => {
  console.error("\n💥 抓到真正的錯誤訊息了：\n");
  console.error(error); // 這裡會印出完整的錯誤堆疊 (Stack Trace)
  pool.end().then(() => process.exit(1));
});