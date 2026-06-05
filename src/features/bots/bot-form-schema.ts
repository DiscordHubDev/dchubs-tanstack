import { Schema } from "effect";

const NonEmptyString = Schema.String.pipe(Schema.minLength(1));

export const BotNameSchema = NonEmptyString.pipe(Schema.maxLength(50));
export const BotPrefixSchema = NonEmptyString.pipe(Schema.maxLength(10));
export const BotDescriptionSchema = Schema.String.pipe(
	Schema.minLength(10),
	Schema.maxLength(200),
);
export const BotLongDescriptionSchema = NonEmptyString;
export const BotInviteSchema = Schema.String.pipe(
	Schema.pattern(/discord\.com\/(api\/)?oauth2\/authorize/),
);
export const BotWebsiteSchema = Schema.optional(Schema.String);
export const BotSupportSchema = Schema.optional(Schema.String);

export const BotDeveloperSchema = Schema.Struct({
	name: NonEmptyString.pipe(Schema.maxLength(80)),
	avatar: Schema.optional(Schema.String),
});
export const BotDevelopersSchema = Schema.Array(BotDeveloperSchema);

export const BotCommandSchema = Schema.Struct({
	name: NonEmptyString.pipe(Schema.maxLength(80)),
	description: NonEmptyString.pipe(Schema.maxLength(200)),
	usage: NonEmptyString.pipe(Schema.maxLength(200)),
	category: Schema.optional(Schema.String),
});
export const BotCommandsSchema = Schema.Array(BotCommandSchema);

export const BotTagSchema = NonEmptyString.pipe(Schema.maxLength(24));
export const BotTagsSchema = Schema.Array(BotTagSchema).pipe(
	Schema.minItems(1, { message: () => "請至少新增一個標籤" }),
	Schema.maxItems(8, { message: () => "最多只能新增 8 個標籤" }),
);

export const BotSecretSchema = Schema.optional(Schema.String);
export const BotWebhookUrlSchema = Schema.optional(Schema.String);

export const BotFormSchema = Schema.Struct({
	botName: BotNameSchema,
	botPrefix: BotPrefixSchema,
	botDescription: BotDescriptionSchema,
	botLongDescription: BotLongDescriptionSchema,
	botInvite: BotInviteSchema,
	botWebsite: BotWebsiteSchema,
	botSupport: BotSupportSchema,
	developers: BotDevelopersSchema,
	commands: BotCommandsSchema,
	tags: BotTagsSchema,
	secret: BotSecretSchema,
	webhook_url: BotWebhookUrlSchema,
	nsfw: Schema.Boolean,
});

export type BotFormData = Schema.Schema.Type<typeof BotFormSchema>;
