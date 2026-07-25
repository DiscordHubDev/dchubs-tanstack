import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { db } from "#/drizzle/db";
import { authAccount, server } from "#/drizzle/schema";
import { type DomainUser, getSessionUserIdEffect } from "#/lib/edge-context";
import { runEffect, tryEffectPromise } from "#/lib/effect-utils";
import { formatCustomEmbedData } from "#/utils/embed";
import { sendDiscordWebhookEffect } from "../webhook/webhook.server";
import { fetchDiscordGuilds } from "./add-server.api";
import type { DiscordGuild } from "./add-server.types";
import type {
  ServerBannerUploadInput,
  ServerBannerUploadResult,
  ServerPublishBundle,
  ServerPublishResult,
  ServerPublishSubmitInput,
} from "./server-publish.types";
import {
  getCloudinaryCredentialsEffect,
  getCloudinaryErrorDetails,
  getExistingCloudinaryResource,
  uploadImageToCloudinary,
} from "#/lib/cloudinary";

const GUILD_ADMINISTRATOR_PERMISSION = 1n << 3n;

function getDiscordAccessTokenEffect(userId: string): Effect.Effect<string, Error> {
  return Effect.gen(function* () {
    // 優化：改用底層 Select builder 提升效能
    const rows = yield* tryEffectPromise("Failed to load Discord account token", () =>
      db
        .select({ accessToken: authAccount.accessToken })
        .from(authAccount)
        .where(and(eq(authAccount.accountId, userId), eq(authAccount.providerId, "discord")))
        .limit(1),
    );

    const account = rows[0];
    if (!account?.accessToken) {
      return yield* Effect.fail(new Error("Discord access token 不存在，請重新登入"));
    }

    return account.accessToken;
  });
}

function getBotTokenEffect(): Effect.Effect<string, Error> {
  return Effect.gen(function* () {
    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (!botToken) {
      return yield* Effect.fail(new Error("Missing DISCORD_BOT_TOKEN environment variable."));
    }
    return botToken;
  });
}

function hasGuildManagePermission(guild: DiscordGuild): boolean {
  if (guild.owner) {
    return true;
  }

  try {
    const permissions = BigInt(guild.permissions || "0");
    return (permissions & GUILD_ADMINISTRATOR_PERMISSION) !== 0n;
  } catch {
    return false;
  }
}

function normalizeList(values: readonly string[] | string[] | null | undefined): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index);
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function buildGuildIconUrl(guild: DiscordGuild): string | null {
  if (!guild.icon) {
    return null;
  }
  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=256`;
}

function getServerBannerPublicId(serverId: string): string {
  return `servers/${serverId}/banner`;
}

function getExistingBannerFingerprint(resource: unknown): string | null {
  const candidate = (
    resource as {
      context?: { custom?: { fingerprint?: unknown } };
    }
  )?.context?.custom?.fingerprint;

  if (typeof candidate !== "string") return null;
  const normalized = candidate.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function getExistingBannerUrl(resource: unknown): string | null {
  const secureUrl = (resource as { secure_url?: unknown })?.secure_url;
  if (typeof secureUrl !== "string") return null;
  const normalized = secureUrl.trim();
  return normalized.length > 0 ? normalized : null;
}

function isCloudinaryNotFoundError(error: unknown): boolean {
  const details = getCloudinaryErrorDetails(error);
  if (details.httpCode === 404) return true;
  return details.message.toLowerCase().includes("not found");
}

function getAccessibleGuildEffect(
  serverId: string,
  user: DomainUser | null,
): Effect.Effect<{ userId: string; guild: DiscordGuild }, Error> {
  return Effect.gen(function* () {
    const userId = yield* getSessionUserIdEffect(user);
    const userAccessToken = yield* getDiscordAccessTokenEffect(userId);
    const botToken = yield* getBotTokenEffect();

    // 🚀 平行發送 Discord API 請求
    const [userGuilds, isBotInGuild] = yield* Effect.all(
      [
        tryEffectPromise("Failed to fetch user guilds", () =>
          fetchDiscordGuilds({
            token: userAccessToken,
            tokenType: "Bearer",
          }),
        ),
        checkBotInGuildEffect(serverId, botToken),
      ],
      { concurrency: "unbounded" },
    );

    const guild = userGuilds.find((item) => item.id === serverId);
    if (!guild) {
      return yield* Effect.fail(new Error("你在 Discord 中沒有找到這個伺服器"));
    }

    // 🚀 在這裡直接做嚴格的 Admin 權限判斷
    let hasStrictAdmin = false;
    if (guild.owner === true) {
      hasStrictAdmin = true;
    } else {
      try {
        const permissions = BigInt(guild.permissions || "0");
        hasStrictAdmin =
          (permissions & GUILD_ADMINISTRATOR_PERMISSION) === GUILD_ADMINISTRATOR_PERMISSION;
      } catch {
        hasStrictAdmin = false;
      }
    }

    if (!hasStrictAdmin) {
      return yield* Effect.fail(
        new Error("你需要該伺服器的管理員 (Administrator) 權限才能發布 / 編輯。"),
      );
    }

    if (!isBotInGuild) {
      return yield* Effect.fail(new Error("機器人尚未加入該伺服器。"));
    }

    return { userId, guild };
  });
}
function checkBotInGuildEffect(serverId: string, botToken: string) {
  return Effect.tryPromise({
    try: async () => {
      // 🚀 優化：加入 with_counts=false 減少不必要的 payload 傳輸
      const res = await fetch(`https://discord.com/api/v10/guilds/${serverId}?with_counts=false`, {
        method: "GET",
        headers: { Authorization: `Bot ${botToken}` },
      });
      return res.ok;
    },
    catch: () => new Error("無法驗證機器人狀態"),
  });
}

export async function enforceServerOwner(serverId: string, userId: string) {
  const isOwner = await checkIsServerOwner(serverId, userId);
  if (!isOwner) {
    throw new Error("Forbidden: You are not the owner of this server");
  }
}

export function getServerPublishBundleEffect(
  serverId: string,
  user: DomainUser | null,
): Effect.Effect<ServerPublishBundle, Error> {
  return Effect.gen(function* () {
    // 🚀 平行執行：Discord 權限驗證 與 資料庫查詢
    const [accessResult, rows] = yield* Effect.all(
      [
        getAccessibleGuildEffect(serverId, user),
        tryEffectPromise("Failed to fetch published server", () =>
          db
            .select({
              id: server.id,
              name: server.name,
              description: server.description,
              longDescription: server.longDescription,
              inviteUrl: server.inviteUrl,
              website: server.website,
              tags: server.tags,
              rules: server.rules,
              secret: server.secret,
              voteNotificationUrl: server.voteNotificationUrl,
              icon: server.icon,
              banner: server.banner,
              nsfw: server.nsfw,
              customEmbed: server.customEmbed,
            })
            .from(server)
            .where(eq(server.id, serverId))
            .limit(1),
        ),
      ],
      { concurrency: "unbounded" },
    );

    const { guild } = accessResult;
    const current = rows[0];
    const guildIconUrl = buildGuildIconUrl(guild);

    const dbCustomEmbed: unknown = current?.customEmbed;
    let parsedEmbed: any;

    // 2. 執行期安全檢查：如果是字串，就解析它；如果是物件，就直接用
    if (typeof dbCustomEmbed === "string" && dbCustomEmbed.trim() !== "") {
      try {
        parsedEmbed = JSON.parse(dbCustomEmbed);
      } catch {
        parsedEmbed = undefined;
      }
    } else if (dbCustomEmbed && typeof dbCustomEmbed === "object") {
      parsedEmbed = dbCustomEmbed;
    }

    // 🌟 2. 轉換為乾淨的物件
    // 去掉原本的 ?? ""，讓它保持為 CustomEmbedData | undefined，完美切合目標型態
    const formattedCustomEmbed = formatCustomEmbedData(parsedEmbed);

    return {
      serverId,
      isPublished: Boolean(current),
      iconUrl: current?.icon ?? guildIconUrl,
      bannerUrl: current?.banner ?? null,
      formValues: {
        serverName: guild.name,
        shortDescription: current?.description ?? "",
        longDescription: current?.longDescription ?? "",
        inviteLink: current?.inviteUrl ?? "",
        websiteLink: current?.website ?? "",
        rules: normalizeList(current?.rules),
        tags: normalizeList(current?.tags),
        secret: current?.secret ?? "",
        webhook_url: current?.voteNotificationUrl ?? "",
        nsfw: current?.nsfw ?? false,
        customEmbed: formattedCustomEmbed,
      },
    };
  });
}

function upsertServerPublishEffect(
  input: ServerPublishSubmitInput,
  user: DomainUser | null,
): Effect.Effect<ServerPublishResult, Error> {
  return Effect.gen(function* () {
    const { userId, guild } = yield* getAccessibleGuildEffect(input.serverId, user);

    const shortDescription = input.form.shortDescription.trim();
    const longDescription = input.form.longDescription.trim();
    const inviteLink = input.form.inviteLink.trim();

    if (!shortDescription || !longDescription || !inviteLink) {
      return yield* Effect.fail(new Error("描述、完整介紹與邀請連結不可為空白"));
    }

    const tags = normalizeList(input.form.tags);
    const rules = normalizeList(input.form.rules);
    const website = normalizeOptionalString(input.form.websiteLink);
    const secret = normalizeOptionalString(input.form.secret);
    const webhookUrl = normalizeOptionalString(input.form.webhook_url);
    const iconUrl = normalizeOptionalString(input.iconUrl) ?? buildGuildIconUrl(guild);
    const bannerUrl = normalizeOptionalString(input.bannerUrl);

    const existingServerRows = yield* tryEffectPromise("Check existing server", () =>
      db.select({ id: server.id }).from(server).where(eq(server.id, input.serverId)).limit(1),
    );

    const isCreateMode = existingServerRows.length === 0;

    yield* tryEffectPromise("Failed to upsert server publish data", () =>
      db
        .insert(server)
        .values({
          id: input.serverId,
          name: guild.name,
          description: shortDescription,
          longDescription,
          inviteUrl: inviteLink,
          website,
          rules,
          tags,
          secret,
          voteNotificationUrl: webhookUrl,
          icon: iconUrl,
          banner: bannerUrl,
          ownerId: userId,
          members: guild.approximateMemberCount ?? 0,
          online: guild.approximatePresenceCount ?? 0,
          upvotes: 0,
          features: [],
          screenshots: [],
          nsfw: input.form.nsfw,
          customEmbed: formatCustomEmbedData(input.form.customEmbed),
        })
        .onConflictDoUpdate({
          target: server.id,
          set: {
            name: guild.name,
            description: shortDescription,
            longDescription,
            inviteUrl: inviteLink,
            website,
            rules,
            tags,
            secret,
            voteNotificationUrl: webhookUrl,
            icon: iconUrl,
            members: guild.approximateMemberCount ?? 0,
            online: guild.approximatePresenceCount ?? 0,
            banner: bannerUrl,
            nsfw: input.form.nsfw,
            customEmbed: formatCustomEmbedData(input.form.customEmbed),
          },
        }),
    );

    if (isCreateMode) {
      yield* sendDiscordWebhookEffect({
        _tag: "server",
        activeServer: {
          id: input.serverId,
          icon: iconUrl,
          banner: bannerUrl,
        },
        data: {
          serverName: guild.name,
          shortDescription: shortDescription,
          inviteLink: inviteLink,
          tags: tags,
        },
      });
    }

    return {
      success: true,
      message: "伺服器已成功發布 / 更新",
      serverId: input.serverId,
    };
  });
}

function uploadServerBannerEffect(
  input: ServerBannerUploadInput,
  user: DomainUser | null,
): Effect.Effect<ServerBannerUploadResult, Error> {
  return Effect.gen(function* () {
    yield* getAccessibleGuildEffect(input.serverId, user);

    const credentials = yield* getCloudinaryCredentialsEffect();
    const publicId = getServerBannerPublicId(input.serverId);
    const normalizedFingerprint = input.fingerprint.toLowerCase();

    // === 檢查現有 Banner（保留你原本的檢查邏輯）===
    const existingResource = yield* getExistingCloudinaryResource(publicId, credentials).pipe(
      Effect.catchAll((e) => {
        if (isCloudinaryNotFoundError(e)) return Effect.succeed(null);
        return Effect.fail(e);
      }),
    );

    const existingFingerprint = getExistingBannerFingerprint(existingResource);
    const existingBannerUrl = getExistingBannerUrl(existingResource);

    if (existingFingerprint === normalizedFingerprint && typeof existingBannerUrl === "string") {
      return {
        bannerUrl: existingBannerUrl,
        fingerprint: normalizedFingerprint,
        skipped: true,
        message: "選擇的圖片與目前 Banner 相同，已略過上傳",
      };
    }

    // === 上傳新圖 ===
    const uploadResult = yield* uploadImageToCloudinary(input.dataUrl, credentials, {
      public_id: publicId,
      overwrite: true,
      invalidate: true,
      unique_filename: false,
      context: {
        fingerprint: normalizedFingerprint,
        server_id: input.serverId,
        file_name: input.fileName,
      },
      // 有 uploadPreset 也可以傳，但有 apiSecret 時會優先走 Signed
      ...(credentials.uploadPreset && { upload_preset: credentials.uploadPreset }),
    });
    if (!uploadResult.secure_url) {
      return yield* Effect.fail(new Error("Cloudinary 未回傳有效的 Banner URL"));
    }

    return {
      bannerUrl: uploadResult.secure_url,
      fingerprint: normalizedFingerprint,
      skipped: false,
      message: "Banner 圖片上傳成功，已覆蓋更新",
    };
  });
}

const checkIsOwnerFromApiEffect = (serverId: string, userId: string) =>
  Effect.gen(function* () {
    yield* Effect.logInfo("➡️ 資料庫查無資料，改用 API 線上比對中...");

    const userAccessToken = yield* getDiscordAccessTokenEffect(userId);
    const guilds = yield* Effect.tryPromise({
      try: () =>
        fetchDiscordGuilds({
          token: userAccessToken,
          tokenType: "Bearer",
        }),
      catch: (error) => new Error(`API 獲取伺服器列表失敗: ${error}`),
    });

    const guild = guilds.find((g) => g.id === serverId);
    return guild ? hasGuildManagePermission(guild) : false;
  });

const checkIsServerOwnerEffect = (serverId: string, userId: string) =>
  Effect.gen(function* () {
    const rows = yield* Effect.tryPromise({
      try: () =>
        db.select({ ownerId: server.ownerId }).from(server).where(eq(server.id, serverId)).limit(1),
      catch: (error) => new Error(`資料庫查詢失敗: ${error}`),
    });

    if (rows.length > 0) {
      return rows[0].ownerId === userId;
    }

    return yield* checkIsOwnerFromApiEffect(serverId, userId);
  }).pipe(
    Effect.catchAll((error) =>
      Effect.sync(() => {
        console.error("檢查權限時發生非預期錯誤:", error);
        return false;
      }),
    ),
  );

export function getServerPublishBundleById(
  serverId: string,
  user: DomainUser | null,
): Promise<ServerPublishBundle> {
  return runEffect(getServerPublishBundleEffect(serverId, user));
}

export function upsertServerPublish(
  input: ServerPublishSubmitInput,
  user: DomainUser | null,
): Promise<ServerPublishResult> {
  return runEffect(upsertServerPublishEffect(input, user));
}

export function uploadServerBanner(
  input: ServerBannerUploadInput,
  user: DomainUser | null,
): Promise<ServerBannerUploadResult> {
  return runEffect(uploadServerBannerEffect(input, user));
}

export function checkIsServerOwner(serverId: string, userId: string): Promise<boolean> {
  return runEffect(checkIsServerOwnerEffect(serverId, userId));
}
