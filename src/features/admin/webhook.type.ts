import type { Schema } from "effect";
import type { WebhookPayloadSchema } from "./webhook.schema";

export type WebhookPayload = Schema.Schema.Type<typeof WebhookPayloadSchema>;
