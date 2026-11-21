ALTER TABLE "media" DROP CONSTRAINT "media_key_format";--> statement-breakpoint
ALTER TABLE "media" DROP CONSTRAINT "media_mime";--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_key_format" CHECK ("media"."storage_key" ~ '^[a-z0-9/_-]+\.(png|jpg|webp|ico)$');--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_mime" CHECK ("media"."mime" IN ('image/png','image/jpeg','image/webp','image/x-icon'));