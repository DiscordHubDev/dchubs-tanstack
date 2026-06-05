import { and, eq, ilike, inArray, or } from "drizzle-orm";
import { Effect, Either, Schema } from "effect";
import { SignJWT } from "jose";
import { db } from "#/drizzle/db";
import {
	apiToken,
	bot,
	botDevelopers,
	server,
	serverAdmins,
	user,
	userFavoriteBots,
	userFavoriteServers,
} from "#/drizzle/schema";
import { getDomainUser } from "#/lib/edge-context";
import { runEffect, tryEffectPromise } from "#/lib/effect-utils";
import { ApiJwtPayloadSchema } from "./users.schemas";
import type {
	ApiTokenPair,
	DevUser,
	JWTDiscordProfile,
	LegacyCompatibleSession,
	ToggleFavoriteParams,
	ToggleFavoriteResult,
	UpdateState,
	UpdateUserSettingsInput,
	UserBaseProfile,
	UserDetail,
	UserDeveloperSummary,
	UserSummary,
} from "./users.types";

type ApiJwtTokenType = "access" | "refresh";

type ApiJwtClaims = Schema.Schema.Type<typeof ApiJwtPayloadSchema>;

const JWT_ISSUER = "dchubs" as const;
const JWT_AUDIENCE = "dchubs-api" as const;
const ACCESS_TOKEN_TTL_SECONDS = 60 * 15;
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

function toServerSummary(input: {
	id: string;
	name: string;
	icon: string | null;
	description: string;
	tags: string[] | null;
	members: number;
	ownerId: string | null;
}): UserSummary {
	return {
		id: input.id,
		name: input.name,
		icon: input.icon,
		description: input.description,
		tags: input.tags ?? [],
		members: input.members,
		ownerId: input.ownerId ?? "",
	};
}

function toBotSummary(input: {
	id: string;
	name: string;
	icon: string | null;
	description: string;
	tags: string[] | null;
	servers: number;
	verified: boolean;
	status: "pending" | "approved" | "rejected";
}): UserSummary {
	return {
		id: input.id,
		name: input.name,
		icon: input.icon,
		description: input.description,
		tags: input.tags ?? [],
		servers: input.servers,
		verified: input.verified,
		status: input.status,
	};
}

function normalizeSocial(input: unknown): Record<string, string> {
	if (!input || typeof input !== "object" || Array.isArray(input)) {
		return {};
	}

	const next: Record<string, string> = {};

	for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
		if (typeof value === "string") {
			next[key] = value;
		}
	}

	return next;
}

function getFallbackAvatar(): string {
	return "https://cdn.discordapp.com/embed/avatars/0.png";
}

function getSecretForTokenType(type: ApiJwtTokenType): string {
	const secret =
		type === "access" ? process.env.JWT_SECRET : process.env.REFRESH_JWT_SECRET;

	if (!secret) {
		throw new Error(
			type === "access" ? "Missing JWT_SECRET" : "Missing REFRESH_JWT_SECRET",
		);
	}

	return secret;
}
function base64UrlToBytes(input: string): Uint8Array {
	const padded = input
		.replace(/-/g, "+")
		.replace(/_/g, "/")
		.padEnd(Math.ceil(input.length / 4) * 4, "=");

	const binary =
		typeof atob === "function"
			? atob(padded)
			: (
					globalThis as {
						Buffer?: {
							from: (
								s: string,
								e?: string,
							) => { toString: (e: string) => string };
						};
					}
				).Buffer?.from(padded, "base64").toString("binary");

	if (binary == null) {
		throw new Error("Base64 decoding is unavailable in current runtime");
	}

	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}

	return bytes;
}

function decodeJsonBase64Url<T>(value: string): T {
	const bytes = base64UrlToBytes(value);
	const raw = new TextDecoder().decode(bytes);
	return JSON.parse(raw) as T;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign", "verify"],
	);
}

function createClaims(userId: string, type: ApiJwtTokenType): ApiJwtClaims {
	const now = Math.floor(Date.now() / 1000);
	const ttl =
		type === "access" ? ACCESS_TOKEN_TTL_SECONDS : REFRESH_TOKEN_TTL_SECONDS;

	return {
		sub: userId,
		typ: type,
		iss: JWT_ISSUER,
		aud: JWT_AUDIENCE,
		iat: now,
		exp: now + ttl,
		jti: crypto.randomUUID(),
	};
}

async function signJwtWithClaims(
	claims: ApiJwtClaims,
	secret: string,
): Promise<string> {
	const secretKey = new TextEncoder().encode(secret);
	const jwt = await new SignJWT(claims as any)
		.setProtectedHeader({ alg: "HS256", typ: "JWT" })
		.sign(secretKey);
	return jwt;
}

async function createJwtForUser(
	userId: string,
	type: ApiJwtTokenType,
): Promise<string> {
	const claims = createClaims(userId, type);
	const secret = getSecretForTokenType(type);
	return signJwtWithClaims(claims, secret);
}

export async function verifyJwtAndDecodeClaims(
	token: string,
	expectedType: ApiJwtTokenType,
): Promise<ApiJwtClaims> {
	const parts = token.split(".");
	if (parts.length !== 3) {
		throw new Error("Invalid JWT format");
	}

	const [encodedHeader, encodedPayload, encodedSignature] = parts;
	const header = decodeJsonBase64Url<{ alg?: string; typ?: string }>(
		encodedHeader,
	);

	if (header.alg !== "HS256" || header.typ !== "JWT") {
		throw new Error("Unsupported JWT header");
	}

	const secret = getSecretForTokenType(expectedType);
	const key = await importHmacKey(secret);
	const signingInput = `${encodedHeader}.${encodedPayload}`;
	const signatureBytes = base64UrlToBytes(encodedSignature);
	const normalizedSignatureBytes = new Uint8Array(signatureBytes);

	const validSignature = await crypto.subtle.verify(
		"HMAC",
		key,
		normalizedSignatureBytes,
		new TextEncoder().encode(signingInput),
	);

	if (!validSignature) {
		throw new Error("Invalid JWT signature");
	}

	const decodeApiJwtPayloadEither =
		Schema.decodeUnknownEither(ApiJwtPayloadSchema);

	const rawPayload = decodeJsonBase64Url<unknown>(encodedPayload);

	const claimsResult = decodeApiJwtPayloadEither(rawPayload);

	if (Either.isLeft(claimsResult)) {
		throw new Error(
			"Invalid JWT claims format, missing properties, or invalid issuer/audience",
		);
	}

	const claims = claimsResult.right;
	const now = Math.floor(Date.now() / 1000);

	if (claims.typ !== expectedType) {
		throw new Error("Invalid JWT type");
	}

	if (claims.exp <= now) {
		throw new Error("JWT expired");
	}

	if (claims.iat > now + 30) {
		throw new Error("Invalid JWT issued-at");
	}

	return claims as ApiJwtClaims;
}

function dbEffect<A>(
	label: string,
	run: () => Promise<A>,
): Effect.Effect<A, Error> {
	return tryEffectPromise(label, run);
}

export function getUserBaseProfileEffect(
	id: string,
): Effect.Effect<UserBaseProfile | null, Error> {
	return Effect.gen(function* () {
		if (!id) return null;

		const currentUser = yield* dbEffect("Failed to load user profile", () =>
			db.query.user.findFirst({
				where: eq(user.id, id),
				columns: {
					id: true,
					username: true,
					name: true,
					avatar: true,
					banner: true,
					bannerColor: true,
					bio: true,
					social: true,
					createdAt: true,
				},
			}),
		);

		if (!currentUser) return null;

		return {
			...currentUser,
			social: normalizeSocial(currentUser.social),
		};
	});
}

export function getUserServersEffect(id: string) {
	return Effect.gen(function* () {
		if (!id) return { owned: [], adminIn: [] };

		const [ownedServersRaw, adminInRaw] = yield* Effect.all([
			dbEffect("Failed to load owned servers", () =>
				db
					.select({
						id: server.id,
						name: server.name,
						icon: server.icon,
						description: server.description,
						tags: server.tags,
						members: server.members,
						ownerId: server.ownerId,
					})
					.from(server)
					.where(eq(server.ownerId, id)),
			),
			dbEffect("Failed to load admin servers", () =>
				db
					.select({
						id: server.id,
						name: server.name,
						icon: server.icon,
						description: server.description,
						tags: server.tags,
						members: server.members,
						ownerId: server.ownerId,
					})
					.from(serverAdmins)
					.innerJoin(server, eq(serverAdmins.a, server.id))
					.where(eq(serverAdmins.b, id)),
			),
		]);

		return {
			owned: ownedServersRaw.map(toServerSummary),
			adminIn: adminInRaw.map(toServerSummary),
		};
	});
}

export function getUserBotsEffect(id: string) {
	return Effect.gen(function* () {
		if (!id) return { developedBots: [] };

		const developedBotsRaw = yield* dbEffect(
			"Failed to load developed bots",
			() =>
				db
					.select({
						id: bot.id,
						name: bot.name,
						icon: bot.icon,
						description: bot.description,
						tags: bot.tags,
						servers: bot.servers,
						verified: bot.verified,
						status: bot.status,
					})
					.from(botDevelopers)
					.innerJoin(bot, eq(botDevelopers.a, bot.id))
					.where(eq(botDevelopers.b, id)),
		);

		const developedBotIds = developedBotsRaw.map((item) => item.id);

		const developerRows =
			developedBotIds.length === 0
				? []
				: yield* dbEffect("Failed to load bot developers", () =>
						db
							.select({
								botId: botDevelopers.a,
								id: user.id,
								username: user.username,
								name: user.name,
								avatar: user.avatar,
							})
							.from(botDevelopers)
							.innerJoin(user, eq(botDevelopers.b, user.id))
							.where(inArray(botDevelopers.a, developedBotIds)),
					);

		const developersByBotId = new Map<string, UserDeveloperSummary[]>();
		for (const developer of developerRows) {
			const entries = developersByBotId.get(developer.botId) ?? [];
			entries.push({
				id: developer.id,
				username: developer.username,
				name: developer.name,
				avatar: developer.avatar,
			});
			developersByBotId.set(developer.botId, entries);
		}

		return {
			developedBots: developedBotsRaw.map((item) => ({
				...toBotSummary(item),
				developers: developersByBotId.get(item.id) ?? [],
			})),
		};
	});
}
export function getUserFavoritesEffect(id: string) {
	return Effect.gen(function* () {
		if (!id) return { favoriteServers: [], favoriteBots: [] };

		const [favoriteServersRaw, favoriteBotsRaw] = yield* Effect.all([
			dbEffect("Failed to load favorite servers", () =>
				db
					.select({
						id: server.id,
						name: server.name,
						icon: server.icon,
						description: server.description,
						tags: server.tags,
						members: server.members,
						ownerId: server.ownerId,
					})
					.from(userFavoriteServers)
					.innerJoin(server, eq(userFavoriteServers.a, server.id))
					.where(eq(userFavoriteServers.b, id)),
			),
			dbEffect("Failed to load favorite bots", () =>
				db
					.select({
						id: bot.id,
						name: bot.name,
						icon: bot.icon,
						description: bot.description,
						tags: bot.tags,
						servers: bot.servers,
						verified: bot.verified,
						status: bot.status,
					})
					.from(userFavoriteBots)
					.innerJoin(bot, eq(userFavoriteBots.a, bot.id))
					.where(eq(userFavoriteBots.b, id)),
			),
		]);

		return {
			favoriteServers: favoriteServersRaw.map(toServerSummary),
			favoriteBots: favoriteBotsRaw.map(toBotSummary),
		};
	});
}

export function getUserSettingsEffect(id: string) {
	return Effect.gen(function* () {
		// 1. 如果連 id 都沒有，這通常是前端傳參錯誤，直接拋錯
		if (!id) {
			return yield* Effect.fail(new Error("User ID is required"));
		}

		const settingsData = yield* dbEffect("Failed to load user settings", () =>
			db.query.user.findFirst({
				where: eq(user.id, id),
				columns: {
					id: true,
					username: true,
					name: true,
					bio: true,
					social: true,
				},
			}),
		);

		// 2. 如果資料庫找不到該使用者，也是直接拋錯
		if (!settingsData) {
			return yield* Effect.fail(
				new Error(`User settings not found for ID: ${id}`),
			);
		}

		// 這裡回傳的型態就絕對不會有 null 了！
		return {
			...settingsData,
			social: normalizeSocial(settingsData.social),
		};
	});
}

export function getUserByIdOrNameEffect(
	query: string,
): Effect.Effect<DevUser[], Error> {
	// 💡 將回傳型別從 DevUser | null 改為 DevUser[]
	return Effect.gen(function* () {
		if (!query) return []; // 💡 找不到時回傳空陣列

		const whereClause = or(
			eq(user.id, query),
			ilike(user.username, `%${query}%`),
			ilike(user.name, `%${query}%`),
		);

		const currentUsers = yield* dbEffect("Failed to load users", () =>
			db.query.user.findMany({
				// 💡 從 findFirst 改為 findMany
				where: whereClause,
				limit: 5,
				/* ...columns */
			}),
		);

		return currentUsers ?? [];
	});
}

function getUserByIdEffect(
	id: string,
): Effect.Effect<UserDetail | null, Error> {
	return Effect.gen(function* () {
		if (!id) return null;

		const currentUser = yield* dbEffect("Failed to load user", () =>
			db.query.user.findFirst({
				where: eq(user.id, id),
				columns: {
					id: true,
					username: true,
					name: true,
					avatar: true,
					banner: true,
					bannerColor: true,
					bio: true,
					social: true,
					createdAt: true,
				},
			}),
		);

		if (!currentUser) return null;

		const [
			favoriteServersRaw,
			favoriteBotsRaw,
			ownedServersRaw,
			adminInRaw,
			developedBotsRaw,
		] = yield* Effect.all([
			dbEffect("Failed to load favorite servers", () =>
				db
					.select({
						id: server.id,
						name: server.name,
						icon: server.icon,
						description: server.description,

						tags: server.tags,
						members: server.members,
						ownerId: server.ownerId,
					})
					.from(userFavoriteServers)
					.innerJoin(server, eq(userFavoriteServers.a, server.id))
					.where(eq(userFavoriteServers.b, id)),
			),
			dbEffect("Failed to load favorite bots", () =>
				db
					.select({
						id: bot.id,
						name: bot.name,
						icon: bot.icon,
						description: bot.description,
						tags: bot.tags,
						servers: bot.servers,
						verified: bot.verified,
						status: bot.status,
					})
					.from(userFavoriteBots)
					.innerJoin(bot, eq(userFavoriteBots.a, bot.id))
					.where(eq(userFavoriteBots.b, id)),
			),
			dbEffect("Failed to load owned servers", () =>
				db
					.select({
						id: server.id,
						name: server.name,
						icon: server.icon,
						description: server.description,
						tags: server.tags,
						members: server.members,
						ownerId: server.ownerId,
					})
					.from(server)
					.where(eq(server.ownerId, id)),
			),
			dbEffect("Failed to load admin servers", () =>
				db
					.select({
						id: server.id,
						name: server.name,
						icon: server.icon,
						description: server.description,
						tags: server.tags,
						members: server.members,
						ownerId: server.ownerId,
					})
					.from(serverAdmins)
					.innerJoin(server, eq(serverAdmins.a, server.id))
					.where(eq(serverAdmins.b, id)),
			),
			dbEffect("Failed to load developed bots", () =>
				db
					.select({
						id: bot.id,
						name: bot.name,
						icon: bot.icon,
						description: bot.description,
						tags: bot.tags,
						servers: bot.servers,
						verified: bot.verified,
						status: bot.status,
					})
					.from(botDevelopers)
					.innerJoin(bot, eq(botDevelopers.a, bot.id))
					.where(eq(botDevelopers.b, id)),
			),
		]);

		const developedBotIds = developedBotsRaw.map((item) => item.id);

		const developerRows =
			developedBotIds.length === 0
				? []
				: yield* dbEffect("Failed to load bot developers", () =>
						db
							.select({
								botId: botDevelopers.a,
								id: user.id,
								username: user.username,
								name: user.name,
								avatar: user.avatar,
							})
							.from(botDevelopers)
							.innerJoin(user, eq(botDevelopers.b, user.id))
							.where(inArray(botDevelopers.a, developedBotIds)),
					);

		const developersByBotId = new Map<string, UserDeveloperSummary[]>();
		for (const developer of developerRows) {
			const entries = developersByBotId.get(developer.botId) ?? [];
			entries.push({
				id: developer.id,
				username: developer.username,
				name: developer.name,
				avatar: developer.avatar,
			});
			developersByBotId.set(developer.botId, entries);
		}

		return {
			id: currentUser.id,
			username: currentUser.username,
			name: currentUser.name,
			avatar: currentUser.avatar,
			banner: currentUser.banner,
			bannerColor: currentUser.bannerColor,
			bio: currentUser.bio,
			social: normalizeSocial(currentUser.social),
			joinedAt: currentUser.createdAt,
			favoriteServers: favoriteServersRaw.map(toServerSummary),
			favoriteBots: favoriteBotsRaw.map(toBotSummary),
			ownedServers: ownedServersRaw.map(toServerSummary),
			developedBots: developedBotsRaw.map((item) => ({
				...toBotSummary(item),
				developers: developersByBotId.get(item.id) ?? [],
			})),
			adminIn: adminInRaw.map(toServerSummary),
		};
	});
}

function upsertUserFromSessionEffect(
	profile: JWTDiscordProfile,
): Effect.Effect<UserDetail | null, Error> {
	return Effect.gen(function* () {
		if (!profile?.id) return null;

		const nextUsername = profile.name ?? profile.username ?? "";
		const nextAvatar = profile.image_url ?? getFallbackAvatar();
		const nextBanner = profile.banner_url ?? null;
		const nextBannerColor = profile.banner_color ?? null;

		const existingUser = yield* dbEffect("Failed to load existing user", () =>
			db.query.user.findFirst({
				where: eq(user.id, profile.id),
			}),
		);

		if (
			existingUser &&
			existingUser.username === nextUsername &&
			existingUser.avatar === nextAvatar &&
			existingUser.banner === nextBanner &&
			existingUser.bannerColor === nextBannerColor
		) {
			return yield* getUserByIdEffect(profile.id);
		}

		yield* dbEffect("Failed to upsert user", () =>
			db
				.insert(user)
				.values({
					id: profile.id,
					name: profile.name || profile.username || "未知使用者",
					email: profile.email,
					username: nextUsername,
					avatar: nextAvatar,
					banner: nextBanner,
					bannerColor: nextBannerColor,
				})
				.onConflictDoUpdate({
					target: user.id,
					set: {
						username: nextUsername,
						avatar: nextAvatar,
						banner: nextBanner,
						bannerColor: nextBannerColor,
					},
				}),
		);

		return yield* getUserByIdEffect(profile.id);
	});
}

function getCurrentUserEffect(
	discordId?: string,
): Effect.Effect<UserDetail | null, Error> {
	return Effect.gen(function* () {
		if (!discordId) return null;
		const domainUser = yield* dbEffect("Failed to resolve domain user", () =>
			getDomainUser(discordId),
		);

		if (!domainUser?.discordId) return null;
		return yield* getUserByIdEffect(domainUser.discordId);
	});
}

export function getUserById(id: string): Promise<UserDetail | null> {
	return runEffect(getUserByIdEffect(id));
}

export function getUserBySession(
	session: LegacyCompatibleSession,
): Promise<UserDetail | null> {
	const userId =
		session?.discordProfile?.id ??
		session?.user?.discordId ??
		session?.user?.id ??
		null;

	if (!userId) return Promise.resolve(null);
	return getUserById(userId);
}

export function upsertUserFromSession(
	profile: JWTDiscordProfile,
): Promise<UserDetail | null> {
	return runEffect(upsertUserFromSessionEffect(profile));
}

export function getCurrentUser(discordId?: string): Promise<UserDetail | null> {
	return runEffect(getCurrentUserEffect(discordId));
}

export function updateUserSettingsForCurrentUser(
	input: UpdateUserSettingsInput,
	userId: string,
): Promise<UpdateState> {
	return runEffect(
		Effect.gen(function* () {
			const currentUser = yield* dbEffect("Failed to load user settings", () =>
				db.query.user.findFirst({
					where: eq(user.id, userId),
					columns: {
						bio: true,
						social: true,
					},
				}),
			);

			if (!currentUser) return { error: "找不到使用者" };

			const bio = input.bio;
			const nextSocial = input.social;
			const currentSocial = normalizeSocial(currentUser.social);

			const updateData: {
				bio?: string;
				social?: Record<string, string>;
			} = {};

			if ((currentUser.bio ?? "") !== bio) {
				updateData.bio = bio;
			}

			const changedSocial: Record<string, string> = {};
			for (const key in nextSocial) {
				const oldValue = currentSocial[key] ?? "";
				if (nextSocial[key] !== oldValue) {
					changedSocial[key] = nextSocial[key];
				}
			}

			if (Object.keys(changedSocial).length > 0) {
				updateData.social = {
					...currentSocial,
					...changedSocial,
				};
			}

			if (Object.keys(updateData).length === 0) {
				return { success: "沒有任何變更" };
			}

			yield* dbEffect("Failed to update user settings", () =>
				db.update(user).set(updateData).where(eq(user.id, userId)),
			);

			return { success: "已成功儲存" };
		}).pipe(
			Effect.catchAll((error) =>
				Effect.sync(() => {
					console.error(error);
					return { error: "儲存失敗" };
				}),
			),
		),
	);
}

export function toggleFavoriteForCurrentUser(
	input: ToggleFavoriteParams,
	userId: string,
): Promise<ToggleFavoriteResult> {
	return runEffect(
		Effect.gen(function* () {
			if (input.target === "server") {
				const exists = yield* dbEffect("Failed to check server favorite", () =>
					db.query.userFavoriteServers.findFirst({
						where: and(
							eq(userFavoriteServers.a, input.id),
							eq(userFavoriteServers.b, userId),
						),
						columns: { a: true },
					}),
				);

				if (exists) {
					yield* dbEffect("Failed to remove server favorite", () =>
						db
							.delete(userFavoriteServers)
							.where(
								and(
									eq(userFavoriteServers.a, input.id),
									eq(userFavoriteServers.b, userId),
								),
							),
					);

					return {
						target: input.target,
						id: input.id,
						favorited: false,
					};
				}

				yield* dbEffect("Failed to add server favorite", () =>
					db.insert(userFavoriteServers).values({
						a: input.id,
						b: userId,
					}),
				);

				return {
					target: input.target,
					id: input.id,
					favorited: true,
				};
			}

			const exists = yield* dbEffect("Failed to check bot favorite", () =>
				db.query.userFavoriteBots.findFirst({
					where: and(
						eq(userFavoriteBots.a, input.id),
						eq(userFavoriteBots.b, userId),
					),
					columns: { a: true },
				}),
			);

			if (exists) {
				yield* dbEffect("Failed to remove bot favorite", () =>
					db
						.delete(userFavoriteBots)
						.where(
							and(
								eq(userFavoriteBots.a, input.id),
								eq(userFavoriteBots.b, userId),
							),
						),
				);

				return {
					target: input.target,
					id: input.id,
					favorited: false,
				};
			}

			yield* dbEffect("Failed to add bot favorite", () =>
				db.insert(userFavoriteBots).values({
					a: input.id,
					b: userId,
				}),
			);

			return {
				target: input.target,
				id: input.id,
				favorited: true,
			};
		}),
	);
}

export function createOrRegenerateApiTokenForCurrentUser(
	userId: string,
): Promise<ApiTokenPair> {
	return runEffect(
		Effect.gen(function* () {
			const tokens = yield* dbEffect(
				"Failed to sign API JWT tokens",
				async () => {
					const [accessToken, refreshToken] = await Promise.all([
						createJwtForUser(userId, "access"),
						createJwtForUser(userId, "refresh"),
					]);

					return {
						accessToken,
						refreshToken,
					} satisfies ApiTokenPair;
				},
			);

			yield* dbEffect("Failed to create API token", () =>
				db
					.insert(apiToken)
					.values({
						userId,
						accessToken: tokens.accessToken,
						refreshToken: tokens.refreshToken,
					})
					.onConflictDoUpdate({
						target: apiToken.userId,
						set: {
							accessToken: tokens.accessToken,
							refreshToken: tokens.refreshToken,
						},
					}),
			);

			return tokens;
		}),
	);
}

function verifyStoredApiJwtEffect(
	token: string,
	type: ApiJwtTokenType,
): Effect.Effect<{ userId: string }, Error> {
	return Effect.gen(function* () {
		const claims = yield* dbEffect("Failed to verify JWT", () =>
			verifyJwtAndDecodeClaims(token, type),
		);

		const stored = yield* dbEffect("Failed to read stored API token", () =>
			db.query.apiToken.findFirst({
				where: eq(apiToken.userId, claims.sub),
				columns: {
					accessToken: true,
					refreshToken: true,
				},
			}),
		);

		if (!stored) {
			return yield* Effect.fail(new Error("Token not found"));
		}

		const expected =
			type === "access" ? stored.accessToken : stored.refreshToken;
		if (expected !== token) {
			return yield* Effect.fail(new Error("Token has been rotated or revoked"));
		}

		return { userId: claims.sub };
	});
}

export function verifyAccessToken(token: string): Promise<{ userId: string }> {
	return runEffect(verifyStoredApiJwtEffect(token, "access"));
}

export function verifyRefreshToken(token: string): Promise<{ userId: string }> {
	return runEffect(verifyStoredApiJwtEffect(token, "refresh"));
}
