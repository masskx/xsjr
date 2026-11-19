CREATE TYPE "public"."event_type" AS ENUM('page_view', 'copy', 'search', 'login', 'register');--> statement-breakpoint
CREATE TYPE "public"."grant_source" AS ENUM('ADMIN_GRANT', 'ORDER', 'PROMO');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'failed', 'done');--> statement-breakpoint
CREATE TYPE "public"."license_source" AS ENUM('PLATFORM', 'SPDX_DETECTED', 'PAGE_DECLARED', 'ADMIN_DECLARED', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('PENDING', 'PAID', 'CANCELLED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."resource_origin" AS ENUM('FILE_IMPORT', 'ADMIN', 'INGESTION');--> statement-breakpoint
CREATE TYPE "public"."resource_status" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."resource_type" AS ENUM('PROMPT', 'SKILL', 'MODULE', 'SITE');--> statement-breakpoint
CREATE TYPE "public"."token_purpose" AS ENUM('EMAIL_VERIFY', 'PASSWORD_RESET', 'INVITE');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('USER', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."var_type" AS ENUM('text', 'textarea', 'select', 'boolean');--> statement-breakpoint
CREATE TABLE "admin_audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor_id" bigint NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" bigint,
	"diff" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "auth_tokens_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint,
	"email" "citext" NOT NULL,
	"purpose" "token_purpose" NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "bookmarks" (
	"user_id" bigint NOT NULL,
	"resource_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookmarks_user_id_resource_id_pk" PRIMARY KEY("user_id","resource_id")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "categories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "daily_salts" (
	"day" date PRIMARY KEY NOT NULL,
	"salt" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entitlements" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "entitlements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"tier" text NOT NULL,
	"source" "grant_source" NOT NULL,
	"order_id" bigint,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"granted_by" bigint,
	"revoked_at" timestamp with time zone,
	"revoked_by" bigint,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"type" "event_type" NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" bigint,
	"visitor_hash" "bytea" NOT NULL,
	"resource_id" bigint,
	"path" text NOT NULL,
	"referrer_host" text,
	"search_query" text,
	"locked" boolean DEFAULT false NOT NULL,
	CONSTRAINT "events_path_len" CHECK (char_length("events"."path") <= 300),
	CONSTRAINT "events_ref_len" CHECK (char_length("events"."referrer_host") <= 253),
	CONSTRAINT "events_query_len" CHECK (char_length("events"."search_query") <= 100)
);
--> statement-breakpoint
CREATE TABLE "ingestion_items" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ingestion_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"job_id" bigint NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"source_url" text NOT NULL,
	"source_url_norm" text NOT NULL,
	"robots_allowed" boolean,
	"http_status" integer,
	"fetched_bytes" integer,
	"extracted_sha256" "bytea",
	"llm_model" text,
	"llm_tokens_in" integer,
	"llm_tokens_out" integer,
	"llm_result" jsonb,
	"detected_license" text,
	"license_source" "license_source",
	"resource_id" bigint,
	"duplicate_of" bigint,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_jobs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ingestion_jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"mode" text NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"input" jsonb NOT NULL,
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error" text,
	CONSTRAINT "ingestion_jobs_mode" CHECK ("ingestion_jobs"."mode" IN ('URL','BULK','QUERY'))
);
--> statement-breakpoint
CREATE TABLE "mail_outbox" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mail_outbox_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"to_email" "citext" NOT NULL,
	"template" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "mail_status" CHECK ("mail_outbox"."status" IN ('pending','sent','failed','held'))
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "media_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"storage_key" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"sha256" "bytea" NOT NULL,
	"alt" text,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "media_key_format" CHECK ("media"."storage_key" ~ '^[a-z0-9/_-]+\.(png|jpg|webp)$'),
	CONSTRAINT "media_mime" CHECK ("media"."mime" IN ('image/png','image/jpeg','image/webp')),
	CONSTRAINT "media_bytes" CHECK ("media"."bytes" BETWEEN 1 AND 2097152)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "orders_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"tier" text NOT NULL,
	"period_days" integer NOT NULL,
	"amount_fen" integer NOT NULL,
	"currency" char(3) DEFAULT 'CNY' NOT NULL,
	"status" "order_status" DEFAULT 'PENDING' NOT NULL,
	"provider" text,
	"provider_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	CONSTRAINT "orders_provider_ref_unique" UNIQUE("provider_ref"),
	CONSTRAINT "orders_period" CHECK ("orders"."period_days" > 0),
	CONSTRAINT "orders_amount" CHECK ("orders"."amount_fen" >= 0)
);
--> statement-breakpoint
CREATE TABLE "prompt_variables" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "prompt_variables_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"resource_id" bigint NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"type" "var_type" NOT NULL,
	"required" boolean,
	"default_value" text,
	"help" text,
	"options" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "prompt_variables_key_uq" UNIQUE("resource_id","key"),
	CONSTRAINT "prompt_variables_key_format" CHECK ("prompt_variables"."key" ~ '^[a-zA-Z_][a-zA-Z0-9_]{0,39}$')
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "resource_files" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "resource_files_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"resource_id" bigint NOT NULL,
	"path" text NOT NULL,
	"content" text NOT NULL,
	"language" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"is_entry" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "resource_files_path_uq" UNIQUE("resource_id","path"),
	CONSTRAINT "resource_files_safe_path" CHECK (char_length("resource_files"."path") BETWEEN 1 AND 200 AND "resource_files"."path" !~ '^/' AND "resource_files"."path" !~ '^[A-Za-z]:' AND "resource_files"."path" !~ '\\' AND "resource_files"."path" !~ '(^|/)\.\.(/|$)')
);
--> statement-breakpoint
CREATE TABLE "resource_module" (
	"resource_id" bigint PRIMARY KEY NOT NULL,
	"language" text NOT NULL,
	"entry_path" text NOT NULL,
	"env" text[] DEFAULT '{}'::text[] NOT NULL,
	"dependencies" text[] DEFAULT '{}'::text[] NOT NULL,
	"usage" text[]
);
--> statement-breakpoint
CREATE TABLE "resource_prompt" (
	"resource_id" bigint PRIMARY KEY NOT NULL,
	"notes" text[]
);
--> statement-breakpoint
CREATE TABLE "resource_provenance" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "resource_provenance_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"resource_id" bigint NOT NULL,
	"source_url" text NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL,
	"http_status" integer,
	"content_sha256" "bytea",
	"license" text NOT NULL,
	"license_source" "license_source" NOT NULL,
	"license_evidence" text,
	"ingestion_item_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_site" (
	"resource_id" bigint PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"pricing" text NOT NULL,
	"region" text,
	"login_required" boolean,
	CONSTRAINT "resource_site_url" CHECK ("resource_site"."url" ~ '^https?://')
);
--> statement-breakpoint
CREATE TABLE "resource_skill" (
	"resource_id" bigint PRIMARY KEY NOT NULL,
	"risks" text[],
	"dependencies" text[],
	"file_tree" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"install_note" text
);
--> statement-breakpoint
CREATE TABLE "resource_tags" (
	"resource_id" bigint NOT NULL,
	"tag_id" bigint NOT NULL,
	"position" smallint NOT NULL,
	CONSTRAINT "resource_tags_resource_id_tag_id_pk" PRIMARY KEY("resource_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "resource_versions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "resource_versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"resource_id" bigint NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"note" text,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resource_versions_uq" UNIQUE("resource_id","version")
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "resources_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"type" "resource_type" NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"body_md" text DEFAULT '' NOT NULL,
	"applicable_tasks" text[] DEFAULT '{}'::text[] NOT NULL,
	"category_id" bigint,
	"required_tier" text DEFAULT 'FREE' NOT NULL,
	"status" "resource_status" DEFAULT 'DRAFT' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"author" text NOT NULL,
	"license" text NOT NULL,
	"license_source" "license_source" NOT NULL,
	"license_note" text,
	"redistribution" boolean NOT NULL,
	"source_url" text,
	"source_url_norm" text,
	"structure_media_id" bigint,
	"origin" "resource_origin" NOT NULL,
	"content_hash" "bytea",
	"content_updated_on" date NOT NULL,
	"verified_on" date,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" bigint,
	"updated_by" bigint,
	CONSTRAINT "resources_slug_unique" UNIQUE("slug"),
	CONSTRAINT "resources_slug_format" CHECK ("resources"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "resources_title_len" CHECK (char_length("resources"."title") BETWEEN 2 AND 80),
	CONSTRAINT "resources_summary_len" CHECK (char_length("resources"."summary") BETWEEN 20 AND 110),
	CONSTRAINT "prompts_skills_free" CHECK ("resources"."type" NOT IN ('PROMPT','SKILL') OR "resources"."required_tier" = 'FREE'),
	CONSTRAINT "unknown_license_index_only" CHECK ("resources"."license_source" <> 'UNKNOWN' OR "resources"."redistribution" = false),
	CONSTRAINT "published_has_ts" CHECK ("resources"."status" <> 'PUBLISHED' OR "resources"."published_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sessions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"mfa_verified_at" timestamp with time zone,
	"reauth_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"user_agent" text,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "sessions_ua_len" CHECK (char_length("sessions"."user_agent") <= 300)
);
--> statement-breakpoint
CREATE TABLE "skill_compat" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "skill_compat_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"resource_id" bigint NOT NULL,
	"tool_key" text NOT NULL,
	"supported_range" text NOT NULL,
	"install_path" text,
	"note" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "skill_compat_tool_uq" UNIQUE("resource_id","tool_key")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tags_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	CONSTRAINT "tags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "tiers" (
	"code" text PRIMARY KEY NOT NULL,
	"rank" smallint NOT NULL,
	"label_zh" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "tiers_rank_unique" UNIQUE("rank"),
	CONSTRAINT "tiers_code_format" CHECK ("tiers"."code" ~ '^[A-Z][A-Z0-9_]{1,15}$')
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"email" "citext" NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text,
	"role" "user_role" DEFAULT 'USER' NOT NULL,
	"tier" text DEFAULT 'FREE' NOT NULL,
	"tier_expires_at" timestamp with time zone,
	"email_verified_at" timestamp with time zone,
	"totp_secret_enc" "bytea",
	"totp_enabled_at" timestamp with time zone,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "free_has_no_expiry" CHECK ("users"."tier" <> 'FREE' OR "users"."tier_expires_at" IS NULL),
	CONSTRAINT "display_name_len" CHECK (char_length("users"."display_name") <= 40)
);
--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_tier_tiers_code_fk" FOREIGN KEY ("tier") REFERENCES "public"."tiers"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_items" ADD CONSTRAINT "ingestion_items_job_id_ingestion_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."ingestion_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_items" ADD CONSTRAINT "ingestion_items_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_items" ADD CONSTRAINT "ingestion_items_duplicate_of_resources_id_fk" FOREIGN KEY ("duplicate_of") REFERENCES "public"."resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_tier_tiers_code_fk" FOREIGN KEY ("tier") REFERENCES "public"."tiers"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_variables" ADD CONSTRAINT "prompt_variables_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_files" ADD CONSTRAINT "resource_files_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_module" ADD CONSTRAINT "resource_module_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_prompt" ADD CONSTRAINT "resource_prompt_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_provenance" ADD CONSTRAINT "resource_provenance_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_provenance" ADD CONSTRAINT "resource_provenance_ingestion_item_id_ingestion_items_id_fk" FOREIGN KEY ("ingestion_item_id") REFERENCES "public"."ingestion_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_site" ADD CONSTRAINT "resource_site_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_skill" ADD CONSTRAINT "resource_skill_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_tags" ADD CONSTRAINT "resource_tags_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_tags" ADD CONSTRAINT "resource_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_versions" ADD CONSTRAINT "resource_versions_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_versions" ADD CONSTRAINT "resource_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_required_tier_tiers_code_fk" FOREIGN KEY ("required_tier") REFERENCES "public"."tiers"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_structure_media_id_media_id_fk" FOREIGN KEY ("structure_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_compat" ADD CONSTRAINT "skill_compat_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tier_tiers_code_fk" FOREIGN KEY ("tier") REFERENCES "public"."tiers"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entitlements_user_idx" ON "entitlements" USING btree ("user_id","starts_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "events_type_time_idx" ON "events" USING btree ("type","occurred_at");--> statement-breakpoint
CREATE INDEX "events_res_idx" ON "events" USING btree ("resource_id","type","occurred_at") WHERE "events"."resource_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "events_time_brin" ON "events" USING brin ("occurred_at");--> statement-breakpoint
CREATE INDEX "ingestion_items_queue_idx" ON "ingestion_items" USING btree ("status","id") WHERE "ingestion_items"."status" IN ('queued','running');--> statement-breakpoint
CREATE INDEX "resource_tags_tag_idx" ON "resource_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resources_source_norm_uq" ON "resources" USING btree ("source_url_norm") WHERE "resources"."source_url_norm" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "resources_list_idx" ON "resources" USING btree ("type","status","sort_order","id");--> statement-breakpoint
CREATE INDEX "resources_cat_idx" ON "resources" USING btree ("category_id") WHERE "resources"."status" = 'PUBLISHED';--> statement-breakpoint
CREATE INDEX "resources_title_trgm" ON "resources" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "sessions_user_active_idx" ON "sessions" USING btree ("user_id") WHERE "sessions"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "users_created_idx" ON "users" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "users_tier_idx" ON "users" USING btree ("tier");