import { getRequestHeaders } from "@tanstack/react-start/server";
import { createSafeServerFn } from "#/utils/serverFn";
import { requireDomainUser } from "./edge-context";

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

type SessionLike = {
	user?: SessionUserLike | null;
	discordProfile?: Partial<NormalizedDiscordProfile> | null;
	error?: string | null;
} | null;

export type NormalizedSession = NonNullable<SessionLike> & {
	discordProfile?: NormalizedDiscordProfile;
};

function withDiscordProfile(session: null): null;
function withDiscordProfile(
	session: NonNullable<SessionLike>,
): NormalizedSession;
function withDiscordProfile(session: SessionLike): NormalizedSession | null;
function withDiscordProfile(session: SessionLike): NormalizedSession | null {
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

export const getSession = createSafeServerFn({ method: "GET" }).handler(
	async () => {
		const { getAuth } = await import("@/lib/auth");
		const auth = await getAuth();
		const headers = getRequestHeaders();
		const session = await auth.api.getSession({ headers });

		return withDiscordProfile(session as SessionLike);
	},
);

export const ensureSession = createSafeServerFn({ method: "GET" }).handler(
	async () => {
		const { getAuth } = await import("@/lib/auth");
		const auth = await getAuth();
		const headers = getRequestHeaders();
		const session = await auth.api.getSession({ headers });
		const normalizedSession = withDiscordProfile(session as SessionLike);

		if (!normalizedSession) {
			throw new Error("Unauthorized");
		}

		return normalizedSession;
	},
);

export const checkAuthServerFn = createSafeServerFn({ method: "GET" }).handler(
	async () => {
		try {
			// 嘗試取得帶有真實 Discord ID 的 Domain User
			const { user } = await requireDomainUser();
			return { isAuthenticated: true, userId: user.discordId };
		} catch (error) {
			// 如果 Header 沒有憑證或找不到 User，就會走到這裡
			return {
				isAuthenticated: false,
				userId: null,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	},
);
