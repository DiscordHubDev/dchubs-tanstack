// admin.types.ts
import type { Schema } from "effect";
import type {
	BotIdSchema,
	ReviewBotSchema,
	ServerGuildIdSchema,
	UpdateReportSchema,
} from "./admin.schemas";

export type { Bot, DiscordServer, Report } from "@/types/admin";

export type BotIdPayload = Schema.Schema.Type<typeof BotIdSchema>;
export type ServerGuildIdPayload = Schema.Schema.Type<
	typeof ServerGuildIdSchema
>;
export type ReviewBotPayload = Schema.Schema.Type<typeof ReviewBotSchema>;
export type UpdateReportPayload = Schema.Schema.Type<typeof UpdateReportSchema>;

export type ActionResult<T = void> =
	| { success: true; data: T }
	| { success: false; error: string };
