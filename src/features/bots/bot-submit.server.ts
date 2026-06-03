import { v2 as cloudinary } from "cloudinary";
import { and, eq, inArray, or } from "drizzle-orm";
import { Effect } from "effect";
import { db } from "#/drizzle/db";
import { bot, botCommand, botDevelopers, user } from "#/drizzle/schema";
import {
	BotAlreadyExists,
	type DiscordRpcFailed,
	ForbiddenError,
	ImageUploadFailed,
	InvalidInviteUrl,
	NotificationFailed,
	SubmitBotFailed,
} from "#/errors/bot-errors";
import { fetchJsonEffect, runEffect, toErrorMessage } from "#/lib/effect-utils";
import type { BotInfo } from "#/lib/types";
import { fetchBotRpcEffect } from "#/utils/fetch-rpc";
import { sendDiscordWebhookEffect } from "../admin/webhook.server";
import { sendNotificationEffect } from "../notifications/notifications.server";
import type {
	DeleteBotImageInput,
	SendPendingWebhookInput,
	SubmitBotInput,
	UploadBotImagesInput,
} from "./bot-submit.schemas";
import type {
	DeleteBotImageResult,
	DiscordBotRPCInfo,
	SendPendingWebhookResult,
	SubmitBotErrorPayload,
	SubmitBotResult,
	UploadBotImagesResult,
} from "./bot-submit.types";

const SUBMIT_SUCCESS_MESSAGE =
	"✅ 機器人已成功提交，請等待審核人員審核，審核結果將會在網站的收件匣和官方群組的通知中出現。";

type SubmitBotMode = "create" | "edit";

type NormalizedCommand = {
	name: string;
	description: string;
	usage: string;
	category: string | null;
};

type BotPayload = {
	botId: string;
	mode: SubmitBotMode;
	botRow: {
		name: string;
		description: string;
		longDescription: string;
		prefix: string;
		inviteUrl: string;
		website: string | null;
		supportServer: string | null;
		tags: string[];
		features: string[];
		screenshots: string[];
		icon: string | null;
		banner: string | null;
		voteNotificationUrl: string | null;
		secret: string | null;
	};
	commands: NormalizedCommand[];
	developerNames: string[];
	exists: boolean;
};

function normalizeOptionalString(value?: string | null): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function normalizeList(values: readonly string[]): string[] {
	return values
		.map((value) => value.trim())
		.filter(Boolean)
		.filter((value, index, list) => list.indexOf(value) === index);
}

function normalizeCommands(
	input: readonly {
		name: string;
		description: string;
		usage: string;
		category?: string | null;
	}[],
): NormalizedCommand[] {
	return input
		.map((command) => ({
			name: command.name.trim(),
			description: command.description.trim(),
			usage: command.usage.trim(),
			category: normalizeOptionalString(command.category) ?? null,
		}))
		.filter((command) =>
			Boolean(command.name && command.description && command.usage),
		);
}

function normalizeDevelopers(input: readonly { name: string }[]): string[] {
	return normalizeList(input.map((item) => item.name));
}

function resolveBotIconUrl(
	botId: string,
	rpcIcon?: string | null,
	fallback?: string | null,
): string | null {
	if (rpcIcon?.startsWith("http")) {
		return rpcIcon;
	}

	if (rpcIcon) {
		return `https://cdn.discordapp.com/app-icons/${botId}/${rpcIcon}.png?size=256`;
	}

	return normalizeOptionalString(fallback);
}

function resolveBotBannerUrl(fallback?: string | null): string | null {
	return normalizeOptionalString(fallback);
}

function dbEffect<A>(
	label: string,
	run: () => Promise<A>,
): Effect.Effect<A, SubmitBotFailed> {
	return Effect.tryPromise({
		try: run,
		catch: (error) =>
			new SubmitBotFailed({
				message: `${label}: ${toErrorMessage(error)}`,
			}),
	});
}

function parseClientId(inviteUrl: string) {
	return Effect.try({
		try: () => {
			const url = new URL(inviteUrl);
			const clientId = url.searchParams.get("client_id");
			if (!clientId) {
				throw new InvalidInviteUrl({ url: inviteUrl });
			}
			return clientId;
		},
		catch: () => new InvalidInviteUrl({ url: inviteUrl }),
	});
}

type DiscordUserResponse = {
	id: string;
	username: string;
	global_name?: string | null;
	avatar?: string | null;
	banner?: string | null;
	accent_color?: number | null;
};

function getBotTokenEffect(): Effect.Effect<string, SubmitBotFailed> {
	return Effect.gen(function* () {
		const botToken = process.env.DISCORD_BOT_TOKEN;
		if (!botToken) {
			return yield* Effect.fail(
				new SubmitBotFailed({
					message: "Missing DISCORD_BOT_TOKEN environment variable.",
				}),
			);
		}

		return botToken;
	});
}

function buildAvatarUrl(user: DiscordUserResponse): string | null {
	if (!user.avatar) return null;
	return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`;
}

function buildBannerUrl(user: DiscordUserResponse): string | null {
	if (!user.banner) return null;
	return `https://cdn.discordapp.com/banners/${user.id}/${user.banner}.png?size=600`;
}

function fetchDiscordUserEffect(
	botId: string,
): Effect.Effect<BotInfo, SubmitBotFailed> {
	return Effect.gen(function* () {
		const token = yield* getBotTokenEffect();

		// 1. 直接執行 Effect，取得解析完的 JSON 資料
		// 2. 發生任何錯誤 (連線失敗、狀態碼非 2xx、JSON 解析失敗) 都會轉譯為 SubmitBotFailed
		const payload = (yield* fetchJsonEffect(
			`https://discord.com/api/v10/users/${botId}`,
			{
				headers: {
					Authorization: `Bot ${token}`,
				},
			},
		).pipe(
			Effect.mapError(
				(error) =>
					new SubmitBotFailed({
						message: `Discord API 請求或解析失敗：${toErrorMessage(error)}`,
					}),
			),
		)) as DiscordUserResponse;

		return {
			username: payload.username ?? "",
			global_name: payload.global_name ?? payload.username ?? "",
			avatar_url: buildAvatarUrl(payload) ?? "",
			banner_url: buildBannerUrl(payload) ?? "",
			accent_color: String(payload.accent_color ?? ""),
		};
	});
}

function getExistingBotEffect(
	botId: string,
): Effect.Effect<boolean, SubmitBotFailed> {
	return dbEffect("Failed to inspect existing bot", () =>
		db.select({ id: bot.id }).from(bot).where(eq(bot.id, botId)).limit(1),
	).pipe(Effect.map((rows) => Boolean(rows[0])));
}

function buildBotPayload(
	input: SubmitBotInput,
	botId: string,
	rpc: DiscordBotRPCInfo,
	botInfo: BotInfo,
	exists: boolean,
): BotPayload {
	const mode = input.mode ?? "create";
	const tags = normalizeList(input.form.tags);
	const commands = normalizeCommands(input.form.commands);
	const developerNames = normalizeDevelopers(input.form.developers);
	const screenshots = input.screenshots.map((item) => item.url);

	const iconUrl = resolveBotIconUrl(botId, rpc.icon, botInfo.avatar_url);
	const bannerUrl =
		normalizeOptionalString(input.banner) ??
		resolveBotBannerUrl(botInfo.banner_url);

	return {
		botId,
		mode,
		botRow: {
			name: input.form.botName.trim(),
			description: input.form.botDescription.trim(),
			longDescription: input.form.botLongDescription.trim(),
			prefix: input.form.botPrefix.trim(),
			inviteUrl: input.form.botInvite.trim(),
			website: normalizeOptionalString(input.form.botWebsite),
			supportServer: normalizeOptionalString(input.form.botSupport),
			tags,
			features: [],
			screenshots,
			icon: iconUrl,
			banner: bannerUrl,
			voteNotificationUrl: normalizeOptionalString(input.form.webhook_url),
			secret: normalizeOptionalString(input.form.secret),
		},
		commands,
		developerNames,
		exists,
	};
}

function resolveDeveloperIdsEffect(
	names: readonly string[],
): Effect.Effect<string[], SubmitBotFailed> {
	const normalized = normalizeList(names);
	if (normalized.length === 0) {
		return Effect.succeed([]);
	}

	return dbEffect("Failed to resolve developer accounts", () =>
		db
			.select({ id: user.id })
			.from(user)
			.where(
				or(inArray(user.id, normalized), inArray(user.username, normalized)),
			),
	).pipe(Effect.map((rows) => rows.map((row) => row.id)));
}

function persistBotEffect(
	payload: BotPayload,
	developerIds: readonly string[],
): Effect.Effect<void, SubmitBotFailed> {
	return dbEffect("Failed to persist bot", () =>
		db.transaction(async (tx) => {
			if (payload.exists) {
				await tx
					.update(bot)
					.set({
						name: payload.botRow.name,
						description: payload.botRow.description,
						longDescription: payload.botRow.longDescription,
						prefix: payload.botRow.prefix,
						inviteUrl: payload.botRow.inviteUrl,
						website: payload.botRow.website,
						supportServer: payload.botRow.supportServer,
						tags: payload.botRow.tags,
						features: payload.botRow.features,
						screenshots: payload.botRow.screenshots,
						icon: payload.botRow.icon,
						banner: payload.botRow.banner,
						voteNotificationUrl: payload.botRow.voteNotificationUrl,
						secret: payload.botRow.secret,
					})
					.where(eq(bot.id, payload.botId));
			} else {
				await tx.insert(bot).values({
					id: payload.botId,
					name: payload.botRow.name,
					description: payload.botRow.description,
					longDescription: payload.botRow.longDescription,
					prefix: payload.botRow.prefix,
					inviteUrl: payload.botRow.inviteUrl,
					website: payload.botRow.website,
					supportServer: payload.botRow.supportServer,
					tags: payload.botRow.tags,
					features: payload.botRow.features,
					screenshots: payload.botRow.screenshots,
					icon: payload.botRow.icon,
					banner: payload.botRow.banner,
					voteNotificationUrl: payload.botRow.voteNotificationUrl,
					secret: payload.botRow.secret,
					servers: 0,
					users: 0,
					upvotes: 0,
					status: "pending",
				});
			}

			await tx.delete(botCommand).where(eq(botCommand.botId, payload.botId));
			if (payload.commands.length > 0) {
				await tx.insert(botCommand).values(
					payload.commands.map((command) => ({
						id: crypto.randomUUID(),
						botId: payload.botId,
						name: command.name,
						description: command.description,
						usage: command.usage,
						category: command.category,
					})),
				);
			}

			await tx.delete(botDevelopers).where(eq(botDevelopers.a, payload.botId));
			if (developerIds.length > 0) {
				await tx.insert(botDevelopers).values(
					developerIds.map((developerId) => ({
						a: payload.botId,
						b: developerId,
					})),
				);
			}
		}),
	);
}

function notifyDevelopersEffect(
	input: SubmitBotInput,
): Effect.Effect<void, NotificationFailed | SubmitBotFailed> {
	if (input.mode === "edit") {
		return Effect.succeed(undefined);
	}

	return sendNotificationEffect({
		subject: "機器人已提交",
		content: SUBMIT_SUCCESS_MESSAGE,
		teaser: "你的機器人已成功提交，正在審核中。",
		isSystem: true,
	});
}

function getPendingWebhookUrl(): string | null {
	return (
		process.env.PENDING_BOT_WEBHOOK_URL ??
		process.env.DISCORD_PENDING_WEBHOOK_URL ??
		null
	);
}

function sendPendingWebhookEffect(
	input: SendPendingWebhookInput,
): Effect.Effect<void, NotificationFailed> {
	if (input.mode === "edit") {
		return Effect.succeed(undefined);
	}

	const webhookUrl = getPendingWebhookUrl();
	if (!webhookUrl) {
		return Effect.succeed(undefined);
	}

	const payload = {
		content: `新增機器人待審核：${input.botName} (${input.botId})`,
		embeds: [
			{
				title: input.botName,
				description: input.botDescription,
				url: input.inviteUrl ?? undefined,
				thumbnail: input.iconUrl ? { url: input.iconUrl } : undefined,
			},
		],
	};

	// 直接回傳 fetchJsonEffect 的結果，並處理成功與失敗的型別轉換
	return fetchJsonEffect(webhookUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	}).pipe(
		// 如果失敗，統一拋出 NotificationFailed
		Effect.mapError(() => new NotificationFailed({})),
		// 如果成功，忽略原本的 JSON 回傳值，轉換為 void (undefined)
		Effect.map(() => undefined),
	);
}

function submitPipeline(
	input: SubmitBotInput,
): Effect.Effect<
	string,
	| InvalidInviteUrl
	| BotAlreadyExists
	| DiscordRpcFailed
	| SubmitBotFailed
	| NotificationFailed
> {
	return Effect.gen(function* () {
		const botId = yield* parseClientId(input.form.botInvite);
		const exists = yield* getExistingBotEffect(botId);
		if ((input.mode ?? "create") === "create" && exists) {
			return yield* Effect.fail(new BotAlreadyExists({ id: botId }));
		}

		const rpc = yield* fetchBotRpcEffect(botId);
		const botInfo = yield* fetchDiscordUserEffect(botId);
		const payload = buildBotPayload(input, botId, rpc, botInfo, exists);
		const developerIds = yield* resolveDeveloperIdsEffect(
			payload.developerNames,
		);
		yield* persistBotEffect(payload, developerIds);
		yield* notifyDevelopersEffect(input);

		yield* sendDiscordWebhookEffect({
			_tag: "pendingBot",
			avatarUrl:
				payload.botRow.icon || "https://cdn.discordapp.com/embed/avatars/0.png",
			data: {
				botName: payload.botRow.name,
				botPrefix: payload.botRow.prefix || "",
				botDescription: payload.botRow.description || "",
				tags: payload.botRow.tags || [],
			},
		});

		return botId;
	}).pipe(Effect.tapError((error) => Effect.sync(() => console.error(error))));
}

function serializeBotError(
	error:
		| InvalidInviteUrl
		| BotAlreadyExists
		| DiscordRpcFailed
		| SubmitBotFailed
		| NotificationFailed
		| ImageUploadFailed,
): SubmitBotErrorPayload {
	switch (error._tag) {
		case "InvalidInviteUrl":
			return {
				tag: error._tag,
				message: "邀請連結格式不正確",
				url: error.url,
			};
		case "BotAlreadyExists":
			return {
				tag: error._tag,
				message: "此機器人已存在",
				id: error.id,
			};
		case "DiscordRpcFailed":
			return {
				tag: error._tag,
				message: `Discord RPC 請求失敗 (HTTP ${error.status})`,
				status: error.status,
			};
		case "SubmitBotFailed":
			return {
				tag: error._tag,
				message: error.message,
			};
		case "NotificationFailed":
			return {
				tag: error._tag,
				message: "通知送出失敗",
			};
		case "ImageUploadFailed":
			return {
				tag: error._tag,
				message: "圖片上傳失敗",
				filename: error.filename,
			};
		default:
			return {
				tag: "SubmitBotFailed",
				message: "提交失敗",
			};
	}
}

function submitBotEffect(
	input: SubmitBotInput,
): Effect.Effect<SubmitBotResult, never> {
	return submitPipeline(input).pipe(
		Effect.map((botId) => ({ success: true as const, botId })),
		Effect.catchAll((error) =>
			Effect.succeed({
				success: false as const,
				error: serializeBotError(error),
			}),
		),
	);
}

function getCloudinaryCredentialsEffect(): Effect.Effect<
	{
		cloudName: string;
		apiKey: string;
		apiSecret: string;
		uploadPreset: string | null;
	},
	SubmitBotFailed
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
				new SubmitBotFailed({
					message:
						"Cloudinary 環境變數未設定完整，請確認 CLOUDINARY_CLOUD_NAME、CLOUDINARY_API_KEY、CLOUDINARY_API_SECRET",
				}),
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

function uploadBotImagesEffect(
	input: UploadBotImagesInput,
): Effect.Effect<UploadBotImagesResult, never> {
	return Effect.gen(function* () {
		const credentials = yield* getCloudinaryCredentialsEffect();
		cloudinary.config({
			cloud_name: credentials.cloudName,
			api_key: credentials.apiKey,
			api_secret: credentials.apiSecret,
			secure: true,
		});

		const results = yield* Effect.forEach(input.files, (file) =>
			Effect.tryPromise({
				try: () =>
					cloudinary.uploader.upload(file.dataUrl, {
						resource_type: "image",
						folder: "bots/screenshots",
						use_filename: false,
						unique_filename: true,
						invalidate: true,
						...(credentials.uploadPreset
							? { upload_preset: credentials.uploadPreset }
							: {}),
						context: {
							file_name: file.fileName,
						},
					}),
				catch: () => new ImageUploadFailed({ filename: file.fileName }),
			}),
		);

		const items = yield* Effect.forEach(results, (result, index) => {
			if (!result.secure_url || !result.public_id) {
				return Effect.fail(
					new ImageUploadFailed({
						filename: input.files[index]?.fileName ?? "unknown",
					}),
				);
			}

			return Effect.succeed({
				url: result.secure_url,
				public_id: result.public_id,
			});
		});

		return { success: true as const, items };
	}).pipe(
		Effect.catchAll((error) =>
			Effect.succeed({
				success: false as const,
				error: serializeBotError(error),
			}),
		),
	);
}

function deleteBotImageEffect(
	input: DeleteBotImageInput,
): Effect.Effect<DeleteBotImageResult, never> {
	return Effect.gen(function* () {
		const credentials = yield* getCloudinaryCredentialsEffect();
		cloudinary.config({
			cloud_name: credentials.cloudName,
			api_key: credentials.apiKey,
			api_secret: credentials.apiSecret,
			secure: true,
		});

		yield* Effect.tryPromise({
			try: () =>
				cloudinary.uploader.destroy(input.publicId, {
					resource_type: "image",
					invalidate: true,
				}),
			catch: () => new SubmitBotFailed({ message: "圖片刪除失敗" }),
		});

		return { success: true as const };
	}).pipe(
		Effect.catchAll((error) =>
			Effect.succeed({
				success: false as const,
				error: serializeBotError(error),
			}),
		),
	);
}

function sendPendingWebhookResultEffect(
	input: SendPendingWebhookInput,
): Effect.Effect<SendPendingWebhookResult, never> {
	return sendPendingWebhookEffect(input).pipe(
		Effect.map(() => ({ success: true as const })),
		Effect.catchAll((error) =>
			Effect.succeed({
				success: false as const,
				error: serializeBotError(error),
			}),
		),
	);
}
function enforceBotDeveloperEffect(botId: string, userId: string) {
	return Effect.gen(function* () {
		// 1. 將 Drizzle 的 Promise 轉換為 Effect
		const developerRecord = yield* Effect.promise(() =>
			db.query.botDevelopers.findFirst({
				where: and(eq(botDevelopers.a, botId), eq(botDevelopers.b, userId)),
			}),
		);

		// 2. 檢查是否存在，不存在則利用 yield* 拋出錯誤
		if (!developerRecord) {
			yield* Effect.fail(
				new ForbiddenError({
					message: "Forbidden: You are not a developer of this bot",
				}),
			);
		}

		return true;
	});
}

export function submitBot(input: SubmitBotInput): Promise<SubmitBotResult> {
	return runEffect(submitBotEffect(input));
}

export function uploadBotImages(
	input: UploadBotImagesInput,
): Promise<UploadBotImagesResult> {
	return runEffect(uploadBotImagesEffect(input));
}

export function deleteBotImage(
	input: DeleteBotImageInput,
): Promise<DeleteBotImageResult> {
	return runEffect(deleteBotImageEffect(input));
}

export function sendPendingWebhook(
	input: SendPendingWebhookInput,
): Promise<SendPendingWebhookResult> {
	return runEffect(sendPendingWebhookResultEffect(input));
}
export function enforceBotDeveloper(
	botId: string,
	userId: string,
): Promise<boolean> {
	return runEffect(enforceBotDeveloperEffect(botId, userId));
}

export function parseBotId(inviteUrl: string): Promise<string> {
	return runEffect(parseClientId(inviteUrl));
}
