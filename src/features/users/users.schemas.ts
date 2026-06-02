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

export const ApiJwtPayloadSchema = Schema.Struct({
	sub: Schema.String,

	// 如果 typ 是固定的幾種字串，建議直接用 Literal 限制死，例如：
	// typ: Schema.Literal("access", "refresh"),
	// 如果你希望在外部邏輯驗證，則保持 Schema.String
	typ: Schema.String,

	// 嚴格限制字面量 (Literal)
	iss: Schema.Literal("dchubs"),
	aud: Schema.Literal("dchubs-api"),

	iat: Schema.Number,
	exp: Schema.Number,

	// 補上缺少的 jti
	jti: Schema.String,
});
