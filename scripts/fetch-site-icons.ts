// Fill in missing research-navigation icons by fetching each site's own icon. Manual or
// already-set icons are never touched. Run inside the release container so the DB and the
// uploads volume are the production ones:
//
//   docker compose --project-directory /opt/research-hub \
//     -f /opt/research-hub/current/infra/compose.yaml run --rm bulk \
//     node scripts/fetch-site-icons.mjs
import { and, eq, isNull } from "drizzle-orm";
import { getDb, getPool } from "../lib/db/client";
import * as s from "../lib/db/schema";
import { fetchSiteIcon } from "../lib/media/favicon";
import { saveImage } from "../lib/media/storage";
import { notifyContentChanged } from "../lib/import/content-import";

async function main() {
  const db = getDb();
  const rows = await db
    .select({ id: s.resources.id, title: s.resources.title, url: s.resourceSite.url })
    .from(s.resources)
    .innerJoin(s.resourceSite, eq(s.resources.id, s.resourceSite.resourceId))
    .where(and(eq(s.resources.type, "SITE"), isNull(s.resources.structureMediaId)));

  console.log(`[site-icons] sites without icons: ${rows.length}`);
  let ok = 0;
  const failed: string[] = [];

  for (const row of rows) {
    try {
      const result = await fetchSiteIcon(row.url);
      if (!result.ok) {
        failed.push(`${row.title}: ${result.error}`);
        console.log(`[site-icons] FAIL ${row.title} (${row.url}): ${result.error}`);
        continue;
      }
      const media = await saveImage(db, result.image.data, {
        prefix: "siteicons",
        alt: `${row.title} 图标`.slice(0, 200),
      });
      await db.update(s.resources).set({ structureMediaId: media.id }).where(eq(s.resources.id, row.id));
      ok++;
      console.log(
        `[site-icons] OK ${row.title}: ${result.image.kind} ${result.image.width}x${result.image.height}, ${(result.image.data.length / 1024).toFixed(0)} KB`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failed.push(`${row.title}: ${message}`);
      console.log(`[site-icons] FAIL ${row.title}: ${message}`);
    }
  }

  if (ok) await notifyContentChanged(db);
  console.log(`[site-icons] done: ok=${ok} failed=${failed.length}`);
  if (failed.length) console.log(failed.map((f) => `  - ${f}`).join("\n"));
}

main()
  .catch((err) => {
    console.error("[site-icons] FAILED", err);
    process.exitCode = 1;
  })
  .finally(() => getPool().end());
