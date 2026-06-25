import { Schema } from "effect";

export const ProfileTabSchema = Schema.Literal("servers", "bots", "favorites", "settings");

const NonEmptyString = Schema.String.pipe(Schema.minLength(1));

export const ProfileSearchSchema = Schema.Struct({
  id: Schema.optional(NonEmptyString),
  tab: Schema.optional(ProfileTabSchema),
});

export type ProfileTab = Schema.Schema.Type<typeof ProfileTabSchema>;
export type ProfileSearch = Schema.Schema.Type<typeof ProfileSearchSchema>;
