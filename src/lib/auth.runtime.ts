import { db } from "#/drizzle/db";
import {
	authAccount,
	authSession,
	authUser,
	authVerification,
	user as Users,
} from "../drizzle/schema";

type DiscordProfileLike = {
	id: string;
	username?: string;
	global_name?: string | null;
	avatar?: string | null;
	banner?: string | null;
	banner_color?: string | null;
	discriminator?: string;
};

function buildDiscordAvatar(profile: DiscordProfileLike): string {
	if (!profile.avatar) {
		const base = Number(profile.discriminator || "0") % 5;
		return `https://cdn.discordapp.com/embed/avatars/${base}.png`;
	}

	const format = profile.avatar.startsWith("a_") ? "gif" : "png";
	return `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.${format}`;
}

function buildDiscordBanner(profile: DiscordProfileLike): string | null {
	if (!profile.banner) return null;
	return `https://cdn.discordapp.com/banners/${profile.id}/${profile.banner}.png?size=4096`;
}

async function syncDomainUser(user: {
	discordId?: string | null;
	name?: string | null;
	image?: string | null;
	username?: string | null;
	avatar?: string | null;
	banner?: string | null;
	bannerColor?: string | null;
}) {
	if (!user.discordId) return;

	await db
		.insert(Users)
		.values({
			id: user.discordId,
			username: user.username || user.name || "未知使用者",
			avatar: user.avatar || user.image || "",
			banner: user.banner || null,
			bannerColor: user.bannerColor || null,
		})
		.onConflictDoUpdate({
			target: Users.id,
			set: {
				username: user.username || user.name || "未知使用者",
				avatar: user.avatar || user.image || "",
				banner: user.banner || null,
				bannerColor: user.bannerColor || null,
			},
		});
}

export async function createAuth() {
	const [{ betterAuth }, { drizzleAdapter }] = await Promise.all([
		import("better-auth"),
		import("better-auth/adapters/drizzle"),
	]);

	const fallbackBaseUrl =
		process.env.BETTER_AUTH_URL ||
		process.env.SITE_URL ||
		process.env.VITE_SITE_URL ||
		process.env.NEXT_PUBLIC_SITE_URL ||
		"http://localhost:3000";

	const isProd = process.env.NODE_ENV === "production";
	const authSchema = {
		authAccount,
		authSession,
		authUser,
		authVerification,
	};

	return betterAuth({
		secret: process.env.BETTER_AUTH_SECRET,
		baseURL: fallbackBaseUrl,
		trustedOrigins: [
			"https://dchubs.org",
			"https://www.dchubs.org",
			"https://docs.dchubs.org",
			"http://localhost:3000",
			"http://127.0.0.1:12000",
		],

		advanced: {
			ipAddress: {
				ipAddressHeaders: isProd ? ["cf-connecting-ip"] : ["x-forwarded-for"],
			},
		},

		database: drizzleAdapter(db, {
			provider: "pg",
			schema: authSchema,
		}),

		user: {
			modelName: "authUser",
			additionalFields: {
				discordId: {
					type: "string",
					required: false,
				},
				username: {
					type: "string",
					required: false,
				},
				avatar: {
					type: "string",
					required: false,
				},
				banner: {
					type: "string",
					required: false,
				},
				bannerColor: {
					type: "string",
					required: false,
				},
			},
		},
		session: {
			modelName: "authSession",
		},
		account: {
			modelName: "authAccount",
			updateAccountOnSignIn: true,
		},
		verification: {
			modelName: "authVerification",
		},

		socialProviders: {
			discord: {
				clientId: process.env.DISCORD_CLIENT_ID as string,
				clientSecret: process.env.DISCORD_CLIENT_SECRET as string,
				scope: ["identify", "guilds", "email"],
				mapProfileToUser: (profile: DiscordProfileLike) => {
					const avatar = buildDiscordAvatar(profile);
					return {
						name: profile.global_name || profile.username || "",
						image: avatar,
						discordId: profile.id,
						username: profile.username || "",
						avatar,
						banner: buildDiscordBanner(profile),
						bannerColor: profile.banner_color || null,
					};
				},
			},
		},

		databaseHooks: {
			user: {
				create: {
					after: async (user) => {
						await syncDomainUser(user as Parameters<typeof syncDomainUser>[0]);
					},
				},
				update: {
					after: async (user) => {
						await syncDomainUser(user as Parameters<typeof syncDomainUser>[0]);
					},
				},
			},
		},
	});
}
