import { createFileRoute } from "@tanstack/react-router";
import { inArray } from "drizzle-orm";
import { Data, Effect } from "effect";
import { db } from "#/drizzle/db";
import { server } from "#/drizzle/schema"; // 確保 schema 名稱一致

// --- 1. 定義明確的 Error 類型 ---
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

// --- 2. Effect 封裝 API 與 DB 操作 ---

// 獲取 Bot 所在的 Guild IDs
export const getBotGuildIdsEffect = (botToken: string) =>
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

// 獲取資料庫中所有的 Server IDs
export const getAllServerIdsChunkedEffect = () =>
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

// 封裝刪除操作的 Effect
const deleteServersEffect = (toDeleteIds: string[]) =>
	Effect.tryPromise({
		try: async () => {
			const deleteResult = await db
				.delete(server)
				.where(inArray(server.id, toDeleteIds));

			// 相容不同資料庫驅動 (Pg/MySQL/SQLite) 的刪除數量統計
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

// --- 3. 主要同步邏輯 (Effect Pipeline) ---
const syncServersProgram = (botToken: string) =>
	Effect.gen(function* () {
		// 循序執行 Effect，若有 Error 會自動中斷並拋給外層
		const botGuildIds = yield* getBotGuildIdsEffect(botToken);
		const allPublishedIds = yield* getAllServerIdsChunkedEffect();

		// 找出需刪除的 ID
		const toDelete = allPublishedIds.filter((id) => !botGuildIds.includes(id));

		let deletedCount = 0;
		if (toDelete.length > 0) {
			deletedCount = yield* deleteServersEffect(toDelete);
		}

		return { deletedCount, deletedIds: toDelete };
	});

// --- 4. TanStack Start API Route ---
export const Route = createFileRoute("/api/cron/check-server")({
	server: {
		handlers: {
			POST: async () => {
				// 從環境變數或 request headers 取得 Token (請根據你的架構調整)
				const botToken = process.env.DISCORD_BOT_TOKEN || "YOUR_BOT_TOKEN";

				// 執行 Effect，並安全地處理 Exit 狀態
				const exit = await Effect.runPromiseExit(syncServersProgram(botToken));

				if (exit._tag === "Success") {
					// 成功時回傳標準 Web Response
					return new Response(JSON.stringify(exit.value), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					});
				}

				// 捕捉所有 Effect 管線中拋出的錯誤 (DiscordApiError, DbFetchError, DbDeleteError)
				console.error("❌ sync error:", exit.cause);

				const errorMessage =
					exit.cause._tag === "Fail" && "message" in exit.cause.error
						? (exit.cause.error as any).message
						: "Internal server error";

				return new Response(JSON.stringify({ error: errorMessage }), {
					status: 500,
					headers: { "Content-Type": "application/json" },
				});
			},
		},
	},
});
