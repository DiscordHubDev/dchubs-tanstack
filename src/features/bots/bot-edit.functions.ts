import { createServerFn } from "@tanstack/react-start";
import { effectInputValidator } from "#/lib/effect-utils";
import { BotEditInputSchema } from "./bot-edit.schemas";
import { getBotEditBundleById } from "./bot-edit.server";

export const getBotEditBundleFn = createServerFn({ method: "GET" })
	.inputValidator(effectInputValidator(BotEditInputSchema))
	.handler(async ({ data }) => {
		return getBotEditBundleById(data.botId);
	});
