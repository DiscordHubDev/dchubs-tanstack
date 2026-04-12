import { queryOptions } from "@tanstack/react-query";
import { queryKeys } from "#/lib/query-keys";
import { getGuildMembershipBundleFn } from "./add-server.functions";

export function guildMembershipQueryOptions() {
	return queryOptions({
		queryKey: queryKeys.servers.guilds(),
		queryFn: () => getGuildMembershipBundleFn(),
		staleTime: 60 * 1000,
		gcTime: 10 * 60 * 1000,
	});
}
