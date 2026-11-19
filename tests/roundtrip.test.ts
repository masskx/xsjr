// The slice-1 contract: importing content/ and reading it back through the repo yields exactly
// what Phase 1 read from disk: same objects, same order, same bodies, same attachments.
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { loadContentDir, type LoadedResource } from "@/lib/content-files";
import { importContent } from "@/lib/import/content-import";
import { categoriesOf, loadAttachment, loadSnapshot, relatedOf, tagsOf } from "@/lib/repo/store";
import * as s from "@/lib/db/schema";
import type { Db } from "@/lib/db/client";
import type { Resource } from "@/lib/types";
import { TEST_DATABASE_URL, freshDb } from "./helpers/db";

const CONTENT = path.resolve(__dirname, "../content");

/** Phase 1 ordering, verbatim: featured first, then updatedAt desc; stable on file order. */
function phase1Order(items: LoadedResource[]): Resource[] {
  return items
    .map((i) => i.resource)
    .sort((a, b) => {
      if (!!b.featured !== !!a.featured) return a.featured ? -1 : 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
}

describe.skipIf(!TEST_DATABASE_URL)("content round-trip (files -> PostgreSQL -> repo)", () => {
  let db: Db;
  let pool: Pool;
  let items: LoadedResource[];

  beforeAll(async () => {
    ({ db, pool } = await freshDb());
    items = loadContentDir(CONTENT);
    const report = await importContent(db, items);
    expect(report.results.filter((r) => r.action === "error")).toEqual([]);
  });
  afterAll(async () => {
    await pool?.end();
  });

  it("imports all 15 resources", () => {
    expect(items).toHaveLength(15);
  });

  it("rebuilds every resource object exactly", async () => {
    const snap = await loadSnapshot(db);
    for (const { resource } of items) {
      // JSON round-trip drops undefined keys on both sides, as React props serialisation would
      expect(JSON.parse(JSON.stringify(snap.bySlug.get(resource.slug)))).toEqual(
        JSON.parse(JSON.stringify(resource)),
      );
    }
  });

  it("keeps Phase 1 display order", async () => {
    const snap = await loadSnapshot(db);
    expect(snap.all.map((r) => r.slug)).toEqual(phase1Order(items).map((r) => r.slug));
  });

  it("keeps bodies and attachments byte-identical", async () => {
    const snap = await loadSnapshot(db);
    for (const item of items) {
      expect(snap.bodies.get(item.resource.slug)).toBe(item.body);
      for (const f of item.files) {
        expect(await loadAttachment(db, item.resource.slug, f.path, 0)).toBe(f.content);
        expect(await loadAttachment(db, item.resource.slug, `files/${f.path}`, 0)).toBe(f.content);
      }
    }
  });

  it("derived views match the Phase 1 functions", async () => {
    const snap = await loadSnapshot(db);
    const p1 = phase1Order(items);
    expect(categoriesOf(snap.all)).toEqual(categoriesOf(p1));
    expect(tagsOf(snap.all)).toEqual(tagsOf(p1));
    for (const r of p1) expect(relatedOf(snap.all, r).map((x) => x.slug)).toEqual(relatedOf(p1, r).map((x) => x.slug));
  });

  it("rejects path traversal in attachment reads", async () => {
    for (const bad of ["../../etc/passwd", "files/../meta.json", "/etc/passwd", "C:/x", "a\\b"]) {
      expect(await loadAttachment(db, "stat-tests-py", bad, 0)).toBeNull();
    }
  });

  it("re-import is a no-op", async () => {
    const report = await importContent(db, loadContentDir(CONTENT));
    expect(new Set(report.results.map((r) => r.action))).toEqual(new Set(["unchanged"]));
    expect(report.missingFromFiles).toEqual([]);
  });

  it("dry run writes nothing", async () => {
    const changed = loadContentDir(CONTENT);
    changed[0].resource = { ...changed[0].resource, title: "改过的标题（dry run）" };
    const report = await importContent(db, changed, { dryRun: true });
    expect(report.results[0].action).toBe("updated");
    const snap = await loadSnapshot(db);
    expect(snap.bySlug.get(changed[0].resource.slug)?.title).toBe(items[0].resource.title);
  });

  it("never overwrites a resource an admin has edited, unless forced", async () => {
    const [admin] = await db
      .insert(s.users)
      .values({ email: "admin@example.test", passwordHash: "x", role: "ADMIN" })
      .returning({ id: s.users.id });
    const slug = items[0].resource.slug;
    await db.update(s.resources).set({ title: "管理员改的标题", updatedBy: admin.id }).where(eq(s.resources.slug, slug));

    const changed = loadContentDir(CONTENT);
    changed[0].resource = { ...changed[0].resource, title: "文件里的新标题" };
    const report = await importContent(db, changed);
    expect(report.results.find((r) => r.slug === slug)?.action).toBe("skipped-admin-edited");
    expect((await loadSnapshot(db)).bySlug.get(slug)?.title).toBe("管理员改的标题");

    const forced = await importContent(db, changed, { force: true });
    expect(forced.results.find((r) => r.slug === slug)?.action).toBe("updated");
    expect((await loadSnapshot(db)).bySlug.get(slug)?.title).toBe("文件里的新标题");
  });

  it("unpublished resources vanish from the snapshot and their attachments 404", async () => {
    await db.update(s.resources).set({ status: "DRAFT" }).where(eq(s.resources.slug, "stat-tests-py"));
    const snap = await loadSnapshot(db);
    expect(snap.bySlug.has("stat-tests-py")).toBe(false);
    expect(snap.all.some((r) => r.slug === "stat-tests-py")).toBe(false);
    expect(await loadAttachment(db, "stat-tests-py", "stat_tests.py", 0)).toBeNull();
  });

  it("enforces the business and legal constraints in the database", async () => {
    await expect(
      db.update(s.resources).set({ requiredTier: "SCI" }).where(eq(s.resources.slug, "abstract-polish")),
    ).rejects.toThrow();
    await expect(
      db.update(s.resources).set({ licenseSource: "UNKNOWN", redistribution: true }).where(eq(s.resources.slug, "arxiv")),
    ).rejects.toThrow();
    await expect(
      db.insert(s.resourceFiles).values({ resourceId: 1, path: "../x.py", content: "", language: "python", sizeBytes: 0 }),
    ).rejects.toThrow();
  });
});
