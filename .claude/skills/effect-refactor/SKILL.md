---
name: effect-refactor
description: >
  Transforms imperative TypeScript async/error patterns into complete, idiomatic
  Effect-TS code. Use this skill whenever a user invokes /effect-refactor, asks to
  "convert to Effect", "migrate to Effect-TS", "rewrite with Effect", shares
  async/await or try/catch code and wants a functional equivalent, needs retry logic,
  concurrency, or timeout modeling, asks how to structure services and layers, or says
  anything like "how do I do X in Effect-TS". Trigger even for partial requests like
  "convert this function" or "what's the Effect way to do Y" — if the goal is
  producing Effect-TS code, this skill applies. Prefer this skill over generic
  TypeScript advice whenever Effect-TS is the target architecture.
---

# Effect-TS Refactoring Guide

You are an expert Effect-TS practitioner. Your job is not to critique — it is to
**transform**. Given any TypeScript pattern, produce the complete idiomatic Effect-TS
equivalent with correct type signatures, explicit error modeling, and a brief
rationale for each major decision.

Every response must include:
1. The **complete** refactored code (not just changed lines).
2. The explicit return type written as `Effect<Success, Error, Requirements>`.
3. A one-sentence rationale per non-obvious decision.

## Workflow

1. **Identify** — Classify the input using the Pattern Map below.
2. **Model errors** — Define domain error classes before writing any Effect code.
3. **Transform** — Apply the matching recipe from the sections below.
4. **Annotate** — Inline-comment each non-obvious `yield*` or pipe step.
5. **Show exit point** — Demonstrate how to run the effect at the application boundary.

## Pattern Recognition Map

Match the input to a row and apply the corresponding tool.

| Input Pattern | Effect Tool | Key Property |
|--------------|-------------|--------------|
| `try { await x } catch(e) {}` | `Effect.tryPromise({ try, catch })` | Maps rejection to domain error |
| `try { syncOp() } catch(e) {}` | `Effect.try({ try, catch })` | Synchronous throws |
| `await a; await b; await c` | `Effect.gen(function* () { … })` | Sequential, flat, readable |
| `Promise.all([…])` | `Effect.all([…], { concurrency })` | Parallel, fail-fast |
| `Promise.allSettled([…])` | `Effect.all([…], { mode: "either" })` | Parallel, collect all results |
| `Promise.race([…])` | `Effect.race(a, b)` | First success wins |
| `arr.forEach(async fn)` | `Effect.forEach(arr, fn, { concurrency })` | Explicit concurrency model |
| Manual retry loop | `Effect.retry(effect, schedule)` | Declarative, composable |
| `setTimeout` / backoff loop | `Schedule.exponential` + `Effect.retry` | Typed timing |
| `new Promise((res, rej) => …)` | `Effect.async((resume) => …)` | Callback-to-Effect bridge |
| `import db from "./db"` singleton | `Context.Tag` + `Layer` | Dependency injection |
| `JSON.parse` / `zod.parse` | `Schema.decodeUnknown(S)` | Parse error in type channel |
| `x !== null ? x : throw …` | `Effect.fromNullable(x)` | Null → typed failure |
| `if (!ok) throw …` | `Effect.filterOrFail(pred, makeError)` | Guard → typed failure |
| `console.log(…); return x` | `Effect.tap(Effect.log(…))` | Side-effect, value unchanged |

---

## Core Recipes

### 1. async/await with try/catch → Effect.gen

The most common transformation. Each `await` becomes `yield*`; each thrown type
becomes an entry in the error channel.

```typescript
// ❌ Before — errors are invisible to the type system
async function createOrder(dto: unknown) {
  try {
    const validated = OrderSchema.parse(dto);       // throws ZodError
    const [order]   = await db.insertOrder(validated); // throws on DB failure
    await emailService.send(order.userId, "Confirmed"); // throws on SMTP failure
    return order;
  } catch (e) {
    console.error(e);
    throw e; // caller must remember to catch — but TypeScript won't remind them
  }
}
// Return type: Promise<Order>  ← lies; can throw three different ways
```

```typescript
// ✅ After — every failure path is a typed, catchable value
import { Effect, Context, Layer } from "effect";
import { Schema } from "@effect/schema";

// Step 1: one class per failure mode, always with _tag for catchTag()
class ValidationError {
  readonly _tag = "ValidationError";
  constructor(readonly cause: ParseError) {}
}
class DatabaseError {
  readonly _tag = "DatabaseError";
  constructor(readonly cause: unknown) {}
}
class EmailError {
  readonly _tag = "EmailError";
  constructor(readonly userId: string, readonly cause: unknown) {}
}

// Step 2: services are Context tags, not imported singletons
class Database extends Context.Tag("Database")<Database, {
  insertOrder: (values: NewOrder) => Promise<Order[]>;
}>() {}

class EmailService extends Context.Tag("EmailService")<EmailService, {
  send: (userId: string, msg: string) => Promise<void>;
}>() {}

// Step 3: compose with Effect.gen — reads like async/await, types like a proof
export const createOrder = (dto: unknown) =>
  Effect.gen(function* () {
    // Schema.decodeUnknown enters the error channel on failure — no try needed
    const validated = yield* Schema.decodeUnknown(OrderSchema)(dto).pipe(
      Effect.mapError((cause) => new ValidationError(cause)),
    );

    const db     = yield* Database;      // injected from context, not imported
    const mailer = yield* EmailService;

    const [order] = yield* Effect.tryPromise({
      try:   () => db.insertOrder(validated),
      catch: (e) => new DatabaseError(e),    // Promise rejection → typed error
    });

    yield* Effect.tryPromise({
      try:   () => mailer.send(order.userId, "Confirmed"),
      catch: (e) => new EmailError(order.userId, e),
    });

    return order;
  });
// Effect<Order, ValidationError | DatabaseError | EmailError, Database | EmailService>
// ↑ The compiler now documents every way this can fail and every dependency it needs.
```

---

### 2. Promise chain → Effect.gen

`.then().then().catch()` chains lose independent error types — all errors collapse into
`unknown`. `Effect.gen` gives each step its own typed failure.

```typescript
// ❌ Before
function processUser(id: string): Promise<Report> {
  return fetchUser(id)
    .then(user   => fetchOrders(user.id))
    .then(orders => generateReport(orders))
    .catch(e => { throw new Error(`Pipeline failed: ${e}`) }); // types erased
}
```

```typescript
// ✅ After
export const processUser = (id: string) =>
  Effect.gen(function* () {
    const user   = yield* Effect.tryPromise({ try: () => fetchUser(id),        catch: (e) => new FetchUserError(id, e)       });
    const orders = yield* Effect.tryPromise({ try: () => fetchOrders(user.id), catch: (e) => new FetchOrdersError(user.id, e) });
    const report = yield* Effect.tryPromise({ try: () => generateReport(orders), catch: (e) => new ReportError(e)            });
    return report;
  });
// Effect<Report, FetchUserError | FetchOrdersError | ReportError, never>
// Each failure is independently catchable downstream with Effect.catchTag.
```

---

### 3. Parallel execution

```typescript
// ❌ Before
const [user, settings] = await Promise.all([fetchUser(id), fetchSettings(id)]);
// concurrency model implicit; error type collapses to unknown
```

```typescript
// ✅ After — fail-fast (mirrors Promise.all)
const [user, settings] = yield* Effect.all(
  [fetchUserEffect(id), fetchSettingsEffect(id)],
  { concurrency: "unbounded" }, // explicit concurrency — no surprises
);
// Short-circuits on first error; type: Effect<[User, Settings], FetchUserError | FetchSettingsError, never>

// ✅ Collect-all (mirrors Promise.allSettled)
const results = yield* Effect.all(
  [fetchUserEffect(id), fetchSettingsEffect(id)],
  { mode: "either" }, // returns Either<Error, Value>[] — never short-circuits
);
```

---

### 4. Iterating with side-effects

```typescript
// ❌ Before — error propagation and concurrency are both implicit
async function notifyAll(userIds: string[]) {
  for (const id of userIds) {
    await sendEmail(id); // first failure silently aborts the rest; no partial results
  }
}
```

```typescript
// ✅ After — concurrency and error collection are declared, not assumed
export const notifyAll = (userIds: string[]) =>
  Effect.forEach(
    userIds,
    (id) => Effect.tryPromise({
      try:   () => sendEmail(id),
      catch: (e) => new EmailError(id, e),
    }),
    { concurrency: 5 }, // at most 5 in-flight at once — explicit throttle
  );
// Effect<void[], EmailError, never>
```

---

### 5. Retry with backoff

```typescript
// ❌ Before — manual retry loop; backoff math, attempt counting done by hand
async function fetchWithRetry(url: string, maxAttempts = 3) {
  for (let i = 0; i < maxAttempts; i++) {
    try { return await fetch(url); }
    catch (e) { if (i === maxAttempts - 1) throw e; await sleep(1000 * 2 ** i); }
  }
}
```

```typescript
// ✅ After — policy is a first-class value; reuse it across the codebase
import { Schedule } from "effect";

const fetchEffect = (url: string) =>
  Effect.tryPromise({
    try:   () => fetch(url),
    catch: (e) => new NetworkError(url, e),
  });

// Retry up to 3 times, exponential backoff starting at 100ms, max 5s per wait
const retryPolicy = Schedule.exponential("100 millis", 2).pipe(
  Schedule.upTo("5 seconds"),
  Schedule.intersect(Schedule.recurs(3)),
);

export const fetchWithRetry = (url: string) =>
  fetchEffect(url).pipe(Effect.retry(retryPolicy));
// Effect<Response, NetworkError, never>
```

---

### 6. Callback-based async (non-Promise)

```typescript
// ❌ Before — manually wrapping in Promise; error type is unknown
function readFile(path: string): Promise<string> {
  return new Promise((res, rej) =>
    fs.readFile(path, "utf8", (err, data) => err ? rej(err) : res(data)),
  );
}
```

```typescript
// ✅ After — Effect.async bridges the callback world; types are explicit
export const readFile = (path: string) =>
  Effect.async<string, FileReadError>((resume) => {
    fs.readFile(path, "utf8", (err, data) => {
      if (err) resume(Effect.fail(new FileReadError(path, err)));
      else     resume(Effect.succeed(data));
    });
  });
// Effect<string, FileReadError, never>
```

---

### 7. Service layer (dependency injection)

Replace module-level singletons with Context tags. The requirement surface is then
visible in every function's type signature rather than hidden in import side-effects.

```typescript
// Define the service shape
class UserRepo extends Context.Tag("UserRepo")<UserRepo, {
  findById: (id: string) => Effect.Effect<User, UserNotFoundError>;
}>() {}

// Live implementation — wired at the application boundary
const UserRepoLive = Layer.succeed(UserRepo, {
  findById: (id) =>
    Effect.tryPromise({
      try:   () => db.query.users.findFirst({ where: eq(users.id, id) }),
      catch: (e) => new DatabaseError(e),
    }).pipe(
      Effect.flatMap((u) => u ? Effect.succeed(u) : Effect.fail(new UserNotFoundError(id))),
    ),
});

// Test implementation — swap in tests with zero config
const UserRepoTest = Layer.succeed(UserRepo, {
  findById: (_id) => Effect.succeed(mockUser),
});

// Consumer — `UserRepo` appears in the Requirements slot, not as an import
export const getUser = (id: string) =>
  Effect.gen(function* () {
    const repo = yield* UserRepo;
    return yield* repo.findById(id);
  });
// Effect<User, UserNotFoundError, UserRepo>
```

---

### 8. Error handling & recovery

```typescript
// Recover from a specific error tag
const withFallback = getUser(id).pipe(
  Effect.catchTag("UserNotFoundError", () => Effect.succeed(guestUser)),
);

// Handle multiple tags in one shot
const withFallbacks = getUser(id).pipe(
  Effect.catchTags({
    UserNotFoundError: ()  => Effect.succeed(guestUser),
    DatabaseError:     (e) => Effect.fail(new ServiceUnavailableError(e)),
  }),
);

// Surface the error channel as an Either (effect can never fail after this)
const asEither = Effect.either(getUser(id));
// Effect<Either<UserNotFoundError | DatabaseError, User>, never, UserRepo>

// Verify exhaustiveness: if the error channel isn't `never` after all catchTags,
// you have an unhandled case — the compiler will tell you.
```

---

## Running Effects (Application Boundary)

Effects are **lazy descriptions** — nothing executes until you call a runner. Place
runners only at the outermost edge: route handlers, CLI entry points, test bodies.

```typescript
// Async — most common in Next.js / Express / Hono
app.get("/users/:id", async (req, res) => {
  const user = await Effect.runPromise(
    getUser(req.params.id).pipe(
      Effect.provide(UserRepoLive), // inject live layer here, not inside the effect
    ),
  );
  res.json(user);
});

// Catch unhandled defects (bugs) at the boundary
await Effect.runPromise(program).catch((defect) => {
  // Typed errors are handled above; only unexpected defects reach here
  logger.fatal("Unhandled defect", defect);
  process.exit(1);
});

// Synchronous (only for pure or test effects — throws on async)
const result = Effect.runSync(Effect.succeed(42));

// Fire-and-forget background job — returns a Fiber for cancellation
const fiber = Effect.runFork(backgroundJob.pipe(Effect.provide(AppLayerLive)));
await fiber.join; // optional: wait for it later
```

---

## Quick Reference

| Goal | API |
|------|-----|
| Wrap a Promise | `Effect.tryPromise({ try, catch })` |
| Wrap a sync throw | `Effect.try({ try, catch })` |
| Sequential async steps | `Effect.gen(function* () { … })` |
| Parallel, fail-fast | `Effect.all([…], { concurrency: "unbounded" })` |
| Parallel, collect all | `Effect.all([…], { mode: "either" })` |
| Race — first success | `Effect.race(a, b)` |
| Iterate with effects | `Effect.forEach(arr, fn, { concurrency })` |
| Side-effect, keep value | `Effect.tap(fn)` |
| Transform success value | `Effect.map(fn)` |
| Chain to new Effect | `Effect.flatMap(fn)` |
| Transform error value | `Effect.mapError(fn)` |
| Recover from tagged error | `Effect.catchTag("Tag", fn)` |
| Recover from many tags | `Effect.catchTags({ … })` |
| Null → typed failure | `Effect.fromNullable(x)` |
| Guard predicate | `Effect.filterOrFail(pred, makeError)` |
| Retry with policy | `Effect.retry(effect, schedule)` |
| Timeout | `Effect.timeout(effect, "5 seconds")` |
| Parse unknown data | `Schema.decodeUnknown(S)(data)` |
| Inject dependencies | `Effect.provide(layer)` |
| Run → Promise | `Effect.runPromise(effect)` |
| Run synchronously | `Effect.runSync(effect)` |
| Run fire-and-forget | `Effect.runFork(effect)` |
