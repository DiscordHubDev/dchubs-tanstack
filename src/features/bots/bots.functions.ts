import { createServerFn } from "@tanstack/react-start";
import { Effect } from "effect";
import { authMiddleware } from "#/lib/auth-middleware";
import { effectInputValidator } from "#/lib/effect-utils";
import { BotListInputSchema } from "./bots.schemas";
import {
	isDeveloperEffect,
	listBotFilterBundle,
	listBotsPage,
} from "./bots.server";

export const getBotsListFn = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator(effectInputValidator(BotListInputSchema))
	.handler(async ({ data, context }) => {
		return listBotsPage(
			data,
			context.user?.discordId ?? null,
			context.user?.nsfw,
		);
	});

export const getBotFilterBundleFn = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async ({ context }) => {
		return listBotFilterBundle(
			context.user?.discordId ?? null,
			context.user?.nsfw,
		);
	});

export const checkBotDeveloperServerFn = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator((data: { botId: string }) => data)
	.handler(async ({ data, context }) => {
		if (!context.user) {
			return { isLoggedIn: false, isDeveloper: false };
		}

		try {
			const isDeveloper = await Effect.runPromise(
				isDeveloperEffect(data.botId, context.user.discordId || ""),
			);

			return { isLoggedIn: true, isDeveloper };
		} catch {
			return { isLoggedIn: true, isDeveloper: false };
		}
	});
