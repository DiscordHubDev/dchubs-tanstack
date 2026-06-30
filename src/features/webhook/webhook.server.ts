import { Effect } from "effect";
import { NotificationFailed } from "#/errors/bot-errors";
import { fetchJsonEffect, toErrorMessage } from "#/lib/effect-utils";
import type { CustomEmbedData } from "#/types/custom_embed";
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
  payload: WebhookPayload,
): Effect.Effect<void, NotificationFailed> {
  return Effect.gen(function* () {
    const tag = payload._tag;

    const webhookUrlMap: Record<string, string | undefined> = {
      vote: process.env.VOTE_WEBHOOK_URL,
      approvedBot: process.env.APPROVED_WEBHOOK_URL,
      pendingBot: process.env.PENDING_WEBHOOK_URL,
      server: process.env.SERVER_WEBHOOK_URL,
    };

    const webhookUrl = webhookUrlMap[tag];
    if (!webhookUrl) {
      yield* Effect.logWarning(`[Webhook 警告] URL 尚未設置 (事件類型: ${tag})`);
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
        webhookData.content = "<@&1361412309209317468> <@549056425943629825> <@857502876108193812>";
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
    }).pipe(
      Effect.catchAll((error) =>
        Effect.fail(
          new NotificationFailed({
            message: `Discord webhook 發送失敗 (${tag})：${toErrorMessage(error)}`,
          }),
        ),
      ),
    );

    yield* Effect.logInfo(`Webhook 發送成功 (${tag})`);
  });
}

export function triggerVoteNotificationEffect(
  url: string | null | undefined,
  secret: string | null | undefined,
  payload: {
    targetId: string;
    userId: string;
    user: {
      name: string;
      avatar: string | null | undefined;
    };
    type: "server" | "bot";
    timestamp: string;
    votes: number;
    targetName: string;
    voteUrl?: string;
    customEmbed?: CustomEmbedData | null;
  },
): Effect.Effect<void, never> {
  return Effect.gen(function* () {
    if (!url) return;

    const isDiscordWebhook = url.startsWith("https://discord.com/api/webhooks/");

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    let body: string;

    if (isDiscordWebhook) {
      const custom = payload.customEmbed;

      let embedColor = 0;
      if (custom?.color) {
        const cleanColor = custom.color.replace("#", "");
        const parsedColor = parseInt(cleanColor, 16);
        if (!Number.isNaN(parsedColor)) {
          embedColor = parsedColor;
        }
      } else {
        const randomValues = new Uint32Array(1);
        crypto.getRandomValues(randomValues);
        embedColor = randomValues[0] % 16777216;
      }

      const linkUrl = payload.voteUrl || "https://dchubs.org";

      // 如果有自訂 embed，就組裝自訂格式；否則使用預設模板
      if (custom) {
        body = JSON.stringify({
          username: custom.username || "DcHubs投票通知",
          avatar_url: custom.avatar_url || "https://dchubs.org/icon.png",
          content: custom.content || undefined, // Discord 的普通文字訊息層
          embeds: [
            {
              title: custom.title || undefined,
              url: custom.url || undefined,
              description: custom.description || undefined,
              color: embedColor,
              author: custom.authorName
                ? {
                    name: custom.authorName,
                    url: custom.authorUrl || undefined,
                    icon_url: custom.authorIconUrl || undefined,
                  }
                : undefined,
              thumbnail: custom.thumbnailUrl
                ? {
                    url: custom.thumbnailUrl,
                  }
                : undefined,
              image: custom.imageUrl
                ? {
                    url: custom.imageUrl,
                  }
                : undefined,
              footer: custom.footerText
                ? {
                    text: custom.footerText,
                    icon_url: custom.footerIconUrl || undefined,
                  }
                : undefined,
              fields: custom.fields && custom.fields.length > 0 ? custom.fields : undefined,
            },
          ],
        });
      } else {
        // 預設的 Discord Webhook Embed 格式
        body = JSON.stringify({
          username: "DcHubs投票通知",
          avatar_url: "https://dchubs.org/icon.png",
          embeds: [
            {
              author: {
                name: payload.user.name,
                icon_url: payload.user.avatar ?? "https://cdn.discordapp.com/embed/avatars/0.png",
              },
              title: `❤️ | 感謝投票！`,
              description: `感謝您的支持與投票！您的每一票都是讓 **${payload.targetName}** 變得更好的動力。\n\n請記得每 12 小時可以再回來 [DcHubs](${linkUrl}) 投票一次，讓更多人發現吧！✨`,
              color: embedColor,
              footer: {
                text: "Powered by DcHubs Vote System",
                icon_url: "https://dchubs.org/icon.png",
              },
            },
          ],
        });
      }
    } else {
      if (secret) {
        headers.Authorization = secret;
      }
      body = JSON.stringify({
        ...payload,
        timestamp: new Date().toISOString(),
      });
    }

    yield* Effect.tryPromise({
      try: () =>
        fetch(url, {
          method: "POST",
          headers: headers,
          body: body,
        }),
      catch: () => new Error("Webhook failed"),
    }).pipe(Effect.ignore);
  });
}
