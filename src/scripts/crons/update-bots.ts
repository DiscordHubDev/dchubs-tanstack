// scripts/update-bots.ts
import { eq } from "drizzle-orm";
import { Data, Effect, Array as EffectArray, Option, Fiber } from "effect";
import { client, db } from "#/drizzle/db";
import { bot } from "#/drizzle/schema";
import { getDiscordRPCWithMember } from "#/features/api/api.function";

const BOT_PROCESS_DELAY_MS = 3000;
const DB_BATCH_WRITE_SIZE = 20;

type BotRow = Pick<
  typeof bot.$inferSelect,
  "id" | "name" | "icon" | "banner" | "verified" | "isAdmin"
>;
type BotInfoUpdateSet = Pick<
  Partial<typeof bot.$inferInsert>,
  "name" | "icon" | "banner" | "verified" | "isAdmin"
>;
type BotCountUpdateSet = Pick<Partial<typeof bot.$inferInsert>, "servers">;
type PendingUpdate<T> = { id: string; data: T };

class BotUpdateError extends Data.TaggedError("BotUpdateError")<{
  readonly botId: string;
  readonly message: string;
}> {}

function hasAdminPermission(permissions: number | string | bigint): boolean {
  const perms = BigInt(permissions);
  const ADMINISTRATOR_FLAGS = 8n;

  return (perms & ADMINISTRATOR_FLAGS) === ADMINISTRATOR_FLAGS;
}

// 封裝 RPC 呼叫 (失敗時回傳 Option.none() 而不中斷)
const fetchUpdatedBotInfoEffect = (botId: string) =>
  Effect.tryPromise({
    try: async () => {
      const data = await getDiscordRPCWithMember({
        data: { client_id: botId },
      });
      if (!data) return Option.none();
      return Option.some({
        name: typeof data.name === "string" ? data.name : null,
        avatar_url: typeof data.member.avatarUrl === "string" ? data.member.avatarUrl : null,
        banner_url: typeof data.member.bannerUrl === "string" ? data.member.bannerUrl : null,
        verified: data.is_verified ?? false,
        isAdmin: hasAdminPermission(data.install_params?.permissions ?? 0),
      });
    },
    catch: (_err) => new BotUpdateError({ botId, message: "Discord RPC Fetch Failed" }),
  }).pipe(
    Effect.catchAll((_err) => {
      console.warn(`⚠️ 無法取得 ${botId} 的 Discord 官方資訊`);
      return Effect.succeed(Option.none());
    }),
  );

// 封裝 Server Count 呼叫 (失敗時回傳 Option.none())
const fetchBotServerCountEffect = (botId: string) =>
  Effect.tryPromise({
    try: async () => {
      const res = await fetch(`https://getbotserver.dawngs.top/get_bot_server_count`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bot_id: botId }),
        signal: AbortSignal.timeout(90_000),
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
    catch: (_err) => new Error(`Database Transaction Failed (${label})`),
  });

const fetchApprovedBots = Effect.gen(function* () {
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
  console.log(`📋 [背景任務] ${isDev ? "🛠️ [開發模式]" : ""} 共需處理 ${bots.length} 個 bots`);
  return bots;
});

// ─── 階段一：更新基本資訊 (name / icon / banner / verified / isAdmin) ───
const updateBotBasicInfoProgram = (bots: BotRow[]) =>
  Effect.gen(function* () {
    console.log("🚀 開始更新 Bot 基本資訊...");
    const chunks = EffectArray.chunksOf(bots, DB_BATCH_WRITE_SIZE);

    for (const chunk of chunks) {
      const pendingUpdates: PendingUpdate<BotInfoUpdateSet>[] = [];

      for (const current of chunk) {
        console.log(`\n🔄 [基本資訊] 處理 ${current.name} (${current.id})`);

        const infoOpt = yield* fetchUpdatedBotInfoEffect(current.id);

        if (Option.isSome(infoOpt)) {
          const data: BotInfoUpdateSet = {
            name: infoOpt.value.name ?? current.name,
            icon: infoOpt.value.avatar_url ?? current.icon,
            banner: infoOpt.value.banner_url ?? current.banner,
            verified: infoOpt.value.verified,
            isAdmin: infoOpt.value.isAdmin,
          };
          pendingUpdates.push({ id: current.id, data });
        }
      }

      yield* flushUpdatesEffect(pendingUpdates, "基本資訊");
    }

    console.log("✅ Bot 基本資訊全部更新完畢！");
  });

// ─── 階段二：更新伺服器數量 (背景執行，含節流 delay 避免 Python 後端過載) ───
const updateBotServerCountProgram = (bots: BotRow[]) =>
  Effect.gen(function* () {
    console.log("🔢 [背景] 開始更新伺服器數量...");
    const chunks = EffectArray.chunksOf(bots, DB_BATCH_WRITE_SIZE);

    for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
      const chunk = chunks[chunkIdx];
      const pendingUpdates: PendingUpdate<BotCountUpdateSet>[] = [];

      for (let i = 0; i < chunk.length; i++) {
        const current = chunk[i];
        console.log(`\n🔄 [伺服器數量] 處理 ${current.name} (${current.id})`);

        const countOpt = yield* fetchBotServerCountEffect(current.id);

        if (Option.isSome(countOpt)) {
          pendingUpdates.push({ id: current.id, data: { servers: countOpt.value } });
        }

        // 單線程延遲，避免 Python 後端過載
        if (i < chunk.length - 1 || chunkIdx < chunks.length - 1) {
          yield* Effect.sleep(`${BOT_PROCESS_DELAY_MS} millis`);
        }
      }

      yield* flushUpdatesEffect(pendingUpdates, "伺服器數量");
    }

    console.log("🎉 [背景] 伺服器數量全部更新完畢！");
  });

const updateBotsProgram = Effect.gen(function* () {
  const bots = yield* fetchApprovedBots;

  // 先完整跑完基本資訊更新
  yield* updateBotBasicInfoProgram(bots);

  // 基本資訊更新完後，將伺服器數量更新丟到背景 (fork) 執行
  console.log("📤 基本資訊已完成，伺服器數量更新已轉入背景執行...");
  const serverCountFiber = yield* Effect.fork(updateBotServerCountProgram(bots));

  // 等待背景任務完成 (腳本仍需存活到背景任務結束才能關閉連線)
  yield* Fiber.join(serverCountFiber);

  console.log("🎉 [背景任務] 全部 Bot 更新完畢！");
});

// ─── 執行進入點 ───
Effect.runPromiseExit(updateBotsProgram).then((exit) => {
  console.log("🔌 正在關閉資料庫連線池...");
  client.close();
  if (exit._tag === "Failure") {
    console.error("❌ 執行發生錯誤:", exit.cause);
    process.exit(1);
  }
  process.exit(0);
});
