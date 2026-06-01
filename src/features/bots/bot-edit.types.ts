import type { BotFormData } from "./bot-form-schema";

export type BotEditDefaults = Partial<BotFormData> & {
	screenshots?: string[];
	banner?: string | null;
};

export type BotEditBundle = {
	botId: string;
	defaults: BotEditDefaults;
};

export type BotEditResult =
	| { status: "ok"; bundle: BotEditBundle }
	| { status: "forbidden" }
	| { status: "not_found" };
