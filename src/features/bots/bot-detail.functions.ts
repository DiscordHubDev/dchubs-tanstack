import { createServerFn } from "@tanstack/react-start";
import { authMiddleware, protectedMiddleware } from "#/lib/auth-middleware";
import { effectInputValidator } from "#/lib/effect-utils";
import {
  BotDetailInputSchema,
  BotRateInputSchema,
  BotReportInputSchema,
  BotVoteInputSchema,
} from "./bot-detail.schemas";
import { getBotDetailById, rateBotById, reportBotById, voteBotById } from "./bot-detail.server";

export const getBotDetailFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .inputValidator(effectInputValidator(BotDetailInputSchema))
  .handler(async ({ data, context }) => {
    return getBotDetailById(data.botId, context.user?.discordId);
  });

export const voteBotFn = createServerFn({ method: "POST" })
  .middleware([protectedMiddleware])
  .inputValidator(effectInputValidator(BotVoteInputSchema))
  .handler(async ({ data, context }) => {
    return voteBotById(data.botId, context.user.discordId);
  });

export const rateBotFn = createServerFn({ method: "POST" })
  .middleware([protectedMiddleware])
  .inputValidator(effectInputValidator(BotRateInputSchema))
  .handler(async ({ data, context }) => {
    return rateBotById(data.botId, data.rating, context.user.discordId);
  });

export const reportBotFn = createServerFn({ method: "POST" })
  .middleware([protectedMiddleware])
  .inputValidator(effectInputValidator(BotReportInputSchema))
  .handler(async ({ data, context }) => {
    return reportBotById({
      ...data,
      userId: context.user.discordId,
    });
  });
