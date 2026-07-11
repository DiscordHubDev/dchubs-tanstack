import { and, eq, lt, sql } from "drizzle-orm";
import { createFileRoute } from "@tanstack/react-router";
import { bot, server } from "#/drizzle/schema";
import { getDb } from "#/drizzle/db";

export const Route = createFileRoute("/api/cron/check-pins")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const db = getDb();

          console.log("[check-pins] Starting expired pin check...");

          const botResult = await db
            .update(bot)
            .set({ pin: false, pinExpiry: null })
            .where(and(eq(bot.pin, true), lt(bot.pinExpiry, sql`CURRENT_TIMESTAMP`)));

          const botCount = (botResult as any).rowCount ?? (botResult as any).rowsAffected ?? 0;
          if (botCount > 0) console.log(`[check-pins] Reset ${botCount} expired bot pins`);

          const serverResult = await db
            .update(server)
            .set({ pin: false, pinExpiry: null })
            .where(and(eq(server.pin, true), lt(server.pinExpiry, sql`CURRENT_TIMESTAMP`)));

          const serverCount =
            (serverResult as any).rowCount ?? (serverResult as any).rowsAffected ?? 0;
          if (serverCount > 0) console.log(`[check-pins] Reset ${serverCount} expired server pins`);

          console.log("[check-pins] Done", { botCount, serverCount });
          return Response.json({ success: true, botCount, serverCount }, { status: 200 });
        } catch (error) {
          console.error("[check-pins] Error:", error);
          return Response.json({ error: String(error) }, { status: 500 });
        }
      },
    },
  },
});
