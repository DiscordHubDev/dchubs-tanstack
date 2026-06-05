import type { PublicBot } from "./bots.types";

export type BotDetailTab = "about" | "commands" | "screenshots";

export type BotCommandItem = {
	id: string;
	name: string;
	description: string;
	usage: string;
	category: string | null;
};

export type BotDeveloper = {
	id: string;
	username: string;
	name: string | null;
	avatar: string | null;
};

export type BotReview = {
	id: string;
	createdAt: string;
	botId: string | null;
	rating: number;
	vote: number;
	comment: string | null;
	userId: string;
	serverId: string | null;
};

export type BotDetail = PublicBot & {
	longDescription: string | null;
	prefix: string | null;
	features: string[];
	screenshots: string[];
	commands: BotCommandItem[];
	developers: BotDeveloper[];
	reviews: BotReview[];
	currentRating: number;
	totalReviews: number;
	userRating: number;
	hasVotedRecently: boolean;
	nextVoteAt: string | null;
	relatedBots: PublicBot[];
};

export type BotVoteResult = {
	success: boolean;
	message: string;
	upvotes: number;
	nextVoteAt: string | null;
};

export type BotRateResult = {
	rating: number;
	averageRating: number;
	totalReviews: number;
};

export type BotReportResult = {
	success: boolean;
	message: string;
};
