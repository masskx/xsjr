ALTER TABLE "ingestion_items" ADD COLUMN "next_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ingestion_items" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "ingestion_items" ADD COLUMN "license_evidence" text;--> statement-breakpoint
CREATE UNIQUE INDEX "ingestion_items_inflight_uq" ON "ingestion_items" USING btree ("source_url_norm") WHERE "ingestion_items"."status" IN ('queued','running');