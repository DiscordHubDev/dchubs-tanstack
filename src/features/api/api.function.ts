import { createServerFn } from "@tanstack/react-start";
import { Effect, Schema } from "effect";
import { DiscordBotRPCInfoSchema } from "#/features/bots/bot-submit.schemas";
import { runEffect } from "#/lib/effect-utils";
import { fetchBotRpcEffect, fetchUserEffect } from "#/utils/fetch-rpc";

const InputSchema = Schema.Struct({
  client_id: Schema.String,
});

export const getDiscordRPCWithMember = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => Schema.decodeUnknownSync(InputSchema)(raw))
  .handler(({ data }) => {
    const program = Effect.gen(function* () {
      // 使用 Effect.all 讓兩個網路請求同時發出，速度更快！
      const [rpcData, memberData] = yield* Effect.all(
        [
          fetchBotRpcEffect(data.client_id).pipe(
            Effect.flatMap(Schema.decodeUnknown(DiscordBotRPCInfoSchema)),
          ),
          fetchUserEffect(data.client_id),
        ],
        { concurrency: "unbounded" },
      );

      return {
        ...rpcData,
        member: memberData,
      };
    }).pipe(
      Effect.catchAll((error) =>
        Effect.fail(new Error(`整合 Discord 資料失敗: ${error.message || error}`)),
      ),
    );

    return runEffect(program);
  });
