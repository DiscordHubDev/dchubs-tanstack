import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "#/lib/auth-middleware";
import { effectInputValidator } from "#/lib/effect-utils";
import { DeleteServerInputSchema, ServerListInputSchema } from "./servers.schemas";
import { deleteServer, listServerFilterBundle, listServersPage } from "./servers.server";
import type { DiscordWidgetData } from "./servers.types";
import { bumpCacheVersion } from "#/lib/redis";

export const getServersListFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .inputValidator(effectInputValidator(ServerListInputSchema))
  .handler(async ({ data, context }) => {
    return listServersPage(data, context.user?.discordId, context.user?.nsfw);
  });

export const getServerFilterBundleFn = createServerFn({
  method: "GET",
})
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return listServerFilterBundle(context.user?.discordId, context.user?.nsfw);
  });

export const deleteServerFn = createServerFn({
  method: "POST",
})
  .middleware([authMiddleware])
  .inputValidator(effectInputValidator(DeleteServerInputSchema))
  .handler(async ({ data, context }) => {
    const userId = context.user?.betterAuthId;

    if (!userId) {
      throw new Error("UNAUTHORIZED");
    }

    const result = await deleteServer(data.serverId, userId);

    await bumpCacheVersion("servers");

    if (!result.success) {
      // 直接將 reason 丟給前端處理
      throw new Error(result.reason);
    }
  });

export const getDiscordWidget = createServerFn({ method: "GET" })
  .inputValidator((input: { guildId: string }) => input)
  .handler(async ({ data: { guildId } }): Promise<DiscordWidgetData> => {
    const response = await fetch(`https://discord.com/api/guilds/${guildId}/widget.json`);

    if (!response.ok) {
      throw new Error("Failed to fetch widget");
    }

    return response.json();
  });
