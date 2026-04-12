export type JWTDiscordProfile = {
	id: string;
	global_name?: string;
	image_url?: string;
	banner_url?: string | null;
	banner_color?: string | null;
	username?: string;
};

export type LegacyCompatibleSession = {
	discordProfile?: JWTDiscordProfile | null;
	user?: {
		id?: string;
		discordId?: string;
	} | null;
} | null;

export type UpdateState = {
	success?: string;
	error?: string;
};

export type UserSummary = {
	id: string;
	name: string;
	icon: string | null;
	description?: string;
	tags?: string[];
	members?: number;
	ownerId?: string;
	servers?: number;
	verified?: boolean;
	status?: "pending" | "approved" | "rejected";
};

export type UserDeveloperSummary = {
	id: string;
	username: string;
	avatar: string;
};

export type UserDevelopedBot = UserSummary & {
	developers: UserDeveloperSummary[];
};

export type UserDetail = {
	id: string;
	username: string;
	avatar: string;
	banner: string | null;
	bannerColor: string | null;
	bio: string | null;
	social: Record<string, string>;
	joinedAt: string;
	favoriteServers: UserSummary[];
	favoriteBots: UserSummary[];
	ownedServers: UserSummary[];
	developedBots: UserDevelopedBot[];
	adminIn: UserSummary[];
};

export type ToggleFavoriteParams = {
	target: "server" | "bot";
	id: string;
};

export type ToggleFavoriteResult = ToggleFavoriteParams & {
	favorited: boolean;
};

export type UpdateUserSettingsInput = {
	bio: string;
	social: Record<string, string>;
};

export type ApiTokenPair = {
	accessToken: string;
	refreshToken: string;
};
