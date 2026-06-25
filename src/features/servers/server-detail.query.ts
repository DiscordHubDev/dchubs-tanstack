import { queryOptions } from "@tanstack/react-query";
import { runEffect, tryEffectPromise } from "#/lib/effect-utils";
import { queryKeys } from "#/lib/query-keys";
import { getServerDetailFn } from "./server-detail.functions";
import type { ServerDetail } from "./server-detail.types";

export function serverDetailQueryOptions(serverId: string) {
  return queryOptions<ServerDetail | null>({
    queryKey: queryKeys.servers.detail(serverId),
    queryFn: () =>
      runEffect(
        tryEffectPromise("Failed to fetch server detail", () =>
          getServerDetailFn({ data: { serverId } }),
        ),
      ),
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}
