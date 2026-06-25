// drizzle.config.supabase.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  out: "./migrations/supabase",
  schema: "./src/schema.ts",
  dbCredentials: {
    url: "postgresql://postgres.dchubs:dawngs_181_supabase@100.99.177.51:6543/postgres",
  },
  schemaFilter: ["public"], // ⚠️ 只抓 public schema，排除 auth/storage
  verbose: true,
});
