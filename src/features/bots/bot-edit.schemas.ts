import { Schema } from "effect";

const NonEmptyString = Schema.String.pipe(Schema.minLength(1));

export const BotEditInputSchema = Schema.Struct({
  botId: NonEmptyString,
});
