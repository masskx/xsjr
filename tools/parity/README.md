# Parity tools

Phase 2, slice 1 must cause **zero visible change**. These two scripts prove that. They need
only Node 20 or later and have no dependencies.

```bash
# 1. capture a running instance (live static site, or the new server build)
node capture.mjs http://129.204.142.223 ../../.parity/<date>-<label>

# 2. compare baseline vs candidate; exit 0 = identical
node compare.mjs ../../.parity/2026-11-19-static-live ../../.parity/<candidate> --allow-noslash-redirect
```

What is compared per route (all `sitemap.xml` URLs, `/search/`, two 404 probes, `robots.txt`,
`sitemap.xml`, and the no-trailing-slash variant of every URL):

- HTTP status
- `<title>`, `lang`, every `<meta name|property>` and canonical/alternate/icon links
- heading outline (h1–h6), link targets, SHA-256 of every `<pre>` code block
- visible text (line diff on failure)

Ignored on purpose: `<script>` content (including the inlined RSC payload), styles, comments,
hashed `/_next/static/*` asset names, and the origin in `robots.txt` / `sitemap.xml`.

`--allow-noslash-redirect` accepts `/x` → 308 → `/x/` where the static site served `/x` with
200 through Caddy's `try_files`. That is the expected Next.js `trailingSlash: true` behaviour,
and the canonical URLs do not change.

Self-check: two consecutive captures of the live site compare as `PASS: 47 routes identical`.

## Baselines

`baselines/2026-11-19-static-live/` was captured from `http://129.204.142.223` on 2026-11-19.
It holds 24 pages (all 200 except the two 404 probes), `robots.txt`, `sitemap.xml` and 21
no-slash probes (all 200). The raw HTML also contains every resource's full text and code, so
it doubles as an independent copy of the 15 resources' published content.

## Expected differences (`--expect`)

| Route | Since | Why it differs, and why that is intended |
|---|---|---|
| `/search/` | Phase 2 slice 1 | The static export rendered only the placeholder "正在加载搜索框…" because `useSearchParams()` defers that subtree to the browser. Server rendering includes the full result list in the HTML. After hydration both show the same list; crawlers and no-JS visitors now get the results too. |

Slice 1 command (production baseline vs server build):

```bash
node compare.mjs <live-capture> <server-capture> --allow-noslash-redirect --expect /search/
```
