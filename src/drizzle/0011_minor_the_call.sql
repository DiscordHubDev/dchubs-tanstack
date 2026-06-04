DROP INDEX "auth_user_discord_id_unique_idx";--> statement-breakpoint
DROP INDEX "auth_user_username_idx";--> statement-breakpoint
ALTER TABLE "auth_user" ADD CONSTRAINT "auth_user_discord_id_unique" UNIQUE("discord_id");