import { createServerFn } from "@tanstack/react-start";
import { effectInputValidator } from "#/lib/effect-utils";
import {
	ServerBannerUploadSchema,
	ServerPublishInputSchema,
	ServerPublishSubmitSchema,
} from "./server-publish.schemas";
import {
	getServerPublishBundleById,
	uploadServerBanner,
	upsertServerPublish,
} from "./server-publish.server";

export const getServerPublishBundleFn = createServerFn({ method: "GET" })
	.inputValidator(effectInputValidator(ServerPublishInputSchema))
	.handler(async ({ data }) => {
		return getServerPublishBundleById(data.serverId);
	});

export const upsertServerPublishFn = createServerFn({ method: "POST" })
	.inputValidator(effectInputValidator(ServerPublishSubmitSchema))
	.handler(async ({ data }) => {
		return upsertServerPublish(data);
	});

export const uploadServerBannerFn = createServerFn({ method: "POST" })
	.inputValidator(effectInputValidator(ServerBannerUploadSchema))
	.handler(async ({ data }) => {
		return uploadServerBanner(data);
	});
