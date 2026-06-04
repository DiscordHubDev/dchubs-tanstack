// src/lib/auth-middleware.ts
import { createMiddleware } from "@tanstack/react-start";
import type { DomainUser } from "./edge-context";
import { getResolvedEdgeContext } from "./edge-context";

export type AuthContext = {
	edgeContext: Awaited<ReturnType<typeof getResolvedEdgeContext>>;
	user: DomainUser | null;
};

// ✅ 專為 protected handler 使用的收窄型別
export type ProtectedAuthContext = {
	edgeContext: Awaited<ReturnType<typeof getResolvedEdgeContext>>;
	user: DomainUser; // non-nullable
};

export const authMiddleware = createMiddleware().server(async ({ next }) => {
	const resolved = await getResolvedEdgeContext();
	return await next({
		context: {
			edgeContext: resolved,
			user: resolved.user,
		},
	});
});

export const protectedMiddleware = createMiddleware()
	.middleware([authMiddleware])
	.server(async ({ next, context }) => {
		if (!context.user) {
			throw new Error("Unauthorized: 未登入");
		}

		// ✅ 解構後 TypeScript 能正確收窄 user 的型別為 DomainUser（非 null）
		const { user, edgeContext } = context;

		return await next({
			context: { user, edgeContext } satisfies ProtectedAuthContext,
		});
	});

export const adminMiddleware = createMiddleware()
	.middleware([protectedMiddleware])
	.server(async ({ next, context }) => {
		if (!context.edgeContext.isAdmin) {
			throw new Error("Forbidden: 權限不足");
		}
		return await next({ context });
	});
