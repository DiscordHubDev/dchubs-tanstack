import { and, eq, inArray } from "drizzle-orm";
import { Effect } from "effect";
import { db } from "#/drizzle/db";
import { authAccount, server } from "#/drizzle/schema";
import { getSessionUserIdEffect } from "#/lib/edge-context";
import { runEffect, tryEffectPromise } from "#/lib/effect-utils";
import { fetchDiscordGuilds } from "./add-server.api";
import type { DiscordGuild, GuildMembershipBundle } from "./add-server.types";

const FALLBACK_BOT_CLIENT_ID = "1324996138251583580";
const DEFAULT_BOT_PERMISSIONS = "1126965059046400";

const ADMIN_PERMISSION_BIT = 0x8n;

function sortGuildsByName(guilds: DiscordGuild[]): DiscordGuild[] {
	return [...guilds].sort((left, right) =>
		left.name.localeCompare(right.name, "en", { sensitivity: "base" }),
	);
}

function getDiscordAccessTokenEffect(
	userId: string,
): Effect.Effect<string, Error> {
	return Effect.gen(function* () {
		const account = yield* tryEffectPromise(
			"Failed to load Discord account token",
			() =>
				db.query.authAccount.findFirst({
					where: and(
						eq(authAccount.accountId, userId),
						eq(authAccount.providerId, "discord"),
					),
					columns: {
						accessToken: true,
					},
				}),
		);

		if (!account?.accessToken) {
			return yield* Effect.fail(
				new Error(
					"Discord access token is missing. Please sign in with Discord again.",
				),
			);
		}

		return account.accessToken;
	});
}

function getBotTokenEffect(): Effect.Effect<string, Error> {
	return Effect.gen(function* () {
		const botToken = process.env.DISCORD_BOT_TOKEN;
		if (!botToken) {
			return yield* Effect.fail(
				new Error("Missing DISCORD_BOT_TOKEN environment variable."),
			);
		}

		return botToken;
	});
}

function getBotInviteClientId(): string {
	return process.env.DISCORD_CLIENT_ID || FALLBACK_BOT_CLIENT_ID;
}

function getGuildMembershipBundleEffect(): Effect.Effect<
	GuildMembershipBundle,
	Error
> {
	return Effect.gen(function* () {
		const userId = yield* getSessionUserIdEffect();
		if (!userId) {
			return yield* Effect.fail(
				new Error("You must sign in with Discord before adding a server."),
			);
		}

		const [userAccessToken, botToken] = yield* Effect.all([
			getDiscordAccessTokenEffect(userId),
			getBotTokenEffect(),
		]);

		const [userGuilds, botGuilds] = yield* Effect.all([
			tryEffectPromise("Failed to fetch user guilds from Discord", () =>
				fetchDiscordGuilds({
					token: userAccessToken,
					tokenType: "Bearer",
				}),
			),
			tryEffectPromise("Failed to fetch bot guilds from Discord", () =>
				fetchDiscordGuilds({
					token: botToken,
					tokenType: "Bot",
				}),
			),
		]);

		const ownedGuilds = userGuilds.filter((guild) => guild.owner);

		const botGuildIdSet = new Set(botGuilds.map((guild) => guild.id));

		const activeGuilds = sortGuildsByName(
			ownedGuilds.filter((guild) => botGuildIdSet.has(guild.id)),
		);

		const inactiveGuilds = sortGuildsByName(
			ownedGuilds.filter((guild) => !botGuildIdSet.has(guild.id)),
		);

		const publishedServerRows =
			activeGuilds.length === 0
				? []
				: yield* tryEffectPromise("Failed to load published server ids", () =>
						db
							.select({ id: server.id })
							.from(server)
							.where(
								inArray(
									server.id,
									activeGuilds.map((guild) => guild.id),
								),
							),
					);

		const publishedServerIdSet = new Set(
			publishedServerRows.map((item) => item.id),
		);

		const activeGuildsWithPublishState = activeGuilds.map((guild) => ({
			...guild,
			isPublished: publishedServerIdSet.has(guild.id),
		}));

		const inactiveGuildsWithPublishState = inactiveGuilds.map((guild) => ({
			...guild,
			isPublished: false,
		}));

		return {
			activeGuilds: activeGuildsWithPublishState,
			inactiveGuilds: inactiveGuildsWithPublishState,
			botInviteClientId: getBotInviteClientId(),
			botInvitePermissions: DEFAULT_BOT_PERMISSIONS,
		};
	});
}

export async function getGuildMembershipBundle(): Promise<GuildMembershipBundle> {
	return runEffect(getGuildMembershipBundleEffect());
}
