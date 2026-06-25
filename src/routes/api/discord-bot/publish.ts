import { createFileRoute } from "@tanstack/react-router";
import { eq, inArray } from "drizzle-orm";
import { Effect, ParseResult, Schema } from "effect";
import { db } from "#/drizzle/db";
import { server, serverAdmins, user } from "#/drizzle/schema"; // 確保引入正確的 table

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
        // 使用 Effect.gen 建立管線化的流程
        const program = Effect.gen(function* () {
          // 解析請求本體
          const body = yield* Effect.tryPromise({
            try: () => request.json(),
            catch: () => new Error("無法解析 JSON 請求本體"),
          });

          // 2. 驗證資料格式 (如果失敗會自動被底下的 catchTag("ParseError") 捕捉)
          const guild = yield* Schema.decodeUnknown(DiscordGuildSchema)(body);

          // 3. 資料轉換與清理
          const iconUrl = guild.icon
            ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`
            : null;
          const bannerUrl = guild.banner
            ? `https://cdn.discordapp.com/banners/${guild.id}/${guild.banner}.png`
            : null;
          const isNsfw = guild.nsfw_level === 3;

          const insertData = {
            id: guild.id,
            name: guild.name,
            description: guild.description || "這個伺服器還沒有提供敘述。",
            members: guild.approximate_member_count ?? 0,
            online: guild.approximate_presence_count ?? 0,
            ownerId: guild.owner_id,
            icon: iconUrl,
            banner: bannerUrl,
            nsfw: isNsfw,
            upvotes: 0,
            inviteUrl: guild.invite_url || null, // 寫入 Invite URL
          };

          // 4. 執行 Drizzle Transaction (確保伺服器與管理員同步是原子操作)
          yield* Effect.tryPromise({
            try: () =>
              db.transaction(async (tx) => {
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
                      inviteUrl: insertData.inviteUrl, // 更新 Invite URL
                    },
                  });

                // 4-2. 處理 Server Admins (多對多關聯)
                if (guild.admin_ids && guild.admin_ids.length > 0) {
                  // ⚠️ 關鍵防護：檢查哪些 admin_ids 真的存在於我們的 `user` 表中
                  // 如果直接寫入 _ServerAdmins，碰到尚未登入過網站的 Discord 使用者會觸發 Foreign Key Error
                  const existingUsers = await tx.query.user.findMany({
                    where: inArray(user.id, guild.admin_ids),
                    columns: { id: true },
                  });

                  const validAdminIds = existingUsers.map((u) => u.id);

                  // 先清空此伺服器舊的管理員關係
                  await tx.delete(serverAdmins).where(eq(serverAdmins.a, guild.id));

                  // 寫入新的有效管理員關係
                  if (validAdminIds.length > 0) {
                    const adminInsertData = validAdminIds.map((adminId) => ({
                      a: guild.id, // server.id
                      b: adminId, // user.id
                    }));
                    await tx.insert(serverAdmins).values(adminInsertData);
                  }
                }
              }),
            catch: (error) => new Error(`資料庫同步失敗: ${String(error)}`),
          });

          // 5. 成功回傳
          return Response.json(
            { success: true, message: "伺服器資料與管理員同步成功" },
            { status: 200 },
          );
        }).pipe(
          // 錯誤處理分支一：Schema 驗證失敗
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
          // 錯誤處理分支二：其他錯誤 (例如 JSON 解析錯誤、資料庫錯誤)
          Effect.catchAll((error) => {
            console.error("Failed to sync server:", error.message);
            return Effect.succeed(Response.json({ error: error.message }, { status: 500 }));
          }),
        );

        // 啟動 Effect 程式
        return await Effect.runPromise(program);
      },
    },
  },
});
