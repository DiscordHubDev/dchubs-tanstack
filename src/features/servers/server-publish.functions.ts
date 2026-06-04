import { createServerFn } from "@tanstack/react-start";
import { Effect } from "effect";
import { protectedMiddleware } from "#/lib/auth-middleware";
import { effectInputValidator } from "#/lib/effect-utils";
import {
	ServerBannerUploadSchema,
	ServerPublishInputSchema,
	ServerPublishSubmitSchema,
} from "./server-publish.schemas";
import {
	enforceServerOwner,
	getServerPublishBundleById,
	uploadServerBanner,
	upsertServerPublish,
} from "./server-publish.server";

export const getServerPublishBundleFn = createServerFn({ method: "GET" })
	.middleware([protectedMiddleware])
	.inputValidator(effectInputValidator(ServerPublishInputSchema))
	.handler(async ({ data, context }) => {
		return getServerPublishBundleById(context.user.discordId, data.serverId);
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
