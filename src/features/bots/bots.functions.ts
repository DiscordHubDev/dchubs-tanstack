import { createServerFn } from "@tanstack/react-start";
import { Effect } from "effect";
import { requireDomainUser } from "#/lib/edge-context";
import { effectInputValidator } from "#/lib/effect-utils";
import { BotListInputSchema } from "./bots.schemas";
import {
	isDeveloperEffect,
	listBotFilterBundle,
	listBotsPage,
} from "./bots.server";

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

export const checkBotDeveloperServerFn = createServerFn({ method: "GET" })
	.inputValidator((data: { botId: string }) => data)
	.handler(async ({ data }) => {
		try {
			// 1. 從全域 Edge Context 拿到當前登入者的 Discord ID
			const { user } = await requireDomainUser();

			// 2. 呼叫同目錄的純後端 Effect 進行檢查
			const isDeveloper = await Effect.runPromise(
				isDeveloperEffect(data.botId, user.discordId || ""),
			);

			return { isLoggedIn: true, isDeveloper };
		} catch {
			return { isLoggedIn: false, isDeveloper: false };
		}
	});
