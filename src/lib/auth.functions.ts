import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

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

type SessionLike = {
	user?: SessionUserLike | null;
	discordProfile?: {
		id: string;
		username?: string;
		global_name?: string;
		image_url?: string;
		avatar?: string;
		banner_url?: string | null;
		banner_color?: string | null;
	} | null;
	error?: string | null;
} | null;

function withDiscordProfile(session: SessionLike): SessionLike {
	if (!session) return session;
	if (session.discordProfile?.id) return session;

	const user = session.user;
	const id = user?.discordId || user?.id;
	if (!id) return session;

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
		const { getAuth } = await import("@/lib/auth");
		const auth = await getAuth();
		const headers = getRequestHeaders();
		const session = await auth.api.getSession({ headers });

		return withDiscordProfile(session as SessionLike);
	},
);

export const ensureSession = createServerFn({ method: "GET" }).handler(
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
