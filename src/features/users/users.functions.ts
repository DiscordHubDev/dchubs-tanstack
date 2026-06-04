import { createServerFn } from "@tanstack/react-start";
import { Schema } from "effect";
import { authMiddleware, protectedMiddleware } from "#/lib/auth-middleware";
import {
	effectInputValidator,
	runEffect,
	runEffectSafe,
} from "#/lib/effect-utils";
import {
	toggleFavoriteInputEffectSchema,
	updateUserSettingsInputEffectSchema,
	upsertUserFromSessionInputEffectSchema,
	userByIdInputEffectSchema,
	userByIdOrNameInputEffectSchema,
} from "./users.schemas";
import {
	createOrRegenerateApiTokenForCurrentUser,
	getCurrentUser,
	getUserBaseProfileEffect,
	getUserBotsEffect,
	getUserById,
	getUserByIdOrNameEffect,
	getUserFavoritesEffect,
	getUserServersEffect,
	getUserSettingsEffect,
	toggleFavoriteForCurrentUser,
	updateUserSettingsForCurrentUser,
	upsertUserFromSession,
} from "./users.server";

const emptySchema = Schema.Struct({});
const strictValidator = (input: any) => {
	Schema.decodeUnknownSync(emptySchema)(input || {});
	return {};
};

// 1. 取得當前使用者：允許未登入（會回傳 null 或由內部處理）
export const getCurrentUserFn = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async ({ context }) => {
		return getCurrentUser(context.user?.discordId);
	});

export const getUserSettingsFn = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator(effectInputValidator(userByIdInputEffectSchema))
	.handler(async ({ data }) => {
		return await runEffect(getUserSettingsEffect(data.id));
	});

export const getUserFavoritesFn = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator(effectInputValidator(userByIdInputEffectSchema))
	.handler(async ({ data }) => {
		return await runEffect(getUserFavoritesEffect(data.id));
	});

export const getUserBotsFn = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator(effectInputValidator(userByIdInputEffectSchema))
	.handler(async ({ data }) => {
		return await runEffect(getUserBotsEffect(data.id));
	});

export const getUserServersFn = createServerFn({ method: "GET" })
	.inputValidator(effectInputValidator(userByIdInputEffectSchema))
	.middleware([authMiddleware])
	.handler(async ({ data }) => {
		return await runEffect(getUserServersEffect(data.id));
	});

export const getUserBaseProfileFn = createServerFn({ method: "GET" })
	.inputValidator(effectInputValidator(userByIdInputEffectSchema))
	.middleware([authMiddleware])
	.handler(async ({ data }) => {
		return await runEffect(getUserBaseProfileEffect(data.id));
	});

// 2. 取得特定使用者：公開讀取
export const getUserByIdFn = createServerFn({ method: "GET" })
	.inputValidator(effectInputValidator(userByIdInputEffectSchema))
	.middleware([authMiddleware])
	.handler(async ({ data }) => {
		return getUserById(data.id);
	});

export const getUserByIdOrNameFn = createServerFn({ method: "GET" })
	.inputValidator(effectInputValidator(userByIdOrNameInputEffectSchema))
	.middleware([authMiddleware])
	.handler(async ({ data }) => {
		const program = getUserByIdOrNameEffect(data.query);
		return await runEffect(program);
	});

export const upsertUserFromSessionFn = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(effectInputValidator(upsertUserFromSessionInputEffectSchema))
	.handler(async ({ data }) => {
		return upsertUserFromSession(data);
	});

// 4. 更新個人設定：必須登入 🔒
export const updateUserSettingsFn = createServerFn({ method: "POST" })
	.middleware([protectedMiddleware])
	.inputValidator(effectInputValidator(updateUserSettingsInputEffectSchema))
	.handler(async ({ data, context }) => {
		return updateUserSettingsForCurrentUser(data, context.user.discordId);
	});

// 5. 切換收藏：必須登入 🔒
export const toggleFavoriteFn = createServerFn({ method: "POST" })
	.middleware([protectedMiddleware])
	.inputValidator(effectInputValidator(toggleFavoriteInputEffectSchema))
	.handler(async ({ data, context }) => {
		return toggleFavoriteForCurrentUser(data, context.user.discordId);
	});

// 6. 產生 API Token：必須登入 (高敏感操作) 🔒
export const createOrRegenerateApiTokenFn = createServerFn({ method: "POST" })
	.middleware([protectedMiddleware])
	.inputValidator(strictValidator)
	.handler(async ({ context }) => {
		return createOrRegenerateApiTokenForCurrentUser(context.user.discordId);
	});

// Compatible aliases for legacy naming.
export const getCachedUser = getUserByIdFn;
