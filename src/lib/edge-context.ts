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

export function getEdgeContext() {
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

// 2. 加上 : Promise<DomainUser | null> 型別註解
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
			console.log(
				`💡 全新用戶 (Discord: ${userRow.discordId})，正在自動初始化舊 User 表...`,
			);

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

			// 加上型別註解後，這裡的遞迴呼叫就不會再報錯了
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

export async function requireDomainUser() {
	const context = getEdgeContext();

	if (!context.trusted) throw new Error("No trusted context");
	if (!context.userId) throw new Error("No user ID in context");

	// 💡 新增這行來檢查
	console.log(
		"🔍 [requireDomainUser] Looking up DB for userId:",
		context.userId,
	);

	const user = await getDomainUser(context.userId);

	if (!user) {
		throw new Error("User profile not found");
	}

	return { context, user };
}

export function getSessionUserIdEffect(): Effect.Effect<string, Error> {
	return Effect.gen(function* () {
		const { user } = yield* Effect.tryPromise({
			try: () => requireDomainUser(),
			catch: (error) => new Error(`驗證失敗: ${error}`),
		});

		if (!user || !user.discordId) {
			return yield* Effect.fail(new Error("請先登入 Discord 帳號"));
		}

		return user.discordId;
	});
}
