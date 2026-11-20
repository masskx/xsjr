# Research Hub: Phase 2 Plan

Status: **proposal, awaiting approval.** No architectural change has been made.
Answers brief section 9.1: (a) the migration plan, (b) the full schema, (c) an ordered task list
with estimates, (d) risks. Section E lists the decisions and inputs needed from the owner.

---

## Status

| Slice | State |
|---|---|
| 0. Groundwork | Done here: parity baseline, tag-sort fix, plan. **Not done** (needs server access): SSH hardening, swap/mirror on the real box (bootstrap.sh automates swap), IP-TLS spike. |
| 1. Database + content migration | **Built and rehearsed, not yet deployed to production.** See CHANGELOG "slice 1" for what was verified. |
| 2. Authentication and sessions | **Built and tested, shipped switched off** (`AUTH_ENABLED=0`) until HTTPS exists; deploying it changes nothing visible. See CHANGELOG "slice 2" and RUNBOOK section 9. |
| 3. Admin CRUD (prompts) | **Built and tested** (82 tests, 30 browser checks). Only reachable once accounts are on. Skills/modules editing follows in slice 5. |
| 4. Tiers and gating | **Built and tested** (109 tests; 22 gating checks across anonymous / FREE / EI / SCI / expired / revoked, HTML and RSC). |
| 5. Module gallery and diagrams | **Built and tested** (126 tests; 25 browser checks; other pages unchanged). Also admin editors for modules and skills. |
| 6. Analytics | **Built and tested** (149 tests; 21 browser checks; 1M-event benchmark). Visitor uniqueness is per day by design (see CHANGELOG). |
| 7. DeepSeek ingestion | **Built and tested** (190 tests; 27 browser checks against a local fixture site with fake DeepSeek and search endpoints). Needs `DEEPSEEK_API_KEY` on the server; query mode also needs `SEARCH_PROVIDER=bocha` + `BOCHA_API_KEY`. Not yet tried against the real DeepSeek or Bocha APIs. |

Deviations made in slice 7: the worker runs **inside the app process** (started from `instrumentation.ts`, one item at a time) rather than as a separate `worker` service, which saves a container and ~100 MB; the fetcher uses `node:http(s)` with a pinned-address `lookup` instead of undici; GitHub licences come from the repo's raw `LICENSE` file (deterministic text match) instead of the GitHub licence API, so only `raw.githubusercontent.com` is contacted; a partial unique index stops the same URL being in flight twice.

Deviations from this plan made during slice 1 (the sections below are otherwise unchanged):

- **Schema:** `categories` and `tags` are keyed by `name` (no slug column yet; nothing routes by
  them). `resource_tags.position` keeps authored tag order. Optional content fields
  (`prompt_variables.required`, `notes`, `risks`, `usage`, …) are nullable so the database can
  tell "not given" from "empty" and round-trips are exact.
- **Compose service names:** the app service is `app`, not `web`. Phase 1 already uses `web` for
  Caddy; a distinct name lets the new app start and pass health checks while the static site still
  serves, which is what makes the cutover ~0.3 s.
- **404 handling:** Next 16.4 renders `notFound()` from a dynamic page as an empty `__next_error__`
  HTML shell (the 404 surfaces through the streamed-metadata outlet, outside every not-found
  boundary). Unknown/unpublished slugs are therefore rewritten in `proxy.ts` to a path no route
  matches; the pages keep `notFound()` as a second line of defence.
- **Caching:** an in-process snapshot of published content invalidated by `LISTEN/NOTIFY`
  instead of Next's tag cache. Simpler, works without Cache Components, and unpublish takes effect
  on the next request (measured < 0.5 s).
- **Runtime image:** no image is built. Releases are plain directories (standalone server +
  bundled scripts) bind-mounted read-only into stock `node:24-alpine`. Nothing is built on the
  server, and there is no registry to run.
- **Sessions are absolute, not sliding** (30 days users, 12 hours admins): the cookie and the
  database row expire together, and refreshing a cookie on every request would need the proxy to
  touch the database for every page.
- **Login availability is a hard rule in code**, resolving the Secure-cookie vs plain-HTTP
  conflict (A.4): accounts open only on https (or localhost); otherwise every account route 404s.
- **Ordering:** up/down buttons (keyboard-accessible) instead of drag-and-drop; positions are
  renumbered on every move. Public order became featured, position, date (see CHANGELOG).
- **Editing a published prompt is live on save** (with a version snapshot), rather than a
  separate "pending changes" copy. Simpler, and the history is kept.
- **Deploy pre-flight:** the new release is booted in a temporary container and must render
  `/`, `/robots.txt` and `/sitemap.xml` before anything switches. A broken release is rejected
  with zero visitor impact (rehearsed).

---

## What was verified before writing this plan

The repository is not in this working session, so the plan rests on the brief plus read-only
probes of the live site (2026-11-19):

| Check | Result | Consequence for the plan |
|---|---|---|
| `GET http://129.204.142.223/` | 200, 87 KB, about 1.1 s from outside China | baseline for the parity diff |
| `sitemap.xml` | 22 URLs, **all with trailing slashes** | server mode must keep `trailingSlash: true`, or every URL changes |
| `/modules/stat-tests-py` (no slash) | 200, served via Caddy `try_files` | Next will answer 308 → `/…/`. Canonical URLs stay the same; only the redirect differs. |
| `/modules/does-not-exist/` | 404 | keep the not-found behaviour |
| `https://129.204.142.223/` | no answer | **no TLS today**, which blocks `Secure` cookies (see A.4) |
| `/_next/static/*` | `Cache-Control: public, max-age=31536000, immutable` | keep as is |
| Security headers | nosniff, SAMEORIGIN, referrer-policy and permissions-policy are present; CSP and HSTS are not | add CSP in slice 2 and HSTS once TLS exists |
| Module pages | full code is in the HTML (up to 155 KB) | code that is public today has already been crawled (see risk R6) |
| SSH (port 22) from this session | refused | this session cannot deploy (see E) |

### A.0 Findings from the code (`masskx/xsjr` @ `9b587a2`, read 2026-11-19)

| Finding | Effect on the plan |
|---|---|
| The repo, built on Linux, is **identical to production on all 47 routes** (parity tool, after the fix below) | The repo is authoritative. Slice 1 can use the live site as its baseline. |
| **Bug, fixed:** tag lists sorted with `localeCompare()` and no locale (`components/type-listing.tsx:26`, `lib/content.ts:127`), so order followed the build machine's locale. A Linux build showed different tags on all four list pages, and the client-side re-sort followed each visitor's browser locale. | Pinned to `"zh-CN"`, which reproduces the Windows output byte for byte. Committed on `phase2/slice0-prep`. Without it, slice 1 could not pass parity on a Linux container. |
| All 15 resources are `tier: FREE`; `PRO` exists only in types and `ProBadge` | No PRO→EI mapping needed. Slice 4 replaces the type and badge. |
| Ordering is featured first, then `updatedAt` desc, then directory read order (prompts, skills, modules, sites; alphabetical within each). All `updatedAt` values are the same date. | The importer derives `sort_order` from exactly this comparator, so slice 1 ordering is unchanged. Admin reordering then edits `sort_order`. |
| `SITE_URL` comes from `NEXT_PUBLIC_SITE_URL`, which is inlined at build time | Switch to a server-only runtime `SITE_URL` so the domain can change with no rebuild (A.7). |
| The search index is built on the server and passed to the client component as props | Keep it that way (no `/search-index.json` route): the `/search/` page is cached and invalidated like any list. Simpler, and parity-safe. |
| Fields the brief does not list: prompts `notes[]`; skills `dependencies[]` and `files[]` = declared tree with `desc`/`size` (only `SKILL.md` is stored); modules `usage[]` are plain strings | Schema updated (B). |
| Site licences are free-text terms-of-service notes, not SPDX ids | `license` stays free text; sites import as `license_source='PAGE_DECLARED'`, `redistribution=false`. |
| Module pages render only the `entry` file; every module has exactly one file today | Per-file tabs are new work in slice 5, not a migration concern. |
| `deploy.ps1` does `rm -rf site` then `mv site.new site` (a short window with no site, no previous release kept) | Replaced by the releases/current/previous scheme in slice 1. |
| No lint, test or typecheck scripts; no ESLint config | Add `typecheck` (`tsc --noEmit`), ESLint with the `no-restricted-imports` DB rule, and Vitest in slice 1. |
| `docs/ADR-001` refers to a PRD/TDD (V0.1) that is not in the repo, and proposes an `npx` CLI installer | The CLI stays out of scope (brief §11). Ask the owner to add the PRD/TDD if they still matter. |

---

## A. Migration plan: static export to server mode

### A.1 Target runtime on the box

```
                 :80 / :443
                     │
               ┌─────▼─────┐   /media/*  → file_server (uploads volume, read-only)
               │   Caddy   │   /_next/static/* → immutable cache header
               └─────┬─────┘   everything else → reverse_proxy web:3000
                     │  (internal docker network "app")
        ┌────────────┼──────────────┐
  ┌─────▼─────┐ ┌────▼─────┐  ┌─────▼──────┐
  │ web       │ │ worker   │  │ postgres16 │  no published ports
  │ Next 16   │ │ ingestion│  │ named vol  │
  │ standalone│ │ + cron   │  │ pg_data    │
  └───────────┘ └──────────┘  └────────────┘
```

| Service | Image | Memory limit | Notes |
|---|---|---|---|
| caddy | caddy:2-alpine (existing) | 128 MB | `reverse_proxy web:3000 { lb_try_duration 8s }` holds requests during a restart |
| web | node:24-alpine + release dir mounted read-only | 640 MB, `--max-old-space-size=448` | `.next/cache` on a writable tmpfs or volume |
| worker | same image and release, `node worker.mjs` | 256 MB | ingestion jobs, nightly backup trigger, salt rotation |
| postgres | postgres:16-alpine | 640 MB | `shared_buffers=128MB`, `max_connections=30`, `work_mem=4MB` |
| host swap | 2 GB swapfile | n/a | a safety net, not capacity |

Total ceiling is about 1.7 GB of the 3.1 GB free.

### A.2 Key choices

| Decision | Choice | Why |
|---|---|---|
| ORM | **Drizzle** with `node-postgres` | No binary query engine (smaller image, less RAM). SQL-first migrations are plain `.sql` files you can review. Raw SQL is easy for analytics. Schema in TS gives types end to end. |
| Node | 24 LTS | current LTS line |
| Build output | `output: "standalone"` | a self-contained `server.js` with traced `node_modules`, about 40 MB |
| Password hashing | Argon2id via **`hash-wasm`** (WASM) at m=19 MiB, t=2, p=1 (OWASP baseline) | No native binary, so a build made on Windows runs unchanged on Linux. This removes the main cross-platform build trap. |
| Images | `images.unoptimized: true`, no `sharp` | keeps the artifact free of native deps; diagrams are uploaded already sized |
| Structure diagram | **Stored image** (PNG/JPEG/WebP, ≤ 2 MB) on a persistent volume. If none is uploaded, fall back to a **server-rendered file tree** built from `resource_files` (plain HTML/SVG). | Server-side Mermaid needs a headless browser (`mermaid-cli` uses Puppeteer), which this box cannot afford. A file-tree fallback means every module has a diagram from day one. SVG uploads are refused (script/XSS vector). |
| Uploads storage | host bind mount `/opt/research-hub/data/uploads`, served by Caddy at `/media/` | Diagrams are public by rule, so no auth is needed. It is backed up with the DB dump (A.6). It can move to Tencent COS later behind the same `storage_key`. |
| Syntax highlighting | Shiki, server-side, with a fixed small language set (py, sh, json, ts, yaml, md). Output is cached per file content hash. | ships no highlighter JS to the browser |
| Search | Keep the current scorer and the current delivery: the `/search/` server component builds the index from published rows (pinyin-pro on the server only) and passes it as props. The page is cached and invalidated on publish/unpublish like any list. | Behaviour is unchanged, and pinyin-pro still never ships to the browser. The index only ever holds title/summary/tags, never code. |
| Data access | `lib/content.ts` becomes `lib/repo/*`, **keeping the same exported function names and return types** | pages change minimally. Page components never import `db`, and an ESLint `no-restricted-imports` rule enforces it. |
| Gated code | `repo.modules.getPublic(slug)` **never selects `resource_files.content`**. Code comes only from `repo.modules.getCode(slug, viewer)`, which runs the entitlement check first. | Withholding is structural: the public query cannot return code. |
| Caching | DB reads go through Next's tagged server cache (`'use cache'` + `cacheTag` with Cache Components, otherwise `unstable_cache` with tags). Admin mutations call tag invalidation (`resource:<slug>`, `list:<type>`, `sitemap`, `search`). Module detail pages read the session cookie inside a Suspense boundary, so the code block is never cached across viewers. | The build needs no database (the build runs on Windows). Unpublishing invalidates immediately. The exact API is confirmed in the slice 1 spike, because the Next 16 cache model has two modes. |
| Build machine | **Preferred:** `docker buildx --platform linux/amd64 --output type=local` on Windows, using Docker as a Linux build box only. **Fallback:** native `npm.cmd run build` on Windows. Both produce the same tarball. | Never builds on the server. Because there are no native deps, the fallback is safe. |

### A.3 Releases and deploy (one command, atomic, reversible)

```
/opt/research-hub/
  compose.yaml  Caddyfile  .env (0600, root-owned)
  releases/2026-11-25T1030-<sha>/   app/ (standalone)  worker.mjs  migrations/
  current  -> releases/…           (symlink; compose mounts ./current read-only)
  previous -> releases/…
  site/                            old static build, kept until slice 3 as instant fallback
  data/uploads/   backups/
```

`deploy.ps1` (kept ASCII-only, run with `-ExecutionPolicy Bypass`):
1. Build locally, run typecheck, lint and tests, then tar the release.
2. `scp` the tarball and extract it to `releases/<id>/`.
3. Run migrations in a one-off container (`docker compose run --rm migrate`). Migrations are **expand-only**: add columns and tables, never drop in the same release. Code is always compatible with the previous schema, so rollback never needs a down-migration.
4. Repoint `previous` and `current`, then `docker compose up -d --force-recreate web worker`. Caddy's `lb_try_duration` holds requests during the 2–4 s restart, so visitors see a slow response, not an error.
5. Smoke-check through Caddy from the server (`curl` every route, a 404, an entitlement probe). If any check fails, roll back automatically.
6. Prune to the last 5 releases.

Rollback is `deploy.ps1 -Rollback`: swap `current` and `previous`, then recreate. It takes one step, a few seconds.

### A.4 Conflict: Secure cookies over plain-HTTP IP access

The brief requires `Secure` session cookies (§4) but the site is HTTP-only until the domain and ICP
filing exist (§7.9). Browsers drop `Secure` cookies on `http://`, and sending passwords over plain
HTTP is not acceptable.

**Proposed resolution:**
1. **Slice 0 spike:** get TLS on the bare IP. Let's Encrypt issues short-lived certificates for IP addresses, and Caddy can request one with `tls { issuer acme { profile shortlived } }` on a site address of `129.204.142.223`. The ICP block applies to domain/SNI traffic, so IP-only HTTPS should be unaffected. This must be proven on the box, not assumed.
2. If that works, auth ships normally on `https://129.204.142.223/`, and HTTP redirects to HTTPS.
3. If it does not, slice 2 deploys with **login and registration disabled by env flag** (`AUTH_ENABLED=false`). The public site is unaffected. Auth is switched on only when TLS exists. No dev-mode insecure cookies in production.

### A.5 Slice 1 cutover with zero visible change

1. **Baseline.** Crawl all 22 sitemap URLs plus `/search/`, `robots.txt`, `sitemap.xml` and a 404 from the live static site. Store raw HTML and a normalised text extraction that strips build hashes and script tags.
2. **Back up** `content/`, the server's `/opt/research-hub/` and the current `site/`. Store these in the repo-external backup folder and on the server.
3. **Import.** `scripts/import-content.ts` reuses the existing `lib/types.ts` validators. In one transaction it upserts each resource by slug and replaces child rows (files, variables, compat, tags). It is idempotent: a `content_hash` skips unchanged items, and `--dry-run` prints the diff. Once a resource has been edited in the admin (`origin='ADMIN'` or `updated_by IS NOT NULL`), the importer refuses to overwrite it without `--force`, so files and DB never silently fight. After slice 3 the **DB is the source of truth** and `content/` is an import format only. `scripts/export-content.ts` writes the DB back to the same layout for diffing and offline backup.
4. Start `postgres` and `web` next to the running static Caddy. Verify through a temporary loopback-only Caddy site (`127.0.0.1:8081`) over SSH, and run the **parity diff** against the baseline. It must show zero text differences on all routes.
5. Switch the Caddyfile from `file_server` to `reverse_proxy` and run `caddy reload`, which drops no connections.
6. Re-run the parity diff against the public URL. **Rollback** is to restore the old Caddyfile and reload; `site/` is still there.

### A.6 Backups

- **Nightly 03:30 Asia/Shanghai:** `pg_dump -Fc` plus a tar of `data/uploads` go to `/opt/research-hub/backups/` with 14 daily and 8 weekly copies. Each set is then **copied off-box** to a Tencent COS bucket (owner to supply; see E). A same-disk dump does not survive disk loss. Also recommended: a Tencent CBS snapshot policy on the system disk (console setting, owner).
- **Restore drill** (scripted, run once per slice from slice 1 on, and monthly afterwards): restore the latest dump into a scratch database `rh_restore`, compare per-table row counts and a checksum of `resources`/`resource_files` with production, then drop `rh_restore`. The result is logged to `backups/restore-drill.log` and summarised in the runbook.

### A.7 Domain, TLS and ICP switch (no code change)

Everything is driven by `.env`:

```
SITE_ORIGIN=https://129.204.142.223       # used for canonical URLs, sitemap, mail links
CADDY_SITE_ADDRESS=129.204.142.223        # later: "example.cn, www.example.cn"
ICP_RECORD=                               # filing number shown in the footer when set
PSB_RECORD=                               # public-security filing number when set
```

The Caddyfile uses `{$CADDY_SITE_ADDRESS}`. The owner's steps after filing completes are documented
in the runbook: add the apex A record, set the three variables, run `deploy.ps1 -ConfigOnly`, then
verify. Note that a filed site must show the ICP number in the footer, linked to the MIIT
site, and must complete the public-security (PSB) filing within 30 days of going live.

---

## B. Full schema (PostgreSQL 16)

The schema is written as SQL so it can be reviewed independently of the ORM. The Drizzle schema in
`lib/db/schema.ts` mirrors it 1:1, and migrations are generated from it.

```sql
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE resource_type   AS ENUM ('PROMPT','SKILL','MODULE','SITE');
CREATE TYPE resource_status AS ENUM ('DRAFT','PUBLISHED','ARCHIVED');
CREATE TYPE resource_origin AS ENUM ('FILE_IMPORT','ADMIN','INGESTION');
CREATE TYPE user_role       AS ENUM ('USER','ADMIN');
CREATE TYPE var_type        AS ENUM ('text','textarea','select','boolean');
CREATE TYPE token_purpose   AS ENUM ('EMAIL_VERIFY','PASSWORD_RESET','INVITE');
CREATE TYPE event_type      AS ENUM ('page_view','copy','search','login','register');
CREATE TYPE job_status      AS ENUM ('queued','running','failed','done');
CREATE TYPE license_source  AS ENUM ('PLATFORM','SPDX_DETECTED','PAGE_DECLARED','ADMIN_DECLARED','UNKNOWN');
CREATE TYPE order_status    AS ENUM ('PENDING','PAID','CANCELLED','REFUNDED');
CREATE TYPE grant_source    AS ENUM ('ADMIN_GRANT','ORDER','PROMO');

-- ── Tiers: a lookup table, not an enum, so a future top-journal tier is one INSERT ──
CREATE TABLE tiers (
  code      text PRIMARY KEY CHECK (code ~ '^[A-Z][A-Z0-9_]{1,15}$'),
  rank      smallint NOT NULL UNIQUE,          -- access iff user rank >= resource rank
  label_zh  text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);
-- seed: ('FREE',0,…), ('EI',10,…), ('SCI',20,…)   -- gaps leave room for new tiers

-- ── Users and auth ──
CREATE TABLE users (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email             citext NOT NULL UNIQUE,
  password_hash     text NOT NULL,                       -- argon2id PHC string
  display_name      text CHECK (char_length(display_name) <= 40),
  role              user_role NOT NULL DEFAULT 'USER',
  tier              text NOT NULL DEFAULT 'FREE' REFERENCES tiers(code),
  tier_expires_at   timestamptz,
  email_verified_at timestamptz,
  totp_secret_enc   bytea,                               -- AES-256-GCM, key derived from AUTH_SECRET
  totp_enabled_at   timestamptz,
  failed_logins     int NOT NULL DEFAULT 0,
  locked_until      timestamptz,
  disabled_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  last_login_at     timestamptz,
  CONSTRAINT free_has_no_expiry CHECK (tier <> 'FREE' OR tier_expires_at IS NULL)
);
CREATE INDEX users_created_idx ON users (created_at);
CREATE INDEX users_tier_idx    ON users (tier);

CREATE TABLE sessions (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id         bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash      bytea NOT NULL UNIQUE,                 -- sha256 of the 32-byte cookie token
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,                  -- 30 d sliding (users), 12 h (admins)
  mfa_verified_at timestamptz,
  reauth_at       timestamptz,                           -- destructive admin actions need < 10 min
  revoked_at      timestamptz,
  user_agent      text CHECK (char_length(user_agent) <= 300)
);
CREATE INDEX sessions_user_active_idx ON sessions (user_id) WHERE revoked_at IS NULL;

CREATE TABLE auth_tokens (                               -- verify / reset / invite links
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     bigint REFERENCES users(id) ON DELETE CASCADE,
  email       citext NOT NULL,
  purpose     token_purpose NOT NULL,
  token_hash  bytea NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_by  bigint REFERENCES users(id),              -- set when an admin issued it
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mail_outbox (                               -- every mail goes through here; see C slice 2
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  to_email    citext NOT NULL,
  template    text NOT NULL,
  payload     jsonb NOT NULL,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','held')),
  attempts    int NOT NULL DEFAULT 0,
  last_error  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  sent_at     timestamptz
);

-- ── Taxonomy and media ──
CREATE TABLE categories (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug       text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name       text NOT NULL,
  sort_order int NOT NULL DEFAULT 0
);
CREATE TABLE tags (
  id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL
);
CREATE TABLE media (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  storage_key text NOT NULL UNIQUE CHECK (storage_key ~ '^[a-z0-9/_-]+\.(png|jpg|webp)$'),
  mime        text NOT NULL CHECK (mime IN ('image/png','image/jpeg','image/webp')),
  bytes       int  NOT NULL CHECK (bytes BETWEEN 1 AND 2097152),
  width       int, height int,
  sha256      bytea NOT NULL,
  alt         text,
  created_by  bigint REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── Resources ──
CREATE TABLE resources (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type               resource_type NOT NULL,
  slug               text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),  -- global, stable
  title              text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 80),
  summary            text NOT NULL CHECK (char_length(summary) BETWEEN 20 AND 110),
  body_md            text NOT NULL DEFAULT '',
  applicable_tasks   text[] NOT NULL DEFAULT '{}',
  category_id        bigint REFERENCES categories(id),
  required_tier      text NOT NULL DEFAULT 'FREE' REFERENCES tiers(code),
  status             resource_status NOT NULL DEFAULT 'DRAFT',
  sort_order         int NOT NULL DEFAULT 0,
  featured           boolean NOT NULL DEFAULT false,
  author             text NOT NULL,
  license            text NOT NULL,                    -- SPDX id, or 'NOASSERTION'
  license_source     license_source NOT NULL,
  license_note       text,
  redistribution     boolean NOT NULL,
  source_url         text,
  source_url_norm    text,                             -- dedup key, see slice 7
  structure_media_id bigint REFERENCES media(id) ON DELETE SET NULL,
  origin             resource_origin NOT NULL,
  content_hash       bytea,                            -- importer change detection
  content_updated_on date NOT NULL,                    -- the displayed "updatedAt" from meta.json
  verified_on        date,
  published_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_by         bigint REFERENCES users(id),
  updated_by         bigint REFERENCES users(id),
  -- Phase-2 business rule; drop the constraint if it ever changes
  CONSTRAINT prompts_skills_free CHECK (type NOT IN ('PROMPT','SKILL') OR required_tier = 'FREE'),
  -- legal rule: unknown licence is never redistributed
  CONSTRAINT unknown_license_index_only CHECK (license_source <> 'UNKNOWN' OR redistribution = false),
  CONSTRAINT published_has_ts CHECK (status <> 'PUBLISHED' OR published_at IS NOT NULL)
);
CREATE UNIQUE INDEX resources_source_norm_uq ON resources (source_url_norm) WHERE source_url_norm IS NOT NULL;
CREATE INDEX resources_list_idx  ON resources (type, status, sort_order, id);
CREATE INDEX resources_cat_idx   ON resources (category_id) WHERE status = 'PUBLISHED';
CREATE INDEX resources_title_trgm ON resources USING gin (title gin_trgm_ops);
-- App-layer rule (cross-table): redistribution = false ⇒ no resource_files rows and body_md holds only our own notes.

CREATE TABLE resource_tags (
  resource_id bigint NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  tag_id      bigint NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (resource_id, tag_id)
);
CREATE INDEX resource_tags_tag_idx ON resource_tags (tag_id);

CREATE TABLE resource_files (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  resource_id bigint NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  path        text NOT NULL CHECK (
                char_length(path) BETWEEN 1 AND 200
                AND path !~ '^/' AND path !~ '^[A-Za-z]:' AND path !~ '\\'
                AND path !~ '(^|/)\.\.(/|$)'),
  content     text NOT NULL,                     -- NEVER selected by public queries
  language    text NOT NULL,
  size_bytes  int  NOT NULL,
  is_entry    boolean NOT NULL DEFAULT false,
  sort_order  int NOT NULL DEFAULT 0,
  UNIQUE (resource_id, path)
);

CREATE TABLE resource_module (                   -- 1:1 type details
  resource_id  bigint PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,
  language     text NOT NULL,
  entry_path   text NOT NULL,
  env          text[] NOT NULL DEFAULT '{}',
  dependencies text[] NOT NULL DEFAULT '{}',
  usage        text[] NOT NULL DEFAULT '{}'      -- meta.json usage[] (plain strings today)
);
CREATE TABLE resource_prompt (
  resource_id  bigint PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,
  notes        text[] NOT NULL DEFAULT '{}'      -- meta.json notes[]; template.md lives in resource_files
);
CREATE TABLE resource_skill (
  resource_id  bigint PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,
  risks        text[] NOT NULL DEFAULT '{}',
  dependencies text[] NOT NULL DEFAULT '{}',
  file_tree    jsonb  NOT NULL DEFAULT '[]',     -- declared files[] {path,size?,desc?}; only SKILL.md is stored
  install_note text
);
CREATE TABLE resource_site (
  resource_id    bigint PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,
  url            text NOT NULL CHECK (url ~ '^https?://'),
  pricing        text NOT NULL,
  region         text NOT NULL,
  login_required boolean NOT NULL
);
CREATE TABLE prompt_variables (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  resource_id   bigint NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  key           text NOT NULL CHECK (key ~ '^[a-zA-Z_][a-zA-Z0-9_]{0,39}$'),
  label         text NOT NULL,
  type          var_type NOT NULL,
  required      boolean NOT NULL DEFAULT false,
  default_value text,
  help          text,
  options       jsonb NOT NULL DEFAULT '[]',
  sort_order    int NOT NULL DEFAULT 0,
  UNIQUE (resource_id, key)
);
CREATE TABLE skill_compat (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  resource_id     bigint NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  tool_key        text NOT NULL,
  supported_range text NOT NULL,
  install_path    text,
  note            text,
  sort_order      int NOT NULL DEFAULT 0,
  UNIQUE (resource_id, tool_key)
);
CREATE TABLE resource_versions (                 -- full snapshot written on every publish
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  resource_id bigint NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  version     int NOT NULL,
  snapshot    jsonb NOT NULL,                    -- resource + details + files + vars + compat + tags
  note        text,
  created_by  bigint REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (resource_id, version)
);
CREATE TABLE resource_provenance (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  resource_id       bigint NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  source_url        text NOT NULL,
  retrieved_at      timestamptz NOT NULL,
  http_status       int,
  content_sha256    bytea,                       -- of the extracted text that was sent to the LLM
  license           text NOT NULL,
  license_source    license_source NOT NULL,
  license_evidence  text,                        -- e.g. "LICENSE file: MIT (SPDX match)"
  ingestion_item_id bigint,                      -- FK added after ingestion_items
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bookmarks (
  user_id     bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource_id bigint NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, resource_id)
);

-- ── Analytics (first-party, no raw IPs) ──
CREATE TABLE events (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type          event_type NOT NULL,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  user_id       bigint REFERENCES users(id) ON DELETE SET NULL,
  visitor_hash  bytea NOT NULL,                  -- see slice 6; never an IP
  resource_id   bigint REFERENCES resources(id) ON DELETE SET NULL,
  path          text NOT NULL CHECK (char_length(path) <= 300),
  referrer_host text CHECK (char_length(referrer_host) <= 253),
  search_query  text CHECK (char_length(search_query) <= 100),
  locked        boolean NOT NULL DEFAULT false   -- viewer lacked entitlement: conversion signal
);
CREATE INDEX events_type_time_idx ON events (type, occurred_at);
CREATE INDEX events_res_idx       ON events (resource_id, type, occurred_at) WHERE resource_id IS NOT NULL;
CREATE INDEX events_time_brin     ON events USING brin (occurred_at);

CREATE TABLE daily_salts (day date PRIMARY KEY, salt bytea NOT NULL);   -- rows older than 1 day deleted

CREATE TABLE rate_limits (                       -- fixed-window counters (login, register, copy, reset)
  key          text NOT NULL,                    -- e.g. 'login:ip:<hash>' / 'login:acct:<id>'
  window_start timestamptz NOT NULL,
  count        int NOT NULL,
  PRIMARY KEY (key, window_start)
);

CREATE TABLE admin_audit_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id    bigint NOT NULL REFERENCES users(id),
  action      text NOT NULL,                     -- 'resource.publish', 'user.grant_tier', …
  target_type text NOT NULL,
  target_id   bigint,
  diff        jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── Ingestion ──
CREATE TABLE ingestion_jobs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mode        text NOT NULL CHECK (mode IN ('URL','BULK','QUERY')),
  status      job_status NOT NULL DEFAULT 'queued',
  input       jsonb NOT NULL,                    -- urls[] or {query, allowed_domains[]}
  created_by  bigint NOT NULL REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  started_at  timestamptz, finished_at timestamptz,
  error       text
);
CREATE TABLE ingestion_items (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id              bigint NOT NULL REFERENCES ingestion_jobs(id) ON DELETE CASCADE,
  status              job_status NOT NULL DEFAULT 'queued',
  source_url          text NOT NULL,
  source_url_norm     text NOT NULL,
  robots_allowed      boolean,
  http_status         int,
  fetched_bytes       int,
  extracted_sha256    bytea,
  llm_model           text,
  llm_tokens_in       int, llm_tokens_out int,
  llm_result          jsonb,                     -- validated extraction output
  detected_license    text,
  license_source      license_source,
  resource_id         bigint REFERENCES resources(id) ON DELETE SET NULL,   -- the draft created
  duplicate_of        bigint REFERENCES resources(id) ON DELETE SET NULL,
  attempts            int NOT NULL DEFAULT 0,
  locked_at           timestamptz,
  error               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ingestion_items_queue_idx ON ingestion_items (status, id) WHERE status IN ('queued','running');
ALTER TABLE resource_provenance
  ADD FOREIGN KEY (ingestion_item_id) REFERENCES ingestion_items(id) ON DELETE SET NULL;

-- ── Payment-ready stubs (no transactions processed in Phase 2) ──
CREATE TABLE orders (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      bigint NOT NULL REFERENCES users(id),
  tier         text NOT NULL REFERENCES tiers(code),
  period_days  int NOT NULL CHECK (period_days > 0),
  amount_fen   int NOT NULL CHECK (amount_fen >= 0),   -- CNY minor units
  currency     char(3) NOT NULL DEFAULT 'CNY',
  status       order_status NOT NULL DEFAULT 'PENDING',
  provider     text, provider_ref text UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  paid_at      timestamptz
);
CREATE TABLE entitlements (                      -- ledger; users.tier/tier_expires_at is the cached "current"
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier        text NOT NULL REFERENCES tiers(code),
  source      grant_source NOT NULL,
  order_id    bigint REFERENCES orders(id),
  starts_at   timestamptz NOT NULL DEFAULT now(),
  ends_at     timestamptz,
  granted_by  bigint REFERENCES users(id),
  revoked_at  timestamptz, revoked_by bigint REFERENCES users(id),
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX entitlements_user_idx ON entitlements (user_id, starts_at DESC);
```

**Entitlement check** (`lib/auth/entitlement.ts`, the single implementation, unit-tested):

```ts
effectiveTier(user) = !user || user.disabled_at ? 'FREE'
                    : user.tier !== 'FREE' && user.tier_expires_at && user.tier_expires_at <= now ? 'FREE'
                    : user.tier
canAccess(user, resource) = rank(effectiveTier(user)) >= rank(resource.required_tier)
```

Expiry is evaluated at read time, so access does not depend on a cron job. A worker task
normalises expired rows nightly for reporting. An admin grant writes an `entitlements` row and
updates `users.tier` in the same transaction, which leaves an audit trail before payment exists.

---

## C. Ordered task list with estimates

Estimates are engineer-days for one engineer, including verification and docs. Each slice ends with:
local typecheck, lint, unit tests and build pass; deploy; `curl` status of every affected route on
the public URL (including a 404 and a logged-out entitlement probe); a screenshot at 390 px and
1280 px for UI changes, with the `scrollWidth === clientWidth` check; a CHANGELOG entry.

| # | Slice | Contents | Est. |
|---|---|---|---|
| 0 | **Safety and groundwork** | Install the engineer's SSH key, disable `PasswordAuthentication` and rotate the `ubuntu` password (the old one is compromised: it was pasted into this brief and this chat). Add 2 GB swap and enable `ufw` matching the security group. Back up `content/` and `/opt/research-hub`. Put the repo under git if it is not already. Configure a Docker registry mirror on the server (Tencent `mirror.ccs.tencentyun.com`) and pre-pull `postgres:16-alpine` and `node:24-alpine`. Run the **IP-TLS spike** (A.4). Capture the parity baseline (A.5.1). | 1–1.5 |
| 1 | **DB and content migration, zero visible change** | Drizzle schema plus migration 0001 (whole schema; unused tables are harmless). `lib/repo/*` with the same API as `content.ts`. `next.config`: standalone, `trailingSlash: true`, `images.unoptimized`. Request-time sitemap, robots and search index. Import/export scripts with `--dry-run`. Compose with postgres, web and the migrate one-off. New `deploy.ps1` (releases/current/previous, rollback). Nightly backup with off-box copy and the first **restore drill**. Cutover via `caddy reload` (A.5). Measure P95 with `autocannon` on the server against 5 detail pages. | 4–5 |
| 2 | **Authentication and sessions** | Register, login, logout, verification, reset. `__Host-rh_s` cookie (HttpOnly, Secure, SameSite=Lax, Path=/). Server-side sessions with sliding expiry, rotated on login and on privilege change. Argon2id. Password rules: at least 10 chars for users and 14 for admins, checked against a bundled 10k common-password list. Lockout with backoff. Postgres rate limits per IP-hash and per account. Origin check on route handlers (Server Actions already check it). CSP header. Admin bootstrap CLI (`node scripts/create-admin.mjs`, run in the container). **TOTP MFA for ADMIN**, with re-auth under 10 minutes before destructive actions. Mail via `mail_outbox` with a pluggable driver: `smtp` (provider over port 465; Tencent blocks 25) or `hold`. With `hold`, mails wait in the outbox, an admin can view and copy the link, and **self-service reset is disabled**. Unverified accounts can log in but cannot be granted a tier. User centre: profile, tier and expiry, change password, sessions list with sign-out-everywhere, delete account. **Privacy policy and user agreement pages, with consent at registration** (PIPL; collecting emails makes these mandatory, and the brief does not mention them). | 4–5 |
| 3 | **Admin CRUD: prompts** | `/admin` layout with role guard in a server layout, re-checked in every action (never UI hiding). Prompt list with status, drag reorder (writes `sort_order`) and filters. Editor covering meta, body (markdown preview with `html:false`), variable schema editor with live playground preview, category and tags. Draft, publish and unpublish, with a version snapshot on publish. Tag invalidation. Unpublished items 404 and are absent from the sitemap and search index, verified by curl. Audit log. Zod validation shared by import, admin and ingestion. | 3–4 |
| 4 | **Tiers and server-side gating** | Tier admin: user list with tier and registration date, grant or revoke with expiry, which writes `entitlements`. Required-tier selector on modules (prompts and skills are fixed to FREE by constraint). `repo.modules.getCode` gate. Locked state for card and detail (title, summary, tasks and diagram visible; code replaced by a login or upgrade panel). `Cache-Control: private, no-store` on responses that contain gated code. Test matrix: anonymous, FREE, EI, SCI and expired EI against FREE, EI and SCI modules. **curl check that a gated file's unique marker string is absent from the anonymous HTML and RSC payload.** | 2–3 |
| 5 | **Module gallery and structure diagrams, plus admin CRUD for skills and modules** | Gallery grid with thumbnail (diagram or generated file tree), category and tag filters as URL query params (shareable, server-rendered). Detail order: diagram, intro, applicable tasks, tabbed code (Shiki, copy per file), environment, dependencies, usage. Upload endpoint: magic-byte check, 2 MB cap, random key, no SVG, EXIF-free re-save not possible without sharp so JPEG is accepted as is (documented). Admin editors for modules (files, tasks, env, usage, image) and skills (compat rows, file tree, risks). | 4–5 |
| 6 | **Analytics** | `POST /api/e` first-party beacon (`sendBeacon`) for `page_view` (including client-side navigations), `copy` and `search` (debounced final query, at least 2 chars). `login` and `register` are logged directly in the server actions. Bot user-agent filter. Visitor id: see the decision in E.6. Referrer reduced to host. Day boundaries in Asia/Shanghai. Dashboard showing PV and UV for today, 7 days and 30 days; top copied resources; top queries; registrations; tier distribution; most-viewed locked resources (`locked = true`); one 30-day trend line as inline SVG with no chart library. Queries `EXPLAIN`ed against 1M synthetic rows, target under 100 ms. Retention: raw events 13 months. | 2–3 |
| 7 | **DeepSeek ingestion** | Worker queue using `FOR UPDATE SKIP LOCKED` on `ingestion_items`, with retries and backoff. Fetcher: undici with a 10 s timeout, a 2 MB cap and at most 2 redirects; `robots-parser` checked per redirect hop; **SSRF guard** that resolves DNS and rejects private, loopback, link-local (including Tencent metadata `169.254.0.0/16`) and IPv6 ULA ranges on every hop. Extraction with Readability and linkedom. For GitHub sources, use the raw `SKILL.md` and the repo licence API. Licence detection is deterministic (SPDX match on the LICENSE file or a declared page licence). **The LLM's opinion of the licence is recorded but never used to set `redistribution = true`.** DeepSeek `deepseek-chat` with JSON output mode, a strict system prompt, and zod-validated output (name, Chinese summary 20–110, description, files[], compat notes, applicable tasks); input truncated to a token budget. Fetched text is treated as hostile (prompt injection): output is data only and rendered with `html:false`. Dedup on `source_url_norm` (unique index) plus `similarity(title) > 0.6` via pg_trgm, which marks the item as a duplicate with a link. Status UI showing queued, running, failed and done per job and item. Draft review screen with source, licence evidence and provenance. Query mode sits behind a `SearchProvider` interface (see E.4). | 4–5 |
| — | **Docs, runbook and hardening pass** | README, CHANGELOG, `docs/runbook.md` (deploy, rollback, backup and restore, add a resource, run ingestion, ICP switch-over), plus a final security review of headers, rate limits, `npm audit` and a secrets grep. Spread across slices. | 1.5 |
|  | **Total** | | **≈ 26–34 days** |

Bookmarks are schema-only in Phase 2 unless time allows (the brief marks them optional).

---

## D. Risks

| # | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| R1 | **The leaked SSH password** is in the brief and now in this chat log | Certain / high | Rotate it today, before anything else (slice 0). Do not wait for the engineer. |
| R2 | **No TLS on the IP**, so Secure cookies and safe logins are impossible | Likely / blocks slice 2 | IP-certificate spike in slice 0. Otherwise ship auth disabled behind a flag until the domain is filed (A.4). |
| R3 | **Docker Hub pulls fail or crawl from mainland China** | Likely / blocks deploy | Registry mirror plus pre-pull in slice 0. As a fallback, `docker save`/`load` images from the dev machine. |
| R4 | **Build pipeline on Windows**: native deps, PowerShell 5.1 quirks, no GitHub | Medium / medium | No native deps by design (hash-wasm, no sharp, `pg` is pure JS). Docker-as-build-box preferred. ASCII-only scripts. The artifact is identical either way. |
| R5 | **Parity regressions in slice 1** (subtle HTML/metadata/trailing-slash differences) | Medium / medium | Automated normalised-text diff of every URL before and after. The old `site/` stays as a one-reload fallback. |
| R6 | **Gating code that has already been public.** Code shown openly today has been crawled and cached, and **the platform's modules are MIT-licensed, so anyone who receives members-only code may legally republish it.** | Certain / business | Members-only modules need a different licence (for example a members-only licence written by the owner). Gate only **new** modules, or accept that existing ones stay effectively public. Owner decision (E.5). |
| R7 | **Ingestion legal exposure**: copying bodies of uncertain licence | Medium / high | DB constraint `UNKNOWN ⇒ redistribution=false`. Licence set only by deterministic detection or an explicit admin declaration. No auto-publish (there is no code path from the worker to `PUBLISHED`). Provenance stored per item. |
| R8 | **SSRF / prompt injection** via admin-supplied URLs | Medium / high | Per-hop IP allow-check, size and time caps, no cookies or credentials sent, the LLM output schema validated, and nothing executed. |
| R9 | **Memory pressure / OOM** on a 3.7 GB box | Low / high | Container limits (A.1), swap, no on-box builds, pool size 10, Shiki language subset. Watch `docker stats` after each slice. |
| R10 | **Stale cache after unpublish** | Medium / medium | Tag invalidation in every mutation, `.next/cache` reset on each release, and a curl test after unpublish in slice 3. |
| R11 | **Single box, single disk**: DB, uploads and backups co-located | Medium / high | Off-box copy to COS plus a CBS snapshot policy. Without an off-box target the backup requirement is only half met; this is stated, not hidden. |
| R12 | **Email deliverability** in China (port 25 blocked, domain needed for SPF/DKIM) | Likely / medium | `hold` driver with admin-issued links until a provider and domain exist. No trust is placed in unverified emails (they cannot be granted a tier). |
| R13 | **Compliance for accounts and payment**: PIPL privacy notice, ICP number in the footer, PSB filing; a commercial ICP (EDI-type) licence held by a company before charging | Certain / legal | Privacy and terms pages in slice 2. Footer filing numbers via env. The company and licence question is raised now, before any payment work. |
| R14 | **Work access**: this cloud session can reach neither the code nor SSH (port 22 refused) | Certain / blocks execution | See E.1. |

---

## E. Decisions and inputs needed from the owner

Items 1–3 block slice 0 and slice 1. The others block later slices only.

1. **Server access.** The code is now in `masskx/xsjr` (public). Still open: this session cannot SSH to the server (port 22 refused), so deploys run from the Windows machine, either by the owner or by connecting that machine to this session. Also decide whether the repo should be private; it will soon hold deploy scripts and the server layout.
2. **Rotate the SSH password now** and confirm. Then install the engineer's public key (to be provided).
3. **Is Docker Desktop available on the Windows machine?** It is the preferred Linux build box. Without it, the native-build fallback is used.
4. **Ingestion query mode needs a web-search provider.** DeepSeek's API does not search the web, and Bing's Web Search API has been retired. Candidates: a China-accessible search API (for example Bocha), or GitHub code search for `SKILL.md` files, which is the best source for skills. URL and bulk modes need nothing extra.
5. **Gating policy** (R6): which modules become members-only, and **under what licence**? All 3 existing modules are FREE and MIT today. Recommendation: keep them that way; new members-only modules ship under a members-only licence.
6. **Analytics visitor identity.** The brief asks for 7- and 30-day unique visitors, but a daily-salted IP hash cannot count a person across days. Recommendation: a random first-party `rh_vid` cookie (HttpOnly, 30-day fixed lifetime, so it rotates; only its hash is stored, never linked to an IP), falling back to the daily-salted hash of (IP + UA) for clients without the cookie. The alternative is to report 7- and 30-day figures as "visitor-days" with no cookie.
7. **Off-box backup target**: a Tencent COS bucket plus a sub-account key scoped to that bucket, and whether to enable a CBS snapshot policy.
8. **Email provider** (for example Tencent Cloud SES or Alibaba DirectMail over SMTP 465). Until it exists, the `hold` mode in slice 2 applies.
9. **DeepSeek API key** and quota (brief §12.4), the **apex domain** (§12.1), and the **company/licence decision** (§12.2), as already listed in the brief.

On approval, work starts with slice 0. No architectural change is made before then.
