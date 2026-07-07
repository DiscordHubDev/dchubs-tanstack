import { Schema } from "effect";

export const BotDetailTabSchema = Schema.Literal("about", "commands", "screenshots");

const NonEmptyString = Schema.String.pipe(Schema.minLength(1));

export const BotDetailInputSchema = Schema.Struct({
  botId: NonEmptyString,
});

export const BotVoteInputSchema = Schema.Struct({
  botId: NonEmptyString,
});

export const BotRateInputSchema = Schema.Struct({
  botId: NonEmptyString,
  rating: Schema.Number.pipe(Schema.int(), Schema.between(1, 5)),
});

export const BotReportInputSchema = Schema.Struct({
  botId: NonEmptyString,
  itemName: NonEmptyString,
  subject: NonEmptyString.pipe(Schema.maxLength(120)),
  content: NonEmptyString.pipe(Schema.maxLength(2000)),
  reasons: Schema.Array(Schema.String), // 新增
  attachments: Schema.Array(
    Schema.Struct({
      dataUrl: Schema.String,
      fileName: Schema.String,
    }),
  ),
});

export const BotDetailSearchSchema = Schema.Struct({
  tab: Schema.optional(BotDetailTabSchema),
});

export type BotDetailSearch = Schema.Schema.Type<typeof BotDetailSearchSchema>;
