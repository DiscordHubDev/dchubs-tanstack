Welcome to your new TanStack Start app! 

# DiscordHubs (TanStack Start)

DiscordHubs is a full-stack web app for discovering and promoting Discord servers and bots. It is built with TanStack Start on Bun, uses file-based routing, TanStack Query, Effect for typed workflows, Drizzle ORM with Postgres, and deploys to Cloudflare.

## What the project does

- Provides a searchable, categorized listing of Discord servers and bots
- Lets authenticated users submit servers/bots and manage listings
- Uses TanStack Query + route loaders for fast, cache-friendly data access
- Ships a dark-only UI with Tailwind CSS v4 and Shadcn UI primitives

## Why the project is useful

- A single, type-safe stack (TanStack Start + Effect + Drizzle) from UI to DB
- Clear feature boundaries under [src/features](src/features)
- File-based routing in [src/routes](src/routes) keeps navigation discoverable
- Cloudflare-friendly deployment workflow and static asset publishing

## How to get started

### Prerequisites

- Bun (latest)
- Postgres (Neon or compatible)
- Cloudflare Wrangler (for deploys)

### Install

```bash
bun install
```

### Configure environment

Create `.env.local` for local development:

```bash
NEON_DATABASE_URL=postgres://...
BETTER_AUTH_SECRET=...
VITE_APP_TITLE=DiscordHubs
```

Database URL resolution for Drizzle CLI (highest wins):

1. `DRIZZLE_DATABASE_URL`
2. `NEON_DATABASE_URL`
3. `DATABASE_URL`

### Run the app

```bash
bun --bun run dev
```

The app uses file-based routes under [src/routes](src/routes). The root layout lives in [src/routes/__root.tsx](src/routes/__root.tsx).

### Common scripts

```bash
bun --bun run build
bun --bun run serve
bun --bun run test
bun --bun run lint
bun --bun run format
```

### Database workflows (Drizzle)

```bash
bun --bun run db:generate
bun --bun run db:migrate
bun --bun run db:push
bun --bun run db:studio
```

### Deploy

```bash
bun --bun run deploy
```

## Where to get help

- Project conventions: [AGENTS.md](AGENTS.md)
- TanStack Start: https://tanstack.com/start
- TanStack Router: https://tanstack.com/router
- TanStack Query: https://tanstack.com/query
- Effect: https://effect.website
- Drizzle ORM: https://orm.drizzle.team
- Better Auth: https://www.better-auth.com
- Cloudflare Pages: https://developers.cloudflare.com/pages

## Who maintains and contributes

Maintained by the DiscordHubs team. Contributions are welcome via pull requests. Please follow the code style and architecture notes in [AGENTS.md](AGENTS.md) and run `bun --bun run lint` and `bun --bun run test` before submitting changes.

