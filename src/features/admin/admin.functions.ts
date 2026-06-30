// admin.functions.ts

import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { desc, eq, ilike, or } from "drizzle-orm";
import { Effect, pipe } from "effect";
import { db } from "#/drizzle/db";
import { bot, notification, report, server, user } from "#/drizzle/schema";
import { auth } from "#/lib/auth";
import { adminMiddleware } from "#/lib/auth-middleware";
import {
  type ActionResult,
  effectInputValidator,
  fetchJsonEffect,
  fromDrizzle,
  runEffect,
  toResult,
} from "#/lib/effect-utils";
import { syncToCloudflareKV } from "#/lib/kv-sync";
import type { ReportStatus } from "#/types/admin";
import { sendDiscordWebhookFn } from "../webhook/webhook.functions";
import {
  BotIdSchema,
  QuerySchema,
  RejectBotSchema,
  ReviewBotSchema,
  ServerGuildIdSchema,
  UpdateReportSchema,
} from "./admin.schemas";
import { fetchAndUpdateServerCount } from "./admin.server";

export interface SendNotificationParams {
  subject: string;
  teaser?: string;
  content: string;
  priority?: "info" | "warning" | "error" | "success";
  userIds: string[];
  label?: string; // 新增可選參數，允許前端指定通知標籤
}

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

/**
 * 主函式：發送私訊通知
 */
export async function sendNotification({
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

export const updateBotServerCountBackgroundFn = createServerFn({
  method: "POST",
})
  .middleware([adminMiddleware])
  .inputValidator((data: { botId: string }) => data)
  .handler(async ({ data }) => {
    fetchAndUpdateServerCount(data.botId);
    return { success: true, message: "已在背景處理" };
  });

export const adminGetAllBotsFn = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .handler(() =>
    toResult(
      fromDrizzle(() =>
        db.query.bot.findMany({
          with: { developers: { with: { user: true } } },
          orderBy: [desc(bot.createdAt)],
        }),
      ),
    ),
  );

/** Fetch all servers */
export const adminGetAllServersFn = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .handler(() =>
    toResult(
      fromDrizzle(() =>
        db.query.server.findMany({
          with: { owner: true, admins: { with: { user: true } } },
          orderBy: [desc(server.createdAt)],
        }),
      ),
    ),
  );

/** Fetch all reports */
export const getReportsFn = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .handler(() =>
    toResult(
      fromDrizzle(() =>
        db.query.report.findMany({
          with: {
            reportedBy: true,
            handledBy: true,
          },
          orderBy: [desc(report.reportedAt)],
        }),
      ),
    ),
  );

/** Approve or reject a bot application */
export const reviewBotFn = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(effectInputValidator(ReviewBotSchema))
  .handler(async ({ data }) => {
    const result = await toResult(
      fromDrizzle(async () => {
        // 先執行更新動作
        await db
          .update(bot)
          .set({
            status: data.status,
            rejectionReason: data.rejectionReason ?? null,
            approvedAt: data.status === "approved" ? new Date().toISOString() : null,
          })
          .where(eq(bot.id, data.id));

        // 統一在這邊撈出最新狀態，並同時 join 開發者資訊
        return await db.query.bot.findFirst({
          where: eq(bot.id, data.id),
          with: {
            developers: {
              with: {
                user: true,
              },
            },
          },
        });
      }),
    );

    if (!result.success || !result.data) {
      throw new Error(`審核更新失敗: ${result.error || "找不到該機器人資料"}`);
    }

    const app = result.data;

    // 2. 如果是「核准」，在伺服器端背景觸發其他通知與任務 (Fire-and-forget)
    if (data.status === "approved") {
      const developersList = app.developers || [];
      const devIds = developersList.map((d) => d.b);

      // A. 發送私訊通知 (使用 external function)
      sendNotification({
        subject: "您的機器人申請已通過 ✅",
        teaser: `${app.name} 已通過審核`,
        content: `您好！機器人「${app.name}」已核准上架，感謝您的耐心等待。`,
        priority: "success",
        label: "機器人審核通知",
        userIds: devIds,
      }).catch((e) => console.error(`[Discord 私訊通知失敗] BotID: ${app.id}, Error:`, e));

      sendDiscordWebhookFn({
        data: {
          _tag: "approvedBot",
          bot: {
            id: app.id,
            name: app.name,
            prefix: app.prefix,
            description: app.description ?? "",
            inviteUrl: app.inviteUrl ?? "",
            tags: app.tags ?? [],
            icon: app.icon,
            banner: app.banner,
            developers: developersList.map((d) => ({
              id: d.b,
              username: d.user?.username || "未知",
            })),
          },
        },
      })
        .then((res) => {
          if (!res?.success) {
            console.warn(`[Webhook 處理失敗] BotID: ${app.id}, Reason:`, res?.error);
          }
        })
        .catch((e) => console.error(`[Webhook 發送異常] BotID: ${app.id}, Error:`, e));

      // C. 觸發背景更新伺服器數量任務
      fetchAndUpdateServerCount(app.id);
    }

    return { success: true };
  });

/** Delete a bot by id */
export const deleteBotFn = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(effectInputValidator(BotIdSchema))
  .handler(
    ({ data }): Promise<ActionResult> =>
      toResult(fromDrizzle(() => db.delete(bot).where(eq(bot.id, data.id)))),
  );

/** Delete a server by guild id */
export const deleteServerFn = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(effectInputValidator(ServerGuildIdSchema))
  .handler(
    ({ data }): Promise<ActionResult> =>
      toResult(fromDrizzle(() => db.delete(server).where(eq(server.id, data.guildId)))),
  );

/** Update a report */
export const updateReportFn = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(effectInputValidator(UpdateReportSchema))
  .handler(
    ({ data }): Promise<ActionResult> =>
      toResult(
        fromDrizzle(() =>
          db
            .update(report)
            .set({
              ...(data.status && {
                status: data.status,
                handledAt: data.status !== "pending" ? new Date().toISOString() : null,
              }),
              ...(data.severity && { severity: data.severity }),
            })
            .where(eq(report.id, data.reportId)),
        ),
      ),
  );

/** Fetch pending bots count + reports count — used for SSR badge hydration */
export const adminGetDashboardCountsFn = createServerFn({
  method: "GET",
})
  .middleware([adminMiddleware])
  .handler(
    async (): Promise<ActionResult<{ pendingBots: number; pendingReports: number }>> =>
      toResult(
        pipe(
          Effect.all({
            pendingBots: fromDrizzle(async () => {
              const rows = await db.query.bot.findMany({
                where: eq(bot.status, "pending"),
                columns: { id: true },
              });
              return rows.length;
            }),
            pendingReports: fromDrizzle(async () => {
              const rows = await db.query.report.findMany({
                where: eq(report.status, "pending"),
                columns: { id: true },
              });
              return rows.length;
            }),
          }),
        ),
      ),
  );

/**
 * 拒絕機器人申請 (Server Function)
 */
export const rejectBotServerFn = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(effectInputValidator(RejectBotSchema))
  .handler(async ({ data, context }) => {
    const { botId, reason } = data;
    const user = context.user;

    // 1. 驗證管理員權限
    if (!context.edgeContext.isAdmin || !user?.discordId) {
      throw new Error("未登入或無管理權限");
    }

    // 2. 執行資料庫 Transaction (使用純 async/await，更簡潔且自帶回滾機制)
    const transactionResult = await db
      .transaction(async (tx) => {
        // A. 獲取 Bot 與其關聯的開發者
        const botRecord = await tx.query.bot.findFirst({
          where: eq(bot.id, botId),
          with: { developers: { with: { user: true } } },
        });

        if (!botRecord) {
          // 拋出錯誤會自動觸發 Drizzle Transaction Rollback
          throw new Error("BotNotFound");
        }

        // B. 更新 Bot 狀態
        await tx
          .update(bot)
          .set({
            status: "rejected",
            rejectionReason: reason,
            handledAt: new Date().toISOString(),
            handledById: user.discordId,
          })
          .where(eq(bot.id, botId));

        // C. 寫入站內通知記錄
        const devIds = botRecord.developers.map((d) => d.user.discordId);
        if (devIds.length > 0) {
          const notifications = devIds.map((devId) => ({
            id: crypto.randomUUID(),
            name: "機器人申請狀態更新",
            userId: devId,
            subject: "機器人申請已被拒絕",
            teaser: `您的機器人 "${botRecord.name}" 申請已被拒絕。`,
            content: `拒絕原因：${reason}`,
            priority: "warning" as const,
          }));

          await tx.insert(notification).values(notifications);
        }

        return {
          botName: botRecord.name,
          developerIds: devIds,
        };
      })
      .catch((error) => {
        // 統一在此捕捉 Transaction 內拋出的錯誤
        if (error instanceof Error && error.message === "BotNotFound") {
          throw error;
        }
        console.error("Database Transaction Error:", error);
        throw new Error("DatabaseError");
      });

    // 3. 觸發外部通知 (Non-blocking)
    const { botName, developerIds } = transactionResult;

    sendNotification({
      label: "機器人審核通知",
      subject: `機器人申請已被拒絕： ${botName}`,
      teaser: `您的機器人 "${botName}" 申請已被拒絕。`,
      content: `拒絕原因：${reason}`,
      priority: "error",
      userIds: developerIds,
    }).catch((e) => console.error("Failed to send rejection DMs:", e));

    return { success: true };
  });

export const resolveReportServerFn = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(
    (data: { reportId: string; status: ReportStatus; resolutionNote: string }) => data,
  )
  .handler(async ({ data, context }) => {
    const { reportId, status, resolutionNote } = data;
    const handledById = context.user?.discordId;

    // 安全防護：確保管理者 ID 存在
    if (!handledById) {
      throw new Error("未授權的操作或讀取不到 Discord ID");
    }

    const [updated] = await db
      .update(report)
      .set({
        status,
        resolutionNote,
        handledById,
        handledAt: new Date().toISOString(),
      })
      .where(eq(report.id, reportId))
      .returning();

    // 核心修正：防止查無資料時，updated 為 undefined 導致程式崩潰
    if (!updated) {
      throw new Error("ReportNotFound");
    }

    return {
      ...updated,
      attachments: updated.attachments as string[],
    };
  });

// User Management Functions
export const getUsersFn = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .inputValidator(effectInputValidator(QuerySchema))
  .handler(async ({ data }) => {
    const { search, page, limit } = data;
    const offset = (page - 1) * limit;

    const program = Effect.tryPromise({
      try: async () => {
        // 2. 組合搜尋條件
        const searchCondition = search
          ? or(
              ilike(user.name, `%${search}%`),
              ilike(user.username, `%${search}%`),
              ilike(user.discordId, `%${search}%`),
            )
          : undefined;

        // 3. 執行 Drizzle 查詢 (撈取 limit + 1 筆來判斷是否有下一頁)
        const items = await db
          .select()
          .from(user)
          .where(searchCondition)
          .orderBy(desc(user.createdAt))
          .limit(limit + 1)
          .offset(offset);

        // 4. 計算下一頁的 Cursor
        let nextCursor: number | null = null;
        if (items.length > limit) {
          items.pop(); // 移除多查出來的那一筆，不傳給前端
          nextCursor = page + 1; // 設定下一頁的頁碼
        }

        return {
          users: items,
          nextCursor,
        };
      },
      catch: (error) => new Error(`獲取使用者失敗: ${error}`),
    });

    return await Effect.runPromise(program).catch((error) => {
      console.error("[Fetch Users Error]:", error);
      throw new Error(error.message);
    });
  });

// 定義前端傳入的參數型別
interface ToggleBanPayload {
  targetUserId: string;
  isBanned: boolean;
  reason?: string;
}

// 封鎖/解封使用者 (整合 Better Auth + KV + Effect)
export const toggleUserBanFn = createServerFn({ method: "POST" })
  .inputValidator((data: ToggleBanPayload) => data)
  .handler(async ({ data }) => {
    const request = getRequest();

    const cookieHeader = request.headers.get("cookie") ?? "";

    const filteredCookies = cookieHeader
      .split(";")
      .map((c) => c.trim())
      .filter((c) => {
        const value = c.split("=").slice(1).join("=").trim();
        const dotCount = (value.match(/\./g) ?? []).length;
        return dotCount < 2; // 過濾掉 JWT (含 2 個 ".")
      })
      .join("; ");

    const authHeaders = new Headers();
    if (filteredCookies) {
      authHeaders.set("cookie", filteredCookies);
    }
    if (request.headers.get("authorization")) {
      authHeaders.set("authorization", request.headers.get("authorization")!);
    }

    const toggleDbEffect = Effect.tryPromise({
      try: () => {
        const body = {
          userId: data.targetUserId,
          banReason: data.isBanned ? data.reason : undefined,
        };

        // 使用篩選過的 authHeaders
        return data.isBanned
          ? auth.api.banUser({ body, headers: authHeaders })
          : auth.api.unbanUser({
              body: { userId: data.targetUserId },
              headers: authHeaders,
            });
      },
      catch: (error) => new Error(`Better Auth 狀態更新失敗: ${error}`),
    });

    // 組合主邏輯
    const program = Effect.gen(function* () {
      // 步驟一：先更新 Better Auth 資料庫
      yield* toggleDbEffect;

      // 步驟二：同步到 Cloudflare KV
      yield* syncToCloudflareKV(data.targetUserId, data.isBanned);

      // 回傳成功結果
      return {
        success: true,
        message: data.isBanned ? "用戶已成功封鎖" : "用戶已成功解封",
      };
    });

    return await Effect.runPromise(program).catch((error) => {
      console.error("[Admin Ban Toggle Error]:", error);
      throw new Error(error.message);
    });
  });
