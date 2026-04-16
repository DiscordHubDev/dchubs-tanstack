import 'dotenv/config'; // make sure to install dotenv package
import { defineConfig } from 'drizzle-kit';

const databaseUrl =
  process.env.DRIZZLE_DATABASE_URL ??
  process.env.NEON_DATABASE_URL ??
  process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'Missing database URL. Set DRIZZLE_DATABASE_URL or NEON_DATABASE_URL (DATABASE_URL is a compatibility fallback).',
  );
}

export default defineConfig({
  dialect: 'postgresql',
  out: './src/drizzle',
  schema: './src/drizzle/schema.ts',

  dbCredentials: {
    url: databaseUrl,
  },
  verbose: true,
  strict: true,
  schemaFilter: ["public"],
  tablesFilter: ["Bot", "Server", "Review", "Vote", "ApiKey", "BotCommand", "Notification", "Report", "User", "!directus_*"],
});
