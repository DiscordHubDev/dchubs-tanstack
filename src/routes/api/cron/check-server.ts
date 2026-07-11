import { inArray } from "drizzle-orm";
import { createFileRoute } from "@tanstack/react-router";
import { Data, Duration, Effect } from "effect";
import { server, user } from "#/drizzle/schema";
import { getDb } from "#/drizzle/db";

class DiscordApiError extends Data.TaggedError("DiscordApiError")<{
  readonly message: string;
  readonly status?: number;
}> {}

const MAX_RETRIES = 5;
const CONCURRENCY = 3;
const GUILDS_PAGE_LIMIT = 200;

const fetchDiscordJson = (url: string, botToken: string, attempt = 1): Effect.Effect<any, Error> =>
  Effect.gen(function* () {
    const res = yield* Effect.tryPromise({
      try: () => fetch(url, { headers: { Authorization: `Bot ${botToken}` } }),
      catch: (e) => new Error((e as Error).message ?? "Network error"),
    });

    if (res.status === 429) {
      if (attempt > MAX_RETRIES) {
        return yield* Effect.fail(new Error(`Rate limited too many times: ${url}`));
      }
      let retryAfter = 1;
      try {
        const body = yield* Effect.tryPromise({
          try: () => res.json().catch(() => ({})),
          catch: () => new Error("parse fail"),
        });
        retryAfter = Number(res.headers.get("retry-after")) || (body as any)?.retry_after || 1;
      } catch {
        retryAfter = Number(res.headers.get("retry-after")) || 1;
      }
      console.warn(`[check-server] Rate limited, retrying in ${retryAfter}s (attempt ${attempt})`);
      yield* Effect.sleep(Duration.seconds(retryAfter));
      return yield* fetchDiscordJson(url, botToken, attempt + 1);
    }

    if (!res.ok) {
      return yield* Effect.fail(new Error(`Discord API Error (${res.status}): ${url}`));
    }

    return yield* Effect.tryPromise({
      try: () => res.json(),
      catch: (e) => new Error((e as Error).message ?? "Failed to parse JSON"),
    });
  });

const getBotGuildIdsEffect = (botToken: string) =>
  Effect.gen(function* () {
    const allIds: string[] = [];
    let after: string | undefined;
    while (true) {
      const url = new URL("https://discord.com/api/v10/users/@me/guilds");
      url.searchParams.set("limit", String(GUILDS_PAGE_LIMIT));
      if (after) url.searchParams.set("after", after);
      const guilds = yield* fetchDiscordJson(url.toString(), botToken).pipe(
        Effect.map((g: any) => g as Array<{ id: string }>),
        Effect.mapError((e) => new DiscordApiError({ message: e.message })),
      );
      if (guilds.length === 0) break;
      allIds.push(...guilds.map((g) => g.id));
      after = guilds[guilds.length - 1].id;
    }
    return allIds;
  });

const getAllServerIdsEffect = () =>
  Effect.tryPromise({
    try: async () => {
      const db = getDb();
      const result = await db.select({ id: server.id }).from(server);
      return result.map((r) => r.id);
    },
    catch: (e) => new Error((e as Error).message ?? "Failed to fetch server IDs"),
  });

const deleteServersEffect = (ids: string[]) =>
  Effect.tryPromise({
    try: async () => {
      const db = getDb();
      await db.delete(server).where(inArray(server.id, ids));
      return ids.length;
    },
    catch: (e) => new Error((e as Error).message ?? "Failed to delete servers"),
  });

const getGuildOwnerIdEffect = (guildId: string, botToken: string) =>
  fetchDiscordJson(`https://discord.com/api/v10/guilds/${guildId}`, botToken).pipe(
    Effect.map((g: any) => g.owner_id as string),
    Effect.mapError((e) => new Error(e.message)),
  );

const getDiscordUserEffect = (userId: string, botToken: string) =>
  fetchDiscordJson(`https://discord.com/api/v10/users/${userId}`, botToken).pipe(
    Effect.map((u: any) => u),
    Effect.mapError((e) => new Error(e.message)),
  );

const upsertOwnerEffect = (discordUser: any) =>
  Effect.tryPromise({
    try: async () => {
      const db = getDb();
      const displayName = discordUser.global_name ?? discordUser.username;
      const avatarUrl = discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.${discordUser.avatar.startsWith("a_") ? "gif" : "webp"}`
        : "https://cdn.discordapp.com/embed/avatars/0.png";
      const bannerUrl = discordUser.banner
        ? `https://cdn.discordapp.com/banners/${discordUser.id}/${discordUser.banner}.${discordUser.banner.startsWith("a_") ? "gif" : "webp"}`
        : null;
      await db
        .insert(user)
        .values({
          id: discordUser.id,
          email: discordUser.email,
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
    catch: (e) => new Error((e as Error).message ?? "Failed to upsert user"),
  });

const syncGuildOwnerEffect = (guildId: string, botToken: string) =>
  Effect.gen(function* () {
    const ownerId = yield* getGuildOwnerIdEffect(guildId, botToken);
    const discordUser = yield* getDiscordUserEffect(ownerId, botToken);
    yield* upsertOwnerEffect(discordUser);
    return { guildId, ownerId };
  }).pipe(
    Effect.catchAll(() =>
      Effect.sync(() => {
        console.warn(`[check-server] Skip owner sync for ${guildId}`);
        return null;
      }),
    ),
  );

export const Route = createFileRoute("/api/cron/check-server")({
  server: {
    handlers: {
      POST: async () => {
        const botToken = process.env.DISCORD_BOT_TOKEN;
        if (!botToken) {
          return Response.json({ error: "DISCORD_BOT_TOKEN not configured" }, { status: 500 });
        }

        try {
          console.log("[check-server] Starting guild sync...");
          const botGuildIds = await Effect.runPromise(getBotGuildIdsEffect(botToken));
          const allPublishedIds = await Effect.runPromise(getAllServerIdsEffect());

          const toDelete = allPublishedIds.filter((id) => !botGuildIds.includes(id));
          let deletedCount = 0;
          if (toDelete.length > 0) {
            console.log(`[check-server] Deleting ${toDelete.length} orphaned servers`);
            deletedCount = await Effect.runPromise(deleteServersEffect(toDelete));
          } else {
            console.log("[check-server] No orphaned servers");
          }

          const remainingIds = botGuildIds.filter((id) => allPublishedIds.includes(id));
          console.log(`[check-server] Syncing ${remainingIds.length} guild owners...`);
          const results = await Effect.runPromise(
            Effect.forEach(remainingIds, (id: string) => syncGuildOwnerEffect(id, botToken), {
              concurrency: CONCURRENCY,
            }),
          );
          const syncedCount = (results as any[]).filter((r: any) => r !== null).length;
          console.log(
            `[check-server] Done. Deleted: ${deletedCount}, Owners synced: ${syncedCount}/${remainingIds.length}`,
          );

          return Response.json(
            { success: true, deletedCount, ownerSyncedCount: syncedCount },
            { status: 200 },
          );
        } catch (error) {
          console.error("[check-server] Error:", error);
          return Response.json({ error: String(error) }, { status: 500 });
        }
      },
    },
  },
});
