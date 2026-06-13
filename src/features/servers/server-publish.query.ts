import { queryOptions } from "@tanstack/react-query";
import { queryKeys } from "#/lib/query-keys";
import { getServerPublishBundleFn } from "./server-publish.functions";
import type { ServerPublishBundle } from "./server-publish.types";

export function serverPublishQueryOptions(serverId: string) {
	return queryOptions<ServerPublishBundle>({
		queryKey: queryKeys.servers.publish(serverId),
		queryFn: async () => {
			return await getServerPublishBundleFn({ data: { serverId } });
		},
		staleTime: 30 * 1000,
		gcTime: 5 * 60 * 1000,
	});
}
