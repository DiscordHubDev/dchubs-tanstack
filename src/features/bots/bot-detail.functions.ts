import { createServerFn } from "@tanstack/react-start";
import { effectInputValidator } from "#/lib/effect-utils";
import {
	BotDetailInputSchema,
	BotRateInputSchema,
	BotReportInputSchema,
	BotVoteInputSchema,
} from "./bot-detail.schemas";
import {
	getBotDetailById,
	rateBotById,
	reportBotById,
	voteBotById,
} from "./bot-detail.server";

export const getBotDetailFn = createServerFn({ method: "GET" })
	.inputValidator(effectInputValidator(BotDetailInputSchema))
	.handler(async ({ data }) => {
		return getBotDetailById(data.botId);
	});

export const voteBotFn = createServerFn({ method: "POST" })
	.inputValidator(effectInputValidator(BotVoteInputSchema))
	.handler(async ({ data }) => {
		return voteBotById(data.botId);
	});

export const rateBotFn = createServerFn({ method: "POST" })
	.inputValidator(effectInputValidator(BotRateInputSchema))
	.handler(async ({ data }) => {
		return rateBotById(data.botId, data.rating);
	});

export const reportBotFn = createServerFn({ method: "POST" })
	.inputValidator(effectInputValidator(BotReportInputSchema))
	.handler(async ({ data }) => {
		return reportBotById(data);
	});
