import type { Schema } from "effect";
import type { Screenshot } from "#/lib/types";
import type { DiscordBotRPCInfoSchema } from "./bot-submit.schemas";

export type SubmitBotErrorPayload = {
	tag: string;
	message: string;
	status?: number;
	id?: string;
	url?: string;
	filename?: string;
};

export type SubmitBotResult =
	| { success: true; botId: string }
	| { success: false; error: SubmitBotErrorPayload };

export type UploadBotImagesResult =
	| { success: true; items: Screenshot[] }
	| { success: false; error: SubmitBotErrorPayload };

export type DeleteBotImageResult =
	| { success: true }
	| { success: false; error: SubmitBotErrorPayload };

export type SendPendingWebhookResult =
	| { success: true }
	| { success: false; error: SubmitBotErrorPayload };

export type DiscordBotRPCInfo = Schema.Schema.Type<
	typeof DiscordBotRPCInfoSchema
>;
