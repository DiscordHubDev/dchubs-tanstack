// src/lib/auth.functions.ts
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { Effect } from "effect";
import { edgeContextMiddleware } from "./edge-context";
import { runEffect } from "./effect-utils";
import { syncToCloudflareKV } from "./kv-sync";
import { getAuth } from "./auth";

interface BanUserPayload {
  targetUserId: string;
  reason?: string;
}

export type SessionUserLike = {
  id: string; // Better Auth 產生的 UUID
  discordId: string; // Discord 的 ID
  name: string; // 預設 fallback 用的 name (來自 name 或 username)
  username: string;
  avatar: string; // 已經組裝好的 avatar URL，不會是 null
  banner: string | null;
  bannerColor: string | null;
};

export type NormalizedSession = {
  user: SessionUserLike;
  // 如果你前端有依賴 discordProfile 這個屬性，可以保留，否則建議平坦化放在 user 裡即可
  discordProfile?: SessionUserLike;
  error?: string | null;
};

export const getSession = createServerFn({ method: "GET" })
  .middleware([edgeContextMiddleware])
  .handler(async ({ context }) => {
    if (!context.user) {
      console.log("getSession: No user in context");
      return null;
    }

    const user = context.user;

    const sessionUser = {
      id: user.betterAuthId,
      discordId: user.discordId,
      username: user.username || "未知使用者",
      name: user.name || "未知使用者",
      avatar: user.avatar || "https://cdn.discordapp.com/embed/avatars/0.png",
      banner: user.banner,
      bannerColor: user.bannerColor,
    };

    return {
      user: sessionUser,
      discordProfile: sessionUser,
      error: null,
    };
  });

export const ensureSession = createServerFn({ method: "GET" }).handler(async () => {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session;
});

// 修改 checkAuthServerFn
export const checkAuthServerFn = createServerFn({ method: "GET" })
  .middleware([edgeContextMiddleware])
  .handler(async ({ context }) => {
    try {
      if (!context.trusted || !context.userId) {
        return { isAuthenticated: false, userId: null };
      }

      return {
        isAuthenticated: true,
        userId: context.userId, // 此時已是 Discord ID
      };
    } catch {
      return { isAuthenticated: false, userId: null };
    }
  });

export const banUserFn = createServerFn({ method: "POST" })
  .inputValidator((data: BanUserPayload) => data)
  .handler(async ({ data }) => {
    // 1. 取得原始 Request (以便將 headers 傳給 Better Auth 驗證管理員身分)
    const request = getRequest();

    const auth = await getAuth();

    // 2. 定義更新資料庫的 Effect (呼叫 Better Auth API)
    const banDbEffect = Effect.tryPromise({
      try: () =>
        auth.api.banUser({
          body: {
            userId: data.targetUserId,
            banReason: data.reason,
            // 可以自行決定是否傳入 banExpiresIn
          },
          headers: request.headers,
        }),
      catch: (error) => new Error(`Better Auth 封鎖失敗: ${error}`),
    });

    // 3. 組合主邏輯
    const program = Effect.gen(function* () {
      // 步驟一：先更新 Better Auth 資料庫（如果這步失敗，因為 Effect.gen 的特性，會直接跳到錯誤處理，不會執行步驟二）
      yield* banDbEffect;

      // 步驟二：同步到 Cloudflare KV
      yield* syncToCloudflareKV(data.targetUserId, true);

      // 回傳成功結果
      return { success: true, message: "用戶已成功封鎖" };
    });

    // 4. 執行 Effect 並且將錯誤拋給 TanStack Router 處理
    return await runEffect(program).catch((error) => {
      // 這裡可以接上你的 logger (例如 Sentry)
      console.error("[Admin Ban Error]:", error);

      // 拋出標準 Error 讓前端的 useServerFn 或是 Action 捕捉到
      throw new Error(error.message);
    });
  });
