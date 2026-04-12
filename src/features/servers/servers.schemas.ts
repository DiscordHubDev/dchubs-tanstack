import { Schema } from "effect";

export const ServerCategorySchema = Schema.Literal(
	"popular",
	"featured",
	"new",
	"voted",
);

const PositiveIntLikeSchema = Schema.Union(
	Schema.Number,
	Schema.NumberFromString,
).pipe(Schema.int(), Schema.greaterThanOrEqualTo(1));

export const ServerListInputSchema = Schema.Struct({
	category: ServerCategorySchema,
	page: PositiveIntLikeSchema,
	limit: PositiveIntLikeSchema.pipe(Schema.lessThanOrEqualTo(50)),
});

export const HomeSearchSchema = Schema.Struct({
	tab: Schema.optional(ServerCategorySchema),
	page: Schema.optional(PositiveIntLikeSchema),
	search: Schema.optional(Schema.String),
	categories: Schema.optional(Schema.String),
	redirect: Schema.optional(Schema.String),
});

export type HomeSearch = Schema.Schema.Type<typeof HomeSearchSchema>;
