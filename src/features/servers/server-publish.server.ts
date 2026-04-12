import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { db } from "#/drizzle/db";
import { authAccount, server } from "#/drizzle/schema";
import { getSession } from "#/lib/auth.functions";
import { runEffect, tryEffectPromise } from "#/lib/effect-utils";
import { fetchDiscordGuilds } from "./add-server.api";
import type { DiscordGuild } from "./add-server.types";
import type {
	ServerPublishBundle,
	ServerPublishResult,
	ServerPublishSubmitInput,
} from "./server-publish.types";

const GUILD_ADMINISTRATOR_PERMISSION = 1n << 3n;
const GUILD_MANAGE_PERMISSION = 1n << 5n;

function getSessionUserIdEffect(): Effect.Effect<string, Error> {
	return Effect.gen(function* () {
		const session = yield* tryEffectPromise("Failed to fetch session", () =>
			getSession(),
		);

		const typedSession = session as {
			discordProfile?: {
				id?: string;
			};
			user?: {
				discordId?: string;
				id?: string;
			};
		} | null;

		const userId =
			typedSession?.discordProfile?.id ??
			typedSession?.user?.discordId ??
			typedSession?.user?.id;

		if (!userId) {
			return yield* Effect.fail(new Error("請先登入 Discord 帳號"));
		}

		return userId;
	});
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
				new Error("Discord access token 不存在，請重新登入"),
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

function hasGuildManagePermission(guild: DiscordGuild): boolean {
	if (guild.owner) {
		return true;
	}

	try {
		const permissions = BigInt(guild.permissions || "0");
		return (
			(permissions & GUILD_ADMINISTRATOR_PERMISSION) !== 0n ||
			(permissions & GUILD_MANAGE_PERMISSION) !== 0n
		);
	} catch {
		return false;
	}
}

function normalizeList(
	values: readonly string[] | string[] | null | undefined,
): string[] {
	if (!Array.isArray(values)) {
		return [];
	}

	return values
		.map((value) => value.trim())
		.filter(Boolean)
		.filter((value, index, list) => list.indexOf(value) === index);
}

function normalizeOptionalString(
	value: string | null | undefined,
): string | null {
	if (typeof value !== "string") {
		return null;
	}

	const normalized = value.trim();
	return normalized.length > 0 ? normalized : null;
}

function buildGuildIconUrl(guild: DiscordGuild): string | null {
	if (!guild.icon) {
		return null;
	}

	return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=256`;
}

function getAccessibleGuildEffect(serverId: string): Effect.Effect<
	{
		userId: string;
		guild: DiscordGuild;
	},
	Error
> {
	return Effect.gen(function* () {
		const userId = yield* getSessionUserIdEffect();
		const [userAccessToken, botToken] = yield* Effect.all([
			getDiscordAccessTokenEffect(userId),
			getBotTokenEffect(),
		]);

		const [userGuilds, botGuilds] = yield* Effect.all([
			tryEffectPromise("Failed to fetch user guilds", () =>
				fetchDiscordGuilds({
					token: userAccessToken,
					tokenType: "Bearer",
				}),
			),
			tryEffectPromise("Failed to fetch bot guilds", () =>
				fetchDiscordGuilds({
					token: botToken,
					tokenType: "Bot",
				}),
			),
		]);

		const botGuildIds = new Set(botGuilds.map((guild) => guild.id));
		const guild = userGuilds.find(
			(item) => item.id === serverId && botGuildIds.has(item.id),
		);

		if (!guild) {
			return yield* Effect.fail(
				new Error("你沒有權限發布這個伺服器，或機器人尚未加入該伺服器"),
			);
		}

		if (!hasGuildManagePermission(guild)) {
			return yield* Effect.fail(new Error("你需要該伺服器的管理權限才能發布"));
		}

		return {
			userId,
			guild,
		};
	});
}

function getServerPublishBundleEffect(
	serverId: string,
): Effect.Effect<ServerPublishBundle, Error> {
	return Effect.gen(function* () {
		const { guild } = yield* getAccessibleGuildEffect(serverId);

		const rows = yield* tryEffectPromise(
			"Failed to fetch published server",
			() =>
				db
					.select({
						id: server.id,
						name: server.name,
						description: server.description,
						longDescription: server.longDescription,
						inviteUrl: server.inviteUrl,
						website: server.website,
						tags: server.tags,
						rules: server.rules,
						secret: server.secret,
						voteNotificationUrl: server.voteNotificationUrl,
						icon: server.icon,
						banner: server.banner,
					})
					.from(server)
					.where(eq(server.id, serverId))
					.limit(1),
		);

		const current = rows[0];
		const guildIconUrl = buildGuildIconUrl(guild);

		return {
			serverId,
			isPublished: Boolean(current),
			iconUrl: current?.icon ?? guildIconUrl,
			bannerUrl: current?.banner ?? null,
			formValues: {
				serverName: guild.name,
				shortDescription: current?.description ?? "",
				longDescription: current?.longDescription ?? "",
				inviteLink: current?.inviteUrl ?? "",
				websiteLink: current?.website ?? "",
				rules: normalizeList(current?.rules),
				tags: normalizeList(current?.tags),
				secret: current?.secret ?? "",
				webhook_url: current?.voteNotificationUrl ?? "",
			},
		};
	});
}

function upsertServerPublishEffect(
	input: ServerPublishSubmitInput,
): Effect.Effect<ServerPublishResult, Error> {
	return Effect.gen(function* () {
		const { userId, guild } = yield* getAccessibleGuildEffect(input.serverId);

		const shortDescription = input.form.shortDescription.trim();
		const longDescription = input.form.longDescription.trim();
		const inviteLink = input.form.inviteLink.trim();

		if (!shortDescription || !longDescription || !inviteLink) {
			return yield* Effect.fail(
				new Error("描述、完整介紹與邀請連結不可為空白"),
			);
		}

		const tags = normalizeList(input.form.tags);
		const rules = normalizeList(input.form.rules);
		const website = normalizeOptionalString(input.form.websiteLink);
		const secret = normalizeOptionalString(input.form.secret);
		const webhookUrl = normalizeOptionalString(input.form.webhook_url);
		const iconUrl =
			normalizeOptionalString(input.iconUrl) ?? buildGuildIconUrl(guild);
		const bannerUrl = normalizeOptionalString(input.bannerUrl);

		const existingRows = yield* tryEffectPromise(
			"Failed to inspect existing server",
			() =>
				db
					.select({
						id: server.id,
						ownerId: server.ownerId,
					})
					.from(server)
					.where(eq(server.id, input.serverId))
					.limit(1),
		);

		const existing = existingRows[0];

		if (existing) {
			yield* tryEffectPromise("Failed to update server publish data", () =>
				db
					.update(server)
					.set({
						name: guild.name,
						description: shortDescription,
						longDescription,
						inviteUrl: inviteLink,
						website,
						rules,
						tags,
						secret,
						voteNotificationUrl: webhookUrl,
						icon: iconUrl,
						banner: bannerUrl,
						ownerId: existing.ownerId ?? userId,
					})
					.where(eq(server.id, input.serverId)),
			);

			return {
				success: true,
				message: "伺服器資料已更新",
				serverId: input.serverId,
			};
		}

		yield* tryEffectPromise("Failed to publish server", () =>
			db.insert(server).values({
				id: input.serverId,
				name: guild.name,
				description: shortDescription,
				longDescription,
				members: 0,
				online: 0,
				upvotes: 0,
				icon: iconUrl,
				banner: bannerUrl,
				ownerId: userId,
				website,
				inviteUrl: inviteLink,
				rules,
				features: [],
				tags,
				screenshots: [],
				voteNotificationUrl: webhookUrl,
				secret,
			}),
		);

		return {
			success: true,
			message: "伺服器已成功發布",
			serverId: input.serverId,
		};
	});
}

export function getServerPublishBundleById(
	serverId: string,
): Promise<ServerPublishBundle> {
	return runEffect(getServerPublishBundleEffect(serverId));
}

export function upsertServerPublish(
	input: ServerPublishSubmitInput,
): Promise<ServerPublishResult> {
	return runEffect(upsertServerPublishEffect(input));
}
