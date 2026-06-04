import { eq } from "drizzle-orm";
import { db } from "#/drizzle/db";
import { user } from "#/drizzle/schema";

type DiscordProfileLike = {
	id: string;
	username?: string;
	name?: string | null;
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

export async function syncDiscordProfileToUser(account: any) {
	// 確保只處理 Discord 提供商
	if (account.providerId !== "discord" || !account.userId) return;

	try {
		// 這裡的 account.profile 通常包含了社交平台回傳的原始 JSON
		// 依照 Better Auth 的設計，原始 profile 會被存在 account.profile 中
		const profile =
			typeof account.profile === "string"
				? JSON.parse(account.profile)
				: account.profile;

		if (!profile) {
			console.log("[Sync] 找不到原始 Discord Profile，跳過同步。");
			return;
		}

		console.log(
			"[Sync] 偵測到 Discord Profile:",
			JSON.stringify(profile, null, 2),
		);

		// 複用你原本寫好的解析邏輯
		const avatarUrl = buildDiscordAvatar(profile);
		const bannerUrl = buildDiscordBanner(profile);

		console.log(`[Sync] 開始為 User ID: ${account.userId} 同步 Discord 資訊`);
		console.log(
			`[Sync] 解析結果 -> Name: ${profile.name || profile.username || "Unknown"}, Avatar: ${avatarUrl}, Banner: ${bannerUrl}, Username: ${profile.username || "None"}`,
		);

		// 直接更新 User 表，把缺漏或需要更新的欄位全部塞進去
		await db
			.update(user)
			.set({
				discordId: profile.id,
				username: profile.username || "",
				name: profile.name || profile.username || "",
				image: avatarUrl,
				avatar: avatarUrl,
				banner: bannerUrl,
				bannerColor: profile.banner_color || null,
			})
			.where(eq(user.id, account.userId));

		console.log(`[Sync] User ID: ${account.userId} 資訊同步成功！`);
	} catch (error) {
		console.error("[Sync] 同步 Discord 資訊時發生錯誤:", error);
	}
}
