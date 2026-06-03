// @/lib/auth-middleware.ts
import { createMiddleware } from "@tanstack/react-start";
import { getDomainUser, getEdgeContext } from "./edge-context";

export type AuthContext = {
	edgeContext: ReturnType<typeof getEdgeContext>;
	user: Awaited<ReturnType<typeof getDomainUser>>; // 這裡的 user 是 getDomainUser 的返回值類型
};

export const authMiddleware = createMiddleware().server(async ({ next }) => {
	const edgeContext = getEdgeContext();

	const user =
		edgeContext.trusted && edgeContext.userId
			? await getDomainUser(edgeContext.userId)
			: null;

	return await next({ context: { edgeContext, user } });
});
export const protectedMiddleware = createMiddleware()
	.middleware([authMiddleware])
	.server(async ({ next, context }) => {
		if (!context.user) {
			throw new Error("Unauthorized: 未登入");
		}

		return await next({
			context: {
				...context,
				user: context.user,
			},
		});
	});

export const adminMiddleware = createMiddleware()
	.middleware([protectedMiddleware])
	.server(async ({ next, context }) => {
		if (!context.edgeContext.isAdmin) {
			throw new Error("Forbidden: 權限不足，需要管理員權限");
		}

		return await next({ context });
	});
