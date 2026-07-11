import { and, desc, eq, exists, gte, sql } from "drizzle-orm";
import { Effect } from "effect";
import { db } from "#/drizzle/db";
import { bot, botDevelopers, userFavoriteBots } from "#/drizzle/schema";
import { runEffect, tryEffectPromise } from "#/lib/effect-utils";
import { bumpBotsCacheVersion, cacheAside, getBotsCacheVersion } from "#/lib/redis";
import type { CategoryType } from "#/lib/types";
import type {
  BotCategory,
  BotFilterBundle,
  BotListQueryInput,
  BotListQueryResult,
  PublicBot,
} from "./bots.types";

const TAG_COLORS = [
  "bg-blue-500",
  "bg-green-500",
  "bg-rose-500",
  "bg-amber-500",
  "bg-cyan-500",
  "bg-indigo-500",
  "bg-emerald-500",
  "bg-fuchsia-500",
] as const;

// Redis TTLs are set slightly *longer* than the matching TanStack Query
// staleTime on the client, so the server-side cache stays warm for at least
// as long as the client considers its own copy fresh.
const LIST_CACHE_TTL_SECONDS = 60; // client staleTime: 30s
const FILTER_BUNDLE_CACHE_TTL_SECONDS = 10 * 60; // client staleTime: 5min

type BotRow = {
  id: string;
  name: string;
  description: string;
  tags: string[] | null;
  servers: number;
  users: number;
  upvotes: number;
  icon: string | null;
  banner: string | null;
  inviteUrl: string | null;
  website: string | null;
  supportServer: string | null;
  approvedAt: string | null;
  pin: boolean;
  pinExpiry: string | null;
  verified: boolean;
  isAdmin: boolean;
  nsfw: boolean;
  termsOfServiceUrl: string | null;
  privacyPolicyUrl: string | null;
};

const BOT_ROW_COLUMNS = {
  id: bot.id,
  name: bot.name,
  description: bot.description,
  tags: bot.tags,
  servers: bot.servers,
  users: bot.users,
  upvotes: bot.upvotes,
  icon: bot.icon,
  banner: bot.banner,
  inviteUrl: bot.inviteUrl,
  website: bot.website,
  supportServer: bot.supportServer,
  approvedAt: bot.approvedAt,
  pin: bot.pin,
  pinExpiry: bot.pinExpiry,
  verified: bot.verified,
  isAdmin: bot.isAdmin,
  nsfw: bot.nsfw,
  termsOfServiceUrl: bot.termsOfServiceUrl,
  privacyPolicyUrl: bot.privacyPolicyUrl,
} as const;

function normalizeTags(tags: string[] | null): string[] {
  if (!Array.isArray(tags)) return [];
  return tags.filter(Boolean);
}

function mapRowToPublicBot(row: BotRow, favoriteIds: Set<string>): PublicBot {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    tags: normalizeTags(row.tags),
    servers: row.servers,
    users: row.users,
    upvotes: row.upvotes,
    icon: row.icon,
    banner: row.banner,
    inviteUrl: row.inviteUrl,
    website: row.website,
    supportServer: row.supportServer,
    approvedAt: row.approvedAt || new Date().toISOString(),
    pin: row.pin,
    pinExpiry: row.pinExpiry,
    verified: row.verified,
    isFavorite: favoriteIds.has(row.id),
    isAdmin: row.isAdmin,
    nsfw: row.nsfw,
    termsOfServiceUrl: row.termsOfServiceUrl,
    privacyPolicyUrl: row.privacyPolicyUrl,
  };
}

// NOTE: favorites are intentionally *never* cached in Redis. isFavorite is
// per-user, so baking it into a shared cache entry would either explode key
// cardinality (one entry per user) or force a full cache bust on every single
// favorite/unfavorite click. It's already a cheap, indexed lookup, so we just
// fetch it fresh every request and merge it onto the cached bot rows.
function getFavoriteIdsEffect(userId: string | null): Effect.Effect<Set<string>, Error> {
  if (!userId) return Effect.succeed(new Set<string>());

  return tryEffectPromise("Failed to fetch favorite bots", async () => {
    const rows = await db
      .select({ id: userFavoriteBots.a })
      .from(userFavoriteBots)
      .where(eq(userFavoriteBots.b, userId));

    return new Set(rows.map((item) => item.id));
  });
}

function getListWhere(category: BotCategory) {
  const approved = eq(bot.status, "approved");

  if (category === "featured") {
    return and(approved, gte(bot.servers, 1000));
  }

  if (category === "verified") {
    return and(approved, eq(bot.verified, true));
  }

  return approved;
}

function getListOrderBy(category: BotCategory) {
  if (category === "new") {
    return [sql`${bot.approvedAt} DESC NULLS LAST`, desc(bot.createdAt)] as const;
  }

  if (category === "featured") {
    return [desc(bot.upvotes), desc(bot.servers)] as const;
  }

  if (category === "verified") {
    return [sql`${bot.approvedAt} DESC NULLS LAST`, desc(bot.verified)] as const;
  }

  if (category === "popular") {
    const currentPin = sql`CASE 
      WHEN ${bot.pin} = true AND (${bot.pinExpiry} IS NULL OR ${bot.pinExpiry} > CURRENT_TIMESTAMP) THEN 1 
      ELSE 0 
    END DESC`;

    return [currentPin, desc(bot.servers)] as const;
  }

  if (category === "voted") {
    return [desc(bot.upvotes)] as const;
  }

  return [desc(bot.upvotes)] as const;
}

function listBotsPageEffect(
  input: BotListQueryInput,
  userId: string | null,
  userNsfw?: boolean, // 👉 新增判斷參數
): Effect.Effect<BotListQueryResult, Error> {
  return Effect.gen(function* () {
    const favoriteIds = yield* getFavoriteIdsEffect(userId);

    const baseWhereClause = getListWhere(input.category);
    const orderBy = getListOrderBy(input.category);
    const offset = (input.page - 1) * input.limit;

    // 👉 核心邏輯：如果 userNsfw 為 true，過濾掉 nsfw 為 true 的機器人
    const whereClause = userNsfw
      ? baseWhereClause
        ? and(baseWhereClause, eq(bot.nsfw, false))
        : eq(bot.nsfw, false)
      : baseWhereClause;

    // Cache key is a function of everything that changes the result set:
    // category / page / limit / nsfw flag, plus a global version so any
    // write (delete/approve/edit/upvote) can invalidate everything at once
    // via bumpBotsCacheVersion() instead of pattern-deleting keys.
    const version = yield* tryEffectPromise("Failed to read bots cache version", () =>
      getBotsCacheVersion(),
    );
    const cacheKey = `bots:list:v${version}:${input.category}:${input.page}:${input.limit}:${
      userNsfw ? "sfw" : "all"
    }`;

    const { total, rows } = yield* tryEffectPromise(
      "Failed to load bot list",
      (): Promise<{ total: number; rows: BotRow[] }> =>
        cacheAside(cacheKey, LIST_CACHE_TTL_SECONDS, async () => {
          const countQuery = db.select({ count: sql<number>`count(*)` }).from(bot);
          const scopedCountQuery = whereClause ? countQuery.where(whereClause) : countQuery;

          const rowsQuery = db.select(BOT_ROW_COLUMNS).from(bot);
          const scopedRowsQuery = whereClause ? rowsQuery.where(whereClause) : rowsQuery;

          const [countRows, rows] = await Promise.all([
            scopedCountQuery,
            scopedRowsQuery
              .orderBy(...orderBy)
              .limit(input.limit)
              .offset(offset),
          ]);

          return { total: Number(countRows[0]?.count ?? 0), rows };
        }),
    );

    const totalPages = Math.max(1, Math.ceil(total / input.limit));

    return {
      // Favorites are merged *after* the cache read, never inside it.
      bots: rows.map((row) => mapRowToPublicBot(row, favoriteIds)),
      total,
      totalPages,
      page: input.page,
      limit: input.limit,
    };
  });
}

function listBotFilterBundleEffect(
  userId: string | null,
  userNsfw?: boolean, // 👉 新增判斷參數
): Effect.Effect<BotFilterBundle, Error> {
  return Effect.gen(function* () {
    const favoriteIds = yield* getFavoriteIdsEffect(userId);

    // 👉 基礎條件：機器人必須是 approved 狀態
    const baseCondition = eq(bot.status, "approved");

    // 👉 組合條件：如果開啟過濾，則加上 nsfw === false 的限制
    const whereClause = userNsfw ? and(baseCondition, eq(bot.nsfw, false)) : baseCondition;

    const version = yield* tryEffectPromise("Failed to read bots cache version", () =>
      getBotsCacheVersion(),
    );
    const cacheKey = `bots:filterBundle:v${version}:${userNsfw ? "sfw" : "all"}`;

    // This is the expensive full-table scan used to build tag stats, so it
    // gets the longest TTL of the two cached queries.
    const rows = yield* tryEffectPromise(
      "Failed to load all bots",
      (): Promise<BotRow[]> =>
        cacheAside(cacheKey, FILTER_BUNDLE_CACHE_TTL_SECONDS, () =>
          db.select(BOT_ROW_COLUMNS).from(bot).where(whereClause),
        ),
    );

    const allBots = rows.map((row) => mapRowToPublicBot(row, favoriteIds));

    const tagCount = new Map<string, number>();
    for (const item of allBots) {
      for (const tag of item.tags) {
        const normalized = tag.trim();
        if (!normalized) continue;

        tagCount.set(normalized, (tagCount.get(normalized) ?? 0) + 1);
      }
    }

    const categories: CategoryType[] = [...tagCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name], index) => ({
        id: `tag-${name.toLowerCase().replace(/\s+/g, "-")}`,
        name,
        color: TAG_COLORS[index % TAG_COLORS.length],
      }));

    const verifiedBots = allBots.filter((item) => item.verified).length;
    const totalTags = allBots.reduce((acc, item) => acc + item.tags.length, 0);

    return {
      allBots,
      categories,
      stats: {
        totalBots: allBots.length,
        verifiedBots,
        totalTags,
      },
    };
  });
}

export async function listBotsPage(
  input: BotListQueryInput,
  userId: string | null,
  userNsfw?: boolean,
): Promise<BotListQueryResult> {
  return runEffect(listBotsPageEffect(input, userId, userNsfw));
}

export async function listBotFilterBundle(
  userId: string | null,
  userNsfw?: boolean,
): Promise<BotFilterBundle> {
  return runEffect(listBotFilterBundleEffect(userId, userNsfw));
}

export function isDeveloperEffect(botId: string, discordId: string) {
  return Effect.tryPromise({
    try: async () => {
      const record = await db
        .select()
        .from(botDevelopers)
        .where(and(eq(botDevelopers.a, botId), eq(botDevelopers.b, discordId)))
        .limit(1);
      return record.length > 0;
    },
    catch: (error) => new Error(`資料庫查詢失敗: ${error}`),
  });
}

export async function deleteBot(
  botId: string,
  userId: string,
): Promise<{ success: boolean; reason?: string }> {
  if (!userId) return { success: false, reason: "UNAUTHORIZED" };

  const botCheck = await db
    .select({
      isDeveloper: exists(
        db
          .select()
          .from(botDevelopers)
          .where(and(eq(botDevelopers.a, bot.id), eq(botDevelopers.b, userId))),
      ),
    })
    .from(bot)
    .where(eq(bot.id, botId))
    .then((res) => res[0]);

  if (!botCheck) {
    return { success: false, reason: "BOT_NOT_FOUND" };
  }

  if (!botCheck.isDeveloper) {
    return { success: false, reason: "NOT_THE_DEVELOPER" };
  }

  await db.delete(bot).where(eq(bot.id, botId));

  await bumpBotsCacheVersion();

  return { success: true };
}
