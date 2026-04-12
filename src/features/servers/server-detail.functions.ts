import { createServerFn } from "@tanstack/react-start";
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
	.inputValidator(effectInputValidator(ServerDetailInputSchema))
	.handler(async ({ data }) => {
		return getServerDetailById(data.serverId);
	});

export const voteServerFn = createServerFn({ method: "POST" })
	.inputValidator(effectInputValidator(ServerVoteInputSchema))
	.handler(async ({ data }) => {
		return voteServerById(data.serverId);
	});

export const rateServerFn = createServerFn({ method: "POST" })
	.inputValidator(effectInputValidator(ServerRateInputSchema))
	.handler(async ({ data }) => {
		return rateServerById(data.serverId, data.rating);
	});

export const reportServerFn = createServerFn({ method: "POST" })
	.inputValidator(effectInputValidator(ServerReportInputSchema))
	.handler(async ({ data }) => {
		return reportServerById(data);
	});
