import { useQuery } from "@tanstack/react-query";
import {
	botFilterBundleQueryOptions,
	botsListQueryOptions,
} from "#/features/bots/bots.query";
import type { BotListQueryInput } from "#/features/bots/bots.types";

export function useBotsList(input: BotListQueryInput) {
	return useQuery(botsListQueryOptions(input));
}

export function useBotsFilterBundle() {
	return useQuery(botFilterBundleQueryOptions());
}

// Legacy-compatible alias
export const useBots = useBotsFilterBundle;
