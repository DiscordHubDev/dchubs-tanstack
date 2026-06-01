import { createServerFn } from "@tanstack/react-start";
import {
	effectInputValidator,
	fetchJsonEffect,
	runEffect,
} from "#/lib/effect-utils";
import { WebhookPayloadSchema } from "./webhook.schema";

const DISCORD_AVATAR =
	"https://cdn.discordapp.com/icons/1297055626014490695/365d960f0a44f9a0c2de4672b0bcdcc0.webp?size=512&format=webp";

const DEFAULT_FOOTER = {
	text: "由 DiscordHubs 系統發送",
	icon_url: DISCORD_AVATAR,
};

export const sendDiscordWebhook = createServerFn({ method: "POST" })
	// 使用 Effect Schema 進行輸入驗證
	.inputValidator((data: unknown) =>
		effectInputValidator(WebhookPayloadSchema)(data),
	)
	.handler(async ({ data: payload }) => {
		let webhookUrl = "";
		const webhookData: any = {
			username: "DcHubs通知",
			avatar_url: DISCORD_AVATAR,
		};

		// 根據 _tag 決定 Webhook 內容與目標 URL
		switch (payload._tag) {
			case "vote": {
				webhookUrl = process.env.VOTE_WEBHOOK_URL || "";
				webhookData.username = "DcHubs投票通知";
				const voteItem = payload.type === "server" ? "伺服器" : "機器人";
				webhookData.embeds = [
					{
						title: `<:pixel_symbol_exclamation_invert:1361299311131885600> | 投票系統`,
						description: `➤用戶：**${payload.user.username || "未知"}**\n➤用戶ID：**${payload.user.id}**\n> ➤對**${voteItem}**：**${payload.target.name}** 進行了投票\n> ➤${voteItem}ID：**${payload.target.id}**`,
						color: 0x4285f4,
					},
				];
				break;
			}

			case "approvedBot": {
				webhookUrl = process.env.APPROVED_WEBHOOK_URL || "";
				webhookData.username = "DcHubs機器人通知";
				webhookData.content = "<@&1355617017549426919>";
				const developerNames = payload.bot.developers
					.map((dev) => dev.username || "未知")
					.join("\n");

				webhookData.embeds = [
					{
						title: `<:pixel_symbol_exclamation_invert:1361299311131885600> | 新機器人發佈通知！`,
						description: `➤機器人名稱：**${payload.bot.name}**\n➤機器人前綴：**${payload.bot.prefix}**\n➤簡短描述：\`\`\`${payload.bot.description}\`\`\`\n➤開發者：\`\`\`${developerNames}\`\`\`\n➤邀請鏈結：\n> ${payload.bot.inviteUrl}\n➤網站連結：\n> https://dchubs.org/bots/${payload.bot.id || "無"}\n➤類別：\`\`\`${payload.bot.tags.join("\n")}\`\`\``,
						color: 0x4285f4,
						footer: DEFAULT_FOOTER,
						thumbnail: { url: payload.bot.icon || "" },
						image: { url: payload.bot.banner || "" },
					},
				];
				break;
			}

			case "pendingBot": {
				webhookUrl = process.env.PENDING_WEBHOOK_URL || "";
				webhookData.username = "DcHubs機器人通知";
				webhookData.content =
					"<@&1361412309209317468> <@549056425943629825> <@857502876108193812>";
				webhookData.embeds = [
					{
						title: `<:pixel_symbol_exclamation_invert:1361299311131885600> | 新審核機器人！`,
						description: `➤機器人名稱：**${payload.data.botName}**\n➤機器人前綴：**${payload.data.botPrefix}**\n➤簡短描述：\`\`\`${payload.data.botDescription}\`\`\`\n➤類別：\`\`\`${payload.data.tags.join("\n")}\`\`\``,
						color: 0x4285f4,
						footer: DEFAULT_FOOTER,
						thumbnail: { url: payload.avatarUrl || "" },
					},
				];
				break;
			}

			case "server": {
				webhookUrl = process.env.SERVER_WEBHOOK_URL || "";
				webhookData.username = "DcHubs伺服器通知";
				webhookData.content = "<@&1355617333967585491>";
				webhookData.embeds = [
					{
						title: `<:pixel_symbol_exclamation_invert:1361299311131885600> | 新發佈的伺服器！`,
						description: `➤伺服器名稱：**${payload.data.serverName}**\n➤簡短描述：\n\`\`\`${payload.data.shortDescription}\`\`\`\n➤邀請連結：\n> **${payload.data.inviteLink}**\n➤網站連結：\n> **https://dchubs.org/servers/${payload.activeServer.id || "無"}**\n➤類別：\n\`\`\`${payload.data.tags.join("\n")}\`\`\``,
						color: 0x4285f4,
						thumbnail: { url: payload.activeServer.icon || "" },
						image: { url: payload.activeServer.banner || "" },
						footer: DEFAULT_FOOTER,
					},
				];
				break;
			}
		}

		if (!webhookUrl) {
			console.error(`Webhook URL 尚未設置 (事件類型: ${payload._tag})`);
			return { success: false, error: "Webhook URL not configured" };
		}

		try {
			// 使用 runEffect 執行，若發生非 2xx 狀態碼會自動拋出錯誤進入 catch
			await runEffect(
				fetchJsonEffect(webhookUrl, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(webhookData),
				}),
			);

			console.log(`Webhook 發送成功 (${payload._tag})`);
			return { success: true };
		} catch (error) {
			console.error(`發送 Webhook 時出錯 (${payload._tag}):`, error);
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			return {
				success: false,
				error: `Webhook 發送失敗: ${errorMessage}`,
			};
		}
	});
