import { Schema } from "effect";

export const VoteSchema = Schema.Struct({
	_tag: Schema.Literal("vote"),
	type: Schema.Literal("server", "bot"),
	user: Schema.Struct({
		id: Schema.String,
		username: Schema.optional(Schema.String),
	}),
	target: Schema.Struct({
		id: Schema.String,
		name: Schema.String,
	}),
});

// 已核准機器人 Schema
export const ApprovedBotSchema = Schema.Struct({
	_tag: Schema.Literal("approvedBot"),
	bot: Schema.Struct({
		id: Schema.Union(Schema.String, Schema.Null, Schema.Undefined),
		name: Schema.String,
		prefix: Schema.String,
		description: Schema.String,
		developers: Schema.Array(
			Schema.Struct({
				username: Schema.Union(Schema.String, Schema.Null, Schema.Undefined),
			}),
		),
		inviteUrl: Schema.String,
		tags: Schema.Array(Schema.String),
		icon: Schema.Union(Schema.String, Schema.Null, Schema.Undefined),
		banner: Schema.Union(Schema.String, Schema.Null, Schema.Undefined),
	}),
});

// 待審核機器人 Schema
export const PendingBotSchema = Schema.Struct({
	_tag: Schema.Literal("pendingBot"),
	data: Schema.Struct({
		botName: Schema.String,
		botPrefix: Schema.String,
		botDescription: Schema.String,
		tags: Schema.Array(Schema.String),
	}),
	avatarUrl: Schema.String,
});

// 新伺服器發佈 Schema
export const ServerSchema = Schema.Struct({
	_tag: Schema.Literal("server"),
	data: Schema.Struct({
		serverName: Schema.String,
		shortDescription: Schema.String,
		inviteLink: Schema.String,
		tags: Schema.Array(Schema.String),
	}),
	activeServer: Schema.Struct({
		id: Schema.Union(Schema.String, Schema.Null, Schema.Undefined),
		icon: Schema.Union(Schema.String, Schema.Null, Schema.Undefined),
		banner: Schema.Union(Schema.String, Schema.Null, Schema.Undefined),
	}),
});

export const WebhookPayloadSchema = Schema.Union(
	VoteSchema,
	ApprovedBotSchema,
	PendingBotSchema,
	ServerSchema,
);
