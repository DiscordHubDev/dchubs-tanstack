import "dotenv/config";
import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import * as schemaRelations from "./relations";
import * as schemaTables from "./schema";

// 加上連線池設定
export const client = new SQL({
	url: process.env.DATABASE_URL || "",
	max: 10, // 最大連線數
	idleTimeout: 30, // 閒置超過 30 秒就釋放連線，避免佔用死連線（單位依 Bun 版本可能為秒）
});

export const db = drizzle({
	client,
	schema: {
		...schemaTables,
		...schemaRelations,
	},
	logger: true,
});
