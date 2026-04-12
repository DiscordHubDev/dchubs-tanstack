import { queryOptions } from "@tanstack/react-query";
import { queryKeys } from "#/lib/query-keys";
import { getServerFilterBundleFn, getServersListFn } from "./servers.functions";
import type { ServerListQueryInput } from "./servers.types";

export function serversListQueryOptions(input: ServerListQueryInput) {
	return queryOptions({
		queryKey: queryKeys.servers.list(input),
		queryFn: () => getServersListFn({ data: input }),
		staleTime: 30 * 1000,
		gcTime: 5 * 60 * 1000,
	});
}

export function serverFilterBundleQueryOptions() {
	return queryOptions({
		queryKey: queryKeys.servers.filterBundle(),
		queryFn: () => getServerFilterBundleFn(),
		staleTime: 5 * 60 * 1000,
		gcTime: 15 * 60 * 1000,
	});
}
