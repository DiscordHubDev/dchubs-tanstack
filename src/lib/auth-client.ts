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

export function useSession() {
	const { data, isPending, error, refetch } = authClient.useSession();

	return {
		data: (data as LegacySessionData | null) ?? null,
		isPending,
		error,
		status: isPending ? "loading" : data ? "authenticated" : "unauthenticated",
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
