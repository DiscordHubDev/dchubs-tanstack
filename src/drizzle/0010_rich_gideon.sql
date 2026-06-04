CREATE UNIQUE INDEX "auth_user_discord_id_unique_idx" ON "auth_user" USING btree ("discord_id");--> statement-breakpoint
CREATE INDEX "auth_user_username_idx" ON "auth_user" USING btree ("username");