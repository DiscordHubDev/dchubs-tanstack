// admin.server.ts
import { createServerFn } from "@tanstack/react-start";
import { effectInputValidator } from "#/lib/effect-utils";
import { toResult } from "./admin.functions";
import {
	deleteBotQuery,
	deleteServerQuery,
	getAllBotsQuery,
	getAllServersQuery,
	getDashboardCountsQuery,
	getReportsQuery,
	reviewBotQuery,
	updateReportQuery,
} from "./admin.query";
import {
	BotIdSchema,
	ReviewBotSchema,
	ServerGuildIdSchema,
	UpdateReportSchema,
} from "./admin.schemas";
import type { ActionResult, DiscordServer, Report } from "./admin.types";

/** Fetch all bots (admin view — includes pending) */
export const adminGetAllBots = createServerFn({ method: "GET" }).handler(() =>
	toResult(getAllBotsQuery()),
);

/** Fetch all servers */
export const adminGetAllServers = createServerFn({ method: "GET" }).handler(
	(): Promise<ActionResult<DiscordServer[]>> => toResult(getAllServersQuery()),
);

/** Fetch all reports */
export const getReports = createServerFn({ method: "GET" }).handler(
	(): Promise<ActionResult<Report[]>> => toResult(getReportsQuery()),
);

/** Approve or reject a bot application */
export const reviewBot = createServerFn({ method: "POST" })
	.inputValidator(effectInputValidator(ReviewBotSchema))
	.handler(({ data }): Promise<ActionResult> => toResult(reviewBotQuery(data)));

/** Delete a bot by id */
export const deleteBot = createServerFn({ method: "POST" })
	.inputValidator(effectInputValidator(BotIdSchema))
	.handler(({ data }): Promise<ActionResult> => toResult(deleteBotQuery(data)));

/** Delete a server by guild id */
export const deleteServer = createServerFn({ method: "POST" })
	.inputValidator(effectInputValidator(ServerGuildIdSchema))
	.handler(
		({ data }): Promise<ActionResult> => toResult(deleteServerQuery(data)),
	);

/** Update a report's status and/or severity */
export const updateReport = createServerFn({ method: "POST" })
	.inputValidator(effectInputValidator(UpdateReportSchema))
	.handler(
		({ data }): Promise<ActionResult> => toResult(updateReportQuery(data)),
	);

/** Fetch pending bots count + reports count — used for SSR badge hydration */
export const adminGetDashboardCounts = createServerFn({
	method: "GET",
}).handler(
	(): Promise<ActionResult<{ pendingBots: number; pendingReports: number }>> =>
		toResult(getDashboardCountsQuery()),
);
