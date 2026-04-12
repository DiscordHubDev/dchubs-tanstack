import { useQuery } from "@tanstack/react-query";
import {
	serverFilterBundleQueryOptions,
	serversListQueryOptions,
} from "#/features/servers/servers.query";
import type { ServerListQueryInput } from "#/features/servers/servers.types";

export function useServersList(input: ServerListQueryInput) {
	return useQuery(serversListQueryOptions(input));
}

export function useServersFilterBundle() {
	return useQuery(serverFilterBundleQueryOptions());
}

// Legacy-compatible alias
export const useServers = useServersFilterBundle;
