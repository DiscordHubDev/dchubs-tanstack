import { and, asc, eq } from "drizzle-orm";
import { Data, Effect } from "effect";
import { db } from "#/drizzle/db";
import { bot, botCommand, botDevelopers, user } from "#/drizzle/schema";
import { getSessionUserIdEffect } from "#/lib/edge-context";
import { runEffect, toErrorMessage } from "#/lib/effect-utils";
import type { BotEditDefaults, BotEditResult } from "./bot-edit.types";

class BotEditFailed extends Data.TaggedError("BotEditFailed")<{
	message: string;
}> {}

function dbEffect<A>(label: string, run: () => Promise<A>) {
	return Effect.tryPromise({
		try: run,
		catch: (error) =>
			new BotEditFailed({
				message: `${label}: ${toErrorMessage(error)}`,
			}),
	});
}

function normalizeOptionalString(value: string | null | undefined): string {
	if (typeof value !== "string") {
		return "";
	}

	return value.trim();
}

function normalizeList(values: string[] | null | undefined): string[] {
	if (!Array.isArray(values)) {
		return [];
	}

	return values.map((value) => value.trim()).filter(Boolean);
}

function isDeveloperEffect(
	botId: string,
	userId: string,
): Effect.Effect<boolean, BotEditFailed> {
	return dbEffect("Failed to verify bot developer", () =>
		db
			.select({ id: botDevelopers.a })
			.from(botDevelopers)
			.where(and(eq(botDevelopers.a, botId), eq(botDevelopers.b, userId)))
			.limit(1),
	).pipe(Effect.map((rows) => Boolean(rows[0])));
}

function getBotEditBundleEffect(
	botId: string,
): Effect.Effect<BotEditResult, BotEditFailed> {
	return Effect.gen(function* () {
		const userId = yield* Effect.catchAll(getSessionUserIdEffect(), () =>
			Effect.succeed(null),
		);
		if (!userId) {
			return { status: "forbidden" };
		}

		const isDeveloper = yield* isDeveloperEffect(botId, userId);
		if (!isDeveloper) {
			return { status: "forbidden" };
		}

		const botRows = yield* dbEffect("Failed to load bot", () =>
			db
				.select({
					name: bot.name,
					description: bot.description,
					longDescription: bot.longDescription,
					prefix: bot.prefix,
					inviteUrl: bot.inviteUrl,
					website: bot.website,
					supportServer: bot.supportServer,
					tags: bot.tags,
					screenshots: bot.screenshots,
					banner: bot.banner,
					secret: bot.secret,
					voteNotificationUrl: bot.voteNotificationUrl,
				})
				.from(bot)
				.where(eq(bot.id, botId))
				.limit(1),
		);

		const currentBot = botRows[0];
		if (!currentBot) {
			return { status: "not_found" };
		}

		const [commandRows, developerRows] = yield* Effect.all([
			dbEffect("Failed to load bot commands", () =>
				db
					.select({
						name: botCommand.name,
						description: botCommand.description,
						usage: botCommand.usage,
						category: botCommand.category,
					})
					.from(botCommand)
					.where(eq(botCommand.botId, botId))
					.orderBy(asc(botCommand.name)),
			),
			dbEffect("Failed to load bot developers", () =>
				db
					.select({
						id: user.id,
						username: user.username,
					})
					.from(botDevelopers)
					.innerJoin(user, eq(botDevelopers.b, user.id))
					.where(eq(botDevelopers.a, botId))
					.orderBy(asc(user.username)),
			),
		]);

		const defaults: BotEditDefaults = {
			botName: currentBot.name,
			botPrefix: normalizeOptionalString(currentBot.prefix),
			botDescription: currentBot.description,
			botLongDescription: normalizeOptionalString(currentBot.longDescription),
			botInvite: normalizeOptionalString(currentBot.inviteUrl),
			botWebsite: normalizeOptionalString(currentBot.website),
			botSupport: normalizeOptionalString(currentBot.supportServer),
			developers: developerRows.map((developer) => ({
				name: developer.username,
			})),
			commands: commandRows.map((command) => ({
				name: command.name,
				description: command.description,
				usage: command.usage,
				category: command.category ?? "",
			})),
			tags: normalizeList(currentBot.tags),
			secret: normalizeOptionalString(currentBot.secret),
			webhook_url: normalizeOptionalString(currentBot.voteNotificationUrl),
			screenshots: normalizeList(currentBot.screenshots),
			banner: currentBot.banner ?? null,
		};

		return {
			status: "ok",
			bundle: {
				botId,
				defaults,
			},
		};
	});
}

export function getBotEditBundleById(botId: string): Promise<BotEditResult> {
	return runEffect(getBotEditBundleEffect(botId));
}
