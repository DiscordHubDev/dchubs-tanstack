export type DiscordGuild = {
	id: string;
	name: string;
	icon: string | null;
	owner: boolean;
	permissions: string;
	isPublished: boolean;
};

export type GuildMembershipBundle = {
	activeGuilds: DiscordGuild[];
	inactiveGuilds: DiscordGuild[];
	botInviteClientId: string;
	botInvitePermissions: string;
};
