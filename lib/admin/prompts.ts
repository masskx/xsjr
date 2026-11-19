// Admin operations on prompts. Framework-free (tested directly against PostgreSQL).
//
// Lifecycle: DRAFT -> PUBLISHED -> (unpublish) DRAFT; any -> ARCHIVED -> (restore) DRAFT.
// Only PUBLISHED rows are ever visible publicly (lib/repo filters on status), and every mutation
// sends NOTIFY content_changed so lists, search, sitemap and detail pages update immediately.
//
// Concurrency: the editor submits the row's updated_at as a version token; a save based on an
// older version is refused instead of silently overwriting someone else's changes.
import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import * as s from "../db/schema";
import { notifyContentChanged, replaceTags, upsertCategory } from "../import/content-import";
import { issuesByField, promptInputSchema, templateProblems, type PromptInput } from "../content/validation";

export interface AdminCtx {
  db: Db;
  actorId: number;
  now?: Date;
}

export type Status = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type Fail = { ok: false; errors: Record<string, string>; conflict?: boolean };

const TEMPLATE_PATH = "template.md";

/** Version token: updated_at in microseconds, computed in SQL so no precision is lost on the way
 *  through JavaScript Dates (millisecond resolution). */
const versionOf = sql<string>`(extract(epoch from ${s.resources.updatedAt}) * 1000000)::bigint::text`;

function todayShanghai(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(now);
}

async function audit(ctx: AdminCtx, action: string, targetId: number, diff?: unknown) {
  await ctx.db.insert(s.adminAuditLog).values({ actorId: ctx.actorId, action, targetType: "resource", targetId, diff: diff ?? null });
}

// ── reading ──

export interface PromptRow {
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
}

export async function listPrompts(db: Db, filter: { status?: Status | "ALL"; q?: string; category?: string } = {}): Promise<PromptRow[]> {
  const conds = [eq(s.resources.type, "PROMPT")];
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

export interface PromptForEdit {
  id: number;
  status: Status;
  publishedAt: Date | null;
  /** version token for optimistic concurrency */
  version: string;
  input: PromptInput;
}

export async function getPromptForEdit(db: Db, id: number): Promise<PromptForEdit | null> {
  const [row] = await db
    .select({ r: s.resources, category: s.categories.name, version: versionOf })
    .from(s.resources)
    .leftJoin(s.categories, eq(s.categories.id, s.resources.categoryId))
    .where(and(eq(s.resources.id, id), eq(s.resources.type, "PROMPT")));
  if (!row) return null;
  const r = row.r;
  const [tags, vars, prompt, files] = await Promise.all([
    db
      .select({ name: s.tags.name })
      .from(s.resourceTags)
      .innerJoin(s.tags, eq(s.tags.id, s.resourceTags.tagId))
      .where(eq(s.resourceTags.resourceId, id))
      .orderBy(asc(s.resourceTags.position)),
    db.select().from(s.promptVariables).where(eq(s.promptVariables.resourceId, id)).orderBy(asc(s.promptVariables.sortOrder)),
    db.select().from(s.resourcePrompt).where(eq(s.resourcePrompt.resourceId, id)),
    db.select().from(s.resourceFiles).where(and(eq(s.resourceFiles.resourceId, id), eq(s.resourceFiles.path, TEMPLATE_PATH))),
  ]);
  return {
    id: r.id,
    status: r.status,
    publishedAt: r.publishedAt,
    version: row.version,
    input: {
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
      body: r.bodyMd,
      template: files[0]?.content ?? "",
      notes: prompt[0]?.notes ?? undefined,
      variables: vars.map((v) => ({
        key: v.key,
        label: v.label,
        type: v.type,
        required: v.required ?? undefined,
        default: v.defaultValue ?? undefined,
        help: v.help ?? undefined,
        options: (v.options as string[] | null) ?? undefined,
      })),
    },
  };
}

// ── writing ──

async function slugTaken(db: Db, slug: string, exceptId?: number) {
  const rows = await db.select({ id: s.resources.id }).from(s.resources).where(eq(s.resources.slug, slug));
  return rows.some((r) => r.id !== exceptId);
}

async function writeDetails(db: Db, id: number, input: PromptInput) {
  await replaceTags(db, id, input.tags);
  await db.delete(s.resourcePrompt).where(eq(s.resourcePrompt.resourceId, id));
  await db.insert(s.resourcePrompt).values({ resourceId: id, notes: input.notes?.length ? input.notes : null });
  await db.delete(s.promptVariables).where(eq(s.promptVariables.resourceId, id));
  if (input.variables.length) {
    await db.insert(s.promptVariables).values(
      input.variables.map((v, i) => ({
        resourceId: id,
        key: v.key,
        label: v.label,
        type: v.type,
        required: v.required ?? null,
        defaultValue: v.default ?? null,
        help: v.help ?? null,
        options: v.type === "select" ? (v.options ?? null) : null,
        sortOrder: i,
      })),
    );
  }
  await db.delete(s.resourceFiles).where(and(eq(s.resourceFiles.resourceId, id), eq(s.resourceFiles.path, TEMPLATE_PATH)));
  await db.insert(s.resourceFiles).values({
    resourceId: id,
    path: TEMPLATE_PATH,
    content: input.template,
    language: "markdown",
    sizeBytes: Buffer.byteLength(input.template, "utf8"),
  });
}

async function snapshotVersion(db: Db, id: number, actorId: number, note: string) {
  const current = await getPromptForEdit(db, id);
  if (!current) return;
  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${s.resourceVersions.version}) + 1, 1)::int` })
    .from(s.resourceVersions)
    .where(eq(s.resourceVersions.resourceId, id));
  await db.insert(s.resourceVersions).values({ resourceId: id, version: next, snapshot: current.input, note, createdBy: actorId });
}

/** Create a draft with the minimum needed; the editor fills in the rest. */
export async function createPromptDraft(
  ctx: AdminCtx,
  raw: { title: string; slug: string; summary: string; category: string },
): Promise<{ ok: true; id: number } | Fail> {
  const input = promptInputSchema.safeParse({
    ...raw,
    tags: [],
    author: "平台原创",
    license: "MIT",
    redistribution: true,
    featured: false,
    updatedAt: todayShanghai(ctx.now),
    body: "",
    template: "（在这里编写提示词模板，用 {{变量名}} 引用下方定义的变量。）",
    variables: [],
  });
  if (!input.success) return { ok: false, errors: issuesByField(input.error) };
  if (await slugTaken(ctx.db, input.data.slug)) return { ok: false, errors: { slug: "这个网址标识已被占用" } };

  const id = await ctx.db.transaction(async (tx) => {
    const db = tx as unknown as Db;
    const categoryId = await upsertCategory(db, input.data.category);
    const [{ next }] = await db
      .select({ next: sql<number>`coalesce(max(${s.resources.sortOrder}) + 1, 0)::int` })
      .from(s.resources)
      .where(eq(s.resources.type, "PROMPT"));
    const [row] = await db
      .insert(s.resources)
      .values({
        type: "PROMPT",
        slug: input.data.slug,
        title: input.data.title,
        summary: input.data.summary,
        bodyMd: "",
        categoryId,
        requiredTier: "FREE",
        status: "DRAFT",
        sortOrder: next,
        author: input.data.author,
        license: input.data.license,
        licenseSource: "PLATFORM",
        redistribution: true,
        origin: "ADMIN",
        contentUpdatedOn: input.data.updatedAt,
        createdBy: ctx.actorId,
        updatedBy: ctx.actorId,
      })
      .returning({ id: s.resources.id });
    await writeDetails(db, row.id, input.data);
    return row.id;
  });
  await audit(ctx, "resource.create", id, { slug: input.data.slug });
  return { ok: true, id };
}

/** Save the editor. A published prompt goes live immediately (and a version is recorded). */
export async function savePrompt(ctx: AdminCtx, id: number, raw: unknown, version: string): Promise<{ ok: true; version: string } | Fail> {
  const parsed = promptInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: issuesByField(parsed.error) };
  const input = parsed.data;
  const current = await getPromptForEdit(ctx.db, id);
  if (!current) return { ok: false, errors: { _form: "提示词不存在" } };
  if (current.status === "ARCHIVED") return { ok: false, errors: { _form: "已归档的提示词不能编辑，请先恢复" } };
  if (input.slug !== current.input.slug) {
    if (current.publishedAt) return { ok: false, errors: { slug: "发布过的资源不能修改网址标识（会让已有链接失效）" } };
    if (await slugTaken(ctx.db, input.slug, id)) return { ok: false, errors: { slug: "这个网址标识已被占用" } };
  }
  if (current.status === "PUBLISHED") {
    const problems = templateProblems(input.template, input.variables);
    if (problems.length) return { ok: false, errors: { template: problems.join("；") } };
  }

  const now = ctx.now ?? new Date();
  const result = await ctx.db.transaction(async (tx) => {
    const db = tx as unknown as Db;
    const categoryId = await upsertCategory(db, input.category);
    const updated = await db
      .update(s.resources)
      .set({
        slug: input.slug,
        title: input.title,
        summary: input.summary,
        bodyMd: input.body,
        categoryId,
        featured: input.featured ?? false,
        author: input.author,
        license: input.license,
        licenseNote: input.licenseNote ?? null,
        redistribution: input.redistribution,
        sourceUrl: input.sourceUrl ?? null,
        contentUpdatedOn: input.updatedAt,
        verifiedOn: input.verifiedAt ?? null,
        updatedAt: now,
        updatedBy: ctx.actorId,
      })
      .where(and(eq(s.resources.id, id), sql`${versionOf} = ${version}`))
      .returning({ version: versionOf });
    if (!updated.length) return null;
    await writeDetails(db, id, input);
    return updated[0].version;
  });
  if (!result) return { ok: false, conflict: true, errors: { _form: "保存失败：这条提示词在你打开之后被修改过。请刷新页面，在最新版本上重新编辑。" } };

  const changed = (Object.keys(input) as (keyof PromptInput)[]).filter(
    (k) => JSON.stringify(input[k] ?? null) !== JSON.stringify(current.input[k] ?? null),
  );
  if (current.status === "PUBLISHED") {
    await snapshotVersion(ctx.db, id, ctx.actorId, "edit while published");
    await notifyContentChanged(ctx.db);
  }
  await audit(ctx, "resource.update", id, { fields: changed });
  return { ok: true, version: result };
}

export async function publishPrompt(ctx: AdminCtx, id: number): Promise<{ ok: true } | Fail> {
  const current = await getPromptForEdit(ctx.db, id);
  if (!current) return { ok: false, errors: { _form: "提示词不存在" } };
  if (current.status === "ARCHIVED") return { ok: false, errors: { _form: "已归档的提示词不能发布，请先恢复" } };
  const parsed = promptInputSchema.safeParse(current.input);
  if (!parsed.success) return { ok: false, errors: issuesByField(parsed.error) };
  const problems = templateProblems(parsed.data.template, parsed.data.variables);
  if (problems.length) return { ok: false, errors: { template: problems.join("；") } };

  const now = ctx.now ?? new Date();
  await ctx.db
    .update(s.resources)
    .set({ status: "PUBLISHED", publishedAt: current.publishedAt ?? now, updatedAt: now, updatedBy: ctx.actorId })
    .where(eq(s.resources.id, id));
  await snapshotVersion(ctx.db, id, ctx.actorId, "publish");
  await audit(ctx, "resource.publish", id);
  await notifyContentChanged(ctx.db);
  return { ok: true };
}

async function setStatus(ctx: AdminCtx, id: number, from: Status[], to: Status, action: string): Promise<{ ok: true } | Fail> {
  const rows = await ctx.db
    .update(s.resources)
    .set({ status: to, updatedAt: ctx.now ?? new Date(), updatedBy: ctx.actorId })
    .where(and(eq(s.resources.id, id), eq(s.resources.type, "PROMPT"), inArray(s.resources.status, from)))
    .returning({ id: s.resources.id });
  if (!rows.length) return { ok: false, errors: { _form: "当前状态下不能执行这个操作" } };
  await audit(ctx, action, id);
  await notifyContentChanged(ctx.db);
  return { ok: true };
}

export const unpublishPrompt = (ctx: AdminCtx, id: number) => setStatus(ctx, id, ["PUBLISHED"], "DRAFT", "resource.unpublish");
/** Destructive in effect (removes from the admin list); the action layer requires re-auth. */
export const archivePrompt = (ctx: AdminCtx, id: number) => setStatus(ctx, id, ["DRAFT", "PUBLISHED"], "ARCHIVED", "resource.archive");
export const restorePrompt = (ctx: AdminCtx, id: number) => setStatus(ctx, id, ["ARCHIVED"], "DRAFT", "resource.restore");

/**
 * Move a prompt one place up or down in the public order. Featured prompts always display first,
 * so a prompt only moves within its group (featured / not featured). Positions are renumbered
 * 0..n in display order, so duplicates left by imports cannot block a move.
 */
export async function movePrompt(ctx: AdminCtx, id: number, direction: "up" | "down"): Promise<{ ok: true } | Fail> {
  const outcome = await ctx.db.transaction(async (tx) => {
    const db = tx as unknown as Db;
    const rows = await db
      .select({ id: s.resources.id, featured: s.resources.featured })
      .from(s.resources)
      .where(and(eq(s.resources.type, "PROMPT"), ne(s.resources.status, "ARCHIVED")))
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
