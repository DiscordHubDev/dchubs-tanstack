import { Schema } from "effect";

const NonEmptyString = Schema.String.pipe(Schema.minLength(1));

export const userByIdInputEffectSchema = Schema.Struct({
	id: NonEmptyString,
});

export const toggleFavoriteInputEffectSchema = Schema.Struct({
	target: Schema.Literal("server", "bot"),
	id: NonEmptyString,
});

export const updateUserSettingsInputEffectSchema = Schema.Struct({
	bio: Schema.String,
	social: Schema.Record({
		key: Schema.String,
		value: Schema.String,
	}),
});

export const upsertUserFromSessionInputEffectSchema = Schema.Struct({
	id: NonEmptyString,
	global_name: Schema.optional(Schema.String),
	image_url: Schema.optional(Schema.String),
	banner_url: Schema.optional(Schema.NullOr(Schema.String)),
	banner_color: Schema.optional(Schema.NullOr(Schema.String)),
	username: Schema.optional(Schema.String),
});
