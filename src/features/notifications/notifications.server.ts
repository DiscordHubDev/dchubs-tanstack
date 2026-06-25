import { Effect } from "effect";
import { NotificationFailed } from "#/errors/bot-errors";
import { sendNotification } from "../admin/admin.functions";
import type { SendNotificationInput } from "./notifications.schemas";

export function resolveUserIdEffect(
  userId?: string | null,
): Effect.Effect<string, NotificationFailed> {
  // 1. 如果有明確指定 userId，優先使用
  if (userId && userId.trim().length > 0) {
    return Effect.succeed(userId.trim());
  }

  return Effect.fail(new NotificationFailed({}));
}

export function sendNotificationEffect(
  input: SendNotificationInput,
): Effect.Effect<void, NotificationFailed> {
  return Effect.gen(function* () {
    const userId = yield* resolveUserIdEffect(input.userId);

    const subject = input.subject.trim();
    const content = input.content.trim();
    const teaser = input.teaser?.trim() || content.slice(0, 140);
    const priority = input.priority ?? "info";
    const label = input.label?.trim();

    yield* Effect.tryPromise({
      try: () =>
        sendNotification({
          subject,
          content,
          teaser,
          priority,
          label,
          userIds: [userId],
        }),
      catch: () => new NotificationFailed({}),
    });
  });
}
