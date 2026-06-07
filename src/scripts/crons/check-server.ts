// scripts/check-server.ts
import { inArray } from "drizzle-orm";
import { Data, Effect } from "effect";
import { db } from "#/drizzle/db";
import { server } from "#/drizzle/schema";

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

interface DiscordUserGuild {
	id: string;
	name: string;
	icon: string;
	owner: boolean;
	permissions: string;
	features: string[];
}

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

		return { deletedCount, deletedIds: toDelete };
	});

// ─── 執行進入點 ───
const botToken = process.env.DISCORD_BOT_TOKEN;
if (!botToken) {
	console.error("❌ 找不到環境變數 DISCORD_BOT_TOKEN");
	process.exit(1);
}

Effect.runPromiseExit(syncServersProgram(botToken)).then((exit) => {
	if (exit._tag === "Success") {
		console.log("🎉 同步完成:", exit.value);
		process.exit(0);
	} else {
		console.error("❌ 同步發生錯誤:", exit.cause);
		process.exit(1);
	}
});
