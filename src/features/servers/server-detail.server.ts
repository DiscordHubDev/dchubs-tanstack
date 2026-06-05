import { and, desc, eq, gte, ne, sql } from "drizzle-orm";
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
import { ServerNotFoundError } from "#/errors/server-error";
import { getSessionUserIdEffect } from "#/lib/edge-context";
import { runEffect, tryEffectPromise } from "#/lib/effect-utils";
import type {
	ServerDetail,
	ServerRateResult,
	ServerReportResult,
	ServerReview,
	ServerVoteResult,
} from "./server-detail.types";
import type { PublicServer } from "./servers.types";

// 提取：處理陣列型別的輔助函式，避免重複的 filter(Boolean) 邏輯
const cleanStringArray = (arr: unknown): string[] =>
	Array.isArray(arr) ? arr.filter(Boolean) : [];

// 提取：將魔法數字 (Magic Number) 轉換為具語意化的常數
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

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
		nsfw: boolean;
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
		nsfw: row.nsfw,
	};
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
	userId: string | null = null,
): Effect.Effect<ServerDetail | null, Error> {
	return Effect.gen(function* () {
		// 1. 並行獲取「我的最愛 IDs」與「伺服器詳細資訊」
		// 這兩者互不依賴，可以同時發起請求以節省時間
		const [favoriteIds, serverRows] = yield* Effect.all(
			[
				getFavoriteIdsEffect(userId),
				dbEffect("Failed to fetch server detail", () =>
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
							nsfw: server.nsfw,
						})
						.from(server)
						.where(eq(server.id, serverId))
						.limit(1),
				),
			],
			{ concurrency: "unbounded" },
		);

		const currentServer = serverRows[0];
		if (!currentServer) return null;

		// 2. 並行獲取所有依賴 currentServer 的後續資料
		const [ownerRows, reviewRows, recentVoteCreatedAt, relatedRows] =
			yield* Effect.all(
				[
					// 優化：直接使用 Effect 邏輯處理 ownerId，避免在 dbEffect 中回傳假 Promise
					currentServer.ownerId
						? dbEffect("Failed to fetch server owner", () =>
								db
									.select({
										id: user.id,
										username: user.username,
										name: user.name,
										avatar: user.avatar,
									})
									.from(user)
									.where(eq(user.id, currentServer.ownerId!))
									.limit(1),
							)
						: Effect.succeed([]),

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
								nsfw: server.nsfw,
							})
							.from(server)
							.where(ne(server.id, serverId))
							.orderBy(desc(server.upvotes))
							.limit(40),
					),
				],
				{ concurrency: "unbounded" },
			);

		// 3. 處理關聯資料
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

		const nextVoteAt = recentVoteCreatedAt
			? new Date(
					new Date(recentVoteCreatedAt).getTime() + TWELVE_HOURS_MS,
				).toISOString()
			: null;

		// 4. 組裝最終結果
		return {
			...mapRowToPublicServer(currentServer, favoriteIds),
			longDescription: currentServer.longDescription,
			website: currentServer.website,
			rules: cleanStringArray(currentServer.rules),
			features: cleanStringArray(currentServer.features),
			screenshots: cleanStringArray(currentServer.screenshots),
			nsfw: currentServer.nsfw,
			owner: ownerRows[0] ?? null, // 優化：利用 Nullish Coalescing 直接賦值
			reviews,
			currentRating,
			totalReviews: reviews.length,
			userRating,
			hasVotedRecently: Boolean(recentVoteCreatedAt),
			nextVoteAt,
			relatedServers,
		} satisfies ServerDetail;
	});
}

function voteServerEffect(
	serverId: string,
	userId: string,
): Effect.Effect<ServerVoteResult, ServerNotFoundError | Error> {
	return Effect.gen(function* () {
		// 1. 平行執行查詢：同時獲取「伺服器資訊」與「最後投票時間」來降低 I/O 延遲
		const [targetRows, recentVoteCreatedAt] = yield* Effect.all(
			[
				dbEffect("Failed to find server for vote", () =>
					db
						.select({ id: server.id, upvotes: server.upvotes })
						.from(server)
						.where(eq(server.id, serverId))
						.limit(1),
				),
				getRecentVoteCreatedAtEffect(userId, serverId),
			],
			{ concurrency: "unbounded" },
		);

		const target = targetRows[0];
		if (!target) {
			// 在 Effect.gen 中，直接 yield* Effect.fail 即可中斷執行，不需加上 return
			yield* Effect.fail(new ServerNotFoundError({}));
		}

		// 2. 檢查冷卻時間
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

		// 3. 執行 Transaction 並直接回傳更新後的票數 (減少一次 DB 查詢)
		const updatedRows = yield* dbEffect("Failed to cast server vote", () =>
			db.transaction(async (tx) => {
				// 3.1 寫入投票紀錄
				await tx.insert(vote).values({
					id: crypto.randomUUID(),
					userId: userId,
					itemId: serverId,
					itemType: "server",
				});

				// 3.2 遞增票數並利用 RETURNING 語法直接獲取最新結果 (需 DB 支援，如 Postgres/SQLite)
				return await tx
					.update(server)
					.set({ upvotes: sql`${server.upvotes} + 1` })
					.where(eq(server.id, serverId))
					.returning({ upvotes: server.upvotes });
			}),
		);

		return {
			success: true,
			message: "投票成功",
			// 若使用 MySQL 不支援 returning，updatedRows 可能為空，此處提供安全降級
			upvotes: updatedRows?.[0]?.upvotes ?? target.upvotes + 1,
			nextVoteAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
		};
	});
}

function rateServerEffect(
	serverId: string,
	rating: number,
	userId: string,
): Effect.Effect<ServerRateResult, ServerNotFoundError | Error> {
	return Effect.gen(function* () {
		// 1. 確認伺服器是否存在
		const targetRows = yield* dbEffect("Failed to find server for rating", () =>
			db
				.select({ id: server.id })
				.from(server)
				.where(eq(server.id, serverId))
				.limit(1),
		);

		if (!targetRows[0]) {
			yield* Effect.fail(new ServerNotFoundError({}));
		}

		yield* dbEffect("Failed to upsert review rating", () =>
			db
				.insert(review)
				.values({
					id: crypto.randomUUID(),
					userId,
					serverId,
					botId: null,
					rating,
					vote: 0,
					comment: null,
				})
				.onConflictDoUpdate({
					target: [review.userId, review.serverId],
					set: { rating },
				}),
		);

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
	reporterId: string;
}): Effect.Effect<ServerReportResult, Error> {
	return Effect.gen(function* () {
		yield* dbEffect("Failed to submit report", () =>
			db.insert(report).values({
				id: crypto.randomUUID(),
				subject: input.subject,
				content: input.content,
				type: "server",
				itemId: input.serverId,
				itemName: input.itemName,
				reportedById: input.reporterId,
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
	userId: string | null = null,
): Promise<ServerDetail | null> {
	return runEffect(getServerDetailEffect(serverId, userId));
}

export function voteServerById(
	serverId: string,
	userId: string,
): Promise<ServerVoteResult> {
	return runEffect(voteServerEffect(serverId, userId));
}

export function rateServerById(
	serverId: string,
	rating: number,
	userId: string,
): Promise<ServerRateResult> {
	return runEffect(rateServerEffect(serverId, rating, userId));
}

export function reportServerById(input: {
	serverId: string;
	itemName: string;
	subject: string;
	content: string;
	reporterId: string;
}): Promise<ServerReportResult> {
	return runEffect(reportServerEffect(input));
}
