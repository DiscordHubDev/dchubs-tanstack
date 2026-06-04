import type { CategoryType } from "#/lib/types";

export type BotCategory = "popular" | "featured" | "new" | "verified" | "voted";

export type PublicBot = {
	id: string;
	name: string;
	description: string;
	tags: string[];
	servers: number;
	users: number;
	upvotes: number;
	icon: string | null;
	banner: string | null;
	inviteUrl: string | null;
	website: string | null;
	supportServer: string | null;
	approvedAt: string | null;
	pin: boolean;
	pinExpiry: string | null;
	verified: boolean;
	isFavorite: boolean;
	isAdmin: boolean;
	nsfw: boolean;
};

export type BotListQueryInput = {
	category: BotCategory;
	page: number;
	limit: number;
};

export type BotListQueryResult = {
	bots: PublicBot[];
	total: number;
	totalPages: number;
	page: number;
	limit: number;
};

export type BotFilterBundle = {
	allBots: PublicBot[];
	categories: CategoryType[];
	stats: {
		totalBots: number;
		verifiedBots: number;
		totalTags: number;
	};
};
