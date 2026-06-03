DROP INDEX "auth_user_discordId_idx";--> statement-breakpoint
DROP INDEX "auth_user_discordId_key";--> statement-breakpoint
DROP INDEX "auth_user_email_key";--> statement-breakpoint
ALTER TABLE "auth_user" ALTER COLUMN "discordId" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_user_discordId_key" ON "auth_user" USING btree ("discordId");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_user_email_key" ON "auth_user" USING btree ("email");