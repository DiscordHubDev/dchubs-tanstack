import { queryOptions } from "@tanstack/react-query";
import { runEffect, tryEffectPromise } from "#/lib/effect-utils";
import { queryKeys } from "#/lib/query-keys";
import { getBotDetailFn } from "./bot-detail.functions.ts";
import type { BotDetail } from "./bot-detail.types";

export function botDetailQueryOptions(botId: string) {
  return queryOptions<BotDetail | null>({
    queryKey: queryKeys.bots.detail(botId),
    queryFn: () =>
      runEffect(
        tryEffectPromise("Failed to fetch bot detail", () => getBotDetailFn({ data: { botId } })),
      ),
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}
