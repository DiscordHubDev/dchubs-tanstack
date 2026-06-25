import { Schema } from "effect";

export const RawDiscordGuildSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  icon: Schema.NullOr(Schema.String),
  owner: Schema.optional(Schema.Boolean),
  permissions: Schema.optional(Schema.String),
});

export const RawDiscordGuildListSchema = Schema.Array(RawDiscordGuildSchema);

export type RawDiscordGuild = Schema.Schema.Type<typeof RawDiscordGuildSchema>;
