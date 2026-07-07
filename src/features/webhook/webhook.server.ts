import { Effect } from "effect";
import { NotificationFailed } from "#/errors/bot-errors";
import { fetchJsonEffect, toErrorMessage } from "#/lib/effect-utils";
import type { CustomEmbedData } from "#/types/custom_embed";
import type { WebhookPayload } from "./webhook.type";

const DISCORD_AVATAR =
  "https://cdn.discordapp.com/icons/1297055626014490695/365d960f0a44f9a0c2de4672b0bcdcc0.webp?size=512&format=webp";

const DEFAULT_FOOTER = {
  text: "DiscordHubs 系統通知",
  icon_url: DISCORD_AVATAR,
};

// 統一色票，讓不同事件類型有一致但可辨識的視覺語言
const COLORS = {
  vote: 0x57f287, // 綠色：正向互動
  bot: 0x5865f2, // Discord Blurple：機器人相關
  pending: 0xfee75c, // 黃色：等待審核
  server: 0xeb459e, // 粉色：伺服器發佈
  report: 0xed4245, // 紅色：警示 / 回報
} as const;

interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

interface DiscordEmbedAuthor {
  name: string;
  url?: string;
  icon_url?: string;
}

interface DiscordEmbed {
  title?: string;
  url?: string;
  description?: string;
  color?: number;
  author?: DiscordEmbedAuthor;
  fields?: DiscordEmbedField[];
  footer?: { text: string; icon_url?: string };
  thumbnail?: { url: string };
  image?: { url: string };
  timestamp?: string;
}

interface DiscordWebhookPayload {
  username: string;
  avatar_url: string;
  content?: string;
  embeds?: DiscordEmbed[];
}

const joinLines = (...lines: string[]) => lines.join("\n");

// 統一的「連結」欄位格式，避免每個 case 重複拼字串
const linkField = (label: string, url: string) => `[點擊前往](${url})`;

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
      report: process.env.REPORT_WEBHOOK_URL,
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
    const now = new Date().toISOString();

    switch (tag) {
      case "vote": {
        const voteItem = payload.type === "server" ? "伺服器" : "機器人";
        webhookData.username = "DcHubs投票通知";
        webhookData.embeds = [
          {
            author: {
              name: payload.user.username || "未知用戶",
              icon_url: DISCORD_AVATAR,
            },
            title: `🗳️ 收到新的投票`,
            description: `感謝 **${payload.user.username || "未知用戶"}** 對 **${voteItem}** 投下了寶貴的一票！`,
            color: COLORS.vote,
            fields: [
              { name: "👤 用戶 ID", value: `\`${payload.user.id}\``, inline: true },
              { name: "🎯 投票對象", value: `**${payload.target.name}**`, inline: true },
              { name: "🆔 對象 ID", value: `\`${payload.target.id}\``, inline: true },
            ],
            footer: DEFAULT_FOOTER,
            timestamp: now,
          },
        ];
        break;
      }

      case "approvedBot": {
        const developerNames = payload.bot.developers
          .map((dev: any) => `> <@${dev.id ?? ""}> \`${dev.username || "未知"}\``)
          .join("\n");

        webhookData.username = "DcHubs機器人通知";
        webhookData.content = "<@&1355617017549426919>";
        webhookData.embeds = [
          {
            title: `✅ 新機器人已上架！`,
            url: `https://dchubs.org/bots/${payload.bot.id || ""}`,
            description: joinLines(`## ${payload.bot.name}`, `*${payload.bot.description}*`),
            color: COLORS.bot,
            thumbnail: { url: payload.bot.icon || "" },
            image: { url: payload.bot.banner || "" },
            fields: [
              { name: "⚙️ 前綴", value: `\`${payload.bot.prefix}\``, inline: true },
              {
                name: "🏷️ 類別",
                value: payload.bot.tags.map((t: string) => `\`${t}\``).join(" "),
                inline: true,
              },
              { name: "\u200b", value: "\u200b", inline: true }, // 對齊用空白欄位
              { name: "👨‍💻 開發者", value: developerNames || "> 未知", inline: false },
              {
                name: "🔗 邀請連結",
                value: linkField("邀請", payload.bot.inviteUrl),
                inline: true,
              },
              {
                name: "🌐 網站頁面",
                value: linkField("網站", `https://dchubs.org/bots/${payload.bot.id || ""}`),
                inline: true,
              },
            ],
            footer: DEFAULT_FOOTER,
            timestamp: now,
          },
        ];
        break;
      }

      case "pendingBot": {
        webhookData.username = "DcHubs機器人通知";
        webhookData.content = "<@&1361412309209317468> <@549056425943629825> <@857502876108193812>";
        webhookData.embeds = [
          {
            title: `🕓 新機器人送審通知`,
            description: joinLines(
              `## ${payload.data.botName}`,
              `*${payload.data.botDescription}*`,
              ``,
              `> 請管理員盡快進行審核 🙏`,
            ),
            color: COLORS.pending,
            thumbnail: { url: payload.avatarUrl || "" },
            fields: [
              { name: "⚙️ 前綴", value: `\`${payload.data.botPrefix}\``, inline: true },
              {
                name: "🏷️ 類別",
                value: payload.data.tags.map((t: string) => `\`${t}\``).join(" "),
                inline: true,
              },
            ],
            footer: DEFAULT_FOOTER,
            timestamp: now,
          },
        ];
        break;
      }

      case "server": {
        webhookData.username = "DcHubs伺服器通知";
        webhookData.content = "<@&1355617333967585491>";
        webhookData.embeds = [
          {
            title: `🚀 新伺服器已發佈！`,
            url: `https://dchubs.org/servers/${payload.activeServer.id || ""}`,
            description: joinLines(
              `## ${payload.data.serverName}`,
              `*${payload.data.shortDescription}*`,
            ),
            color: COLORS.server,
            thumbnail: { url: payload.activeServer.icon || "" },
            image: { url: payload.activeServer.banner || "" },
            fields: [
              {
                name: "🏷️ 類別",
                value: payload.data.tags.map((t: string) => `\`${t}\``).join(" "),
                inline: false,
              },
              {
                name: "🔗 邀請連結",
                value: linkField("邀請", payload.data.inviteLink),
                inline: true,
              },
              {
                name: "🌐 網站頁面",
                value: linkField(
                  "網站",
                  `https://dchubs.org/servers/${payload.activeServer.id || ""}`,
                ),
                inline: true,
              },
            ],
            footer: DEFAULT_FOOTER,
            timestamp: now,
          },
        ];
        break;
      }

      case "report": {
        webhookData.username = "DcHubs回報通知";
        webhookData.embeds = [
          {
            title: `🚨 收到新的用戶回報`,
            description: `> 請管理團隊留意並儘速處理此回報。`,
            color: COLORS.report,
            fields: [
              {
                name: "📢 舉報者",
                value: `**${payload.data.reportBy?.name || payload.data.reportBy?.username || "未知"}**\n\`@${payload.data.reportBy?.username || "未知"}\``,
                inline: true,
              },
              {
                name: "🎯 被舉報目標",
                value: `**${payload.data.itemName || "未知"}**\n\`${payload.data.itemId || "未知"}\``,
                inline: true,
              },
              {
                name: "📁 目標類型",
                value: `\`${payload.data.targetType || "未知"}\``,
                inline: true,
              },
              {
                name: "📝 回報原因",
                value: `\`\`\`${payload.data.reasons?.join(", ") || "未提供原因"}\`\`\``,
                inline: false,
              },
              ...(payload.data.attachments?.length
                ? [
                    {
                      name: "📎 相關附件",
                      value: linkField("附件", payload.data.attachments?.[0]),
                      inline: false,
                    },
                  ]
                : []),
            ],
            footer: DEFAULT_FOOTER,
            timestamp: now,
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
          content: custom.content || undefined,
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
              timestamp: new Date().toISOString(),
            },
          ],
        });
      } else {
        // 預設的 Discord Webhook Embed 格式（加入 fields 讓排版更清晰）
        body = JSON.stringify({
          username: "DcHubs投票通知",
          avatar_url: "https://dchubs.org/icon.png",
          embeds: [
            {
              author: {
                name: payload.user.name,
                icon_url: payload.user.avatar ?? "https://cdn.discordapp.com/embed/avatars/0.png",
              },
              title: `❤️ 感謝您的投票！`,
              description: `感謝您對 **${payload.targetName}** 的支持！\n每一票都是讓它變得更好的動力 ✨`,
              color: embedColor,
              fields: [
                {
                  name: "⏰ 下次可再投票時間",
                  value: "12 小時後",
                  inline: true,
                },
                {
                  name: "🔗 前往投票",
                  value: `[點我投票](${linkUrl})`,
                  inline: true,
                },
              ],
              footer: {
                text: "Powered by DcHubs Vote System",
                icon_url: "https://dchubs.org/icon.png",
              },
              timestamp: new Date().toISOString(),
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
