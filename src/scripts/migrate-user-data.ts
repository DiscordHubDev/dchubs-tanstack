import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import "dotenv/config";

import * as schemaRelations from "#/drizzle/relations";
import * as schemaTables from "#/drizzle/schema";

// 1. 初始化資料庫連線 (請替換成你的連線字串)
const pool = new pg.Pool({
	connectionString: process.env.DATABASE_URL,
	max: 1,
});
export const db = drizzle(pool, {
	schema: {
		...schemaTables,
		...schemaRelations,
	},
	logger: true,
});

async function main() {
	console.log("🚀 開始執行資料搬移遷移...");

	try {
		// 使用 db.transaction 確保原子性：萬一中途失敗，會自動 Rollback，不會污染資料
		await db.transaction(async (tx) => {
			console.log("⏳ 正在將 User 表的資料合併至 auth_user...");

			// 狀況 A：處理兩邊 id 相同的用戶，更新 bio、social 等欄位
			// 順便用 COALESCE 補齊 auth_user 缺漏的 username/avatar
			await tx.execute(sql`
        UPDATE auth_user
        SET 
          bio = "User".bio,
          social = "User".social,
          username = COALESCE(auth_user.username, "User".username),
          avatar = COALESCE(auth_user.avatar, "User".avatar),
          banner = COALESCE(auth_user.banner, "User".banner),
          banner_color = COALESCE(auth_user.banner_color, "User".banner_color)
        FROM "User"
        WHERE auth_user.id = "User".id;
      `);
			console.log("✅ 狀況 A：一對一對齊的用戶資料更新完成。");

			// 狀況 B：處理「只存在於 User 表，但 auth_user 沒有」的遺漏用戶
			// 如果沒有這類用戶，此 SQL 影響行數會是 0，非常安全
			await tx.execute(sql`
        INSERT INTO auth_user (
          id, name, email, created_at, updated_at, 
          username, avatar, banner, banner_color, bio, social,
          discord_id -- 👈 1. 這裡新增目標欄位
        )
        SELECT 
          id, 
          username as name,
          id || '@temporary.com' as email,
          "joinedAt" as created_at,
          NOW() as updated_at,
          username, avatar, banner, banner_color, bio, social,
          id as discord_id -- 👈 2. 這裡將舊表的 id 直接當作 discord_id 填入
        FROM "User"
        ON CONFLICT (id) DO NOTHING; 
      `);
			console.log("✅ 狀況 B：補齊不存於 auth_user 的獨立用戶完成。");
		});

		console.log("🎉 所有資料安全遷移完成！");
	} catch (error) {
		console.error("❌ 遷移過程中發生錯誤，資料已自動回滾：", error);
		process.exit(1);
	} finally {
		await pool.end();
	}
}

main();
