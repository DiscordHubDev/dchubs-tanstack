// src/lib/auth-middleware.ts
import { createMiddleware } from "@tanstack/react-start";
import { type DomainUser, type EdgeContext, edgeContextMiddleware } from "./edge-context";

export type AuthContext = {
  edgeContext: EdgeContext;
  user: DomainUser | null;
};

// ✅ 專為 protected handler 使用的收窄型別
export type ProtectedAuthContext = {
  edgeContext: EdgeContext;
  user: DomainUser; // non-nullable
};

export const authMiddleware = createMiddleware()
  .middleware([edgeContextMiddleware])
  // 💡 取代舊的 getResolvedEdgeContext，直接從參數拿到前一個 middleware 的 context
  .server(async ({ next, context }) => {
    return next({
      context: {
        edgeContext: context, // context 已經是 EdgeContext 型別
        user: context.user,
      } satisfies AuthContext,
    });
  });

export const protectedMiddleware = createMiddleware()
  .middleware([authMiddleware])
  .server(async ({ next, context }) => {
    if (!context.user) {
      // 根據你的應用需求，這裡可以拋錯或拋出 HTTP Response (例如轉址)
      throw new Error("Unauthorized: 未登入");
    }

    // ✅ 解構後 TypeScript 能正確收窄 user 的型別為 DomainUser（非 null）
    const { user, edgeContext } = context;

    return next({
      context: { user, edgeContext } satisfies ProtectedAuthContext,
    });
  });

export const adminMiddleware = createMiddleware()
  .middleware([protectedMiddleware])
  .server(async ({ next, context }) => {
    if (!context.edgeContext.isAdmin) {
      throw new Error("Forbidden: 權限不足");
    }

    // 驗證過後直接將前面的 context 原封不動傳下去
    return next({ context });
  });
