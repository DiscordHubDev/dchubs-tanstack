import { Effect } from "effect";
import { NotificationFailed } from "#/errors/bot-errors";
import type { SendNotificationInput } from "./notifications.schemas";
import { fetchJsonEffect, runEffect } from "#/lib/effect-utils";

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

/**
 * 步驟一：透過 User ID 獲取或建立 DM Channel ID
 */
async function getDmChannelId(userId: string): Promise<string> {
  try {
    // 直接取得 JSON 格式並轉型
    const data = (await runEffect(
      fetchJsonEffect("https://discord.com/api/v10/users/@me/channels", {
        method: "POST",
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ recipient_id: userId }),
      }),
    )) as { id: string };

    return data.id;
  } catch (error) {
    // 捕捉 fetchJsonEffect 拋出的錯誤並加上上下文
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`無法為用戶 ${userId} 建立私訊通道: ${errorMessage}`, { cause: error });
  }
}

interface SendNotificationParams {
  subject: string;
  teaser?: string;
  content: string;
  priority?: "info" | "warning" | "error" | "success";
  userIds: readonly string[];
  label?: string; // 新增可選參數，允許前端指定通知標籤
}

/**
 * 主函式：發送私訊通知
 */
async function sendNotification({
  subject,
  teaser,
  content,
  priority = "info",
  userIds = [],
  label, // 新增可選參數
}: SendNotificationParams) {
  if (!DISCORD_BOT_TOKEN) {
    throw new Error("Missing DISCORD_BOT_TOKEN environment variable");
  }

  if (userIds.length === 0) {
    return { success: true, message: "No users provided" };
  }

  // 定義各個層級的預設 Meta 資料
  const priorityMeta = {
    info: { color: 3447003, emoji: "ℹ️", defaultLabel: "系統資訊 (Info)" },
    warning: {
      color: 15105570,
      emoji: "⚠️",
      defaultLabel: "警告通知 (Warning)",
    },
    error: { color: 15158332, emoji: "🚨", defaultLabel: "錯誤警報 (Error)" },
    success: {
      color: 3066993,
      emoji: "✅",
      defaultLabel: "成功通知 (Success)",
    },
  };

  const meta = priorityMeta[priority] || priorityMeta.info;

  // 決定最終要顯示的 label：有傳入就用傳入的，沒有就用預設的
  const displayLabel = label || meta.defaultLabel;

  // 優化內文排版：使用引言區塊 (Blockquote) 來凸顯 teaser
  let formattedDescription = "";
  if (teaser) {
    formattedDescription += `> **${teaser}**\n\n`;
  }
  formattedDescription += content;

  const payload = {
    embeds: [
      {
        // Author 區塊，顯示自訂或預設標籤
        author: {
          name: displayLabel,
        },
        title: `${meta.emoji} ${subject}`,
        description: formattedDescription,
        color: meta.color,
        footer: {
          text: "系統通知 - Powered by DcHubs",
          icon_url: "https://dchubs.org/icon.png",
        },
        timestamp: new Date().toISOString(),
      },
    ],
  };

  const tasks = userIds.map(async (userId) => {
    const dmChannelId = await getDmChannelId(userId);

    try {
      await runEffect(
        fetchJsonEffect(`https://discord.com/api/v10/channels/${dmChannelId}/messages`, {
          method: "POST",
          headers: {
            Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }),
      );

      return userId;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`無法發送私訊給用戶 ${userId}: ${errorMessage}`, { cause: error });
    }
  });

  const results = await Promise.allSettled(tasks);

  const failures = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];

  if (failures.length > 0) {
    // biome-ignore lint/suspicious/useIterableCallbackReturn: 只需要 log 失敗
    failures.forEach((f) => console.error("Discord DM Error:", f.reason));
    if (failures.length === userIds.length) {
      throw new Error("All Discord DM notification requests failed.", {
        cause: new Error("Multiple failures occurred"),
      });
    }
  }

  return {
    success: true,
    totalSent: userIds.length - failures.length,
    failedCount: failures.length,
  };
}

export function resolveUserIdsEffect(
  userIds?: readonly string[] | null,
): Effect.Effect<readonly string[], NotificationFailed> {
  const validIds = (userIds || []).map((id) => id.trim()).filter((id) => id.length > 0);

  if (validIds.length > 0) {
    return Effect.succeed(validIds);
  }

  return Effect.fail(
    new NotificationFailed({ message: "無法解析 userIds，請提供有效的使用者 ID" }),
  );
}

// 2. 乾淨的 sendNotificationEffect
export function sendNotificationEffect(
  input: SendNotificationInput, // 這裡不用再做任何型別擴充了
): Effect.Effect<void, NotificationFailed> {
  return Effect.gen(function* () {
    // 智慧判斷：優先使用 userIds 陣列，如果沒有才拿 userId 包成陣列
    const idsToProcess = input.userIds ? input.userIds : input.userId ? [input.userId] : [];

    const validUserIds = yield* resolveUserIdsEffect(idsToProcess);

    const subject = input.subject.trim();
    const content = input.content.trim();
    const teaser = input.teaser?.trim() || content.slice(0, 140);
    const priority = input.priority ?? "info";
    const label = input.label?.trim();

    yield* Effect.tryPromise({
      try: () =>
        sendNotification({
          subject,
          content,
          teaser,
          priority,
          label,
          userIds: validUserIds, // 將整理好的陣列交給底層
        }),
      catch: () =>
        new NotificationFailed({
          message: "站內通知發送失敗，請檢查使用者 ID 是否正確或稍後再試",
        }),
    });
  });
}
