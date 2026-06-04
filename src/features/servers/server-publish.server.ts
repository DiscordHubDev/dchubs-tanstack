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
		const account = yield* tryEffectPromise(
			"Failed to load Discord account token",
			() =>
				db.query.authAccount.findFirst({
					where: and(
						eq(authAccount.accountId, userId),
						eq(authAccount.providerId, "discord"),
					),
					columns: {
						accessToken: true,
					},
				}),
		);

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

		return {
			cloudName,
			apiKey,
			apiSecret,
			uploadPreset,
		};
	});
}

function getServerBannerPublicId(serverId: string): string {
	return `servers/${serverId}/banner`;
}

function getExistingBannerFingerprint(resource: unknown): string | null {
	const candidate = (
		resource as {
			context?: {
				custom?: {
					fingerprint?: unknown;
				};
			};
		}
	)?.context?.custom?.fingerprint;

	if (typeof candidate !== "string") {
		return null;
	}

	const normalized = candidate.trim().toLowerCase();
	return normalized.length > 0 ? normalized : null;
}

function getExistingBannerUrl(resource: unknown): string | null {
	const secureUrl = (resource as { secure_url?: unknown })?.secure_url;
	if (typeof secureUrl !== "string") {
		return null;
	}

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
		error?: {
			http_code?: unknown;
			message?: unknown;
		};
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
		return {
			httpCode: httpCodeCandidate,
			message: messageCandidate,
		};
	}

	if (error instanceof Error && error.message) {
		return {
			httpCode: httpCodeCandidate,
			message: error.message,
		};
	}

	try {
		return {
			httpCode: httpCodeCandidate,
			message: JSON.stringify(error),
		};
	} catch {
		return {
			httpCode: httpCodeCandidate,
			message: String(error),
		};
	}
}

function isCloudinaryNotFoundError(error: unknown): boolean {
	const details = getCloudinaryErrorDetails(error);
	if (details.httpCode === 404) {
		return true;
	}

	return details.message.toLowerCase().includes("not found");
}

function getAccessibleGuildEffect(
	serverId: string,
): Effect.Effect<{ userId: string; guild: DiscordGuild }, Error> {
	return Effect.gen(function* () {
		const userId = yield* getSessionUserIdEffect(); // 記得底層要加 React.cache
		const userAccessToken = yield* getDiscordAccessTokenEffect(userId);

		// 1. 只抓取「使用者」的伺服器列表 (通常數量少，且必須抓來驗證管理員權限)
		const userGuilds = yield* tryEffectPromise(
			"Failed to fetch user guilds",
			() =>
				fetchDiscordGuilds({
					token: userAccessToken,
					tokenType: "Bearer",
				}),
		);

		// 2. 先確認使用者有沒有這個伺服器
		const guild = userGuilds.find((item) => item.id === serverId);
		if (!guild) {
			return yield* Effect.fail(new Error("你在 Discord 中沒有找到這個伺服器"));
		}

		if (!hasGuildManagePermission(guild)) {
			return yield* Effect.fail(new Error("你需要該伺服器的管理權限才能發布"));
		}

		// 3. 【優化核心】單點確認機器人是否在該伺服器
		// 不要 fetchDiscordGuilds 抓全部，直接寫一個 Effect 去單查指定的 Server
		const botToken = yield* getBotTokenEffect();
		const isBotInGuild = yield* checkBotInGuildEffect(serverId, botToken);

		if (!isBotInGuild) {
			return yield* Effect.fail(new Error("機器人尚未加入該伺服器"));
		}

		return { userId, guild };
	});
}

function checkBotInGuildEffect(serverId: string, botToken: string) {
	return Effect.tryPromise({
		try: async () => {
			const res = await fetch(
				`https://discord.com/api/v10/guilds/${serverId}`,
				{
					method: "GET",
					headers: { Authorization: `Bot ${botToken}` },
				},
			);
			// 只要不是 401/403/404，通常就代表機器人看得到這個伺服器
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

function enforceServerOwnerEffect(serverId: string, userId: string) {
	return Effect.tryPromise({
		try: () => enforceServerOwner(serverId, userId),
		// 將原本拋出的 Error 傳遞給 Effect 的錯誤通道
		catch: (error) =>
			error instanceof Error ? error : new Error(String(error)),
	});
}

export function getServerPublishBundleEffect(
	userId: string,
	serverId: string,
): Effect.Effect<ServerPublishBundle, Error> {
	return Effect.gen(function* () {
		// 1. 執行權限與 Guild 檢查
		const { guild } = yield* enforceServerOwnerEffect(serverId, userId).pipe(
			Effect.andThen(() => getAccessibleGuildEffect(serverId)),

			// 🎯 關鍵修正點：當任何一個權限檢查失敗時
			Effect.catchAll((originalError) =>
				tryEffectPromise(
					"Failed to remove user from serverAdmins relation",
					async () => {
						if (userId) {
							await db
								.delete(serverAdmins)
								.where(
									and(eq(serverAdmins.a, serverId), eq(serverAdmins.b, userId)),
								);
							console.log(`[自動清理] 已成功移除不合規管理員: ${userId}`);
						}
					},
				).pipe(
					// 💡 移除關聯後，絕對不要忽略錯誤！
					// 我們使用 andThen 強制讓這個錯誤通道「回歸」成原本的 Forbidden 錯誤
					Effect.andThen(() => Effect.fail(originalError)),
					// 如果移除關聯的 DB 操作本身失敗了，也一樣維持拋出原本的權限錯誤
					Effect.catchAll(() => Effect.fail(originalError)),
				),
			),
		);

		// 2. 獲取資料庫中的發布資料
		const rows = yield* tryEffectPromise(
			"Failed to fetch published server",
			() =>
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
		);

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

		const existingRows = yield* tryEffectPromise(
			"Failed to inspect existing server",
			() =>
				db
					.select({
						id: server.id,
						ownerId: server.ownerId,
					})
					.from(server)
					.where(eq(server.id, input.serverId))
					.limit(1),
		);

		const existing = existingRows[0];

		if (existing) {
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
				message: "伺服器資料已更新",
				serverId: input.serverId,
			};
		}

		yield* tryEffectPromise("Failed to publish server", () =>
			db.insert(server).values({
				id: input.serverId,
				name: guild.name,
				description: shortDescription,
				longDescription,
				members: 0,
				online: 0,
				upvotes: 0,
				icon: iconUrl,
				banner: bannerUrl,
				ownerId: userId,
				website,
				inviteUrl: inviteLink,
				rules,
				features: [],
				tags,
				screenshots: [],
				voteNotificationUrl: webhookUrl,
				secret,
				nsfw: input.form.nsfw,
			}),
		);

		return {
			success: true,
			message: "伺服器已成功發布",
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
		}).pipe(
			// 即使 inspect 失敗也不中斷，改由 upload 流程繼續執行。
			Effect.catchAll(() => Effect.succeed(null)),
		);

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

// 假設這是你原本獲取 Discord/外部 API 的函式
// 它應該要回傳一個 Effect，或者用 Effect.tryPromise 包裹
const checkIsOwnerFromApiEffect = (serverId: string, userId: string) =>
	Effect.gen(function* () {
		yield* Effect.logInfo("➡️ 資料庫查無資料，改用 API 線上比對中...");

		// 直接 yield* 其他 Effect，保留完整的執行鏈與錯誤追蹤
		const userAccessToken = yield* getDiscordAccessTokenEffect(userId);

		// 把原生的 Promise 呼叫包進 Effect.tryPromise
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
		// 1. 資料庫只單純查詢這個伺服器是否存在，並把真正的 ownerId 拿出來
		const serverResult = yield* Effect.tryPromise({
			try: () =>
				db.query.server.findFirst({
					where: eq(server.id, serverId), // 只比對 serverId
					columns: { ownerId: true }, // 撈出 ownerId 來做比對
				}),
			catch: (error) => new Error(`資料庫查詢失敗: ${error}`),
		});

		if (serverResult) {
			return serverResult.ownerId === userId;
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
	userId: string,
	serverId: string,
): Promise<ServerPublishBundle> {
	return runEffect(getServerPublishBundleEffect(userId, serverId));
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
