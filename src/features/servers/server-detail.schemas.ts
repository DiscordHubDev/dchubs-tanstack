import { Schema } from "effect";

export const ServerDetailTabSchema = Schema.Literal("about", "rules", "screenshots");

const NonEmptyString = Schema.String.pipe(Schema.minLength(1));

export const ServerDetailInputSchema = Schema.Struct({
  serverId: NonEmptyString,
});

export const ServerVoteInputSchema = Schema.Struct({
  serverId: NonEmptyString,
});

export const ServerRateInputSchema = Schema.Struct({
  serverId: NonEmptyString,
  rating: Schema.Number.pipe(Schema.int(), Schema.between(1, 5)),
});

export const ServerReportInputSchema = Schema.Struct({
  serverId: NonEmptyString,
  itemName: NonEmptyString,
  subject: NonEmptyString.pipe(Schema.maxLength(120)),
  content: NonEmptyString.pipe(Schema.maxLength(2000)),
  reasons: Schema.Array(Schema.String),
  attachments: Schema.Array(
    Schema.Struct({
      dataUrl: Schema.String,
      fileName: Schema.String,
    }),
  ),
});

export const ServerDetailSearchSchema = Schema.Struct({
  tab: Schema.optional(ServerDetailTabSchema),
});

export type ServerDetailSearch = Schema.Schema.Type<typeof ServerDetailSearchSchema>;
