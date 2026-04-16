CREATE TYPE "public"."EmailPriority" AS ENUM('success', 'info', 'warning', 'danger');
CREATE TYPE "public"."ReportSeverity" AS ENUM('severe', 'moderate', 'low', 'untagged');
CREATE TYPE "public"."ReportStatus" AS ENUM('pending', 'resolved', 'rejected');
CREATE TYPE "public"."ReportType" AS ENUM('bot', 'server');
CREATE TYPE "public"."Status" AS ENUM('pending', 'approved', 'rejected');
CREATE TYPE "public"."VoteType" AS ENUM('server', 'bot');
CREATE TABLE "Administrators" (
	"id" text PRIMARY KEY NOT NULL
);

CREATE TABLE "ApiKey" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"lastUsed" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"expiresAt" timestamp(3)
);

CREATE TABLE "ApiToken" (
	"userId" text PRIMARY KEY NOT NULL,
	"accessToken" text NOT NULL,
	"refreshToken" text NOT NULL
);

CREATE TABLE "auth_account" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"accessTokenExpiresAt" timestamp(3),
	"refreshTokenExpiresAt" timestamp(3),
	"scope" text,
	"idToken" text,
	"password" text,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL
);

CREATE TABLE "auth_session" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"token" text NOT NULL,
	"expiresAt" timestamp(3) NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL
);

CREATE TABLE "auth_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"discordId" text,
	"username" text,
	"avatar" text,
	"banner" text,
	"bannerColor" text,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL
);

CREATE TABLE "auth_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp(3) NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL
);

CREATE TABLE "Bot" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"longDescription" text,
	"tags" text[],
	"servers" integer NOT NULL,
	"users" integer NOT NULL,
	"upvotes" integer NOT NULL,
	"icon" text,
	"banner" text,
	"featured" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"approvedAt" timestamp(3),
	"prefix" text,
	"website" text,
	"inviteUrl" text,
	"supportServer" text,
	"verified" boolean DEFAULT false NOT NULL,
	"status" "Status" DEFAULT 'pending' NOT NULL,
	"features" text[],
	"screenshots" text[],
	"handledAt" timestamp(3),
	"handledById" text,
	"rejectionReason" text,
	"VoteNotificationURL" text,
	"secret" text,
	"isAdmin" boolean DEFAULT false NOT NULL,
	"pin" boolean DEFAULT false NOT NULL,
	"pinExpiry" timestamp(3)
);

CREATE TABLE "BotCommand" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"usage" text NOT NULL,
	"category" text,
	"botId" text NOT NULL
);

CREATE TABLE "_BotDevelopers" (
	"A" text NOT NULL,
	"B" text NOT NULL,
	CONSTRAINT "_BotDevelopers_AB_pkey" PRIMARY KEY("A","B")
);

CREATE TABLE "Notification" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"subject" text NOT NULL,
	"teaser" text NOT NULL,
	"userId" text,
	"priority" "EmailPriority" DEFAULT 'info' NOT NULL,
	"isSystem" boolean DEFAULT false NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"content" text NOT NULL
);

CREATE TABLE "_prisma_migrations" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"checksum" varchar(64) NOT NULL,
	"finished_at" timestamp with time zone,
	"migration_name" varchar(255) NOT NULL,
	"logs" text,
	"rolled_back_at" timestamp with time zone,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_steps_count" integer DEFAULT 0 NOT NULL
);

CREATE TABLE "Report" (
	"id" text PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"content" text NOT NULL,
	"reportedAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"status" "ReportStatus" DEFAULT 'pending' NOT NULL,
	"severity" "ReportSeverity" DEFAULT 'untagged' NOT NULL,
	"type" "ReportType" NOT NULL,
	"itemId" text NOT NULL,
	"itemName" text NOT NULL,
	"reportedById" text NOT NULL,
	"attachments" jsonb NOT NULL,
	"handledAt" timestamp(3),
	"handledById" text,
	"resolutionNote" text
);

CREATE TABLE "Review" (
	"id" text PRIMARY KEY NOT NULL,
	"rating" double precision DEFAULT 0 NOT NULL,
	"vote" integer NOT NULL,
	"comment" text,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"userId" text NOT NULL,
	"botId" text,
	"serverId" text
);

CREATE TABLE "Server" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"longDescription" text,
	"tags" text[],
	"members" integer NOT NULL,
	"online" integer,
	"upvotes" integer NOT NULL,
	"icon" text,
	"banner" text,
	"featured" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"ownerId" text,
	"website" text,
	"inviteUrl" text,
	"rules" text[],
	"features" text[],
	"screenshots" text[],
	"VoteNotificationURL" text,
	"secret" text,
	"pin" boolean DEFAULT false NOT NULL,
	"pinExpiry" timestamp(3)
);

CREATE TABLE "_ServerAdmins" (
	"A" text NOT NULL,
	"B" text NOT NULL,
	CONSTRAINT "_ServerAdmins_AB_pkey" PRIMARY KEY("A","B")
);

CREATE TABLE "User" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"avatar" text NOT NULL,
	"banner" text,
	"banner_color" text,
	"bio" text,
	"joinedAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"social" jsonb
);

CREATE TABLE "_UserFavoriteBots" (
	"A" text NOT NULL,
	"B" text NOT NULL,
	CONSTRAINT "_UserFavoriteBots_AB_pkey" PRIMARY KEY("A","B")
);

CREATE TABLE "_UserFavoriteServers" (
	"A" text NOT NULL,
	"B" text NOT NULL,
	CONSTRAINT "_UserFavoriteServers_AB_pkey" PRIMARY KEY("A","B")
);

CREATE TABLE "Vote" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"itemId" text NOT NULL,
	"itemType" "VoteType" NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;
ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE cascade;
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE cascade;
ALTER TABLE "Bot" ADD CONSTRAINT "Bot_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "public"."User"("id") ON DELETE set null ON UPDATE cascade;
ALTER TABLE "BotCommand" ADD CONSTRAINT "BotCommand_botId_fkey" FOREIGN KEY ("botId") REFERENCES "public"."Bot"("id") ON DELETE cascade ON UPDATE cascade;
ALTER TABLE "_BotDevelopers" ADD CONSTRAINT "_BotDevelopers_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."Bot"("id") ON DELETE cascade ON UPDATE cascade;
ALTER TABLE "_BotDevelopers" ADD CONSTRAINT "_BotDevelopers_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;
ALTER TABLE "Report" ADD CONSTRAINT "Report_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "public"."User"("id") ON DELETE set null ON UPDATE cascade;
ALTER TABLE "Report" ADD CONSTRAINT "Report_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE cascade;
ALTER TABLE "Review" ADD CONSTRAINT "Review_botId_fkey" FOREIGN KEY ("botId") REFERENCES "public"."Bot"("id") ON DELETE set null ON UPDATE cascade;
ALTER TABLE "Review" ADD CONSTRAINT "Review_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "public"."Server"("id") ON DELETE set null ON UPDATE cascade;
ALTER TABLE "Server" ADD CONSTRAINT "Server_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE set null ON UPDATE cascade;
ALTER TABLE "_ServerAdmins" ADD CONSTRAINT "_ServerAdmins_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."Server"("id") ON DELETE cascade ON UPDATE cascade;
ALTER TABLE "_ServerAdmins" ADD CONSTRAINT "_ServerAdmins_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;
ALTER TABLE "_UserFavoriteBots" ADD CONSTRAINT "_UserFavoriteBots_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."Bot"("id") ON DELETE cascade ON UPDATE cascade;
ALTER TABLE "_UserFavoriteBots" ADD CONSTRAINT "_UserFavoriteBots_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;
ALTER TABLE "_UserFavoriteServers" ADD CONSTRAINT "_UserFavoriteServers_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."Server"("id") ON DELETE cascade ON UPDATE cascade;
ALTER TABLE "_UserFavoriteServers" ADD CONSTRAINT "_UserFavoriteServers_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE cascade;
CREATE INDEX "ApiKey_key_idx" ON "ApiKey" USING btree ("key" text_ops);
CREATE UNIQUE INDEX "ApiKey_key_key" ON "ApiKey" USING btree ("key" text_ops);
CREATE INDEX "ApiKey_userId_idx" ON "ApiKey" USING btree ("userId" text_ops);
CREATE UNIQUE INDEX "ApiKey_userId_key" ON "ApiKey" USING btree ("userId" text_ops);
CREATE UNIQUE INDEX "ApiToken_accessToken_key" ON "ApiToken" USING btree ("accessToken" text_ops);
CREATE UNIQUE INDEX "ApiToken_refreshToken_key" ON "ApiToken" USING btree ("refreshToken" text_ops);
CREATE INDEX "auth_account_providerId_accountId_idx" ON "auth_account" USING btree ("providerId" text_ops,"accountId" text_ops);
CREATE UNIQUE INDEX "auth_account_providerId_accountId_key" ON "auth_account" USING btree ("providerId" text_ops,"accountId" text_ops);
CREATE INDEX "auth_account_userId_idx" ON "auth_account" USING btree ("userId" text_ops);
CREATE UNIQUE INDEX "auth_session_token_key" ON "auth_session" USING btree ("token" text_ops);
CREATE INDEX "auth_session_userId_idx" ON "auth_session" USING btree ("userId" text_ops);
CREATE INDEX "auth_user_discordId_idx" ON "auth_user" USING btree ("discordId" text_ops);
CREATE UNIQUE INDEX "auth_user_discordId_key" ON "auth_user" USING btree ("discordId" text_ops);
CREATE UNIQUE INDEX "auth_user_email_key" ON "auth_user" USING btree ("email" text_ops);
CREATE INDEX "auth_verification_expiresAt_idx" ON "auth_verification" USING btree ("expiresAt" timestamp_ops);
CREATE INDEX "auth_verification_identifier_idx" ON "auth_verification" USING btree ("identifier" text_ops);
CREATE UNIQUE INDEX "auth_verification_identifier_value_key" ON "auth_verification" USING btree ("identifier" text_ops,"value" text_ops);
CREATE INDEX "Bot_approvedAt_idx" ON "Bot" USING btree ("approvedAt" timestamp_ops);
CREATE INDEX "Bot_createdAt_idx" ON "Bot" USING btree ("createdAt" timestamp_ops);
CREATE INDEX "Bot_featured_idx" ON "Bot" USING btree ("featured" bool_ops);
CREATE INDEX "Bot_featured_upvotes_idx" ON "Bot" USING btree ("featured" bool_ops,"upvotes" int4_ops);
CREATE INDEX "Bot_handledById_idx" ON "Bot" USING btree ("handledById" text_ops);
CREATE INDEX "Bot_pin_idx" ON "Bot" USING btree ("pin" bool_ops);
CREATE INDEX "Bot_servers_idx" ON "Bot" USING btree ("servers" int4_ops);
CREATE INDEX "Bot_status_createdAt_idx" ON "Bot" USING btree ("status" enum_ops,"createdAt" timestamp_ops);
CREATE INDEX "Bot_status_featured_idx" ON "Bot" USING btree ("status" enum_ops,"featured" bool_ops);
CREATE INDEX "Bot_status_idx" ON "Bot" USING btree ("status" enum_ops);
CREATE INDEX "Bot_upvotes_idx" ON "Bot" USING btree ("upvotes" int4_ops);
CREATE INDEX "Bot_users_idx" ON "Bot" USING btree ("users" int4_ops);
CREATE INDEX "Bot_verified_idx" ON "Bot" USING btree ("verified" bool_ops);
CREATE INDEX "Bot_verified_upvotes_idx" ON "Bot" USING btree ("verified" bool_ops,"upvotes" int4_ops);
CREATE INDEX "BotCommand_botId_idx" ON "BotCommand" USING btree ("botId" text_ops);
CREATE INDEX "BotCommand_category_idx" ON "BotCommand" USING btree ("category" text_ops);
CREATE INDEX "BotCommand_name_idx" ON "BotCommand" USING btree ("name" text_ops);
CREATE INDEX "_BotDevelopers_B_index" ON "_BotDevelopers" USING btree ("B" text_ops);
CREATE INDEX "Notification_createdAt_idx" ON "Notification" USING btree ("createdAt" timestamp_ops);
CREATE INDEX "Notification_read_idx" ON "Notification" USING btree ("read" bool_ops);
CREATE INDEX "Notification_userId_idx" ON "Notification" USING btree ("userId" text_ops);
CREATE INDEX "Notification_userId_read_idx" ON "Notification" USING btree ("userId" text_ops,"read" bool_ops);
CREATE INDEX "Report_handledById_idx" ON "Report" USING btree ("handledById" text_ops);
CREATE INDEX "Report_itemId_idx" ON "Report" USING btree ("itemId" text_ops);
CREATE INDEX "Report_reportedAt_idx" ON "Report" USING btree ("reportedAt" timestamp_ops);
CREATE INDEX "Report_reportedById_idx" ON "Report" USING btree ("reportedById" text_ops);
CREATE INDEX "Report_severity_idx" ON "Report" USING btree ("severity" enum_ops);
CREATE INDEX "Report_status_idx" ON "Report" USING btree ("status" enum_ops);
CREATE INDEX "Report_status_reportedAt_idx" ON "Report" USING btree ("status" enum_ops,"reportedAt" timestamp_ops);
CREATE INDEX "Report_status_severity_idx" ON "Report" USING btree ("status" enum_ops,"severity" enum_ops);
CREATE INDEX "Report_type_idx" ON "Report" USING btree ("type" enum_ops);
CREATE INDEX "Report_type_itemId_idx" ON "Report" USING btree ("type" enum_ops,"itemId" text_ops);
CREATE INDEX "Review_botId_idx" ON "Review" USING btree ("botId" text_ops);
CREATE INDEX "Review_botId_rating_idx" ON "Review" USING btree ("botId" text_ops,"rating" float8_ops);
CREATE INDEX "Review_createdAt_idx" ON "Review" USING btree ("createdAt" timestamp_ops);
CREATE INDEX "Review_rating_idx" ON "Review" USING btree ("rating" float8_ops);
CREATE INDEX "Review_serverId_idx" ON "Review" USING btree ("serverId" text_ops);
CREATE INDEX "Review_serverId_rating_idx" ON "Review" USING btree ("serverId" text_ops,"rating" float8_ops);
CREATE UNIQUE INDEX "Review_userId_botId_key" ON "Review" USING btree ("userId" text_ops,"botId" text_ops);
CREATE INDEX "Review_userId_idx" ON "Review" USING btree ("userId" text_ops);
CREATE UNIQUE INDEX "Review_userId_serverId_key" ON "Review" USING btree ("userId" text_ops,"serverId" text_ops);
CREATE INDEX "Server_createdAt_idx" ON "Server" USING btree ("createdAt" timestamp_ops);
CREATE INDEX "Server_createdAt_upvotes_idx" ON "Server" USING btree ("createdAt" timestamp_ops,"upvotes" int4_ops);
CREATE INDEX "Server_featured_idx" ON "Server" USING btree ("featured" bool_ops);
CREATE INDEX "Server_featured_upvotes_idx" ON "Server" USING btree ("featured" bool_ops,"upvotes" int4_ops);
CREATE UNIQUE INDEX "Server_id_ownerId_key" ON "Server" USING btree ("id" text_ops,"ownerId" text_ops);
CREATE INDEX "Server_members_idx" ON "Server" USING btree ("members" int4_ops);
CREATE INDEX "Server_ownerId_idx" ON "Server" USING btree ("ownerId" text_ops);
CREATE INDEX "Server_pin_idx" ON "Server" USING btree ("pin" bool_ops);
CREATE INDEX "Server_upvotes_idx" ON "Server" USING btree ("upvotes" int4_ops);
CREATE INDEX "_ServerAdmins_B_index" ON "_ServerAdmins" USING btree ("B" text_ops);
CREATE INDEX "User_joinedAt_idx" ON "User" USING btree ("joinedAt" timestamp_ops);
CREATE INDEX "_UserFavoriteBots_B_index" ON "_UserFavoriteBots" USING btree ("B" text_ops);
CREATE INDEX "_UserFavoriteServers_B_index" ON "_UserFavoriteServers" USING btree ("B" text_ops);
CREATE INDEX "Vote_createdAt_idx" ON "Vote" USING btree ("createdAt" timestamp_ops);
CREATE INDEX "Vote_itemId_idx" ON "Vote" USING btree ("itemId" text_ops);
CREATE INDEX "Vote_itemType_idx" ON "Vote" USING btree ("itemType" enum_ops);
CREATE INDEX "Vote_userId_idx" ON "Vote" USING btree ("userId" text_ops);
CREATE INDEX "Vote_userId_itemId_itemType_idx" ON "Vote" USING btree ("userId" text_ops,"itemId" text_ops,"itemType" enum_ops);
