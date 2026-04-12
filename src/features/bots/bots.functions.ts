import { createServerFn } from "@tanstack/react-start";
import { effectInputValidator } from "#/lib/effect-utils";
import { BotListInputSchema } from "./bots.schemas";
import { listBotFilterBundle, listBotsPage } from "./bots.server";

export const botsListInputSchema = BotListInputSchema;

export const getBotsListFn = createServerFn({ method: "GET" })
	.inputValidator(effectInputValidator(BotListInputSchema))
	.handler(async ({ data }) => {
		return listBotsPage(data);
	});

export const getBotFilterBundleFn = createServerFn({ method: "GET" }).handler(
	async () => {
		return listBotFilterBundle();
	},
);
