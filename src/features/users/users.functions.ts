import { createServerFn } from "@tanstack/react-start";
import { Schema } from "effect";
import { authMiddleware, protectedMiddleware } from "#/lib/auth-middleware";
import { effectInputValidator, runEffect, toResult } from "#/lib/effect-utils";
import {
  PinItemInputSchema,
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
  pinItemLogicEffect,
  toggleFavoriteForCurrentUser,
  updateUserSettingsForCurrentUser,
  upsertUserFromSession,
} from "./users.server";
import { db } from "#/drizzle/db";
import { user } from "#/drizzle/schema";
import { eq } from "drizzle-orm";

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
  .validator(effectInputValidator(userByIdInputEffectSchema))
  .handler(async ({ data }) => {
    return await runEffect(getUserSettingsEffect(data.id));
  });

export const getUserFavoritesFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(effectInputValidator(userByIdInputEffectSchema))
  .handler(async ({ data }) => {
    return await runEffect(getUserFavoritesEffect(data.id));
  });

export const getUserBotsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(effectInputValidator(userByIdInputEffectSchema))
  .handler(async ({ data }) => {
    return await runEffect(getUserBotsEffect(data.id));
  });

export const getUserServersFn = createServerFn({ method: "GET" })
  .validator(effectInputValidator(userByIdInputEffectSchema))
  .middleware([authMiddleware])
  .handler(async ({ data }) => {
    return await runEffect(getUserServersEffect(data.id));
  });

export const getUserBaseProfileFn = createServerFn({ method: "GET" })
  .validator(effectInputValidator(userByIdInputEffectSchema))
  .middleware([authMiddleware])
  .handler(async ({ data }) => {
    return await runEffect(getUserBaseProfileEffect(data.id));
  });

// 2. 取得特定使用者：公開讀取
export const getUserByIdFn = createServerFn({ method: "GET" })
  .validator(effectInputValidator(userByIdInputEffectSchema))
  .middleware([authMiddleware])
  .handler(async ({ data }) => {
    return getUserById(data.id);
  });

export const getUserByIdOrNameFn = createServerFn({ method: "GET" })
  .validator(effectInputValidator(userByIdOrNameInputEffectSchema))
  .middleware([authMiddleware])
  .handler(async ({ data }) => {
    const program = getUserByIdOrNameEffect(data.query);
    return await runEffect(program);
  });

export const upsertUserFromSessionFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(effectInputValidator(upsertUserFromSessionInputEffectSchema))
  .handler(async ({ data }) => {
    return upsertUserFromSession(data);
  });

// 4. 更新個人設定：必須登入 🔒
export const updateUserSettingsFn = createServerFn({ method: "POST" })
  .middleware([protectedMiddleware])
  .validator(effectInputValidator(updateUserSettingsInputEffectSchema))
  .handler(async ({ data, context }) => {
    return updateUserSettingsForCurrentUser(data, context.user.betterAuthId);
  });

// 5. 切換收藏：必須登入 🔒
export const toggleFavoriteFn = createServerFn({ method: "POST" })
  .middleware([protectedMiddleware])
  .validator(effectInputValidator(toggleFavoriteInputEffectSchema))
  .handler(async ({ data, context }) => {
    return toggleFavoriteForCurrentUser(data, context.user.betterAuthId);
  });

// 6. 產生 API Token：必須登入 (高敏感操作) 🔒
export const createOrRegenerateApiTokenFn = createServerFn({ method: "POST" })
  .middleware([protectedMiddleware])
  .validator(strictValidator)
  .handler(async ({ context }) => {
    return createOrRegenerateApiTokenForCurrentUser(context.user.betterAuthId);
  });

export const pinItemFn = createServerFn({ method: "POST" })
  .middleware([protectedMiddleware])
  .validator(effectInputValidator(PinItemInputSchema))
  .handler(async ({ data }) => {
    const { id, type } = data;
    return toResult(pinItemLogicEffect(id, type));
  });

export const getUserIdByDiscordIdFn = createServerFn({ method: "GET" })
  .middleware([protectedMiddleware])
  .validator((data: { discordId: string }) => data)
  .handler(async ({ data }) => {
    const result = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.discordId, data.discordId))
      .limit(1);

    return result[0]?.id ?? null;
  });

// Compatible aliases for legacy naming.
export const getCachedUser = getUserByIdFn;
