import { createAuthClient } from "better-auth/react";

const authClient = createAuthClient();

export type LegacyDiscordProfile = {
	id: string;
	username: string;
	name: string;
	image_url: string;
	avatar: string;
	banner_url: string | null;
	banner_color: string | null;
};

export type LegacySessionData = {
	discordProfile?: Partial<LegacyDiscordProfile>;
	error?: string | null;
	user?: {
		id?: string;
		discordId?: string;
		name?: string;
		username?: string;
		image?: string;
	};
	session?: {
		expiresAt?: string;
	};
};

export type NormalizedLegacySession = NonNullable<LegacySessionData> & {
	discordProfile?: LegacyDiscordProfile;
};

export function signIn(callbackURL?: string) {
	return authClient.signIn.social({
		provider: "discord",

		...(callbackURL ? { callbackURL } : {}),
	});
}

export function signOut() {
	return authClient.signOut();
}
