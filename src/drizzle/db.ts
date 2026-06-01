import "dotenv/config";
import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import * as schemaRelations from "./relations";
import * as schemaTables from "./schema";

const client = new SQL(process.env.DATABASE_URL || "");

export const db = drizzle({
	client,
	schema: {
		...schemaTables,
		...schemaRelations,
	},
	logger: true,
});
