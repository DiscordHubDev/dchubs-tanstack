// scripts/check-pins.ts
import { and, eq, lt, sql } from "drizzle-orm";
import { Data, Effect } from "effect";
import { bot, server } from "#/drizzle/schema";
import { type Database } from "#/drizzle/db";

// ─── 定義錯誤型別 ───
class DbUpdateBotPinError extends Data.TaggedError("DbUpdateBotPinError")<{
  readonly message: string;
}> {}

class DbUpdateServerPinError extends Data.TaggedError("DbUpdateServerPinError")<{
  readonly message: string;
}> {}

// ─── DB 執行邏輯 ───

const resetExpiredBotPinsEffect = (db: Database) =>
  Effect.tryPromise({
    try: async () => {
      console.log("👉 準備執行 bot pin update query");
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
      console.log("👉 bot pin update query 完成");
      return (updateResult as any).rowCount ?? (updateResult as any).rowsAffected ?? 0;
    },
    catch: (error: any) =>
      new DbUpdateBotPinError({
        message: error?.message || "Failed to reset expired bot pins",
      }),
  });

const resetExpiredServerPinsEffect = (db: Database) =>
  Effect.tryPromise({
    try: async () => {
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
export const checkAndResetPinsProgram = (db: Database) =>
  Effect.gen(function* () {
    console.log("🔍 開始檢查過期的 Bot 與 Server Pin 狀態...");

    // 1. 處理 Bots
    const botResetCount = yield* resetExpiredBotPinsEffect(db);
    if (botResetCount > 0) {
      console.log(`🔄 發現並重置了 ${botResetCount} 個過期的機器人 (Bot) Pin。`);
    } else {
      console.log("✅ 沒有過期的機器人 Pin。");
    }

    // 2. 處理 Servers
    const serverResetCount = yield* resetExpiredServerPinsEffect(db);
    if (serverResetCount > 0) {
      console.log(`🔄 發現並重置了 ${serverResetCount} 個過期的伺服器 (Server) Pin。`);
    } else {
      console.log("✅ 沒有過期的伺服器 Pin。");
    }

    return { botResetCount, serverResetCount };
  });
