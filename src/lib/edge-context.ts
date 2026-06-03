import { getRequest } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { db } from "#/drizzle/db";
import * as schema from "#/drizzle/schema";

const GATEWAY_SECRET = process.env.GATEWAY_SECRET;

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

export async function getDomainUser(edgeUserId: string) {
	if (!edgeUserId) return null;

	// 1. 判斷是否為本地開發的 Discord ID（Discord ID 全由數字組成）
	const isDiscordId = /^\d+$/.test(edgeUserId);

	// 2. 動態決定 where 條件
	const queryCondition = isDiscordId
		? eq(schema.authUser.discordId, edgeUserId)
		: eq(schema.authUser.id, edgeUserId);

	const result = await db
		.select({
			betterAuthId: schema.authUser.id,
			discordId: schema.authUser.discordId,
			username: schema.user.username,
			avatar: schema.user.avatar,
			banner: schema.user.banner,
			bannerColor: schema.user.bannerColor,
		})
		.from(schema.authUser)
		// 修正：用 authUser 的 userId 去對接 user 的 id
		.innerJoin(schema.user, eq(schema.authUser.id, schema.user.id))
		.where(queryCondition)
		.limit(1);

	return result[0] ?? null;
}

export async function requireDomainUser() {
	const context = getEdgeContext();

	if (!context.trusted) {
		throw new Error("No trusted context");
	}

	if (!context.userId) {
		throw new Error("No user ID in context");
	}

	// if (!context.trusted || !context.userId) {
	// 	throw new Error("Unauthorized");
	// }

	const user = await getDomainUser(context.userId);
	if (!user) {
		throw new Error("User profile not found");
		// 💡 備註：你也可以改成 throw new Error("User profile not found") 以便前端區分錯誤類型
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
