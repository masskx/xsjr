// Background worker for ingestion. Runs inside the app process (started from instrumentation.ts
// when DEEPSEEK_API_KEY is set and INGEST_WORKER is not "0"), one item at a time, so it adds
// little memory to the 640 MB app container. Claiming uses FOR UPDATE SKIP LOCKED, so several
// processes (e.g. old and new release during a deploy) never take the same item.
//
// Wake-ups: NOTIFY ingest_queued (sent when a job is created or retried) or a 20 s poll.
// Retries: transient failures (network, 5xx, timeouts, DeepSeek hiccups) back off 30 s, 2 min,
// 10 min and fail after 3 attempts; permanent ones (robots.txt, private address, 4xx, too large,
// bad key) fail at once. An item stuck in "running" for 10 minutes (crash) is put back.
import { eq, sql } from "drizzle-orm";
import pg from "pg";
import { databaseUrl, getDb, type Db } from "../db/client";
import * as s from "../db/schema";
import { NOTIFY_CHANNEL, tokensToday } from "./jobs";
import { extractWithLlm, llmConfig, LlmError } from "./llm";
import { FetchError, testAllowedHosts } from "./net";
import { processItem, type PipelineDeps } from "./pipeline";
import { searchCandidates, searchProvider, SearchError } from "./search";
import { normalizeSourceUrl } from "./url";

export const MAX_ATTEMPTS = 3;
const BACKOFF_S = [30, 120, 600];
const STALE_MINUTES = 10;

class BudgetError extends Error {}

type Item = typeof s.ingestionItems.$inferSelect;

function isPermanent(e: unknown): boolean {
  if (e instanceof FetchError || e instanceof LlmError || e instanceof SearchError) return e.permanent;
  return !!(e as { permanent?: boolean })?.permanent;
}

export async function reclaimStale(db: Db) {
  await db.execute(sql`
    UPDATE ingestion_items
       SET status = CASE WHEN attempts >= ${MAX_ATTEMPTS} THEN 'failed'::job_status ELSE 'queued'::job_status END,
           error = CASE WHEN attempts >= ${MAX_ATTEMPTS} THEN '处理超时（进程可能重启过）' ELSE error END,
           locked_at = NULL, next_attempt_at = now(), updated_at = now()
     WHERE status = 'running' AND locked_at < now() - make_interval(mins => ${STALE_MINUTES})`);
}

export async function claimItem(db: Db): Promise<Item | null> {
  const res = await db.execute<Record<string, unknown>>(sql`
    UPDATE ingestion_items
       SET status = 'running', locked_at = now(), attempts = attempts + 1, updated_at = now()
     WHERE id = (SELECT id FROM ingestion_items
                  WHERE status = 'queued' AND (next_attempt_at IS NULL OR next_attempt_at <= now())
                  ORDER BY id
                  FOR UPDATE SKIP LOCKED
                  LIMIT 1)
    RETURNING id`);
  const id = res.rows[0]?.id;
  if (id === undefined) return null;
  const [item] = await db.select().from(s.ingestionItems).where(eq(s.ingestionItems.id, Number(id)));
  await db
    .update(s.ingestionJobs)
    .set({ status: "running", startedAt: sql`coalesce(${s.ingestionJobs.startedAt}, now())` })
    .where(sql`${s.ingestionJobs.id} = ${item.jobId} AND ${s.ingestionJobs.status} = 'queued'`);
  return item;
}

export async function finishJobIfComplete(db: Db, jobId: number) {
  await db.execute(sql`
    UPDATE ingestion_jobs j
       SET status = CASE WHEN EXISTS (SELECT 1 FROM ingestion_items WHERE job_id = j.id AND status = 'done')
                         THEN 'done'::job_status ELSE 'failed'::job_status END,
           finished_at = now()
     WHERE j.id = ${jobId} AND j.status IN ('queued', 'running')
       AND EXISTS (SELECT 1 FROM ingestion_items WHERE job_id = j.id)
       AND NOT EXISTS (SELECT 1 FROM ingestion_items WHERE job_id = j.id AND status IN ('queued', 'running'))`);
}

function nextShanghaiMidnight(now = new Date()): Date {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(now);
  return new Date(Date.parse(`${day}T00:00:00+08:00`) + 24 * 3600 * 1000 + 60_000);
}

/** Process one claimed item and record the outcome. */
export async function runItem(db: Db, item: Item, deps: PipelineDeps = {}) {
  const [job] = await db.select({ createdBy: s.ingestionJobs.createdBy }).from(s.ingestionJobs).where(eq(s.ingestionJobs.id, item.jobId));
  const llm = deps.llm ?? (async (text: string, url: string, categories: string[]) => {
    if ((await tokensToday(db)) >= (await llmConfig()).dailyTokenLimit) throw new BudgetError();
    return extractWithLlm(text, url, categories);
  });
  try {
    const outcome = await processItem(db, item, job.createdBy, { ...deps, llm });
    await db
      .update(s.ingestionItems)
      .set({
        status: "done",
        lockedAt: null,
        error: outcome.kind === "duplicate" ? outcome.reason : null,
        resourceId: outcome.kind === "draft" ? outcome.resourceId : null,
        duplicateOf: outcome.kind === "duplicate" ? outcome.resourceId : null,
        updatedAt: new Date(),
      })
      .where(eq(s.ingestionItems.id, item.id));
  } catch (e) {
    if (e instanceof BudgetError) {
      // not the item's fault: wait for tomorrow's budget without using up an attempt
      await db
        .update(s.ingestionItems)
        .set({ status: "queued", lockedAt: null, attempts: sql`greatest(${s.ingestionItems.attempts} - 1, 0)`, nextAttemptAt: nextShanghaiMidnight(), error: "今日 DeepSeek 用量已达上限，明天自动继续", updatedAt: new Date() })
        .where(eq(s.ingestionItems.id, item.id));
      return;
    }
    const message = (e as Error).message?.slice(0, 500) || "未知错误";
    const give_up = isPermanent(e) || item.attempts >= MAX_ATTEMPTS;
    if (!(e instanceof FetchError || e instanceof LlmError || isPermanent(e))) console.error(`[ingest] item ${item.id} failed`, e);
    await db
      .update(s.ingestionItems)
      .set(
        give_up
          ? { status: "failed", lockedAt: null, error: message, updatedAt: new Date(), ...(e instanceof FetchError && /robots/.test(message) ? { robotsAllowed: false } : {}), ...(e instanceof FetchError && e.httpStatus ? { httpStatus: e.httpStatus } : {}) }
          : { status: "queued", lockedAt: null, error: `${message}（第 ${item.attempts} 次失败，稍后自动重试）`, nextAttemptAt: new Date(Date.now() + BACKOFF_S[Math.min(item.attempts - 1, BACKOFF_S.length - 1)] * 1000), updatedAt: new Date() },
      )
      .where(eq(s.ingestionItems.id, item.id));
  } finally {
    await finishJobIfComplete(db, item.jobId);
  }
}

/** Query mode: expand one queued QUERY job into items (search -> allowed domains -> items). */
export async function expandQueryJob(db: Db, provider = searchProvider()): Promise<boolean> {
  const res = await db.execute<Record<string, unknown>>(sql`
    UPDATE ingestion_jobs SET status = 'running', started_at = now()
     WHERE id = (SELECT id FROM ingestion_jobs
                  WHERE mode = 'QUERY' AND status = 'queued'
                    AND NOT EXISTS (SELECT 1 FROM ingestion_items WHERE job_id = ingestion_jobs.id)
                  ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1)
    RETURNING id, input`);
  const row = res.rows[0];
  if (!row) return false;
  const jobId = Number(row.id);
  const input = row.input as { query: string; domains: string[]; limit: number };
  const fail = (error: string) =>
    db.update(s.ingestionJobs).set({ status: "failed", finishedAt: new Date(), error }).where(eq(s.ingestionJobs.id, jobId));
  if (!provider) {
    await fail("搜索服务未配置");
    return true;
  }
  try {
    const hits = await searchCandidates(provider, input.query, input.domains, input.limit);
    if (!hits.length) {
      await fail("搜索没有返回允许域名内的结果");
      return true;
    }
    const inserted = await db
      .insert(s.ingestionItems)
      .values(hits.map((h) => ({ jobId, sourceUrl: h.url, sourceUrlNorm: normalizeSourceUrl(h.url)!, title: h.title.slice(0, 200) || null })))
      .onConflictDoNothing()
      .returning({ id: s.ingestionItems.id });
    if (!inserted.length) await db.update(s.ingestionJobs).set({ status: "done", finishedAt: new Date(), error: "搜索结果都已在其他任务中排队" }).where(eq(s.ingestionJobs.id, jobId));
  } catch (e) {
    await fail((e as Error).message.slice(0, 500));
  }
  return true;
}

/** Drain the queue once: expand query jobs, then process items until none is claimable. */
export async function drain(db: Db, deps: PipelineDeps = {}, maxItems = Infinity): Promise<number> {
  await reclaimStale(db);
  while (await expandQueryJob(db)) {
    /* keep expanding */
  }
  let n = 0;
  while (n < maxItems) {
    const item = await claimItem(db);
    if (!item) break;
    await runItem(db, item, deps);
    n++;
  }
  return n;
}

// ── process-level loop ──

declare global {
  var __rhIngestWorker: { running: boolean; wake: () => void } | undefined;
}

export async function startIngestWorker() {
  if (globalThis.__rhIngestWorker) return;
  if (!(await llmConfig()).enabled) return;
  if (testAllowedHosts().length) console.warn(`[ingest] WARNING: INGEST_TEST_ALLOW_PRIVATE_HOSTS is set (${testAllowedHosts().join(",")}); this must never be set in production`);
  let wakeUp: (() => void) | null = null;
  const state = { running: true, wake: () => wakeUp?.() };
  globalThis.__rhIngestWorker = state;
  const db = getDb();

  // LISTEN for new jobs (reconnects on the next loop if the connection drops)
  let listener: pg.Client | null = null;
  const listen = () => {
    if (listener) return;
    const c = new pg.Client({ connectionString: databaseUrl(), application_name: "rh-ingest-listen" });
    c.on("notification", () => state.wake());
    const drop = () => {
      if (listener === c) listener = null;
    };
    c.on("error", drop);
    c.on("end", drop);
    listener = c;
    c.connect()
      .then(() => c.query(`LISTEN ${NOTIFY_CHANNEL}`))
      .catch(() => {
        drop();
        c.end().catch(() => {});
      });
  };

  void (async () => {
    console.log("[ingest] worker started");
    while (state.running) {
      listen();
      try {
        await drain(db);
      } catch (e) {
        console.error("[ingest] worker loop error", e);
      }
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, 20_000);
        wakeUp = () => {
          clearTimeout(t);
          resolve();
        };
      });
      wakeUp = null;
    }
  })();
}
