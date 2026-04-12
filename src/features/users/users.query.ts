import { queryOptions } from "@tanstack/react-query";
import { runEffect, tryEffectPromise } from "#/lib/effect-utils";
import { queryKeys } from "#/lib/query-keys";
import { getCurrentUserFn, getUserByIdFn } from "./users.functions";

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
