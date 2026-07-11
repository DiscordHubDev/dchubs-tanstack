import "@tanstack/react-start/server-only";

import { env } from "cloudflare:workers";

const getKV = () => {
  const kv = env.DCHUBS_CACHE;
  if (!kv) {
    console.warn("[KV] DCHUBS_CACHE binding not found.");
  }
  return kv;
};

const inFlight = new Map<string, Promise<unknown>>();

export async function cacheAside<T>(
  namespace: string,
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  const kv = getKV();
  const version = await getCacheVersion(namespace);
  const fullKey = `${namespace}:v${version}:${key}`;

  // 1. 嘗試讀取
  if (kv) {
    try {
      const cached = await kv.get(fullKey, "json");
      if (cached) return cached as T;
    } catch (err) {
      console.error(`[KV] GET failed for ${fullKey}:`, err);
    }
  }

  // 2. 防雪崩 (僅限單一 Worker 實例內)
  const existing = inFlight.get(fullKey);
  if (existing) return existing as Promise<T>;

  // 3. 執行與寫入
  const computePromise = (async () => {
    try {
      const fresh = await fn();
      if (kv) {
        await kv.put(fullKey, JSON.stringify(fresh), { expirationTtl: ttlSeconds });
      }
      return fresh;
    } finally {
      inFlight.delete(fullKey);
    }
  })();

  inFlight.set(fullKey, computePromise);
  return computePromise;
}

export async function getCacheVersion(namespace: string): Promise<number> {
  const kv = getKV();
  if (!kv) return 1;

  try {
    const v = await kv.get(`${namespace}:cache:version`);
    return v ? Number(v) : 1;
  } catch (err) {
    console.error(`[KV] failed to read "${namespace}" version:`, err);
    return 1;
  }
}

export async function bumpCacheVersion(namespace: string): Promise<void> {
  const kv = getKV();
  if (!kv) return;

  try {
    const current = await kv.get(`${namespace}:cache:version`);
    const nextVersion = current ? Number(current) + 1 : 2;
    await kv.put(`${namespace}:cache:version`, String(nextVersion));
  } catch (err) {
    console.error(`[KV] failed to bump "${namespace}" version:`, err);
  }
}

export const getBotsCacheVersion = () => getCacheVersion("bots");
export const bumpBotsCacheVersion = () => bumpCacheVersion("bots");
