-- ALTER TABLE "Server" DROP CONSTRAINT "Server_ownerId_fkey";
--> statement-breakpoint
ALTER TABLE "auth_user" ALTER COLUMN "discord_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Server" ADD CONSTRAINT "Server_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."auth_user"("discord_id") ON DELETE set null ON UPDATE cascade;