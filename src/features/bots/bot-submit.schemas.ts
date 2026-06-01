import { Schema } from "effect";
import { BotFormSchema } from "./bot-form-schema";

const ScreenshotSchema = Schema.Struct({
	url: Schema.String.pipe(Schema.minLength(1)),
	public_id: Schema.String.pipe(Schema.minLength(1)),
});

export const SubmitBotInputSchema = Schema.Struct({
	form: BotFormSchema,
	screenshots: Schema.Array(ScreenshotSchema),
	banner: Schema.optional(Schema.String),
	mode: Schema.optional(Schema.Literal("create", "edit")),
});

const ImageDataUrlSchema = Schema.String.pipe(
	Schema.maxLength(20_000_000),
	Schema.pattern(/^data:image\/(?:gif|png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/),
);

export const UploadBotImagesInputSchema = Schema.Struct({
	files: Schema.Array(
		Schema.Struct({
			fileName: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(255)),
			dataUrl: ImageDataUrlSchema,
		}),
	),
});

export const DeleteBotImageInputSchema = Schema.Struct({
	publicId: Schema.String.pipe(Schema.minLength(1)),
});

export const SendPendingWebhookSchema = Schema.Struct({
	botId: Schema.String.pipe(Schema.minLength(1)),
	botName: Schema.String.pipe(Schema.minLength(1)),
	botDescription: Schema.String.pipe(Schema.minLength(1)),
	iconUrl: Schema.optional(Schema.String),
	inviteUrl: Schema.optional(Schema.String),
	mode: Schema.optional(Schema.Literal("create", "edit")),
});

export type SubmitBotInput = Schema.Schema.Type<typeof SubmitBotInputSchema>;
export type UploadBotImagesInput = Schema.Schema.Type<
	typeof UploadBotImagesInputSchema
>;
export type DeleteBotImageInput = Schema.Schema.Type<
	typeof DeleteBotImageInputSchema
>;
export type SendPendingWebhookInput = Schema.Schema.Type<
	typeof SendPendingWebhookSchema
>;
