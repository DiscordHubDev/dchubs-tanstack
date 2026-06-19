// scripts/check-server.ts
import { inArray } from "drizzle-orm";
import { Data, Duration, Effect } from "effect";
import { client, db } from "#/drizzle/db";
import { server, user } from "#/drizzle/schema";

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

class DiscordGuildDetailError extends Data.TaggedError(
	"DiscordGuildDetailError",
)<{
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

// ─── new Discord API shapes ───
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
	email: string;
	banner: string | null;
	accent_color: number | null;
}

const DISCORD_REQUEST_CONCURRENCY = 3; // tune down if you still see 429s
const MAX_RATE_LIMIT_RETRIES = 5;

const getBotGuildIdsEffect = (botToken: string) =>
	Effect.tryPromise({
		try: async () => {
			const res = await fetch("https://discord.com/api/v10/users/@me/guilds", {
				headers: {
					Authorization: `Bot ${botToken}`,
					"Content-Type": "application/json",
				},
			});
			if (!res.ok) throw new Error(`Discord API Error: ${res.status}`);
			const guilds = (await res.json()) as DiscordUserGuild[];
			return guilds.map((guild) => guild.id);
		},
		catch: (error: any) =>
			new DiscordApiError({
				message: error?.message || "Failed to fetch guilds from Discord API",
				status: error?.status || 500,
			}),
	});

const getAllServerIdsChunkedEffect = () =>
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

const deleteServersEffect = (toDeleteIds: string[]) =>
	Effect.tryPromise({
		try: async () => {
			const deleteResult = await db
				.delete(server)
				.where(inArray(server.id, toDeleteIds));

			return (
				(deleteResult as any).rowCount ??
				(deleteResult as any).rowsAffected ??
				(deleteResult as any).length ??
				toDeleteIds.length
			);
		},
		catch: (error: any) =>
			new DbDeleteError({
				message: error?.message || "Failed to delete servers",
			}),
	});

// ─── fetch the owner_id of a guild ───
const fetchDiscordJson = (
	url: string,
	botToken: string,
	attempt = 1,
): Effect.Effect<any, Error> =>
	Effect.gen(function* () {
		const res = yield* Effect.tryPromise({
			try: () => fetch(url, { headers: { Authorization: `Bot ${botToken}` } }),
			catch: (error: any) => new Error(error?.message || "Network error"),
		});

		if (res.status === 429) {
			if (attempt > MAX_RATE_LIMIT_RETRIES) {
				return yield* Effect.fail(
					new Error(`Rate limited too many times: ${url}`),
				);
			}
			const body = yield* Effect.tryPromise({
				try: () => res.json().catch(() => ({}) as any),
				catch: () => new Error("Failed to parse rate limit body"),
			});
			const retryAfterSeconds =
				Number(res.headers.get("retry-after")) || body?.retry_after || 1;
			console.warn(
				`⏳ Discord rate limited，等待 ${retryAfterSeconds}s 後重試 (第 ${attempt} 次): ${url}`,
			);
			yield* Effect.sleep(Duration.seconds(retryAfterSeconds));
			return yield* fetchDiscordJson(url, botToken, attempt + 1);
		}

		if (!res.ok) {
			return yield* Effect.fail(
				new Error(`Discord API Error (${res.status}): ${url}`),
			);
		}

		return yield* Effect.tryPromise({
			try: () => res.json(),
			catch: (error: any) =>
				new Error(error?.message || "Failed to parse JSON"),
		});
	});

// ─── fetch the owner_id of a guild ───
const getGuildOwnerIdEffect = (guildId: string, botToken: string) =>
	fetchDiscordJson(
		`https://discord.com/api/v10/guilds/${guildId}`,
		botToken,
	).pipe(
		Effect.map((guild: DiscordGuildDetail) => guild.owner_id),
		Effect.mapError(
			(error) =>
				new DiscordGuildDetailError({
					message: error.message,
					guildId,
				}),
		),
	);

// ─── fetch a Discord user's profile ───
const getDiscordUserEffect = (userId: string, botToken: string) =>
	fetchDiscordJson(
		`https://discord.com/api/v10/users/${userId}`,
		botToken,
	).pipe(
		Effect.map((u) => u as DiscordUser),
		Effect.mapError(
			(error) =>
				new DiscordUserFetchError({
					message: error.message,
					userId,
				}),
		),
	);

const buildAvatarUrl = (discordUser: DiscordUser) =>
	discordUser.avatar
		? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.${
				discordUser.avatar.startsWith("a_") ? "gif" : "png"
			}`
		: "https://cdn.discordapp.com/embed/avatars/0.png";

const buildBannerUrl = (discordUser: DiscordUser) =>
	discordUser.banner
		? `https://cdn.discordapp.com/banners/${discordUser.id}/${discordUser.banner}.${
				discordUser.banner.startsWith("a_") ? "gif" : "png"
			}`
		: null;

// ─── upsert: update if discordId exists, otherwise insert a stub row ───
const upsertOwnerProfileEffect = (discordUser: DiscordUser) =>
	Effect.tryPromise({
		try: async () => {
			const displayName = discordUser.global_name ?? discordUser.username;
			const avatarUrl = buildAvatarUrl(discordUser);
			const bannerUrl = buildBannerUrl(discordUser);

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
		catch: (error: any) =>
			new UserUpdateError({
				message: error?.message || `Failed to upsert user ${discordUser.id}`,
			}),
	});

// ─── combine: guild -> owner_id -> profile -> db update ───
// Failures here are logged and skipped rather than aborting the whole sync,
// since one bad guild/user fetch shouldn't kill the run.
const syncGuildOwnerEffect = (guildId: string, botToken: string) =>
	Effect.gen(function* () {
		const ownerId = yield* getGuildOwnerIdEffect(guildId, botToken);
		const discordUser = yield* getDiscordUserEffect(ownerId, botToken);
		yield* upsertOwnerProfileEffect(discordUser);
		return { guildId, ownerId };
	}).pipe(
		Effect.catchAll((error) =>
			Effect.sync(() => {
				console.warn(
					`⚠️ 無法同步伺服器 ${guildId} 的擁有者資訊: ${error.message}`,
				);
				return null;
			}),
		),
	);

const syncServersProgram = (botToken: string) =>
	Effect.gen(function* () {
		console.log("🔍 開始檢查 Bot 伺服器狀態...");
		const botGuildIds = yield* getBotGuildIdsEffect(botToken);
		const allPublishedIds = yield* getAllServerIdsChunkedEffect();

		const toDelete = allPublishedIds.filter((id) => !botGuildIds.includes(id));

		let deletedCount = 0;
		if (toDelete.length > 0) {
			console.log(`🗑️ 發現 ${toDelete.length} 個需要刪除的伺服器，執行刪除...`);
			deletedCount = yield* deleteServersEffect(toDelete);
		} else {
			console.log("✅ 沒有需要清理的伺服器。");
		}

		// 同步剩餘伺服器的擁有者資訊
		const remainingIds = botGuildIds.filter((id) =>
			allPublishedIds.includes(id),
		);
		console.log(`👤 開始同步 ${remainingIds.length} 個伺服器的擁有者資訊...`);
		const ownerSyncResults = yield* Effect.forEach(
			remainingIds,
			(id) => syncGuildOwnerEffect(id, botToken),
			{ concurrency: DISCORD_REQUEST_CONCURRENCY },
		);
		const ownerSyncedCount = ownerSyncResults.filter((r) => r !== null).length;
		console.log(
			`✅ 成功同步 ${ownerSyncedCount}/${remainingIds.length} 個擁有者資訊。`,
		);

		return { deletedCount, deletedIds: toDelete, ownerSyncedCount };
	});

// ─── 執行進入點 ───
const botToken = process.env.DISCORD_BOT_TOKEN;
if (!botToken) {
	console.error("❌ 找不到環境變數 DISCORD_BOT_TOKEN");
	process.exit(1);
}

Effect.runPromiseExit(syncServersProgram(botToken)).then((exit) => {
	// 💡 腳本準備結束，主動關閉連線池
	console.log("🔌 正在關閉資料庫連線池...");
	client.close();

	if (exit._tag === "Success") {
		console.log("🎉 同步完成:", exit.value);
		process.exit(0);
	} else {
		console.error("❌ 同步發生錯誤:", exit.cause);
		process.exit(1);
	}
});
