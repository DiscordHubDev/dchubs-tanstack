- In this repo, `db.query.user.findFirst({ with: ... })` can infer relation fields as `never` depending on schema wiring; prefer explicit `select + join` queries for stable typing in feature modules.
- Better Auth `drizzleAdapter` provider is a dialect enum (`"pg" | "mysql" | "sqlite"`), not the runtime client package; keep `provider: "pg"` even when DB driver is `@neondatabase/serverless`.

- For Postgres migrations to a Directus-initialized target, `drizzle-kit push` can enter interactive rename prompts against `directus_*` tables; use SQL flow `drizzle-kit export --sql` + apply SQL to target + data copy script instead.
