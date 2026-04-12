import { and, desc, eq, gte, sql } from "drizzle-orm";
import { Effect } from "effect";
import { db } from "#/drizzle/db";
import { bot, userFavoriteBots } from "#/drizzle/schema";
import { getSession } from "#/lib/auth.functions";
import { runEffect, tryEffectPromise } from "#/lib/effect-utils";
import type { CategoryType } from "#/lib/types";
import type {
	BotCategory,
	BotFilterBundle,
	BotListQueryInput,
	BotListQueryResult,
	PublicBot,
} from "./bots.types";

const TAG_COLORS = [
	"bg-blue-500",
	"bg-green-500",
	"bg-rose-500",
	"bg-amber-500",
	"bg-cyan-500",
	"bg-indigo-500",
	"bg-emerald-500",
	"bg-fuchsia-500",
] as const;

function normalizeTags(tags: string[] | null): string[] {
	if (!Array.isArray(tags)) return [];
	return tags.filter(Boolean);
}

function mapRowToPublicBot(
	row: {
		id: string;
		name: string;
		description: string;
		tags: string[] | null;
		servers: number;
		users: number;
		upvotes: number;
		icon: string | null;
		banner: string | null;
		inviteUrl: string | null;
		website: string | null;
		supportServer: string | null;
		approvedAt: string | null;
		pin: boolean;
		pinExpiry: string | null;
		verified: boolean;
		isAdmin: boolean;
	},
	favoriteIds: Set<string>,
): PublicBot {
	return {
		id: row.id,
		name: row.name,
		description: row.description,
		tags: normalizeTags(row.tags),
		servers: row.servers,
		users: row.users,
		upvotes: row.upvotes,
		icon: row.icon,
		banner: row.banner,
		inviteUrl: row.inviteUrl,
		website: row.website,
		supportServer: row.supportServer,
		approvedAt: row.approvedAt,
		pin: row.pin,
		pinExpiry: row.pinExpiry,
		verified: row.verified,
		isFavorite: favoriteIds.has(row.id),
		isAdmin: row.isAdmin,
	};
}

function getSessionUserIdEffect(): Effect.Effect<string | null, Error> {
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

		return (
			typedSession?.discordProfile?.id ??
			typedSession?.user?.discordId ??
			typedSession?.user?.id ??
			null
		);
	});
}

function getFavoriteIdsEffect(
	userId: string | null,
): Effect.Effect<Set<string>, Error> {
	if (!userId) return Effect.succeed(new Set<string>());

	return tryEffectPromise("Failed to fetch favorite bots", async () => {
		const rows = await db
			.select({ id: userFavoriteBots.a })
			.from(userFavoriteBots)
			.where(eq(userFavoriteBots.b, userId));

		return new Set(rows.map((item) => item.id));
	});
}

function getListWhere(category: BotCategory) {
	const approved = eq(bot.status, "approved");

	if (category === "featured") {
		return and(approved, gte(bot.servers, 1000));
	}

	if (category === "verified") {
		return and(approved, eq(bot.verified, true));
	}

	return approved;
}

function getListOrderBy(category: BotCategory) {
	if (category === "new") {
		return [desc(bot.approvedAt), desc(bot.createdAt)] as const;
	}

	if (category === "featured") {
		return [desc(bot.upvotes), desc(bot.servers)] as const;
	}

	if (category === "verified") {
		return [desc(bot.approvedAt), desc(bot.upvotes)] as const;
	}

	if (category === "popular") {
		return [desc(bot.pin), desc(bot.pinExpiry), desc(bot.upvotes)] as const;
	}

	if (category === "voted") {
		return [desc(bot.upvotes)] as const;
	}

	return [desc(bot.upvotes)] as const;
}

function listBotsPageEffect(
	input: BotListQueryInput,
): Effect.Effect<BotListQueryResult, Error> {
	return Effect.gen(function* () {
		const userId = yield* getSessionUserIdEffect();
		const favoriteIds = yield* getFavoriteIdsEffect(userId);

		const whereClause = getListWhere(input.category);
		const orderBy = getListOrderBy(input.category);
		const offset = (input.page - 1) * input.limit;

		const [countRows, rows] = yield* Effect.all([
			tryEffectPromise("Failed to count bots", () =>
				db
					.select({ count: sql<number>`count(*)` })
					.from(bot)
					.where(whereClause),
			),
			tryEffectPromise("Failed to load bot list", () =>
				db
					.select({
						id: bot.id,
						name: bot.name,
						description: bot.description,
						tags: bot.tags,
						servers: bot.servers,
						users: bot.users,
						upvotes: bot.upvotes,
						icon: bot.icon,
						banner: bot.banner,
						inviteUrl: bot.inviteUrl,
						website: bot.website,
						supportServer: bot.supportServer,
						approvedAt: bot.approvedAt,
						pin: bot.pin,
						pinExpiry: bot.pinExpiry,
						verified: bot.verified,
						isAdmin: bot.isAdmin,
					})
					.from(bot)
					.where(whereClause)
					.orderBy(...orderBy)
					.limit(input.limit)
					.offset(offset),
			),
		]);

		const total = Number(countRows[0]?.count ?? 0);
		const totalPages = Math.max(1, Math.ceil(total / input.limit));

		return {
			bots: rows.map((row) => mapRowToPublicBot(row, favoriteIds)),
			total,
			totalPages,
			page: input.page,
			limit: input.limit,
		};
	});
}

function listBotFilterBundleEffect(): Effect.Effect<BotFilterBundle, Error> {
	return Effect.gen(function* () {
		const userId = yield* getSessionUserIdEffect();
		const favoriteIds = yield* getFavoriteIdsEffect(userId);

		const rows = yield* tryEffectPromise("Failed to load all bots", () =>
			db
				.select({
					id: bot.id,
					name: bot.name,
					description: bot.description,
					tags: bot.tags,
					servers: bot.servers,
					users: bot.users,
					upvotes: bot.upvotes,
					icon: bot.icon,
					banner: bot.banner,
					inviteUrl: bot.inviteUrl,
					website: bot.website,
					supportServer: bot.supportServer,
					approvedAt: bot.approvedAt,
					pin: bot.pin,
					pinExpiry: bot.pinExpiry,
					verified: bot.verified,
					isAdmin: bot.isAdmin,
				})
				.from(bot)
				.where(eq(bot.status, "approved")),
		);

		const allBots = rows.map((row) => mapRowToPublicBot(row, favoriteIds));

		const tagCount = new Map<string, number>();
		for (const item of allBots) {
			for (const tag of item.tags) {
				const normalized = tag.trim();
				if (!normalized) continue;

				tagCount.set(normalized, (tagCount.get(normalized) ?? 0) + 1);
			}
		}

		const categories: CategoryType[] = [...tagCount.entries()]
			.sort((a, b) => b[1] - a[1])
			.map(([name], index) => ({
				id: `tag-${name.toLowerCase().replace(/\s+/g, "-")}`,
				name,
				color: TAG_COLORS[index % TAG_COLORS.length],
			}));

		const verifiedBots = allBots.filter((item) => item.verified).length;
		const totalTags = allBots.reduce((acc, item) => acc + item.tags.length, 0);

		return {
			allBots,
			categories,
			stats: {
				totalBots: allBots.length,
				verifiedBots,
				totalTags,
			},
		};
	});
}

export async function listBotsPage(
	input: BotListQueryInput,
): Promise<BotListQueryResult> {
	return runEffect(listBotsPageEffect(input));
}

export async function listBotFilterBundle(): Promise<BotFilterBundle> {
	return runEffect(listBotFilterBundleEffect());
}
