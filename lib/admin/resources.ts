// Type-agnostic admin lifecycle for resources: list, create, save (with version token), publish,
// unpublish, archive, restore, reorder, version snapshots, audit, NOTIFY. Each resource type
// supplies an adapter (lib/admin/prompts.ts, modules.ts, skills.ts) for its own fields.
//
// Lifecycle: DRAFT -> PUBLISHED -> (unpublish) DRAFT; any -> ARCHIVED -> (restore) DRAFT.
// Only PUBLISHED rows are ever public (lib/repo filters on status).
import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import type { z } from "zod";
import type { Db } from "../db/client";
import * as s from "../db/schema";
import { notifyContentChanged, replaceTags, upsertCategory } from "../import/content-import";
import { issuesByField, slugSchema } from "../content/validation";
import { normalizeSourceUrl } from "../ingest/url";

export interface AdminCtx {
  db: Db;
  actorId: number;
  now?: Date;
}

export type ResourceType = "PROMPT" | "SKILL" | "MODULE" | "SITE";
export type Status = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type Fail = { ok: false; errors: Record<string, string>; conflict?: boolean };

/** Fields every editable type shares (subset of baseMetaSchema + slug + body). */
export interface CommonInput {
  slug: string;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  author: string;
  license: string;
  licenseNote?: string;
  redistribution: boolean;
  sourceUrl?: string;
  featured?: boolean;
  updatedAt: string;
  verifiedAt?: string;
  applicableTasks?: string[];
  body: string;
  /** the admin confirms the source licence allows redistribution (sets license_source ADMIN_DECLARED) */
  licenseDeclared?: boolean;
}

export interface Adapter<I extends CommonInput> {
  type: ResourceType;
  label: string;
  schema: z.ZodType<I>;
  /** type-specific fields of a stored resource, merged with the common ones */
  readDetails(db: Db, id: number): Promise<Omit<I, keyof CommonInput>>;
  /** replace the type-specific rows (called inside the save/create transaction) */
  writeDetails(db: Db, id: number, input: I): Promise<void>;
  /** extra checks that must pass before publishing (and before saving while published) */
  publishProblems?(input: I): Record<string, string>;
  /** default type-specific fields for a new draft */
  defaults(): Omit<I, keyof CommonInput>;
}

/** Version token: updated_at in microseconds, computed in SQL so no precision is lost on the way
 *  through JavaScript Dates (millisecond resolution). */
export const versionOf = sql<string>`(extract(epoch from ${s.resources.updatedAt}) * 1000000)::bigint::text`;

export function todayShanghai(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(now);
}

export async function audit(ctx: AdminCtx, action: string, targetId: number, diff?: unknown) {
  await ctx.db.insert(s.adminAuditLog).values({ actorId: ctx.actorId, action, targetType: "resource", targetId, diff: diff ?? null });
}

// ── reading ──

export interface ResourceRow {
  id: number;
  slug: string;
  title: string;
  status: Status;
  featured: boolean;
  category: string | null;
  sortOrder: number;
  contentUpdatedOn: string;
  updatedAt: Date;
  publishedAt: Date | null;
  origin: string;
  requiredTier: string;
}

export async function listResources(db: Db, type: ResourceType, filter: { status?: Status | "ALL"; q?: string; category?: string } = {}): Promise<ResourceRow[]> {
  const conds = [eq(s.resources.type, type)];
  if (filter.status && filter.status !== "ALL") conds.push(eq(s.resources.status, filter.status));
  else conds.push(ne(s.resources.status, "ARCHIVED"));
  if (filter.category) conds.push(eq(s.categories.name, filter.category));
  if (filter.q?.trim()) {
    const q = `%${filter.q.trim().replace(/[%_\\]/g, "\\$&")}%`;
    conds.push(or(ilike(s.resources.title, q), ilike(s.resources.slug, q))!);
  }
  return db
    .select({
      id: s.resources.id,
      slug: s.resources.slug,
      title: s.resources.title,
      status: s.resources.status,
      featured: s.resources.featured,
      category: s.categories.name,
      sortOrder: s.resources.sortOrder,
      contentUpdatedOn: s.resources.contentUpdatedOn,
      updatedAt: s.resources.updatedAt,
      publishedAt: s.resources.publishedAt,
      origin: s.resources.origin,
      requiredTier: s.resources.requiredTier,
    })
    .from(s.resources)
    .leftJoin(s.categories, eq(s.categories.id, s.resources.categoryId))
    .where(and(...conds))
    .orderBy(desc(s.resources.featured), asc(s.resources.sortOrder), desc(s.resources.contentUpdatedOn), asc(s.resources.slug));
}

export async function listCategories(db: Db): Promise<string[]> {
  const rows = await db.select({ name: s.categories.name }).from(s.categories).orderBy(asc(s.categories.name));
  return rows.map((r) => r.name);
}

export interface ForEdit<I> {
  id: number;
  status: Status;
  publishedAt: Date | null;
  requiredTier: string;
  /** version token for optimistic concurrency */
  version: string;
  input: I;
  structureMediaId: number | null;
  licenseSource: "PLATFORM" | "SPDX_DETECTED" | "PAGE_DECLARED" | "ADMIN_DECLARED" | "UNKNOWN";
  origin: "FILE_IMPORT" | "ADMIN" | "INGESTION";
}

export async function getForEdit<I extends CommonInput>(db: Db, adapter: Adapter<I>, id: number): Promise<ForEdit<I> | null> {
  const [row] = await db
    .select({ r: s.resources, category: s.categories.name, version: versionOf })
    .from(s.resources)
    .leftJoin(s.categories, eq(s.categories.id, s.resources.categoryId))
    .where(and(eq(s.resources.id, id), eq(s.resources.type, adapter.type)));
  if (!row) return null;
  const r = row.r;
  const tags = await db
    .select({ name: s.tags.name })
    .from(s.resourceTags)
    .innerJoin(s.tags, eq(s.tags.id, s.resourceTags.tagId))
    .where(eq(s.resourceTags.resourceId, id))
    .orderBy(asc(s.resourceTags.position));
  const common: CommonInput = {
    slug: r.slug,
    title: r.title,
    summary: r.summary,
    category: row.category ?? "",
    tags: tags.map((t) => t.name),
    author: r.author,
    license: r.license,
    licenseNote: r.licenseNote ?? undefined,
    redistribution: r.redistribution,
    sourceUrl: r.sourceUrl ?? undefined,
    featured: r.featured,
    updatedAt: r.contentUpdatedOn,
    verifiedAt: r.verifiedOn ?? undefined,
    applicableTasks: r.applicableTasks.length ? r.applicableTasks : undefined,
    body: r.bodyMd,
  };
  return {
    id: r.id,
    status: r.status,
    publishedAt: r.publishedAt,
    requiredTier: r.requiredTier,
    version: row.version,
    structureMediaId: r.structureMediaId,
    licenseSource: r.licenseSource,
    origin: r.origin,
    input: { ...common, ...(await adapter.readDetails(db, id)) } as I,
  };
}

// ── writing ──

async function slugTaken(db: Db, slug: string, exceptId?: number) {
  const rows = await db.select({ id: s.resources.id }).from(s.resources).where(eq(s.resources.slug, slug));
  return rows.some((r) => r.id !== exceptId);
}

async function snapshotVersion<I extends CommonInput>(ctx: AdminCtx, adapter: Adapter<I>, id: number, note: string) {
  const current = await getForEdit(ctx.db, adapter, id);
  if (!current) return;
  const [{ next }] = await ctx.db
    .select({ next: sql<number>`coalesce(max(${s.resourceVersions.version}) + 1, 1)::int` })
    .from(s.resourceVersions)
    .where(eq(s.resourceVersions.resourceId, id));
  await ctx.db.insert(s.resourceVersions).values({ resourceId: id, version: next, snapshot: current.input, note, createdBy: ctx.actorId });
}

/** Create a draft from the minimum fields; the editor fills in the rest. */
export async function createDraft<I extends CommonInput>(
  ctx: AdminCtx,
  adapter: Adapter<I>,
  raw: { title: string; slug: string; summary: string; category: string },
): Promise<{ ok: true; id: number } | Fail> {
  const candidate = {
    ...raw,
    tags: [],
    author: "平台原创",
    license: "MIT",
    redistribution: true,
    featured: false,
    updatedAt: todayShanghai(ctx.now),
    body: "",
    ...adapter.defaults(),
  };
  const parsed = adapter.schema.safeParse(candidate);
  if (!parsed.success) return { ok: false, errors: issuesByField(parsed.error) };
  const input = parsed.data;
  if (await slugTaken(ctx.db, input.slug)) return { ok: false, errors: { slug: "这个网址标识已被占用" } };

  const id = await ctx.db.transaction(async (tx) => {
    const db = tx as unknown as Db;
    const categoryId = await upsertCategory(db, input.category);
    const [{ next }] = await db
      .select({ next: sql<number>`coalesce(max(${s.resources.sortOrder}) + 1, 0)::int` })
      .from(s.resources)
      .where(eq(s.resources.type, adapter.type));
    const [row] = await db
      .insert(s.resources)
      .values({
        type: adapter.type,
        slug: input.slug,
        title: input.title,
        summary: input.summary,
        bodyMd: "",
        categoryId,
        requiredTier: "FREE",
        status: "DRAFT",
        sortOrder: next,
        author: input.author,
        license: input.license,
        licenseSource: "PLATFORM",
        redistribution: true,
        origin: "ADMIN",
        contentUpdatedOn: input.updatedAt,
        createdBy: ctx.actorId,
        updatedBy: ctx.actorId,
      })
      .returning({ id: s.resources.id });
    await replaceTags(db, row.id, input.tags);
    await adapter.writeDetails(db, row.id, input);
    return row.id;
  });
  await audit(ctx, "resource.create", id, { slug: input.slug, type: adapter.type });
  return { ok: true, id };
}

/** Save the editor. A published resource goes live immediately (and a version is recorded). */
export async function saveResource<I extends CommonInput>(
  ctx: AdminCtx,
  adapter: Adapter<I>,
  id: number,
  raw: unknown,
  version: string,
): Promise<{ ok: true; version: string } | Fail> {
  const parsed = adapter.schema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: issuesByField(parsed.error) };
  const input = parsed.data;
  const current = await getForEdit(ctx.db, adapter, id);
  if (!current) return { ok: false, errors: { _form: `${adapter.label}不存在` } };
  if (current.status === "ARCHIVED") return { ok: false, errors: { _form: `已归档的${adapter.label}不能编辑，请先恢复` } };
  if (input.slug !== current.input.slug) {
    const slugOk = slugSchema.safeParse(input.slug);
    if (!slugOk.success) return { ok: false, errors: { slug: slugOk.error.issues[0].message } };
    if (current.publishedAt) return { ok: false, errors: { slug: "发布过的资源不能修改网址标识（会让已有链接失效）" } };
    if (await slugTaken(ctx.db, input.slug, id)) return { ok: false, errors: { slug: "这个网址标识已被占用" } };
  }
  if (current.status === "PUBLISHED") {
    const problems = adapter.publishProblems?.(input) ?? {};
    if (Object.keys(problems).length) return { ok: false, errors: problems };
  }

  // Licence: turning redistribution on for content whose licence the platform did not establish
  // itself needs an explicit admin declaration (recorded as ADMIN_DECLARED and audited). The
  // database refuses redistribution for UNKNOWN regardless.
  let licenseSource = current.licenseSource;
  const turningOn = input.redistribution && !current.input.redistribution;
  if (turningOn && licenseSource !== "PLATFORM") {
    if (!input.licenseDeclared) {
      return { ok: false, errors: { redistribution: "来源许可证未被自动确认允许转载。核实来源许可证后，勾选“我已核实来源许可证允许转载”再保存。" } };
    }
    licenseSource = "ADMIN_DECLARED";
  } else if (input.redistribution && licenseSource === "UNKNOWN") {
    return { ok: false, errors: { redistribution: "许可证未知的内容不能转载" } };
  } else if (input.license !== current.input.license && licenseSource !== "PLATFORM" && licenseSource !== "UNKNOWN") {
    // the licence shown is no longer the one that was detected
    if (input.redistribution && !input.licenseDeclared) {
      return { ok: false, errors: { license: "修改转载内容的许可证需要勾选“我已核实来源许可证允许转载”" } };
    }
    licenseSource = "ADMIN_DECLARED";
  }
  const sourceUrlNorm = input.sourceUrl ? normalizeSourceUrl(input.sourceUrl) : null;
  if (sourceUrlNorm) {
    const [other] = await ctx.db
      .select({ id: s.resources.id, title: s.resources.title })
      .from(s.resources)
      .where(and(eq(s.resources.sourceUrlNorm, sourceUrlNorm), ne(s.resources.id, id)));
    if (other) return { ok: false, errors: { sourceUrl: `这个来源已被「${other.title}」收录` } };
  }

  const now = ctx.now ?? new Date();
  const newVersion = await ctx.db.transaction(async (tx) => {
    const db = tx as unknown as Db;
    const categoryId = await upsertCategory(db, input.category);
    const updated = await db
      .update(s.resources)
      .set({
        slug: input.slug,
        title: input.title,
        summary: input.summary,
        bodyMd: input.body,
        applicableTasks: input.applicableTasks ?? [],
        categoryId,
        featured: input.featured ?? false,
        author: input.author,
        license: input.license,
        licenseNote: input.licenseNote ?? null,
        redistribution: input.redistribution,
        licenseSource,
        sourceUrl: input.sourceUrl ?? null,
        sourceUrlNorm,
        contentUpdatedOn: input.updatedAt,
        verifiedOn: input.verifiedAt ?? null,
        updatedAt: now,
        updatedBy: ctx.actorId,
      })
      .where(and(eq(s.resources.id, id), sql`${versionOf} = ${version}`))
      .returning({ version: versionOf });
    if (!updated.length) return null;
    await replaceTags(db, id, input.tags);
    await adapter.writeDetails(db, id, input);
    return updated[0].version;
  });
  if (!newVersion) {
    return { ok: false, conflict: true, errors: { _form: `保存失败：这条${adapter.label}在你打开之后被修改过。请刷新页面，在最新版本上重新编辑。` } };
  }

  const changed = (Object.keys(input) as (keyof I)[]).filter(
    (k) => JSON.stringify(input[k] ?? null) !== JSON.stringify((current.input as I)[k] ?? null),
  );
  if (current.status === "PUBLISHED") {
    await snapshotVersion(ctx, adapter, id, "edit while published");
    await notifyContentChanged(ctx.db);
  }
  if (licenseSource !== current.licenseSource) {
    await audit(ctx, "resource.license_declared", id, { license: input.license, from: current.licenseSource, to: licenseSource, redistribution: input.redistribution });
  }
  await audit(ctx, "resource.update", id, { fields: changed.filter((k) => k !== "licenseDeclared") });
  return { ok: true, version: newVersion };
}

export async function publishResource<I extends CommonInput>(ctx: AdminCtx, adapter: Adapter<I>, id: number): Promise<{ ok: true } | Fail> {
  const current = await getForEdit(ctx.db, adapter, id);
  if (!current) return { ok: false, errors: { _form: `${adapter.label}不存在` } };
  if (current.status === "ARCHIVED") return { ok: false, errors: { _form: `已归档的${adapter.label}不能发布，请先恢复` } };
  const parsed = adapter.schema.safeParse(current.input);
  if (!parsed.success) return { ok: false, errors: issuesByField(parsed.error) };
  const problems = adapter.publishProblems?.(parsed.data) ?? {};
  if (Object.keys(problems).length) return { ok: false, errors: problems };

  const now = ctx.now ?? new Date();
  await ctx.db
    .update(s.resources)
    .set({ status: "PUBLISHED", publishedAt: current.publishedAt ?? now, updatedAt: now, updatedBy: ctx.actorId })
    .where(eq(s.resources.id, id));
  await snapshotVersion(ctx, adapter, id, "publish");
  await audit(ctx, "resource.publish", id);
  await notifyContentChanged(ctx.db);
  return { ok: true };
}

export async function setStatus(ctx: AdminCtx, type: ResourceType, id: number, from: Status[], to: Status, action: string): Promise<{ ok: true } | Fail> {
  const rows = await ctx.db
    .update(s.resources)
    .set({ status: to, updatedAt: ctx.now ?? new Date(), updatedBy: ctx.actorId })
    .where(and(eq(s.resources.id, id), eq(s.resources.type, type), inArray(s.resources.status, from)))
    .returning({ id: s.resources.id });
  if (!rows.length) return { ok: false, errors: { _form: "当前状态下不能执行这个操作" } };
  await audit(ctx, action, id);
  await notifyContentChanged(ctx.db);
  return { ok: true };
}

export const unpublish = (ctx: AdminCtx, type: ResourceType, id: number) => setStatus(ctx, type, id, ["PUBLISHED"], "DRAFT", "resource.unpublish");
/** Removes it from the admin list; the action layer requires re-authentication. */
export const archive = (ctx: AdminCtx, type: ResourceType, id: number) => setStatus(ctx, type, id, ["DRAFT", "PUBLISHED"], "ARCHIVED", "resource.archive");
export const restore = (ctx: AdminCtx, type: ResourceType, id: number) => setStatus(ctx, type, id, ["ARCHIVED"], "DRAFT", "resource.restore");

/**
 * Move one place up or down in the public order. Featured items always display first, so an item
 * only moves within its group. Positions are renumbered 0..n in display order.
 */
export async function move(ctx: AdminCtx, type: ResourceType, id: number, direction: "up" | "down"): Promise<{ ok: true } | Fail> {
  const outcome = await ctx.db.transaction(async (tx) => {
    const db = tx as unknown as Db;
    const rows = await db
      .select({ id: s.resources.id, featured: s.resources.featured })
      .from(s.resources)
      .where(and(eq(s.resources.type, type), ne(s.resources.status, "ARCHIVED")))
      .orderBy(desc(s.resources.featured), asc(s.resources.sortOrder), desc(s.resources.contentUpdatedOn), asc(s.resources.slug))
      .for("update");
    const i = rows.findIndex((r) => r.id === id);
    const j = direction === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= rows.length) return "edge";
    if (rows[i].featured !== rows[j].featured) return "group";
    [rows[i], rows[j]] = [rows[j], rows[i]];
    for (const [pos, row] of rows.entries()) {
      await db.update(s.resources).set({ sortOrder: pos }).where(eq(s.resources.id, row.id));
    }
    return "moved";
  });
  if (outcome === "edge") return { ok: false, errors: { _form: "已经到头了" } };
  if (outcome === "group") return { ok: false, errors: { _form: "精选内容固定排在最前面；取消精选后才能移到非精选内容之间" } };
  await audit(ctx, "resource.reorder", id, { direction });
  await notifyContentChanged(ctx.db);
  return { ok: true };
}

export async function versionCount(db: Db, id: number): Promise<number> {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.resourceVersions).where(eq(s.resourceVersions.resourceId, id));
  return n;
}
