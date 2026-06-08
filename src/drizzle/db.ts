import "dotenv/config";
import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import * as schemaRelations from "./relations";
import * as schemaTables from "./schema";

// 1. 動態連線池設定（從環境變數讀取，保留預設值）
const maxConnections = process.env.DB_MAX_CONNECTIONS
	? parseInt(process.env.DB_MAX_CONNECTIONS, 10)
	: 10;

// 2. 開發環境單例模式 (Singleton)，避免熱重載導致連線數耗盡
const globalForDb = globalThis as unknown as {
	bunSqlClient: SQL | undefined;
};

export const client =
	globalForDb.bunSqlClient ??
	new SQL({
		url: process.env.DATABASE_URL || "",
		max: maxConnections,
		idleTimeout: 30,
		// 建議加上 connectionTimeout 避免網路問題導致請求無窮等待
		connectionTimeout: 10,
	});

if (process.env.NODE_ENV !== "production") {
	globalForDb.bunSqlClient = client;
}

// 3. 初始化 Drizzle
export const db = drizzle({
	client,
	schema: {
		...schemaTables,
		...schemaRelations,
	},
	// 只有在非正式環境才開啟 SQL Logger
	logger: process.env.NODE_ENV !== "production",
});
