# DiscordHubs (TanStack Start) 🚀

## 🧭 Description

DiscordHubs is a full-stack TanStack Start app for listing and discovering Discord servers and bots. Routing, SSR, and data fetching are coordinated through TanStack Router and Query, with global styling and theme tokens defined in [src/styles.css](src/styles.css) and the app shell set in [src/routes/\_\_root.tsx](src/routes/__root.tsx).

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

## ✨ Interesting Techniques

- 🧩 File-based routing with TanStack Router and route-level head configuration in [src/routes/\_\_root.tsx](src/routes/__root.tsx), aligned with the [HTML `<meta>` element](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta) on MDN.
- ⚡ Dynamic devtools loading using `import()` in [src/routes/\_\_root.tsx](src/routes/__root.tsx) to avoid shipping dev-only code (MDN: [`import()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import)).
- 🎛️ Design tokens and theme mapping with CSS custom properties in [src/styles.css](src/styles.css) (MDN: [CSS Custom Properties](https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties)).
- 🎨 OKLCH color tokens in [src/styles.css](src/styles.css) (MDN: [`oklch()`](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/oklch)).
- 🧱 Tailwind `@layer` composition for base and component styling in [src/styles.css](src/styles.css) (MDN: [@layer](https://developer.mozilla.org/en-US/docs/Web/CSS/@layer)).
- 🌀 Motion primitives with CSS keyframes in [src/styles.css](src/styles.css) (MDN: [`@keyframes`](https://developer.mozilla.org/en-US/docs/Web/CSS/@keyframes)).

## 🧰 Notable Technologies

- 🌐 [TanStack Start](https://tanstack.com/start) for full-stack app scaffolding with SSR support.
- 🧭 [TanStack Router](https://tanstack.com/router) and 🔎 [TanStack Query](https://tanstack.com/query) for navigation and data orchestration.
- 🧪 [Effect](https://effect.website/) for typed async workflows.
- 🗃️ [Drizzle ORM](https://orm.drizzle.team/) with PostgreSQL support.
- 🔐 [Better Auth](https://www.better-auth.com/) with the [Drizzle adapter](https://www.better-auth.com/docs/adapters/drizzle).
- ☁️ [Cloudflare Pages](https://pages.cloudflare.com/) via [Wrangler](https://developers.cloudflare.com/workers/wrangler/).
- 🎨 [Tailwind CSS v4](https://tailwindcss.com/) with [tw-animate-css](https://github.com/tailwindcss/tailwindcss-animate).
- 🧩 [Radix UI](https://www.radix-ui.com/) primitives and 🖼️ [Lucide](https://lucide.dev/) icons.
- 🔔 [React Toastify](https://fkhadra.github.io/react-toastify/) for toasts.

## 🔤 Fonts

- ✍️ [Noto Sans TC](https://fonts.google.com/specimen/Noto+Sans+TC) is configured as the main font in [src/styles.css](src/styles.css).

## 🗂️ Project Structure

```text
.
├── AGENTS.md
├── biome.json
├── components.json
├── Dockerfile
├── drizzle.config.ts
├── entrypoint.sh
├── package.json
├── tailwind.config.ts
├── tsconfig.json
├── vite.config.ts
├── wrangler.toml
├── .github/
│   └── prompts/
├── public/
├── src/
│   ├── components/
│   ├── drizzle/
│   ├── features/
│   ├── hooks/
│   ├── integrations/
│   ├── lib/
│   ├── mail/
│   ├── routes/
│   ├── scripts/
│   └── types/
```

- [src/routes/](src/routes/) holds file-based routes for TanStack Router.
- [src/features/](src/features/) groups feature modules with server functions, schemas, and queries.
- [src/drizzle/](src/drizzle/) contains the database schema, migrations, and utilities.
- [src/components/](src/components/) stores shared UI components and layout primitives.
- [public/](public/) contains static assets served directly by the platform.
