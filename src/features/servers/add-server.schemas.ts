import { Schema } from "effect";

export const RawDiscordGuildSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  icon: Schema.NullOr(Schema.String),
  owner: Schema.optional(Schema.Boolean),
  permissions: Schema.optional(Schema.String),
  approximate_member_count: Schema.optional(Schema.Number), // approximate number of members in this guild
  approximate_presence_count: Schema.optional(Schema.Number), // approximate number of non-offline members
});

export const RawDiscordGuildListSchema = Schema.Array(RawDiscordGuildSchema);

export type RawDiscordGuild = Schema.Schema.Type<typeof RawDiscordGuildSchema>;
