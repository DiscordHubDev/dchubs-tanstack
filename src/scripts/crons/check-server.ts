// scripts/check-server.ts
import { inArray } from "drizzle-orm";
import { Data, Duration, Effect } from "effect";
import { server, user } from "#/drizzle/schema";
import type { getDb } from "#/drizzle/db";

type Db = ReturnType<typeof getDb>;

class DiscordApiError extends Data.TaggedError("DiscordApiError")<{
  readonly message: string;
  readonly status?: number;
}> {}

class DbFetchError extends Data.TaggedError("DbFetchError")<{
  readonly message: string;
}> {}

class DbDeleteError extends Data.TaggedError("DbDeleteError")<{
  readonly message: string;
}> {}

class DiscordGuildDetailError extends Data.TaggedError("DiscordGuildDetailError")<{
  readonly message: string;
  readonly guildId: string;
}> {}

class DiscordUserFetchError extends Data.TaggedError("DiscordUserFetchError")<{
  readonly message: string;
  readonly userId: string;
}> {}

class UserUpdateError extends Data.TaggedError("UserUpdateError")<{
  readonly message: string;
}> {}

interface DiscordUserGuild {
  id: string;
  name: string;
  icon: string;
  owner: boolean;
  permissions: string;
  features: string[];
}

interface DiscordRateLimitResponse {
  retry_after?: number;
  message?: string;
  code?: number;
}

interface DiscordGuildDetail {
  id: string;
  name: string;
  owner_id: string;
}

interface DiscordUser {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
  email: string | null;
  banner: string | null;
  accent_color: number | null;
}

const DISCORD_REQUEST_CONCURRENCY = 3;
const MAX_RATE_LIMIT_RETRIES = 5;
const DISCORD_GUILDS_PAGE_LIMIT = 200;

const getBotGuildIdsEffect = (botToken: string) =>
  Effect.gen(function* () {
    const allIds: string[] = [];
    let after: string | undefined;

    while (true) {
      const url = new URL("https://discord.com/api/v10/users/@me/guilds");
      url.searchParams.set("limit", String(DISCORD_GUILDS_PAGE_LIMIT));
      if (after) url.searchParams.set("after", after);

      const guilds = yield* fetchDiscordJson(url.toString(), botToken).pipe(
        Effect.map((g) => g as DiscordUserGuild[]),
        Effect.mapError((error) => new DiscordApiError({ message: error.message })),
      );

      if (guilds.length === 0) break;

      allIds.push(...guilds.map((g) => g.id));
      after = guilds[guilds.length - 1].id;
    }

    return allIds;
  });

// ✅ 改吃 db 參數
const getAllServerIdsChunkedEffect = (db: Db) =>
  Effect.tryPromise({
    try: async () => {
      const result = await db.select({ id: server.id }).from(server);
      return result.map((row) => row.id);
    },
    catch: (error: any) =>
      new DbFetchError({
        message: error?.message || "Failed to fetch server IDs from database",
      }),
  });

// ✅ 改吃 db 參數
const deleteServersEffect = (db: Db, toDeleteIds: string[]) =>
  Effect.tryPromise({
    try: async () => {
      const deleteResult = await db.delete(server).where(inArray(server.id, toDeleteIds));
      return (
        (deleteResult as any).rowCount ??
        (deleteResult as any).rowsAffected ??
        (deleteResult as any).length ??
        toDeleteIds.length
      );
    },
    catch: (error: any) =>
      new DbDeleteError({ message: error?.message || "Failed to delete servers" }),
  });

const fetchDiscordJson = (url: string, botToken: string, attempt = 1): Effect.Effect<any, Error> =>
  Effect.gen(function* () {
    const res = yield* Effect.tryPromise({
      try: () => fetch(url, { headers: { Authorization: `Bot ${botToken}` } }),
      catch: (error: any) => new Error(error?.message || "Network error"),
    });

    if (res.status === 429) {
      if (attempt > MAX_RATE_LIMIT_RETRIES) {
        return yield* Effect.fail(new Error(`Rate limited too many times: ${url}`));
      }
      const body = yield* Effect.tryPromise({
        try: async () => {
          const json = await res.json().catch(() => ({}));
          return json as DiscordRateLimitResponse;
        },
        catch: () => new Error("Failed to parse rate limit body"),
      });
      const retryAfterSeconds = Number(res.headers.get("retry-after")) || body?.retry_after || 1;
      console.warn(
        `⏳ Discord rate limited，等待 ${retryAfterSeconds}s 後重試 (第 ${attempt} 次): ${url}`,
      );
      yield* Effect.sleep(Duration.seconds(retryAfterSeconds));
      return yield* fetchDiscordJson(url, botToken, attempt + 1);
    }

    if (!res.ok) {
      return yield* Effect.fail(new Error(`Discord API Error (${res.status}): ${url}`));
    }

    return yield* Effect.tryPromise({
      try: () => res.json(),
      catch: (error: any) => new Error(error?.message || "Failed to parse JSON"),
    });
  });

const getGuildOwnerIdEffect = (guildId: string, botToken: string) =>
  fetchDiscordJson(`https://discord.com/api/v10/guilds/${guildId}`, botToken).pipe(
    Effect.map((guild: DiscordGuildDetail) => guild.owner_id),
    Effect.mapError((error) => new DiscordGuildDetailError({ message: error.message, guildId })),
  );

const getDiscordUserEffect = (userId: string, botToken: string) =>
  fetchDiscordJson(`https://discord.com/api/v10/users/${userId}`, botToken).pipe(
    Effect.map((u) => u as DiscordUser),
    Effect.mapError((error) => new DiscordUserFetchError({ message: error.message, userId })),
  );

const buildAvatarUrl = (discordUser: DiscordUser) =>
  discordUser.avatar
    ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.${
        discordUser.avatar.startsWith("a_") ? "gif" : "webp"
      }`
    : "https://cdn.discordapp.com/embed/avatars/0.png";

const buildBannerUrl = (discordUser: DiscordUser) =>
  discordUser.banner
    ? `https://cdn.discordapp.com/banners/${discordUser.id}/${discordUser.banner}.${
        discordUser.banner.startsWith("a_") ? "gif" : "webp"
      }`
    : null;

// ✅ 改吃 db 參數
const upsertOwnerProfileEffect = (db: Db, discordUser: DiscordUser) =>
  Effect.tryPromise({
    try: async () => {
      const displayName = discordUser.global_name ?? discordUser.username;
      const avatarUrl = buildAvatarUrl(discordUser);
      const bannerUrl = buildBannerUrl(discordUser);

      await db
        .insert(user)
        .values({
          id: discordUser.id,
          email: discordUser.email ?? `${discordUser.id}@discord.placeholder`,
          discordId: discordUser.id,
          name: displayName,
          username: discordUser.username,
          avatar: avatarUrl,
          banner: bannerUrl,
          image: avatarUrl,
          bannerColor: String(discordUser.accent_color),
        })
        .onConflictDoUpdate({
          target: user.discordId,
          set: {
            name: displayName,
            username: discordUser.username,
            avatar: avatarUrl,
            banner: bannerUrl,
            image: avatarUrl,
            bannerColor: String(discordUser.accent_color),
          },
        });
    },
    catch: (error: any) =>
      new UserUpdateError({ message: error?.message || `Failed to upsert user ${discordUser.id}` }),
  });

// ✅ db 一路往下傳
const syncGuildOwnerEffect = (db: Db, guildId: string, botToken: string) =>
  Effect.gen(function* () {
    const ownerId = yield* getGuildOwnerIdEffect(guildId, botToken);
    const discordUser = yield* getDiscordUserEffect(ownerId, botToken);
    yield* upsertOwnerProfileEffect(db, discordUser);
    return { guildId, ownerId };
  }).pipe(
    Effect.catchAll((error) =>
      Effect.sync(() => {
        console.warn(`⚠️ 無法同步伺服器 ${guildId} 的擁有者資訊: ${error.message}`);
        return null;
      }),
    ),
  );

// ✅ 對外唯一 export：吃 db + botToken，回傳 Effect
export const syncServersProgram = (db: Db) =>
  Effect.gen(function* () {
    const botToken = process.env.DISCORD_BOT_TOKEN;
    console.log("🔍 開始檢查 Bot 伺服器狀態...");
    const botGuildIds = yield* getBotGuildIdsEffect(botToken);
    const allPublishedIds = yield* getAllServerIdsChunkedEffect(db);

    const toDelete = allPublishedIds.filter((id) => !botGuildIds.includes(id));

    let deletedCount = 0;
    if (toDelete.length > 0) {
      console.log(`🗑️ 發現 ${toDelete.length} 個需要刪除的伺服器，執行刪除...`);
      deletedCount = yield* deleteServersEffect(db, toDelete);
    } else {
      console.log("✅ 沒有需要清理的伺服器。");
    }

    const remainingIds = botGuildIds.filter((id) => allPublishedIds.includes(id));
    console.log(`👤 開始同步 ${remainingIds.length} 個伺服器的擁有者資訊...`);
    const ownerSyncResults = yield* Effect.forEach(
      remainingIds,
      (id) => syncGuildOwnerEffect(db, id, botToken),
      { concurrency: DISCORD_REQUEST_CONCURRENCY },
    );
    const ownerSyncedCount = ownerSyncResults.filter((r) => r !== null).length;
    console.log(`✅ 成功同步 ${ownerSyncedCount}/${remainingIds.length} 個擁有者資訊。`);

    return { deletedCount, deletedIds: toDelete, ownerSyncedCount };
  });
