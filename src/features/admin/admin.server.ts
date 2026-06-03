// admin.server.ts

import { eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import { db } from "#/drizzle/db";
import { bot } from "#/drizzle/schema";
import { fetchJsonEffect, runEffect } from "#/lib/effect-utils";
import type { ActionResult } from "#/types/admin";

/**
 * 將 Drizzle query 包裝為 Effect，並將捕捉到的錯誤轉換為 typed failures
 */
export const fromDrizzle = <A>(query: () => Promise<A>) =>
	Effect.tryPromise({
		try: query,
		catch: (e) => new Error(e instanceof Error ? e.message : "資料庫操作失敗"),
	});

/**
 * 執行 Effect 並將結果轉換為 ActionResult 格式
 */
export const toResult = <A>(
	effect: Effect.Effect<A, Error>,
): Promise<ActionResult<A>> =>
	pipe(
		effect,
		Effect.match({
			onSuccess: (data) => ({ success: true as const, data }),
			onFailure: (e) => ({ success: false as const, error: e.message }),
		}),
		Effect.runPromise,
	);

export const fetchAndUpdateServerCount = async (botId: string) => {
	try {
		const resultData = await runEffect(
			fetchJsonEffect("https://getbotserver.dawngs.top/get_bot_server_count", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ bot_id: botId }),
				signal: AbortSignal.timeout(180000),
			}),
		);

		let serverCount: number | null = null;
		if (Array.isArray(resultData)) {
			const found = resultData.find(
				(item) => typeof item?.server_count === "number",
			);
			if (found) serverCount = found.server_count;
		} else if (typeof (resultData as any)?.server_count === "number") {
			serverCount = (resultData as any).server_count;
		}

		if (serverCount !== null) {
			await db
				.update(bot)
				.set({ servers: serverCount })
				.where(eq(bot.id, botId));
			console.log(`✅ 成功更新伺服器數量 (Bot: ${botId}): ${serverCount}`);
		} else {
			console.warn(`⚠️ 返回資料中找不到有效的 server_count (Bot: ${botId})`);
		}
	} catch (error: any) {
		if (error.name === "TimeoutError") {
			console.warn(`⏳ 請求超時 (Bot: ${botId}): 已超過 3 分鐘`);
		} else {
			console.warn(`❌ 背景更新伺服器數量失敗 (Bot: ${botId}):`, error.message);
		}
	}
};
