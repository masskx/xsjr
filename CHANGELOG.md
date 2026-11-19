# Changelog

## Unreleased

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
