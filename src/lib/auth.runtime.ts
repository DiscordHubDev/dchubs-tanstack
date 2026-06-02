import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { jwt } from "better-auth/plugins";
import { db } from "#/drizzle/db";
import * as schema from "#/drizzle/schema";

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

async function syncDomainUser(user: any) {
	if (!user.discordId) return;

	await db
		.insert(schema.user)
		.values({
			id: user.discordId,
			username: user.username || user.name || "未知使用者",
			avatar: user.avatar || user.image || "",
			banner: user.banner || null,
			bannerColor: user.bannerColor || null,
		})
		.onConflictDoUpdate({
			target: schema.user.id,
			set: {
				username: user.username || user.name || "未知使用者",
				avatar: user.avatar || user.image || "",
				banner: user.banner || null,
				bannerColor: user.bannerColor || null,
			},
		});
}

export async function createAuth() {
	const fallbackBaseUrl =
		process.env.BETTER_AUTH_URL ||
		process.env.SITE_URL ||
		process.env.VITE_SITE_URL ||
		"http://localhost:3000";

	const isProd = process.env.NODE_ENV === "production";

	return betterAuth({
		secret: process.env.BETTER_AUTH_SECRET,
		baseURL: fallbackBaseUrl,
		trustedOrigins: [
			"https://dchubs.org",
			"https://www.dchubs.org",
			"https://docs.dchubs.org",
			"http://localhost:3000",
			"http://127.0.0.1:12000",
			"https://beta.dchubs.org",
		],

		trustProxy: true,

		plugins: [
			jwt({
				jwt: {
					expirationTime: "1h", // 這個 plugin 的 JWT 是給第三方 API 用的，保留沒問題
				},
			}),
		],

		advanced: {
			ipAddress: {
				ipAddressHeaders: isProd ? ["cf-connecting-ip"] : ["x-forwarded-for"],
			},
		},

		database: drizzleAdapter(db, {
			provider: "pg",
			schema: schema,
		}),

		user: {
			modelName: "authUser",
			additionalFields: {
				discordId: { type: "string", required: false },
				username: { type: "string", required: false },
				avatar: { type: "string", required: false },
				banner: { type: "string", required: false },
				bannerColor: { type: "string", required: false },
			},
		},

		session: {
			modelName: "authSession",
			cookieCache: {
				enabled: true,
				maxAge: 7 * 24 * 60 * 60,
				strategy: "jwt",
			},
		},
		account: { modelName: "authAccount", updateAccountOnSignIn: true },
		verification: { modelName: "authVerification" },

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
					after: async (user) => await syncDomainUser(user),
				},
				update: {
					after: async (user) => await syncDomainUser(user),
				},
			},
		},
	});
}
