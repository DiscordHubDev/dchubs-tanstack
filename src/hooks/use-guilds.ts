import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { guildMembershipQueryOptions } from "#/features/servers/add-server.query";

export function useGuilds() {
	const query = useQuery(guildMembershipQueryOptions());

	const activeGuilds = useMemo(
		() => query.data?.activeGuilds ?? [],
		[query.data?.activeGuilds],
	);

	const inactiveGuilds = useMemo(
		() => query.data?.inactiveGuilds ?? [],
		[query.data?.inactiveGuilds],
	);

	const hasGuilds = activeGuilds.length + inactiveGuilds.length > 0;

	return {
		...query,
		isLoading: query.isPending,
		activeGuilds,
		inactiveGuilds,
		hasGuilds,
	};
}
