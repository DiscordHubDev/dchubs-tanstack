import { and, desc, eq, gte, sql } from "drizzle-orm";
import { Effect } from "effect";
import { server, userFavoriteServers } from "#/drizzle/schema";
import { runEffect, tryEffectPromise } from "#/lib/effect-utils";
import type { CategoryType } from "#/lib/types";
import type {
  PublicServer,
  ServerCategory,
  ServerFilterBundle,
  ServerListQueryInput,
  ServerListQueryResult,
} from "./servers.types";
import { cacheAside, getCacheVersion } from "#/lib/redis";
import { getDb } from "#/drizzle/db";

const CACHE_NAMESPACE = "servers";
const LIST_CACHE_TTL_SECONDS = 60; // 對應 client staleTime 30s
const BUNDLE_CACHE_TTL_SECONDS = 10 * 60; // 對應 client staleTime 5min

const SERVER_ROW_COLUMNS = {
  id: server.id,
  name: server.name,
  description: server.description,
  tags: server.tags,
  members: server.members,
  online: server.online,
  upvotes: server.upvotes,
  icon: server.icon,
  banner: server.banner,
  inviteUrl: server.inviteUrl,
  createdAt: server.createdAt,
  pin: server.pin,
  pinExpiry: server.pinExpiry,
  nsfw: server.nsfw,
} as const;

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

function normalizeTags(tags: string[] | null): string[] {
  if (!Array.isArray(tags)) return [];
  return tags.filter(Boolean);
}

function mapRowToPublicServer(
  row: {
    id: string;
    name: string;
    description: string;
    tags: string[] | null;
    members: number;
    online: number | null;
    upvotes: number;
    icon: string | null;
    banner: string | null;
    inviteUrl: string | null;
    createdAt: string;
    pin: boolean;
    pinExpiry: string | null;
    nsfw: boolean;
  },
  favoriteIds: Set<string>,
): PublicServer {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    tags: normalizeTags(row.tags),
    members: row.members,
    online: row.online,
    upvotes: row.upvotes,
    icon: row.icon,
    banner: row.banner,
    inviteUrl: row.inviteUrl,
    createdAt: row.createdAt,
    pin: row.pin,
    pinExpiry: row.pinExpiry,
    isFavorite: favoriteIds.has(row.id),
    nsfw: row.nsfw,
  };
}

function getFavoriteIdsEffect(userId: string | null): Effect.Effect<Set<string>, Error> {
  if (!userId) return Effect.succeed(new Set<string>());

  const db = getDb();

  return tryEffectPromise("Failed to fetch favorite servers", async () => {
    const rows = await db
      .select({ id: userFavoriteServers.a })
      .from(userFavoriteServers)
      .where(eq(userFavoriteServers.b, userId));

    return new Set(rows.map((row) => row.id));
  });
}

function getListWhere(category: ServerCategory) {
  if (category === "featured") {
    return gte(server.members, 1000);
  }

  return undefined;
}

function getListOrderBy(category: ServerCategory) {
  if (category === "new") {
    return [desc(server.createdAt)] as const;
  }

  if (category === "featured") {
    return [desc(server.upvotes), desc(server.members)] as const;
  }

  if (category === "popular") {
    return [desc(server.pin), desc(server.members)] as const;
  }

  if (category === "voted") {
    return [desc(server.upvotes)] as const;
  }

  return [desc(server.upvotes)] as const;
}

function baseServerRowsQuery() {
  const db = getDb();
  return db.select(SERVER_ROW_COLUMNS).from(server);
}
type ServerRow = Awaited<ReturnType<typeof baseServerRowsQuery>>[number];

function listServersPageEffect(
  input: ServerListQueryInput,
  userId?: string | null,
  userNsfw?: boolean,
): Effect.Effect<ServerListQueryResult, Error> {
  const db = getDb();
  return Effect.gen(function* () {
    const favoriteIds = yield* getFavoriteIdsEffect(userId ?? null);

    const baseWhereClause = getListWhere(input.category);
    const orderBy = getListOrderBy(input.category);
    const offset = (input.page - 1) * input.limit;

    const whereClause = userNsfw
      ? baseWhereClause
        ? and(baseWhereClause, eq(server.nsfw, false))
        : eq(server.nsfw, false)
      : baseWhereClause;

    // total 跟 rows 綁在同一個快取條目裡一起讀寫，不會發生「total 是舊的、
    // rows 是新的」這種分頁對不上的情況。key 帶版本號，寫入操作
    // (新增/刪除/編輯伺服器) 呼叫 bumpCacheVersion("servers") 就能整批失效，
    // 不需要等 TTL，也不需要 SCAN+DEL。
    const version = yield* tryEffectPromise("Failed to read servers cache version", () =>
      getCacheVersion(CACHE_NAMESPACE),
    );
    const cacheKey = `servers:list:v${version}:${input.category ?? "all"}:${input.page}:${input.limit}:${
      userNsfw ? "sfw" : "all"
    }`;

    const { total, rows } = yield* tryEffectPromise(
      "Failed to load server list",
      (): Promise<{ total: number; rows: ServerRow[] }> =>
        cacheAside(CACHE_NAMESPACE, cacheKey, LIST_CACHE_TTL_SECONDS, async () => {
          const countQuery = db.select({ count: sql<number>`count(*)` }).from(server);
          const scopedCountQuery = whereClause ? countQuery.where(whereClause) : countQuery;

          const rowsQuery = baseServerRowsQuery();
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
      // favorites 永遠在快取讀取「之後」才 merge 上去，不會進 Redis。
      servers: rows.map((row) => mapRowToPublicServer(row, favoriteIds)),
      total,
      totalPages,
      page: input.page,
      limit: input.limit,
    };
  });
}

function listServerFilterBundleEffect(
  userId?: string | null,
  userNsfw?: boolean,
): Effect.Effect<ServerFilterBundle, Error> {
  return Effect.gen(function* () {
    const version = yield* tryEffectPromise("Failed to read servers cache version", () =>
      getCacheVersion(CACHE_NAMESPACE),
    );
    const cacheKey = `servers:bundle:v${version}:${userNsfw ? "sfw" : "all"}`;

    // 只快取「跟使用者無關」的重運算部分：全表掃描 + tag 統計。
    const rawServers = yield* tryEffectPromise(
      "Failed to load raw servers",
      (): Promise<ServerRow[]> =>
        cacheAside(CACHE_NAMESPACE, cacheKey, BUNDLE_CACHE_TTL_SECONDS, async () => {
          const baseQuery = baseServerRowsQuery();
          const scopedQuery = userNsfw ? baseQuery.where(eq(server.nsfw, false)) : baseQuery;
          return scopedQuery;
        }),
    );

    // favoriteIds 完全不進 Redis，永遠即時查、即時 merge。
    const favoriteIds = yield* getFavoriteIdsEffect(userId ?? null);
    const allServers = rawServers.map((row) => mapRowToPublicServer(row, favoriteIds));

    const tagCount = new Map<string, number>();
    for (const item of allServers) {
      for (const tag of normalizeTags(item.tags)) {
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

    const featuredServers = allServers.filter((item) => item.members >= 1000).length;
    const totalTags = allServers.reduce((acc, item) => acc + item.tags.length, 0);

    return {
      allServers,
      categories,
      stats: {
        totalServers: allServers.length,
        featuredServers,
        totalTags,
      },
    };
  });
}
export async function listServersPage(
  input: ServerListQueryInput,
  userId?: string | null,
  userNsfw?: boolean,
): Promise<ServerListQueryResult> {
  return runEffect(listServersPageEffect(input, userId, userNsfw));
}

export async function listServerFilterBundle(
  userId?: string | null,
  userNsfw?: boolean,
): Promise<ServerFilterBundle> {
  return runEffect(listServerFilterBundleEffect(userId, userNsfw));
}

export async function deleteServer(
  serverId: string,
  userId: string,
): Promise<{ success: boolean; reason?: string }> {
  // 1. 基本安全檢查：確保 userId 存在
  if (!userId) {
    return { success: false, reason: "UNAUTHORIZED" };
  }

  const db = getDb();

  // 2. 一次性查出該伺服器是否存在，以及擁有者是誰
  const targetServer = await db
    .select({
      ownerId: server.ownerId,
    })
    .from(server)
    .where(eq(server.id, serverId))
    .then((res) => res[0]); // 取出第一筆資料

  // 3. 檢查階段 A：如果根本查不到資料，代表伺服器不存在
  if (!targetServer) {
    return { success: false, reason: "SERVER_NOT_FOUND" };
  }

  // 4. 檢查階段 B：如果伺服器存在，但 ownerId 與當前 userId 不符
  if (targetServer.ownerId !== userId) {
    return { success: false, reason: "NOT_THE_OWNER" };
  }

  // 5. 執行階段：通過所有安全檢查，執行刪除
  await db.delete(server).where(eq(server.id, serverId));

  return { success: true };
}
