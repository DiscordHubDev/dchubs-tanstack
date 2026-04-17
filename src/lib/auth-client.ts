import { createAuthClient } from "better-auth/react";

const authClient = createAuthClient();

type LegacyDiscordProfile = {
	id: string;
	username?: string;
	global_name?: string;
	image_url?: string;
	avatar?: string;
	banner_url?: string | null;
	banner_color?: string | null;
};

export type LegacySessionData = {
	discordProfile?: LegacyDiscordProfile;
	error?: string | null;
	user?: {
		id?: string;
		discordId?: string;
		name?: string;
		image?: string;
	};
	session?: {
		expiresAt?: string;
	};
};

function withDiscordProfile(
	session: LegacySessionData | null,
): LegacySessionData | null {
	if (!session) return session;
	if (session.discordProfile?.id) return session;

	const user = session.user;
	const id = user?.discordId || user?.id;
	if (!id) return session;

	return {
		...session,
		discordProfile: {
			id,
			username: user?.name || "",
			global_name: user?.name || "",
			image_url: user?.image || "",
			avatar: user?.image || "",
			banner_url: null,
			banner_color: null,
		},
		error: session.error ?? null,
	};
}

export function useSession() {
	const { data, isPending, error, refetch } = authClient.useSession();
	const normalizedData = withDiscordProfile(
		(data as LegacySessionData | null) ?? null,
	);

	return {
		data: normalizedData,
		isPending,
		error,
		status: isPending
			? "loading"
			: normalizedData
				? "authenticated"
				: "unauthenticated",
		update: refetch,
	};
}

export function signIn(callbackURL?: string) {
	return authClient.signIn.social({
		provider: "discord",
		...(callbackURL ? { callbackURL } : {}),
	});
}

export function signOut() {
	return authClient.signOut();
}
