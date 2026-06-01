import { createServerFn } from "@tanstack/react-start";
import { effectInputValidator } from "#/lib/effect-utils";
import {
	DeleteBotImageInputSchema,
	SendPendingWebhookSchema,
	SubmitBotInputSchema,
	UploadBotImagesInputSchema,
} from "./bot-submit.schemas";
import {
	deleteBotImage,
	sendPendingWebhook,
	submitBot,
	uploadBotImages,
} from "./bot-submit.server";
import type {
	DeleteBotImageResult,
	SendPendingWebhookResult,
	SubmitBotResult,
	UploadBotImagesResult,
} from "./bot-submit.types";

export const submitBotFn = createServerFn({ method: "POST" })
	.inputValidator(effectInputValidator(SubmitBotInputSchema))
	.handler(async ({ data }): Promise<SubmitBotResult> => {
		return submitBot(data);
	});

export const uploadBotImagesFn = createServerFn({ method: "POST" })
	.inputValidator(effectInputValidator(UploadBotImagesInputSchema))
	.handler(async ({ data }): Promise<UploadBotImagesResult> => {
		return uploadBotImages(data);
	});

export const deleteBotImageFn = createServerFn({ method: "POST" })
	.inputValidator(effectInputValidator(DeleteBotImageInputSchema))
	.handler(async ({ data }): Promise<DeleteBotImageResult> => {
		return deleteBotImage(data);
	});

export const sendPendingWebhookFn = createServerFn({ method: "POST" })
	.inputValidator(effectInputValidator(SendPendingWebhookSchema))
	.handler(async ({ data }): Promise<SendPendingWebhookResult> => {
		return sendPendingWebhook(data);
	});
