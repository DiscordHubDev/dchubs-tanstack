import { queryOptions } from "@tanstack/react-query";
import { runEffect, tryEffectPromise } from "#/lib/effect-utils";
import { queryKeys } from "#/lib/query-keys";
import { getBotEditBundleFn } from "./bot-edit.functions";
import type { BotEditResult } from "./bot-edit.types";

export function botEditQueryOptions(botId: string) {
  return queryOptions<BotEditResult>({
    queryKey: queryKeys.bots.edit(botId),
    queryFn: () =>
      runEffect(
        tryEffectPromise("Failed to fetch bot edit bundle", () =>
          getBotEditBundleFn({ data: { botId } }),
        ),
      ),
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}
