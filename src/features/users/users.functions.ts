import { createServerFn } from "@tanstack/react-start";
import { effectInputValidator } from "#/lib/effect-utils";
import { createSafeServerFn } from "#/utils/serverFn";
import {
	toggleFavoriteInputEffectSchema,
	updateUserSettingsInputEffectSchema,
	upsertUserFromSessionInputEffectSchema,
	userByIdInputEffectSchema,
} from "./users.schemas";
import {
	createOrRegenerateApiTokenForCurrentUser,
	getCurrentUser,
	getUserById,
	toggleFavoriteForCurrentUser,
	updateUserSettingsForCurrentUser,
	upsertUserFromSession,
} from "./users.server";

export const getCurrentUserFn = createServerFn({ method: "GET" }).handler(
	async () => {
		return getCurrentUser();
	},
);

export const getUserByIdFn = createServerFn({ method: "GET" })
	.inputValidator(effectInputValidator(userByIdInputEffectSchema))
	.handler(async ({ data }) => {
		return getUserById(data.id);
	});

export const upsertUserFromSessionFn = createServerFn({ method: "POST" })
	.inputValidator(effectInputValidator(upsertUserFromSessionInputEffectSchema))
	.handler(async ({ data }) => {
		return upsertUserFromSession(data);
	});

export const updateUserSettingsFn = createServerFn({ method: "POST" })
	.inputValidator(effectInputValidator(updateUserSettingsInputEffectSchema))
	.handler(async ({ data }) => {
		return updateUserSettingsForCurrentUser(data);
	});

export const toggleFavoriteFn = createServerFn({ method: "POST" })
	.inputValidator(effectInputValidator(toggleFavoriteInputEffectSchema))
	.handler(async ({ data }) => {
		return toggleFavoriteForCurrentUser(data);
	});

export const createOrRegenerateApiTokenFn = createSafeServerFn({
	method: "POST",
}).handler(async () => {
	return createOrRegenerateApiTokenForCurrentUser();
});

// Compatible aliases for legacy naming.
export const getCachedUser = getUserByIdFn;
