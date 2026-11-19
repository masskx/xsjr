# Changelog

## Unreleased

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
