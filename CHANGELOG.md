# Changelog

## Unreleased

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
