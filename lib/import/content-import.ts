// Import content/ (the file format) into PostgreSQL.
//
// Guarantees:
// - Idempotent and re-runnable: a resource whose content hash is unchanged is skipped.
// - Never silently overwrites admin work: a row whose origin is not FILE_IMPORT, or that an
//   admin has edited (updated_by set), is skipped unless `force` is true.
// - Never deletes: resources that disappeared from content/ are reported, not removed.
// - All writes for one resource happen in one transaction.
import { createHash } from "node:crypto";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import * as s from "../db/schema";
import type { LoadedResource } from "../content-files";
import { normaliseAttachmentPath } from "../content-files";
import { normaliseSourceUrl } from "../url";
import type { ModuleResource, PromptResource, SiteResource, SkillResource } from "../types";

export type ImportAction = "created" | "updated" | "unchanged" | "skipped-admin-edited" | "error";

export interface ImportReport {
  results: { slug: string; type: string; action: ImportAction; detail?: string }[];
  /** FILE_IMPORT rows that no longer have a directory in content/ (left untouched) */
  missingFromFiles: string[];
}

export interface ImportOptions {
  dryRun?: boolean;
  force?: boolean;
  now?: Date;
}

const LANG_BY_EXT: Record<string, string> = {
  py: "python",
  md: "markdown",
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  mjs: "javascript",
  json: "json",
  sh: "bash",
  yaml: "yaml",
  yml: "yaml",
  r: "r",
  txt: "text",
  toml: "toml",
};

export function languageFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return LANG_BY_EXT[ext] ?? "text";
}

/** Stable hash over everything the importer writes for a resource. */
export function contentHash(item: LoadedResource): Buffer {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])]))
        : v;
  return createHash("sha256")
    .update(JSON.stringify(canonical({ r: item.resource, b: item.body, f: item.files })))
    .digest();
}

export async function importContent(db: Db, items: LoadedResource[], opts: ImportOptions = {}): Promise<ImportReport> {
  const report: ImportReport = { results: [], missingFromFiles: [] };
  const now = opts.now ?? new Date();

  for (const item of items) {
    const r = item.resource;
    try {
      const action = await db.transaction(async (tx) => {
        const hash = contentHash(item);
        const [existing] = await tx
          .select({
            id: s.resources.id,
            type: s.resources.type,
            origin: s.resources.origin,
            updatedBy: s.resources.updatedBy,
            contentHash: s.resources.contentHash,
            publishedAt: s.resources.publishedAt,
          })
          .from(s.resources)
          .where(eq(s.resources.slug, r.slug))
          .for("update");

        if (existing && existing.type !== r.type) {
          throw new Error(`slug already used by a ${existing.type} resource`);
        }
        if (existing && !opts.force && (existing.origin !== "FILE_IMPORT" || existing.updatedBy !== null)) {
          return "skipped-admin-edited" as const;
        }
        if (existing && existing.contentHash && Buffer.compare(existing.contentHash, hash) === 0 && !opts.force) {
          return "unchanged" as const;
        }
        if (opts.dryRun) return existing ? ("updated" as const) : ("created" as const);

        const categoryId = await upsertCategory(tx as unknown as Db, r.category);
        const values = {
          type: r.type,
          slug: r.slug,
          title: r.title,
          summary: r.summary,
          bodyMd: item.body,
          applicableTasks: r.applicableTasks ?? [],
          categoryId,
          status: "PUBLISHED" as const,
          featured: r.featured === true,
          author: r.author,
          license: r.license,
          licenseSource: r.sourceUrl ? ("PAGE_DECLARED" as const) : ("PLATFORM" as const),
          licenseNote: r.licenseNote ?? null,
          redistribution: r.redistribution,
          sourceUrl: r.sourceUrl ?? null,
          sourceUrlNorm: r.sourceUrl ? normaliseSourceUrl(r.sourceUrl) : null,
          origin: "FILE_IMPORT" as const,
          contentHash: hash,
          contentUpdatedOn: r.updatedAt,
          verifiedOn: r.verifiedAt ?? null,
          publishedAt: existing?.publishedAt ?? now,
          updatedAt: now,
        };

        let resourceId: number;
        if (existing) {
          // sort_order and required_tier are NOT touched on update: once a resource exists, the
          // admin owns its position (slice 3) and its membership tier (slice 4).
          await tx.update(s.resources).set(values).where(eq(s.resources.id, existing.id));
          resourceId = existing.id;
        } else {
          // New resources go after the last one of their type (for the initial seed this
          // reproduces file order, which is what Phase 1 displayed).
          const [{ next }] = await tx
            .select({ next: sql<number>`coalesce(max(${s.resources.sortOrder}) + 1, 0)::int` })
            .from(s.resources)
            .where(eq(s.resources.type, r.type));
          const requiredTier = r.tier === "PRO" ? "EI" : r.tier; // Phase 1 "PRO" = first paid tier
          const [row] = await tx.insert(s.resources).values({ ...values, sortOrder: next, requiredTier }).returning({ id: s.resources.id });
          resourceId = row.id;
        }

        await replaceTags(tx as unknown as Db, resourceId, r.tags);
        await replaceFiles(tx as unknown as Db, resourceId, item);
        await replaceDetails(tx as unknown as Db, resourceId, item);
        return existing ? ("updated" as const) : ("created" as const);
      });
      report.results.push({ slug: r.slug, type: r.type, action });
    } catch (err) {
      report.results.push({ slug: r.slug, type: r.type, action: "error", detail: (err as Error).message });
    }
  }

  const slugs = items.map((i) => i.resource.slug);
  const missing = await db
    .select({ slug: s.resources.slug })
    .from(s.resources)
    .where(
      slugs.length
        ? and(eq(s.resources.origin, "FILE_IMPORT"), notInArray(s.resources.slug, slugs))
        : eq(s.resources.origin, "FILE_IMPORT"),
    );
  report.missingFromFiles = missing.map((m) => m.slug);

  if (!opts.dryRun && report.results.some((x) => x.action === "created" || x.action === "updated")) {
    await notifyContentChanged(db);
  }
  return report;
}

export async function notifyContentChanged(db: Db) {
  await db.execute("NOTIFY content_changed");
}

export async function upsertCategory(db: Db, name: string): Promise<number> {
  await db.insert(s.categories).values({ name }).onConflictDoNothing();
  const [row] = await db.select({ id: s.categories.id }).from(s.categories).where(eq(s.categories.name, name));
  return row.id;
}

export async function replaceTags(db: Db, resourceId: number, tagNames: string[]) {
  await db.delete(s.resourceTags).where(eq(s.resourceTags.resourceId, resourceId));
  const names = [...new Set(tagNames)];
  if (!names.length) return;
  await db.insert(s.tags).values(names.map((name) => ({ name }))).onConflictDoNothing();
  const rows = await db.select({ id: s.tags.id, name: s.tags.name }).from(s.tags).where(inArray(s.tags.name, names));
  const byName = new Map(rows.map((t) => [t.name, t.id]));
  await db
    .insert(s.resourceTags)
    .values(names.map((name, position) => ({ resourceId, tagId: byName.get(name)!, position })));
}

async function replaceFiles(db: Db, resourceId: number, item: LoadedResource) {
  await db.delete(s.resourceFiles).where(eq(s.resourceFiles.resourceId, resourceId));
  if (!item.files.length) return;
  const entry =
    item.resource.type === "MODULE" ? normaliseAttachmentPath((item.resource as ModuleResource).entry) : null;
  await db.insert(s.resourceFiles).values(
    item.files.map((f, i) => {
      if (normaliseAttachmentPath(f.path) !== f.path) throw new Error(`unsafe file path: ${f.path}`);
      return {
        resourceId,
        path: f.path,
        content: f.content,
        language: languageFor(f.path),
        sizeBytes: Buffer.byteLength(f.content, "utf8"),
        isEntry: f.path === entry,
        sortOrder: i,
      };
    }),
  );
}

async function replaceDetails(db: Db, resourceId: number, item: LoadedResource) {
  const r = item.resource;
  const del = async () => {
    await db.delete(s.resourcePrompt).where(eq(s.resourcePrompt.resourceId, resourceId));
    await db.delete(s.promptVariables).where(eq(s.promptVariables.resourceId, resourceId));
    await db.delete(s.resourceSkill).where(eq(s.resourceSkill.resourceId, resourceId));
    await db.delete(s.skillCompat).where(eq(s.skillCompat.resourceId, resourceId));
    await db.delete(s.resourceModule).where(eq(s.resourceModule.resourceId, resourceId));
    await db.delete(s.resourceSite).where(eq(s.resourceSite.resourceId, resourceId));
  };
  await del();

  switch (r.type) {
    case "PROMPT": {
      const p = r as PromptResource;
      await db.insert(s.resourcePrompt).values({ resourceId, notes: p.notes ?? null });
      if (p.variables?.length) {
        await db.insert(s.promptVariables).values(
          p.variables.map((v, i) => ({
            resourceId,
            key: v.key,
            label: v.label,
            type: v.type,
            required: v.required ?? null,
            defaultValue: v.default ?? null,
            help: v.help ?? null,
            options: v.options ?? null,
            sortOrder: i,
          })),
        );
      }
      break;
    }
    case "SKILL": {
      const k = r as SkillResource;
      await db.insert(s.resourceSkill).values({
        resourceId,
        risks: k.risks ?? null,
        dependencies: k.dependencies ?? null,
        fileTree: k.files ?? [],
      });
      if (k.compat?.length) {
        await db.insert(s.skillCompat).values(
          k.compat.map((c, i) => ({
            resourceId,
            toolKey: c.tool,
            supportedRange: c.supportedRange,
            installPath: c.installPath ?? null,
            note: c.note ?? null,
            sortOrder: i,
          })),
        );
      }
      break;
    }
    case "MODULE": {
      const m = r as ModuleResource;
      await db.insert(s.resourceModule).values({
        resourceId,
        language: m.language,
        entryPath: m.entry,
        env: m.env ?? [],
        dependencies: m.dependencies ?? [],
        usage: m.usage ?? null,
      });
      break;
    }
    case "SITE": {
      const t = r as SiteResource;
      await db.insert(s.resourceSite).values({
        resourceId,
        url: t.url,
        pricing: t.pricing,
        region: t.region ?? null,
        loginRequired: t.loginRequired ?? null,
        isPromotion: t.isPromotion ?? false,
      });
      break;
    }
  }
}
