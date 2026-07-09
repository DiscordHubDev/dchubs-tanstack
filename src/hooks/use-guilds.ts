import { useSuspenseQuery } from "@tanstack/react-query";
import { guildMembershipQueryOptions } from "#/features/servers/add-server.query";

export function useGuilds() {
  const query = useSuspenseQuery(guildMembershipQueryOptions());

  const { activeGuilds, inactiveGuilds } = query.data;
  const hasGuilds = activeGuilds.length + inactiveGuilds.length > 0;

  return {
    ...query,
    activeGuilds,
    inactiveGuilds,
    hasGuilds,
  };
}

export function useGuild(serverId: string | undefined) {
  const query = useSuspenseQuery({
    ...guildMembershipQueryOptions(),
    select: (data) => {
      if (!serverId) return null;

      const activeGuild = data.activeGuilds.find((g) => g.id === serverId);
      if (activeGuild) return activeGuild;

      return data.inactiveGuilds.find((g) => g.id === serverId) ?? null;
    },
  });

  return {
    ...query,
    guild: query.data,
    isPublished: query.data?.isPublished ?? false,
    isNotFound: !query.data && !!serverId,
  };
}
