import { Schema } from "effect";

const NonEmptyString = Schema.String.pipe(Schema.minLength(1));

export const BotNameSchema = NonEmptyString.pipe(Schema.maxLength(50));
export const BotPrefixSchema = NonEmptyString.pipe(Schema.maxLength(10));
export const BotDescriptionSchema = Schema.String.pipe(Schema.minLength(10), Schema.maxLength(200));
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
export const BotDevelopersSchema = Schema.NonEmptyArray(BotDeveloperSchema);

export const BotCommandSchema = Schema.Struct({
  name: NonEmptyString.pipe(Schema.maxLength(80)),
  description: NonEmptyString.pipe(Schema.maxLength(200)),
  usage: NonEmptyString.pipe(Schema.maxLength(200)),
  category: Schema.optional(Schema.String),
});
export const BotCommandsSchema = Schema.Array(BotCommandSchema);

export const BotTagSchema = NonEmptyString.pipe(Schema.maxLength(24));
export const BotTagsSchema = Schema.Array(BotTagSchema).pipe(
  Schema.minItems(1, { message: () => "至少需要 1 個標籤" }),
  Schema.maxItems(8, { message: () => "標籤最多 8 個" }),
  Schema.filter(
    (tags) => {
      const seen = new Set(tags.map((t) => t.toLowerCase()));
      return seen.size === tags.length;
    },
    { message: () => "標籤不可重複" },
  ),
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
  customEmbed: Schema.optional(
    Schema.Struct({
      username: Schema.optional(Schema.String),
      avatar_url: Schema.optional(Schema.String),
      content: Schema.optional(Schema.String),
      color: Schema.optional(Schema.String),
      authorName: Schema.optional(Schema.String),
      authorUrl: Schema.optional(Schema.String),
      authorIconUrl: Schema.optional(Schema.String),
      title: Schema.optional(Schema.String),
      url: Schema.optional(Schema.String),
      description: Schema.optional(Schema.String),
      imageUrl: Schema.optional(Schema.String),
      thumbnailUrl: Schema.optional(Schema.String),
      footerText: Schema.optional(Schema.String),
      footerIconUrl: Schema.optional(Schema.String),
      fields: Schema.optional(
        Schema.Array(
          Schema.Struct({
            name: Schema.String,
            value: Schema.String,
            inline: Schema.Boolean,
          }),
        ),
      ),
    }),
  ),
});

export type BotFormData = Schema.Schema.Type<typeof BotFormSchema>;
