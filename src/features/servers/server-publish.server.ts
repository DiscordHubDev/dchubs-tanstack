import { v2 as cloudinary } from "cloudinary";
import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { db } from "#/drizzle/db";
import { authAccount, server, serverAdmins } from "#/drizzle/schema";
import { getSessionUserIdEffect } from "#/lib/edge-context";
import { runEffect, tryEffectPromise } from "#/lib/effect-utils";
import { fetchDiscordGuilds } from "./add-server.api";
import type { DiscordGuild } from "./add-server.types";
import type {
	ServerBannerUploadInput,
	ServerBannerUploadResult,
	ServerPublishBundle,
	ServerPublishResult,
	ServerPublishSubmitInput,
} from "./server-publish.types";

const GUILD_ADMINISTRATOR_PERMISSION = 1n << 3n;
const GUILD_MANAGE_PERMISSION = 1n << 5n;

function getDiscordAccessTokenEffect(
	userId: string,
): Effect.Effect<string, Error> {
	return Effect.gen(function* () {
		// 優化：改用底層 Select builder 提升效能
		const rows = yield* tryEffectPromise(
			"Failed to load Discord account token",
			() =>
				db
					.select({ accessToken: authAccount.accessToken })
					.from(authAccount)
					.where(
						and(
							eq(authAccount.accountId, userId),
							eq(authAccount.providerId, "discord"),
						),
					)
					.limit(1),
		);

		const account = rows[0];
		if (!account?.accessToken) {
			return yield* Effect.fail(
				new Error("Discord access token 不存在，請重新登入"),
			);
		}

		return account.accessToken;
	});
}

function getBotTokenEffect(): Effect.Effect<string, Error> {
	return Effect.gen(function* () {
		const botToken = process.env.DISCORD_BOT_TOKEN;
		if (!botToken) {
			return yield* Effect.fail(
				new Error("Missing DISCORD_BOT_TOKEN environment variable."),
			);
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
		return (
			(permissions & GUILD_ADMINISTRATOR_PERMISSION) !== 0n ||
			(permissions & GUILD_MANAGE_PERMISSION) !== 0n
		);
	} catch {
		return false;
	}
}

function normalizeList(
	values: readonly string[] | string[] | null | undefined,
): string[] {
	if (!Array.isArray(values)) {
		return [];
	}
	return values
		.map((value) => value.trim())
		.filter(Boolean)
		.filter((value, index, list) => list.indexOf(value) === index);
}

function normalizeOptionalString(
	value: string | null | undefined,
): string | null {
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

function getCloudinaryCredentialsEffect(): Effect.Effect<
	{
		cloudName: string;
		apiKey: string;
		apiSecret: string;
		uploadPreset: string | null;
	},
	Error
> {
	return Effect.gen(function* () {
		const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
		const apiKey = process.env.CLOUDINARY_API_KEY;
		const apiSecret = process.env.CLOUDINARY_API_SECRET;
		const uploadPreset = normalizeOptionalString(
			process.env.CLOUDINARY_UPLOAD_PRESET ?? process.env.UPLOAD_PRESET,
		);

		if (!cloudName || !apiKey || !apiSecret) {
			return yield* Effect.fail(
				new Error(
					"Cloudinary 環境變數未設定完整，請確認 CLOUDINARY_CLOUD_NAME、CLOUDINARY_API_KEY、CLOUDINARY_API_SECRET",
				),
			);
		}

		return { cloudName, apiKey, apiSecret, uploadPreset };
	});
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

function getCloudinaryErrorDetails(error: unknown): {
	httpCode: number | null;
	message: string;
} {
	const topLevel = error as {
		http_code?: unknown;
		message?: unknown;
		error?: { http_code?: unknown; message?: unknown };
	};

	const nestedError = topLevel?.error;
	const httpCodeCandidate =
		typeof topLevel?.http_code === "number"
			? topLevel.http_code
			: typeof nestedError?.http_code === "number"
				? nestedError.http_code
				: null;

	const messageCandidate =
		typeof topLevel?.message === "string"
			? topLevel.message
			: typeof nestedError?.message === "string"
				? nestedError.message
				: null;

	if (messageCandidate) {
		return { httpCode: httpCodeCandidate, message: messageCandidate };
	}

	if (error instanceof Error && error.message) {
		return { httpCode: httpCodeCandidate, message: error.message };
	}

	try {
		return { httpCode: httpCodeCandidate, message: JSON.stringify(error) };
	} catch {
		return { httpCode: httpCodeCandidate, message: String(error) };
	}
}

function isCloudinaryNotFoundError(error: unknown): boolean {
	const details = getCloudinaryErrorDetails(error);
	if (details.httpCode === 404) return true;
	return details.message.toLowerCase().includes("not found");
}

function getAccessibleGuildEffect(
	serverId: string,
): Effect.Effect<{ userId: string; guild: DiscordGuild }, Error> {
	return Effect.gen(function* () {
		const userId = yield* getSessionUserIdEffect();
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
				// 只檢查是否包含管理員權限 (不包含 Manage Guild 了)
				hasStrictAdmin =
					(permissions & GUILD_ADMINISTRATOR_PERMISSION) ===
					GUILD_ADMINISTRATOR_PERMISSION;
			} catch {
				hasStrictAdmin = false;
			}
		}

		if (!hasStrictAdmin) {
			return yield* Effect.fail(
				new Error(
					"你需要該伺服器的管理員 (Administrator) 權限才能發布 / 編輯。",
				),
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
			const res = await fetch(
				`https://discord.com/api/v10/guilds/${serverId}?with_counts=false`,
				{
					method: "GET",
					headers: { Authorization: `Bot ${botToken}` },
				},
			);
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
	serverId: string, // 🚀 連這裡的 userId 參數都可以拔掉了！因為 getAccessibleGuildEffect 會自己去拿 Session
): Effect.Effect<ServerPublishBundle, Error> {
	return Effect.gen(function* () {
		// 🚀 平行執行：Discord 權限驗證 與 資料庫查詢
		const [accessResult, rows] = yield* Effect.all(
			[
				getAccessibleGuildEffect(serverId), // 內含 Session 獲取、Discord API 請求與 Admin 權限擋關
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
						})
						.from(server)
						.where(eq(server.id, serverId))
						.limit(1),
				),
			],
			{ concurrency: "unbounded" },
		);

		const { guild } = accessResult; // 這裡就能直接拿到驗證通過後的 guild 資料
		const current = rows[0];
		const guildIconUrl = buildGuildIconUrl(guild);

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
			},
		};
	});
}

function upsertServerPublishEffect(
	input: ServerPublishSubmitInput,
): Effect.Effect<ServerPublishResult, Error> {
	return Effect.gen(function* () {
		const { userId, guild } = yield* getAccessibleGuildEffect(input.serverId);

		const shortDescription = input.form.shortDescription.trim();
		const longDescription = input.form.longDescription.trim();
		const inviteLink = input.form.inviteLink.trim();

		if (!shortDescription || !longDescription || !inviteLink) {
			return yield* Effect.fail(
				new Error("描述、完整介紹與邀請連結不可為空白"),
			);
		}

		const tags = normalizeList(input.form.tags);
		const rules = normalizeList(input.form.rules);
		const website = normalizeOptionalString(input.form.websiteLink);
		const secret = normalizeOptionalString(input.form.secret);
		const webhookUrl = normalizeOptionalString(input.form.webhook_url);
		const iconUrl =
			normalizeOptionalString(input.iconUrl) ?? buildGuildIconUrl(guild);
		const bannerUrl = normalizeOptionalString(input.bannerUrl);

		// 🚀 優化：利用 onConflictDoUpdate 原生支援 Upsert 特性，直接移除冗餘的 SELECT 前置檢查
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
					members: 0,
					online: 0,
					upvotes: 0,
					features: [],
					screenshots: [],
					nsfw: input.form.nsfw,
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
						banner: bannerUrl,
						nsfw: input.form.nsfw,
					},
				}),
		);

		return {
			success: true,
			message: "伺服器已成功發布 / 更新",
			serverId: input.serverId,
		};
	});
}

function uploadServerBannerEffect(
	input: ServerBannerUploadInput,
): Effect.Effect<ServerBannerUploadResult, Error> {
	return Effect.gen(function* () {
		yield* getAccessibleGuildEffect(input.serverId);

		const { cloudName, apiKey, apiSecret, uploadPreset } =
			yield* getCloudinaryCredentialsEffect();

		cloudinary.config({
			cloud_name: cloudName,
			api_key: apiKey,
			api_secret: apiSecret,
			secure: true,
		});

		const publicId = getServerBannerPublicId(input.serverId);
		const normalizedFingerprint = input.fingerprint.toLowerCase();

		const existingResource = yield* Effect.tryPromise({
			try: () =>
				cloudinary.api.resource(publicId, {
					resource_type: "image",
					type: "upload",
					context: true,
				}),
			catch: (error) => {
				if (isCloudinaryNotFoundError(error)) {
					return null;
				}
				const details = getCloudinaryErrorDetails(error);
				throw new Error(
					`Failed to inspect existing Cloudinary banner: ${details.message}`,
				);
			},
		}).pipe(Effect.catchAll(() => Effect.succeed(null)));

		const existingFingerprint = getExistingBannerFingerprint(existingResource);
		const existingBannerUrl = getExistingBannerUrl(existingResource);

		if (
			existingFingerprint === normalizedFingerprint &&
			typeof existingBannerUrl === "string"
		) {
			return {
				bannerUrl: existingBannerUrl,
				fingerprint: normalizedFingerprint,
				skipped: true,
				message: "選擇的圖片與目前 Banner 相同，已略過上傳",
			};
		}

		const uploadResult = yield* Effect.tryPromise({
			try: () =>
				cloudinary.uploader.upload(input.dataUrl, {
					resource_type: "image",
					public_id: publicId,
					overwrite: true,
					invalidate: true,
					unique_filename: false,
					use_filename: false,
					...(uploadPreset ? { upload_preset: uploadPreset } : {}),
					context: {
						fingerprint: normalizedFingerprint,
						server_id: input.serverId,
						file_name: input.fileName,
					},
				}),
			catch: (error) => {
				const details = getCloudinaryErrorDetails(error);
				return new Error(
					`Failed to upload banner image to Cloudinary: ${details.message}`,
				);
			},
		});

		if (!uploadResult.secure_url) {
			return yield* Effect.fail(
				new Error("Cloudinary 未回傳有效的 Banner URL"),
			);
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
				db
					.select({ ownerId: server.ownerId })
					.from(server)
					.where(eq(server.id, serverId))
					.limit(1),
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

function checkIsServerOwnerInDb(
	serverId: string,
	userId: string,
): Effect.Effect<boolean, never> {
	return Effect.tryPromise({
		try: () =>
			db
				.select({ ownerId: server.ownerId })
				.from(server)
				.where(eq(server.id, serverId))
				.limit(1),
		catch: (error) => new Error(`資料庫查詢失敗: ${error}`),
	}).pipe(
		Effect.map((rows) => rows.length > 0 && rows[0].ownerId === userId),
		// 遇到任何錯誤（如 DB 斷線）都安全地回傳 false，不中斷主流程
		Effect.catchAll((error) =>
			Effect.sync(() => {
				console.error("DB 權限備援檢查失敗:", error);
				return false;
			}),
		),
	);
}

function enforceServerAdminEffect(serverId: string, userId: string) {
	return Effect.gen(function* () {
		// 1. 抓取 Discord 資料
		const accessResult = yield* getAccessibleGuildEffect(serverId);
		const { guild } = accessResult;

		let hasPermission = false;

		if (guild.owner) {
			hasPermission = true;
		} else {
			try {
				const permissions = BigInt(guild.permissions || "0");
				// 🚀 改成只有 Admin
				hasPermission =
					(permissions & GUILD_ADMINISTRATOR_PERMISSION) ===
					GUILD_ADMINISTRATOR_PERMISSION;
			} catch {
				hasPermission = false;
			}
		}

		// 2. 如果 Discord 驗證失敗，報錯阻擋（不在此處悄悄刪除資料庫）
		if (!hasPermission) {
			return yield* Effect.fail(
				new Error("權限不足：您必須是該伺服器的擁有者或管理員"),
			);
		}

		return accessResult;
	});
}

export function getServerPublishBundleById(
	serverId: string,
): Promise<ServerPublishBundle> {
	return runEffect(getServerPublishBundleEffect(serverId));
}

export function upsertServerPublish(
	input: ServerPublishSubmitInput,
): Promise<ServerPublishResult> {
	return runEffect(upsertServerPublishEffect(input));
}

export function uploadServerBanner(
	input: ServerBannerUploadInput,
): Promise<ServerBannerUploadResult> {
	return runEffect(uploadServerBannerEffect(input));
}

export function checkIsServerOwner(
	serverId: string,
	userId: string,
): Promise<boolean> {
	return runEffect(checkIsServerOwnerEffect(serverId, userId));
}
