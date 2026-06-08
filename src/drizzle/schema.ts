import { sql } from "drizzle-orm";
import {
	boolean,
	customType,
	doublePrecision,
	foreignKey,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	primaryKey,
	serial,
	text,
	timestamp,
	uniqueIndex,
	varchar,
} from "drizzle-orm/pg-core";
import type { SocialData } from "#/types/social";

// ==========================================
// 1. ENUMS
// ==========================================
export const emailPriority = pgEnum("EmailPriority", [
	"success",
	"info",
	"warning",
	"danger",
]);
export const reportSeverity = pgEnum("ReportSeverity", [
	"severe",
	"moderate",
	"low",
	"untagged",
]);
export const reportStatus = pgEnum("ReportStatus", [
	"pending",
	"resolved",
	"rejected",
]);
export const reportType = pgEnum("ReportType", ["bot", "server"]);
export const status = pgEnum("Status", ["pending", "approved", "rejected"]);
export const voteType = pgEnum("VoteType", ["server", "bot"]);

const isoDateText = customType<{ data: string; driverData: string }>({
	dataType() {
		return "text"; // 告訴資料庫：我底層還是要用 text 欄位
	},
	toDriver(value: string | Date) {
		// 寫入資料庫前攔截：如果 Better Auth 傳了 Date 物件，轉成字串
		if (value instanceof Date) {
			return value.toISOString();
		}
		return value; // 如果原本就是字串就直接放行
	},
	fromDriver(value: string) {
		// 從資料庫拿出來時：維持字串格式，讓你的 App 其他部分不用改程式碼
		return value;
	},
});

// ==========================================
// 2. AUTHENTICATION TABLES (BetterAuth / NextAuth)
// ==========================================
export const user = pgTable(
	"auth_user",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		email: text("email").notNull().unique(),
		emailVerified: boolean("email_verified").default(false).notNull(),
		image: text("image"),
		createdAt: isoDateText("created_at").default(sql`(now())`).notNull(),
		updatedAt: isoDateText("updated_at")
			.default(sql`(now())`)
			.$onUpdate(() => new Date().toISOString())
			.notNull(),
		role: text("role"),
		banned: boolean("banned").default(false),
		banReason: text("ban_reason"),
		banExpires: timestamp("ban_expires"),
		discordId: text("discord_id").unique(),
		username: text("username").notNull().default("未知使用者"),
		avatar: text("avatar")
			.notNull()
			.default("https://cdn.discordapp.com/embed/avatars/0.png"),
		banner: text("banner"),
		bannerColor: text("banner_color"),
		bio: text("bio"),
		social: jsonb().$type<SocialData>(),
		nsfw: boolean("nsfw").default(true).notNull(),
	},
	(table) => [
		index("auth_user_created_at_idx").using(
			"btree",
			table.createdAt.asc().nullsLast(),
		),
	],
);

export const authSession = pgTable(
	"auth_session",
	{
		id: text("id").primaryKey(),
		expiresAt: timestamp("expires_at").notNull(),
		token: text("token").notNull().unique(),
		createdAt: timestamp("created_at").notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => new Date())
			.notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		impersonatedBy: text("impersonated_by"),
	},
	(table) => [index("authSession_userId_idx").on(table.userId)],
);

export const authAccount = pgTable(
	"auth_account",
	{
		id: text("id").primaryKey(),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: timestamp("access_token_expires_at"),
		refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
		scope: text("scope"),
		password: text("password"),
		createdAt: timestamp("created_at").notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => new Date())
			.notNull(),
		profile: jsonb("profile"),
	},
	(table) => [index("authAccount_userId_idx").on(table.userId)],
);

export const authVerification = pgTable(
	"auth_verification",
	{
		id: text("id").primaryKey(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: timestamp("expires_at").notNull(),
		createdAt: timestamp("created_at").notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [index("authVerification_identifier_idx").on(table.identifier)],
);

export const jwks = pgTable("jwks", {
	id: text().primaryKey().notNull(),
	publicKey: text().notNull(),
	privateKey: text().notNull(),
	createdAt: timestamp({ precision: 3, mode: "string" })
		.default(sql`CURRENT_TIMESTAMP`)
		.notNull(),
	expiresAt: timestamp({ precision: 3, mode: "string" }),
});

// ==========================================
// 3. CORE APPLICATION TABLES
// ==========================================

export const bot = pgTable(
	"Bot",
	{
		id: text().primaryKey().notNull(),
		name: text().notNull(),
		description: text().notNull(),
		longDescription: text(),
		tags: text().array(),
		servers: integer().notNull(),
		users: integer().notNull(),
		upvotes: integer().notNull(),
		icon: text(),
		banner: text(),
		featured: boolean().default(false).notNull(),
		createdAt: timestamp({ precision: 3, mode: "string" })
			.default(sql`CURRENT_TIMESTAMP`)
			.notNull(),
		approvedAt: timestamp({ precision: 3, mode: "string" }),
		prefix: text(),
		website: text(),
		inviteUrl: text(),
		supportServer: text(),
		verified: boolean().default(false).notNull(),
		status: status().default("pending").notNull(),
		features: text().array(),
		screenshots: text().array(),
		handledAt: timestamp({ precision: 3, mode: "string" }),
		handledById: text(),
		rejectionReason: text(),
		voteNotificationUrl: text("VoteNotificationURL"),
		secret: text(),
		isAdmin: boolean().default(false).notNull(),
		pin: boolean().default(false).notNull(),
		pinExpiry: timestamp({ precision: 3, mode: "string" }),
		nsfw: boolean().default(false).notNull(), // <- 新增欄位
	},
	(table) => [
		index("Bot_approvedAt_idx").using(
			"btree",
			table.approvedAt.asc().nullsLast().op("timestamp_ops"),
		),
		index("Bot_createdAt_idx").using(
			"btree",
			table.createdAt.asc().nullsLast().op("timestamp_ops"),
		),
		index("Bot_featured_idx").using(
			"btree",
			table.featured.asc().nullsLast().op("bool_ops"),
		),
		index("Bot_featured_upvotes_idx").using(
			"btree",
			table.featured.asc().nullsLast().op("bool_ops"),
			table.upvotes.asc().nullsLast().op("int4_ops"),
		),
		index("Bot_handledById_idx").using(
			"btree",
			table.handledById.asc().nullsLast().op("text_ops"),
		),
		index("Bot_pin_idx").using(
			"btree",
			table.pin.asc().nullsLast().op("bool_ops"),
		),
		index("Bot_servers_idx").using(
			"btree",
			table.servers.asc().nullsLast().op("int4_ops"),
		),
		index("Bot_status_createdAt_idx").using(
			"btree",
			table.status.asc().nullsLast().op("enum_ops"),
			table.createdAt.asc().nullsLast().op("timestamp_ops"),
		),
		index("Bot_status_featured_idx").using(
			"btree",
			table.status.asc().nullsLast().op("enum_ops"),
			table.featured.asc().nullsLast().op("bool_ops"),
		),
		index("Bot_status_idx").using(
			"btree",
			table.status.asc().nullsLast().op("enum_ops"),
		),
		index("Bot_upvotes_idx").using(
			"btree",
			table.upvotes.asc().nullsLast().op("int4_ops"),
		),
		index("Bot_users_idx").using(
			"btree",
			table.users.asc().nullsLast().op("int4_ops"),
		),
		index("Bot_verified_idx").using(
			"btree",
			table.verified.asc().nullsLast().op("bool_ops"),
		),
		index("Bot_verified_upvotes_idx").using(
			"btree",
			table.verified.asc().nullsLast().op("bool_ops"),
			table.upvotes.asc().nullsLast().op("int4_ops"),
		),
		index("Bot_nsfw_idx").using(
			"btree",
			table.nsfw.asc().nullsLast().op("bool_ops"),
		), // <- 為過濾 NSFW 加的索引
		foreignKey({
			columns: [table.handledById],
			foreignColumns: [user.id],
			name: "Bot_handledById_fkey",
		})
			.onUpdate("cascade")
			.onDelete("set null"),
	],
);

export const server = pgTable(
	"Server",
	{
		id: text().primaryKey().notNull(),
		name: text().notNull(),
		description: text().notNull(),
		longDescription: text(),
		tags: text().array(),
		members: integer().notNull(),
		online: integer(),
		upvotes: integer().notNull(),
		icon: text(),
		banner: text(),
		featured: boolean().default(false).notNull(),
		createdAt: timestamp({ precision: 3, mode: "string" })
			.default(sql`CURRENT_TIMESTAMP`)
			.notNull(),
		ownerId: text().notNull(),
		website: text(),
		inviteUrl: text(),
		rules: text().array(),
		features: text().array(),
		screenshots: text().array(),
		voteNotificationUrl: text("VoteNotificationURL"),
		secret: text(),
		pin: boolean().default(false).notNull(),
		pinExpiry: timestamp({ precision: 3, mode: "string" }),
		nsfw: boolean().default(false).notNull(), // <- 新增欄位
	},
	(table) => [
		index("Server_createdAt_idx").using(
			"btree",
			table.createdAt.asc().nullsLast().op("timestamp_ops"),
		),
		index("Server_createdAt_upvotes_idx").using(
			"btree",
			table.createdAt.asc().nullsLast().op("timestamp_ops"),
			table.upvotes.asc().nullsLast().op("int4_ops"),
		),
		index("Server_featured_idx").using(
			"btree",
			table.featured.asc().nullsLast().op("bool_ops"),
		),
		index("Server_featured_upvotes_idx").using(
			"btree",
			table.featured.asc().nullsLast().op("bool_ops"),
			table.upvotes.asc().nullsLast().op("int4_ops"),
		),
		uniqueIndex("Server_id_ownerId_key").using(
			"btree",
			table.id.asc().nullsLast().op("text_ops"),
			table.ownerId.asc().nullsLast().op("text_ops"),
		),
		index("Server_members_idx").using(
			"btree",
			table.members.asc().nullsLast().op("int4_ops"),
		),
		index("Server_ownerId_idx").using(
			"btree",
			table.ownerId.asc().nullsLast().op("text_ops"),
		),
		index("Server_pin_idx").using(
			"btree",
			table.pin.asc().nullsLast().op("bool_ops"),
		),
		index("Server_upvotes_idx").using(
			"btree",
			table.upvotes.asc().nullsLast().op("int4_ops"),
		),
		index("Server_nsfw_idx").using(
			"btree",
			table.nsfw.asc().nullsLast().op("bool_ops"),
		), // <- 為過濾 NSFW 加的索引
		foreignKey({
			columns: [table.ownerId],
			foreignColumns: [user.id],
			name: "Server_ownerId_fkey",
		})
			.onUpdate("cascade")
			.onDelete("set null"),
	],
);

export const botCommand = pgTable(
	"BotCommand",
	{
		id: text().primaryKey().notNull(),
		name: text().notNull(),
		description: text().notNull(),
		usage: text().notNull(),
		category: text(),
		botId: text().notNull(),
	},
	(table) => [
		index("BotCommand_botId_idx").using(
			"btree",
			table.botId.asc().nullsLast().op("text_ops"),
		),
		index("BotCommand_category_idx").using(
			"btree",
			table.category.asc().nullsLast().op("text_ops"),
		),
		index("BotCommand_name_idx").using(
			"btree",
			table.name.asc().nullsLast().op("text_ops"),
		),
		foreignKey({
			columns: [table.botId],
			foreignColumns: [bot.id],
			name: "BotCommand_botId_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
	],
);

export const review = pgTable(
	"Review",
	{
		id: text().primaryKey().notNull(),
		rating: doublePrecision().default(0).notNull(),
		vote: integer().notNull(),
		comment: text(),
		createdAt: timestamp({ precision: 3, mode: "string" })
			.default(sql`CURRENT_TIMESTAMP`)
			.notNull(),
		userId: text().notNull(),
		botId: text(),
		serverId: text(),
	},
	(table) => [
		index("Review_botId_idx").using(
			"btree",
			table.botId.asc().nullsLast().op("text_ops"),
		),
		index("Review_botId_rating_idx").using(
			"btree",
			table.botId.asc().nullsLast().op("text_ops"),
			table.rating.asc().nullsLast().op("float8_ops"),
		),
		index("Review_createdAt_idx").using(
			"btree",
			table.createdAt.asc().nullsLast().op("timestamp_ops"),
		),
		index("Review_rating_idx").using(
			"btree",
			table.rating.asc().nullsLast().op("float8_ops"),
		),
		index("Review_serverId_idx").using(
			"btree",
			table.serverId.asc().nullsLast().op("text_ops"),
		),
		index("Review_serverId_rating_idx").using(
			"btree",
			table.serverId.asc().nullsLast().op("text_ops"),
			table.rating.asc().nullsLast().op("float8_ops"),
		),
		uniqueIndex("Review_userId_botId_key").using(
			"btree",
			table.userId.asc().nullsLast().op("text_ops"),
			table.botId.asc().nullsLast().op("text_ops"),
		),
		index("Review_userId_idx").using(
			"btree",
			table.userId.asc().nullsLast().op("text_ops"),
		),
		uniqueIndex("Review_userId_serverId_key").using(
			"btree",
			table.userId.asc().nullsLast().op("text_ops"),
			table.serverId.asc().nullsLast().op("text_ops"),
		),
		foreignKey({
			columns: [table.botId],
			foreignColumns: [bot.id],
			name: "Review_botId_fkey",
		})
			.onUpdate("cascade")
			.onDelete("set null"),
		foreignKey({
			columns: [table.serverId],
			foreignColumns: [server.id],
			name: "Review_serverId_fkey",
		})
			.onUpdate("cascade")
			.onDelete("set null"),
	],
);

export const report = pgTable(
	"Report",
	{
		id: text().primaryKey().notNull(),
		subject: text().notNull(),
		content: text().notNull(),
		reportedAt: timestamp({ precision: 3, mode: "string" })
			.default(sql`CURRENT_TIMESTAMP`)
			.notNull(),
		status: reportStatus().default("pending").notNull(),
		severity: reportSeverity().default("untagged").notNull(),
		type: reportType().notNull(),
		itemId: text().notNull(),
		itemName: text().notNull(),
		reportedById: text().notNull(),
		attachments: jsonb("attachments").$type<string[]>().notNull(),
		handledAt: timestamp({ precision: 3, mode: "string" }),
		handledById: text(),
		resolutionNote: text(),
	},
	(table) => [
		index("Report_handledById_idx").using(
			"btree",
			table.handledById.asc().nullsLast().op("text_ops"),
		),
		index("Report_itemId_idx").using(
			"btree",
			table.itemId.asc().nullsLast().op("text_ops"),
		),
		index("Report_reportedAt_idx").using(
			"btree",
			table.reportedAt.asc().nullsLast().op("timestamp_ops"),
		),
		index("Report_reportedById_idx").using(
			"btree",
			table.reportedById.asc().nullsLast().op("text_ops"),
		),
		index("Report_severity_idx").using(
			"btree",
			table.severity.asc().nullsLast().op("enum_ops"),
		),
		index("Report_status_idx").using(
			"btree",
			table.status.asc().nullsLast().op("enum_ops"),
		),
		index("Report_status_reportedAt_idx").using(
			"btree",
			table.status.asc().nullsLast().op("enum_ops"),
			table.reportedAt.asc().nullsLast().op("timestamp_ops"),
		),
		index("Report_status_severity_idx").using(
			"btree",
			table.status.asc().nullsLast().op("enum_ops"),
			table.severity.asc().nullsLast().op("enum_ops"),
		),
		index("Report_type_idx").using(
			"btree",
			table.type.asc().nullsLast().op("enum_ops"),
		),
		index("Report_type_itemId_idx").using(
			"btree",
			table.type.asc().nullsLast().op("enum_ops"),
			table.itemId.asc().nullsLast().op("text_ops"),
		),
		foreignKey({
			columns: [table.handledById],
			foreignColumns: [user.id],
			name: "Report_handledById_fkey",
		})
			.onUpdate("cascade")
			.onDelete("set null"),
		foreignKey({
			columns: [table.reportedById],
			foreignColumns: [user.id],
			name: "Report_reportedById_fkey",
		})
			.onUpdate("cascade")
			.onDelete("restrict"),
	],
);

export const notification = pgTable(
	"Notification",
	{
		id: text().primaryKey().notNull(),
		name: text().notNull(),
		createdAt: timestamp({ precision: 3, mode: "string" })
			.default(sql`CURRENT_TIMESTAMP`)
			.notNull(),
		subject: text().notNull(),
		teaser: text().notNull(),
		userId: text(),
		priority: emailPriority().default("info").notNull(),
		isSystem: boolean().default(false).notNull(),
		read: boolean().default(false).notNull(),
		content: text().notNull(),
	},
	(table) => [
		index("Notification_createdAt_idx").using(
			"btree",
			table.createdAt.asc().nullsLast().op("timestamp_ops"),
		),
		index("Notification_read_idx").using(
			"btree",
			table.read.asc().nullsLast().op("bool_ops"),
		),
		index("Notification_userId_idx").using(
			"btree",
			table.userId.asc().nullsLast().op("text_ops"),
		),
		index("Notification_userId_read_idx").using(
			"btree",
			table.userId.asc().nullsLast().op("text_ops"),
			table.read.asc().nullsLast().op("bool_ops"),
		),
	],
);

export const vote = pgTable(
	"Vote",
	{
		id: text().primaryKey().notNull(),
		userId: text().notNull(),
		itemId: text().notNull(),
		itemType: voteType().notNull(),
		createdAt: timestamp({ precision: 3, mode: "string" })
			.default(sql`CURRENT_TIMESTAMP`)
			.notNull(),
	},
	(table) => [
		index("Vote_createdAt_idx").using(
			"btree",
			table.createdAt.asc().nullsLast().op("timestamp_ops"),
		),
		index("Vote_itemId_idx").using(
			"btree",
			table.itemId.asc().nullsLast().op("text_ops"),
		),
		index("Vote_itemType_idx").using(
			"btree",
			table.itemType.asc().nullsLast().op("enum_ops"),
		),
		index("Vote_userId_idx").using(
			"btree",
			table.userId.asc().nullsLast().op("text_ops"),
		),
		index("Vote_userId_itemId_itemType_idx").using(
			"btree",
			table.userId.asc().nullsLast().op("text_ops"),
			table.itemId.asc().nullsLast().op("text_ops"),
			table.itemType.asc().nullsLast().op("enum_ops"),
		),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "Vote_userId_fkey",
		})
			.onUpdate("cascade")
			.onDelete("restrict"),
	],
);

export const apiKey = pgTable(
	"ApiKey",
	{
		id: text().primaryKey().notNull(),
		userId: text().notNull(),
		key: text().notNull(),
		name: text().notNull(),
		isActive: boolean().default(true).notNull(),
		createdAt: timestamp({ precision: 3, mode: "string" })
			.default(sql`CURRENT_TIMESTAMP`)
			.notNull(),
		lastUsed: timestamp({ precision: 3, mode: "string" })
			.default(sql`CURRENT_TIMESTAMP`)
			.notNull(),
		expiresAt: timestamp({ precision: 3, mode: "string" }),
	},
	(table) => [
		index("ApiKey_key_idx").using(
			"btree",
			table.key.asc().nullsLast().op("text_ops"),
		),
		uniqueIndex("ApiKey_key_key").using(
			"btree",
			table.key.asc().nullsLast().op("text_ops"),
		),
		index("ApiKey_userId_idx").using(
			"btree",
			table.userId.asc().nullsLast().op("text_ops"),
		),
		uniqueIndex("ApiKey_userId_key").using(
			"btree",
			table.userId.asc().nullsLast().op("text_ops"),
		),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "ApiKey_userId_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
	],
);

export const apiToken = pgTable(
	"ApiToken",
	{
		userId: text().primaryKey().notNull(),
		accessToken: text().notNull(),
		refreshToken: text().notNull(),
	},
	(table) => [
		uniqueIndex("ApiToken_accessToken_key").using(
			"btree",
			table.accessToken.asc().nullsLast().op("text_ops"),
		),
		uniqueIndex("ApiToken_refreshToken_key").using(
			"btree",
			table.refreshToken.asc().nullsLast().op("text_ops"),
		),
	],
);

export const administrators = pgTable("Administrators", {
	id: text().primaryKey().notNull(),
});

// ==========================================
// 4. MIGRATION & JUNCTION TABLES (Many-to-Many)
// ==========================================
export const prismaMigrations = pgTable("_prisma_migrations", {
	id: varchar({ length: 36 }).primaryKey().notNull(),
	checksum: varchar({ length: 64 }).notNull(),
	finishedAt: timestamp("finished_at", { withTimezone: true, mode: "string" }),
	migrationName: varchar("migration_name", { length: 255 }).notNull(),
	logs: text(),
	rolledBackAt: timestamp("rolled_back_at", {
		withTimezone: true,
		mode: "string",
	}),
	startedAt: timestamp("started_at", { withTimezone: true, mode: "string" })
		.defaultNow()
		.notNull(),
	appliedStepsCount: integer("applied_steps_count").default(0).notNull(),
});

export const serverAdmins = pgTable(
	"_ServerAdmins",
	{
		a: text("A").notNull(),
		b: text("B").notNull(),
	},
	(table) => [
		index().using("btree", table.b.asc().nullsLast().op("text_ops")),
		foreignKey({
			columns: [table.a],
			foreignColumns: [server.id],
			name: "_ServerAdmins_A_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.b],
			foreignColumns: [user.id],
			name: "_ServerAdmins_B_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		primaryKey({ columns: [table.a, table.b], name: "_ServerAdmins_AB_pkey" }),
	],
);

export const botDevelopers = pgTable(
	"_BotDevelopers",
	{
		a: text("A").notNull(),
		b: text("B").notNull(),
	},
	(table) => [
		index().using("btree", table.b.asc().nullsLast().op("text_ops")),
		foreignKey({
			columns: [table.a],
			foreignColumns: [bot.id],
			name: "_BotDevelopers_A_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.b],
			foreignColumns: [user.id],
			name: "_BotDevelopers_B_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		primaryKey({ columns: [table.a, table.b], name: "_BotDevelopers_AB_pkey" }),
	],
);

export const userFavoriteBots = pgTable(
	"_UserFavoriteBots",
	{
		a: text("A").notNull(),
		b: text("B").notNull(),
	},
	(table) => [
		index().using("btree", table.b.asc().nullsLast().op("text_ops")),
		foreignKey({
			columns: [table.a],
			foreignColumns: [bot.id],
			name: "_UserFavoriteBots_A_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.b],
			foreignColumns: [user.id],
			name: "_UserFavoriteBots_B_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		primaryKey({
			columns: [table.a, table.b],
			name: "_UserFavoriteBots_AB_pkey",
		}),
	],
);

export const userFavoriteServers = pgTable(
	"_UserFavoriteServers",
	{
		a: text("A").notNull(),
		b: text("B").notNull(),
	},
	(table) => [
		index().using("btree", table.b.asc().nullsLast().op("text_ops")),
		foreignKey({
			columns: [table.a],
			foreignColumns: [server.id],
			name: "_UserFavoriteServers_A_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.b],
			foreignColumns: [user.id],
			name: "_UserFavoriteServers_B_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		primaryKey({
			columns: [table.a, table.b],
			name: "_UserFavoriteServers_AB_pkey",
		}),
	],
);

export const announcements = pgTable("announcements", {
	id: serial("id").primaryKey(),
	content: text("content").notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
