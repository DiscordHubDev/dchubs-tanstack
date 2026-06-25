import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, eq, or } from "drizzle-orm";
import { Effect } from "effect";
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
  nsfw: boolean;
};

type RawEdgeContext = {
  userId: string | null;
  sessionId: string | null;
  isAdmin: boolean;
  trusted: boolean;
};

function getRawEdgeContext(): RawEdgeContext {
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

async function fetchDomainUser(edgeUserId: string): Promise<DomainUser | null> {
  // ... 你的邏輯不變 ...
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
      nsfw: schema.user.nsfw,
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
        ? or(eq(schema.user.discordId, edgeUserId), eq(schema.authAccount.accountId, edgeUserId))
        : eq(schema.user.id, edgeUserId),
    )
    .limit(1);

  const userRow = result[0] ?? null;
  const actualDiscordId = userRow?.discordId || userRow?.accountId;

  if (!userRow || !actualDiscordId) return null;

  const username = userRow.username ?? userRow.name ?? "Unknown User";
  const avatar =
    userRow.avatar ?? userRow.image ?? "https://cdn.discordapp.com/embed/avatars/0.png";

  return {
    betterAuthId: userRow.id,
    discordId: actualDiscordId,
    username,
    avatar,
    banner: userRow.banner ?? null,
    bannerColor: userRow.bannerColor ?? null,
    name: userRow.name ?? username,
    nsfw: userRow.nsfw,
  };
}

// ✅ 將 EdgeContext 匯出，讓 auth-middleware 能夠使用
export type EdgeContext = {
  trusted: boolean;
  isAdmin: boolean;
  sessionId: string | null;
  userId: string | null;
  user: DomainUser | null;
};

// 建立 Middleware
export const edgeContextMiddleware = createMiddleware().server(async ({ next }) => {
  const raw = getRawEdgeContext();

  if (!raw.trusted || !raw.userId) {
    const context: EdgeContext = {
      trusted: false,
      isAdmin: raw.isAdmin,
      sessionId: raw.sessionId,
      userId: null,
      user: null,
    };
    return next({ context });
  }

  const user = await fetchDomainUser(raw.userId);

  const context: EdgeContext = {
    trusted: true,
    isAdmin: raw.isAdmin,
    sessionId: raw.sessionId,
    userId: user?.discordId ?? null,
    user,
  };

  return next({ context });
});

export function getSessionUserIdEffect(user: DomainUser | null): Effect.Effect<string, Error> {
  return Effect.gen(function* () {
    if (!user?.discordId) {
      return yield* Effect.fail(new Error("請先登入 Discord 帳號"));
    }
    return user.discordId;
  });
}
