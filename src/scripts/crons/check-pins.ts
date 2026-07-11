// scripts/check-pins.ts
import { and, eq, lt, sql } from "drizzle-orm";
import { Data, Effect } from "effect";
import { bot, server } from "#/drizzle/schema";
import { getDb } from "#/drizzle/db";

// ─── 定義錯誤型別 ───
class DbUpdateBotPinError extends Data.TaggedError("DbUpdateBotPinError")<{
  readonly message: string;
}> {}

class DbUpdateServerPinError extends Data.TaggedError("DbUpdateServerPinError")<{
  readonly message: string;
}> {}

// ─── DB 執行邏輯 ───

const resetExpiredBotPinsEffect = () =>
  Effect.tryPromise({
    try: async () => {
      const db = getDb();
      // 最高效作法：直接由資料庫篩選並一次性更新，不做無謂的 SELECT 撈取
      const updateResult = await db
        .update(bot)
        .set({
          pin: false,
          pinExpiry: null, // 重設為 null
        })
        .where(
          and(
            eq(bot.pin, true),
            lt(bot.pinExpiry, sql`CURRENT_TIMESTAMP`), // 當到期時間早於現在時間
          ),
        );

      return (updateResult as any).rowCount ?? (updateResult as any).rowsAffected ?? 0;
    },
    catch: (error: any) =>
      new DbUpdateBotPinError({
        message: error?.message || "Failed to reset expired bot pins",
      }),
  });

const resetExpiredServerPinsEffect = () =>
  Effect.tryPromise({
    try: async () => {
      const db = getDb();
      const updateResult = await db
        .update(server)
        .set({
          pin: false,
          pinExpiry: null,
        })
        .where(and(eq(server.pin, true), lt(server.pinExpiry, sql`CURRENT_TIMESTAMP`)));

      return (updateResult as any).rowCount ?? (updateResult as any).rowsAffected ?? 0;
    },
    catch: (error: any) =>
      new DbUpdateServerPinError({
        message: error?.message || "Failed to reset expired server pins",
      }),
  });

// ─── 主流程 Program ───
const checkAndResetPinsProgram = Effect.gen(function* () {
  console.log("🔍 開始檢查過期的 Bot 與 Server Pin 狀態...");

  // 1. 處理 Bots
  const botResetCount = yield* resetExpiredBotPinsEffect();
  if (botResetCount > 0) {
    console.log(`🔄 發現並重置了 ${botResetCount} 個過期的機器人 (Bot) Pin。`);
  } else {
    console.log("✅ 沒有過期的機器人 Pin。");
  }

  // 2. 處理 Servers
  const serverResetCount = yield* resetExpiredServerPinsEffect();
  if (serverResetCount > 0) {
    console.log(`🔄 發現並重置了 ${serverResetCount} 個過期的伺服器 (Server) Pin。`);
  } else {
    console.log("✅ 沒有過期的伺服器 Pin。");
  }

  return { botResetCount, serverResetCount };
});

// ─── 執行進入點 ───
Effect.runPromiseExit(checkAndResetPinsProgram).then((exit) => {
  // 💡 腳本準備結束，主動關閉連線池
  console.log("🔌 正在關閉資料庫連線池...");

  if (exit._tag === "Success") {
    console.log("🎉 Pin 檢查與同步完成:", exit.value);
    process.exit(0);
  } else {
    console.error("❌ 同步發生錯誤:", exit.cause);
    process.exit(1);
  }
});
