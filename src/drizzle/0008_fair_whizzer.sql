
ALTER TABLE "User" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "User" CASCADE;--> statement-breakpoint
ALTER TABLE "ApiKey" DROP CONSTRAINT IF EXISTS "ApiKey_userId_fkey";
--> statement-breakpoint
ALTER TABLE "Bot" DROP CONSTRAINT IF EXISTS "Bot_handledById_fkey";
--> statement-breakpoint
ALTER TABLE "_BotDevelopers" DROP CONSTRAINT IF EXISTS "_BotDevelopers_B_fkey";
--> statement-breakpoint
ALTER TABLE "Report" DROP CONSTRAINT IF EXISTS "Report_handledById_fkey";
--> statement-breakpoint
ALTER TABLE "Report" DROP CONSTRAINT IF EXISTS "Report_reportedById_fkey";
--> statement-breakpoint
ALTER TABLE "Server" DROP CONSTRAINT IF EXISTS "Server_ownerId_fkey";
--> statement-breakpoint
ALTER TABLE "_ServerAdmins" DROP CONSTRAINT IF EXISTS "_ServerAdmins_B_fkey";
--> statement-breakpoint
ALTER TABLE "_UserFavoriteBots" DROP CONSTRAINT IF EXISTS "_UserFavoriteBots_B_fkey";
--> statement-breakpoint
ALTER TABLE "_UserFavoriteServers" DROP CONSTRAINT IF EXISTS "_UserFavoriteServers_B_fkey";
--> statement-breakpoint
ALTER TABLE "Vote" DROP CONSTRAINT IF EXISTS "Vote_userId_fkey";
--> statement-breakpoint
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Bot" ADD CONSTRAINT "Bot_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "_BotDevelopers" ADD CONSTRAINT "_BotDevelopers_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Report" ADD CONSTRAINT "Report_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Report" ADD CONSTRAINT "Report_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "public"."auth_user"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Server" ADD CONSTRAINT "Server_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "_ServerAdmins" ADD CONSTRAINT "_ServerAdmins_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "_UserFavoriteBots" ADD CONSTRAINT "_UserFavoriteBots_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "_UserFavoriteServers" ADD CONSTRAINT "_UserFavoriteServers_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."auth_user"("id") ON DELETE restrict ON UPDATE cascade;