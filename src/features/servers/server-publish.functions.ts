import { createServerFn } from "@tanstack/react-start";
import { protectedMiddleware } from "#/lib/auth-middleware";
import { effectInputValidator } from "#/lib/effect-utils";
import {
	ServerBannerUploadSchema,
	ServerPublishInputSchema,
	ServerPublishSubmitSchema,
} from "./server-publish.schemas";
import {
	checkIsServerOwner,
	getServerPublishBundleById,
	uploadServerBanner,
	upsertServerPublish,
} from "./server-publish.server";

async function enforceServerOwner(serverId: string, userId: string) {
	const isOwner = await checkIsServerOwner(serverId, userId);
	if (!isOwner) {
		throw new Error("Forbidden: You are not the owner of this server");
	}
}

export const getServerPublishBundleFn = createServerFn({ method: "GET" })
	.middleware([protectedMiddleware])
	.inputValidator(effectInputValidator(ServerPublishInputSchema))
	.handler(async ({ data, context }) => {
		await enforceServerOwner(data.serverId, context.user?.discordId ?? null);
		return getServerPublishBundleById(data.serverId);
	});

export const upsertServerPublishFn = createServerFn({ method: "POST" })
	.middleware([protectedMiddleware])
	.inputValidator(effectInputValidator(ServerPublishSubmitSchema))
	.handler(async ({ data, context }) => {
		await enforceServerOwner(data.serverId, context.user?.discordId ?? null);
		return upsertServerPublish(data);
	});

export const uploadServerBannerFn = createServerFn({ method: "POST" })
	.middleware([protectedMiddleware])
	.inputValidator(effectInputValidator(ServerBannerUploadSchema))
	.handler(async ({ data, context }) => {
		await enforceServerOwner(data.serverId, context.user.discordId);
		return uploadServerBanner(data);
	});
