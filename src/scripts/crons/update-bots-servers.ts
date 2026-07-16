// scripts/update-bots-servers.ts
import { eq, asc, sql } from "drizzle-orm";
import { Data, Effect, Option } from "effect";
import { client, db } from "#/drizzle/db";
import { bot } from "#/drizzle/schema";

const BOT_PROCESS_DELAY_MS = 3000;
const PROCESS_LIMIT = 15;

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
        signal: AbortSignal.timeout(10_000),
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

const updateBotServerCountProgram = Effect.gen(function* () {
  console.log("🔢 開始排程更新伺服器數量...");

  // 每次只撈取最久沒有被更新過的 N 筆資料
  const bots = yield* Effect.tryPromise(() =>
    db
      .select({
        id: bot.id,
        name: bot.name,
      })
      .from(bot)
      .where(eq(bot.status, "approved"))
      .orderBy(asc(bot.updatedAt))
      .limit(PROCESS_LIMIT),
  );

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
      // 即使抓取失敗，也要推進 updatedAt，避免此 bot 卡住佇列
      yield* Effect.tryPromise(() =>
        db
          .update(bot)
          .set({
            updatedAt: sql`CURRENT_TIMESTAMP`,
          })
          .where(eq(bot.id, current.id)),
      );
      console.log(`⚠️ ${current.name} 本次抓取失敗，稍後重試`);
    }

    // 單線程延遲，避免 Python 後端過載
    if (i < bots.length - 1) {
      yield* Effect.sleep(`${BOT_PROCESS_DELAY_MS} millis`);
    }
  }

  console.log("🎉 本次伺服器數量批次更新完畢！");
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
