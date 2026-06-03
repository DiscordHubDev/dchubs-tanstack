
import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const source = new Pool({ 
  connectionString: 'postgresql://postgres.dchubs:dawngs_181_supabase@100.99.177.51:6543/postgres' 
});
const target = new Pool({ 
  connectionString: process.env.DRIZZLE_DATABASE_URL ?? process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL 
});

async function migrateTable(tableName: string, batchSize = 500) {
  const countRes = await source.query(`SELECT COUNT(*) FROM "${tableName}"`);
  const total = parseInt(countRes.rows[0].count);
  
  if (total === 0) {
    console.log(`⏭️  ${tableName}: 0 筆，跳過`);
    return;
  }

  console.log(`\n📦 搬移 ${tableName} (${total} 筆)...`);
  
  // 取欄位名稱
  const colRes = await source.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `, [tableName]);
  const cols = colRes.rows.map((r: any) => r.column_name);
  const colsSql = cols.map((c: string) => `"${c}"`).join(', ');
  const placeholders = cols.map((_: any, i: number) => `$${i + 1}`).join(', ');

  let offset = 0;
  let migrated = 0;

  while (offset < total) {
    const rows = await source.query(
      `SELECT ${colsSql} FROM "${tableName}" LIMIT $1 OFFSET $2`,
      [batchSize, offset]
    );

    if (rows.rows.length === 0) break;

    // 批次 insert
    for (const row of rows.rows) {
      const values = cols.map((c: string) => (row as any)[c]);
      try {
        await target.query(
          `INSERT INTO "${tableName}" (${colsSql}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
          values
        );
        migrated++;
      } catch (e: any) {
        console.error(`  ⚠️  跳過一筆 (${e.message.substring(0, 80)})`);
      }
    }

    offset += batchSize;
    console.log(`  ✅ ${Math.min(offset, total)} / ${total}`);
  }

  console.log(`  🎉 ${tableName}: ${migrated} 筆完成`);
}

async function main() {
  console.log('🚀 開始從 Supabase 搬移資料到 Directus DB\n');
  
  // ⚠️ 依照 FK 依賴順序排列
  const order = [
    'User',               // 無依賴，最先
    'Bot',                // handledById → User
    'Server',             // ownerId → User
    'BotCommand',         // botId → Bot
    'Review',             // userId → User, botId → Bot, serverId → Server
    'Vote',               // userId → User
    'Notification',       // userId (無 FK constraint)
    'Report',             // reportedById/handledById → User
    'ApiKey',             // userId → User
    '_BotDevelopers',     // A → Bot, B → User
    '_ServerAdmins',      // A → Server, B → User
    '_UserFavoriteBots',  // A → Bot, B → User
    '_UserFavoriteServers', // A → Server, B → User
  ];

  // 先暫時關閉 FK 檢查
  await target.query('SET session_replication_role = replica');
  console.log('🔓 已暫時停用 FK 檢查\n');

  try {
    for (const table of order) {
      await migrateTable(table);
    }
    console.log('\n✅ 全部搬移完成！');
  } catch (e) {
    console.error('\n❌ 搬移失敗：', e);
  } finally {
    await target.query('SET session_replication_role = DEFAULT');
    console.log('🔒 FK 檢查已恢復');
    await source.end();
    await target.end();
  }
}

main()