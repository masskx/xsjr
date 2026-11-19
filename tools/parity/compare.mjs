#!/usr/bin/env node
// Compare two parity captures (baseline vs candidate). Exit code 0 only when there is no
// visible difference.
//
//   node compare.mjs <baselineDir> <candidateDir> [--allow-noslash-redirect]
//
// Compared per page: status code, head metadata, heading outline, links, code block hashes,
// visible text (line diff). robots.txt and sitemap.xml are compared after origin normalisation.
// --allow-noslash-redirect accepts a 308 -> "<path>/" where the baseline served the
// no-trailing-slash variant with 200 (the expected Next.js trailingSlash behaviour; the
// canonical URLs are unchanged).
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { slugFile } from "./lib.mjs";

const args = process.argv.slice(2);
const [aDir, bDir] = args.filter((a) => !a.startsWith("--"));
const allowNoSlash = args.includes("--allow-noslash-redirect");
if (!aDir || !bDir) {
  console.error("usage: node compare.mjs <baselineDir> <candidateDir> [--allow-noslash-redirect]");
  process.exit(2);
}

const load = async (d) => JSON.parse(await readFile(join(d, "manifest.json"), "utf8"));
const A = await load(aDir);
const B = await load(bDir);
const problems = [];
const note = (path, msg) => problems.push(`${path}: ${msg}`);

for (const [path, a] of Object.entries(A.routes)) {
  const b = B.routes[path];
  if (!b) { note(path, "missing from candidate capture"); continue; }

  if (a.kind === "no-slash") {
    if (a.status === b.status) continue;
    const okRedirect = allowNoSlash && a.status === 200 && [301, 308].includes(b.status) &&
      b.location && new URL(b.location, "http://x").pathname === `${path}/`;
    if (!okRedirect) note(path, `status ${a.status} -> ${b.status}${b.location ? ` (${b.location})` : ""}`);
    continue;
  }
  if (a.status !== b.status) note(path, `status ${a.status} -> ${b.status}`);

  if (a.kind === "raw") {
    if (a.normSha256 !== b.normSha256) {
      const [ra, rb] = await Promise.all([aDir, bDir].map((d) => readFile(join(d, "raw", slugFile(path)), "utf8")));
      note(path, `content differs\n${lineDiff(ra, rb)}`);
    }
    continue;
  }

  if (a.normSha256 === b.normSha256) continue;
  const f = `${slugFile(path)}.json`;
  const [na, nb] = await Promise.all([aDir, bDir].map(async (d) => JSON.parse(await readFile(join(d, "norm", f), "utf8"))));

  for (const k of new Set([...Object.keys(na.meta), ...Object.keys(nb.meta)])) {
    if (na.meta[k] !== nb.meta[k]) note(path, `meta ${k}: ${JSON.stringify(na.meta[k])} -> ${JSON.stringify(nb.meta[k])}`);
  }
  if (na.headings.join("\n") !== nb.headings.join("\n")) note(path, `headings differ\n${lineDiff(na.headings.join("\n"), nb.headings.join("\n"))}`);
  if (na.links.join("\n") !== nb.links.join("\n")) note(path, `links differ\n${lineDiff(na.links.join("\n"), nb.links.join("\n"))}`);
  if (na.codeSha256.join() !== nb.codeSha256.join()) note(path, `code blocks differ (${na.codeSha256.length} blocks/${na.codeChars} chars -> ${nb.codeSha256.length}/${nb.codeChars})`);
  if (na.text !== nb.text) note(path, `visible text differs\n${lineDiff(na.text, nb.text)}`);
}
for (const path of Object.keys(B.routes)) if (!A.routes[path]) note(path, "new route not in baseline (informational)");

if (problems.length) {
  console.log(problems.join("\n\n"));
  console.log(`\nFAIL: ${problems.length} difference(s)`);
  process.exit(1);
}
console.log(`PASS: ${Object.keys(A.routes).length} routes identical`);

// Minimal LCS line diff, capped for readability.
function lineDiff(x, y, max = 40) {
  const a = x.split("\n"), b = y.split("\n");
  const n = a.length, m = b.length;
  if (n * m > 4e6) return `  (too large to diff: ${n} vs ${m} lines)`;
  const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while ((i < n || j < m) && out.length < max) {
    if (i < n && j < m && a[i] === b[j]) { i++; j++; }
    else if (j < m && (i === n || L[i][j + 1] >= L[i + 1][j])) out.push(`  + ${b[j++]}`);
    else out.push(`  - ${a[i++]}`);
  }
  return out.join("\n") + (out.length >= max ? "\n  …" : "");
}
