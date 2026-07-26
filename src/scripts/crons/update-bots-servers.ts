// scripts/update-bots-servers.ts
import { eq, asc, sql, inArray } from "drizzle-orm";
import { Data, Effect, Option } from "effect";
import { client, db } from "#/drizzle/db";
import { bot } from "#/drizzle/schema";

const BOT_PROCESS_DELAY_MS = 3000;
const PROCESS_LIMIT = 15;

const FETCH_TIMEOUT_MS = 720_000;
const ADVISORY_LOCK_KEY = 727272;

class BotUpdateError extends Data.TaggedError("BotUpdateError")<{
  readonly botId: string;
  readonly message: string;
}> {}

const fetchBotServerCountEffect = (botId: string) =>
  Effect.tryPromise({
    try: async () => {
      const res = await fetch(`https://getbotserver.dawngs.top/get_bot_server_count`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bot_id: botId }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (res.status === 524 || res.status === 429 || !res.ok) {
        return Option.none();
      }
      const data = await res.json();
      const count = Array.isArray(data)
        ? data.find((item) => typeof item.server_count === "number")?.server_count
        : typeof data?.server_count === "number"
          ? data.server_count
          : null;
      return count != null ? Option.some(count) : Option.none();
    },
    catch: (_err) => new BotUpdateError({ botId, message: "Server Count Fetch Failed" }),
  }).pipe(
    Effect.catchAll((_err) => {
      console.error(`❌ ${botId} 獲取 Server count 發生錯誤`);
      return Effect.succeed(Option.none());
    }),
  );

// 嘗試取得 advisory lock；拿不到代表已有另一個實例在跑，直接跳過本次排程
const tryAcquireLockEffect = Effect.tryPromise(() =>
  db.execute(sql`SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) AS locked`),
);

const releaseLockEffect = Effect.tryPromise(() =>
  db.execute(sql`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`),
).pipe(Effect.catchAll(() => Effect.void));

// 用交易 + SKIP LOCKED 認領這批 bot：一開始就把 updatedAt 更新掉（等同標記「處理中」），
// 這樣即使有並發實例，也不會撈到同一批 bot，從根本避免「同一 bot_id 被重複請求」。
const claimBotsEffect = Effect.tryPromise(() =>
  db.transaction(async (tx) => {
    const bots = await tx
      .select({ id: bot.id, name: bot.name })
      .from(bot)
      .where(eq(bot.status, "approved"))
      .orderBy(asc(bot.updatedAt))
      .limit(PROCESS_LIMIT)
      .for("update", { skipLocked: true });

    if (bots.length > 0) {
      await tx
        .update(bot)
        .set({ updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(
          inArray(
            bot.id,
            bots.map((b) => b.id),
          ),
        );
    }

    return bots;
  }),
);

const updateBotServerCountProgram = Effect.gen(function* () {
  console.log("🔢 開始排程更新伺服器數量...");

  const lockResult = yield* tryAcquireLockEffect;
  const locked = (lockResult as unknown as { rows: { locked: boolean }[] }).rows?.[0]?.locked;

  if (!locked) {
    console.log("⏭️ 已有另一個排程實例正在執行，本次跳過");
    return;
  }

  try {
    // 認領批次（同時完成「查詢」與「標記處理中」，避免並發重複撈取）
    const bots = yield* claimBotsEffect;

    console.log(`📋 本次排程將處理 ${bots.length} 個 Bot 的伺服器數量`);

    for (let i = 0; i < bots.length; i++) {
      const current = bots[i];
      console.log(`🔄 [伺服器數量] 處理 ${current.name} (${current.id}) [${i + 1}/${bots.length}]`);

      const countOpt = yield* fetchBotServerCountEffect(current.id);

      if (Option.isSome(countOpt)) {
        yield* Effect.tryPromise(() =>
          db
            .update(bot)
            .set({
              servers: countOpt.value,
              updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(bot.id, current.id)),
        );
        console.log(`✅ ${current.name} 更新為 ${countOpt.value} 個伺服器`);
      } else {
        console.log(`⚠️ ${current.name} 本次抓取失敗，稍後重試`);
      }

      if (i < bots.length - 1) {
        yield* Effect.sleep(`${BOT_PROCESS_DELAY_MS} millis`);
      }
    }

    console.log("🎉 本次伺服器數量批次更新完畢！");
  } finally {
    yield* releaseLockEffect;
  }
});

Effect.runPromiseExit(updateBotServerCountProgram).then((exit) => {
  console.log("🔌 正在關閉資料庫連線池...");
  client.close();
  if (exit._tag === "Failure") {
    console.error("❌ 執行發生錯誤:", exit.cause);
    process.exit(1);
  }
  process.exit(0);
});
