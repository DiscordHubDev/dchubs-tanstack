import { createFileRoute } from "@tanstack/react-router";
import { Either, ParseResult, Schema } from "effect";
import { db } from "#/drizzle/db";
import { server } from "#/drizzle/schema";

// 1. 定義預期的 Discord Bot 傳入資料結構 (使用 Effect Schema)
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
});

export const Route = createFileRoute("/api/discord-bot/publish")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				try {
					// 解析請求本體
					const body = await request.json();

					// 2. 執行驗證：使用 decodeUnknownEither 解析未知的外部資料
					const parseResult =
						Schema.decodeUnknownEither(DiscordGuildSchema)(body);

					// 3. 透過 Either 處理錯誤分支，避免依賴拋出 Exception
					if (Either.isLeft(parseResult)) {
						return Response.json(
							{
								error: "無效的 Payload 格式",
								// 使用 TreeFormatter 提供易於閱讀的結構化錯誤訊息
								details: ParseResult.TreeFormatter.formatErrorSync(
									parseResult.left,
								),
							},
							{ status: 400 },
						);
					}

					// 成功取得型別安全的資料
					const guild = parseResult.right;

					// 4. 資料轉換與清理
					const iconUrl = guild.icon
						? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`
						: null;
					const bannerUrl = guild.banner
						? `https://cdn.discordapp.com/banners/${guild.id}/${guild.banner}.png`
						: null;

					const isNsfw = guild.nsfw_level === 3;

					// 5. 準備寫入資料庫的物件
					// 利用 Nullish Coalescing (??) 與 || 來處理可選欄位的預設值
					const insertData = {
						id: guild.id,
						name: guild.name,
						description: guild.description || "這個伺服器還沒有提供敘述。",
						members: guild.approximate_member_count ?? 0,
						online: guild.approximate_presence_count ?? 0,
						ownerId: guild.owner_id,
						icon: iconUrl,
						banner: bannerUrl,
						features: guild.features || [],
						nsfw: isNsfw,
						upvotes: 0,
					};

					// 6. 執行 Drizzle Upsert 邏輯
					await db
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
								features: insertData.features,
								nsfw: insertData.nsfw,
							},
						});

					return Response.json(
						{ success: true, message: "伺服器資料同步成功" },
						{ status: 200 },
					);
				} catch (error) {
					console.error("Failed to sync server:", error);
					return Response.json({ error: "內部伺服器錯誤" }, { status: 500 });
				}
			},
		},
	},
});
