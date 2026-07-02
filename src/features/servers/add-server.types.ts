export type DiscordGuild = {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
  isPublished: boolean;
  approximateMemberCount?: number; // approximate number of members in this guild
  approximatePresenceCount?: number; // approximate number of non-offline members
};

export type GuildMembershipBundle = {
  activeGuilds: DiscordGuild[];
  inactiveGuilds: DiscordGuild[];
  botInviteClientId: string;
  botInvitePermissions: string;
};
