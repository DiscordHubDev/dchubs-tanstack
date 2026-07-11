import Redis from "ioredis";

import "@tanstack/react-start/server-only";

/**
 * Reuse a single connection across hot-reloads / module re-imports in dev,
 * same pattern as the drizzle `db` singleton.
 */
const globalForRedis = globalThis as unknown as { __redis?: Redis };

export const redis =
  globalForRedis.__redis ??
  new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
  });

if (process.env.NODE_ENV !== "production") {
  globalForRedis.__redis = redis;
}

redis.on("error", (err) => {
  console.error("[redis] connection error:", err);
});

// In-process de-dupe: if 50 requests miss the same key at the same instant
// (right after a TTL expiry or a version bump), only the first one actually
// runs `fn()` — the rest await that same in-flight promise instead of each
// firing their own DB query. This only coalesces within a single Node
// process, not across horizontally-scaled instances, but it's a cheap,
// zero-infra way to blunt the worst of a cache-stampede.
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Cache-aside helper.
 *
 * If redis is unreachable or a GET/SET fails, we log and fall through to
 * calling `fn()` directly — a redis outage degrades to "no cache", not a 500.
 */
export async function cacheAside<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached) as T;
  } catch (err) {
    console.error(`[redis] GET failed for key "${key}":`, err);
  }

  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const computePromise = (async () => {
    try {
      const fresh = await fn();

      try {
        await redis.set(key, JSON.stringify(fresh), "EX", ttlSeconds);
      } catch (err) {
        console.error(`[redis] SET failed for key "${key}":`, err);
      }

      return fresh;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, computePromise);
  return computePromise;
}

/**
 * Generic per-namespace cache "generation" number, e.g. namespace "bots" or
 * "servers". Bumping it invalidates every key that embeds the version
 * (`{namespace}:list:v{version}:...`) without needing SCAN+DEL.
 */
export async function getCacheVersion(namespace: string): Promise<number> {
  try {
    const v = await redis.get(`${namespace}:cache:version`);
    return v ? Number(v) : 1;
  } catch (err) {
    console.error(
      `[redis] failed to read "${namespace}" cache version, treating as uncached:`,
      err,
    );
    return 1;
  }
}

/**
 * Bumps the version for a namespace. Call this after any mutation that
 * changes the underlying listable dataset: delete, create/approve, edit,
 * upvote, pin, etc.
 */
export async function bumpCacheVersion(namespace: string): Promise<void> {
  try {
    await redis.incr(`${namespace}:cache:version`);
  } catch (err) {
    console.error(`[redis] failed to bump "${namespace}" cache version:`, err);
  }
}

// Thin, namespace-bound wrappers so existing call sites (bots.service.ts)
// don't need to change.
export const getBotsCacheVersion = () => getCacheVersion("bots");
export const bumpBotsCacheVersion = () => bumpCacheVersion("bots");
