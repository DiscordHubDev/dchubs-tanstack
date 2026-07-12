// src/lib/edge-context.ts
import { createMiddleware } from "@tanstack/react-start";

import { getAuth } from "./auth";
import { env } from "cloudflare:workers";
import { Effect } from "effect";

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

export type EdgeContext = {
  trusted: boolean;
  isAdmin: boolean;
  sessionId: string | null;
  userId: string | null;
  user: DomainUser | null;
  isBanned?: boolean; // 新增
};

const ADMIN_IDS = (import.meta.env.VITE_ADMIN_IDS || process.env.VITE_ADMIN_IDS || "")
  .split(/[\s,]+/)
  .map((id) => id.trim())
  .filter(Boolean);

export const edgeContextMiddleware = createMiddleware().server(async ({ next, request }) => {
  const auth = await getAuth();

  const sessionData = await auth.api.getSession({
    headers: request.headers,
  });

  const baUser = sessionData?.user ?? null;

  let isAdmin = false;
  let isBanned = false;
  let domainUser: DomainUser | null = null;

  if (baUser) {
    const userId = baUser.id || baUser.discordId;

    domainUser = {
      betterAuthId: baUser.id,
      discordId: baUser.discordId,
      username: baUser.username || null,
      avatar: baUser.avatar || null,
      banner: baUser.banner || null,
      bannerColor: baUser.bannerColor || null,
      name: baUser.name || null,
      nsfw: baUser.nsfw ?? false,
    };

    // === Admin 判斷 ===
    isAdmin = ADMIN_IDS.includes(userId) || ADMIN_IDS.includes(baUser.discordId);

    // === Banned User 檢查 ===
    if (env.BANNED_USERS && userId) {
      const banned = await env.BANNED_USERS.get(`banned:${userId}`);
      if (banned) {
        isBanned = true;
        console.log(`🚫 Banned user detected: ${userId}`);
      }
    }
  }

  const context: EdgeContext = {
    trusted: true,
    isAdmin,
    isBanned,
    sessionId: sessionData?.session?.id ?? null,
    userId: baUser?.id ?? null,
    user: domainUser,
  };

  // 如果被 ban，直接拒絕（可依需求調整）
  if (isBanned) {
    return new Response(JSON.stringify({ error: "Forbidden: Account is banned." }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

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
