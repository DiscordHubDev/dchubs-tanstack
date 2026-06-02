// admin.functions.ts

import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import { db } from "#/drizzle/db";
import { bot, notification, report, server } from "#/drizzle/schema";
import { getSessionUserIdEffect, requireDomainUser } from "#/lib/edge-context";
import {
	effectInputValidator,
	fetchJsonEffect,
	runEffect,
} from "#/lib/effect-utils";
import type { ActionResult, ReportStatus } from "#/types/admin";
import { createSafeServerFn } from "#/utils/serverFn";
import {
	BotIdSchema,
	RejectBotSchema,
	ReviewBotSchema,
	ServerGuildIdSchema,
	UpdateReportSchema,
} from "./admin.schemas";

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

export const resolveReportServerFn = createServerFn({ method: "POST" })
	// 2. 宣告前端傳進來的參數型別 (Validator)
	.inputValidator(
		(data: {
			reportId: string;
			status: ReportStatus;
			resolutionNote: string;
		}) => data,
	)
	// 3. 原本的邏輯搬進 handler
	.handler(async ({ data }) => {
		const { reportId, status, resolutionNote } = data;

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

		return {
			...updated,
			attachments: updated.attachments as string[],
		};
	});

/**
 * 步驟一：透過 User ID 獲取或建立 DM Channel ID
 */
async function getDmChannelId(userId: string): Promise<string> {
	try {
		// 直接取得 JSON 格式並轉型
		const data = (await runEffect(
			fetchJsonEffect("https://discord.com/api/v10/users/@me/channels", {
				method: "POST",
				headers: {
					Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ recipient_id: userId }),
			}),
		)) as { id: string };

		return data.id;
	} catch (error) {
		// 捕捉 fetchJsonEffect 拋出的錯誤並加上上下文
		const errorMessage = error instanceof Error ? error.message : String(error);
		throw new Error(`無法為用戶 ${userId} 建立私訊通道: ${errorMessage}`);
	}
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

		try {
			await runEffect(
				fetchJsonEffect(
					`https://discord.com/api/v10/channels/${dmChannelId}/messages`,
					{
						method: "POST",
						headers: {
							Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify(payload),
					},
				),
			);

			// 如果成功發送，回傳 userId
			return userId;
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			throw new Error(`無法發送私訊給用戶 ${userId}: ${errorMessage}`);
		}
	});

	// 使用 allSettled 確保個別用戶發送失敗時，不影響其他人
	const results = await Promise.allSettled(tasks);

	// 整理結果
	const failures = results.filter(
		(r) => r.status === "rejected",
	) as PromiseRejectedResult[];

	if (failures.length > 0) {
		// biome-ignore lint/suspicious/useIterableCallbackReturn: 只需要 log 失敗
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

export const updateBotServerCountBackgroundFn = createServerFn({
	method: "POST",
})
	.inputValidator((data: { botId: string }) => data)
	.handler(async ({ data }) => {
		const { botId } = data;

		const fetchTask = async () => {
			try {
				// 1. 使用 runEffect 執行，resultData 直接就是 JSON 物件
				const resultData = await runEffect(
					fetchJsonEffect(
						"https://getbotserver.dawngs.top/get_bot_server_count",
						{
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ bot_id: botId }),
							// 確保 Playwright 有足夠時間重試 (3 分鐘)
							signal: AbortSignal.timeout(180000),
						},
					),
				);

				let serverCount: number | null = null;

				// 2. 直接對 resultData 進行操作
				if (Array.isArray(resultData)) {
					const found = resultData.find(
						(item) => typeof item?.server_count === "number",
					);
					if (found) serverCount = found.server_count;
				} else if (typeof (resultData as any)?.server_count === "number") {
					serverCount = (resultData as any).server_count;
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
				// fetchJsonEffect 失敗時會進到這裡
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
		fetchTask();

		// 立即返回 API 回應，不阻塞前端
		return { success: true, message: "已在背景處理" };
	});

export const getSessionUserIdServerFn = createServerFn({
	method: "GET",
}).handler(async () => {
	try {
		// 在後端「執行」這個 Effect，並等待結果
		const userId = await Effect.runPromise(getSessionUserIdEffect());
		return { success: true, userId };
	} catch (error) {
		// 將 Error 轉成字串傳給前端，因為 Error 物件無法透過網路序列化
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
});

export const adminGetAllBots = createSafeServerFn({ method: "GET" }).handler(
	() =>
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
export const adminGetAllServers = createSafeServerFn({ method: "GET" }).handler(
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
export const getReports = createSafeServerFn({ method: "GET" }).handler(() =>
	toResult(
		fromDrizzle(() =>
			db.query.report.findMany({
				with: {
					reportedBy: true,
					handledBy: true,
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

/** Update a report */
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
export const adminGetDashboardCounts = createSafeServerFn({
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

/**
 * 拒絕機器人申請 (Server Function)
 */
export const rejectBotServerFn = createServerFn({ method: "POST" })
	.inputValidator(effectInputValidator(RejectBotSchema))
	.handler(async ({ data }) => {
		const { botId, reason } = data;

		// 1. Verify Admin Permissions
		const { context, user } = await requireDomainUser();
		if (!context.isAdmin || !user.discordId) {
			throw new Error("未登入或無管理權限");
		}

		// 2. Execute Database Operations inside a Transaction
		const result = await Effect.runPromise(
			Effect.tryPromise({
				try: async () =>
					await db.transaction(async (tx) => {
						// A. Fetch Bot and its associated developers (Secure source of truth)
						const botRecord = await tx.query.bot.findFirst({
							where: eq(bot.id, botId),
							with: { developers: { with: { user: true } } },
						});

						if (!botRecord) {
							throw new Error("BotNotFound");
						}

						// B. Update Bot Status
						await tx
							.update(bot)
							.set({
								status: "rejected",
								rejectionReason: reason,
								handledAt: new Date().toISOString(),
								handledById: user.discordId,
							})
							.where(eq(bot.id, botId));

						// C. Insert In-App Notification Logs
						const devIds = botRecord.developers.map((d) => d.user.id);
						if (devIds.length > 0) {
							await tx.insert(notification).values(
								devIds.map((devId) => ({
									id: crypto.randomUUID(),
									name: "機器人申請狀態更新",
									userId: devId,
									subject: "機器人申請已被拒絕",
									teaser: `您的機器人 "${botRecord.name}" 申請已被拒絕。`,
									content: `拒絕原因：${reason}`,
									priority: "warning" as const,
								})),
							);
						}
						return {
							botName: botRecord.name,
							developerIds: devIds,
						};
					}),
				catch: (error) => {
					if (error instanceof Error && error.message === "BotNotFound") {
						return new Error("BotNotFound");
					}
					return new Error("DatabaseError");
				},
			}).pipe(Effect.mapError((e) => e.message)),
		);

		if (result instanceof Error) {
			throw new Error(result.message);
		}

		// 3. Trigger External Notifications (Non-blocking)
		// Note: In a real environment, we'd use Effect.fork or a queue
		const { botName, developerIds } = result as {
			botName: string;
			developerIds: string[];
		};

		// We don't await this to prevent blocking the response
		sendNotification({
			subject: `機器人申請已被拒絕: ${botName}`,
			teaser: `您的機器人 "${botName}" 申請已被拒絕。`,
			content: `拒絕原因：${reason}`,
			priority: "warning",
			userIds: developerIds,
		}).catch((e) => console.error("Failed to send rejection DMs:", e));

		return { success: true };
	});
