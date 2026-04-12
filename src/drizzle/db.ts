import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

const env = process.env;
const globalForDb = globalThis as typeof globalThis & {
	__dchubsNeonPool?: NeonPool;
};

function getDatabaseUrl(): string {
	const connectionString = env.NEON_DATABASE_URL ?? env.DATABASE_URL;
	if (!connectionString) {
		throw new Error(
			"Missing database URL. Set NEON_DATABASE_URL (or DATABASE_URL for backward compatibility).",
		);
	}

	return connectionString;
}

function getNeonPoolMax(): number {
	const parsed = Number.parseInt(env.NEON_POOL_MAX ?? "5", 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return 5;
	}

	return Math.min(parsed, 20);
}

function configureNeonRuntime() {
	// Keep fetch mode enabled for shorter-lived serverless execution contexts.
	neonConfig.poolQueryViaFetch = true;
	if (typeof globalThis.WebSocket !== "undefined") {
		neonConfig.webSocketConstructor = globalThis.WebSocket;
	}
}

configureNeonRuntime();

const pool =
	globalForDb.__dchubsNeonPool ??
	new NeonPool({
		connectionString: getDatabaseUrl(),
		max: getNeonPoolMax(),
		connectionTimeoutMillis: 10_000,
		idleTimeoutMillis: 30_000,
	});

globalForDb.__dchubsNeonPool = pool;

// { schema } is used for relational queries
export const db = drizzle({ client: pool, schema });
