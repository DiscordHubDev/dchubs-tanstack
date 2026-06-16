import type { CategoryType } from "#/lib/types";

export type ServerCategory = "popular" | "featured" | "new" | "voted";

export type PublicServer = {
	id: string;
	name: string;
	description: string;
	tags: string[];
	members: number;
	online: number | null;
	upvotes: number;
	icon: string | null;
	banner: string | null;
	inviteUrl: string | null;
	createdAt: string;
	pin: boolean;
	pinExpiry: string | null;
	isFavorite: boolean;
	nsfw: boolean;
};

export type ServerListQueryInput = {
	category: ServerCategory;
	page: number;
	limit: number;
};

export type ServerListQueryResult = {
	servers: PublicServer[];
	total: number;
	totalPages: number;
	page: number;
	limit: number;
};

export type ServerFilterBundle = {
	allServers: PublicServer[];
	categories: CategoryType[];
	stats: {
		totalServers: number;
		featuredServers: number;
		totalTags: number;
	};
};

export interface DiscordWidgetMember {
	id: string;
	username: string;
	status: "online" | "idle" | "dnd";
	avatar_url: string;
}

export interface DiscordWidgetData {
	id: string;
	name: string;
	instant_invite: string;
	presence_count: number;
	members: DiscordWidgetMember[];
}
