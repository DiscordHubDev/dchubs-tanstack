import { eq } from "drizzle-orm";
import { createFileRoute } from "@tanstack/react-router";
import { Data, Effect, Array as EffectArray, Option, Fiber } from "effect";
import { bot } from "#/drizzle/schema";
import { getDiscordRPCWithMember } from "#/features/api/api.function";
import { getDb } from "#/drizzle/db";

const DELAY_MS = 3000;
const BATCH_SIZE = 20;

class FetchError extends Data.TaggedError("FetchError")<{
  readonly botId: string;
  readonly message: string;
}> {}

function hasAdminPermission(permissions: number | string | bigint): boolean {
  return (BigInt(permissions) & 8n) === 8n;
}

const fetchBotInfoEffect = (botId: string) =>
  Effect.tryPromise({
    try: async () => {
      const data = await getDiscordRPCWithMember({ data: { client_id: botId } });
      if (!data) return Option.none();
      return Option.some({
        name: typeof data.name === "string" ? data.name : null,
        avatar_url: typeof data.member?.avatarUrl === "string" ? data.member.avatarUrl : null,
        banner_url: typeof data.member?.bannerUrl === "string" ? data.member.bannerUrl : null,
        verified: data.is_verified ?? false,
        isAdmin: hasAdminPermission(data.install_params?.permissions ?? 0),
      });
    },
    catch: () => new FetchError({ botId, message: "RPC fetch failed" }),
  }).pipe(
    Effect.catchAll(() => {
      console.warn(`[update-bots] Failed to fetch info for ${botId}`);
      return Effect.succeed(Option.none());
    }),
  );

const fetchServerCountEffect = (botId: string) =>
  Effect.tryPromise({
    try: async () => {
      const res = await fetch("https://getbotserver.dawngs.top/get_bot_server_count", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bot_id: botId }),
        signal: AbortSignal.timeout(90_000),
      });
      if (res.status === 524 || res.status === 429 || !res.ok) return Option.none();
      const data = await res.json();
      const count = Array.isArray(data)
        ? (data as any[]).find((i: any) => i?.server_count != null)?.server_count
        : (data as any)?.server_count != null
          ? (data as any).server_count
          : null;
      return count != null ? Option.some(count) : Option.none();
    },
    catch: () => new FetchError({ botId, message: "Server count fetch failed" }),
  }).pipe(
    Effect.catchAll(() => {
      console.error(`[update-bots] Error fetching count for ${botId}`);
      return Effect.succeed(Option.none());
    }),
  );

type UpdateEntry = { id: string; data: Record<string, unknown> };

const flushUpdatesEffect = (updates: UpdateEntry[]) =>
  Effect.tryPromise({
    try: async () => {
      if (updates.length === 0) return;
      const db = getDb();
      await db.transaction(async (tx) => {
        for (const { id, data } of updates) {
          await tx.update(bot).set(data).where(eq(bot.id, id));
        }
      });
      console.log(`[update-bots] Batch wrote ${updates.length} records`);
    },
    catch: (e) => new Error(`DB transaction failed: ${(e as Error).message}`),
  });

export const Route = createFileRoute("/api/cron/update-bots")({
  server: {
    handlers: {
      POST: async () => {
        try {
          console.log("[update-bots] Starting full bot update...");
          const db = getDb();
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
          const bots = await Effect.runPromise(Effect.tryPromise(() => query));
          console.log(`[update-bots] Processing ${bots.length} bots`);

          // Phase 1: basic info
          console.log("[update-bots] Updating basic info...");
          const chunks = EffectArray.chunksOf(bots, BATCH_SIZE);
          for (const chunk of chunks) {
            const pending: UpdateEntry[] = [];
            for (const b of chunk) {
              console.log(`[update-bots] Processing ${b.name} (${b.id})`);
              const infoOpt = await Effect.runPromise(fetchBotInfoEffect(b.id));
              if (Option.isSome(infoOpt)) {
                const v = infoOpt.value;
                pending.push({
                  id: b.id,
                  data: {
                    name: v.name ?? b.name,
                    icon: v.avatar_url ?? b.icon,
                    banner: v.banner_url ?? b.banner,
                    verified: v.verified,
                    isAdmin: v.isAdmin,
                  },
                });
              }
            }
            await Effect.runPromise(flushUpdatesEffect(pending));
          }

          // Phase 2: server count (background fiber)
          console.log("[update-bots] Updating server counts (background)...");
          const serverChunks = EffectArray.chunksOf(bots, BATCH_SIZE);
          const fiber = await Effect.runPromise(
            Effect.fork(
              Effect.gen(function* () {
                for (let ci = 0; ci < serverChunks.length; ci++) {
                  const chunk = serverChunks[ci];
                  const pending: UpdateEntry[] = [];
                  for (let i = 0; i < chunk.length; i++) {
                    const b = chunk[i];
                    console.log(`[update-bots] Count ${b.name} (${b.id})`);
                    const countOpt = yield* fetchServerCountEffect(b.id);
                    if (Option.isSome(countOpt)) {
                      pending.push({ id: b.id, data: { servers: countOpt.value } });
                    }
                    if (i < chunk.length - 1 || ci < serverChunks.length - 1) {
                      yield* Effect.sleep(DELAY_MS);
                    }
                  }
                  yield* flushUpdatesEffect(pending);
                }
              }),
            ),
          );
          await Effect.runPromise(Fiber.join(fiber));

          console.log("[update-bots] Done");
          return Response.json({ success: true }, { status: 200 });
        } catch (error) {
          console.error("[update-bots] Error:", error);
          return Response.json({ error: String(error) }, { status: 500 });
        }
      },
    },
  },
});
