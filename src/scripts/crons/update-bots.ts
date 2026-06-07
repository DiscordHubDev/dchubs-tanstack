// scripts/update-bots.ts
import { eq } from "drizzle-orm";
import { Data, Effect, Array as EffectArray, Option } from "effect";
import { db } from "#/drizzle/db";
import { bot } from "#/drizzle/schema";
import { getDiscordRPCWithMember } from "#/features/api/api.function";

const BOT_PROCESS_DELAY_MS = 3000;
const DB_BATCH_WRITE_SIZE = 20;

type BotRow = Pick<
	typeof bot.$inferSelect,
	"id" | "name" | "icon" | "banner" | "verified"
>;
type BotUpdateSet = Pick<
	Partial<typeof bot.$inferInsert>,
	"servers" | "name" | "icon" | "banner" | "verified"
>;
type PendingUpdate = { id: string; data: BotUpdateSet };

class BotUpdateError extends Data.TaggedError("BotUpdateError")<{
	readonly botId: string;
	readonly message: string;
}> {}

// 封裝 RPC 呼叫 (失敗時回傳 Option.none() 而不中斷)
const fetchUpdatedBotInfoEffect = (botId: string) =>
	Effect.tryPromise({
		try: async () => {
			const data = await getDiscordRPCWithMember({
				data: { client_id: botId },
			});
			if (!data) return Option.none();
			return Option.some({
				name: typeof data.name === "string" ? data.name : null,
				avatar_url:
					typeof data.member.avatarUrl === "string"
						? data.member.avatarUrl
						: null,
				banner_url:
					typeof data.member.bannerUrl === "string"
						? data.member.bannerUrl
						: null,
				verified: data.is_verified ?? false,
			});
		},
		catch: (err) =>
			new BotUpdateError({ botId, message: "Discord RPC Fetch Failed" }),
	}).pipe(
		Effect.catchAll((err) => {
			console.warn(`⚠️ 無法取得 ${botId} 的 Discord 官方資訊`);
			return Effect.succeed(Option.none());
		}),
	);

// 封裝 Server Count 呼叫 (失敗時回傳 Option.none())
const fetchBotServerCountEffect = (botId: string) =>
	Effect.tryPromise({
		try: async () => {
			const res = await fetch(
				`https://getbotserver.dawngs.top/get_bot_server_count`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ bot_id: botId }),
					signal: AbortSignal.timeout(90_000),
				},
			);
			if (res.status === 524 || res.status === 429 || !res.ok) {
				return Option.none();
			}
			const data = await res.json();
			const count = Array.isArray(data)
				? data.find((item) => typeof item.server_count === "number")
						?.server_count
				: typeof data?.server_count === "number"
					? data.server_count
					: null;
			return count != null ? Option.some(count) : Option.none();
		},
		catch: (err) =>
			new BotUpdateError({ botId, message: "Server Count Fetch Failed" }),
	}).pipe(
		Effect.catchAll((err) => {
			console.error(`❌ ${botId} 獲取 Server count 發生錯誤`);
			return Effect.succeed(Option.none());
		}),
	);

const flushUpdatesEffect = (pending: PendingUpdate[]) =>
	Effect.tryPromise({
		try: async () => {
			if (pending.length === 0) return;
			await db.transaction(async (tx) => {
				for (const { id, data } of pending) {
					await tx.update(bot).set(data).where(eq(bot.id, id));
				}
			});
			console.log(`💾 批次寫入 ${pending.length} 筆到資料庫`);
		},
		catch: (err) => new Error("Database Transaction Failed"),
	});

const updateBotsProgram = Effect.gen(function* () {
	const isDev = process.env.NODE_ENV === "development";
	let query = db
		.select({
			id: bot.id,
			name: bot.name,
			icon: bot.icon,
			banner: bot.banner,
			verified: bot.verified,
		})
		.from(bot)
		.where(eq(bot.status, "approved"));

	if (isDev) query = query.limit(1) as any;

	const bots: BotRow[] = yield* Effect.tryPromise(() => query);
	console.log(
		`📋 [背景任務] ${isDev ? "🛠️ [開發模式]" : ""} 共需處理 ${bots.length} 個 bots`,
	);

	// 將 Bots 切割成每批次大小 (DB_BATCH_WRITE_SIZE)
	const chunks = EffectArray.chunksOf(bots, DB_BATCH_WRITE_SIZE);

	for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
		const chunk = chunks[chunkIdx];
		const pendingUpdates: PendingUpdate[] = [];

		for (let i = 0; i < chunk.length; i++) {
			const current = chunk[i];
			console.log(`\n🔄 處理 ${current.name} (${current.id})`);

			const infoOpt = yield* fetchUpdatedBotInfoEffect(current.id);
			const countOpt = yield* fetchBotServerCountEffect(current.id);

			const data: BotUpdateSet = {};
			if (Option.isSome(countOpt)) data.servers = countOpt.value;
			if (Option.isSome(infoOpt)) {
				data.name = infoOpt.value.name ?? current.name;
				data.icon = infoOpt.value.avatar_url ?? current.icon;
				data.banner = infoOpt.value.banner_url ?? current.banner;
				data.verified = infoOpt.value.verified;
			}

			if (Object.keys(data).length > 0) {
				pendingUpdates.push({ id: current.id, data });
			}

			// 單線程延遲，避免 Python 後端過載
			if (i < chunk.length - 1 || chunkIdx < chunks.length - 1) {
				yield* Effect.sleep(`${BOT_PROCESS_DELAY_MS} millis`);
			}
		}
		// 批次寫入 DB
		yield* flushUpdatesEffect(pendingUpdates);
	}
	console.log("🎉 [背景任務] 全部 Bot 更新完畢！");
});

// ─── 執行進入點 ───
Effect.runPromiseExit(updateBotsProgram).then((exit) => {
	if (exit._tag === "Failure") {
		console.error("❌ 執行發生錯誤:", exit.cause);
		process.exit(1);
	}
	process.exit(0);
});
