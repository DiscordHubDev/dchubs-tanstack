import { Effect } from "effect";
import { db } from "#/drizzle/db";
import { notification } from "#/drizzle/schema";
import { NotificationFailed } from "#/errors/bot-errors";
import { getDomainUser, getEdgeContext } from "#/lib/edge-context";
import type { SendNotificationInput } from "./notifications.schemas";

function resolveUserIdEffect(
	userId?: string,
): Effect.Effect<string, NotificationFailed> {
	if (userId && userId.trim().length > 0) {
		return Effect.succeed(userId.trim());
	}

	return Effect.gen(function* () {
		const { userId } = getEdgeContext();
		if (!userId) {
			return yield* Effect.fail(new NotificationFailed({}));
		}

		const domainUser = yield* Effect.tryPromise({
			try: () => getDomainUser(userId),
			catch: () => new NotificationFailed({}),
		});

		const resolvedId = domainUser?.discordId;

		if (!resolvedId) {
			return yield* Effect.fail(new NotificationFailed({}));
		}

		return resolvedId;
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
		const isSystem = input.isSystem ?? true;

		yield* Effect.tryPromise({
			try: () =>
				db.insert(notification).values({
					id: crypto.randomUUID(),
					name: "DCHubs",
					subject,
					teaser,
					content,
					userId,
					priority,
					isSystem,
					read: false,
				}),
			catch: () => new NotificationFailed({}),
		});
	});
}
