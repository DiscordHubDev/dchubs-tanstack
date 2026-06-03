import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { db } from "#/drizzle/db";
import { bot } from "#/drizzle/schema";
import { getDiscordRPCWithMember } from "#/features/api/api.function";

// ─── Constants ───────────────────────────────────────────────────────────────

const BOT_PROCESS_DELAY_MS = 3_000;
const DB_BATCH_WRITE_SIZE = 20;

// ─── Types ───────────────────────────────────────────────────────────────────

/** Only the columns we actually read/compare during processing */
type BotRow = Pick<
	typeof bot.$inferSelect,
	"id" | "name" | "icon" | "banner" | "verified"
>;

/** Drizzle-typed set payload — guarantees type safety for every column we touch */
type BotUpdateSet = Pick<
	Partial<typeof bot.$inferInsert>,
	"servers" | "name" | "icon" | "banner" | "verified"
>;

type PendingUpdate = {
	id: string;
	data: BotUpdateSet;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const sleep = (ms: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, ms));

async function fetchUpdatedBotInfo(botId: string): Promise<{
	global_name: string | null;
	avatar_url: string | null;
	banner_url: string | null;
	verified: boolean;
} | null> {
	try {
		const data = await getDiscordRPCWithMember({ data: { client_id: botId } });
		if (!data) {
			console.warn(`⚠️ 無法取得 ${botId} 的 Discord 官方資訊`);
			return null;
		}
		return {
			global_name: typeof data.name === "string" ? data.name : null,
			avatar_url:
				typeof data.member.avatarUrl === "string"
					? data.member.avatarUrl
					: null,
			banner_url:
				typeof data.member.bannerUrl === "string"
					? data.member.bannerUrl
					: null,
			verified: data.is_verified ?? false,
		};
	} catch (err) {
		console.error(`❌ Discord API 取得 ${botId} 發生錯誤：`, err);
		return null;
	}
}

async function fetchBotServerCount(botId: string): Promise<number | null> {
	try {
		const res = await fetch(
			`https://getbotserver.dawngs.top/get_bot_server_count`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ bot_id: botId }),
				signal: AbortSignal.timeout(90_000),
			},
		);

		if (res.status === 524) {
			console.warn(`⚠️ ${botId} Cloudflare 524 超時`);
			return null;
		}
		if (res.status === 429) {
			console.warn(`⚠️ ${botId} 速率限制 (429)`);
			return null;
		}
		if (!res.ok) {
			console.error(
				`❌ 無法取得 ${botId} 的 server count (status: ${res.status})`,
			);
			return null;
		}

		const data = await res.json();
		const count = Array.isArray(data)
			? data.find((item) => typeof item.server_count === "number")?.server_count
			: typeof data?.server_count === "number"
				? data.server_count
				: null;

		return count ?? null;
	} catch (err: any) {
		const isTimeout = err.name === "TimeoutError" || err.name === "AbortError";
		console.error(
			isTimeout
				? `❌ ${botId} Python API 請求超時 (90s)`
				: `❌ ${botId} 發生網路錯誤：${err.message}`,
		);
		return null;
	}
}

/**
 * Builds a type-safe Drizzle set payload.
 * Returns null when there is nothing to update (avoids unnecessary DB calls).
 *
 * Fallback priority: fresh API value → existing DB value → omit the key
 */
function buildUpdateData(
	current: BotRow,
	info: Awaited<ReturnType<typeof fetchUpdatedBotInfo>>,
	serverCount: number | null,
): BotUpdateSet | null {
	const data: BotUpdateSet = {};

	if (serverCount !== null) data.servers = serverCount;

	if (info) {
		// Only overwrite when the API gave us a non-null value; fall back to DB row
		data.name = info.global_name ?? current.name;
		data.icon = info.avatar_url ?? current.icon;
		data.banner = info.banner_url ?? current.banner;
		data.verified = info.verified;
	}

	return Object.keys(data).length > 0 ? data : null;
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

/**
 * Flush a batch of pending updates inside a single transaction.
 * Using a transaction (vs. N individual round-trips) drastically reduces
 * DB latency and contention when processing large bot lists.
 */
async function flushUpdates(pending: PendingUpdate[]): Promise<void> {
	if (pending.length === 0) return;

	await db.transaction(async (tx) => {
		// Sequential inside the transaction — Drizzle on pg processes them on the
		// same connection, so we avoid statement-level lock contention.
		for (const { id, data } of pending) {
			await tx.update(bot).set(data).where(eq(bot.id, id));
		}
	});

	console.log(`💾 批次寫入 ${pending.length} 筆到資料庫`);
}

// ─── Core background task ────────────────────────────────────────────────────

async function runBackgroundCronTask(): Promise<void> {
	try {
		const isDev = process.env.NODE_ENV === "development";

		/**
		 * Optimized fetch: select only the 5 columns we actually need.
		 * Dev mode check: limit to 1 row if we're in development to speed up testing.
		 */
		const query = db
			.select({
				id: bot.id,
				name: bot.name,
				icon: bot.icon,
				banner: bot.banner,
				verified: bot.verified,
			})
			.from(bot)
			.where(eq(bot.status, "approved"));

		// 🌟 如果是開發環境，加上 .limit(1) 限制
		if (isDev) {
			query.limit(1);
		}

		const bots: BotRow[] = await query;

		console.log(
			`📋 [背景任務] ${isDev ? "🛠️ [開發模式]" : ""} 共需處理 ${bots.length} 個 bots`,
		);

		const pendingUpdates: PendingUpdate[] = [];

		for (let i = 0; i < bots.length; i++) {
			const current = bots[i];
			console.log(
				`\n🔄 [${i + 1}/${bots.length}] 處理 ${current.name} (${current.id})`,
			);

			// Discord info & server count fetched sequentially to respect
			// the Python backend's single-thread constraint.
			const info = await fetchUpdatedBotInfo(current.id);
			if (info) console.log(`✅ ${current.name} Discord info 已取得`);

			const serverCount = await fetchBotServerCount(current.id);
			if (serverCount !== null) {
				console.log(`✅ ${current.name} Server count: ${serverCount}`);
			} else {
				console.log(`⚠️ ${current.name} Server count 獲取失敗，保留舊資料`);
			}

			const updateData = buildUpdateData(current, info, serverCount);
			if (updateData) {
				pendingUpdates.push({ id: current.id, data: updateData });
			}

			/**
			 * Write in DB_BATCH_WRITE_SIZE-sized chunks rather than one giant
			 * transaction at the very end — gives us durability throughout the run
			 * while still cutting DB round-trips by ~20× vs. per-bot updates.
			 */
			if (pendingUpdates.length >= DB_BATCH_WRITE_SIZE) {
				await flushUpdates(pendingUpdates.splice(0, DB_BATCH_WRITE_SIZE));
			}

			// Respect rate limits: pause between bots (except after the last one)
			if (i < bots.length - 1) {
				await sleep(BOT_PROCESS_DELAY_MS);
			}
		}

		// Flush whatever remains (< DB_BATCH_WRITE_SIZE)
		await flushUpdates(pendingUpdates);

		console.log("🎉 [背景任務] 全部 Bot 更新完畢！");
	} catch (err) {
		console.error("❌ [背景任務] 執行時發生嚴重錯誤", err);
	}
}

// ─── Route ───────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/api/cron/update-bots")({
	server: {
		handlers: {
			POST: async () => {
				runBackgroundCronTask();
				return Response.json({
					ok: true,
					message: "Cron job accepted and is now running in the background.",
				});
			},
		},
	},
});
