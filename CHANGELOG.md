# Changelog

## Unreleased

### Visual redesign: "paper and ink"

Changed
- New look across the site (and, through shared tokens, the back office): neutral paper
  background, near-black ink, thin display headlines (Alumni Sans), Albert Sans body text,
  JetBrains Mono labels, gold section tags ("01 · 四类资源"), a teal accent for state, links and
  focus rings, hairline borders, 3–8 px corners, quiet layered shadows, dotted section dividers.
- Fonts are bundled via `@fontsource-variable/*` (OFL) and served by the site itself; nothing is
  loaded from Google (unreliable from mainland China). Chinese uses the visitor's system fonts,
  with light weights for headlines.
- Implemented as design tokens in `app/globals.css`: the zinc scale is redefined as true
  neutrals (small grey text now >= 4.5:1 contrast) and the indigo accent scale as teal, so
  existing markup changed colour without edits; shared classes `display`, `headline`, `eyebrow`,
  `tag-gold`, `tag-mono`, `link-line`, `btn-ink`, `surface`, `dot`, `rule-dots`.
- Header: active section marked with a teal dot (`aria-current`). Home: larger hero, a sample
  resource card annotated with what the platform checks (wide screens only), numbered sections.
  Cards, detail pages, list headers, filters, search boxes, copy buttons and code blocks restyled.
- Footer shows `ICP_RECORD` / `PSB_RECORD` when set (the variables existed but were never shown).

Verified
- All six browser suites (155 checks) pass on the new build; no horizontal overflow at 390 px.
- Page text is identical to before on every page except the home page (new section tags and
  the sample card).

### Bulk upload of skills and modules

Added
- `infra/bulk.ps1` (Windows): uploads a folder of skills and modules (code + structure diagrams)
  over SSH and runs the importer on the server; check by default, `-Apply` to save as drafts,
  `-Publish`, `-Update`, `-New` for an example folder (`tools/bulk-template`). The report and,
  on the first check, a pre-filled `清单.csv` come back into the folder.
- `infra/remote/bulk.sh` + compose service `bulk`: copies the batch to `data/bulk`, drops
  symlinks, runs `scripts/bulk-import.mjs`, returns the outputs, deletes the batch.
- `lib/bulk/`: folder scanner (titles/summaries from README or SKILL.md front matter, entry file,
  language, requirements.txt, diagram by name or the only image, pinyin slugs for Chinese folder
  names, UTF-8 or GBK text, skips junk/binary/symlinks), the batch list (Excel CSV in UTF-8 or
  GBK, Chinese or English headers), a plan validated with the editors' schemas and the licence
  rules, and an apply step through the back office's own create/save/tier/diagram/publish code.
  All-or-nothing: any error and nothing is saved.
- Tests: 13 (CSV, scanning, plan rules, apply/publish/update, third-party licences); rehearsed
  through `bulk.sh` and the real container against a simulated server (pages, diagram via Caddy,
  members-only code absent for anonymous visitors, no batch files left behind).

Fixed
- First deploy on a brand-new server failed its smoke test: Caddy was smoke-tested the moment
  its container was created, before it listened. Deploy, rollback and apply-config now wait for
  Caddy to answer first. (The upgrade path from the Phase 1 static site was not affected.)

### Phase 2, slice 7: DeepSeek-assisted ingestion

Added
- `/admin/ingest/`: import Agent Skills from a list of URLs (up to 20) or from a search query
  restricted to allowed domains. Jobs run in the background with per-job and per-item status
  (queued / running / failed / done), auto-refreshing pages and a retry button.
- Worker inside the app process (`instrumentation.ts`, only when `DEEPSEEK_API_KEY` is set):
  `FOR UPDATE SKIP LOCKED` claiming, back-off 30 s / 2 min / 10 min, 3 attempts, permanent vs
  transient errors, stale-lock recovery, LISTEN/NOTIFY wake-ups, a daily token budget.
- Fetcher (`lib/ingest/net.ts`): robots.txt on every hop (token `ResearchHubBot`), 10 s deadline,
  2 MB cap on the decoded body, at most 2 redirects, SSRF guard (private, loopback, link-local
  incl. 169.254/16, CGNAT, ULA, multicast, documentation ranges and IPv4-mapped / NAT64 / 6to4
  forms) with the connection pinned to the validated address; no cookies or credentials.
- Extraction: Readability + linkedom for HTML; GitHub directories read raw `SKILL.md` / `README.md`
  and the nearest `LICENSE`.
- DeepSeek (`deepseek-chat`, JSON mode) with a strict prompt that treats the page as untrusted
  data; output validated and length-capped by zod; HTML in it is escaped on display.
- Deterministic licence detection (LICENSE text, SPDX line, `rel="license"`, SKILL.md front
  matter). Only permissive licences on an original SKILL.md produce a redistributable copy;
  everything else is an index-only draft. The model's licence opinion is shown, never used.
- Dedup by normalised source URL (before any fetch or token spend) and by title similarity
  (pg_trgm plus a CJK-safe bigram check, > 0.6), linking to the existing resource.
- Drafts carry `resource_provenance` (URL, time, HTTP status, SHA-256, licence, basis, evidence);
  the skill editor shows a provenance panel and a "source and redistribution" card.
- Query mode behind a `SearchProvider` interface; Bocha (博查) implemented.
- Migration 0004: `ingestion_items.next_attempt_at`, `title`, `license_evidence`, and a partial
  unique index so a URL cannot be in flight twice.
- About page: what `ResearchHubBot` is and how to opt out via robots.txt.
- Tests: 29 unit tests (incl. the real fetcher against a local server: redirects, robots,
  private targets, size cap, gzip bomb, timeout, charset) and 12 database tests;
  `tests/e2e/ingest.mjs` (27 checks).

Changed
- Licence rules in the admin save path (all resource types): turning redistribution on for content
  whose licence the platform did not establish requires "I have checked the source licence",
  recorded as `ADMIN_DECLARED` and audited; editing a source URL updates its dedup key and refuses
  one already used by another resource.
- Skills: index-only skills store no SKILL.md and publish without one (a source link is then
  required); their public page links to the source instead of a preview.
- Deploy pre-flight runs the new release with `INGEST_WORKER=0`; deploy refuses a `.env`
  containing the test-only `INGEST_TEST_ALLOW_PRIVATE_HOSTS`.
- Source links must be http(s) (the shared schema accepted any URL scheme, e.g. `javascript:`;
  the field was not editable in the admin before this slice).

Fixed
- Release packaging: Next 16.4's standalone output omits a runtime file that start-up needs once
  `instrumentation.ts` exists. On the build machine Node found it in the project's node_modules,
  so only the packaged release failed (HTTP 500 on every request; deploy pre-flight would have
  rejected it). `build-release.mjs` now adds the file and **boots every release from a directory
  outside the project before packaging it**, failing on any missing module.

Verified
- 190 unit/DB tests; all six browser suites (155 checks) against the build, and the ingestion and
  gallery suites against the extracted release tarball outside the project.
- Parity: identical to slice 6 except the new ResearchHubBot section on /about/.
- Not yet run against the real DeepSeek or Bocha APIs (no keys here); their request and response
  formats follow the public documentation and are isolated in `lib/ingest/llm.ts` and `search.ts`.

### Phase 2, slice 6: first-party analytics

Added
- Events page_view (including client-side navigations), copy, search (the settled query, 1.2 s
  after typing stops) from a tiny beacon (`POST /api/e`, sendBeacon, text/plain), and login /
  register from the server actions. No third-party code, no cookies, no raw IPs.
- Visitor identity: SHA-256 of IP + user agent with a random per-day salt that is deleted after
  two days. Unique visitors are exact within a day; 7/30-day figures are labelled "visitor-days"
  plus the daily average (the brief's daily-salted hash cannot link a person across days, by
  design; resolved in favour of privacy, no cookie).
- Not counted: bots and headless browsers, DNT / GPC, cross-site posts (Sec-Fetch-Site/Origin),
  admin pages; per-IP beacon rate limit; the beacon always answers 204.
- "Viewed but locked" flag computed server-side for members-only resources.
- `/admin/analytics/`: traffic table, 30-day trend line (single series, hover + keyboard tooltip,
  data table), top copied, top searches, top pages, referrers, locked views, registrations,
  logins, tier distribution. 13-month retention.
- Tests: 23 analytics tests (helpers, salt rotation, Shanghai day boundary, every dashboard number,
  no stored IPs); `tests/e2e/analytics.mjs` (21 checks); `scripts/bench-analytics.ts`.

Changed
- Privacy policy describes the statistics (policy version 2026-11-19.2).
- The search box on /search/ has an accessible name (it only had a placeholder).

Verified
- On 1,000,000 synthetic events: every query 1–70 ms (the summary was 188 ms with a global
  DISTINCT and is now derived from the per-day trend).
- Parity with production unchanged (the tracker renders nothing).


### Phase 2, slice 5: module gallery, structure diagrams, module and skill editors

Added
- `/modules/` gallery: cards with a structure thumbnail (uploaded diagram or a file tree generated
  from file names), applicable tasks, tier badge; category and tag filters as server-rendered
  links (shareable, no JS needed).
- Module pages in the brief's order: structure diagram, introduction, applicable tasks, code with
  one tab per file (keyboard-navigable, copy per file), environment and dependencies, usage
  examples (usage was in meta.json but never shown before).
- Structure diagrams: PNG/JPEG/WebP up to 2 MB, identified by content (no SVG), dimensions read
  from headers, JPEG EXIF/XMP stripped (no sharp, releases stay portable); stored under
  `data/uploads` (backed up nightly), served by Caddy at `/media/` (route handler in development);
  replacing or removing a diagram deletes the old file. Diagrams stay public on members-only
  modules; code from every file is withheld (two-layer gate, as in slice 4).
- Admin editors for modules (files, entry, environment, dependencies, usage, tasks, diagram) and
  skills (SKILL.md, compatibility matrix, file list, risks, dependencies), on a shared lifecycle
  (`lib/admin/resources.ts`) with prompts: drafts, publish, versions, audit, reorder, conflicts.
- `applicableTasks` (all types) and module `dependencies` are accepted in meta.json; every type
  now has a validation schema shared by importer and admin.
- Tests: 12 media tests (formats, EXIF stripping, disguised files, path safety), 5 module/skill
  admin tests (including "open and save every imported module/skill without changing its public
  page"); `tests/e2e/gallery.mjs` (25 checks).

Changed
- `/modules/` and module detail pages (intended; parity expectations documented).

Fixed
- Next's file tracing copied the whole project (sources, docs, old release tarballs) into the
  standalone server once a runtime-computed path appeared (release 40 MB instead of 5 MB). Non-
  runtime paths are now excluded in next.config, and build-release.mjs fails if app/ contains
  anything but the runtime or the release exceeds 15 MB.


### Phase 2, slice 4: membership tiers and server-side gating

Added
- Tiers FREE, EI, SCI from the `tiers` table; `lib/auth/entitlement.ts` is the single access
  rule (rank comparison, expiry evaluated per request, unknown tiers fail closed).
- Members-only module code is withheld on the server, twice: `lib/repo.getAttachment` checks the
  signed-in viewer, and the SQL query itself filters by tier rank, so gated code is never even
  read for an unentitled request. Gated attachments are never cached in memory.
- Locked state on module pages: title, summary, body, environment stay public and indexable; the
  code block becomes a lock panel that adapts (accounts off / signed out / wrong or expired tier).
- `EI` / `SCI` badges on cards, detail pages and search results (replacing the unused PRO badge).
- Admin: user list (search, effective-tier filter, pagination), user detail with grant (tier +
  30/90/180/365 days, a date, or no expiry, + note), revoke, membership history, account links;
  module tier settings with a licence warning; membership distribution on the overview.
- Grants write the `entitlements` ledger and `users.tier` in one transaction; unverified emails
  cannot be granted a tier.
- Tests: 27 tier tests (entitlement matrix + database); `tests/e2e/tiers.mjs` (22 checks: for each
  viewer the code is checked in BOTH the HTML and the RSC payload with an HTML-safe marker).

Changed
- `/about/`: the paragraph on the PRO label now describes the EI/SCI badges (parity: expected
  difference, documented in tools/parity/README.md).
- File imports set a resource's tier only on first import; afterwards the admin owns it.


### Phase 2, slice 3: admin back office for prompts

Added
- `/admin/` (admin role + TOTP-verified session, checked in proxy.ts, the layout and every
  action): overview with recent audit entries, prompt management, user lookup.
- Prompts: create draft, edit (basic info, Markdown body with server-rendered preview, template,
  variable schema editor, notes), live preview with the public playground component, publish,
  unpublish, archive (requires TOTP re-authentication within 10 minutes), restore, reorder.
- Safety: stale saves are refused (version token); slugs are locked after first publish;
  publishing requires every `{{placeholder}}` to be declared; a version snapshot is recorded on
  every publish and every edit of a published prompt; every change is audit-logged; public pages,
  search and sitemap update immediately via NOTIFY.
- Users: look up by email; issue email-verification and password-reset links (reset requires
  re-authentication) to stand in for mail until a provider exists.
- Shared validation (`lib/content/validation.ts`, zod) used by both the admin editor and the file
  importer.
- Tests: 7 admin integration tests; `tests/e2e/admin-prompts.mjs` (30 browser checks, each step
  verified on the public site).

Changed
- Public order is now featured first, then the admin's position, then content date (was date
  before position). Identical output for the current data (parity unchanged).
- Home "最近更新" sorts by content date explicitly.
- The importer no longer overwrites `sort_order` of existing resources and appends new ones; its
  content hash no longer depends on file position.


### Phase 2, slice 2: accounts and sessions (shipped switched off)

Accounts are built and tested but stay OFF until HTTPS exists: they open only when
`AUTH_ENABLED=1`, `SITE_URL` is https (or localhost) and `AUTH_SECRET` is set. While off, every
account route answers the normal 404 page and the header is unchanged (parity against production:
identical on all 47 routes except the known `/search/` difference).

Added
- Registration with consent record (PIPL), email verification, login, logout, password reset,
  password change, profile, device list with remote sign-out, account deletion.
- Argon2id password hashing (WASM, OWASP parameters); policy: 10+ characters (admins 14+), not
  among the 20,000 most common long passwords, not containing the email name.
- Server-side sessions: 256-bit token in a `__Host-` cookie (HttpOnly, Secure, SameSite=Lax);
  only its SHA-256 is stored; 30-day users, 12-hour admins; revoked on password change/reset.
- Brute-force protection: per-IP limits (keyed hashes, no raw IPs) and account lockout with
  doubling back-off; same error and same timing for unknown emails.
- Admins: mandatory TOTP enrolment (QR rendered server-side, secret encrypted at rest with
  AES-256-GCM, single-use codes); `/admin/` checked in `proxy.ts` and again in the page.
- Mail outbox with `smtp`, `log` and `hold` drivers; with `hold`, self-service reset is off.
- `scripts/create-admin.ts` (also `--reset-password`, `--reset-mfa`), `cli` compose service.
- Privacy policy and user agreement (drafts for legal review), operator name/contact from `.env`.
- Content-Security-Policy header in production builds.
- Tests: 32 unit + 11 service integration tests; `tests/e2e/auth-flow.mjs` (30 browser checks).

Changed
- Caddy access logs keep only the first three octets of client IPs (IPv6 /48); container logs
  are rotated (10 MB x 5 per service). Both are stated in the privacy policy.
- Release builder refuses to package `.env*` files.

Verified
- E2E 30/30 at 390 px (no horizontal overflow on any account page), screenshots reviewed.
- Forged cross-site form POST rejected; server actions posted while accounts are off rejected
  (409) on every path; no-JS form submission works (303).

Not yet done
- Admin-issued reset links for users while mail is on hold (slice 3, admin UI).
- `login` and `register` analytics events (slice 6).


### Phase 2, slice 1: PostgreSQL and server mode (no visible change)

Added
- PostgreSQL 16 schema for all of Phase 2 (`lib/db/schema.ts`, migrations in `drizzle/`), with the
  business and legal rules as database constraints: prompts/skills are FREE, unknown licence is
  never redistributed, attachment paths cannot escape, slugs are well-formed.
- `lib/repo`: the only data layer for pages (same function names as Phase 1 `lib/content.ts`,
  now async). Published content is held in an in-memory snapshot invalidated by
  `NOTIFY content_changed`, with a 5-minute fallback.
- Content importer (`npm run content:import`): idempotent, skips unchanged resources, never
  overwrites admin-edited resources without `--force`, never deletes. Runs on every deploy.
- `proxy.ts`: unknown or unpublished slugs are answered with the real 404 page.
- Release builder (`scripts/build-release.mjs`): portable tarball with no native binaries and no
  symlinks, so a Windows build runs on the Linux server.
- Deploy tooling (`infra/deploy.ps1`, `infra/deploy.sh`, `infra/remote/*.sh`): atomic releases
  with `current`/`previous`, pre-flight of the new release, smoke test, automatic rollback,
  one-step rollback, emergency fallback to the Phase 1 static site, `.env`-only domain switch.
- Nightly backup with rotation and an off-box hook; scripted restore drill; documented restore.
- Tests (Vitest, 32): file → database → page objects round-trip exactly (objects, order, bodies,
  attachments), importer guarantees, constraints, path traversal, architecture rules.
- `docs/RUNBOOK.md`; local development database (`infra/dev/compose.yaml`, `.env.example`).

Changed
- Next.js `output: "standalone"` (was `"export"`); every page renders per request. Trailing-slash
  URLs are unchanged; `/x` (no slash) now answers 308 → `/x/` instead of 200.
- `SITE_URL` is read at runtime (server-only), so changing the domain needs no rebuild.
- `/search/` now ships its result list in the server-rendered HTML (the static export only had a
  "loading" placeholder until JavaScript ran). After hydration the page is identical.

Verified
- Parity against production on 47 routes: identical except the `/search/` HTML above.
- Full rehearsal on a simulated server running the real Phase 1 stack: cutover (0.33 s without a
  listener on :80), normal deploy and rollback (0 failed requests), broken release rejected at
  pre-flight (0 failed requests), backup, restore drill, data-loss restore, static fallback.
- Detail pages P95 71 ms at concurrency 8 (target 800 ms); app 90 MB, db 50 MB, caddy 14 MB.

Not yet done
- Not deployed to production: this environment has no SSH route to the server. Run
  `infra/deploy.ps1 -Bootstrap` from the Windows machine (see docs/RUNBOOK.md section 1).
- Off-box backup target (BACKUP_OFFSITE_CMD) needs a COS bucket from the owner.
- HTTPS on the bare IP (needed before login ships in slice 2) is not attempted yet.

### Phase 2 preparation

### Fixed
- Tag lists on the four listing pages were sorted with `localeCompare()` and no locale, so the
  order (and, after the 12-item cut, the set of tags shown) depended on the build machine and on
  each visitor's browser locale. Sorting is now pinned to `zh-CN`, which reproduces the current
  production output exactly. Visible output from a Windows build is unchanged.

### Added
- `docs/phase2/PLAN.md`: Phase 2 migration plan, schema, task list and risks (awaiting approval).
- `tools/parity/`: capture and compare tools that prove a new build is visibly identical to
  production (status codes, metadata, headings, links, code blocks, visible text).

## 0.1.0 (2026-11-19)
- Phase 1: static Next.js export with 15 curated resources, served by Caddy.
