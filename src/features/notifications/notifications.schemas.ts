import { Schema } from "effect";

export const PrioritySchema = Schema.Literal(
	"success",
	"info",
	"warning",
	"error",
);

export const SendNotificationSchema = Schema.Struct({
	userId: Schema.optional(Schema.String),
	subject: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(200)),
	content: Schema.String.pipe(Schema.minLength(1)),
	teaser: Schema.optional(Schema.String),
	priority: Schema.optional(PrioritySchema),
	isSystem: Schema.optional(Schema.Boolean),
});

export type SendNotificationInput = Schema.Schema.Type<
	typeof SendNotificationSchema
>;
