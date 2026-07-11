// scripts/update-servers.ts
import { Data, Effect, Exit } from "effect";
import { server, user } from "#/drizzle/schema";
import { getDb } from "#/drizzle/db";

class DiscordApiError extends Data.TaggedError("DiscordApiError")<{
  message: string;
  status: number;
  guildId: string;
  userId?: string;
}> {}
class DatabaseError extends Data.TaggedError("DatabaseError")<{
  message: string;
  cause: unknown;
}> {}
class ConfigError extends Data.TaggedError("ConfigError")<{
  message: string;
}> {}

interface DiscordGuildWithCounts {
  /* 略，同你原本的定義 */ id: string;
  name: string;
  description: string | null;
  icon: string | null;
  banner: string | null;
  approximate_member_count: number;
  approximate_presence_count: number;
}
interface DiscordUser {
  /* 略，同你原本的定義 */ id: string;
  username: string;
  avatar: string | null;
  banner?: string | null;
  banner_color?: string | null;
  global_name?: string | null;
  email?: string | null;
}
interface DiscordGuildMember {
  /* 略，同你原本的定義 */ user: DiscordUser;
  nick?: string | null;
  avatar?: string | null;
  banner?: string | null;
  roles: string[];
  joined_at: string;
}

const getAllServersFromDb = () =>
  Effect.tryPromise({
    /* 同你原本的實作 */
    try: async () => {
      const db = getDb();
      const query = db.select({ id: server.id, ownerId: server.ownerId }).from(server);
      if (process.env.NODE_ENV === "development") return await query.limit(5);
      return await query;
    },
    catch: (cause) => new DatabaseError({ message: "Failed to fetch servers", cause }),
  });

const fetchDiscordServerData = (guildId: string, botToken: string) =>
  Effect.tryPromise({
    /* 同你原本的實作 */
    try: async () => {
      const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}?with_counts=true`, {
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
      });
      if (!res.ok) throw { status: res.status, message: await res.text() };
      return (await res.json()) as DiscordGuildWithCounts;
    },
    catch: (error: any) =>
      new DiscordApiError({
        guildId,
        message: error?.message,
        status: error?.status || 500,
      }),
  });

const fetchDiscordMemberData = (guildId: string, userId: string, botToken: string) =>
  Effect.tryPromise({
    /* 同你原本的實作 */
    try: async () => {
      const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, {
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
      });
      if (!res.ok) throw { status: res.status, message: await res.text() };
      return (await res.json()) as DiscordGuildMember;
    },
    catch: (error: any) =>
      new DiscordApiError({
        guildId,
        userId,
        message: error?.message,
        status: error?.status || 500,
      }),
  });

const upsertServerDb = (guild: DiscordGuildWithCounts, ownerId: string) =>
  Effect.tryPromise({
    /* 同你原本的實作 */
    try: async () => {
      const db = getDb();
      const iconUrl = guild.icon
        ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.webp`
        : null;
      const bannerUrl = guild.banner
        ? `https://cdn.discordapp.com/banners/${guild.id}/${guild.banner}.webp?size=4096`
        : null;
      const [upserted] = await db
        .insert(server)
        .values({
          id: guild.id,
          name: guild.name,
          description: guild.description || "",
          ownerId: ownerId,
          members: guild.approximate_member_count || 0,
          online: guild.approximate_presence_count || 0,
          icon: iconUrl,
          banner: bannerUrl,
          upvotes: 0,
          featured: false,
          pin: false,
        })
        .onConflictDoUpdate({
          target: server.id,
          set: {
            name: guild.name,
            description: guild.description || "",
            members: guild.approximate_member_count || 0,
            online: guild.approximate_presence_count || 0,
            icon: iconUrl,
            banner: bannerUrl,
          },
        })
        .returning();
      return upserted;
    },
    catch: (cause) => new DatabaseError({ message: "Failed to upsert server data", cause }),
  });

const upsertUserDb = (member: DiscordGuildMember) =>
  Effect.tryPromise({
    /* 同你原本的實作 */
    try: async () => {
      const db = getDb();
      const discordUser = member.user;
      const avatarUrl = discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.webp`
        : "https://cdn.discordapp.com/embed/avatars/0.png";
      const bannerUrl = discordUser.banner
        ? `https://cdn.discordapp.com/banners/${discordUser.id}/${discordUser.banner}.webp?size=4096`
        : null;
      const [upserted] = await db
        .insert(user)
        .values({
          id: discordUser.id,
          discordId: discordUser.id,
          username: discordUser.username,
          avatar: avatarUrl,
          banner: bannerUrl,
          bannerColor: discordUser.banner_color || null,
          email: discordUser.email ?? "",
          name: discordUser.global_name || discordUser.username,
        })
        .onConflictDoUpdate({
          target: user.discordId,
          set: {
            username: discordUser.username,
            name: discordUser.global_name || discordUser.username,
            avatar: avatarUrl,
            banner: bannerUrl,
            bannerColor: discordUser.banner_color || null,
          },
        })
        .returning();
      return upserted;
    },
    catch: (cause) => new DatabaseError({ message: "Failed to upsert user data", cause }),
  });

const syncSingleServer = (guildId: string, ownerId: string, botToken: string) =>
  Effect.gen(function* () {
    const guildData = yield* fetchDiscordServerData(guildId, botToken);
    const updatedServer = yield* upsertServerDb(guildData, ownerId);
    const memberData = yield* fetchDiscordMemberData(guildId, ownerId, botToken);
    const updatedOwner = yield* upsertUserDb(memberData);
    console.log(`✅ Server 同步成功: ${updatedServer.name}`);
    return { server: updatedServer, owner: updatedOwner };
  }).pipe(
    Effect.catchAll((error) => {
      console.error(`⚠️ [Sync Failed 跳過] GuildID: ${guildId}, OwnerID: ${ownerId}`, error);
      return Effect.succeed(null);
    }),
  );

const syncAllServersProgram = Effect.gen(function* () {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken)
    yield* Effect.fail(new ConfigError({ message: "DISCORD_BOT_TOKEN is not configured." }));

  console.log("🔍 開始抓取資料庫內的伺服器清單...");
  const serversToSync = yield* getAllServersFromDb();

  console.log(`🚀 準備併發同步 ${serversToSync.length} 個伺服器 (Concurrency: 5)`);
  const results = yield* Effect.forEach(
    serversToSync,
    (s) => syncSingleServer(s.id, s.ownerId, botToken!),
    { concurrency: 5 },
  );

  const successfulUpdates = results.filter((res) => res !== null);
  return {
    total: serversToSync.length,
    updated: successfulUpdates.length,
  };
});

// ─── 執行進入點 ───
Effect.runPromiseExit(syncAllServersProgram).then((exit) => {
  console.log("🔌 正在關閉資料庫連線池...");
  if (Exit.isSuccess(exit)) {
    console.log("🎉 所有伺服器與擁有人資料同步完成:", exit.value);
    process.exit(0);
  } else {
    console.error("❌ 同步任務發生嚴重錯誤:", exit.cause);
    process.exit(1);
  }
});
