import { Effect } from "effect";
import { NotificationFailed } from "#/errors/bot-errors";
import { getResolvedEdgeContext } from "#/lib/edge-context";
import { sendNotification } from "../admin/admin.functions";
import type { SendNotificationInput } from "./notifications.schemas";

function resolveUserIdEffect(
	userId?: string,
): Effect.Effect<string, NotificationFailed> {
	if (userId && userId.trim().length > 0) {
		return Effect.succeed(userId.trim());
	}

	return Effect.gen(function* () {
		const ctx = yield* Effect.tryPromise({
			try: () => getResolvedEdgeContext(),
			catch: () => new NotificationFailed({}),
		});

		// getResolvedEdgeContext 已保證 userId 是 Discord ID
		if (!ctx.userId || !ctx.user) {
			return yield* Effect.fail(new NotificationFailed({}));
		}

		return ctx.user.discordId;
	});
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

		yield* Effect.tryPromise({
			try: () =>
				sendNotification({
					subject,
					content,
					teaser,
					priority,
					userIds: [userId],
				}),
			catch: () => new NotificationFailed({}),
		});
	});
}
