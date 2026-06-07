import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { jwt } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { eq } from "drizzle-orm";
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
	email?: string | null;
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

export async function createAuth() {
	const fallbackBaseUrl =
		process.env.BETTER_AUTH_URL ||
		process.env.SITE_URL ||
		process.env.VITE_SITE_URL ||
		"http://localhost:3000";

	const isProd = process.env.NODE_ENV === "production";

	return betterAuth({
		onInit: () => {
			console.log("🔥 Better Auth 初始化成功！Hooks 即將掛載...");
		},

		secret: process.env.BETTER_AUTH_SECRET,
		baseURL: fallbackBaseUrl,
		trustedOrigins: [
			"https://dchubs.org",
			"https://www.dchubs.org",
			"https://docs.dchubs.org",
			"http://localhost:3000",
			"http://127.0.0.1:12000",
			"https://beta.dchubs.org",
			"http://localhost:8787",
		],

		trustProxy: true,

		plugins: [
			jwt({
				jwt: {
					expirationTime: "1h", // 這個 plugin 的 JWT 是給第三方 API 用的，保留沒問題
				},
			}),
			tanstackStartCookies(),
		],

		advanced: {
			ipAddress: {
				ipAddressHeaders: isProd ? ["cf-connecting-ip"] : ["x-forwarded-for"],
			},
		},

		database: drizzleAdapter(db, {
			provider: "pg",
			schema: {
				// 關鍵在這裡：左邊是 Better Auth 內部的模型名，右邊是你 schema 檔案導出的變數
				user: schema.user,
				bot: schema.bot,
				server: schema.server,
				authSession: schema.authSession,
				authAccount: schema.authAccount,
				authVerification: schema.authVerification,
				jwks: schema.jwks, // 如果你有使用 JWT plugin，這行也必須加上
			},
		}),

		user: {
			modelName: "user",
			additionalFields: {
				discordId: { type: "string", required: false },
				username: { type: "string", required: false },
				avatar: { type: "string", required: false },
				banner: { type: "string", required: false },
				bannerColor: { type: "string", required: false },
			},
		},

		session: {
			activePeriod: 0,
			modelName: "authSession",
			cookieCache: {
				enabled: true,
				maxAge: 7 * 24 * 60 * 60,
				strategy: "jwt",
			},
		},
		account: {
			modelName: "authAccount",
			updateAccountOnSignIn: true,
			accountLinking: {
				enabled: true,
				trustedProviders: ["discord"], // 信任 Discord 提供的 Email
			},
		},
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
						email: profile.email || `${profile.id}@discord.local`,
					};
				},
			},
		},

		databaseHooks: {
			session: {
				create: {
					after: async (data) => {
						const session: any = data.session || data;
						if (!session || !session.userId) return;

						// 1. 取得該使用者的 Discord Account 紀錄（因為 updateAccountOnSignIn: true，這裡的 Token 是最新的）
						const account = await db.query.authAccount.findFirst({
							where: (accounts, { eq, and }) =>
								and(
									eq(accounts.userId, session.userId),
									eq(accounts.providerId, "discord"),
								),
						});

						if (account && account.accessToken) {
							try {
								// 2. 直接向 Discord 請求最新的 Profile 資料
								const res = await fetch("https://discord.com/api/users/@me", {
									headers: {
										Authorization: `Bearer ${account.accessToken}`,
									},
								});

								if (res.ok) {
									const profile: DiscordProfileLike = await res.json();

									console.log(`[Sync] 從 Discord 取得最新資料：${profile}`);

									const avatar = buildDiscordAvatar(profile);
									const banner = buildDiscordBanner(profile);
									const nowIsoString = new Date().toISOString();

									// 3. 直接 Update 資料庫裡的 user 表（不需要再用 insert onConflict）
									await db
										.update(schema.user)
										.set({
											discordId: profile.id,
											username: profile.username || "未知使用者",
											name:
												profile.global_name || profile.username || "未知使用者",
											avatar: avatar,
											banner: banner,
											bannerColor: profile.banner_color || null,
											updatedAt: nowIsoString,
											email: profile.email || `${profile.id}@discord.local`,
										})
										.where(eq(schema.user.id, session.userId));

									console.log(
										`[Sync] 成功強制同步 Discord 最新資料：${profile.global_name || profile.username}`,
									);
								}
							} catch (error) {
								console.error("[Sync] 同步 Discord 資料失敗：", error);
							}
						}
					},
				},
			},
		},
	});
}
