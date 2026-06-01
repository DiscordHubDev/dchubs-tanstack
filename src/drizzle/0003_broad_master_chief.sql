CREATE TABLE "jwks" (
	"id" text PRIMARY KEY NOT NULL,
	"publicKey" text NOT NULL,
	"privateKey" text NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"expiresAt" timestamp(3)
);
--> statement-breakpoint
DROP INDEX "Bot_featured_upvotes_idx";--> statement-breakpoint
DROP INDEX "Bot_status_createdAt_idx";--> statement-breakpoint
DROP INDEX "Bot_status_featured_idx";--> statement-breakpoint
DROP INDEX "Bot_verified_upvotes_idx";--> statement-breakpoint
DROP INDEX "Notification_userId_read_idx";--> statement-breakpoint
DROP INDEX "Report_status_reportedAt_idx";--> statement-breakpoint
DROP INDEX "Report_type_itemId_idx";--> statement-breakpoint
DROP INDEX "Review_botId_rating_idx";--> statement-breakpoint
DROP INDEX "Review_serverId_rating_idx";--> statement-breakpoint
DROP INDEX "Server_createdAt_upvotes_idx";--> statement-breakpoint
DROP INDEX "Server_featured_upvotes_idx";--> statement-breakpoint
DROP INDEX "Vote_userId_itemId_itemType_idx";--> statement-breakpoint
CREATE INDEX "Bot_featured_upvotes_idx" ON "Bot" USING btree ("featured" bool_ops,"upvotes" int4_ops);--> statement-breakpoint
CREATE INDEX "Bot_status_createdAt_idx" ON "Bot" USING btree ("status" enum_ops,"createdAt" timestamp_ops);--> statement-breakpoint
CREATE INDEX "Bot_status_featured_idx" ON "Bot" USING btree ("status" enum_ops,"featured" bool_ops);--> statement-breakpoint
CREATE INDEX "Bot_verified_upvotes_idx" ON "Bot" USING btree ("verified" bool_ops,"upvotes" int4_ops);--> statement-breakpoint
CREATE INDEX "Notification_userId_read_idx" ON "Notification" USING btree ("userId" text_ops,"read" bool_ops);--> statement-breakpoint
CREATE INDEX "Report_status_reportedAt_idx" ON "Report" USING btree ("status" enum_ops,"reportedAt" timestamp_ops);--> statement-breakpoint
CREATE INDEX "Report_type_itemId_idx" ON "Report" USING btree ("type" enum_ops,"itemId" text_ops);--> statement-breakpoint
CREATE INDEX "Review_botId_rating_idx" ON "Review" USING btree ("botId" text_ops,"rating" float8_ops);--> statement-breakpoint
CREATE INDEX "Review_serverId_rating_idx" ON "Review" USING btree ("serverId" text_ops,"rating" float8_ops);--> statement-breakpoint
CREATE INDEX "Server_createdAt_upvotes_idx" ON "Server" USING btree ("createdAt" timestamp_ops,"upvotes" int4_ops);--> statement-breakpoint
CREATE INDEX "Server_featured_upvotes_idx" ON "Server" USING btree ("featured" bool_ops,"upvotes" int4_ops);--> statement-breakpoint
CREATE INDEX "Vote_userId_itemId_itemType_idx" ON "Vote" USING btree ("userId" text_ops,"itemId" text_ops,"itemType" enum_ops);