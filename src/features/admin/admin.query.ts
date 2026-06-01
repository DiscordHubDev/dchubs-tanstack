// admin.query.ts

import { desc, eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import { db } from "#/drizzle/db";
import { bot, report, server } from "#/drizzle/schema";
import { fromDrizzle } from "./admin.functions";
import type {
	BotIdPayload,
	ReviewBotPayload,
	ServerGuildIdPayload,
	UpdateReportPayload,
} from "./admin.types";

export const getAllBotsQuery = () =>
	fromDrizzle(() =>
		db.query.bot.findMany({
			with: { developers: { with: { user: true } } },
			orderBy: [desc(bot.createdAt)],
		}),
	);

export const getAllServersQuery = () =>
	fromDrizzle(() =>
		db.query.server.findMany({
			with: { owner: true, admins: { with: { user: true } } },
			orderBy: [desc(server.createdAt)],
		}),
	);

export const getReportsQuery = () =>
	fromDrizzle(() =>
		db.query.report.findMany({
			with: {
				reportedBy: true,
				handledBy: true,
				attachments: true,
			},
			orderBy: [desc(report.reportedAt)],
		}),
	);

export const reviewBotQuery = (data: ReviewBotPayload) =>
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
	);

export const deleteBotQuery = (data: BotIdPayload) =>
	fromDrizzle(() => db.delete(bot).where(eq(bot.id, data.id)));

export const deleteServerQuery = (data: ServerGuildIdPayload) =>
	fromDrizzle(() => db.delete(server).where(eq(server.id, data.guildId)));

export const updateReportQuery = (data: UpdateReportPayload) =>
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
	);

export const getDashboardCountsQuery = () =>
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
	);
