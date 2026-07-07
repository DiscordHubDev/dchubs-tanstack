import { and, arrayOverlaps, asc, desc, eq, gte, ne, sql } from "drizzle-orm";
import { Effect } from "effect";
import { db } from "#/drizzle/db";
import {
  bot,
  botCommand,
  botDevelopers,
  report,
  review,
  user,
  userFavoriteBots,
  vote,
} from "#/drizzle/schema";
import { runEffect, tryEffectPromise } from "#/lib/effect-utils";
import { getUserBaseProfileEffect } from "../users/users.server";
import { sendDiscordWebhookEffect, triggerVoteNotificationEffect } from "../webhook/webhook.server";
import type {
  BotDetail,
  BotRateResult,
  BotReportResult,
  BotReview,
  BotVoteResult,
} from "./bot-detail.types";
import type { PublicBot, RelatedBot } from "./bots.types";

function dbEffect<A>(label: string, run: () => Promise<A>): Effect.Effect<A, Error> {
  return tryEffectPromise(label, run);
}

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
    nsfw: boolean;
    termsOfServiceUrl: string | null;
    privacyPolicyUrl: string | null;
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
    approvedAt: row.approvedAt || new Date().toISOString(),
    pin: row.pin,
    pinExpiry: row.pinExpiry,
    verified: row.verified,
    isFavorite: favoriteIds.has(row.id),
    isAdmin: row.isAdmin,
    nsfw: row.nsfw,
    termsOfServiceUrl: row.termsOfServiceUrl,
    privacyPolicyUrl: row.privacyPolicyUrl,
  };
}

function getFavoriteIdsEffect(
  userId: string | null | undefined,
): Effect.Effect<Set<string>, Error> {
  if (!userId) {
    return Effect.succeed(new Set<string>());
  }

  return dbEffect("Failed to fetch favorite bot ids", async () => {
    const rows = await db
      .select({ id: userFavoriteBots.a })
      .from(userFavoriteBots)
      .where(eq(userFavoriteBots.b, userId));

    return new Set(rows.map((item) => item.id));
  });
}

function getRecentVoteCreatedAtEffect(
  userId: string | null | undefined, // ✅ 加上 undefined 支援
  botId: string,
): Effect.Effect<string | null, Error> {
  // ✅ 只要沒有 userId，代表是遊客，直接回傳 null
  if (!userId) {
    return Effect.succeed(null);
  }

  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

  return dbEffect("Failed to fetch recent bot vote", async () => {
    const rows = await db
      .select({ createdAt: vote.createdAt })
      .from(vote)
      .where(
        and(
          eq(vote.userId, userId), // 此時 TS 知道 userId 絕對是 string
          eq(vote.itemId, botId),
          eq(vote.itemType, "bot"),
          gte(vote.createdAt, twelveHoursAgo),
        ),
      )
      .orderBy(desc(vote.createdAt))
      .limit(1);

    return rows[0]?.createdAt ?? null;
  });
}

function calculateAvgRating(reviews: BotReview[]): number {
  if (!reviews.length) return 0;
  const total = reviews.reduce((sum, item) => sum + item.rating, 0);
  return Number((total / reviews.length).toFixed(2));
}

function getBotDetailEffect(
  botId: string,
  userId: string | null | undefined,
): Effect.Effect<BotDetail | null, Error> {
  return Effect.gen(function* () {
    const favoriteIds = yield* getFavoriteIdsEffect(userId);

    const botRows = yield* dbEffect("Failed to fetch bot detail", () =>
      db
        .select({
          id: bot.id,
          name: bot.name,
          description: bot.description,
          longDescription: bot.longDescription,
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
          prefix: bot.prefix,
          features: bot.features,
          screenshots: bot.screenshots,
          nsfw: bot.nsfw,
          termsOfServiceUrl: bot.termsOfServiceUrl,
          privacyPolicyUrl: bot.privacyPolicyUrl,
        })
        .from(bot)
        .where(and(eq(bot.id, botId), eq(bot.status, "approved")))
        .limit(1),
    );

    const currentBot = botRows[0];
    if (!currentBot) return null;

    const currentTags = normalizeTags(currentBot.tags);

    const [commandRows, developerRows, reviewRows, recentVoteCreatedAt, relatedRows] =
      yield* Effect.all([
        dbEffect("Failed to fetch bot commands", () =>
          db
            .select({
              id: botCommand.id,
              name: botCommand.name,
              description: botCommand.description,
              usage: botCommand.usage,
              category: botCommand.category,
            })
            .from(botCommand)
            .where(eq(botCommand.botId, botId))
            .orderBy(asc(botCommand.category), asc(botCommand.name)),
        ),
        dbEffect("Failed to fetch bot developers", () =>
          db
            .select({
              id: user.discordId,
              username: user.username,
              name: user.name,
              avatar: user.avatar,
            })
            .from(botDevelopers)
            .innerJoin(user, eq(botDevelopers.b, user.id))
            .where(eq(botDevelopers.a, botId)),
        ),
        dbEffect("Failed to fetch bot reviews", () =>
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
            .where(eq(review.botId, botId)),
        ),
        getRecentVoteCreatedAtEffect(userId, botId),
        dbEffect("Failed to fetch related bots", () =>
          db
            .select({
              id: bot.id,
              icon: bot.icon,
              name: bot.name,
              servers: bot.servers,
              overlapCount: sql<number>`cardinality(
            ARRAY(
              SELECT UNNEST(${bot.tags})
              INTERSECT
              SELECT UNNEST(${sql`ARRAY[${sql.join(currentTags, sql`, `)}]`}::text[])
            )
          )`,
            })
            .from(bot)
            .where(
              and(
                eq(bot.status, "approved"),
                ne(bot.id, botId),
                arrayOverlaps(bot.tags, currentTags),
              ),
            )
            .orderBy(
              desc(sql`cardinality(
            ARRAY(
              SELECT UNNEST(${bot.tags})
              INTERSECT
              SELECT UNNEST(${sql`ARRAY[${sql.join(currentTags, sql`, `)}]`}::text[])
            )
          )`),
              desc(bot.upvotes),
            )
            .limit(3),
        ),
      ]);

    const reviews = reviewRows.map((item) => ({
      ...item,
      rating: Number(item.rating ?? 0),
    }));

    const currentRating = calculateAvgRating(reviews);
    const userRating = reviews.find((item) => item.userId === userId)?.rating ?? 0;

    const relatedBots: RelatedBot[] = relatedRows.map(({ id, icon, name, servers }) => ({
      id,
      icon,
      name,
      servers,
    }));
    console.log("devs: ", developerRows);

    const detail: BotDetail = {
      ...mapRowToPublicBot(currentBot, favoriteIds),
      longDescription: currentBot.longDescription,
      prefix: currentBot.prefix,
      features: Array.isArray(currentBot.features) ? currentBot.features.filter(Boolean) : [],
      screenshots: Array.isArray(currentBot.screenshots)
        ? currentBot.screenshots.filter(Boolean)
        : [],
      commands: commandRows,
      developers: developerRows,
      reviews,
      currentRating,
      totalReviews: reviews.length,
      userRating,
      hasVotedRecently: Boolean(recentVoteCreatedAt),
      nextVoteAt: recentVoteCreatedAt
        ? new Date(new Date(recentVoteCreatedAt).getTime() + 12 * 60 * 60 * 1000).toISOString()
        : null,
      relatedBots,
    };

    return detail;
  });
}

function voteBotEffect(botId: string, userId: string): Effect.Effect<BotVoteResult, Error> {
  return Effect.gen(function* () {
    // 1. 平行執行查詢：同時獲取「機器人資訊」與「最後投票時間」降低 I/O 延遲
    const [targetRows, recentVoteCreatedAt] = yield* Effect.all(
      [
        dbEffect("Failed to find bot for vote", () =>
          db
            .select({
              id: bot.id,
              upvotes: bot.upvotes,
              name: bot.name,
              voteNotificationUrl: bot.voteNotificationUrl,
              secret: bot.secret,
              customEmbed: bot.customEmbed,
            })
            .from(bot)
            .where(and(eq(bot.id, botId), eq(bot.status, "approved")))
            .limit(1),
        ),
        getRecentVoteCreatedAtEffect(userId, botId),
      ],
      { concurrency: "unbounded" },
    );

    const target = targetRows[0];
    if (!target) {
      return yield* Effect.fail(new Error("找不到機器人"));
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

    // 3. 執行 Transaction 並直接回傳更新後的票數 (省去最後一次 Select 查詢)
    const updatedRows = yield* dbEffect("Failed to cast vote", () =>
      db.transaction(async (tx) => {
        // 3.1 寫入投票紀錄
        await tx.insert(vote).values({
          id: crypto.randomUUID(),
          userId: userId,
          itemId: botId,
          itemType: "bot",
        });

        // 3.2 遞增票數並利用 RETURNING 獲取最新結果
        return await tx
          .update(bot)
          .set({ upvotes: sql`${bot.upvotes} + 1` })
          .where(eq(bot.id, botId))
          .returning({ upvotes: bot.upvotes });
      }),
    );

    // 🚀 4. 獲取使用者資訊 (確保在 DB 寫入成功後才查詢)
    const userInfo = yield* getUserBaseProfileEffect(userId).pipe(
      Effect.catchAll(() => Effect.succeed(null)),
      Effect.map((user) => {
        if (!user) {
          return {
            name: "神祕投票者",
            avatar: "https://cdn.discordapp.com/embed/avatars/0.png",
          };
        }
        return {
          name: user.name || user.username || "未命名使用者",
          avatar: user.avatar,
        };
      }),
    );

    const discordPayload = {
      _tag: "vote" as const,
      type: "bot" as const,
      user: { id: userId, username: userInfo.name },
      target: { id: botId, name: target.name },
    };

    yield* sendDiscordWebhookEffect(discordPayload).pipe(Effect.forkDaemon);

    // 🚀 6. 觸發自訂 Webhook 給機器人開發者，並傳入 userInfo
    if (target.voteNotificationUrl) {
      yield* triggerVoteNotificationEffect(target.voteNotificationUrl, target.secret, {
        targetId: botId,
        userId,
        user: userInfo, // 向下傳遞使用者資訊
        type: "bot",
        timestamp: new Date().toISOString(),
        votes: updatedRows?.[0]?.upvotes ?? target.upvotes + 1,
        targetName: target.name,
        voteUrl: `https://dchubs.org/bots/${botId}`,
        customEmbed: target.customEmbed,
      }).pipe(Effect.forkDaemon);
    }

    return {
      success: true,
      message: "投票成功",
      upvotes: updatedRows?.[0]?.upvotes ?? target.upvotes + 1,
      nextVoteAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    };
  });
}

function rateBotEffect(
  botId: string,
  rating: number,
  userId: string,
): Effect.Effect<BotRateResult, Error> {
  return Effect.gen(function* () {
    const targetRows = yield* dbEffect("Failed to find bot for rating", () =>
      db
        .select({ id: bot.id })
        .from(bot)
        .where(and(eq(bot.id, botId), eq(bot.status, "approved")))
        .limit(1),
    );

    if (!targetRows[0]) {
      return yield* Effect.fail(new Error("找不到機器人"));
    }

    const existing = yield* dbEffect("Failed to fetch current user review", () =>
      db.query.review.findFirst({
        where: and(eq(review.userId, userId), eq(review.botId, botId)),
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
          botId,
          serverId: null,
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
        .where(eq(review.botId, botId)),
    );

    return {
      rating,
      averageRating: Number(statsRows[0]?.averageRating ?? 0),
      totalReviews: Number(statsRows[0]?.totalReviews ?? 0),
    };
  });
}

function reportBotEffect(input: {
  botId: string;
  itemName: string;
  subject: string;
  content: string;
  userId: string; // ✅ 這裡現在是必填字串了
}): Effect.Effect<BotReportResult, Error> {
  return Effect.gen(function* () {
    // ❌ 刪掉這段：const userId = yield* getSessionUserIdEffect();
    // ❌ 刪掉這段：if (!userId) { return yield* Effect.fail(...) }

    yield* dbEffect("Failed to submit report", () =>
      db.insert(report).values({
        id: crypto.randomUUID(),
        subject: input.subject,
        content: input.content,
        type: "bot",
        itemId: input.botId,
        itemName: input.itemName,
        reportedById: input.userId, // ✅ 直接使用外部傳進來的 input.userId
        attachments: [],
      }),
    );

    return {
      success: true,
      message: "檢舉已送出，我們會盡快審核",
    };
  });
}

export function getBotDetailById(
  botId: string,
  userId: string | null | undefined,
): Promise<BotDetail | null> {
  return runEffect(getBotDetailEffect(botId, userId));
}

export function voteBotById(botId: string, userId: string): Promise<BotVoteResult> {
  return runEffect(voteBotEffect(botId, userId));
}

export function rateBotById(botId: string, rating: number, userId: string): Promise<BotRateResult> {
  return runEffect(rateBotEffect(botId, rating, userId));
}

export function reportBotById(input: {
  botId: string;
  itemName: string;
  subject: string;
  content: string;
  userId: string;
}): Promise<BotReportResult> {
  return runEffect(reportBotEffect({ ...input }));
}
