import { createServerFn } from "@tanstack/react-start";
import { protectedMiddleware } from "#/lib/auth-middleware";
import { effectInputValidator } from "#/lib/effect-utils";
import { BotEditInputSchema } from "./bot-edit.schemas";
import { getBotEditBundleById } from "./bot-edit.server";

export const getBotEditBundleFn = createServerFn({ method: "GET" })
  .middleware([protectedMiddleware])
  .inputValidator(effectInputValidator(BotEditInputSchema))
  .handler(async ({ data, context }) => {
    return getBotEditBundleById(data.botId, context.user.discordId);
  });
