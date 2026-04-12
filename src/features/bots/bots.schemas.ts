import { Schema } from "effect";

export const BotCategorySchema = Schema.Literal(
	"popular",
	"featured",
	"new",
	"verified",
	"voted",
);

const PositiveIntLikeSchema = Schema.Union(
	Schema.Number,
	Schema.NumberFromString,
).pipe(Schema.int(), Schema.greaterThanOrEqualTo(1));

export const BotListInputSchema = Schema.Struct({
	category: BotCategorySchema,
	page: PositiveIntLikeSchema,
	limit: PositiveIntLikeSchema.pipe(Schema.lessThanOrEqualTo(50)),
});

export const BotHomeSearchSchema = Schema.Struct({
	tab: Schema.optional(BotCategorySchema),
	page: Schema.optional(PositiveIntLikeSchema),
	search: Schema.optional(Schema.String),
	categories: Schema.optional(Schema.String),
	redirect: Schema.optional(Schema.String),
});

export type BotHomeSearch = Schema.Schema.Type<typeof BotHomeSearchSchema>;
