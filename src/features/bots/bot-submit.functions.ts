import { createServerFn } from "@tanstack/react-start";
import { protectedMiddleware } from "#/lib/auth-middleware";
import { effectInputValidator, runEffect } from "#/lib/effect-utils";
import {
  ClientIdInputSchema,
  DeleteBotImageInputSchema,
  DiscordBotRPCInfoSchema,
  SubmitBotInputSchema,
  UploadBotImagesInputSchema,
} from "./bot-submit.schemas";
import { deleteBotImage, submitBot, uploadBotImages } from "./bot-submit.server";
import type {
  DeleteBotImageResult,
  SubmitBotResult,
  UploadBotImagesResult,
} from "./bot-submit.types";
import { Effect, Schema } from "effect";
import { fetchBotRpcEffect } from "#/utils/fetch-rpc";
import { db } from "#/drizzle/db";

export const submitBotFn = createServerFn({ method: "POST" })
  .middleware([protectedMiddleware])
  .validator(effectInputValidator(SubmitBotInputSchema))
  .handler(async ({ data }): Promise<SubmitBotResult> => {
    return submitBot(data);
  });

export const uploadBotImagesFn = createServerFn({ method: "POST" })
  .middleware([protectedMiddleware])
  .validator(effectInputValidator(UploadBotImagesInputSchema))
  .handler(async ({ data }): Promise<UploadBotImagesResult> => {
    return uploadBotImages(data);
  });

export const deleteBotImageFn = createServerFn({ method: "POST" })
  .middleware([protectedMiddleware])
  .validator(effectInputValidator(DeleteBotImageInputSchema))
  .handler(async ({ data }): Promise<DeleteBotImageResult> => {
    return deleteBotImage(data);
  });

export const getDiscordBotRPCFn = createServerFn({ method: "POST" })
  .validator((raw: unknown) => Schema.decodeUnknownSync(ClientIdInputSchema)(raw))
  .handler(({ data }) => {
    const program = Effect.gen(function* () {
      const existingBot = yield* Effect.tryPromise({
        try: () =>
          db.query.bot.findFirst({
            where: (bot, { eq }) => eq(bot.id, data.client_id),
          }),
        catch: () => new Error(`資料庫檢查失敗`),
      });

      if (existingBot) {
        return yield* Effect.fail(new Error("此機器人已經被註冊過"));
      }

      // 3. 沒找到，才去 Discord 抓 RPC 資料
      const rpcData = yield* fetchBotRpcEffect(data.client_id).pipe(
        Effect.flatMap(Schema.decodeUnknown(DiscordBotRPCInfoSchema)),
      );

      return {
        ...rpcData,
      };
    }).pipe(
      Effect.catchAll((error) => {
        // 如果是我們自己拋出的「註冊過」錯誤，就原封不動傳給前端
        if (error.message === "此機器人已經被註冊過") {
          return Effect.fail(error);
        }
        return Effect.fail(new Error(`整合 Discord 資料失敗：${error.message}`));
      }),
    );

    return runEffect(program);
  });
