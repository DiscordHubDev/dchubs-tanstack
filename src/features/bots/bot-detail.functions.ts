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
  .validator(effectInputValidator(BotDetailInputSchema))
  .handler(async ({ data, context }) => {
    return getBotDetailById(data.botId, context.user?.discordId);
  });

export const voteBotFn = createServerFn({ method: "POST" })
  .middleware([protectedMiddleware])
  .validator(effectInputValidator(BotVoteInputSchema))
  .handler(async ({ data, context }) => {
    return voteBotById(data.botId, context.user.betterAuthId);
  });

export const rateBotFn = createServerFn({ method: "POST" })
  .middleware([protectedMiddleware])
  .validator(effectInputValidator(BotRateInputSchema))
  .handler(async ({ data, context }) => {
    return rateBotById(data.botId, data.rating, context.user.betterAuthId);
  });

export const reportBotFn = createServerFn({ method: "POST" })
  .middleware([protectedMiddleware])
  .validator(effectInputValidator(BotReportInputSchema))
  .handler(async ({ data, context }) => {
    return reportBotById({
      ...data,
      user: {
        name: context.user.name,
        username: context.user.username,
      },
      userId: context.user.betterAuthId,
    });
  });
