// One ingestion item, start to finish: dedup by URL -> fetch -> dedup by URL again (after
// redirects) -> DeepSeek extraction -> dedup by title -> create a DRAFT skill with provenance.
//
// Hard rules enforced here (and by the database):
// - The result is always status DRAFT. This module never publishes; no code path from the
//   worker reaches the published state.
// - redistribution = true only when deterministic detection found a permissive licence AND the
//   source is itself the skill file (so the copy is the author's original text, not AI output).
//   Otherwise the draft is index-only: no resource_files row, the body holds only our own
//   summary, and the public page links to the source.
// - Every draft gets a resource_provenance row (URL, time, HTTP status, content hash, licence,
//   how the licence was established and the evidence).
import { and, eq, ne, or, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import * as s from "../db/schema";
import { replaceTags, upsertCategory } from "../import/content-import";
import { skillAdapter, skillInputSchema, type SkillInput } from "../admin/skills";
import { todayShanghai } from "../admin/resources";
import { slugSchema } from "../content/validation";
import { canRedistribute, UNKNOWN_LICENSE_LABEL } from "./license";
import { extractWithLlm, type LlmResult } from "./llm";
import { fetchSource, type Fetcher, type SourceDoc } from "./source";
import { SIMILARITY_THRESHOLD, titleSimilarity } from "./similar";
import { normalizeSourceUrl } from "./url";

export const FALLBACK_CATEGORY = "其他";

export interface PipelineDeps {
  fetcher?: Fetcher;
  llm?: (text: string, url: string, categories: string[]) => Promise<LlmResult>;
  now?: Date;
}

export type Outcome =
  | { kind: "draft"; resourceId: number }
  | { kind: "duplicate"; resourceId: number; reason: string };

type Item = typeof s.ingestionItems.$inferSelect;

async function findByNorm(db: Db, norm: string): Promise<number | null> {
  const [row] = await db.select({ id: s.resources.id }).from(s.resources).where(eq(s.resources.sourceUrlNorm, norm)).limit(1);
  return row?.id ?? null;
}

/** Most similar non-archived skill title above the threshold. */
export async function findSimilarTitle(db: Db, titles: string[]): Promise<{ id: number; title: string; score: number } | null> {
  const candidates = titles.filter((t) => t && t.trim().length >= 2);
  if (!candidates.length) return null;
  const rows = await db
    .select({ id: s.resources.id, title: s.resources.title, trgm: sql<number>`greatest(${sql.join(candidates.map((t) => sql`similarity(${s.resources.title}, ${t})`), sql`, `)})` })
    .from(s.resources)
    .where(and(eq(s.resources.type, "SKILL"), ne(s.resources.status, "ARCHIVED")));
  let best: { id: number; title: string; score: number } | null = null;
  for (const r of rows) {
    const score = Math.max(Number(r.trgm), ...candidates.map((t) => titleSimilarity(t, r.title)));
    if (score > SIMILARITY_THRESHOLD && (!best || score > best.score)) best = { id: r.id, title: r.title, score };
  }
  return best;
}

const chars = (s: string) => [...s];
const clip = (s: string, n: number) => chars(s).slice(0, n).join("");

function slugBase(ex: LlmResult["extraction"], doc: SourceDoc, itemId: number): string {
  for (const raw of [ex.name, doc.title ?? "", doc.finalUrl.split("/").filter(Boolean).pop() ?? ""]) {
    const slug = raw
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50)
      .replace(/-+$/g, "");
    if (slugSchema.safeParse(slug).success) return slug;
  }
  return `skill-${itemId}`;
}

async function uniqueSlug(db: Db, base: string): Promise<string> {
  const rows = await db
    .select({ slug: s.resources.slug })
    .from(s.resources)
    .where(or(eq(s.resources.slug, base), sql`${s.resources.slug} LIKE ${`${base}-%`}`));
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

function summaryOf(ex: LlmResult["extraction"], host: string): string {
  let summary = ex.summary_zh.trim();
  if (chars(summary).length < 20) summary = `${summary}${summary ? "。" : ""}导入自 ${host} 的 Agent Skill，待审核补充说明。`;
  return clip(summary, 110);
}

function bodyOf(ex: LlmResult["extraction"], doc: SourceDoc, redistribution: boolean): string {
  const host = new URL(doc.finalUrl).hostname.replace(/^www\./, "");
  const parts = [ex.description_zh.trim()];
  parts.push(
    redistribution
      ? `> 以上说明由平台整理。SKILL.md 原文按 ${doc.license.spdx} 许可转载，来源：[${host}](${doc.finalUrl})。`
      : `> 以上说明由平台整理，仅作索引。原文与使用条款以来源为准：[${host}](${doc.finalUrl})。`,
  );
  return parts.filter(Boolean).join("\n\n");
}

export async function processItem(db: Db, item: Item, createdBy: number, deps: PipelineDeps = {}): Promise<Outcome> {
  const now = deps.now ?? new Date();
  const existing = await findByNorm(db, item.sourceUrlNorm);
  if (existing) return { kind: "duplicate", resourceId: existing, reason: "来源网址已收录" };

  const doc = await fetchSource(item.sourceUrl, deps.fetcher);
  const finalNorm = normalizeSourceUrl(doc.finalUrl);
  await db
    .update(s.ingestionItems)
    .set({
      robotsAllowed: true,
      httpStatus: doc.httpStatus,
      fetchedBytes: doc.fetchedBytes,
      extractedSha256: doc.contentSha256,
      title: doc.title,
      detectedLicense: doc.license.spdx,
      licenseSource: doc.license.source,
      licenseEvidence: doc.license.evidence,
      updatedAt: now,
    })
    .where(eq(s.ingestionItems.id, item.id));
  if (finalNorm && finalNorm !== item.sourceUrlNorm) {
    const dup = await findByNorm(db, finalNorm);
    if (dup) return { kind: "duplicate", resourceId: dup, reason: "重定向后的网址已收录" };
  }

  const categories = (await db.select({ name: s.categories.name }).from(s.categories)).map((c) => c.name);
  const llm = await (deps.llm ?? extractWithLlm)(doc.text, doc.finalUrl, categories);
  const ex = llm.extraction;
  await db
    .update(s.ingestionItems)
    .set({ llmModel: llm.model, llmTokensIn: llm.tokensIn, llmTokensOut: llm.tokensOut, llmResult: ex, updatedAt: new Date() })
    .where(eq(s.ingestionItems.id, item.id));

  const similar = await findSimilarTitle(db, [ex.title_zh, doc.title ?? ""]);
  if (similar) return { kind: "duplicate", resourceId: similar.id, reason: `标题与「${similar.title}」相似（${Math.round(similar.score * 100)}%）` };

  const host = new URL(doc.finalUrl).hostname.replace(/^www\./, "");
  const redistribution = canRedistribute(doc.license) && !!doc.skillMd;
  const licenseNote = redistribution
    ? clip(`${doc.license.copyright ? `${doc.license.copyright}。` : ""}按 ${doc.license.spdx} 许可转载，原文：${doc.finalUrl}`, 300)
    : undefined;
  const tags = [...new Set(ex.tags.filter((t) => chars(t).length <= 20))].slice(0, 6);
  const files = ex.files.map((f) => ({ path: f.path, desc: f.desc || undefined }));
  if (doc.skillMd && !files.some((f) => f.path.toLowerCase() === "skill.md")) files.unshift({ path: "SKILL.md", desc: "技能说明" });

  const input: SkillInput = {
    slug: await uniqueSlug(db, slugBase(ex, doc, item.id)),
    title: chars(ex.title_zh).length >= 2 ? clip(ex.title_zh, 80) : clip(doc.title ?? host, 80),
    summary: summaryOf(ex, host),
    category: categories.includes(ex.category) ? ex.category : FALLBACK_CATEGORY,
    tags,
    author: clip(doc.author, 40) || host,
    license: doc.license.spdx ?? UNKNOWN_LICENSE_LABEL,
    licenseNote,
    redistribution,
    sourceUrl: item.sourceUrl,
    featured: false,
    updatedAt: todayShanghai(now),
    applicableTasks: ex.applicable_tasks.length ? ex.applicable_tasks : undefined,
    body: bodyOf(ex, doc, redistribution),
    skillMd: redistribution ? doc.skillMd! : "",
    compat: ex.compat.map((c) => ({ tool: c.tool, supportedRange: "见来源说明", note: c.note || undefined })),
    files,
    risks: ex.risks.length ? ex.risks : undefined,
    dependencies: ex.dependencies.length ? ex.dependencies : undefined,
  };
  const parsed = skillInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw Object.assign(new Error(`抽取结果未通过校验：${issue.path.join(".")} ${issue.message}`), { permanent: true });
  }
  const data = parsed.data;

  const resourceId = await db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const categoryId = await upsertCategory(t, data.category);
    const [{ next }] = await t
      .select({ next: sql<number>`coalesce(max(${s.resources.sortOrder}) + 1, 0)::int` })
      .from(s.resources)
      .where(eq(s.resources.type, "SKILL"));
    const [row] = await t
      .insert(s.resources)
      .values({
        type: "SKILL",
        slug: data.slug,
        title: data.title,
        summary: data.summary,
        bodyMd: data.body,
        applicableTasks: data.applicableTasks ?? [],
        categoryId,
        requiredTier: "FREE",
        status: "DRAFT", // never anything else from here
        sortOrder: next,
        author: data.author,
        license: data.license,
        licenseSource: doc.license.source,
        licenseNote: data.licenseNote ?? null,
        redistribution: data.redistribution,
        sourceUrl: data.sourceUrl ?? null,
        sourceUrlNorm: item.sourceUrlNorm,
        origin: "INGESTION",
        contentUpdatedOn: data.updatedAt,
        createdBy,
      })
      .returning({ id: s.resources.id });
    await replaceTags(t, row.id, data.tags);
    await skillAdapter.writeDetails(t, row.id, data);
    await t.insert(s.resourceProvenance).values({
      resourceId: row.id,
      sourceUrl: doc.finalUrl,
      retrievedAt: now,
      httpStatus: doc.httpStatus,
      contentSha256: doc.contentSha256,
      license: data.license,
      licenseSource: doc.license.source,
      licenseEvidence: doc.license.evidence,
      ingestionItemId: item.id,
    });
    await t.insert(s.adminAuditLog).values({
      actorId: createdBy,
      action: "ingest.draft",
      targetType: "resource",
      targetId: row.id,
      diff: { itemId: item.id, sourceUrl: item.sourceUrl, license: data.license, licenseSource: doc.license.source, redistribution: data.redistribution },
    });
    return row.id;
  });
  return { kind: "draft", resourceId };
}
