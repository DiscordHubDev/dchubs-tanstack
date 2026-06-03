import { createFileRoute } from "@tanstack/react-router";
import { Data, Effect, Exit } from "effect";
import { db } from "#/drizzle/db";
import { server, user } from "#/drizzle/schema"; // 假設從這裡引入 user 表

// ==========================================
// 1. 定義 Effect 錯誤型別
// ==========================================
class DiscordApiError extends Data.TaggedError("DiscordApiError")<{
	message: string;
	status: number;
	guildId: string;
	userId?: string; // 加上 userId 方便追蹤
}> {}
class DatabaseError extends Data.TaggedError("DatabaseError")<{
	message: string;
	cause: unknown;
}> {}
class ConfigError extends Data.TaggedError("ConfigError")<{
	message: string;
}> {}

// ==========================================
// 定義 Discord API 資料結構
// ==========================================
interface DiscordGuildWithCounts {
	id: string;
	name: string;
	description: string | null;
	icon: string | null;
	banner: string | null;
	approximate_member_count: number;
	approximate_presence_count: number;
}

// 根據 Discord API 結構定義 User 欄位
interface DiscordUser {
	id: string;
	username: string;
	avatar: string | null;
	banner?: string | null;
	banner_color?: string | null;
}

// 根據 Discord API 結構定義 Guild Member 欄位
interface DiscordGuildMember {
	user: DiscordUser;
	nick?: string | null;
	avatar?: string | null;
	banner?: string | null;
	roles: string[];
	joined_at: string;
	// ... 其他欄位可以視需求加上
}

// ==========================================
// 2. Discord API & DB 操作 (Effect 函式)
// ==========================================

// 2a. 從資料庫撈取所有既有的伺服器清單
const getAllServersFromDb = () =>
	Effect.tryPromise({
		try: async () => {
			const query = db
				.select({ id: server.id, ownerId: server.ownerId })
				.from(server);

			// 💡 偵測是否為開發者環境，若是則加上 limit(5)
			if (process.env.NODE_ENV === "development") {
				console.log(
					"[Dev Mode] Detected: Only fetching the first 5 servers for syncing.",
				);
				return await query.limit(5);
			}

			return await query;
		},
		catch: (cause) =>
			new DatabaseError({
				message: "Failed to fetch servers from database",
				cause,
			}),
	});

// 2b. 取得單一 Discord 伺服器資料
const fetchDiscordServerData = (guildId: string, botToken: string) =>
	Effect.tryPromise({
		try: async () => {
			const res = await fetch(
				`https://discord.com/api/v10/guilds/${guildId}?with_counts=true`,
				{
					headers: {
						Authorization: `Bot ${botToken}`,
						"Content-Type": "application/json",
					},
				},
			);

			if (!res.ok) {
				throw { status: res.status, message: await res.text() };
			}
			return (await res.json()) as DiscordGuildWithCounts;
		},
		catch: (error: any) =>
			new DiscordApiError({
				guildId,
				message: error?.message || "Failed to fetch Server from Discord API",
				status: error?.status || 500,
			}),
	});

// [新增] 2c. 取得單一 Discord 成員資料 (Owner)
const fetchDiscordMemberData = (
	guildId: string,
	userId: string,
	botToken: string,
) =>
	Effect.tryPromise({
		try: async () => {
			const res = await fetch(
				`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`,
				{
					headers: {
						Authorization: `Bot ${botToken}`,
						"Content-Type": "application/json",
					},
				},
			);

			if (!res.ok) {
				throw { status: res.status, message: await res.text() };
			}
			return (await res.json()) as DiscordGuildMember;
		},
		catch: (error: any) =>
			new DiscordApiError({
				guildId,
				userId,
				message: error?.message || "Failed to fetch Member from Discord API",
				status: error?.status || 500,
			}),
	});

// 2d. 更新單一伺服器資料
const upsertServerDb = (guild: DiscordGuildWithCounts, ownerId: string) =>
	Effect.tryPromise({
		try: async () => {
			const iconUrl = guild.icon
				? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`
				: null;
			const bannerUrl = guild.banner
				? `https://cdn.discordapp.com/banners/${guild.id}/${guild.banner}.png`
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
		catch: (cause) =>
			new DatabaseError({ message: "Failed to upsert server data", cause }),
	});

// [新增] 2e. 更新單一使用者 (Owner) 資料
const upsertUserDb = (member: DiscordGuildMember) =>
	Effect.tryPromise({
		try: async () => {
			const discordUser = member.user;

			// 處理頭像與橫幅網址 (全域 User 的頭像)
			// 備註: avatar 必填(notNull)，若沒設定頭像需給預設值
			const avatarUrl = discordUser.avatar
				? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
				: "https://cdn.discordapp.com/embed/avatars/0.png";

			const bannerUrl = discordUser.banner
				? `https://cdn.discordapp.com/banners/${discordUser.id}/${discordUser.banner}.png`
				: null;

			const [upserted] = await db
				.insert(user)
				.values({
					id: discordUser.id,
					username: discordUser.username,
					avatar: avatarUrl,
					banner: bannerUrl,
					bannerColor: discordUser.banner_color || null,
					// bio, social 保留未定義，或依賴 DB 預設值
					// joinedAt 有 DEFAULT CURRENT_TIMESTAMP，這裡可不傳或使用 member.joined_at
				})
				.onConflictDoUpdate({
					target: user.id,
					set: {
						username: discordUser.username,
						avatar: avatarUrl,
						banner: bannerUrl,
						bannerColor: discordUser.banner_color || null,
					},
				})
				.returning();

			return upserted;
		},
		catch: (cause) =>
			new DatabaseError({ message: "Failed to upsert user data", cause }),
	});

// 2f. 核心工作流：同步單一伺服器 (包含 Server 與 Owner 數據)
const syncSingleServer = (guildId: string, ownerId: string, botToken: string) =>
	Effect.gen(function* () {
		// 1. 同步伺服器數據
		const guildData = yield* fetchDiscordServerData(guildId, botToken);
		const updatedServer = yield* upsertServerDb(guildData, ownerId);

		// 2. 同步伺服器擁有者(Member)數據
		const memberData = yield* fetchDiscordMemberData(
			guildId,
			ownerId,
			botToken,
		);
		const updatedOwner = yield* upsertUserDb(memberData);

		return { server: updatedServer, owner: updatedOwner };
	}).pipe(
		// catchAll 保證如果 API 噴錯(例如被踢出伺服器導致找不到 member)，不會讓整個迴圈崩潰
		Effect.catchAll((error) => {
			console.error(
				`[Sync Failed] GuildID: ${guildId}, OwnerID: ${ownerId}`,
				error,
			);
			return Effect.succeed(null);
		}),
	);

// ==========================================
// 3. TanStack API Route 實作
// ==========================================
export const Route = createFileRoute("/api/cron/update-servers")({
	server: {
		handlers: {
			POST: async () => {
				const program = Effect.gen(function* () {
					const botToken = process.env.DISCORD_BOT_TOKEN;
					if (!botToken) {
						return yield* Effect.fail(
							new ConfigError({
								message: "DISCORD_BOT_TOKEN is not configured.",
							}),
						);
					}

					// 1. 從 DB 撈出所有需要同步的伺服器
					const serversToSync = yield* getAllServersFromDb();

					// 2. 走訪所有伺服器進行同步 (含 Server 與 Owner)
					const results = yield* Effect.forEach(
						serversToSync,
						(s) => syncSingleServer(s.id, s.ownerId, botToken),
						{ concurrency: 5 }, // 限制同時 5 個併發
					);

					// 3. 過濾掉失敗的項目 (null)
					const successfulUpdates = results.filter((res) => res !== null);

					return {
						total: serversToSync.length,
						updated: successfulUpdates.length,
						data: successfulUpdates,
					};
				});

				const exit = await Effect.runPromiseExit(program);

				// 4. 回傳標準 Response
				if (Exit.isSuccess(exit)) {
					return Response.json({ success: true, ...exit.value });
				} else {
					const error =
						exit.cause._tag === "Fail" ? exit.cause.error : exit.cause;
					console.error("[Cron Sync Critical Error]:", error);

					return Response.json(
						{
							success: false,
							error:
								error instanceof Data.TaggedError
									? error
									: "Unknown Execution Error",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
