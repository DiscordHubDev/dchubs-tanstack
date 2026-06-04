// src/lib/edge-context.ts
import { getRequest } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { cache } from "react";
import { db } from "#/drizzle/db";
import * as schema from "#/drizzle/schema";

const GATEWAY_SECRET = process.env.GATEWAY_SECRET;

export type DomainUser = {
	betterAuthId: string;
	discordId: string;
	username: string | null;
	avatar: string | null;
	banner: string | null;
	bannerColor: string | null;
};

// 保持原樣：只讀 headers，不做任何 DB 查詢，不對外暴露
function getRawEdgeContext() {
	const req = getRequest();

	const gatewaySecret = req.headers.get("x-gateway-secret");
	if (gatewaySecret !== GATEWAY_SECRET) {
		return { userId: null, sessionId: null, isAdmin: false, trusted: false };
	}

	const userId = req.headers.get("x-edge-user-id");
	const sessionId = req.headers.get("x-edge-session-id");
	const isAdmin = req.headers.get("x-edge-is-admin") === "true";

	return {
		userId: userId || null,
		sessionId: sessionId || null,
		isAdmin,
		trusted: true,
	};
}

export const getDomainUser = cache(
	async (edgeUserId: string): Promise<DomainUser | null> => {
		if (!edgeUserId) return null;

		const isDiscordId = /^\d+$/.test(edgeUserId);
		const queryCondition = isDiscordId
			? eq(schema.authUser.discordId, edgeUserId)
			: eq(schema.authUser.id, edgeUserId);

		const result = await db
			.select({
				betterAuthId: schema.authUser.id,
				discordId: schema.authUser.discordId,
				authUsername: schema.authUser.username,
				authAvatar: schema.authUser.avatar,
				authName: schema.authUser.name,
				authImage: schema.authUser.image,
				authBanner: schema.authUser.banner,
				authBannerColor: schema.authUser.bannerColor,
				legacyUsername: schema.user.username,
				legacyAvatar: schema.user.avatar,
				legacyBanner: schema.user.banner,
				legacyBannerColor: schema.user.bannerColor,
			})
			.from(schema.authUser)
			.leftJoin(schema.user, eq(schema.authUser.discordId, schema.user.id))
			.where(queryCondition)
			.limit(1);

		const userRow = result[0] ?? null;
		if (!userRow) return null;

		if (!userRow.legacyUsername && userRow.discordId) {
			await db.insert(schema.user).values({
				id: userRow.discordId,
				username: userRow.authUsername ?? userRow.authName ?? "Unknown User",
				avatar:
					userRow.authAvatar ??
					userRow.authImage ??
					"https://cdn.discordapp.com/embed/avatars/0.png",
				banner: userRow.authBanner,
				bannerColor: userRow.authBannerColor,
				joinedAt: new Date().toISOString(),
			});
			return getDomainUser(edgeUserId);
		}

		return {
			betterAuthId: userRow.betterAuthId,
			discordId: userRow.discordId,
			username:
				userRow.legacyUsername ??
				userRow.authUsername ??
				userRow.authName ??
				null,
			avatar:
				userRow.legacyAvatar ?? userRow.authAvatar ?? userRow.authImage ?? null,
			banner: userRow.legacyBanner ?? null,
			bannerColor: userRow.legacyBannerColor ?? null,
		};
	},
);

// ✅ 核心修復：這是整個 App 唯一的 Context 來源
// cache() 確保同一 Request 生命週期內只執行一次，所有呼叫者共享同一個物件
export const getResolvedEdgeContext = cache(async () => {
	const raw = getRawEdgeContext();

	if (!raw.trusted || !raw.userId) {
		return {
			trusted: raw.trusted,
			isAdmin: raw.isAdmin,
			sessionId: raw.sessionId,
			userId: null as string | null, // Discord ID or null
			user: null as DomainUser | null,
		};
	}

	const user = await getDomainUser(raw.userId);

	return {
		trusted: raw.trusted,
		isAdmin: raw.isAdmin,
		sessionId: raw.sessionId,
		userId: user?.discordId ?? null, // ← 永遠是 Discord ID
		user,
	};
});

// 對外提供同步版（只讀原始 header，用於非 async 場合）
// 注意：此版本的 userId 可能仍是 UUID，盡量避免直接使用 userId
export function getEdgeContext() {
	return getRawEdgeContext();
}

export async function requireDomainUser() {
	// ✅ 改用 getResolvedEdgeContext，不再手動覆寫
	const context = await getResolvedEdgeContext();

	if (!context.trusted) throw new Error("No trusted context");
	if (!context.userId) throw new Error("No user ID in context");
	if (!context.user) throw new Error("User profile not found");

	return { context, user: context.user };
}

export function getSessionUserIdEffect(): Effect.Effect<string, Error> {
	return Effect.gen(function* () {
		const { user } = yield* Effect.tryPromise({
			try: () => requireDomainUser(),
			catch: (error) => new Error(`驗證失敗: ${error}`),
		});

		if (!user?.discordId) {
			return yield* Effect.fail(new Error("請先登入 Discord 帳號"));
		}

		return user.discordId;
	});
}
