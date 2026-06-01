import { relations } from "drizzle-orm/relations";
import {
	apiKey,
	authAccount,
	authSession,
	authUser,
	bot,
	botCommand,
	botDevelopers,
	report,
	review,
	server,
	serverAdmins,
	user,
	userFavoriteBots,
	userFavoriteServers,
	vote,
} from "./schema";

export const authSessionRelations = relations(authSession, ({ one }) => ({
	authUser: one(authUser, {
		fields: [authSession.userId],
		references: [authUser.id],
	}),
}));

export const authUserRelations = relations(authUser, ({ many }) => ({
	authSessions: many(authSession),
	authAccounts: many(authAccount),
}));

export const authAccountRelations = relations(authAccount, ({ one }) => ({
	authUser: one(authUser, {
		fields: [authAccount.userId],
		references: [authUser.id],
	}),
}));

export const apiKeyRelations = relations(apiKey, ({ one }) => ({
	user: one(user, {
		fields: [apiKey.userId],
		references: [user.id],
	}),
}));

export const userRelations = relations(user, ({ many }) => ({
	// ── 原本就有的關聯 ──
	apiKeys: many(apiKey),
	votes: many(vote),

	// ── 語意化改名：讓查詢結果更直覺 ──
	ownedServers: many(server), // 原本是 servers (對應 Server 表的 ownerId)
	handledBots: many(bot), // 原本是 bots (對應 Bot 表的 handledById)

	// ── 多對多中介表 ──
	developedBots: many(botDevelopers), // 原本是 botDevelopers
	administeredServers: many(serverAdmins), // 原本是 serverAdmins
	favoriteBots: many(userFavoriteBots), // 原本是 userFavoriteBots
	favoriteServers: many(userFavoriteServers), // 原本是 userFavoriteServers

	// ── 檢舉相關 (注意 relationName 必須與 Report 那邊對應) ──
	reportsHandled: many(report, {
		relationName: "handledBy", // 已經幫你簡化命名
	}),
	reportsSubmitted: many(report, {
		relationName: "reportedBy", // 已經幫你簡化命名
	}),
}));

export const botRelations = relations(bot, ({ one, many }) => ({
	// 審核該 Bot 的管理員
	handledBy: one(user, {
		fields: [bot.handledById],
		references: [user.id],
	}),

	// 關聯陣列
	commands: many(botCommand), // 原本是 botCommands
	reviews: many(review), // 維持不變
	developers: many(botDevelopers), // 原本是 botDevelopers

	// 被誰收藏 (補回你原本漏掉的)
	favoritedBy: many(userFavoriteBots), // 原本是 userFavoriteBots
}));

export const botCommandRelations = relations(botCommand, ({ one }) => ({
	bot: one(bot, {
		fields: [botCommand.botId],
		references: [bot.id],
	}),
}));

export const reportRelations = relations(report, ({ one }) => ({
	handledBy: one(user, {
		fields: [report.handledById],
		references: [user.id],
		relationName: "handledBy", // 這裡必須跟 user 那邊的字串一模一樣
	}),
	reportedBy: one(user, {
		fields: [report.reportedById],
		references: [user.id],
		relationName: "reportedBy", // 這裡必須跟 user 那邊的字串一模一樣
	}),
}));

export const reviewRelations = relations(review, ({ one }) => ({
	bot: one(bot, {
		fields: [review.botId],
		references: [bot.id],
	}),
	server: one(server, {
		fields: [review.serverId],
		references: [server.id],
	}),
}));

export const serverRelations = relations(server, ({ one, many }) => ({
	owner: one(user, {
		fields: [server.ownerId],
		references: [user.id],
	}),
	admins: many(serverAdmins),
	reviews: many(review),
}));

export const voteRelations = relations(vote, ({ one }) => ({
	user: one(user, {
		fields: [vote.userId],
		references: [user.id],
	}),
}));

export const serverAdminsRelations = relations(serverAdmins, ({ one }) => ({
	server: one(server, {
		fields: [serverAdmins.a],
		references: [server.id],
	}),
	user: one(user, {
		fields: [serverAdmins.b],
		references: [user.id],
	}),
}));

export const botDevelopersRelations = relations(botDevelopers, ({ one }) => ({
	bot: one(bot, {
		fields: [botDevelopers.a],
		references: [bot.id],
	}),
	user: one(user, {
		fields: [botDevelopers.b],
		references: [user.id],
	}),
}));

export const userFavoriteBotsRelations = relations(
	userFavoriteBots,
	({ one }) => ({
		bot: one(bot, {
			fields: [userFavoriteBots.a],
			references: [bot.id],
		}),
		user: one(user, {
			fields: [userFavoriteBots.b],
			references: [user.id],
		}),
	}),
);

export const userFavoriteServersRelations = relations(
	userFavoriteServers,
	({ one }) => ({
		server: one(server, {
			fields: [userFavoriteServers.a],
			references: [server.id],
		}),
		user: one(user, {
			fields: [userFavoriteServers.b],
			references: [user.id],
		}),
	}),
);
