import { desc, eq, gte, sql } from "drizzle-orm";
import { Effect } from "effect";
import { db } from "#/drizzle/db";
import { server, userFavoriteServers } from "#/drizzle/schema";
import { runEffect, tryEffectPromise } from "#/lib/effect-utils";
import type { CategoryType } from "#/lib/types";
import type {
	PublicServer,
	ServerCategory,
	ServerFilterBundle,
	ServerListQueryInput,
	ServerListQueryResult,
} from "./servers.types";

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

function mapRowToPublicServer(
	row: {
		id: string;
		name: string;
		description: string;
		tags: string[] | null;
		members: number;
		online: number | null;
		upvotes: number;
		icon: string | null;
		banner: string | null;
		inviteUrl: string | null;
		createdAt: string;
		pin: boolean;
		pinExpiry: string | null;
	},
	favoriteIds: Set<string>,
): PublicServer {
	return {
		id: row.id,
		name: row.name,
		description: row.description,
		tags: normalizeTags(row.tags),
		members: row.members,
		online: row.online,
		upvotes: row.upvotes,
		icon: row.icon,
		banner: row.banner,
		inviteUrl: row.inviteUrl,
		createdAt: row.createdAt,
		pin: row.pin,
		pinExpiry: row.pinExpiry,
		isFavorite: favoriteIds.has(row.id),
	};
}

function getFavoriteIdsEffect(
	userId: string | null,
): Effect.Effect<Set<string>, Error> {
	if (!userId) return Effect.succeed(new Set<string>());

	return tryEffectPromise("Failed to fetch favorite servers", async () => {
		const rows = await db
			.select({ id: userFavoriteServers.a })
			.from(userFavoriteServers)
			.where(eq(userFavoriteServers.b, userId));

		return new Set(rows.map((row) => row.id));
	});
}

function getListWhere(category: ServerCategory) {
	if (category === "featured") {
		return gte(server.members, 1000);
	}

	return undefined;
}

function getListOrderBy(category: ServerCategory) {
	if (category === "new") {
		return [desc(server.createdAt)] as const;
	}

	if (category === "featured") {
		return [desc(server.upvotes), desc(server.members)] as const;
	}

	if (category === "popular") {
		return [desc(server.pin), desc(server.members)] as const;
	}

	if (category === "voted") {
		return [desc(server.upvotes)] as const;
	}

	return [desc(server.upvotes)] as const;
}

function listServersPageEffect(
	input: ServerListQueryInput,
	userId?: string | null,
): Effect.Effect<ServerListQueryResult, Error> {
	return Effect.gen(function* () {
		const favoriteIds = yield* getFavoriteIdsEffect(userId ?? null);

		const whereClause = getListWhere(input.category);
		const orderBy = getListOrderBy(input.category);
		const offset = (input.page - 1) * input.limit;

		const countQuery = db.select({ count: sql<number>`count(*)` }).from(server);
		const rowsQuery = db
			.select({
				id: server.id,
				name: server.name,
				description: server.description,
				tags: server.tags,
				members: server.members,
				online: server.online,
				upvotes: server.upvotes,
				icon: server.icon,
				banner: server.banner,
				inviteUrl: server.inviteUrl,
				createdAt: server.createdAt,
				pin: server.pin,
				pinExpiry: server.pinExpiry,
			})
			.from(server);

		const scopedCountQuery = whereClause
			? countQuery.where(whereClause)
			: countQuery;

		const scopedRowsQuery = whereClause
			? rowsQuery.where(whereClause)
			: rowsQuery;

		const [countRows, rows] = yield* Effect.all([
			tryEffectPromise("Failed to count servers", () => scopedCountQuery),
			tryEffectPromise("Failed to load server list", () =>
				scopedRowsQuery
					.orderBy(...orderBy)
					.limit(input.limit)
					.offset(offset),
			),
		]);

		const total = Number(countRows[0]?.count ?? 0);
		const totalPages = Math.max(1, Math.ceil(total / input.limit));

		return {
			servers: rows.map((row) => mapRowToPublicServer(row, favoriteIds)),
			total,
			totalPages,
			page: input.page,
			limit: input.limit,
		};
	});
}

function listServerFilterBundleEffect(
	userId?: string | null,
): Effect.Effect<ServerFilterBundle, Error> {
	return Effect.gen(function* () {
		const favoriteIds = yield* getFavoriteIdsEffect(userId ?? null);

		const rows = yield* tryEffectPromise("Failed to load all servers", () =>
			db
				.select({
					id: server.id,
					name: server.name,
					description: server.description,
					tags: server.tags,
					members: server.members,
					online: server.online,
					upvotes: server.upvotes,
					icon: server.icon,
					banner: server.banner,
					inviteUrl: server.inviteUrl,
					createdAt: server.createdAt,
					pin: server.pin,
					pinExpiry: server.pinExpiry,
				})
				.from(server),
		);

		const allServers = rows.map((row) =>
			mapRowToPublicServer(row, favoriteIds),
		);

		const tagCount = new Map<string, number>();
		for (const item of allServers) {
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

		const featuredServers = allServers.filter(
			(item) => item.members >= 1000,
		).length;
		const totalTags = allServers.reduce(
			(acc, item) => acc + item.tags.length,
			0,
		);

		return {
			allServers,
			categories,
			stats: {
				totalServers: allServers.length,
				featuredServers,
				totalTags,
			},
		};
	});
}

export async function listServersPage(
	input: ServerListQueryInput,
	userId?: string | null,
): Promise<ServerListQueryResult> {
	return runEffect(listServersPageEffect(input, userId));
}

export async function listServerFilterBundle(
	userId?: string | null,
): Promise<ServerFilterBundle> {
	return runEffect(listServerFilterBundleEffect(userId));
}
