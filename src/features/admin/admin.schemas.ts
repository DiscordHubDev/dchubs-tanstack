// admin.schemas.ts
import { Schema } from "effect";

export const Cuid2 = Schema.String.pipe(
	Schema.pattern(/^[a-z][a-z0-9]*$/),
	Schema.annotations({
		message: () => "Invalid CUID2 format",
		title: "Cuid2",
	}),
);

export const BotIdSchema = Schema.Struct({
	id: Schema.String,
});

export const ServerGuildIdSchema = Schema.Struct({
	guildId: Schema.String,
});

export const ReviewBotSchema = Schema.Struct({
	id: Schema.String,
	status: Schema.Literal("approved", "rejected"),
	rejectionReason: Schema.optional(Schema.String),
});

export const UpdateReportSchema = Schema.Struct({
	reportId: Schema.String,
	status: Schema.optional(Schema.Literal("pending", "resolved", "rejected")),
	severity: Schema.optional(
		Schema.Literal("untagged", "low", "moderate", "severe"),
	),
});
