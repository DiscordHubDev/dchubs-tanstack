# AGENTS.md

## Commands

```bash
bun install
bun --bun run dev        # dev server
bun --bun run build      # production build
bun --bun run deploy    # build + wrangler deploy to Cloudflare
bun --bun run test      # vitest run
bun --bun run lint     # biome lint
bun --bun run check    # biome check (lint + imports)
bun --bun run format   # biome format
```

Database (Drizzle):
```bash
bun --bun run db:generate   # generate migrations
bun --bun run db:push     # push schema to DB
bun --bun run db:migrate   # run pending migrations
bun --bun run db:studio   # open Drizzle Studio
```

## Key Quirks

- **Always use `--bun` flag** with runtime commands to ensure Bun runtime (not Node fallback)
- **Path aliases**: `#/*` and `@/*` map to `./src/*`
- **Database URL order**: `DRIZZLE_DATABASE_URL` → `NEON_DATABASE_URL` → `DATABASE_URL`
- **Client env prefix**: Variables must start with `VITE_` to be exposed to client
- **Deployment**: Cloudflare Pages via Wrangler; set production secrets with `wrangler secret put <VAR>`

## Tech Stack

- TanStack Start/Router/Query (latest)
- Bun runtime + Nitro (bun preset)
- Drizzle ORM + PostgreSQL (Neon/Supabase)
- Better Auth
- Tailwind CSS v4
- Biome (tab indent, double quotes)
- Vitest
- Cloudflare Pages

## Architecture

- File-based routing: `src/routes/**/*.tsx`
- Server functions: `*.server.ts` files in `src/features/*`
- Route loaders: defined in route files via `loader:` option
- Schema: `src/drizzle/schema.ts`
- Env validation: `src/env.ts` using T3Env + effect Schema

## Database Tables Filter

Drizzle config filters to tables: `Bot`, `Server`, `Review`, `Vote`, `ApiKey`, `BotCommand`, `Notification`, `Report`, `User`