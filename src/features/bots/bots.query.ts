import { queryOptions } from "@tanstack/react-query";
import { queryKeys } from "#/lib/query-keys";
import { getBotFilterBundleFn, getBotsListFn } from "./bots.functions";
import type { BotListQueryInput } from "./bots.types";

export function botsListQueryOptions(input: BotListQueryInput) {
	return queryOptions({
		queryKey: queryKeys.bots.list(input),
		queryFn: () => getBotsListFn({ data: input }),
		staleTime: 30 * 1000,
		gcTime: 5 * 60 * 1000,
	});
}

export function botFilterBundleQueryOptions() {
	return queryOptions({
		queryKey: queryKeys.bots.filterBundle(),
		queryFn: () => getBotFilterBundleFn(),
		staleTime: 5 * 60 * 1000,
		gcTime: 15 * 60 * 1000,
	});
}
