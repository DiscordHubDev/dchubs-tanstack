// src/server.ts
import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import { createServerEntry } from "@tanstack/react-start/server-entry";

import { checkAndResetPinsProgram } from "#/scripts/crons/check-pins";
import { syncServersProgram } from "#/scripts/crons/check-server";
import { updateBotServerCountProgram } from "#/scripts/crons/update-bots-servers";
import { syncAllServersProgram } from "#/scripts/crons/update-servers";
import { updateBotBasicInfoProgram } from "#/scripts/crons/update-bots-info";
import { getDbWithClient } from "#/drizzle/db";
import { Effect } from "effect";

const isProd = process.env.NODE_ENV === "production";

const handler = createStartHandler({
  handler: defaultStreamHandler,
  transformAssets: { prefix: "", crossOrigin: "anonymous", cache: isProd, warmup: true },
});

const serverEntry = createServerEntry({ fetch: handler });

const CRON_JOBS = [
  { pattern: "*/10 * * * *", name: "check-pins", run: checkAndResetPinsProgram },
  { pattern: "0 * * * *", name: "check-server", run: syncServersProgram },
  { pattern: "*/30 * * * *", name: "update-bots-servers", run: updateBotServerCountProgram },
  { pattern: "0 3 * * *", name: "update-servers", run: syncAllServersProgram },
  { pattern: "15 * * * *", name: "update-bots-info", run: updateBotBasicInfoProgram },
] as const;

async function scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
  const job = CRON_JOBS.find((j) => j.pattern === controller.cron);
  if (!job) {
    console.error(`⚠️ 未知的 cron: ${controller.cron}`);
    return;
  }

  ctx.waitUntil(
    (async () => {
      const { db, client } = getDbWithClient();
      console.log(`⏰ [${job.name}] 開始執行`);
      try {
        const result = await Effect.runPromise(job.run(db));
        console.log(`🎉 [${job.name}] 完成:`, result);
      } catch (e) {
        console.error(`❌ [${job.name}] 錯誤:`, e);
      } finally {
        await client.end({ timeout: 5 });
      }
    })(),
  );
}

const workerExport = {
  ...serverEntry,
  scheduled,
};

export default workerExport as ExportedHandler;
