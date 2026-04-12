import { createServerFn } from "@tanstack/react-start";
import { effectInputValidator } from "#/lib/effect-utils";
import {
	ServerPublishInputSchema,
	ServerPublishSubmitSchema,
} from "./server-publish.schemas";
import {
	getServerPublishBundleById,
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
