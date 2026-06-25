# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

# Package Manager Preferences

- STRICT RULE: NEVER use `npm`, `npx`, `yarn`, or `pnpm`.
- Always use `bun` as the exclusive package manager.
- Instead of `npm install <package>`, use `bun add <package>`.
- Instead of `npx <command>`, use `bunx <command>`.
- Instead of `npm run <script>`, use `bun run <script>`.

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Quick Commands

All commands use Bun as runtime. Always prefix with `bun --bun`.

| Task                 | Command                       |
| -------------------- | ----------------------------- |
| Dev server           | `bun --bun run dev`           |
| Build                | `bun --bun run build`         |
| Preview build        | `bun --bun run serve`         |
| Deploy to Cloudflare | `bun --bun run deploy`        |
| Lint                 | `bun --bun run lint`          |
| Format               | `bun --bun run format`        |
| Fix lint             | `bun --bun run lint:fix`      |
| Test                 | `bun --bun run test` (Vitest) |
| Generate migration   | `bun --bun run db:generate`   |
| Push schema to DB    | `bun --bun run db:push`       |
| Open DB studio       | `bun --bun run db:studio`     |
| Export SQL schema    | `bun --bun run db:export:sql` |
| Type-check           | `npx tsc --noEmit`            |

# Full-Stack Architecture Guidelines (TanStack + Effect + Drizzle)

When migrating code or developing new features in this repository, strictly adhere to the following architectural and tech stack guidelines to ensure high performance, maintainability, and absolute type safety.

## 1. Core Foundation

- **Tech Stack**: Use **TanStack Router** + **TanStack Query** as the core for frontend routing and data fetching. Use **Effect-TS** for modeling business logic, error handling, and dependency injection. Use **Drizzle ORM** for database access. Use **Effect Schema** for all data validation.
- **Single Source of Truth**: URL Search Params are the single source of truth for frontend state. Effect Schema is the single source of truth for all types and validation (**strictly avoid introducing or using Zod**).
- **Error & Boundary Handling**: Do not use `try/catch` or `throw` for implicit errors. All asynchronous operations and potential failures must be modeled using `Effect` and return explicit Typed Errors.

## 2. Routing Standards (TanStack Router Best Practices)

Each route must include strict search parameter validation, URL state synchronization, and Suspense-supported data prefetching.

- **Search Params Validation (`validateSearch`)**:
  - Must use `Effect Schema` to define the structure of Search Params.
  - _Implementation_: Use `Schema.decodeUnknownSync` or `Schema.decodeUnknownOption` to parse URL parameters. Provide safe fallback values upon failure to prevent UI crashes.
- **Loaders & Data Prefetching (`loader`)**:
  - Do not make direct `fetch` calls inside loaders. You must use TanStack Query's `queryClient.ensureQueryData` for prefetching and caching.
  - Pass the `queryClient` via the router `context` to ensure server/client rendering states remain perfectly synchronized.
- **URL State Synchronization**:
  - Use `useNavigate` with the `search` parameter to update the URL state. Let the URL changes automatically trigger `Suspense Query` to refetch data.

## 3. Data Fetching & Caching (TanStack Query Best Practices)

- **Shared Query Configuration (`queryOptions`)**:
  - **Mandatory**: Encapsulate the Query Key and Query Function within a `queryOptions` factory function. This ensures that the `loader` (prefetch) and `useSuspenseQuery` (render) share the exact same configuration.
- **Suspense-First (`useSuspenseQuery`)**:
  - Using `isLoading` or `isFetching` for manual conditional rendering at the component level is prohibited.
  - Always use `useSuspenseQuery`. Delegate loading states to the Router or a parent `<Suspense>` boundary, and delegate error states to an `<ErrorBoundary>`.
- **State Mutations (`useMutation`)**:
  - After successful updates, immediately invalidate relevant caches using `queryClient.invalidateQueries` to keep the UI perfectly synced.

## 4. Validation & Schema Standards (Effect Schema Best Practices)

- **Zero Zod Policy**: Whether for API request payloads, Database DTOs, or form validations, **only** use `@effect/schema/Schema`.
- **Type Inference**: Use `Schema.Type<typeof MySchema>` instead of manually defining TypeScript `interface`s. This guarantees that validation logic and type definitions are always in sync.

## 5. Data Layer & Business Logic (Drizzle ORM + Effect-TS)

This is the bedrock of all asynchronous and data access operations. It must be implemented for maximum performance and maintainability.

- **High-Maintainability Effect-TS**:
  - **Use `Effect.gen`**: For complex asynchronous flows, always use the generator syntax (`Effect.gen(function* () { ... })`) to keep code flat and readable, avoiding `.flatMap` hell.
  - **Dependency Injection (Context)**: Database instances or external API clients should be declared as Effect services (`Context.Tag`) and yielded (`yield* MyDatabaseService`). This makes unit testing and mocking frictionless.
  - **Error Modeling (`Effect.tryPromise`)**: All Drizzle database operations must be wrapped in `Effect.tryPromise`, transforming native Promise rejections into concrete domain error instances (e.g., `DatabaseError` or `NotFoundError`).
- **High-Performance Drizzle ORM**:
  - **Prepared Statements**: For highly-frequent queries, utilize Drizzle's prepared statements (`db.query.users.findMany(...).prepare()`) to optimize database execution time.
  - **Relational Queries Best Practices**:
    - Use Drizzle's Relational Query API (`db.query.[table].findMany({ with: { ... } })`) for deeply nested or GraphQL-style quick queries.
    - Fall back to standard SQL query builders (`select().from().leftJoin()`) when you need extreme performance or complex aggregations.
  - **Avoid N+1 Problems**: Fully utilize Drizzle's relational loading capabilities. Strictly prohibit triggering additional individual queries inside loops (e.g., inside `Effect.forEach`).

---

## 💡 Reference Implementation

### 1. Routing & Data Flow (TanStack Router + Query)

```typescript
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Schema } from '@effect/schema';

// 1. Define Single Source of Truth Schema (Effect Schema)
const UserSearchSchema = Schema.Struct({
  page: Schema.Number.pipe(Schema.greaterThan(0)),
  filter: Schema.optional(Schema.String),
});

// 2. Encapsulate Query Options
export const usersQueryOptions = (search: Schema.Type<typeof UserSearchSchema>) =>
  queryOptions({
    queryKey: ['users', search],
    queryFn: () => fetchUsers(search), // Resolve to Promise if bridging from Effect
  });

// 3. Create Route with Validation & Prefetching
export const Route = createFileRoute('/users')({
  // URL Param validation (returns fallback if invalid)
  validateSearch: (search) => {
    const result = Schema.decodeUnknownOption(UserSearchSchema)(search);
    return result._tag === "Some" ? result.value : { page: 1 };
  },
  // Loader data prefetching
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ context: { queryClient }, deps: { search } }) =>
    queryClient.ensureQueryData(usersQueryOptions(search)),
  component: UsersComponent,
});

// 4. Component strictly uses SuspenseQuery
function UsersComponent() {
  const search = Route.useSearch();
  const { data } = useSuspenseQuery(usersQueryOptions(search));

  return <div>{/* Render Data */}</div>;
}
```

### 2. Business Layer & Database (Effect + Drizzle)

```typescript
import { Effect, Context } from "effect";
import { eq } from "drizzle-orm";
import { db } from "./db"; // Drizzle instance
import { users } from "./schema";

// Define Database Dependency
export class Database extends Context.Tag("Database")<Database, typeof db>() {}

// Define Domain Errors
export class DatabaseError {
  readonly _tag = "DatabaseError";
  constructor(readonly cause: unknown) {}
}
export class UserNotFoundError {
  readonly _tag = "UserNotFoundError";
  constructor(readonly id: string) {}
}

// Core logic built for performance and maintainability
export const getUserById = (id: string) =>
  Effect.gen(function* () {
    // 1. Inject dependency
    const database = yield* Database;

    // 2. Safe async database call wrapped in tryPromise
    const user = yield* Effect.tryPromise({
      try: () =>
        database.query.users.findFirst({
          where: eq(users.id, id),
          with: { profile: true },
        }),
      catch: (error) => new DatabaseError(error),
    });

    // 3. Business logic boundary checks
    if (!user) {
      return yield* new Effect.fail(new UserNotFoundError(id));
    }

    return user;
  });
```
