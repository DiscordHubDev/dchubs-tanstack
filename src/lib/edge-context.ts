import { getRequest } from "@tanstack/react-start/server";
import { eq, or } from "drizzle-orm";
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
		.innerJoin(schema.user, eq(schema.authUser.discordId, schema.user.id))
		.where(
			or(
				eq(schema.authUser.id, edgeUserId), // Better Auth UUID
				eq(schema.authUser.discordId, edgeUserId), // Discord ID（本地開發用）
			),
		)
		.limit(1);

	return result[0] || null;
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

export async function getOptionalDomainUser() {
	const context = getEdgeContext();
	if (!context.trusted || !context.userId) return null;

	const user = await getDomainUser(context.userId);
	return user ?? null;
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
