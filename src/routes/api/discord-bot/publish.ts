import { createFileRoute } from "@tanstack/react-router";
import { eq, inArray } from "drizzle-orm";
import { Effect, ParseResult, Schema } from "effect";
import { db } from "#/drizzle/db";
import { server, serverAdmins, user } from "#/drizzle/schema"; // 確保引入正確的 table

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const fetchDiscordUser = (discordId: string) =>
  Effect.tryPromise({
    try: async () => {
      const res = await fetch(`https://discord.com/api/v10/users/${discordId}`, {
        headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
      });
      if (!res.ok) {
        throw new Error(`Discord API 回應 ${res.status}`);
      }
      return (await res.json()) as {
        id: string;
        username: string;
        email: string | null;
        global_name: string | null;
        avatar: string | null;
      };
    },
    catch: (error) => new Error(`抓取 Discord 使用者失敗: ${String(error)}`),
  }).pipe(Effect.catchAll(() => Effect.succeed(null)));

const ensureUserExists = (tx: DbTransaction, discordId: string) =>
  Effect.gen(function* () {
    const existing = yield* Effect.tryPromise({
      try: () =>
        tx.query.user.findFirst({
          where: eq(user.discordId, discordId),
          columns: { id: true },
        }),
      catch: (error) => new Error(`查詢使用者失敗: ${String(error)}`),
    });

    if (existing) return existing.id;

    const discordUser = yield* fetchDiscordUser(discordId);
    const displayName = discordUser?.global_name ?? discordUser?.username ?? "未知使用者";
    const avatarUrl = discordUser?.avatar
      ? `https://cdn.discordapp.com/avatars/${discordId}/${discordUser.avatar}.png`
      : "https://cdn.discordapp.com/embed/avatars/0.png";

    const created = yield* Effect.tryPromise({
      try: async () => {
        const [row] = await tx
          .insert(user)
          .values({
            id: discordId,
            discordId,
            name: displayName,
            username: discordUser?.username ?? "未知使用者",
            avatar: avatarUrl,
            email: discordUser?.email ?? `discord-${discordId}@placeholder.invalid`,
            emailVerified: false,
          })
          .onConflictDoNothing({ target: user.discordId })
          .returning({ id: user.id });
        return row;
      },
      catch: (error) => new Error(`建立 placeholder owner 失敗: ${String(error)}`),
    });

    if (created) return created.id;

    const raceWinner = yield* Effect.tryPromise({
      try: () =>
        tx.query.user.findFirst({
          where: eq(user.discordId, discordId),
          columns: { id: true },
        }),
      catch: (error) => new Error(`race condition 查詢失敗: ${String(error)}`),
    });

    if (!raceWinner) {
      return yield* Effect.fail(new Error(`無法建立或尋找 owner 使用者: ${discordId}`));
    }
    return raceWinner.id;
  });

// 1. 擴充預期的 Discord Bot 傳入資料結構
const DiscordGuildSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.optional(Schema.NullOr(Schema.String)),
  icon: Schema.optional(Schema.NullOr(Schema.String)),
  banner: Schema.optional(Schema.NullOr(Schema.String)),
  owner_id: Schema.String,
  features: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  approximate_member_count: Schema.optional(Schema.Number),
  approximate_presence_count: Schema.optional(Schema.Number),
  nsfw_level: Schema.optional(Schema.Number),
  // 🔔 新增欄位：由 Bot 端直接算好並傳入，確保極致效能
  invite_url: Schema.optional(Schema.NullOr(Schema.String)),
  admin_ids: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
});

export const Route = createFileRoute("/api/discord-bot/publish")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const program = Effect.gen(function* () {
          const body = yield* Effect.tryPromise({
            try: () => request.json(),
            catch: () => new Error("無法解析 JSON 請求本體"),
          });

          const guild = yield* Schema.decodeUnknown(DiscordGuildSchema)(body);

          const iconUrl = guild.icon
            ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`
            : null;
          const bannerUrl = guild.banner
            ? `https://cdn.discordapp.com/banners/${guild.id}/${guild.banner}.png`
            : null;
          const isNsfw = guild.nsfw_level === 3;

          // 注意：這裡先不放 ownerId，因為要等進入 transaction、
          // 確認/建立 owner 的 user row 後才知道正確的內部 user.id
          const baseInsertData = {
            name: guild.name,
            description: guild.description || "這個伺服器還沒有提供敘述。",
            members: guild.approximate_member_count ?? 0,
            online: guild.approximate_presence_count ?? 0,
            icon: iconUrl,
            banner: bannerUrl,
            nsfw: isNsfw,
            upvotes: 0,
            inviteUrl: guild.invite_url || null,
          };

          yield* Effect.tryPromise({
            try: () =>
              db.transaction(async (tx) => {
                // 4-0. 確保 owner 存在於 user 表（不存在就用 Discord API 抓資料建立）
                const ownerUserId = await Effect.runPromise(ensureUserExists(tx, guild.owner_id));

                const insertData = {
                  id: guild.id,
                  ...baseInsertData,
                  ownerId: ownerUserId,
                };

                // 4-1. Upsert 伺服器資料
                await tx
                  .insert(server)
                  .values(insertData)
                  .onConflictDoUpdate({
                    target: server.id,
                    set: {
                      name: insertData.name,
                      description: insertData.description,
                      members: insertData.members,
                      online: insertData.online,
                      icon: insertData.icon,
                      banner: insertData.banner,
                      nsfw: insertData.nsfw,
                      inviteUrl: insertData.inviteUrl,
                      ownerId: insertData.ownerId,
                    },
                  });

                // 4-2. 處理 Server Admins
                if (guild.admin_ids && guild.admin_ids.length > 0) {
                  const existingUsers = await tx.query.user.findMany({
                    where: inArray(user.id, guild.admin_ids),
                    columns: { id: true },
                  });

                  const validAdminIds = existingUsers.map((u) => u.id);

                  await tx.delete(serverAdmins).where(eq(serverAdmins.a, guild.id));

                  if (validAdminIds.length > 0) {
                    const adminInsertData = validAdminIds.map((adminId) => ({
                      a: guild.id,
                      b: adminId,
                    }));
                    await tx.insert(serverAdmins).values(adminInsertData);
                  }
                }
              }),
            catch: (error) => new Error(`資料庫同步失敗: ${String(error)}`),
          });

          return Response.json(
            { success: true, message: "伺服器資料與管理員同步成功" },
            { status: 200 },
          );
        }).pipe(
          Effect.catchTag("ParseError", (parseError) =>
            Effect.succeed(
              Response.json(
                {
                  error: "無效的 Payload 格式",
                  details: ParseResult.TreeFormatter.formatErrorSync(parseError),
                },
                { status: 400 },
              ),
            ),
          ),
          Effect.catchAll((error) => {
            console.error("Failed to sync server:", error.message);
            return Effect.succeed(Response.json({ error: error.message }, { status: 500 }));
          }),
        );

        return await Effect.runPromise(program);
      },
    },
  },
});
