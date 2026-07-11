// #/drizzle/db.ts
import { drizzle, type PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schemaRelations from "./relations";
import * as schemaTables from "./schema";
import { env } from "cloudflare:workers";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";

const schema = { ...schemaTables, ...schemaRelations };

let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (dbInstance) return dbInstance;

  const hyperdrive = env["dchubs-db"] as any;
  const connectionString = hyperdrive?.connectionString || process.env.DATABASE_URL;

  if (!connectionString) throw new Error("No DB connection string");

  const client = postgres(connectionString, {
    max: 1,
    idle_timeout: 0,
    connect_timeout: 10,
  });

  dbInstance = drizzle(client, {
    schema,
    logger: false,
  });

  return dbInstance;
}

export type DbTransaction = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
