import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "#/lib/auth-middleware";
import { effectInputValidator } from "#/lib/effect-utils";
import {
	DeleteServerInputSchema,
	ServerListInputSchema,
} from "./servers.schemas";
import {
	deleteServer,
	listServerFilterBundle,
	listServersPage,
} from "./servers.server";

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
	.handler(async ({ data }) => {
		await deleteServer(data.serverId);
	});
