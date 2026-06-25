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

const DiscordRateLimitPayloadSchema = Schema.Struct({
  retry_after: Schema.optional(Schema.Number),
  global: Schema.optional(Schema.Boolean),
  message: Schema.optional(Schema.String),
});

type DiscordRateLimitPayload = Schema.Schema.Type<typeof DiscordRateLimitPayloadSchema>;

const decodeRateLimitPayload = Schema.decodeUnknownSync(DiscordRateLimitPayloadSchema);

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

function parseRateLimitPayload(bodyText: string): DiscordRateLimitPayload | null {
  if (!bodyText) {
    return null;
  }

  try {
    // 1. 先將字串轉為 unknown 的 JSON 物件
    const rawJson = JSON.parse(bodyText);

    // 2. 透過 Effect Schema 安全地驗證與解析
    // 如果 rawJson 不符合格式，這裡會拋出 Error 並進入 catch 區塊
    return decodeRateLimitPayload(rawJson);
  } catch {
    // 無論是 JSON.parse 失敗，還是 Schema 校驗失敗，都安全地回傳 null
    return null;
  }
}

function getRetryDelayMs(response: Response, bodyText: string): number {
  const payload = parseRateLimitPayload(bodyText);
  if (typeof payload?.retry_after === "number" && Number.isFinite(payload.retry_after)) {
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
        // 這裡可以繼續利用你寫好的 toErrorMessage 工具
        throw new Error(`Failed to parse Discord guild payload: ${toErrorMessage(error)}`, {
          cause: error,
        });
      }

      return rawGuilds.map(mapRawGuildToDiscordGuild);
    }

    // 因為使用的是原生 fetch，所以失敗時可以順利取得 text 和 status
    const bodyText = await response.text();
    const isRateLimited = response.status === 429;

    if (isRateLimited && attempt < MAX_RATE_LIMIT_RETRIES) {
      const retryDelayMs = getRetryDelayMs(response, bodyText);
      await sleep(retryDelayMs + 100);
      continue; // 繼續下一次迴圈重試
    }

    if (isRateLimited) {
      throw new Error(
        `Discord API request failed (429) after ${MAX_RATE_LIMIT_RETRIES + 1} attempts: ${bodyText || "No response body"}`,
        { cause: new Error(`Rate limited after ${MAX_RATE_LIMIT_RETRIES + 1} attempts`) },
      );
    }

    throw new Error(
      `Discord API request failed (${response.status}): ${bodyText || "No response body"}`,
    );
  }

  throw new Error("Discord API request failed: exhausted retries");
}
