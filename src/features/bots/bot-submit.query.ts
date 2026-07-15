// features/bots/bot-query.ts
import { queryOptions } from "@tanstack/react-query";
import { getDiscordBotRPCFn } from "./bot-submit.functions";

export const botInfoQueryOptions = (botId: string | undefined) =>
  queryOptions({
    queryKey: ["bot-info", botId],
    queryFn: () => getDiscordBotRPCFn({ data: { client_id: botId! } }),
    enabled: !!botId && /^\d{17,20}$/.test(botId),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
