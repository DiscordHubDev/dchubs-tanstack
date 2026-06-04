ALTER TABLE "auth_account" RENAME COLUMN "accountId" TO "account_id";--> statement-breakpoint
ALTER TABLE "auth_account" RENAME COLUMN "providerId" TO "provider_id";--> statement-breakpoint
ALTER TABLE "auth_account" RENAME COLUMN "userId" TO "user_id";--> statement-breakpoint
ALTER TABLE "auth_account" RENAME COLUMN "accessToken" TO "access_token";--> statement-breakpoint
ALTER TABLE "auth_account" RENAME COLUMN "refreshToken" TO "refresh_token";--> statement-breakpoint
ALTER TABLE "auth_account" RENAME COLUMN "idToken" TO "id_token";--> statement-breakpoint
ALTER TABLE "auth_account" RENAME COLUMN "accessTokenExpiresAt" TO "access_token_expires_at";--> statement-breakpoint
ALTER TABLE "auth_account" RENAME COLUMN "refreshTokenExpiresAt" TO "refresh_token_expires_at";--> statement-breakpoint
ALTER TABLE "auth_account" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "auth_account" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "auth_session" RENAME COLUMN "expiresAt" TO "expires_at";--> statement-breakpoint
ALTER TABLE "auth_session" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "auth_session" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "auth_session" RENAME COLUMN "ipAddress" TO "ip_address";--> statement-breakpoint
ALTER TABLE "auth_session" RENAME COLUMN "userAgent" TO "user_agent";--> statement-breakpoint
ALTER TABLE "auth_session" RENAME COLUMN "userId" TO "user_id";--> statement-breakpoint
ALTER TABLE "auth_user" RENAME COLUMN "emailVerified" TO "email_verified";--> statement-breakpoint
ALTER TABLE "auth_user" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "auth_user" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "auth_user" RENAME COLUMN "discordId" TO "discord_id";--> statement-breakpoint
ALTER TABLE "auth_user" RENAME COLUMN "bannerColor" TO "banner_color";--> statement-breakpoint
ALTER TABLE "auth_verification" RENAME COLUMN "expiresAt" TO "expires_at";--> statement-breakpoint
ALTER TABLE "auth_verification" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "auth_verification" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "auth_account" DROP CONSTRAINT "auth_account_userId_fkey";
--> statement-breakpoint
ALTER TABLE "auth_session" DROP CONSTRAINT "auth_session_userId_fkey";
--> statement-breakpoint
DROP INDEX "auth_account_providerId_accountId_idx";--> statement-breakpoint
DROP INDEX "auth_account_providerId_accountId_key";--> statement-breakpoint
DROP INDEX "auth_account_userId_idx";--> statement-breakpoint
DROP INDEX "auth_session_token_key";--> statement-breakpoint
DROP INDEX "auth_session_userId_idx";--> statement-breakpoint
DROP INDEX "auth_user_discordId_key";--> statement-breakpoint
DROP INDEX "auth_user_email_key";--> statement-breakpoint
DROP INDEX "auth_verification_expiresAt_idx";--> statement-breakpoint
DROP INDEX "auth_verification_identifier_idx";--> statement-breakpoint
DROP INDEX "auth_verification_identifier_value_key";--> statement-breakpoint
ALTER TABLE "auth_user" ALTER COLUMN "name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_session" ADD COLUMN "impersonated_by" text;--> statement-breakpoint
ALTER TABLE "auth_user" ADD COLUMN "role" text;--> statement-breakpoint
ALTER TABLE "auth_user" ADD COLUMN "banned" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "auth_user" ADD COLUMN "ban_reason" text;--> statement-breakpoint
ALTER TABLE "auth_user" ADD COLUMN "ban_expires" timestamp;--> statement-breakpoint
ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "authAccount_userId_idx" ON "auth_account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "authSession_userId_idx" ON "auth_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "authVerification_identifier_idx" ON "auth_verification" USING btree ("identifier");--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_token_unique" UNIQUE("token");--> statement-breakpoint
ALTER TABLE "auth_user" ADD CONSTRAINT "auth_user_email_unique" UNIQUE("email");