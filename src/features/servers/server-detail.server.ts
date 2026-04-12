import { and, desc, eq, gte, sql } from "drizzle-orm";
import { Effect } from "effect";
import { db } from "#/drizzle/db";
import {
	report,
	review,
	server,
	user,
	userFavoriteServers,
	vote,
} from "#/drizzle/schema";
import { getSession } from "#/lib/auth.functions";
import { runEffect, tryEffectPromise } from "#/lib/effect-utils";
import type {
	ServerDetail,
	ServerRateResult,
	ServerReportResult,
	ServerReview,
	ServerVoteResult,
} from "./server-detail.types";
import type { PublicServer } from "./servers.types";

function dbEffect<A>(
	label: string,
	run: () => Promise<A>,
): Effect.Effect<A, Error> {
	return tryEffectPromise(label, run);
}

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

function getSessionUserIdEffect(): Effect.Effect<string | null, Error> {
	return Effect.gen(function* () {
		const session = yield* dbEffect("Failed to fetch session", () =>
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
	if (!userId) {
		return Effect.succeed(new Set<string>());
	}

	return dbEffect("Failed to fetch favorite server ids", async () => {
		const rows = await db
			.select({ id: userFavoriteServers.a })
			.from(userFavoriteServers)
			.where(eq(userFavoriteServers.b, userId));

		return new Set(rows.map((item) => item.id));
	});
}

function getRecentVoteCreatedAtEffect(
	userId: string | null,
	serverId: string,
): Effect.Effect<string | null, Error> {
	if (!userId) {
		return Effect.succeed(null);
	}

	const twelveHoursAgo = new Date(
		Date.now() - 12 * 60 * 60 * 1000,
	).toISOString();

	return dbEffect("Failed to fetch recent server vote", async () => {
		const rows = await db
			.select({ createdAt: vote.createdAt })
			.from(vote)
			.where(
				and(
					eq(vote.userId, userId),
					eq(vote.itemId, serverId),
					eq(vote.itemType, "server"),
					gte(vote.createdAt, twelveHoursAgo),
				),
			)
			.orderBy(desc(vote.createdAt))
			.limit(1);

		return rows[0]?.createdAt ?? null;
	});
}

function calculateAvgRating(reviews: ServerReview[]): number {
	if (!reviews.length) return 0;
	const total = reviews.reduce((sum, item) => sum + item.rating, 0);
	return Number((total / reviews.length).toFixed(2));
}

function getServerDetailEffect(
	serverId: string,
): Effect.Effect<ServerDetail | null, Error> {
	return Effect.gen(function* () {
		const userId = yield* getSessionUserIdEffect();
		const favoriteIds = yield* getFavoriteIdsEffect(userId);

		const serverRows = yield* dbEffect("Failed to fetch server detail", () =>
			db
				.select({
					id: server.id,
					name: server.name,
					description: server.description,
					longDescription: server.longDescription,
					tags: server.tags,
					members: server.members,
					online: server.online,
					upvotes: server.upvotes,
					icon: server.icon,
					banner: server.banner,
					inviteUrl: server.inviteUrl,
					createdAt: server.createdAt,
					ownerId: server.ownerId,
					website: server.website,
					rules: server.rules,
					features: server.features,
					screenshots: server.screenshots,
					pin: server.pin,
					pinExpiry: server.pinExpiry,
				})
				.from(server)
				.where(eq(server.id, serverId))
				.limit(1),
		);

		const currentServer = serverRows[0];
		if (!currentServer) return null;

		const [ownerRows, reviewRows, recentVoteCreatedAt, relatedRows] =
			yield* Effect.all([
				dbEffect("Failed to fetch server owner", () => {
					if (!currentServer.ownerId) {
						return Promise.resolve(
							[] as Array<{
								id: string;
								username: string;
								avatar: string;
							}>,
						);
					}

					return db
						.select({
							id: user.id,
							username: user.username,
							avatar: user.avatar,
						})
						.from(user)
						.where(eq(user.id, currentServer.ownerId))
						.limit(1);
				}),
				dbEffect("Failed to fetch server reviews", () =>
					db
						.select({
							id: review.id,
							createdAt: review.createdAt,
							botId: review.botId,
							rating: review.rating,
							vote: review.vote,
							comment: review.comment,
							userId: review.userId,
							serverId: review.serverId,
						})
						.from(review)
						.where(eq(review.serverId, serverId)),
				),
				getRecentVoteCreatedAtEffect(userId, serverId),
				dbEffect("Failed to fetch related servers", () =>
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
						.from(server)
						.where(sql`${server.id} <> ${serverId}`)
						.orderBy(desc(server.upvotes))
						.limit(40),
				),
			]);

		const reviews = reviewRows.map((item) => ({
			...item,
			rating: Number(item.rating ?? 0),
		}));

		const currentRating = calculateAvgRating(reviews);
		const userRating =
			reviews.find((item) => item.userId === userId)?.rating ?? 0;

		const currentTags = normalizeTags(currentServer.tags);
		const relatedServers = relatedRows
			.filter((item) => {
				const tags = normalizeTags(item.tags);
				return tags.some((tag) => currentTags.includes(tag));
			})
			.slice(0, 3)
			.map((item) => mapRowToPublicServer(item, favoriteIds));

		const owner = ownerRows[0]
			? {
					id: ownerRows[0].id,
					username: ownerRows[0].username,
					avatar: ownerRows[0].avatar,
				}
			: null;

		const detail: ServerDetail = {
			...mapRowToPublicServer(currentServer, favoriteIds),
			longDescription: currentServer.longDescription,
			website: currentServer.website,
			rules: Array.isArray(currentServer.rules)
				? currentServer.rules.filter(Boolean)
				: [],
			features: Array.isArray(currentServer.features)
				? currentServer.features.filter(Boolean)
				: [],
			screenshots: Array.isArray(currentServer.screenshots)
				? currentServer.screenshots.filter(Boolean)
				: [],
			owner,
			reviews,
			currentRating,
			totalReviews: reviews.length,
			userRating,
			hasVotedRecently: Boolean(recentVoteCreatedAt),
			nextVoteAt: recentVoteCreatedAt
				? new Date(
						new Date(recentVoteCreatedAt).getTime() + 12 * 60 * 60 * 1000,
					).toISOString()
				: null,
			relatedServers,
		};

		return detail;
	});
}

function voteServerEffect(
	serverId: string,
): Effect.Effect<ServerVoteResult, Error> {
	return Effect.gen(function* () {
		const userId = yield* getSessionUserIdEffect();
		if (!userId) {
			return yield* Effect.fail(new Error("請先登入再投票"));
		}

		const targetRows = yield* dbEffect("Failed to find server for vote", () =>
			db
				.select({ id: server.id, upvotes: server.upvotes })
				.from(server)
				.where(eq(server.id, serverId))
				.limit(1),
		);
		const target = targetRows[0];
		if (!target) {
			return yield* Effect.fail(new Error("找不到伺服器"));
		}

		const recentVoteCreatedAt = yield* getRecentVoteCreatedAtEffect(
			userId,
			serverId,
		);
		if (recentVoteCreatedAt) {
			return {
				success: false,
				message: "每 12 小時只能投票一次",
				upvotes: target.upvotes,
				nextVoteAt: new Date(
					new Date(recentVoteCreatedAt).getTime() + 12 * 60 * 60 * 1000,
				).toISOString(),
			};
		}

		yield* dbEffect("Failed to cast server vote", async () => {
			await db.execute(sql`
				with inserted_vote as (
					insert into "Vote" ("id", "userId", "itemId", "itemType")
					values (${crypto.randomUUID()}, ${userId}, ${serverId}, 'server')
				)
				update "Server"
				set "upvotes" = "upvotes" + 1
				where "id" = ${serverId}
			`);
		});

		const updatedRows = yield* dbEffect(
			"Failed to read updated server votes",
			() =>
				db
					.select({ upvotes: server.upvotes })
					.from(server)
					.where(eq(server.id, serverId))
					.limit(1),
		);

		return {
			success: true,
			message: "投票成功",
			upvotes: updatedRows[0]?.upvotes ?? target.upvotes + 1,
			nextVoteAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
		};
	});
}

function rateServerEffect(
	serverId: string,
	rating: number,
): Effect.Effect<ServerRateResult, Error> {
	return Effect.gen(function* () {
		const userId = yield* getSessionUserIdEffect();
		if (!userId) {
			return yield* Effect.fail(new Error("請先登入再評分"));
		}

		const targetRows = yield* dbEffect("Failed to find server for rating", () =>
			db
				.select({ id: server.id })
				.from(server)
				.where(eq(server.id, serverId))
				.limit(1),
		);

		if (!targetRows[0]) {
			return yield* Effect.fail(new Error("找不到伺服器"));
		}

		const existing = yield* dbEffect(
			"Failed to fetch current user review",
			() =>
				db.query.review.findFirst({
					where: and(eq(review.userId, userId), eq(review.serverId, serverId)),
					columns: {
						id: true,
					},
				}),
		);

		if (existing) {
			yield* dbEffect("Failed to update review rating", () =>
				db.update(review).set({ rating }).where(eq(review.id, existing.id)),
			);
		} else {
			yield* dbEffect("Failed to create review rating", () =>
				db.insert(review).values({
					id: crypto.randomUUID(),
					userId,
					serverId,
					botId: null,
					rating,
					vote: 0,
					comment: null,
				}),
			);
		}

		const statsRows = yield* dbEffect("Failed to calculate rating stats", () =>
			db
				.select({
					averageRating: sql<number>`coalesce(avg(${review.rating}), 0)`,
					totalReviews: sql<number>`count(*)`,
				})
				.from(review)
				.where(eq(review.serverId, serverId)),
		);

		return {
			rating,
			averageRating: Number(statsRows[0]?.averageRating ?? 0),
			totalReviews: Number(statsRows[0]?.totalReviews ?? 0),
		};
	});
}

function reportServerEffect(input: {
	serverId: string;
	itemName: string;
	subject: string;
	content: string;
}): Effect.Effect<ServerReportResult, Error> {
	return Effect.gen(function* () {
		const userId = yield* getSessionUserIdEffect();
		if (!userId) {
			return yield* Effect.fail(new Error("請先登入再檢舉"));
		}

		yield* dbEffect("Failed to submit report", () =>
			db.insert(report).values({
				id: crypto.randomUUID(),
				subject: input.subject,
				content: input.content,
				type: "server",
				itemId: input.serverId,
				itemName: input.itemName,
				reportedById: userId,
				attachments: [],
			}),
		);

		return {
			success: true,
			message: "檢舉已送出，我們會盡快審核",
		};
	});
}

export function getServerDetailById(
	serverId: string,
): Promise<ServerDetail | null> {
	return runEffect(getServerDetailEffect(serverId));
}

export function voteServerById(serverId: string): Promise<ServerVoteResult> {
	return runEffect(voteServerEffect(serverId));
}

export function rateServerById(
	serverId: string,
	rating: number,
): Promise<ServerRateResult> {
	return runEffect(rateServerEffect(serverId, rating));
}

export function reportServerById(input: {
	serverId: string;
	itemName: string;
	subject: string;
	content: string;
}): Promise<ServerReportResult> {
	return runEffect(reportServerEffect(input));
}
