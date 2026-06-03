import { createServerFn } from "@tanstack/react-start";
import { authMiddleware, protectedMiddleware } from "#/lib/auth-middleware";
import { effectInputValidator } from "#/lib/effect-utils";
import {
	ServerDetailInputSchema,
	ServerRateInputSchema,
	ServerReportInputSchema,
	ServerVoteInputSchema,
} from "./server-detail.schemas";
import {
	getServerDetailById,
	rateServerById,
	reportServerById,
	voteServerById,
} from "./server-detail.server";

export const getServerDetailFn = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator(effectInputValidator(ServerDetailInputSchema))
	.handler(async ({ data, context }) => {
		return getServerDetailById(data.serverId, context.user?.discordId);
	});

// 2. 投票：必須登入
export const voteServerFn = createServerFn({ method: "POST" })
	.middleware([protectedMiddleware])
	.inputValidator(effectInputValidator(ServerVoteInputSchema))
	.handler(async ({ data, context }) => {
		return voteServerById(data.serverId, context.user.discordId);
	});

// 3. 評分：必須登入
export const rateServerFn = createServerFn({ method: "POST" })
	.middleware([protectedMiddleware]) // 限制登入
	.inputValidator(effectInputValidator(ServerRateInputSchema))
	.handler(async ({ data, context }) => {
		return rateServerById(data.serverId, data.rating, context.user.discordId);
	});

// 4. 檢舉：必須登入
export const reportServerFn = createServerFn({ method: "POST" })
	.middleware([protectedMiddleware])
	.inputValidator(effectInputValidator(ServerReportInputSchema))
	.handler(async ({ data, context }) => {
		return reportServerById({ ...data, reporterId: context.user.discordId });
	});
