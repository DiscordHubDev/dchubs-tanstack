import { createServerFn } from "@tanstack/react-start";
import { Effect, Exit } from "effect";
import { protectedMiddleware } from "#/lib/auth-middleware";
import { effectInputValidator } from "#/lib/effect-utils";
import { WebhookPayloadSchema } from "./webhook.schema";
import { sendDiscordWebhookEffect } from "./webhook.server";

export const sendDiscordWebhookFn = createServerFn({ method: "POST" })
  .middleware([protectedMiddleware])
  .validator((data: unknown) => effectInputValidator(WebhookPayloadSchema)(data))
  .handler(async ({ data: payload, context }) => {
    const tag = payload._tag;

    // 🛡️ 安全檢查
    if (tag === "vote" && payload.user.id !== context.user.discordId) {
      throw new Error("Unauthorized");
    }
    if (tag === "approvedBot" && !context.edgeContext?.isAdmin) {
      throw new Error("Forbidden");
    }

    // 執行 Promise
    const result = await Effect.runPromiseExit(sendDiscordWebhookEffect(payload));

    if (Exit.isFailure(result)) {
      return { success: false, error: "發送失敗" };
    }
    return { success: true };
  });
