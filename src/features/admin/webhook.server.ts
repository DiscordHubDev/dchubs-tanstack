import { Effect } from "effect";
import { NotificationFailed } from "#/errors/bot-errors";
import { fetchJsonEffect } from "#/lib/effect-utils";
import type { WebhookPayload } from "./webhook.type";

const DISCORD_AVATAR =
	"https://cdn.discordapp.com/icons/1297055626014490695/365d960f0a44f9a0c2de4672b0bcdcc0.webp?size=512&format=webp";

const DEFAULT_FOOTER = {
	text: "由 DiscordHubs 系統發送",
	icon_url: DISCORD_AVATAR,
};

interface DiscordEmbed {
	title?: string;
	description?: string;
	color?: number;
	footer?: { text: string; icon_url?: string };
	thumbnail?: { url: string };
	image?: { url: string };
}

interface DiscordWebhookPayload {
	username: string;
	avatar_url: string;
	content?: string;
	embeds?: DiscordEmbed[];
}

const joinLines = (...lines: string[]) => lines.join("\n");

export function sendDiscordWebhookEffect(
	payload: WebhookPayload, // 這裡使用你的 WebhookPayloadSchema 型別
): Effect.Effect<void, NotificationFailed> {
	return Effect.gen(function* () {
		const tag = payload._tag;

		// 🗺️ 取得對應的環境變數 URL
		const webhookUrlMap: Record<string, string | undefined> = {
			vote: process.env.VOTE_WEBHOOK_URL,
			approvedBot: process.env.APPROVED_WEBHOOK_URL,
			pendingBot: process.env.PENDING_WEBHOOK_URL,
			server: process.env.SERVER_WEBHOOK_URL,
		};

		const webhookUrl = webhookUrlMap[tag];
		if (!webhookUrl) {
			yield* Effect.logWarning(
				`[Webhook 警告] URL 尚未設置 (事件類型: ${tag})`,
			);
			return;
		}

		const webhookData: DiscordWebhookPayload = {
			username: "DcHubs通知",
			avatar_url: DISCORD_AVATAR,
		};
		const titleIcon = `<:pixel_symbol_exclamation_invert:1361299311131885600> |`;

		switch (tag) {
			case "vote": {
				const voteItem = payload.type === "server" ? "伺服器" : "機器人";
				webhookData.username = "DcHubs投票通知";
				webhookData.embeds = [
					{
						title: `${titleIcon} 投票系統`,
						color: 0x4285f4,
						description: joinLines(
							`➤用戶：**${payload.user.username || "未知"}**`,
							`➤用戶ID：**${payload.user.id}**`,
							`> ➤對**${voteItem}**：**${payload.target.name}** 進行了投票`,
							`> ➤${voteItem}ID：**${payload.target.id}**`,
						),
					},
				];
				break;
			}

			case "approvedBot": {
				const developerNames = payload.bot.developers
					.map((dev: any) => dev.username || "未知")
					.join("\n");

				webhookData.username = "DcHubs機器人通知";
				webhookData.content = "<@&1355617017549426919>";
				webhookData.embeds = [
					{
						title: `${titleIcon} 新機器人發佈通知！`,
						color: 0x4285f4,
						footer: DEFAULT_FOOTER,
						thumbnail: { url: payload.bot.icon || "" },
						image: { url: payload.bot.banner || "" },
						description: joinLines(
							`➤機器人名稱：**${payload.bot.name}**`,
							`➤機器人前綴：**${payload.bot.prefix}**`,
							`➤簡短描述：\`\`\`${payload.bot.description}\`\`\``,
							`➤開發者：\`\`\`${developerNames}\`\`\``,
							`➤邀請鏈結：\n> ${payload.bot.inviteUrl}`,
							`➤網站連結：\n> https://dchubs.org/bots/${payload.bot.id || "無"}`,
							`➤類別：\`\`\`${payload.bot.tags.join("\n")}\`\`\``,
						),
					},
				];
				break;
			}

			case "pendingBot": {
				webhookData.username = "DcHubs機器人通知";
				webhookData.content =
					"<@&1361412309209317468> <@549056425943629825> <@857502876108193812>";
				webhookData.embeds = [
					{
						title: `${titleIcon} 新審核機器人！`,
						color: 0x4285f4,
						footer: DEFAULT_FOOTER,
						thumbnail: { url: payload.avatarUrl || "" },
						description: joinLines(
							`➤機器人名稱：**${payload.data.botName}**`,
							`➤機器人前綴：**${payload.data.botPrefix}**`,
							`➤簡短描述：\`\`\`${payload.data.botDescription}\`\`\``,
							`➤類別：\`\`\`${payload.data.tags.join("\n")}\`\`\``,
						),
					},
				];
				break;
			}

			case "server": {
				webhookData.username = "DcHubs伺服器通知";
				webhookData.content = "<@&1355617333967585491>";
				webhookData.embeds = [
					{
						title: `${titleIcon} 新發佈的伺服器！`,
						color: 0x4285f4,
						footer: DEFAULT_FOOTER,
						thumbnail: { url: payload.activeServer.icon || "" },
						image: { url: payload.activeServer.banner || "" },
						description: joinLines(
							`➤伺服器名稱：**${payload.data.serverName}**`,
							`➤簡短描述：\n\`\`\`${payload.data.shortDescription}\`\`\``,
							`➤邀請連結：\n> **${payload.data.inviteLink}**`,
							`➤網站連結：\n> **https://dchubs.org/servers/${payload.activeServer.id || "無"}**`,
							`➤類別：\n\`\`\`${payload.data.tags.join("\n")}\`\`\``,
						),
					},
				];
				break;
			}
		}

		// 🚀 使用 Effect 進行非同步請求，並將錯誤轉化為 NotificationFailed
		yield* fetchJsonEffect(webhookUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(webhookData),
		}).pipe(Effect.catchAll(() => Effect.fail(new NotificationFailed({}))));

		yield* Effect.logInfo(`Webhook 發送成功 (${tag})`);
	});
}
