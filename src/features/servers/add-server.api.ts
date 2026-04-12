import { Schema } from "effect";
import { toErrorMessage } from "#/lib/effect-utils";
import { RawDiscordGuildListSchema } from "./add-server.schemas";
import type { DiscordGuild } from "./add-server.types";

const decodeRawGuildList = Schema.decodeUnknownSync(RawDiscordGuildListSchema);
const DISCORD_GUILDS_ENDPOINT = "https://discord.com/api/v10/users/@me/guilds";
const MAX_RATE_LIMIT_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 10_000;

type DiscordTokenType = "Bearer" | "Bot";

type FetchDiscordGuildsInput = {
	token: string;
	tokenType: DiscordTokenType;
};

type DiscordRateLimitPayload = {
	retry_after?: number;
	global?: boolean;
	message?: string;
};

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function clampRetryDelay(ms: number): number {
	if (!Number.isFinite(ms) || ms <= 0) {
		return DEFAULT_RETRY_DELAY_MS;
	}

	return Math.min(Math.max(ms, 100), MAX_RETRY_DELAY_MS);
}

function parseRateLimitPayload(
	bodyText: string,
): DiscordRateLimitPayload | null {
	if (!bodyText) {
		return null;
	}

	try {
		return JSON.parse(bodyText) as DiscordRateLimitPayload;
	} catch {
		return null;
	}
}

function getRetryDelayMs(response: Response, bodyText: string): number {
	const payload = parseRateLimitPayload(bodyText);
	if (
		typeof payload?.retry_after === "number" &&
		Number.isFinite(payload.retry_after)
	) {
		return clampRetryDelay(payload.retry_after * 1000);
	}

	const retryAfterHeader = response.headers.get("retry-after");
	if (retryAfterHeader) {
		const parsed = Number.parseFloat(retryAfterHeader);
		if (Number.isFinite(parsed)) {
			return clampRetryDelay(parsed * 1000);
		}
	}

	return DEFAULT_RETRY_DELAY_MS;
}

function mapRawGuildToDiscordGuild(raw: {
	id: string;
	name: string;
	icon: string | null;
	owner?: boolean;
	permissions?: string;
}): DiscordGuild {
	return {
		id: raw.id,
		name: raw.name,
		icon: raw.icon,
		owner: raw.owner ?? false,
		permissions: raw.permissions ?? "0",
		isPublished: false,
	};
}

export async function fetchDiscordGuilds({
	token,
	tokenType,
}: FetchDiscordGuildsInput): Promise<DiscordGuild[]> {
	if (!token) {
		throw new Error("Missing Discord token.");
	}

	for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt += 1) {
		const response = await fetch(DISCORD_GUILDS_ENDPOINT, {
			headers: {
				Authorization: `${tokenType} ${token}`,
			},
		});

		if (response.ok) {
			const payload = await response.json();

			let rawGuilds: ReadonlyArray<{
				id: string;
				name: string;
				icon: string | null;
				owner?: boolean;
				permissions?: string;
			}>;

			try {
				rawGuilds = decodeRawGuildList(payload);
			} catch (error) {
				throw new Error(
					`Failed to parse Discord guild payload: ${toErrorMessage(error)}`,
				);
			}

			return rawGuilds.map(mapRawGuildToDiscordGuild);
		}

		const bodyText = await response.text();
		const isRateLimited = response.status === 429;

		if (isRateLimited && attempt < MAX_RATE_LIMIT_RETRIES) {
			const retryDelayMs = getRetryDelayMs(response, bodyText);
			await sleep(retryDelayMs + 100);
			continue;
		}

		if (isRateLimited) {
			throw new Error(
				`Discord API request failed (429) after ${MAX_RATE_LIMIT_RETRIES + 1} attempts: ${bodyText || "No response body"}`,
			);
		}

		throw new Error(
			`Discord API request failed (${response.status}): ${bodyText || "No response body"}`,
		);
	}

	throw new Error("Discord API request failed: exhausted retries");
}
