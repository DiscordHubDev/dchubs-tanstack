// admin.functions.ts

import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import { db } from "#/drizzle/db";
import { bot, report, server } from "#/drizzle/schema";
import { requireDomainUser } from "#/lib/edge-context";
import { effectInputValidator } from "#/lib/effect-utils";
import type { ReportStatus } from "#/types/admin";
import {
	BotIdSchema,
	ReviewBotSchema,
	ServerGuildIdSchema,
	UpdateReportSchema,
} from "./admin.schemas";
import type { ActionResult } from "./admin.types";

interface SendNotificationParams {
	subject: string;
	teaser?: string;
	content: string;
	priority?: "info" | "warning" | "error" | "success";
	userIds: string[]; // 改回用戶 ID
}

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

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

export async function resolveReport({
	reportId,
	status,
	resolutionNote,
}: {
	reportId: string;
	status: ReportStatus;
	resolutionNote: string;
}) {
	const { context, user } = await requireDomainUser();
	if (!context.isAdmin || !user.discordId) {
		throw new Error("未登入或無管理權限");
	}

	// 核心修正：使用 db.update()
	const [updated] = await db
		.update(report)
		.set({
			status: status,
			resolutionNote: resolutionNote,
			handledById: user.discordId,
			handledAt: new Date().toISOString(),
		})
		.where(eq(report.id, reportId))
		.returning();

	return updated;
}

/**
 * 步驟一：透過 User ID 獲取或建立 DM Channel ID
 */
async function getDmChannelId(userId: string): Promise<string> {
	const response = await fetch(
		"https://discord.com/api/v10/users/@me/channels",
		{
			method: "POST",
			headers: {
				Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ recipient_id: userId }),
		},
	);

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(
			`無法為用戶 ${userId} 建立私訊通道: ${response.status} - ${errorText}`,
		);
	}

	const data = (await response.json()) as { id: string };
	return data.id;
}

/**
 * 主函式：發送私訊通知
 */
export async function sendNotification({
	subject,
	teaser,
	content,
	priority = "info",
	userIds = [],
}: SendNotificationParams) {
	if (!DISCORD_BOT_TOKEN) {
		throw new Error("Missing DISCORD_BOT_TOKEN environment variable");
	}

	if (userIds.length === 0) {
		return { success: true, message: "No users provided" };
	}

	// 定義通知顏色
	const colorMap = {
		info: 3447003,
		warning: 15105570,
		error: 15158332,
		success: 3066993,
	};

	const payload = {
		embeds: [
			{
				title: subject,
				description: `${teaser ? `**${teaser}**\n\n` : ""}${content}`,
				color: colorMap[priority],
				timestamp: new Date().toISOString(),
			},
		],
	};

	const tasks = userIds.map(async (userId) => {
		const dmChannelId = await getDmChannelId(userId);
		const response = await fetch(
			`https://discord.com/api/v10/channels/${dmChannelId}/messages`,
			{
				method: "POST",
				headers: {
					Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			},
		);

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(
				`無法發送私訊給用戶 ${userId}: ${response.status} - ${errorText}`,
			);
		}

		return userId;
	});

	// 使用 allSettled 確保個別用戶發送失敗（例如關閉私訊功能）時，不影響其他人
	const results = await Promise.allSettled(tasks);

	// 整理結果
	const failures = results.filter(
		(r) => r.status === "rejected",
	) as PromiseRejectedResult[];

	if (failures.length > 0) {
		// biome-ignore lint/suspicious/useIterableCallbackReturn: 只需要 log 失敗的用戶 ID 和錯誤訊息，並不需要回傳給前端
		failures.forEach((f) => console.error("Discord DM Error:", f.reason));
		if (failures.length === userIds.length) {
			throw new Error("All Discord DM notification requests failed.");
		}
	}

	return {
		success: true,
		totalSent: userIds.length - failures.length,
		failedCount: failures.length,
	};
}

export async function updateBotServerCountBackground(botId: string) {
	"use server";

	const fetchTask = async () => {
		try {
			const response = await fetch(
				"https://getbotserver.dawngs.top/get_bot_server_count",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ bot_id: botId }),
					// 確保 Playwright 有足夠時間重試 (3 分鐘)
					signal: AbortSignal.timeout(180000),
				},
			);

			if (!response.ok) {
				console.warn(
					`⚠️ 獲取伺服器數量失敗 (Bot: ${botId}): HTTP ${response.status} - ${response.statusText}`,
				);
				return;
			}

			const data = await response.json();

			let serverCount: number | null = null;
			if (Array.isArray(data)) {
				const found = data.find(
					(item) => typeof item?.server_count === "number",
				);
				if (found) serverCount = found.server_count;
			} else if (typeof data?.server_count === "number") {
				serverCount = data.server_count;
			}

			if (serverCount !== null) {
				// ✨ 使用 Drizzle ORM 更新資料庫
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
				console.warn(
					`❌ 背景更新伺服器數量失敗 (Bot: ${botId}):`,
					error.message,
				);
			}
		}
	};

	// ✅ 在 VPS (Node.js 原生環境) 中，直接呼叫且不 await 即可實現背景執行
	// 注意：如果是 Next.js 15，官方建議改用 `unstable_after(fetchTask)`
	fetchTask();

	// 立即返回 API 回應，不阻塞前端
	return { success: true, message: "已在背景處理" };
}

export const adminGetAllBots = createServerFn({ method: "GET" }).handler(() =>
	toResult(
		fromDrizzle(() =>
			db.query.bot.findMany({
				with: { developers: { with: { user: true } } },
				orderBy: [desc(bot.createdAt)],
			}),
		),
	),
);

/** Fetch all servers */
export const adminGetAllServers = createServerFn({ method: "GET" }).handler(
	() =>
		toResult(
			fromDrizzle(() =>
				db.query.server.findMany({
					with: { owner: true, admins: { with: { user: true } } },
					orderBy: [desc(server.createdAt)],
				}),
			),
		),
);

/** Fetch all reports */
export const getReports = createServerFn({ method: "GET" }).handler(() =>
	toResult(
		fromDrizzle(() =>
			db.query.report.findMany({
				with: {
					reportedBy: true,
					handledBy: true,
					attachments: true,
				},
				orderBy: [desc(report.reportedAt)],
			}),
		),
	),
);

/** Approve or reject a bot application */
export const reviewBot = createServerFn({ method: "POST" })
	.inputValidator(effectInputValidator(ReviewBotSchema))
	.handler(
		({ data }): Promise<ActionResult> =>
			toResult(
				fromDrizzle(() =>
					db
						.update(bot)
						.set({
							status: data.status,
							rejectionReason: data.rejectionReason ?? null,
							approvedAt:
								data.status === "approved" ? new Date().toISOString() : null,
						})
						.where(eq(bot.id, data.id)),
				),
			),
	);

/** Delete a bot by id */
export const deleteBot = createServerFn({ method: "POST" })
	.inputValidator(effectInputValidator(BotIdSchema))
	.handler(
		({ data }): Promise<ActionResult> =>
			toResult(fromDrizzle(() => db.delete(bot).where(eq(bot.id, data.id)))),
	);

/** Delete a server by guild id */
export const deleteServer = createServerFn({ method: "POST" })
	.inputValidator(effectInputValidator(ServerGuildIdSchema))
	.handler(
		({ data }): Promise<ActionResult> =>
			toResult(
				fromDrizzle(() => db.delete(server).where(eq(server.id, data.guildId))),
			),
	);

export const updateReport = createServerFn({ method: "POST" })
	.inputValidator(effectInputValidator(UpdateReportSchema))
	.handler(
		({ data }): Promise<ActionResult> =>
			toResult(
				fromDrizzle(() =>
					db
						.update(report)
						.set({
							...(data.status && {
								status: data.status,
								handledAt:
									data.status !== "pending" ? new Date().toISOString() : null,
							}),
							...(data.severity && { severity: data.severity }),
						})
						.where(eq(report.id, data.reportId)),
				),
			),
	);

/** Fetch pending bots count + reports count — used for SSR badge hydration */
export const adminGetDashboardCounts = createServerFn({
	method: "GET",
}).handler(
	async (): Promise<
		ActionResult<{ pendingBots: number; pendingReports: number }>
	> =>
		toResult(
			pipe(
				Effect.all({
					pendingBots: fromDrizzle(async () => {
						const rows = await db.query.bot.findMany({
							where: eq(bot.status, "pending"),
							columns: { id: true },
						});
						return rows.length;
					}),
					pendingReports: fromDrizzle(async () => {
						const rows = await db.query.report.findMany({
							where: eq(report.status, "pending"),
							columns: { id: true },
						});
						return rows.length;
					}),
				}),
			),
		),
);
