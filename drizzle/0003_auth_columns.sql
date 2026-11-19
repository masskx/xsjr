ALTER TABLE "users" ADD COLUMN "totp_last_step" bigint;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "consent_version" text;