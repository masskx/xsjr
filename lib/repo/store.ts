// Pure data access (no Next.js imports) so scripts and tests can use it directly.
// Rebuilds the exact Resource objects that Phase 1 read from meta.json, from published rows.
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client";
import * as s from "../db/schema";
import { normaliseAttachmentPath } from "../content-files";
import type {
  CompatRow,
  FileNode,
  ModuleResource,
  PromptResource,
  PromptVariable,
  Resource,
  ResourceType,
  SiteResource,
  SkillResource,
} from "../types";

export interface Snapshot {
  /** published resources in display order (featured, updatedAt desc, type, sort_order) */
  all: Resource[];
  bySlug: Map<string, Resource>;
  bodies: Map<string, string>;
  ids: Map<string, number>;
  loadedAt: number;
}

const TYPE_RANK: Record<ResourceType, number> = { PROMPT: 0, SKILL: 1, MODULE: 2, SITE: 3 };

type NoNulls<T> = { [K in keyof T]: Exclude<T[K], null> };

/** Drop null/undefined so rebuilt objects have exactly the keys meta.json had. */
function compact<T extends object>(o: T): NoNulls<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined)) as NoNulls<T>;
}

export async function loadSnapshot(db: Db): Promise<Snapshot> {
  const rows = await db
    .select({
      id: s.resources.id,
      type: s.resources.type,
      slug: s.resources.slug,
      title: s.resources.title,
      summary: s.resources.summary,
      bodyMd: s.resources.bodyMd,
      category: s.categories.name,
      requiredTier: s.resources.requiredTier,
      sortOrder: s.resources.sortOrder,
      featured: s.resources.featured,
      author: s.resources.author,
      license: s.resources.license,
      licenseNote: s.resources.licenseNote,
      redistribution: s.resources.redistribution,
      sourceUrl: s.resources.sourceUrl,
      updatedOn: s.resources.contentUpdatedOn,
      verifiedOn: s.resources.verifiedOn,
    })
    .from(s.resources)
    .leftJoin(s.categories, eq(s.categories.id, s.resources.categoryId))
    .where(eq(s.resources.status, "PUBLISHED"));

  const ids = rows.map((r) => r.id);
  const [tagRows, prompts, vars, skills, compat, modules, sites] = ids.length
    ? await Promise.all([
        db
          .select({ resourceId: s.resourceTags.resourceId, name: s.tags.name, position: s.resourceTags.position })
          .from(s.resourceTags)
          .innerJoin(s.tags, eq(s.tags.id, s.resourceTags.tagId))
          .where(inArray(s.resourceTags.resourceId, ids))
          .orderBy(asc(s.resourceTags.resourceId), asc(s.resourceTags.position)),
        db.select().from(s.resourcePrompt).where(inArray(s.resourcePrompt.resourceId, ids)),
        db
          .select()
          .from(s.promptVariables)
          .where(inArray(s.promptVariables.resourceId, ids))
          .orderBy(asc(s.promptVariables.resourceId), asc(s.promptVariables.sortOrder)),
        db.select().from(s.resourceSkill).where(inArray(s.resourceSkill.resourceId, ids)),
        db
          .select()
          .from(s.skillCompat)
          .where(inArray(s.skillCompat.resourceId, ids))
          .orderBy(asc(s.skillCompat.resourceId), asc(s.skillCompat.sortOrder)),
        db.select().from(s.resourceModule).where(inArray(s.resourceModule.resourceId, ids)),
        db.select().from(s.resourceSite).where(inArray(s.resourceSite.resourceId, ids)),
      ])
    : [[], [], [], [], [], [], []];

  const group = <T extends { resourceId: number }>(list: T[]) => {
    const m = new Map<number, T[]>();
    for (const x of list) m.set(x.resourceId, [...(m.get(x.resourceId) ?? []), x]);
    return m;
  };
  const tagsBy = group(tagRows);
  const varsBy = group(vars);
  const compatBy = group(compat);
  const one = <T extends { resourceId: number }>(list: T[]) => new Map(list.map((x) => [x.resourceId, x]));
  const promptBy = one(prompts);
  const skillBy = one(skills);
  const moduleBy = one(modules);
  const siteBy = one(sites);

  const order = new Map<string, number>();
  const bodies = new Map<string, string>();
  const idMap = new Map<string, number>();

  const all: Resource[] = rows.map((row) => {
    order.set(row.slug, TYPE_RANK[row.type] * 1_000_000 + row.sortOrder);
    bodies.set(row.slug, row.bodyMd);
    idMap.set(row.slug, row.id);

    const base = compact({
      slug: row.slug,
      type: row.type,
      title: row.title,
      summary: row.summary,
      category: row.category ?? "",
      tags: (tagsBy.get(row.id) ?? []).map((t) => t.name),
      author: row.author,
      sourceUrl: row.sourceUrl,
      license: row.license,
      licenseNote: row.licenseNote,
      redistribution: row.redistribution,
      // Phase 1 content only knows FREE/PRO; tier display is reworked in slice 4.
      tier: row.requiredTier === "FREE" ? ("FREE" as const) : ("PRO" as const),
      updatedAt: row.updatedOn,
      verifiedAt: row.verifiedOn,
      featured: row.featured ? true : undefined,
    });

    switch (row.type) {
      case "PROMPT": {
        const p = promptBy.get(row.id);
        const variables: PromptVariable[] = (varsBy.get(row.id) ?? []).map((v) =>
          compact({
            key: v.key,
            label: v.label,
            type: v.type,
            required: v.required,
            default: v.defaultValue,
            help: v.help,
            options: (v.options as string[] | null) ?? undefined,
          }),
        );
        return compact({ ...base, type: "PROMPT", variables, notes: p?.notes }) as PromptResource;
      }
      case "SKILL": {
        const k = skillBy.get(row.id);
        const compatRows: CompatRow[] = (compatBy.get(row.id) ?? []).map((c) =>
          compact({ tool: c.toolKey, supportedRange: c.supportedRange, installPath: c.installPath, note: c.note }),
        );
        return compact({
          ...base,
          type: "SKILL",
          compat: compatRows,
          files: (k?.fileTree as FileNode[] | undefined) ?? [],
          risks: k?.risks,
          dependencies: k?.dependencies,
        }) as SkillResource;
      }
      case "MODULE": {
        const m = moduleBy.get(row.id);
        return compact({
          ...base,
          type: "MODULE",
          language: m?.language ?? "",
          env: m?.env ?? [],
          entry: m?.entryPath ?? "",
          usage: m?.usage,
        }) as ModuleResource;
      }
      case "SITE": {
        const t = siteBy.get(row.id);
        return compact({
          ...base,
          type: "SITE",
          url: t?.url ?? "",
          pricing: (t?.pricing ?? "免费") as SiteResource["pricing"],
          region: t?.region,
          loginRequired: t?.loginRequired,
        }) as SiteResource;
      }
    }
  });

  all.sort(
    (a, b) =>
      Number(!!b.featured) - Number(!!a.featured) ||
      b.updatedAt.localeCompare(a.updatedAt) ||
      order.get(a.slug)! - order.get(b.slug)!,
  );

  return { all, bySlug: new Map(all.map((r) => [r.slug, r])), bodies, ids: idMap, loadedAt: Date.now() };
}

/**
 * Read one attachment (module code, SKILL.md, template.md) of a PUBLISHED resource.
 * This is the only function that selects resource_files.content. Slice 4 puts the
 * entitlement check in front of it for gated modules.
 */
export async function loadAttachment(db: Db, slug: string, relativePath: string): Promise<string | null> {
  const rel = normaliseAttachmentPath(relativePath);
  if (!rel) return null;
  const [row] = await db
    .select({ content: s.resourceFiles.content })
    .from(s.resourceFiles)
    .innerJoin(s.resources, eq(s.resources.id, s.resourceFiles.resourceId))
    .where(and(eq(s.resources.slug, slug), eq(s.resources.status, "PUBLISHED"), eq(s.resourceFiles.path, rel)));
  return row?.content ?? null;
}

// ── derived views (same logic as Phase 1 lib/content.ts) ──

export function categoriesOf(all: Resource[]): { name: string; count: number }[] {
  const map = new Map<string, number>();
  for (const r of all) map.set(r.category, (map.get(r.category) ?? 0) + 1);
  return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

export function tagsOf(all: Resource[], limit = 40): { name: string; count: number }[] {
  const map = new Map<string, number>();
  for (const r of all) for (const t of r.tags) map.set(t, (map.get(t) ?? 0) + 1);
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"))
    .slice(0, limit);
}

/** Related resources: same type and category first, then shared tags. */
export function relatedOf(all: Resource[], resource: Resource, limit = 3): Resource[] {
  return all
    .filter((r) => r.slug !== resource.slug)
    .map((r) => {
      let score = 0;
      if (r.type === resource.type) score += 2;
      if (r.category === resource.category) score += 3;
      score += r.tags.filter((t) => resource.tags.includes(t)).length;
      return { r, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.r);
}
