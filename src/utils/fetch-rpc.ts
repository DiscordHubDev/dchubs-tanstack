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

			// --- 拼接 Avatar URL ---
			let avatarUrl: string;
			if (userData.avatar) {
				avatarUrl = `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.${isAvatarGif ? "gif" : "png"}?size=1024`;
			} else {
				// 判斷是否為新版無 discriminator 的帳號 (新版可能回傳 "0"、"0000" 或未定義)
				const isNewUsernameSystem =
					!userData.discriminator ||
					userData.discriminator === "0" ||
					userData.discriminator === "0000";

				if (isNewUsernameSystem) {
					// 新版帳號：使用 User ID 進行位移運算，預設頭像有 6 種 (0-5)
					const userIdNum = BigInt(userData.id);
					const base = Number((userIdNum >> 22n) % 6n);
					avatarUrl = `https://cdn.discordapp.com/embed/avatars/${base}.png`;
				} else {
					// 舊版帳號：使用 discriminator % 5
					const base = Number(userData.discriminator) % 5;
					avatarUrl = `https://cdn.discordapp.com/embed/avatars/${base}.png`;
				}
			}

			// --- 拼接 Banner URL ---
			const bannerUrl = userData.banner
				? `https://cdn.discordapp.com/banners/${userData.id}/${userData.banner}.${isBannerGif ? "gif" : "png"}?size=4096`
				: null;

			// --- 計算 Accent Color ---
			let accentColorHex: string;
			if (
				userData.accent_color !== null &&
				userData.accent_color !== undefined
			) {
				accentColorHex = `#${userData.accent_color.toString(16).padStart(6, "0")}`;
			} else {
				// 優化：若沒有 avatar，使用唯一值 id 作為 Hash 基礎，避免所有沒頭像的人顏色都相同
				const hashSeed = userData.avatar || `default-${userData.id}`;
				const hash = djb2Hash(hashSeed);
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
		// 3. 統一錯誤處理
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
