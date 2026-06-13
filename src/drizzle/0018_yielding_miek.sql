CREATE TABLE "announcements" (
	"id" serial PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Bot" ADD COLUMN "custom_field" jsonb;--> statement-breakpoint
ALTER TABLE "Server" ADD COLUMN "custom_field" jsonb;