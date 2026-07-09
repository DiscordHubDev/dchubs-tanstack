import { Schema } from "effect";
import { toErrorMessage } from "#/lib/effect-utils";
import { RawDiscordGuildListSchema } from "./add-server.schemas";
import type { DiscordGuild } from "./add-server.types";

const decodeRawGuildList = Schema.decodeUnknownSync(RawDiscordGuildListSchema);
const DISCORD_GUILDS_ENDPOINT = "https://discord.com/api/v10/users/@me/guilds";
const MAX_RATE_LIMIT_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 10_000;
// Discord caps this endpoint at 200 guilds per page (for both bearer and bot tokens).
const GUILDS_PAGE_LIMIT = 200;
// Hard ceiling on pagination loops so a misbehaving API can't cause an infinite loop.
const MAX_PAGES = 100;

type DiscordTokenType = "Bearer" | "Bot";

type FetchDiscordGuildsInput = {
  token: string;
  tokenType: DiscordTokenType;
};

type RawDiscordGuild = {
  id: string;
  name: string;
  icon: string | null;
  owner?: boolean;
  permissions?: string;
  approximate_member_count?: number; // approximate number of members in this guild
  approximate_presence_count?: number; // approximate number of non-offline members
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

function mapRawGuildToDiscordGuild(raw: RawDiscordGuild): DiscordGuild {
  return {
    id: raw.id,
    name: raw.name,
    icon: raw.icon,
    owner: raw.owner ?? false,
    permissions: raw.permissions ?? "0",
    isPublished: false,
    approximateMemberCount: raw.approximate_member_count,
    approximatePresenceCount: raw.approximate_presence_count,
  };
}

function buildGuildsPageUrl(after: string | null): string {
  const url = new URL(DISCORD_GUILDS_ENDPOINT);
  url.searchParams.set("with_counts", "true");
  url.searchParams.set("limit", String(GUILDS_PAGE_LIMIT));
  if (after) {
    url.searchParams.set("after", after);
  }
  return url.toString();
}

/**
 * Fetches a single page of guilds, handling 429 retries.
 * Throws on any non-recoverable error.
 */
async function fetchDiscordGuildsPage({
  token,
  tokenType,
  after,
}: FetchDiscordGuildsInput & { after: string | null }): Promise<ReadonlyArray<RawDiscordGuild>> {
  const endpoint = buildGuildsPageUrl(after);

  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt += 1) {
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `${tokenType} ${token}`,
      },
    });

    if (response.ok) {
      const payload = await response.json();

      try {
        // 這裡可以繼續利用你寫好的 toErrorMessage 工具
        return decodeRawGuildList(payload);
      } catch (error) {
        throw new Error(`Failed to parse Discord guild payload: ${toErrorMessage(error)}`, {
          cause: error,
        });
      }
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

/**
 * Fetches ALL guilds for the given token, transparently paginating past
 * Discord's 200-guild-per-request cap using the `after` cursor.
 *
 * Discord returns guilds sorted by id, so we page forward using the id of
 * the last guild in each page until a page comes back with fewer than
 * GUILDS_PAGE_LIMIT entries (i.e. the last page).
 */
export async function fetchDiscordGuilds({
  token,
  tokenType,
}: FetchDiscordGuildsInput): Promise<DiscordGuild[]> {
  if (!token) {
    throw new Error("Missing Discord token.");
  }

  const allRawGuilds: RawDiscordGuild[] = [];
  let after: string | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const rawGuilds = await fetchDiscordGuildsPage({ token, tokenType, after });

    allRawGuilds.push(...rawGuilds);

    // Fewer than a full page means there's nothing left to fetch.
    if (rawGuilds.length < GUILDS_PAGE_LIMIT) {
      break;
    }

    after = rawGuilds[rawGuilds.length - 1].id;

    if (page === MAX_PAGES - 1) {
      throw new Error(
        `Discord API request failed: exceeded max pagination limit (${MAX_PAGES} pages, ${allRawGuilds.length} guilds fetched so far)`,
      );
    }
  }

  return allRawGuilds.map(mapRawGuildToDiscordGuild);
}
