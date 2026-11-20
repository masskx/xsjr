CREATE TABLE "llm_provider" (
	"id" smallint PRIMARY KEY NOT NULL,
	"label" text DEFAULT 'DeepSeek' NOT NULL,
	"base_url" text DEFAULT 'https://api.deepseek.com' NOT NULL,
	"model" text DEFAULT 'deepseek-chat' NOT NULL,
	"api_key_sealed" text,
	"daily_token_limit" integer DEFAULT 2000000 NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"updated_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "llm_provider" ADD CONSTRAINT "llm_provider_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;