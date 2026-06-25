import "dotenv/config";
import { Pool } from "pg";

type Edge = { child: string; parent: string };

function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

function getTopologicalOrder(tables: string[], edges: Edge[]): string[] {
  const tableSet = new Set(tables);
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const table of tables) {
    indegree.set(table, 0);
    adjacency.set(table, []);
  }

  for (const { child, parent } of edges) {
    if (!tableSet.has(child) || !tableSet.has(parent) || child === parent) {
      continue;
    }

    adjacency.get(parent)?.push(child);
    indegree.set(child, (indegree.get(child) ?? 0) + 1);
  }

  const queue = [...tables]
    .filter((table) => (indegree.get(table) ?? 0) === 0)
    .sort((a, b) => a.localeCompare(b));
  const ordered: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;

    ordered.push(current);

    for (const next of adjacency.get(current) ?? []) {
      const nextIndegree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, nextIndegree);
      if (nextIndegree === 0) {
        queue.push(next);
      }
    }

    queue.sort((a, b) => a.localeCompare(b));
  }

  if (ordered.length === tables.length) {
    return ordered;
  }

  const unresolved = tables
    .filter((table) => !ordered.includes(table))
    .sort((a, b) => a.localeCompare(b));

  return [...ordered, ...unresolved];
}

async function main() {
  const sourceUrl = process.env.DATABASE_URL;
  const targetUrl = process.env.NEW_DATABASE_URL;
  const shouldTruncateTarget = process.env.TRUNCATE_TARGET_FIRST !== "false";

  if (!sourceUrl || !targetUrl) {
    throw new Error("Both DATABASE_URL and NEW_DATABASE_URL are required.");
  }

  const sourceDb = new Pool({
    connectionString: sourceUrl,
    max: 1,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 5000,
  });
  const targetDb = new Pool({
    connectionString: targetUrl,
    max: 1,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 5000,
  });

  const excludedTables = new Set(["_prisma_migrations", "__drizzle_migrations"]);
  const batchSize = 200;

  try {
    const tablesResult = await sourceDb.query<{ table_name: string }>(
      `select table_name
			 from information_schema.tables
			 where table_schema = 'public'
			   and table_type = 'BASE TABLE'
			 order by table_name`,
    );

    const targetTablesResult = await targetDb.query<{ table_name: string }>(
      `select table_name
			 from information_schema.tables
			 where table_schema = 'public'
			   and table_type = 'BASE TABLE'`,
    );

    const targetTables = new Set(targetTablesResult.rows.map((r) => r.table_name));

    const tables = tablesResult.rows
      .map((row) => row.table_name)
      .filter((table) => !excludedTables.has(table) && targetTables.has(table));

    const edgesResult = await sourceDb.query<Edge>(
      `select tc.table_name as child,
			        ccu.table_name as parent
			 from information_schema.table_constraints tc
			 join information_schema.constraint_column_usage ccu
			   on tc.constraint_name = ccu.constraint_name
			  and tc.constraint_schema = ccu.constraint_schema
			where tc.constraint_type = 'FOREIGN KEY'
			  and tc.table_schema = 'public'`,
    );

    const orderedTables = getTopologicalOrder(tables, edgesResult.rows);
    let totalInserted = 0;

    await targetDb.query("begin");

    if (shouldTruncateTarget && orderedTables.length > 0) {
      const truncateTables = orderedTables.map(quoteIdent).join(", ");
      await targetDb.query(`truncate table ${truncateTables} restart identity cascade`);
      console.log(`target tables truncated: ${orderedTables.length}`);
    }

    for (const table of orderedTables) {
      const columnsResult = await sourceDb.query<{
        column_name: string;
        data_type: string;
      }>(
        `select column_name
				      , data_type
				 from information_schema.columns
				 where table_schema = 'public'
				   and table_name = $1
				 order by ordinal_position`,
        [table],
      );

      const columns = columnsResult.rows.map((row) => row.column_name);
      const jsonColumns = new Set(
        columnsResult.rows
          .filter((row) => row.data_type === "json" || row.data_type === "jsonb")
          .map((row) => row.column_name),
      );
      if (columns.length === 0) {
        continue;
      }

      const sourceRows = await sourceDb.query<Record<string, unknown>>(
        `select * from ${quoteIdent(table)}`,
      );

      if (sourceRows.rows.length === 0) {
        console.log(`${table}: source=0, inserted=0`);
        continue;
      }

      let insertedForTable = 0;
      const chunks = chunkArray(sourceRows.rows, batchSize);
      const columnList = columns.map(quoteIdent).join(", ");

      for (const rowsChunk of chunks) {
        const params: unknown[] = [];
        const valuesSql = rowsChunk
          .map((row, rowIndex) => {
            const placeholders = columns
              .map((column, columnIndex) => {
                const value = row[column];
                if (jsonColumns.has(column) && value !== null && value !== undefined) {
                  params.push(JSON.stringify(value));
                } else {
                  params.push(value);
                }
                return `$${rowIndex * columns.length + columnIndex + 1}`;
              })
              .join(", ");
            return `(${placeholders})`;
          })
          .join(", ");

        const insertSql = `insert into ${quoteIdent(table)} (${columnList}) values ${valuesSql}`;
        const inserted = await targetDb.query(insertSql, params);
        insertedForTable += inserted.rowCount ?? 0;
      }

      totalInserted += insertedForTable;
      console.log(`${table}: source=${sourceRows.rows.length}, inserted=${insertedForTable}`);
    }

    await targetDb.query("commit");
    console.log(`DONE: total inserted rows = ${totalInserted}`);
  } catch (error) {
    await targetDb.query("rollback");
    throw error;
  } finally {
    await Promise.allSettled([sourceDb.end(), targetDb.end()]);
  }
}

main().catch((error) => {
  console.error("SYNC_ERROR", error);
  process.exit(1);
});
