import { queryOptions } from "@tanstack/react-query";
import { runEffect, tryEffectPromise } from "#/lib/effect-utils";
import { queryKeys } from "#/lib/query-keys";
import {
	getCurrentUserFn,
	getUserBaseProfileFn,
	getUserBotsFn,
	getUserByIdFn,
	getUserFavoritesFn,
	getUserServersFn,
	getUserSettingsFn,
} from "./users.functions";

export function currentUserQueryOptions() {
	return queryOptions({
		queryKey: queryKeys.users.current(),
		queryFn: () =>
			runEffect(
				tryEffectPromise("Failed to fetch current user", () =>
					getCurrentUserFn(),
				),
			),
		staleTime: 5 * 60 * 1000,
	});
}

export function userDetailQueryOptions(userId: string) {
	return queryOptions({
		queryKey: queryKeys.users.detail(userId),
		queryFn: () =>
			runEffect(
				tryEffectPromise("Failed to fetch user detail", () =>
					getUserByIdFn({ data: { id: userId } }),
				),
			),
		staleTime: 60 * 1000,
	});
}

export function userProfileQueryOptions(userId: string) {
	return queryOptions({
		queryKey: queryKeys.users.detail(userId),
		queryFn: () =>
			runEffect(
				tryEffectPromise("Failed to fetch user profile", () =>
					getUserByIdFn({ data: { id: userId } }),
				),
			),
		staleTime: 10 * 60 * 1000,
		gcTime: 30 * 60 * 1000,
	});
}

export function userSettingsQueryOptions(userId: string) {
	return queryOptions({
		queryKey: queryKeys.users.settings(userId),
		queryFn: () =>
			runEffect(
				tryEffectPromise("Failed to fetch user settings", () =>
					getUserSettingsFn({ data: { id: userId } }),
				),
			),
		staleTime: 60 * 1000,
	});
}

export function userFavoritesQueryOptions(userId: string) {
	return queryOptions({
		queryKey: queryKeys.users.favorites(userId),
		queryFn: () =>
			runEffect(
				tryEffectPromise("Failed to fetch user favorites", () =>
					getUserFavoritesFn({ data: { id: userId } }),
				),
			),
		staleTime: 60 * 1000,
	});
}

export function userBotsQueryOptions(userId: string) {
	return queryOptions({
		queryKey: queryKeys.users.bots(userId),
		queryFn: () =>
			runEffect(
				tryEffectPromise("Failed to fetch user bots", () =>
					getUserBotsFn({ data: { id: userId } }),
				),
			),
		staleTime: 60 * 1000,
	});
}

export function userServersQueryOptions(userId: string) {
	return queryOptions({
		queryKey: queryKeys.users.servers(userId),
		queryFn: () =>
			runEffect(
				tryEffectPromise("Failed to fetch user servers", () =>
					getUserServersFn({ data: { id: userId } }),
				),
			),
		staleTime: 60 * 1000,
	});
}

export function userBaseProfileQueryOptions(userId: string) {
	return queryOptions({
		queryKey: queryKeys.users.profile(userId),
		queryFn: () =>
			runEffect(
				tryEffectPromise("Failed to fetch user base profile", () =>
					getUserBaseProfileFn({ data: { id: userId } }),
				),
			),
		staleTime: 10 * 60 * 1000,
	});
}
