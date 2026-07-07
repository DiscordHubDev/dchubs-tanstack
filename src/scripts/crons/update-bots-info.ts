// scripts/update-bots-info.ts
import { eq } from "drizzle-orm";
import { Effect, Array as EffectArray, Option, Schema, Either } from "effect";
import { client, db } from "#/drizzle/db";
import { bot } from "#/drizzle/schema";
import { fetchBotRpcEffect, fetchUserEffect } from "#/utils/fetch-rpc";
import { DiscordBotRPCInfoSchema } from "#/features/bots/bot-submit.schemas";

const DB_BATCH_WRITE_SIZE = 20;
// Discord API 有速率限制，這裡限制同時處理的 bot 數量，避免 429
const FETCH_CONCURRENCY = 5;

type BotRow = Pick<
  typeof bot.$inferSelect,
  "id" | "name" | "icon" | "banner" | "verified" | "isAdmin"
>;
type BotInfoUpdateSet = Pick<
  Partial<typeof bot.$inferInsert>,
  "name" | "icon" | "banner" | "verified" | "isAdmin"
>;
type PendingUpdate<T> = { id: string; data: T };

function hasAdminPermission(permissions: number | string | bigint): boolean {
  const perms = BigInt(permissions);
  const ADMINISTRATOR_FLAGS = 8n;
  return (perms & ADMINISTRATOR_FLAGS) === ADMINISTRATOR_FLAGS;
}

/**
 * 針對單一 bot，同時抓取 RPC 資訊與 member (使用者) 資訊。
 * - RPC 失敗 -> 整體視為失敗 (回傳 Option.none())，因為沒有 RPC 資料就沒東西可更新
 * - Member 失敗 -> 不影響整體，avatar/banner 會 fallback 成資料庫舊值
 */
const fetchUpdatedBotInfoEffect = (botId: string) =>
  Effect.gen(function* () {
    const [rpcData, memberResult] = yield* Effect.all(
      [
        fetchBotRpcEffect(botId).pipe(
          Effect.flatMap(Schema.decodeUnknown(DiscordBotRPCInfoSchema)),
        ),
        fetchUserEffect(botId).pipe(Effect.either),
      ],
      { concurrency: "unbounded" },
    );

    if (Either.isLeft(memberResult)) {
      console.warn(
        `⚠️ [${botId}] Member 資訊取得失敗，將只更新 RPC 相關欄位: ${memberResult.left?.message ?? memberResult.left}`,
      );
    }
    const memberData = Either.isRight(memberResult) ? memberResult.right : null;

    return Option.some({
      name: typeof rpcData.name === "string" ? rpcData.name : null,
      avatar_url: memberData?.avatarUrl ?? null,
      banner_url: memberData?.bannerUrl ?? null,
      verified: rpcData.is_verified ?? false,
      isAdmin: hasAdminPermission(rpcData.install_params?.permissions ?? 0),
    });
  }).pipe(
    Effect.catchAll((error) => {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object"
            ? JSON.stringify(error)
            : String(error);
      console.warn(`⚠️ 無法取得 ${botId} 的 Discord 官方資訊: ${message}`);
      return Effect.succeed(
        Option.none<{
          name: string | null;
          avatar_url: string | null;
          banner_url: string | null;
          verified: boolean;
          isAdmin: boolean;
        }>(),
      );
    }),
  );

const flushUpdatesEffect = <T extends Record<string, unknown>>(
  pending: PendingUpdate<T>[],
  label: string,
) =>
  Effect.tryPromise({
    try: async () => {
      if (pending.length === 0) return;
      await db.transaction(async (tx) => {
        for (const { id, data } of pending) {
          await tx.update(bot).set(data).where(eq(bot.id, id));
        }
      });
      console.log(`💾 [${label}] 批次寫入 ${pending.length} 筆到資料庫`);
    },
    catch: (err) =>
      new Error(
        `Database Transaction Failed (${label}): ${err instanceof Error ? err.message : String(err)}`,
      ),
  });

const updateBotBasicInfoProgram = Effect.gen(function* () {
  console.log("🚀 開始更新 Bot 基本資訊...");
  const isDev = process.env.NODE_ENV === "development";

  let query = db
    .select({
      id: bot.id,
      name: bot.name,
      icon: bot.icon,
      banner: bot.banner,
      verified: bot.verified,
      isAdmin: bot.isAdmin,
    })
    .from(bot)
    .where(eq(bot.status, "approved"));

  if (isDev) query = query.limit(1) as any;

  const bots: BotRow[] = yield* Effect.tryPromise(() => query);
  console.log(`📋 共需處理 ${bots.length} 個 bots`);

  const chunks = EffectArray.chunksOf(bots, DB_BATCH_WRITE_SIZE);

  for (const chunk of chunks) {
    // 同一批次內，用有限並發同時抓取 Discord 資訊，比逐一 await 快很多
    const results = yield* Effect.all(
      chunk.map((current) =>
        Effect.gen(function* () {
          console.log(`🔄 [基本資訊] 處理 ${current.name} (${current.id})`);
          const infoOpt = yield* fetchUpdatedBotInfoEffect(current.id);
          return { current, infoOpt };
        }),
      ),
      { concurrency: FETCH_CONCURRENCY },
    );

    const pendingUpdates: PendingUpdate<BotInfoUpdateSet>[] = [];

    for (const { current, infoOpt } of results) {
      if (Option.isSome(infoOpt)) {
        const data: BotInfoUpdateSet = {
          name: infoOpt.value.name ?? current.name,
          icon: infoOpt.value.avatar_url ?? current.icon,
          banner: infoOpt.value.banner_url ?? current.banner,
          verified: infoOpt.value.verified,
          isAdmin: infoOpt.value.isAdmin,
        };
        pendingUpdates.push({ id: current.id, data });
      } else {
        console.warn(`⏭️ [${current.id}] 跳過此筆更新（無法取得有效資料）`);
      }
    }

    yield* flushUpdatesEffect(pendingUpdates, "基本資訊");
  }

  console.log("✅ Bot 基本資訊全部更新完畢！");
});

Effect.runPromiseExit(updateBotBasicInfoProgram).then((exit) => {
  console.log("🔌 正在關閉資料庫連線池...");
  client.close();
  if (exit._tag === "Failure") {
    console.error("❌ 執行發生錯誤:", exit.cause);
    process.exit(1);
  }
  process.exit(0);
});
