import { eq } from "drizzle-orm";
import { createFileRoute } from "@tanstack/react-router";
import { Effect, Array as EffectArray, Option, Schema, Either } from "effect";
import { bot } from "#/drizzle/schema";
import { fetchBotRpcEffect, fetchUserEffect } from "#/utils/fetch-rpc";
import { DiscordBotRPCInfoSchema } from "#/features/bots/bot-submit.schemas";
import { getDb } from "#/drizzle/db";

const BATCH_SIZE = 20;
const CONCURRENCY = 5;

function hasAdminPermission(permissions: number | string | bigint): boolean {
  return (BigInt(permissions) & 8n) === 8n;
}

const fetchBotInfoEffect = (botId: string) =>
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
      console.warn(`[update-bots-info] [${botId}] Member fetch failed, using RPC-only fields`);
    }
    const memberData = Either.isRight(memberResult) ? memberResult.right : null;

    return Option.some({
      name: typeof rpcData.name === "string" ? rpcData.name : null,
      avatar_url: memberData?.avatarUrl ?? null,
      banner_url: memberData?.bannerUrl ?? null,
      verified: rpcData.is_verified ?? false,
      isAdmin: hasAdminPermission(rpcData.install_params?.permissions ?? 0),
      termsOfServiceUrl: rpcData.terms_of_service_url ?? null,
      privacyPolicyUrl: rpcData.privacy_policy_url ?? null,
    });
  }).pipe(
    Effect.catchAll(() => {
      console.warn(`[update-bots-info] Failed to fetch info for ${botId}`);
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
      console.log(`[update-bots-info] Batch wrote ${updates.length} records`);
    },
    catch: (e) => new Error(`DB transaction failed: ${(e as Error).message}`),
  });

export const Route = createFileRoute("/api/cron/update-bots-info")({
  server: {
    handlers: {
      POST: async () => {
        try {
          console.log("[update-bots-info] Starting bot info update...");
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
              termsOfServiceUrl: bot.termsOfServiceUrl,
              privacyPolicyUrl: bot.privacyPolicyUrl,
            })
            .from(bot)
            .where(eq(bot.status, "approved"));
          if (isDev) query = query.limit(1) as any;
          const bots = await Effect.runPromise(Effect.tryPromise(() => query));
          console.log(`[update-bots-info] Processing ${bots.length} bots`);

          const chunks = EffectArray.chunksOf(bots, BATCH_SIZE);
          for (const chunk of chunks) {
            const results = await Effect.runPromise(
              Effect.all(
                chunk.map((b: any) =>
                  Effect.gen(function* () {
                    console.log(`[update-bots-info] Processing ${b.name} (${b.id})`);
                    const infoOpt = yield* fetchBotInfoEffect(b.id);
                    return { current: b, infoOpt };
                  }),
                ),
                { concurrency: CONCURRENCY },
              ),
            );

            const pending: UpdateEntry[] = [];
            for (const { current, infoOpt } of results) {
              if (Option.isSome(infoOpt)) {
                const v = infoOpt.value;
                pending.push({
                  id: current.id,
                  data: {
                    name: v.name ?? current.name,
                    icon: v.avatar_url ?? current.icon,
                    banner: v.banner_url ?? current.banner,
                    verified: v.verified,
                    isAdmin: v.isAdmin,
                    termsOfServiceUrl: v.termsOfServiceUrl ?? current.termsOfServiceUrl,
                    privacyPolicyUrl: v.privacyPolicyUrl ?? current.privacyPolicyUrl,
                  },
                });
              }
            }
            await Effect.runPromise(flushUpdatesEffect(pending));
          }

          console.log("[update-bots-info] Done");
          return Response.json({ success: true }, { status: 200 });
        } catch (error) {
          console.error("[update-bots-info] Error:", error);
          return Response.json({ error: String(error) }, { status: 500 });
        }
      },
    },
  },
});
