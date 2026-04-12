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
	apiKeys: many(apiKey),
	bots: many(bot),
	reports_handledById: many(report, {
		relationName: "report_handledById_user_id",
	}),
	reports_reportedById: many(report, {
		relationName: "report_reportedById_user_id",
	}),
	servers: many(server),
	votes: many(vote),
	serverAdmins: many(serverAdmins),
	botDevelopers: many(botDevelopers),
	userFavoriteBots: many(userFavoriteBots),
	userFavoriteServers: many(userFavoriteServers),
}));

export const botRelations = relations(bot, ({ one, many }) => ({
	user: one(user, {
		fields: [bot.handledById],
		references: [user.id],
	}),
	botCommands: many(botCommand),
	reviews: many(review),
	botDevelopers: many(botDevelopers),
	userFavoriteBots: many(userFavoriteBots),
}));

export const botCommandRelations = relations(botCommand, ({ one }) => ({
	bot: one(bot, {
		fields: [botCommand.botId],
		references: [bot.id],
	}),
}));

export const reportRelations = relations(report, ({ one }) => ({
	user_handledById: one(user, {
		fields: [report.handledById],
		references: [user.id],
		relationName: "report_handledById_user_id",
	}),
	user_reportedById: one(user, {
		fields: [report.reportedById],
		references: [user.id],
		relationName: "report_reportedById_user_id",
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
	reviews: many(review),
	user: one(user, {
		fields: [server.ownerId],
		references: [user.id],
	}),
	serverAdmins: many(serverAdmins),
	userFavoriteServers: many(userFavoriteServers),
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
