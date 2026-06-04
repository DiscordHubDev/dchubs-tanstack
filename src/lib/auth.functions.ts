// src/lib/auth.functions.ts
import { createServerFn } from "@tanstack/react-start";
import { getResolvedEdgeContext, requireDomainUser } from "./edge-context";

type SessionUserLike = {
	id?: string;
	discordId?: string;
	name?: string;
	image?: string;
	username?: string;
	avatar?: string;
	banner?: string | null;
	bannerColor?: string | null;
};

export type NormalizedDiscordProfile = {
	id: string;
	username: string;
	global_name: string;
	image_url: string;
	avatar: string;
	banner_url: string | null;
	banner_color: string | null;
};

export type SessionLike = {
	user?: SessionUserLike | null;
	discordProfile?: Partial<NormalizedDiscordProfile> | null;
	error?: string | null;
} | null;

export type NormalizedSession = NonNullable<SessionLike> & {
	discordProfile?: NormalizedDiscordProfile;
};

export function withDiscordProfile(session: null): null;
export function withDiscordProfile(
	session: NonNullable<SessionLike>,
): NormalizedSession;
export function withDiscordProfile(
	session: SessionLike,
): NormalizedSession | null;
export function withDiscordProfile(
	session: SessionLike,
): NormalizedSession | null {
	if (!session) return null;

	if (session.discordProfile?.id) return session as NormalizedSession;

	const user = session.user;
	const id = user?.discordId || user?.id;
	if (!id) return session as NormalizedSession;

	return {
		...session,
		discordProfile: {
			id,
			username: user?.username || user?.name || "",
			global_name: user?.name || "",
			image_url: user?.avatar || user?.image || "",
			avatar: user?.avatar || user?.image || "",
			banner_url: user?.banner || null,
			banner_color: user?.bannerColor || null,
		},
		error: session.error ?? null,
	};
}

export const getSession = createServerFn({ method: "GET" }).handler(
	async () => {
		try {
			// 使用你的 Edge Context 獲取資料庫內的完整用戶資料
			const { user } = await requireDomainUser();

			// 手動組裝回前端需要的 Session 結構
			const sessionData: SessionLike = {
				user: {
					id: user.betterAuthId,
					discordId: user.discordId,
					username: user.username || "",
					avatar:
						user.avatar || "https://cdn.discordapp.com/embed/avatars/0.png",
					banner: user.banner,
					bannerColor: user.bannerColor,
				},
			};

			return withDiscordProfile(sessionData);
		} catch (error) {
			// requireDomainUser 如果找不到 trusted context 會拋錯，這裡接住並回傳 null
			return null;
		}
	},
);

export const ensureSession = createServerFn({ method: "GET" }).handler(
	async () => {
		const session = await getSession();
		if (!session) {
			throw new Error("Unauthorized");
		}
		return session;
	},
);

// 修改 checkAuthServerFn
export const checkAuthServerFn = createServerFn({ method: "GET" }).handler(
	async () => {
		try {
			// ✅ 改用 getResolvedEdgeContext，userId 保證是 Discord ID
			const context = await getResolvedEdgeContext();

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
	},
);
