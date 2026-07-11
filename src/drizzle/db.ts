// #/drizzle/db.ts
import { drizzle, type PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schemaRelations from "./relations";
import * as schemaTables from "./schema";
import { env } from "cloudflare:workers";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";

const schema = { ...schemaTables, ...schemaRelations };

export function getDb() {
  const hyperdrive = env["dchubs-db"] as any;
  const connectionString = hyperdrive?.connectionString || process.env.DATABASE_URL;

  if (!connectionString) throw new Error("No DB connection string");

  const client = postgres(connectionString, {
    max: 1,
    idle_timeout: 0,
    connect_timeout: 10,
  });

  return drizzle(client, {
    schema,
    logger: false,
  });
}

export type DbTransaction = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
