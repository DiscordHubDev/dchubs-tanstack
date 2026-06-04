import { and, asc, eq, sql } from "drizzle-orm";
import { Data, Effect } from "effect";
import { db } from "#/drizzle/db";
import { bot, botCommand, botDevelopers, user } from "#/drizzle/schema";
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
	userId: string,
): Effect.Effect<BotEditResult, BotEditFailed> {
	return Effect.gen(function* () {
		const botRows = yield* dbEffect("Failed to load bot", () =>
			db
				.select({
					bot: {
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
						nsfw: bot.nsfw,
					},
					hasAccess: sql<boolean>`count(${botDevelopers.b}) FILTER (WHERE ${botDevelopers.b} = ${userId}) > 0`,
				})
				.from(bot)
				.leftJoin(botDevelopers, eq(bot.id, botDevelopers.a))
				.where(eq(bot.id, botId))
				.groupBy(bot.id)
				.limit(1),
		);

		const row = botRows[0];

		// 安全防線一：先判斷東西在不在，杜絕 IDOR 探測
		if (!row) {
			return { status: "not_found" };
		}

		// 安全防線二：東西在，但你不是開發者
		if (!row.hasAccess) {
			return { status: "forbidden" };
		}

		const currentBot = row.bot;

		// 2. 這裡保持你原本優秀的 Effect.all 並行查詢（載入剩餘的關聯資料）
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

		// 3. 資料組合邏輯（維持原樣）
		const defaults: BotEditDefaults = {
			botName: currentBot.name,
			botPrefix: normalizeOptionalString(currentBot.prefix),
			botDescription: currentBot.description,
			botLongDescription: normalizeOptionalString(currentBot.longDescription),
			botInvite: normalizeOptionalString(currentBot.inviteUrl),
			botWebsite: normalizeOptionalString(currentBot.website),
			botSupport: normalizeOptionalString(currentBot.supportServer),
			developers: developerRows.map((dev) => ({ name: dev.username })),
			commands: commandRows.map((cmd) => ({
				name: cmd.name,
				description: cmd.description,
				usage: cmd.usage,
				category: cmd.category ?? "",
			})),
			tags: normalizeList(currentBot.tags),
			secret: normalizeOptionalString(currentBot.secret),
			webhook_url: normalizeOptionalString(currentBot.voteNotificationUrl),
			screenshots: normalizeList(currentBot.screenshots),
			banner: currentBot.banner ?? null,
			nsfw: currentBot.nsfw ?? false,
		};

		return {
			status: "ok",
			bundle: { botId, defaults },
		};
	});
}

export function getBotEditBundleById(
	botId: string,
	userId: string,
): Promise<BotEditResult> {
	return runEffect(getBotEditBundleEffect(botId, userId));
}
