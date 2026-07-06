// scripts/update-bots-info.ts
import { eq } from "drizzle-orm";
import { Data, Effect, Array as EffectArray, Option } from "effect";
import { client, db } from "#/drizzle/db";
import { bot } from "#/drizzle/schema";
import { getDiscordRPCWithMember } from "#/features/api/api.function";

const DB_BATCH_WRITE_SIZE = 20;

type BotRow = Pick<
  typeof bot.$inferSelect,
  "id" | "name" | "icon" | "banner" | "verified" | "isAdmin"
>;
type BotInfoUpdateSet = Pick<
  Partial<typeof bot.$inferInsert>,
  "name" | "icon" | "banner" | "verified" | "isAdmin"
>;
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
    const pendingUpdates: PendingUpdate<BotInfoUpdateSet>[] = [];

    for (const current of chunk) {
      console.log(`🔄 [基本資訊] 處理 ${current.name} (${current.id})`);
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

Effect.runPromiseExit(updateBotBasicInfoProgram).then((exit) => {
  console.log("🔌 正在關閉資料庫連線池...");
  client.close();
  if (exit._tag === "Failure") {
    console.error("❌ 執行發生錯誤:", exit.cause);
    process.exit(1);
  }
  process.exit(0);
});
