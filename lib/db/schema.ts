// Research Hub database schema (PostgreSQL 16). Source of truth for migrations in drizzle/.
// Mirrors docs/phase2/PLAN.md section B. Tables not used yet (auth, analytics, ingestion,
// payment stubs) are created now so later slices only add code, not schema rewrites.
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  unique,
} from "drizzle-orm/pg-core";

// ── custom types ──
const citext = customType<{ data: string }>({ dataType: () => "citext" });
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

const id = () => bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity();
const ref = (name: string) => bigint(name, { mode: "number" });
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();

// ── enums ──
export const resourceType = pgEnum("resource_type", ["PROMPT", "SKILL", "MODULE", "SITE"]);
export const resourceStatus = pgEnum("resource_status", ["DRAFT", "PUBLISHED", "ARCHIVED"]);
export const resourceOrigin = pgEnum("resource_origin", ["FILE_IMPORT", "ADMIN", "INGESTION"]);
export const userRole = pgEnum("user_role", ["USER", "ADMIN"]);
export const varType = pgEnum("var_type", ["text", "textarea", "select", "boolean"]);
export const tokenPurpose = pgEnum("token_purpose", ["EMAIL_VERIFY", "PASSWORD_RESET", "INVITE"]);
export const eventType = pgEnum("event_type", ["page_view", "copy", "search", "login", "register"]);
export const jobStatus = pgEnum("job_status", ["queued", "running", "failed", "done"]);
export const licenseSource = pgEnum("license_source", [
  "PLATFORM",
  "SPDX_DETECTED",
  "PAGE_DECLARED",
  "ADMIN_DECLARED",
  "UNKNOWN",
]);
export const orderStatus = pgEnum("order_status", ["PENDING", "PAID", "CANCELLED", "REFUNDED"]);
export const grantSource = pgEnum("grant_source", ["ADMIN_GRANT", "ORDER", "PROMO"]);

// ── tiers: lookup table so a future tier is one INSERT; access iff user rank >= resource rank ──
export const tiers = pgTable(
  "tiers",
  {
    code: text("code").primaryKey(),
    rank: smallint("rank").notNull().unique(),
    labelZh: text("label_zh").notNull(),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [check("tiers_code_format", sql`${t.code} ~ '^[A-Z][A-Z0-9_]{1,15}$'`)],
);

// ── users and auth ──
export const users = pgTable(
  "users",
  {
    id: id(),
    email: citext("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name"),
    role: userRole("role").notNull().default("USER"),
    tier: text("tier").notNull().default("FREE").references(() => tiers.code),
    tierExpiresAt: ts("tier_expires_at"),
    emailVerifiedAt: ts("email_verified_at"),
    totpSecretEnc: bytea("totp_secret_enc"),
    totpEnabledAt: ts("totp_enabled_at"),
    /** last accepted TOTP time step: a code is never accepted twice (replay protection) */
    totpLastStep: bigint("totp_last_step", { mode: "number" }),
    /** PIPL: when the user accepted the privacy policy and terms, and which version */
    consentAt: ts("consent_at"),
    consentVersion: text("consent_version"),
    failedLogins: integer("failed_logins").notNull().default(0),
    lockedUntil: ts("locked_until"),
    disabledAt: ts("disabled_at"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    lastLoginAt: ts("last_login_at"),
  },
  (t) => [
    check("free_has_no_expiry", sql`${t.tier} <> 'FREE' OR ${t.tierExpiresAt} IS NULL`),
    check("display_name_len", sql`char_length(${t.displayName}) <= 40`),
    index("users_created_idx").on(t.createdAt),
    index("users_tier_idx").on(t.tier),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: ref("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: bytea("token_hash").notNull().unique(),
    createdAt: createdAt(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
    mfaVerifiedAt: ts("mfa_verified_at"),
    reauthAt: ts("reauth_at"),
    revokedAt: ts("revoked_at"),
    userAgent: text("user_agent"),
  },
  (t) => [
    index("sessions_user_active_idx").on(t.userId).where(sql`${t.revokedAt} IS NULL`),
    check("sessions_ua_len", sql`char_length(${t.userAgent}) <= 300`),
  ],
);

export const authTokens = pgTable("auth_tokens", {
  id: id(),
  userId: ref("user_id").references(() => users.id, { onDelete: "cascade" }),
  email: citext("email").notNull(),
  purpose: tokenPurpose("purpose").notNull(),
  tokenHash: bytea("token_hash").notNull().unique(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdBy: ref("created_by").references(() => users.id),
  createdAt: createdAt(),
});

export const mailOutbox = pgTable(
  "mail_outbox",
  {
    id: id(),
    toEmail: citext("to_email").notNull(),
    template: text("template").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: createdAt(),
    sentAt: ts("sent_at"),
  },
  (t) => [check("mail_status", sql`${t.status} IN ('pending','sent','failed','held')`)],
);

// ── taxonomy and media ──
export const categories = pgTable("categories", {
  id: id(),
  name: text("name").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const tags = pgTable("tags", {
  id: id(),
  name: text("name").notNull().unique(),
});

export const media = pgTable(
  "media",
  {
    id: id(),
    storageKey: text("storage_key").notNull().unique(),
    mime: text("mime").notNull(),
    bytes: integer("bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    sha256: bytea("sha256").notNull(),
    alt: text("alt"),
    createdBy: ref("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    check("media_key_format", sql`${t.storageKey} ~ '^[a-z0-9/_-]+\\.(png|jpg|webp)$'`),
    check("media_mime", sql`${t.mime} IN ('image/png','image/jpeg','image/webp')`),
    check("media_bytes", sql`${t.bytes} BETWEEN 1 AND 2097152`),
  ],
);

// ── resources ──
export const resources = pgTable(
  "resources",
  {
    id: id(),
    type: resourceType("type").notNull(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    bodyMd: text("body_md").notNull().default(""),
    applicableTasks: text("applicable_tasks").array().notNull().default(sql`'{}'::text[]`),
    categoryId: ref("category_id").references(() => categories.id),
    requiredTier: text("required_tier").notNull().default("FREE").references(() => tiers.code),
    status: resourceStatus("status").notNull().default("DRAFT"),
    sortOrder: integer("sort_order").notNull().default(0),
    featured: boolean("featured").notNull().default(false),
    author: text("author").notNull(),
    license: text("license").notNull(),
    licenseSource: licenseSource("license_source").notNull(),
    licenseNote: text("license_note"),
    redistribution: boolean("redistribution").notNull(),
    sourceUrl: text("source_url"),
    sourceUrlNorm: text("source_url_norm"),
    structureMediaId: ref("structure_media_id").references(() => media.id, { onDelete: "set null" }),
    origin: resourceOrigin("origin").notNull(),
    contentHash: bytea("content_hash"),
    contentUpdatedOn: date("content_updated_on", { mode: "string" }).notNull(),
    /** public counters: one per visitor per day (resource_daily_visitors); never touch updated_at */
    viewCount: integer("view_count").notNull().default(0),
    downloadCount: integer("download_count").notNull().default(0),
    verifiedOn: date("verified_on", { mode: "string" }),
    publishedAt: ts("published_at"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    createdBy: ref("created_by").references(() => users.id),
    updatedBy: ref("updated_by").references(() => users.id),
  },
  (t) => [
    check("resources_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check("resources_title_len", sql`char_length(${t.title}) BETWEEN 2 AND 80`),
    check("resources_summary_len", sql`char_length(${t.summary}) BETWEEN 20 AND 110`),
    // Phase-2 business rule: prompts and skills are always free. Drop if that ever changes.
    check("prompts_skills_free", sql`${t.type} NOT IN ('PROMPT','SKILL') OR ${t.requiredTier} = 'FREE'`),
    // Legal rule: content whose licence is unknown is never redistributed.
    check("unknown_license_index_only", sql`${t.licenseSource} <> 'UNKNOWN' OR ${t.redistribution} = false`),
    check("published_has_ts", sql`${t.status} <> 'PUBLISHED' OR ${t.publishedAt} IS NOT NULL`),
    uniqueIndex("resources_source_norm_uq").on(t.sourceUrlNorm).where(sql`${t.sourceUrlNorm} IS NOT NULL`),
    index("resources_list_idx").on(t.type, t.status, t.sortOrder, t.id),
    index("resources_cat_idx").on(t.categoryId).where(sql`${t.status} = 'PUBLISHED'`),
    index("resources_title_trgm").using("gin", sql`${t.title} gin_trgm_ops`),
  ],
);

export const resourceTags = pgTable(
  "resource_tags",
  {
    resourceId: ref("resource_id").notNull().references(() => resources.id, { onDelete: "cascade" }),
    tagId: ref("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
    /** tags keep their authored order (it is visible on cards) */
    position: smallint("position").notNull(),
  },
  (t) => [primaryKey({ columns: [t.resourceId, t.tagId] }), index("resource_tags_tag_idx").on(t.tagId)],
);

export const resourceFiles = pgTable(
  "resource_files",
  {
    id: id(),
    resourceId: ref("resource_id").notNull().references(() => resources.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    /** NEVER selected by public listing queries; code is read through the entitlement-checked path only */
    content: text("content").notNull(),
    language: text("language").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    isEntry: boolean("is_entry").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    unique("resource_files_path_uq").on(t.resourceId, t.path),
    check(
      "resource_files_safe_path",
      sql`char_length(${t.path}) BETWEEN 1 AND 200 AND ${t.path} !~ '^/' AND ${t.path} !~ '^[A-Za-z]:' AND ${t.path} !~ '\\\\' AND ${t.path} !~ '(^|/)\\.\\.(/|$)'`,
    ),
  ],
);

export const resourcePrompt = pgTable("resource_prompt", {
  resourceId: ref("resource_id").primaryKey().references(() => resources.id, { onDelete: "cascade" }),
  notes: text("notes").array(),
});

export const resourceSkill = pgTable("resource_skill", {
  resourceId: ref("resource_id").primaryKey().references(() => resources.id, { onDelete: "cascade" }),
  risks: text("risks").array(),
  dependencies: text("dependencies").array(),
  /** declared files[] {path, size?, desc?}; only SKILL.md content is stored in resource_files */
  fileTree: jsonb("file_tree").notNull().default(sql`'[]'::jsonb`),
  installNote: text("install_note"),
});

export const resourceModule = pgTable("resource_module", {
  resourceId: ref("resource_id").primaryKey().references(() => resources.id, { onDelete: "cascade" }),
  language: text("language").notNull(),
  entryPath: text("entry_path").notNull(),
  env: text("env").array().notNull().default(sql`'{}'::text[]`),
  dependencies: text("dependencies").array().notNull().default(sql`'{}'::text[]`),
  usage: text("usage").array(),
});

export const resourceSite = pgTable(
  "resource_site",
  {
    resourceId: ref("resource_id").primaryKey().references(() => resources.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    pricing: text("pricing").notNull(),
    region: text("region"),
    loginRequired: boolean("login_required"),
  },
  (t) => [check("resource_site_url", sql`${t.url} ~ '^https?://'`)],
);

export const promptVariables = pgTable(
  "prompt_variables",
  {
    id: id(),
    resourceId: ref("resource_id").notNull().references(() => resources.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    type: varType("type").notNull(),
    /** nullable on purpose: "not specified" and false are kept distinct for exact round-trips */
    required: boolean("required"),
    defaultValue: text("default_value"),
    help: text("help"),
    options: jsonb("options"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    unique("prompt_variables_key_uq").on(t.resourceId, t.key),
    check("prompt_variables_key_format", sql`${t.key} ~ '^[a-zA-Z_][a-zA-Z0-9_]{0,39}$'`),
  ],
);

export const skillCompat = pgTable(
  "skill_compat",
  {
    id: id(),
    resourceId: ref("resource_id").notNull().references(() => resources.id, { onDelete: "cascade" }),
    toolKey: text("tool_key").notNull(),
    supportedRange: text("supported_range").notNull(),
    installPath: text("install_path"),
    note: text("note"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [unique("skill_compat_tool_uq").on(t.resourceId, t.toolKey)],
);

export const resourceVersions = pgTable(
  "resource_versions",
  {
    id: id(),
    resourceId: ref("resource_id").notNull().references(() => resources.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    note: text("note"),
    createdBy: ref("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [unique("resource_versions_uq").on(t.resourceId, t.version)],
);

// ── ingestion (slice 7) ──
export const ingestionJobs = pgTable(
  "ingestion_jobs",
  {
    id: id(),
    mode: text("mode").notNull(),
    status: jobStatus("status").notNull().default("queued"),
    input: jsonb("input").notNull(),
    createdBy: ref("created_by").notNull().references(() => users.id),
    createdAt: createdAt(),
    startedAt: ts("started_at"),
    finishedAt: ts("finished_at"),
    error: text("error"),
  },
  (t) => [check("ingestion_jobs_mode", sql`${t.mode} IN ('URL','BULK','QUERY')`)],
);

export const ingestionItems = pgTable(
  "ingestion_items",
  {
    id: id(),
    jobId: ref("job_id").notNull().references(() => ingestionJobs.id, { onDelete: "cascade" }),
    status: jobStatus("status").notNull().default("queued"),
    sourceUrl: text("source_url").notNull(),
    sourceUrlNorm: text("source_url_norm").notNull(),
    robotsAllowed: boolean("robots_allowed"),
    httpStatus: integer("http_status"),
    fetchedBytes: integer("fetched_bytes"),
    extractedSha256: bytea("extracted_sha256"),
    llmModel: text("llm_model"),
    llmTokensIn: integer("llm_tokens_in"),
    llmTokensOut: integer("llm_tokens_out"),
    llmResult: jsonb("llm_result"),
    detectedLicense: text("detected_license"),
    licenseSource: licenseSource("license_source"),
    resourceId: ref("resource_id").references(() => resources.id, { onDelete: "set null" }),
    duplicateOf: ref("duplicate_of").references(() => resources.id, { onDelete: "set null" }),
    attempts: integer("attempts").notNull().default(0),
    lockedAt: ts("locked_at"),
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    /** slice 7: retry back-off; a queued item is not claimed before this time */
    nextAttemptAt: ts("next_attempt_at"),
    /** slice 7: page title as extracted (for the status list before a draft exists) */
    title: text("title"),
    /** slice 7: what the deterministic licence detection matched (file name, tag, SPDX line) */
    licenseEvidence: text("license_evidence"),
  },
  (t) => [
    index("ingestion_items_queue_idx").on(t.status, t.id).where(sql`${t.status} IN ('queued','running')`),
    // the same source can only be in flight once (two jobs pasting the same URL)
    uniqueIndex("ingestion_items_inflight_uq").on(t.sourceUrlNorm).where(sql`${t.status} IN ('queued','running')`),
  ],
);

export const resourceProvenance = pgTable("resource_provenance", {
  id: id(),
  resourceId: ref("resource_id").notNull().references(() => resources.id, { onDelete: "cascade" }),
  sourceUrl: text("source_url").notNull(),
  retrievedAt: ts("retrieved_at").notNull(),
  httpStatus: integer("http_status"),
  contentSha256: bytea("content_sha256"),
  license: text("license").notNull(),
  licenseSource: licenseSource("license_source").notNull(),
  licenseEvidence: text("license_evidence"),
  ingestionItemId: ref("ingestion_item_id").references(() => ingestionItems.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const bookmarks = pgTable(
  "bookmarks",
  {
    userId: ref("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    resourceId: ref("resource_id").notNull().references(() => resources.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.resourceId] })],
);

// ── analytics (slice 6): first-party, no raw IPs ──
export const events = pgTable(
  "events",
  {
    id: id(),
    type: eventType("type").notNull(),
    occurredAt: ts("occurred_at").notNull().defaultNow(),
    userId: ref("user_id").references(() => users.id, { onDelete: "set null" }),
    visitorHash: bytea("visitor_hash").notNull(),
    resourceId: ref("resource_id").references(() => resources.id, { onDelete: "set null" }),
    path: text("path").notNull(),
    referrerHost: text("referrer_host"),
    searchQuery: text("search_query"),
    /** the viewer lacked entitlement: conversion signal */
    locked: boolean("locked").notNull().default(false),
  },
  (t) => [
    check("events_path_len", sql`char_length(${t.path}) <= 300`),
    check("events_ref_len", sql`char_length(${t.referrerHost}) <= 253`),
    check("events_query_len", sql`char_length(${t.searchQuery}) <= 100`),
    index("events_type_time_idx").on(t.type, t.occurredAt),
    index("events_res_idx").on(t.resourceId, t.type, t.occurredAt).where(sql`${t.resourceId} IS NOT NULL`),
    index("events_time_brin").using("brin", t.occurredAt),
  ],
);

export const dailySalts = pgTable("daily_salts", {
  day: date("day", { mode: "string" }).primaryKey(),
  salt: bytea("salt").notNull(),
});

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: ts("window_start").notNull(),
    count: integer("count").notNull(),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

export const adminAuditLog = pgTable("admin_audit_log", {
  id: id(),
  actorId: ref("actor_id").notNull().references(() => users.id),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: ref("target_id"),
  diff: jsonb("diff"),
  createdAt: createdAt(),
});

// ── payment-ready stubs (no transactions processed in Phase 2) ──
export const orders = pgTable(
  "orders",
  {
    id: id(),
    userId: ref("user_id").notNull().references(() => users.id),
    tier: text("tier").notNull().references(() => tiers.code),
    periodDays: integer("period_days").notNull(),
    amountFen: integer("amount_fen").notNull(),
    currency: char("currency", { length: 3 }).notNull().default("CNY"),
    status: orderStatus("status").notNull().default("PENDING"),
    provider: text("provider"),
    providerRef: text("provider_ref").unique(),
    createdAt: createdAt(),
    paidAt: ts("paid_at"),
  },
  (t) => [
    check("orders_period", sql`${t.periodDays} > 0`),
    check("orders_amount", sql`${t.amountFen} >= 0`),
  ],
);

export const entitlements = pgTable(
  "entitlements",
  {
    id: id(),
    userId: ref("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tier: text("tier").notNull().references(() => tiers.code),
    source: grantSource("source").notNull(),
    orderId: ref("order_id").references(() => orders.id),
    startsAt: ts("starts_at").notNull().defaultNow(),
    endsAt: ts("ends_at"),
    grantedBy: ref("granted_by").references(() => users.id),
    revokedAt: ts("revoked_at"),
    revokedBy: ref("revoked_by").references(() => users.id),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("entitlements_user_idx").on(t.userId, t.startsAt.desc())],
);

// ── resource counters (dedup: visitor hash + resource + day) ──
export const resourceDailyVisitors = pgTable(
  "resource_daily_visitors",
  {
    resourceId: ref("resource_id").notNull().references(() => resources.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    /** "view" | "download" */
    kind: text("kind").notNull(),
    visitorHash: bytea("visitor_hash").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.resourceId, t.day, t.kind, t.visitorHash] }),
    index("resource_daily_visitors_day_idx").on(t.day),
    check("resource_daily_visitors_kind", sql`${t.kind} IN ('view','download')`),
  ],
);

// ── site announcements (shown once per visitor per day) ──
export const announcements = pgTable("announcements", {
  id: id(),
  title: text("title").notNull(),
  bodyMd: text("body_md").notNull().default(""),
  isActive: boolean("is_active").notNull().default(false),
  startsAt: ts("starts_at"),
  endsAt: ts("ends_at"),
  createdBy: ref("created_by").references(() => users.id),
  updatedBy: ref("updated_by").references(() => users.id),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

// ── admin API tokens (bulk upload over HTTPS); only the SHA-256 is stored ──
export const apiTokens = pgTable("api_tokens", {
  id: id(),
  userId: ref("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  tokenHash: bytea("token_hash").notNull().unique(),
  /** first characters of the token, shown in the list so the owner can tell tokens apart */
  prefix: text("prefix").notNull(),
  scopes: text("scopes").array().notNull(),
  lastUsedAt: ts("last_used_at"),
  expiresAt: ts("expires_at"),
  revokedAt: ts("revoked_at"),
  createdAt: createdAt(),
});
