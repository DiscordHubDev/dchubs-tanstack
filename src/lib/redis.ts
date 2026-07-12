import { Redis } from "@upstash/redis/cloudflare";
import { env } from "cloudflare:workers";

import "@tanstack/react-start/server-only";

const globalForRedis = globalThis as unknown as { __redis?: Redis };

export const redis =
  globalForRedis.__redis ??
  Redis.fromEnv({
    UPSTASH_REDIS_REST_URL: env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: env.UPSTASH_REDIS_REST_TOKEN,
  });

if (process.env.NODE_ENV !== "production") {
  globalForRedis.__redis = redis;
}

// Upstash 的 client 是每次呼叫各自丟出錯誤,而不是像 ioredis 那樣
// 透過長連線的 "error" event 通知,所以底下改成在每個呼叫點各自 try/catch。

// 行程內去重複:同一瞬間 50 個 request miss 同一個 key(剛好碰到 TTL 過期
// 或 version bump),只有第一個真的去跑 fn(),其他人 await 同一個
// in-flight promise。這只在單一 isolate 內有效,無法跨多個
// horizontally-scaled instances,但成本幾乎是零,能擋掉最嚴重的 cache stampede。
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Cache-aside helper,現在是 namespace + version-aware。
 *
 * 完整 key 會組成 `{namespace}:v{version}:{key}`,其中 version 是
 * getCacheVersion(namespace) 讀出來的。呼叫 bumpCacheVersion 之後,
 * 該 namespace 底下所有 key 會立刻「失效」——不需要 SCAN+DEL,
 * 舊版本的 key 只是再也不會被查到,靠自己的 TTL 自然過期。
 *
 * 如果 Upstash 打不通或 GET/SET 失敗,會 log 下來並直接 fallback
 * 呼叫 fn() —— Upstash 掛掉會降級成「沒有 cache」,而不是整個 500。
 */
export async function cacheAside<T>(
  namespace: string,
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  const version = await getCacheVersion(namespace);
  const fullKey = `${namespace}:v${version}:${key}`;

  try {
    // Upstash 預設會自動幫非字串值做 JSON (de)serialize,
    // 所以這裡直接拿到已經 parse 好的物件,不用再手動 JSON.parse。
    const cached = await redis.get<T>(fullKey);
    if (cached !== null && cached !== undefined) return cached;
  } catch (err) {
    console.error(`[redis] GET failed for key "${fullKey}":`, err);
  }

  const existing = inFlight.get(fullKey) as Promise<T> | undefined;
  if (existing) return existing;

  const computePromise = (async () => {
    try {
      const fresh = await fn();

      try {
        // 同理,直接丟物件進去,Upstash 會自動序列化。
        await redis.set(fullKey, fresh, { ex: ttlSeconds });
      } catch (err) {
        console.error(`[redis] SET failed for key "${fullKey}":`, err);
      }

      return fresh;
    } finally {
      inFlight.delete(fullKey);
    }
  })();

  inFlight.set(fullKey, computePromise);
  return computePromise;
}

/**
 * 通用的 per-namespace cache "generation" number,例如 namespace
 * "bots" 或 "servers"。bump 這個版本號,就能讓所有嵌入該版本號的 key
 * (`{namespace}:v{version}:...`)一次失效,不需要 SCAN+DEL。
 */
export async function getCacheVersion(namespace: string): Promise<number> {
  try {
    const v = await redis.get<number | string>(`${namespace}:cache:version`);
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
 * bump 某個 namespace 的版本號。任何會改變底層可列表資料的 mutation
 * 之後都要呼叫這個:delete、create/approve、edit、upvote、pin 等等。
 */
export async function bumpCacheVersion(namespace: string): Promise<void> {
  try {
    await redis.incr(`${namespace}:cache:version`);
  } catch (err) {
    console.error(`[redis] failed to bump "${namespace}" cache version:`, err);
  }
}

// 保留原本的 namespace-bound wrapper,呼叫端(bots.service.ts)不用改。
export const getBotsCacheVersion = () => getCacheVersion("bots");
export const bumpBotsCacheVersion = () => bumpCacheVersion("bots");

// 你的 server 相關程式碼裡看起來也有對應的 namespace,順手補上對稱的 wrapper。
export const getServersCacheVersion = () => getCacheVersion("servers");
export const bumpServersCacheVersion = () => bumpCacheVersion("servers");
