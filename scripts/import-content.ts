// Import content/ into PostgreSQL.
//   DATABASE_URL=... npx tsx scripts/import-content.ts [--dry-run] [--force] [--content-dir DIR]
//   node scripts/import-content.mjs [...]                 (release bundle, run in the container)
//
// Exit code 1 if any resource failed. See lib/import/content-import.ts for the guarantees.
import path from "node:path";
import { loadContentDir } from "../lib/content-files";
import { getDb, getPool } from "../lib/db/client";
import { importContent } from "../lib/import/content-import";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");
  const contentDir = path.resolve(arg("--content-dir") ?? process.env.CONTENT_DIR ?? "content");

  const items = loadContentDir(contentDir);
  console.log(`[import] ${items.length} resources in ${contentDir}${dryRun ? " (dry run)" : ""}${force ? " (force)" : ""}`);

  const pool = getPool();
  try {
    const report = await importContent(getDb(pool), items, { dryRun, force });
    const counts: Record<string, number> = {};
    for (const r of report.results) {
      counts[r.action] = (counts[r.action] ?? 0) + 1;
      if (r.action !== "unchanged") {
        console.log(`  ${r.action.padEnd(20)} ${r.type.padEnd(6)} ${r.slug}${r.detail ? `  -- ${r.detail}` : ""}`);
      }
    }
    for (const slug of report.missingFromFiles) {
      console.log(`  ${"missing-from-files".padEnd(20)} ${"".padEnd(6)} ${slug}  (left untouched)`);
    }
    console.log(`[import] ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(" ")}`);
    if (counts.error) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[import] FAILED", err);
  process.exitCode = 1;
});
