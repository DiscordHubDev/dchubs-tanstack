// #/drizzle/db.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schemaRelations from "./relations";
import * as schemaTables from "./schema";
import { env } from "cloudflare:workers";

const schema = { ...schemaTables, ...schemaRelations };

// ✅ 原本的用法完全不動，維持只回傳 db
export function getDb() {
  const connectionString = env["dchubs-db"]?.connectionString ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error("No DB connection string");

  const client = postgres(connectionString, {
    max: 5,
    fetch_types: false,
    prepare: true,
  });

  return drizzle(client, { schema, logger: false });
}

// ✅ 新增：專門給 cron / scheduled 這種需要手動控制連線生命週期的場景使用
export function getDbWithClient() {
  const connectionString = env["dchubs-db"]?.connectionString ?? process.env.DATABASE_URL;
  console.log("🔧 connectionString:", connectionString); // 暫時加這行

  if (!connectionString) throw new Error("No DB connection string");

  const client = postgres(connectionString, {
    max: 5,
    fetch_types: false,
    prepare: true,
    connect_timeout: 10, // 秒，10 秒連不上就報錯
    idle_timeout: 20,
  });

  const db = drizzle(client, { schema, logger: false });
  return { db, client };
}

export type Database = ReturnType<typeof getDb>;
export type DbTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
