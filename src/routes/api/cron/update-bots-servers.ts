import { eq, asc } from "drizzle-orm";
import { createFileRoute } from "@tanstack/react-router";
import { Data, Effect, Option } from "effect";
import { bot } from "#/drizzle/schema";
import { getDb } from "#/drizzle/db";

const DELAY_MS = 3000;
const LIMIT = 15;

class FetchError extends Data.TaggedError("FetchError")<{
  readonly botId: string;
  readonly message: string;
}> {}

const fetchServerCountEffect = (botId: string) =>
  Effect.tryPromise({
    try: async () => {
      const res = await fetch("https://getbotserver.dawngs.top/get_bot_server_count", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bot_id: botId }),
        signal: AbortSignal.timeout(10_000),
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
    catch: () => new FetchError({ botId, message: "Fetch failed" }),
  }).pipe(
    Effect.catchAll(() => {
      console.error(`[update-bots-servers] Error fetching count for ${botId}`);
      return Effect.succeed(Option.none());
    }),
  );

export const Route = createFileRoute("/api/cron/update-bots-servers")({
  server: {
    handlers: {
      POST: async () => {
        try {
          console.log("[update-bots-servers] Starting server count update...");
          const db = getDb();
          const bots = await Effect.runPromise(
            Effect.tryPromise(() =>
              db
                .select({ id: bot.id, name: bot.name })
                .from(bot)
                .where(eq(bot.status, "approved"))
                .orderBy(asc(bot.updatedAt))
                .limit(LIMIT),
            ),
          );
          console.log(`[update-bots-servers] Processing ${bots.length} bots`);

          for (let i = 0; i < bots.length; i++) {
            const b = bots[i];
            console.log(`[update-bots-servers] ${b.name} (${b.id}) [${i + 1}/${bots.length}]`);
            const countOpt = await Effect.runPromise(fetchServerCountEffect(b.id));
            if (Option.isSome(countOpt)) {
              await Effect.runPromise(
                Effect.tryPromise(() =>
                  db.update(bot).set({ servers: countOpt.value }).where(eq(bot.id, b.id)),
                ),
              );
              console.log(`[update-bots-servers] ${b.name} -> ${countOpt.value} servers`);
            }
            if (i < bots.length - 1) {
              await Effect.runPromise(Effect.sleep(DELAY_MS));
            }
          }

          console.log("[update-bots-servers] Done");
          return Response.json({ success: true }, { status: 200 });
        } catch (error) {
          console.error("[update-bots-servers] Error:", error);
          return Response.json({ error: String(error) }, { status: 500 });
        }
      },
    },
  },
});
