import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export const db = drizzle({
	schema, // 關鍵：將 schema 物件傳入
	logger: true,
	connection: {
		connectionString: process.env.NEW_DATABASE_URL,
	},
});
