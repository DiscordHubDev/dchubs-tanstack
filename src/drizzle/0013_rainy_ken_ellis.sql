ALTER TABLE "auth_user" ALTER COLUMN "created_at" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "auth_user" ALTER COLUMN "created_at" SET DEFAULT (now());--> statement-breakpoint
ALTER TABLE "auth_user" ALTER COLUMN "updated_at" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "auth_user" ALTER COLUMN "updated_at" SET DEFAULT (now());--> statement-breakpoint
ALTER TABLE "auth_user" ALTER COLUMN "username" SET DEFAULT '未知使用者';--> statement-breakpoint
ALTER TABLE "auth_user" ALTER COLUMN "username" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_user" ALTER COLUMN "avatar" SET DEFAULT 'https://cdn.discordapp.com/embed/avatars/0.png';--> statement-breakpoint
ALTER TABLE "auth_user" ALTER COLUMN "avatar" SET NOT NULL;