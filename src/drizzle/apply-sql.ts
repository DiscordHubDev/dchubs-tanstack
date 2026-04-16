import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";

function getManagedTableNames(sql: string): string[] {
	const tables = new Set<string>();
	const tableRegex = /CREATE TABLE\s+"([^"]+)"/g;
	for (const match of sql.matchAll(tableRegex)) {
		const tableName = match[1];
		if (tableName) {
			tables.add(tableName);
		}
	}

	return [...tables];
}

async function main() {
	const sqlFilePath = process.argv[2] ?? "src/drizzle/schema.export.sql";
	const targetUrl = process.env.NEW_DATABASE_URL;

	if (!targetUrl) {
		throw new Error("Missing NEW_DATABASE_URL.");
	}

	const sql = await readFile(resolve(sqlFilePath), "utf8");
	if (!sql.trim()) {
		throw new Error(`SQL file is empty: ${sqlFilePath}`);
	}

	const client = new Client({
		connectionString: targetUrl,
		connectionTimeoutMillis: 10000,
	});

	await client.connect();

	try {
		const managedTables = getManagedTableNames(sql);
		if (managedTables.length > 0) {
			const existing = await client.query<{ table_name: string }>(
				`select table_name
				 from information_schema.tables
				 where table_schema = 'public'
				   and table_name = any($1::text[])`,
				[managedTables],
			);

			if (existing.rowCount && existing.rowCount > 0) {
				console.log(
					`SCHEMA_SKIP: ${existing.rowCount} managed tables already exist`,
				);
				return;
			}
		}

		await client.query("begin");
		await client.query(sql);
		await client.query("commit");
		console.log(`SCHEMA_APPLIED: ${sqlFilePath}`);
	} catch (error) {
		await client.query("rollback");
		throw error;
	} finally {
		await client.end();
	}
}

main().catch((error) => {
	console.error("APPLY_SQL_ERROR", error);
	process.exit(1);
});
