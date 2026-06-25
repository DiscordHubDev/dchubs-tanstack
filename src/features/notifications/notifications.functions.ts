import { createServerFn } from "@tanstack/react-start";
import { Effect } from "effect";
import type { NotificationFailed } from "#/errors/bot-errors";
import { adminMiddleware } from "#/lib/auth-middleware";
import { effectInputValidator } from "#/lib/effect-utils";
import { SendNotificationSchema } from "./notifications.schemas";
import { sendNotificationEffect } from "./notifications.server";
import type { SendNotificationErrorPayload, SendNotificationResult } from "./notifications.types";

function serializeNotificationError(error: NotificationFailed): SendNotificationErrorPayload {
  return {
    tag: error._tag,
    message: "通知送出失敗",
  };
}

export const sendNotificationFn = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(effectInputValidator(SendNotificationSchema))
  .handler(async ({ data }): Promise<SendNotificationResult> => {
    return Effect.runPromise(
      sendNotificationEffect(data).pipe(
        Effect.map(() => ({ success: true as const })),
        Effect.catchAll((error) =>
          Effect.succeed({
            success: false as const,
            error: serializeNotificationError(error),
          }),
        ),
      ),
    );
  });
