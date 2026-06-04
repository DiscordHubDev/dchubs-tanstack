// src/lib/edge-context.ts
import { getRequest } from "@tanstack/react-start/server";
import { and, eq, or } from "drizzle-orm";
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
	name: string | null;
};

// 保持原樣：只讀 headers，不做任何 DB 查詢，不對外暴露
function getRawEdgeContext() {
	const req = getRequest();
	const gatewaySecret = req.headers.get("x-gateway-secret");

	if (gatewaySecret !== GATEWAY_SECRET) {
		return { userId: null, sessionId: null, isAdmin: false, trusted: false };
	}

	return {
		userId: req.headers.get("x-edge-user-id") || null,
		sessionId: req.headers.get("x-edge-session-id") || null,
		isAdmin: req.headers.get("x-edge-is-admin") === "true",
		trusted: true,
	};
}

export const getDomainUser = cache(
	async (edgeUserId: string): Promise<DomainUser | null> => {
		if (!edgeUserId) return null;

		const isDiscordId = /^\d+$/.test(edgeUserId);
		const result = await db
			.select({
				id: schema.user.id,
				discordId: schema.user.discordId,
				accountId: schema.authAccount.accountId,
				username: schema.user.username,
				name: schema.user.name,
				avatar: schema.user.avatar,
				image: schema.user.image,
				banner: schema.user.banner,
				bannerColor: schema.user.bannerColor,
			})
			.from(schema.user)
			.leftJoin(
				schema.authAccount,
				and(
					eq(schema.authAccount.userId, schema.user.id),
					eq(schema.authAccount.providerId, "discord"),
				),
			)
			.where(
				isDiscordId
					? or(
							eq(schema.user.discordId, edgeUserId),
							eq(schema.authAccount.accountId, edgeUserId), // 👈 補上這行，相容 Better-Auth 預設儲存位置
						)
					: eq(schema.user.id, edgeUserId),
			)
			.limit(1);

		const userRow = result[0] ?? null;

		console.log("[Debug] userRow:", userRow);

		const actualDiscordId = userRow?.discordId || userRow?.accountId;

		if (!userRow || !actualDiscordId) return null;

		// 處理 Fallback 邏輯
		const username = userRow.username ?? userRow.name ?? "Unknown User";
		const avatar =
			userRow.avatar ??
			userRow.image ??
			"https://cdn.discordapp.com/embed/avatars/0.png";
		const banner = userRow.banner ?? null;
		const bannerColor = userRow.bannerColor ?? null;
		const name = userRow.name ?? username;

		return {
			betterAuthId: userRow.id,
			discordId: actualDiscordId,
			username,
			avatar,
			banner,
			bannerColor,
			name,
		};
	},
);

export const getResolvedEdgeContext = cache(async () => {
	const raw = getRawEdgeContext();

	if (!raw.trusted || !raw.userId) {
		return {
			trusted: raw.trusted,
			isAdmin: raw.isAdmin,
			sessionId: raw.sessionId,
			userId: null as string | null,
			user: null as DomainUser | null,
		};
	}

	const user = await getDomainUser(raw.userId);

	return {
		trusted: raw.trusted,
		isAdmin: raw.isAdmin,
		sessionId: raw.sessionId,
		userId: user?.discordId ?? null, // 永遠確保對外暴露的是 Discord ID
		user,
	};
});

export function getEdgeContext() {
	return getRawEdgeContext();
}

export async function requireDomainUser() {
	const context = await getResolvedEdgeContext();

	if (!context.trusted) throw new Error("No trusted context");
	if (!context.userId || !context.user)
		throw new Error("User profile not found");

	return { context, user: context.user };
}

export function getSessionUserIdEffect(): Effect.Effect<string, Error> {
	return Effect.gen(function* () {
		const { user } = yield* Effect.tryPromise({
			try: () => requireDomainUser(),
			catch: (error) =>
				new Error(
					`驗證失敗: ${error instanceof Error ? error.message : String(error)}`,
				),
		});

		if (!user?.discordId) {
			return yield* Effect.fail(new Error("請先登入 Discord 帳號"));
		}

		return user.discordId;
	});
}
