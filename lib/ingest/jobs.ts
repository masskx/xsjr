// Ingestion jobs as the admin sees them: create (URL list or search query), list, inspect, retry.
// The work itself happens in lib/ingest/worker.ts.
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import * as s from "../db/schema";
import { llmConfig } from "./llm";
import { searchProvider } from "./search";
import { normalizeSourceUrl, parseDomainList, parseUrlList } from "./url";

import { MAX_QUERY_RESULTS, MAX_URLS_PER_JOB } from "./limits";
export { MAX_QUERY_RESULTS, MAX_URLS_PER_JOB };
export const NOTIFY_CHANNEL = "ingest_queued";

export async function ingestStatus() {
  const llm = await llmConfig();
  const search = searchProvider();
  return {
    enabled: llm.enabled,
    model: llm.model,
    baseUrl: llm.baseUrl,
    label: llm.label,
    source: llm.source,
    dailyTokenLimit: llm.dailyTokenLimit,
    searchProvider: search?.name ?? null,
  };
}

type Fail = { ok: false; errors: Record<string, string> };

async function audit(db: Db, actorId: number, action: string, jobId: number, diff: unknown) {
  await db.insert(s.adminAuditLog).values({ actorId, action, targetType: "ingestion_job", targetId: jobId, diff });
}

export async function createUrlJob(db: Db, actorId: number, text: string): Promise<{ ok: true; jobId: number; queued: number; skipped: string[] } | Fail> {
  if (!(await llmConfig()).enabled) return { ok: false, errors: { _form: "未配置模型服务，请先在「设置」里填写 API Key" } };
  const { urls, invalid } = parseUrlList(text);
  if (invalid.length) return { ok: false, errors: { urls: `这些不是有效的 http(s) 网址：${invalid.slice(0, 3).join("、")}${invalid.length > 3 ? " 等" : ""}` } };
  if (!urls.length) return { ok: false, errors: { urls: "请至少填写一个网址" } };
  if (urls.length > MAX_URLS_PER_JOB) return { ok: false, errors: { urls: `一次最多 ${MAX_URLS_PER_JOB} 个网址（当前 ${urls.length} 个）` } };

  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const [job] = await t
      .insert(s.ingestionJobs)
      .values({ mode: urls.length === 1 ? "URL" : "BULK", input: { urls }, createdBy: actorId })
      .returning({ id: s.ingestionJobs.id });
    const inserted = await t
      .insert(s.ingestionItems)
      .values(urls.map((u) => ({ jobId: job.id, sourceUrl: u, sourceUrlNorm: normalizeSourceUrl(u)! })))
      .onConflictDoNothing() // already in flight in another job
      .returning({ url: s.ingestionItems.sourceUrl });
    const got = new Set(inserted.map((r) => r.url));
    const skipped = urls.filter((u) => !got.has(u));
    if (!inserted.length) {
      await t.update(s.ingestionJobs).set({ status: "done", finishedAt: new Date(), error: "这些网址都已在其他任务中排队" }).where(eq(s.ingestionJobs.id, job.id));
    }
    await audit(t, actorId, "ingest.job_create", job.id, { mode: urls.length === 1 ? "URL" : "BULK", urls: urls.length, skipped: skipped.length });
    await t.execute(sql.raw(`NOTIFY ${NOTIFY_CHANNEL}`));
    return { ok: true as const, jobId: job.id, queued: inserted.length, skipped };
  });
}

export async function createQueryJob(db: Db, actorId: number, raw: { query: string; domains: string; limit: number }): Promise<{ ok: true; jobId: number } | Fail> {
  if (!(await llmConfig()).enabled) return { ok: false, errors: { _form: "未配置模型服务，请先在「设置」里填写 API Key" } };
  if (!searchProvider()) return { ok: false, errors: { _form: "服务器未配置搜索服务（SEARCH_PROVIDER），只能按网址导入" } };
  const query = raw.query.trim();
  if ([...query].length < 2 || [...query].length > 100) return { ok: false, errors: { query: "搜索词需要 2–100 个字" } };
  const { domains, invalid } = parseDomainList(raw.domains);
  if (invalid.length) return { ok: false, errors: { domains: `这些不是有效的域名：${invalid.slice(0, 3).join("、")}` } };
  if (!domains.length) return { ok: false, errors: { domains: "请至少填写一个允许的域名，例如 github.com" } };
  if (domains.length > 20) return { ok: false, errors: { domains: "允许的域名最多 20 个" } };
  const limit = Math.min(Math.max(Math.trunc(raw.limit) || 5, 1), MAX_QUERY_RESULTS);
  const [job] = await db.insert(s.ingestionJobs).values({ mode: "QUERY", input: { query, domains, limit }, createdBy: actorId }).returning({ id: s.ingestionJobs.id });
  await audit(db, actorId, "ingest.job_create", job.id, { mode: "QUERY", query, domains, limit });
  await db.execute(sql.raw(`NOTIFY ${NOTIFY_CHANNEL}`));
  return { ok: true, jobId: job.id };
}

export interface JobRow {
  id: number;
  mode: string;
  status: string;
  input: unknown;
  createdAt: Date;
  finishedAt: Date | null;
  error: string | null;
  counts: Record<"queued" | "running" | "failed" | "done" | "drafts" | "duplicates", number>;
}

export async function listJobs(db: Db, limit = 30): Promise<JobRow[]> {
  const jobs = await db.select().from(s.ingestionJobs).orderBy(desc(s.ingestionJobs.id)).limit(limit);
  if (!jobs.length) return [];
  const counts = await db
    .select({
      jobId: s.ingestionItems.jobId,
      status: s.ingestionItems.status,
      n: sql<number>`count(*)::int`,
      drafts: sql<number>`count(${s.ingestionItems.resourceId})::int`,
      duplicates: sql<number>`count(${s.ingestionItems.duplicateOf})::int`,
    })
    .from(s.ingestionItems)
    .where(inArray(s.ingestionItems.jobId, jobs.map((j) => j.id)))
    .groupBy(s.ingestionItems.jobId, s.ingestionItems.status);
  return jobs.map((j) => {
    const c = { queued: 0, running: 0, failed: 0, done: 0, drafts: 0, duplicates: 0 };
    for (const r of counts.filter((r) => r.jobId === j.id)) {
      c[r.status] += r.n;
      c.drafts += r.drafts;
      c.duplicates += r.duplicates;
    }
    return { id: j.id, mode: j.mode, status: j.status, input: j.input, createdAt: j.createdAt, finishedAt: j.finishedAt, error: j.error, counts: c };
  });
}

export async function getJob(db: Db, id: number) {
  const [job] = await db.select().from(s.ingestionJobs).where(eq(s.ingestionJobs.id, id));
  if (!job) return null;
  const items = await db
    .select({
      item: s.ingestionItems,
      draftTitle: sql<string | null>`(SELECT title FROM resources WHERE id = ${s.ingestionItems.resourceId})`,
      draftStatus: sql<string | null>`(SELECT status::text FROM resources WHERE id = ${s.ingestionItems.resourceId})`,
      dupTitle: sql<string | null>`(SELECT title FROM resources WHERE id = ${s.ingestionItems.duplicateOf})`,
      dupType: sql<string | null>`(SELECT type::text FROM resources WHERE id = ${s.ingestionItems.duplicateOf})`,
    })
    .from(s.ingestionItems)
    .where(eq(s.ingestionItems.jobId, id))
    .orderBy(s.ingestionItems.id);
  return { job, items };
}

export async function retryItem(db: Db, actorId: number, itemId: number): Promise<{ ok: true } | Fail> {
  try {
    const rows = await db
      .update(s.ingestionItems)
      .set({ status: "queued", attempts: 0, error: null, nextAttemptAt: null, lockedAt: null, updatedAt: new Date() })
      .where(and(eq(s.ingestionItems.id, itemId), eq(s.ingestionItems.status, "failed")))
      .returning({ jobId: s.ingestionItems.jobId });
    if (!rows.length) return { ok: false, errors: { _form: "只有失败的条目可以重试" } };
    await db.update(s.ingestionJobs).set({ status: "running", finishedAt: null }).where(eq(s.ingestionJobs.id, rows[0].jobId));
    await audit(db, actorId, "ingest.retry", rows[0].jobId, { itemId });
    await db.execute(sql.raw(`NOTIFY ${NOTIFY_CHANNEL}`));
    return { ok: true };
  } catch (e) {
    if ((e as { code?: string }).code === "23505" || (e as { cause?: { code?: string } }).cause?.code === "23505") {
      return { ok: false, errors: { _form: "这个网址正在另一个任务中处理" } };
    }
    throw e;
  }
}

/** Tokens used today (Asia/Shanghai), for the daily budget and the status page. */
export async function tokensToday(db: Db): Promise<number> {
  const [{ n }] = await db
    .select({ n: sql<number>`coalesce(sum(coalesce(${s.ingestionItems.llmTokensIn}, 0) + coalesce(${s.ingestionItems.llmTokensOut}, 0)), 0)::int` })
    .from(s.ingestionItems)
    .where(sql`${s.ingestionItems.updatedAt} >= (date_trunc('day', now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai')`);
  return n;
}

/** Provenance and ingestion record for the draft review panel. */
export async function provenanceOf(db: Db, resourceId: number) {
  const rows = await db
    .select({
      p: s.resourceProvenance,
      llmModel: s.ingestionItems.llmModel,
      llmResult: s.ingestionItems.llmResult,
      jobId: s.ingestionItems.jobId,
    })
    .from(s.resourceProvenance)
    .leftJoin(s.ingestionItems, eq(s.ingestionItems.id, s.resourceProvenance.ingestionItemId))
    .where(eq(s.resourceProvenance.resourceId, resourceId))
    .orderBy(desc(s.resourceProvenance.id));
  const [r] = await db
    .select({ licenseSource: s.resources.licenseSource, origin: s.resources.origin })
    .from(s.resources)
    .where(eq(s.resources.id, resourceId));
  return {
    licenseSource: r?.licenseSource ?? null,
    origin: r?.origin ?? null,
    records: rows.map((x) => ({
      ...x.p,
      contentSha256: x.p.contentSha256 ? Buffer.from(x.p.contentSha256).toString("hex") : null,
      llmModel: x.llmModel,
      licenseOpinion: (x.llmResult as { license_opinion?: string } | null)?.license_opinion || null,
      jobId: x.jobId,
    })),
  };
}
