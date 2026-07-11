import { createFileRoute } from "@tanstack/react-router";
import { Data, Effect } from "effect";
import { server, user } from "#/drizzle/schema";
import { getDb } from "#/drizzle/db";

class ApiError extends Data.TaggedError("ApiError")<{
  message: string;
  status: number;
  guildId: string;
  userId?: string;
}> {}

class DbError extends Data.TaggedError("DbError")<{ message: string; cause: unknown }> {}

const getAllServers = () =>
  Effect.tryPromise({
    try: async () => {
      const db = getDb();
      const query = db.select({ id: server.id, ownerId: server.ownerId }).from(server);
      if (process.env.NODE_ENV === "development") return (await query).slice(0, 5);
      return await query;
    },
    catch: (e) => new DbError({ message: "Failed to fetch servers", cause: e }),
  });

const fetchGuildData = (guildId: string, botToken: string) =>
  Effect.tryPromise({
    try: async () => {
      const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}?with_counts=true`, {
        headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
      });
      if (!res.ok) throw { status: res.status, message: await res.text() };
      return (await res.json()) as Record<string, unknown>;
    },
    catch: (e: any) =>
      new ApiError({ guildId, message: e?.message ?? "API error", status: e?.status ?? 500 }),
  });

const fetchMemberData = (guildId: string, userId: string, botToken: string) =>
  Effect.tryPromise({
    try: async () => {
      const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, {
        headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
      });
      if (!res.ok) throw { status: res.status, message: await res.text() };
      return (await res.json()) as Record<string, unknown>;
    },
    catch: (e: any) =>
      new ApiError({
        guildId,
        userId,
        message: e?.message ?? "API error",
        status: e?.status ?? 500,
      }),
  });

const upsertServer = (guild: Record<string, unknown>, ownerId: string) =>
  Effect.tryPromise({
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
          id: guild.id as string,
          name: guild.name as string,
          description: (guild.description as string) || "",
          ownerId,
          members: (guild.approximate_member_count as number) || 0,
          online: (guild.approximate_presence_count as number) || 0,
          icon: iconUrl,
          banner: bannerUrl,
          upvotes: 0,
          featured: false,
          pin: false,
        })
        .onConflictDoUpdate({
          target: server.id,
          set: {
            name: guild.name as string,
            description: (guild.description as string) || "",
            members: (guild.approximate_member_count as number) || 0,
            online: (guild.approximate_presence_count as number) || 0,
            icon: iconUrl,
            banner: bannerUrl,
          },
        })
        .returning();
      return upserted;
    },
    catch: (e) => new DbError({ message: "Failed to upsert server", cause: e }),
  });

const upsertUser = (member: Record<string, unknown>) =>
  Effect.tryPromise({
    try: async () => {
      const db = getDb();
      const u = member.user as Record<string, unknown>;
      const avatarUrl = u.avatar
        ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.webp`
        : "https://cdn.discordapp.com/embed/avatars/0.png";
      const bannerUrl = u.banner
        ? `https://cdn.discordapp.com/banners/${u.id}/${u.banner}.webp?size=4096`
        : null;
      const [upserted] = await db
        .insert(user)
        .values({
          id: u.id as string,
          discordId: u.id as string,
          username: (u.username as string) || "",
          avatar: avatarUrl,
          banner: bannerUrl,
          bannerColor: (u.banner_color as string) || null,
          email: (u.email as string) ?? "",
          name: (u.global_name as string) || (u.username as string) || "",
        })
        .onConflictDoUpdate({
          target: user.discordId,
          set: {
            username: (u.username as string) || "",
            name: (u.global_name as string) || (u.username as string) || "",
            avatar: avatarUrl,
            banner: bannerUrl,
            bannerColor: (u.banner_color as string) || null,
          },
        })
        .returning();
      return upserted;
    },
    catch: (e) => new DbError({ message: "Failed to upsert user", cause: e }),
  });

const syncSingleServer = (guildId: string, ownerId: string, botToken: string) =>
  Effect.gen(function* () {
    const guild = yield* fetchGuildData(guildId, botToken);
    const updatedServer = yield* upsertServer(guild, ownerId);
    const member = yield* fetchMemberData(guildId, ownerId, botToken);
    yield* upsertUser(member);
    console.log(`[update-servers] Synced: ${updatedServer.name}`);
    return updatedServer;
  }).pipe(
    Effect.catchAll(() => {
      console.error(`[update-servers] Failed: ${guildId}`);
      return Effect.succeed(null);
    }),
  );

export const Route = createFileRoute("/api/cron/update-servers")({
  server: {
    handlers: {
      POST: async () => {
        const botToken = process.env.DISCORD_BOT_TOKEN;
        if (!botToken) {
          return Response.json({ error: "DISCORD_BOT_TOKEN not configured" }, { status: 500 });
        }

        try {
          console.log("[update-servers] Starting server sync...");
          const servers = await Effect.runPromise(getAllServers());
          console.log(`[update-servers] Syncing ${servers.length} servers (concurrency: 5)`);

          const results = await Effect.runPromise(
            Effect.forEach(servers, (s: any) => syncSingleServer(s.id, s.ownerId, botToken), {
              concurrency: 5,
            }),
          );
          const successCount = (results as any[]).filter((r: any) => r !== null).length;
          console.log(`[update-servers] Done. Success: ${successCount}/${servers.length}`);

          return Response.json(
            { success: true, total: servers.length, updated: successCount },
            { status: 200 },
          );
        } catch (error) {
          console.error("[update-servers] Error:", error);
          return Response.json({ error: String(error) }, { status: 500 });
        }
      },
    },
  },
});
