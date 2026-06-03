import { Effect, Schema } from "effect";
import { SubmitBotFailed } from "#/errors/bot-errors";
import type { DiscordBotRPCInfo } from "#/features/bots/bot-submit.types";
import { fetchJsonEffect, toErrorMessage } from "#/lib/effect-utils";

export const DiscordUserSchema = Schema.Struct({
	id: Schema.String,
	discriminator: Schema.String,
	avatar: Schema.NullishOr(Schema.String),
	banner: Schema.NullishOr(Schema.String),
	accent_color: Schema.NullishOr(Schema.Number),
});

function djb2Hash(str: string): number {
	let hash = 5381;
	for (let i = 0; i < str.length; i++) {
		hash = (hash * 33) ^ str.charCodeAt(i);
	}
	return Math.abs(hash);
}

// HSL 轉 Hex 顏色
function hslToHex(h: number, s: number, l: number): string {
	l /= 100;
	const a = (s * Math.min(l, 1 - l)) / 100;
	const f = (n: number) => {
		const k = (n + h / 30) % 12;
		const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
		return Math.round(255 * color)
			.toString(16)
			.padStart(2, "0");
	};
	return `#${f(0)}${f(8)}${f(4)}`;
}

// 封裝 Fetch User 的 Effect
export function fetchUserEffect(userId: string) {
	const botToken = process.env.DISCORD_BOT_TOKEN;

	return fetchJsonEffect(`https://discord.com/api/v10/users/${userId}`, {
		headers: {
			Authorization: `Bot ${botToken}`,
		},
	}).pipe(
		// 1. 先驗證原始資料結構
		Effect.flatMap(Schema.decodeUnknown(DiscordUserSchema)),
		// 2. 轉換並計算衍生欄位
		Effect.map((userData) => {
			const isAvatarGif = userData.avatar?.startsWith("a_");
			const isBannerGif = userData.banner?.startsWith("a_");

			// 拼接 Avatar URL (如果是預設頭像，使用 discriminator 計算)
			const avatarUrl = userData.avatar
				? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.${isAvatarGif ? "gif" : "png"}?size=1024`
				: `https://cdn.discordapp.com/embed/avatars/${Number(userData.discriminator) % 5}.png`;

			// 拼接 Banner URL
			const bannerUrl = userData.banner
				? `https://cdn.discordapp.com/banners/${userData.id}/${userData.banner}.${isBannerGif ? "gif" : "png"}?size=1024`
				: null;

			// 計算 Accent Color
			let accentColorHex: string;
			if (
				userData.accent_color !== null &&
				userData.accent_color !== undefined
			) {
				accentColorHex = `#${userData.accent_color.toString(16).padStart(6, "0")}`;
			} else {
				const hash = djb2Hash(userData.avatar || "default");
				const hue = hash % 360;
				accentColorHex = hslToHex(hue, 60, 55);
			}

			return {
				id: userData.id,
				avatarUrl,
				bannerUrl,
				accentColorHex,
			};
		}),
		Effect.mapError((error) => new Error(`獲取 Discord 用戶失敗: ${error}`)),
	);
}

export function fetchBotRpcEffect(
	botId: string,
): Effect.Effect<DiscordBotRPCInfo, SubmitBotFailed> {
	return Effect.gen(function* () {
		const payload = yield* fetchJsonEffect(
			`https://discord.com/api/v10/applications/${botId}/rpc`,
		).pipe(
			Effect.mapError(
				(error) =>
					new SubmitBotFailed({
						message: `Discord RPC 請求或解析失敗：${toErrorMessage(error)}`,
					}),
			),
		);

		return payload as DiscordBotRPCInfo;
	});
}
