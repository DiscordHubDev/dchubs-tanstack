// admin.functions.ts

import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import { db } from "#/drizzle/db";
import { bot, notification, report, server } from "#/drizzle/schema";
import { adminMiddleware } from "#/lib/auth-middleware";
import {
	effectInputValidator,
	fetchJsonEffect,
	runEffect,
} from "#/lib/effect-utils";
import type { ActionResult, ReportStatus } from "#/types/admin";
import {
	BotIdSchema,
	RejectBotSchema,
	ReviewBotSchema,
	ServerGuildIdSchema,
	UpdateReportSchema,
} from "./admin.schemas";
import {
	fetchAndUpdateServerCount,
	fromDrizzle,
	toResult,
} from "./admin.server";
import { sendDiscordWebhookFn } from "./webhook.functions";

export interface SendNotificationParams {
	subject: string;
	teaser?: string;
	content: string;
	priority?: "info" | "warning" | "error" | "success";
	userIds: string[];
}

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

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
	.middleware([adminMiddleware])
	.inputValidator((data: { botId: string }) => data)
	.handler(async ({ data }) => {
		fetchAndUpdateServerCount(data.botId);
		return { success: true, message: "已在背景處理" };
	});

export const adminGetAllBots = createServerFn({ method: "GET" })
	.middleware([adminMiddleware])
	.handler(() =>
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
export const adminGetAllServers = createServerFn({ method: "GET" })
	.middleware([adminMiddleware])
	.handler(() =>
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
export const getReports = createServerFn({ method: "GET" })
	.middleware([adminMiddleware])
	.handler(() =>
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
	.middleware([adminMiddleware])
	.inputValidator(effectInputValidator(ReviewBotSchema))
	.handler(async ({ data }) => {
		const result = await toResult(
			fromDrizzle(async () => {
				// 先執行更新動作
				await db
					.update(bot)
					.set({
						status: data.status,
						rejectionReason: data.rejectionReason ?? null,
						approvedAt:
							data.status === "approved" ? new Date().toISOString() : null,
					})
					.where(eq(bot.id, data.id));

				// 統一在這邊撈出最新狀態，並同時 join 開發者資訊
				return await db.query.bot.findFirst({
					where: eq(bot.id, data.id),
					with: {
						developers: {
							with: {
								user: true,
							},
						},
					},
				});
			}),
		);

		if (!result.success || !result.data) {
			throw new Error(`審核更新失敗: ${result.error || "找不到該機器人資料"}`);
		}

		const app = result.data;

		// 2. 如果是「核准」，在伺服器端背景觸發其他通知與任務 (Fire-and-forget)
		if (data.status === "approved") {
			const developersList = app.developers || [];
			const devIds = developersList.map((d) => d.b);

			// A. 發送私訊通知 (使用 external function)
			sendNotification({
				subject: "您的機器人申請已通過 ✅",
				teaser: `${app.name} 已通過審核`,
				content: `您好！機器人「${app.name}」已核准上架，感謝您的耐心等待。`,
				priority: "success",
				userIds: devIds,
			}).catch((e) =>
				console.error(`[Discord 私訊通知失敗] BotID: ${app.id}, Error:`, e),
			);

			// B. 發送 Discord 群組 Webhook 通知
			sendDiscordWebhookFn({
				data: {
					_tag: "approvedBot",
					bot: {
						id: app.id,
						name: app.name,
						prefix: app.prefix,
						description: app.description ?? "",
						inviteUrl: app.inviteUrl ?? "",
						tags: app.tags ?? [],
						icon: app.icon,
						banner: app.banner,
						developers: developersList.map((d) => ({
							id: d.b,
							username: d.user?.username || "未知",
						})),
					},
				},
			})
				.then((res) => {
					if (!res?.success) {
						console.warn(
							`[Webhook 處理失敗] BotID: ${app.id}, Reason:`,
							res?.error,
						);
					}
				})
				.catch((e) =>
					console.error(`[Webhook 發送異常] BotID: ${app.id}, Error:`, e),
				);

			// C. 觸發背景更新伺服器數量任務
			fetchAndUpdateServerCount(app.id);
		}

		return { success: true };
	});

/** Delete a bot by id */
export const deleteBot = createServerFn({ method: "POST" })
	.middleware([adminMiddleware])
	.inputValidator(effectInputValidator(BotIdSchema))
	.handler(
		({ data }): Promise<ActionResult> =>
			toResult(fromDrizzle(() => db.delete(bot).where(eq(bot.id, data.id)))),
	);

/** Delete a server by guild id */
export const deleteServer = createServerFn({ method: "POST" })
	.middleware([adminMiddleware])
	.inputValidator(effectInputValidator(ServerGuildIdSchema))
	.handler(
		({ data }): Promise<ActionResult> =>
			toResult(
				fromDrizzle(() => db.delete(server).where(eq(server.id, data.guildId))),
			),
	);

/** Update a report */
export const updateReport = createServerFn({ method: "POST" })
	.middleware([adminMiddleware])
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
})
	.middleware([adminMiddleware])
	.handler(
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
	.middleware([adminMiddleware])
	.inputValidator(effectInputValidator(RejectBotSchema))
	.handler(async ({ data, context }) => {
		const { botId, reason } = data;

		// 1. Verify Admin Permissions
		const user = context.user;
		if (!context.edgeContext.isAdmin || !user.discordId) {
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

export const resolveReportServerFn = createServerFn({ method: "POST" })
	.middleware([adminMiddleware])
	.inputValidator(
		(data: {
			reportId: string;
			status: ReportStatus;
			resolutionNote: string;
		}) => data,
	)
	.handler(async ({ data, context }) => {
		const { reportId, status, resolutionNote } = data;
		const handledById = context.user.discordId;

		const [updated] = await db
			.update(report)
			.set({
				status: status,
				resolutionNote: resolutionNote,
				handledById,
				handledAt: new Date().toISOString(),
			})
			.where(eq(report.id, reportId))
			.returning();

		return {
			...updated,
			attachments: updated.attachments as string[],
		};
	});
