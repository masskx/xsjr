#!/usr/bin/env node
// Capture a parity baseline of a running Research Hub instance.
//
//   node capture.mjs <origin> <outDir>
//   node capture.mjs http://129.204.142.223 ../../.parity/2026-11-19-static
//
// Writes, per route: raw HTML (raw/<route>.html) and a normalised extraction (norm/<route>.json),
// plus manifest.json with status codes, content types, timings and hashes.
// Routes = every <loc> in sitemap.xml + fixed extras (search, robots, sitemap, 404 probes,
// no-trailing-slash variants).
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { extract, get, sha256, slugFile } from "./lib.mjs";

const [origin, outDir, siteOriginArg] = process.argv.slice(2);
if (!origin || !outDir) {
  console.error("usage: node capture.mjs <origin> <outDir> [siteOrigin]");
  process.exit(2);
}
const base = origin.replace(/\/+$/, "");
const siteOrigin = (siteOriginArg || base).replace(/\/+$/, "");
const origins = [...new Set([base, siteOrigin])].sort((a, b) => b.length - a.length);

const sm = await get(`${base}/sitemap.xml`);
if (sm.status !== 200) throw new Error(`sitemap.xml returned ${sm.status}`);
const sitemapPaths = [...sm.body.toString("utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => {
  const u = new URL(m[1].trim());
  return u.pathname || "/";
});

const extras = ["/search/", "/does-not-exist-parity-probe/", "/modules/does-not-exist-parity-probe/"];
const raw = ["/robots.txt", "/sitemap.xml"];
const noSlash = sitemapPaths.filter((p) => p !== "/" && p.endsWith("/")).map((p) => p.slice(0, -1));

const pages = [...new Set([...sitemapPaths, ...extras])];
await mkdir(join(outDir, "raw"), { recursive: true });
await mkdir(join(outDir, "norm"), { recursive: true });

const manifest = { origin: base, siteOrigin, capturedAt: new Date().toISOString(), sitemapPaths, routes: {} };

for (const path of pages) {
  const r = await get(base + path);
  const html = r.body.toString("utf8");
  const f = slugFile(path);
  await writeFile(join(outDir, "raw", `${f}.html`), r.body);
  const norm = extract(html, origins);
  await writeFile(join(outDir, "norm", `${f}.json`), JSON.stringify(norm, null, 2));
  manifest.routes[path] = {
    kind: "page", status: r.status, contentType: r.contentType, cacheControl: r.cacheControl,
    ms: r.ms, bytes: r.body.length, rawSha256: sha256(r.body), normSha256: sha256(JSON.stringify(norm)),
  };
  console.log(`${r.status} ${String(r.ms).padStart(5)}ms ${path}`);
}

for (const path of raw) {
  const r = await get(base + path);
  // origin differs between environments; normalise it before hashing
  // static sitemap entries carry the build time (new Date()); resource entries carry a date at
  // 00:00:00.000Z. Only the former is normalised, so real content-date changes still show up.
  const body = r.body
    .toString("utf8")
    .replace(new RegExp(origins.map((o) => o.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g"), "<origin>")
    .replace(/<lastmod>(?!\d{4}-\d{2}-\d{2}T00:00:00\.000Z)[^<]*<\/lastmod>/g, "<lastmod><build-time></lastmod>");
  await writeFile(join(outDir, "raw", slugFile(path)), body);
  manifest.routes[path] = { kind: "raw", status: r.status, contentType: r.contentType, bytes: r.body.length, normSha256: sha256(body) };
  console.log(`${r.status} ${String(r.ms).padStart(5)}ms ${path}`);
}

for (const path of noSlash) {
  const r = await get(base + path);
  manifest.routes[path] = { kind: "no-slash", status: r.status, location: r.location };
}

await writeFile(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
const bad = Object.entries(manifest.routes).filter(([p, v]) => v.kind === "page" && !p.includes("parity-probe") && v.status !== 200);
console.log(`\n${pages.length} pages, ${raw.length} raw files, ${noSlash.length} no-slash probes -> ${outDir}`);
if (bad.length) {
  console.error(`non-200 pages: ${bad.map(([p, v]) => `${p}=${v.status}`).join(", ")}`);
  process.exit(1);
}
