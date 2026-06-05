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

export const RejectBotSchema = Schema.Struct({
	botId: Schema.String,
	reason: Schema.String.pipe(Schema.minLength(1)),
});

export const QuerySchema = Schema.Struct({
	search: Schema.optional(Schema.String),

	// 核心：使用 Schema.optional 加上與特定屬性相關的 .pipe
	page: Schema.optional(
		Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
	).pipe(Schema.withDecodingDefault(() => 1)),

	// 順序：先定義好限制範圍的 Schema -> 轉成 optional -> pipe 注入解碼預設值
	limit: Schema.optional(
		Schema.Number.pipe(Schema.int(), Schema.between(1, 100)),
	).pipe(Schema.withDecodingDefault(() => 20)),
});
