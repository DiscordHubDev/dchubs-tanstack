ALTER TABLE "Server" ALTER COLUMN "ownerId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Bot" ADD COLUMN "nsfw" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "Server" ADD COLUMN "nsfw" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "Bot_nsfw_idx" ON "Bot" USING btree ("nsfw" bool_ops);--> statement-breakpoint
CREATE INDEX "Server_nsfw_idx" ON "Server" USING btree ("nsfw" bool_ops);