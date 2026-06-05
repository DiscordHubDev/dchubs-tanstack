import type { PublicServer } from "./servers.types";

export type ServerDetailTab = "about" | "rules" | "screenshots";

export type ServerReview = {
	id: string;
	createdAt: string;
	botId: string | null;
	rating: number;
	vote: number;
	comment: string | null;
	userId: string;
	serverId: string | null;
};

export type ServerOwner = {
	id: string;
	username: string;
	name: string | null;
	avatar: string | null;
};

export type ServerDetail = PublicServer & {
	longDescription: string | null;
	website: string | null;
	rules: string[];
	features: string[];
	screenshots: string[];
	owner: ServerOwner | null;
	reviews: ServerReview[];
	currentRating: number;
	totalReviews: number;
	userRating: number;
	hasVotedRecently: boolean;
	nextVoteAt: string | null;
	relatedServers: PublicServer[];
};

export type ServerVoteResult = {
	success: boolean;
	message: string;
	upvotes: number;
	nextVoteAt: string | null;
};

export type ServerRateResult = {
	rating: number;
	averageRating: number;
	totalReviews: number;
};

export type ServerReportResult = {
	success: boolean;
	message: string;
};
