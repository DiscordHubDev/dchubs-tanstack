import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toggleFavoriteFn } from "#/features/users/users.functions";
import {
	currentUserQueryOptions,
	userDetailQueryOptions,
	userProfileQueryOptions,
} from "#/features/users/users.query";
import type {
	ToggleFavoriteParams,
	UserDetail,
	UserSummary,
} from "#/features/users/users.types";
import { runEffect, tryEffectPromise } from "#/lib/effect-utils";
import { queryKeys } from "#/lib/query-keys";

export function useCurrentUser() {
	return useQuery(currentUserQueryOptions());
}

export function useUserDetail(userId: string | undefined) {
	return useQuery({
		...userDetailQueryOptions(userId ?? ""),
		enabled: !!userId,
	});
}

export function useFavoriteMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ target, id }: ToggleFavoriteParams) =>
			runEffect(
				tryEffectPromise("Failed to toggle favorite", () =>
					toggleFavoriteFn({ data: { target, id } }),
				),
			),

		onMutate: async ({ target, id }) => {
			await queryClient.cancelQueries({
				queryKey: queryKeys.users.current(),
			});

			const previousUser = queryClient.getQueryData<UserDetail | null>(
				queryKeys.users.current(),
			);

			if (previousUser) {
				const fieldName =
					target === "server" ? "favoriteServers" : "favoriteBots";
				const currentFavorites = previousUser[fieldName] || [];
				const isFavorited = currentFavorites.some((item) => item.id === id);

				queryClient.setQueryData<UserDetail | null>(
					queryKeys.users.current(),
					(old) => {
						if (!old) return null;

						const nextFavorites: UserSummary[] = isFavorited
							? currentFavorites.filter((item) => item.id !== id)
							: [...currentFavorites, { id, name: "", icon: null }];

						return {
							...old,
							[fieldName]: nextFavorites,
						};
					},
				);
			}

			return { previousUser };
		},

		onError: (_error, _variables, context) => {
			if (context?.previousUser) {
				queryClient.setQueryData(
					queryKeys.users.current(),
					context.previousUser,
				);
			}
		},

		onSettled: async () => {
			await queryClient.invalidateQueries({
				queryKey: queryKeys.users.current(),
			});
		},
	});
}

export function useUserProfile(userId: string | undefined) {
	return useQuery({
		...userProfileQueryOptions(userId ?? ""),
		enabled: !!userId,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		refetchOnMount: false,
	});
}
