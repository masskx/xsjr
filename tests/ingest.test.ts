// Slice 7 against a real database: jobs, the worker queue (claiming, retries, back-off, job
// roll-up), dedup by URL and title, drafts with provenance, the licence rules, query mode.
// The network and DeepSeek are replaced by in-process fakes (see tests/ingest-unit.test.ts for
// the real fetcher against a local server).
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import type { Pool } from "pg";
import * as s from "@/lib/db/schema";
import type { Db } from "@/lib/db/client";
import { loadContentDir } from "@/lib/content-files";
import { importContent } from "@/lib/import/content-import";
import { loadSnapshot } from "@/lib/repo/store";
import * as R from "@/lib/admin/resources";
import { getSkillForEdit, skillAdapter } from "@/lib/admin/skills";
import { createQueryJob, createUrlJob, getJob, listJobs, provenanceOf, retryItem } from "@/lib/ingest/jobs";
import { claimItem, drain, expandQueryJob, MAX_ATTEMPTS, reclaimStale } from "@/lib/ingest/worker";
import { FetchError, type FetchResult } from "@/lib/ingest/net";
import type { Fetcher } from "@/lib/ingest/source";
import type { LlmResult } from "@/lib/ingest/llm";
import { extractionSchema, LlmError } from "@/lib/ingest/llm";
import type { SearchProvider } from "@/lib/ingest/search";
import { TEST_DATABASE_URL, freshDb } from "./helpers/db";

const CONTENT = path.resolve(__dirname, "../content");
const MIT = `MIT License\n\nCopyright (c) 2025 Jane Researcher\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software. The above copyright notice and this permission notice shall be included in all copies. THE SOFTWARE IS PROVIDED "AS IS".`;

const page = (title: string, body: string, extraHead = "") =>
  `<html><head><title>${title}</title>${extraHead}</head><body><article><h1>${title}</h1>${`<p>${body}</p>`.repeat(6)}</article></body></html>`;

/** In-memory web: url -> response (or an error to throw). */
function fakeWeb(pages: Record<string, { body: string; type?: string; status?: number } | Error>): Fetcher {
  return async (url, opts) => {
    const p = pages[url];
    if (p instanceof Error) throw p;
    if (!p) {
      if (opts?.allowStatus?.(404)) return { url, status: 404, contentType: "text/plain", body: Buffer.alloc(0), text: "", hops: [url] } satisfies FetchResult;
      throw new FetchError("来源返回 HTTP 404", true, 404);
    }
    return { url, status: p.status ?? 200, contentType: p.type ?? "text/html; charset=utf-8", body: Buffer.from(p.body), text: p.body, hops: [url] };
  };
}

function fakeLlm(byUrl: Record<string, Partial<Record<string, unknown>> | Error>) {
  const calls: string[] = [];
  const llm = async (_text: string, url: string): Promise<LlmResult> => {
    calls.push(url);
    const r = byUrl[url] ?? {};
    if (r instanceof Error) throw r;
    return {
      model: "deepseek-chat",
      tokensIn: 1000,
      tokensOut: 200,
      extraction: extractionSchema.parse({
        title_zh: "示例 Skill",
        summary_zh: "这是一个用于测试导入流程的示例 Skill，帮助研究者完成一项具体任务。",
        description_zh: "## 用途\n测试用。",
        category: "论文写作",
        tags: ["测试"],
        compat: [{ tool: "claude-code" }],
        files: [{ path: "SKILL.md", desc: "说明" }],
        license_opinion: "MIT",
        ...r,
      }),
    };
  };
  return { llm, calls };
}

describe.skipIf(!TEST_DATABASE_URL)("ingestion", () => {
  let db: Db;
  let pool: Pool;
  let adminId: number;

  beforeAll(async () => {
    ({ db, pool } = await freshDb());
    await importContent(db, loadContentDir(CONTENT));
    const [admin] = await db.insert(s.users).values({ email: "admin@example.test", passwordHash: "x", role: "ADMIN" }).returning({ id: s.users.id });
    adminId = admin.id;
    process.env.DEEPSEEK_API_KEY = "sk-test-0000000000";
  });
  afterAll(async () => {
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.SEARCH_PROVIDER;
    delete process.env.BOCHA_API_KEY;
    await pool?.end();
  });
  beforeEach(async () => {
    await db.execute(sql`DELETE FROM ingestion_jobs`);
    await db.execute(sql`DELETE FROM resources WHERE origin = 'INGESTION'`);
  });

  it("refuses to create jobs without a DeepSeek key, and validates input", async () => {
    delete process.env.DEEPSEEK_API_KEY;
    expect(await createUrlJob(db, adminId, "https://a.test/x")).toMatchObject({ ok: false, errors: { _form: expect.stringContaining("DEEPSEEK_API_KEY") } });
    process.env.DEEPSEEK_API_KEY = "sk-test-0000000000";
    expect(await createUrlJob(db, adminId, "ftp://a.test/x")).toMatchObject({ ok: false, errors: { urls: expect.any(String) } });
    expect(await createUrlJob(db, adminId, "  ")).toMatchObject({ ok: false });
    const many = Array.from({ length: 21 }, (_, i) => `https://a.test/${i}`).join("\n");
    expect(await createUrlJob(db, adminId, many)).toMatchObject({ ok: false, errors: { urls: expect.stringContaining("20") } });
  });

  it("URL -> draft (index-only when the licence is unknown), with provenance and audit; never published", async () => {
    const url = "https://blog.test/posts/lit-review-skill";
    const job = await createUrlJob(db, adminId, url);
    expect(job).toMatchObject({ ok: true, queued: 1 });
    const web = fakeWeb({ "https://blog.test/robots.txt": { body: "", type: "text/plain" }, [url]: { body: page("Literature Review Skill", "A skill that helps researchers screen papers and write structured literature reviews.") } });
    const { llm } = fakeLlm({ [url]: { title_zh: "文献综述筛选助手", name: "lit-review" } });
    expect(await drain(db, { fetcher: web, llm })).toBe(1);

    const { job: j, items } = (await getJob(db, (job as { jobId: number }).jobId))!;
    expect(j.status).toBe("done");
    expect(items[0].item).toMatchObject({ status: "done", httpStatus: 200, licenseSource: "UNKNOWN", llmModel: "deepseek-chat", llmTokensIn: 1000, attempts: 1 });
    const id = items[0].item.resourceId!;
    const [r] = await db.select().from(s.resources).where(eq(s.resources.id, id));
    expect(r).toMatchObject({ type: "SKILL", status: "DRAFT", origin: "INGESTION", slug: "lit-review", redistribution: false, licenseSource: "UNKNOWN", sourceUrl: url, sourceUrlNorm: "blog.test/posts/lit-review-skill", publishedAt: null, requiredTier: "FREE" });
    expect(r.bodyMd).toContain("仅作索引");
    // index-only: no copy of anything stored
    expect(await db.select().from(s.resourceFiles).where(eq(s.resourceFiles.resourceId, id))).toHaveLength(0);
    const prov = await provenanceOf(db, id);
    expect(prov.records[0]).toMatchObject({ sourceUrl: url, httpStatus: 200, licenseSource: "UNKNOWN", licenseOpinion: "MIT", llmModel: "deepseek-chat" });
    expect(prov.records[0].contentSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(await db.select().from(s.adminAuditLog).where(and(eq(s.adminAuditLog.action, "ingest.draft"), eq(s.adminAuditLog.targetId, id)))).toHaveLength(1);
    // drafts are not public
    expect((await loadSnapshot(db)).bySlug.has("lit-review")).toBe(false);
    // and the editor can open and save it as-is
    const ed = (await getSkillForEdit(db, id))!;
    expect((await R.saveResource({ db, actorId: adminId }, skillAdapter, id, ed.input, ed.version)).ok).toBe(true);
  });

  it("a SKILL.md under a permissive licence is copied verbatim with attribution", async () => {
    process.env.INGEST_GITHUB_RAW_BASE = "https://raw.example.test";
    const skill = "---\nname: paper-review\ndescription: Simulated peer review\n---\n# Paper review\nDo X then Y.";
    const web = fakeWeb({
      "https://raw.example.test/jane/skills/main/review/SKILL.md": { body: skill, type: "text/plain" },
      "https://raw.example.test/jane/skills/main/LICENSE": { body: MIT, type: "text/plain" },
    });
    const job = await createUrlJob(db, adminId, "https://github.com/jane/skills/tree/main/review");
    const { llm } = fakeLlm({});
    await drain(db, { fetcher: web, llm });
    delete process.env.INGEST_GITHUB_RAW_BASE;
    const { items } = (await getJob(db, (job as { jobId: number }).jobId))!;
    const id = items[0].item.resourceId!;
    const [r] = await db.select().from(s.resources).where(eq(s.resources.id, id));
    expect(r).toMatchObject({ redistribution: true, license: "MIT", licenseSource: "SPDX_DETECTED", author: "jane", status: "DRAFT" });
    expect(r.licenseNote).toContain("Copyright (c) 2025 Jane Researcher");
    const [file] = await db.select().from(s.resourceFiles).where(eq(s.resourceFiles.resourceId, id));
    expect(file).toMatchObject({ path: "SKILL.md", content: skill }); // the author's text, not AI output
  });

  it("dedups by normalised URL (before fetching) and by title similarity (before creating)", async () => {
    const url = "https://dup.test/a";
    const web = fakeWeb({ "https://dup.test/robots.txt": { body: "", type: "text/plain" }, [url]: { body: page("A", "Some long enough description of a skill for researchers to use daily.") }, "https://dup.test/b": { body: page("B", "Another long enough description of a skill for researchers to use daily.") } });
    const first = fakeLlm({ [url]: { title_zh: "基金申请书润色助手" } });
    await createUrlJob(db, adminId, url);
    await drain(db, { fetcher: web, llm: first.llm });

    // same source, different spelling
    const again = await createUrlJob(db, adminId, "https://www.DUP.test/a/?utm_source=wechat");
    const second = fakeLlm({});
    await drain(db, { fetcher: web, llm: second.llm });
    expect(second.calls).toHaveLength(0); // no tokens spent on a known source
    const { items } = (await getJob(db, (again as { jobId: number }).jobId))!;
    expect(items[0].item).toMatchObject({ status: "done", resourceId: null, error: "来源网址已收录" });
    expect(items[0].item.duplicateOf).toBeTruthy();

    // different source, near-identical title (also against existing file-imported skills)
    const third = await createUrlJob(db, adminId, "https://dup.test/b");
    await drain(db, { fetcher: web, llm: fakeLlm({ "https://dup.test/b": { title_zh: "模拟审稿人：Simulated Peer Review" } }).llm });
    const t = (await getJob(db, (third as { jobId: number }).jobId))!;
    expect(t.items[0].item.duplicateOf).toBe((await db.select({ id: s.resources.id }).from(s.resources).where(eq(s.resources.slug, "paper-reviewer-simulator")))[0].id);
    expect(t.items[0].item.error).toMatch(/标题与「.+」相似/);
    expect(await db.select().from(s.resources).where(eq(s.resources.origin, "INGESTION"))).toHaveLength(1);
  });

  it("the same URL cannot be in flight twice", async () => {
    const a = await createUrlJob(db, adminId, "https://q.test/x\nhttps://q.test/y");
    const b = await createUrlJob(db, adminId, "https://q.test/x/\nhttps://q.test/z");
    expect(a).toMatchObject({ ok: true, queued: 2 });
    expect(b).toMatchObject({ ok: true, queued: 1, skipped: ["https://q.test/x/"] });
  });

  it("permanent failures fail at once; transient ones back off and give up after 3 attempts", async () => {
    // robots.txt itself is evaluated inside safeFetch (see ingest-unit); here the fetcher reports its outcome
    const job = await createUrlJob(db, adminId, "https://f.test/page\nhttps://t.test/page");
    const flaky = fakeWeb({ "https://f.test/page": new FetchError("robots.txt 不允许抓取 f.test/page", true), "https://t.test/page": new FetchError("连接失败：ECONNRESET", false) });
    await drain(db, { fetcher: flaky, llm: fakeLlm({}).llm });
    let items = (await getJob(db, (job as { jobId: number }).jobId))!.items.map((i) => i.item);
    expect(items[0]).toMatchObject({ status: "failed", robotsAllowed: false, attempts: 1 });
    expect(items[1]).toMatchObject({ status: "queued", attempts: 1 });
    expect(items[1].error).toContain("稍后自动重试");
    expect(items[1].nextAttemptAt!.getTime()).toBeGreaterThan(Date.now() + 20_000);
    // not claimable before its back-off time
    expect(await claimItem(db)).toBeNull();
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      await db.update(s.ingestionItems).set({ nextAttemptAt: new Date(0) }).where(eq(s.ingestionItems.id, items[1].id));
      await drain(db, { fetcher: flaky, llm: fakeLlm({}).llm });
    }
    items = (await getJob(db, (job as { jobId: number }).jobId))!.items.map((i) => i.item);
    expect(items[1]).toMatchObject({ status: "failed", attempts: MAX_ATTEMPTS, error: "连接失败：ECONNRESET" });
    const [j] = await listJobs(db, 1);
    expect(j).toMatchObject({ status: "failed", counts: { failed: 2 } });

    // manual retry puts it back and reopens the job
    expect(await retryItem(db, adminId, items[1].id)).toEqual({ ok: true });
    expect(await retryItem(db, adminId, items[1].id)).toMatchObject({ ok: false });
    const ok = fakeWeb({ "https://t.test/page": { body: page("T", "A perfectly fine page about a research skill for testing retries.") } });
    await drain(db, { fetcher: ok, llm: fakeLlm({ "https://t.test/page": { title_zh: "重试后成功的技能" } }).llm });
    expect((await listJobs(db, 1))[0]).toMatchObject({ status: "done", counts: { done: 1, failed: 1, drafts: 1 } });
  });

  it("a bad DeepSeek key fails the item immediately; a timeout is retried", async () => {
    const web = fakeWeb({ "https://k.test/a": { body: page("A", "Long enough text about a skill to pass the extraction threshold.") }, "https://k.test/b": { body: page("B", "Long enough text about another skill to pass the extraction threshold.") } });
    await createUrlJob(db, adminId, "https://k.test/a\nhttps://k.test/b");
    await drain(db, { fetcher: web, llm: fakeLlm({ "https://k.test/a": new LlmError("DeepSeek 返回 HTTP 401（API key 无效）", true), "https://k.test/b": new LlmError("DeepSeek 请求失败：超时", false) }).llm });
    const rows = await db.select().from(s.ingestionItems).orderBy(s.ingestionItems.id);
    expect(rows.map((r) => r.status)).toEqual(["failed", "queued"]);
  });

  it("a crashed worker's item is reclaimed", async () => {
    await createUrlJob(db, adminId, "https://c.test/a");
    const item = (await claimItem(db))!;
    await db.update(s.ingestionItems).set({ lockedAt: new Date(Date.now() - 11 * 60_000) }).where(eq(s.ingestionItems.id, item.id));
    await reclaimStale(db);
    const [row] = await db.select().from(s.ingestionItems).where(eq(s.ingestionItems.id, item.id));
    expect(row).toMatchObject({ status: "queued", lockedAt: null });
  });

  it("query mode: search, keep only allowed domains, then process like URLs", async () => {
    process.env.SEARCH_PROVIDER = "bocha";
    process.env.BOCHA_API_KEY = "bocha-test";
    const job = await createQueryJob(db, adminId, { query: "文献综述 skill", domains: "github.com, skills.test", limit: 3 });
    expect(job).toMatchObject({ ok: true });
    const provider: SearchProvider = {
      name: "fake",
      search: async () => [
        { url: "https://skills.test/one", title: "One" },
        { url: "https://evil.test/two", title: "Not allowed" },
        { url: "https://sub.skills.test/three", title: "Three" },
        { url: "javascript:alert(1)", title: "x" },
        { url: "https://skills.test/one", title: "dup" },
      ],
    };
    expect(await expandQueryJob(db, provider)).toBe(true);
    const { items } = (await getJob(db, (job as { jobId: number }).jobId))!;
    expect(items.map((i) => i.item.sourceUrl)).toEqual(["https://skills.test/one", "https://sub.skills.test/three"]);
    expect(await expandQueryJob(db, provider)).toBe(false); // nothing left to expand

    const empty = await createQueryJob(db, adminId, { query: "nothing", domains: "github.com", limit: 3 });
    await expandQueryJob(db, { name: "fake", search: async () => [{ url: "https://evil.test/x", title: "" }] });
    expect((await getJob(db, (empty as { jobId: number }).jobId))!.job).toMatchObject({ status: "failed", error: expect.stringContaining("允许域名") });

    delete process.env.SEARCH_PROVIDER;
    expect(await createQueryJob(db, adminId, { query: "x y", domains: "github.com", limit: 3 })).toMatchObject({ ok: false, errors: { _form: expect.stringContaining("搜索服务") } });
  });

  it("licence rules in the editor: no redistribution without a declaration; the database backs it up", async () => {
    const url = "https://lic.test/a";
    await createUrlJob(db, adminId, url);
    await drain(db, { fetcher: fakeWeb({ [url]: { body: page("A", "A description long enough for the extraction threshold here.") } }), llm: fakeLlm({ [url]: { title_zh: "许可证测试技能" } }).llm });
    const [{ id }] = await db.select({ id: s.resources.id }).from(s.resources).where(eq(s.resources.sourceUrlNorm, "lic.test/a"));
    const ctx = { db, actorId: adminId };
    let ed = (await getSkillForEdit(db, id))!;
    expect(ed.licenseSource).toBe("UNKNOWN");

    const on = { ...ed.input, redistribution: true, license: "MIT", skillMd: "# copied" };
    const refused = await R.saveResource(ctx, skillAdapter, id, on, ed.version);
    expect(refused).toMatchObject({ ok: false, errors: { redistribution: expect.stringContaining("核实") } });

    const declared = await R.saveResource(ctx, skillAdapter, id, { ...on, licenseDeclared: true }, ed.version);
    expect(declared.ok).toBe(true);
    ed = (await getSkillForEdit(db, id))!;
    expect(ed).toMatchObject({ licenseSource: "ADMIN_DECLARED", input: { redistribution: true, skillMd: "# copied" } });
    expect(await db.select().from(s.adminAuditLog).where(and(eq(s.adminAuditLog.action, "resource.license_declared"), eq(s.adminAuditLog.targetId, id)))).toHaveLength(1);

    // switching back to index-only removes the stored copy
    expect((await R.saveResource(ctx, skillAdapter, id, { ...ed.input, redistribution: false }, ed.version)).ok).toBe(true);
    expect(await db.select().from(s.resourceFiles).where(eq(s.resourceFiles.resourceId, id))).toHaveLength(0);

    // database: UNKNOWN can never be redistributed, whatever the code does
    await expect(db.update(s.resources).set({ licenseSource: "UNKNOWN", redistribution: true }).where(eq(s.resources.id, id))).rejects.toThrow();

    // a source URL already used elsewhere is refused
    ed = (await getSkillForEdit(db, id))!;
    const other = (await db.select({ id: s.resources.id }).from(s.resources).where(eq(s.resources.slug, "paper-reviewer-simulator")))[0].id;
    await db.update(s.resources).set({ sourceUrlNorm: "elsewhere.test/x" }).where(eq(s.resources.id, other));
    expect(await R.saveResource(ctx, skillAdapter, id, { ...ed.input, sourceUrl: "https://www.elsewhere.test/x/" }, ed.version)).toMatchObject({ ok: false, errors: { sourceUrl: expect.any(String) } });
    await db.update(s.resources).set({ sourceUrlNorm: null }).where(eq(s.resources.id, other));
  });

  it("index-only skills publish without SKILL.md but need a source link", () => {
    const base = { redistribution: false, skillMd: "", compat: [{ tool: "claude-code", supportedRange: "x" }] } as never as Parameters<NonNullable<typeof skillAdapter.publishProblems>>[0];
    expect(skillAdapter.publishProblems!({ ...base, sourceUrl: "https://x.test" })).toEqual({});
    expect(skillAdapter.publishProblems!(base)).toHaveProperty("sourceUrl");
    expect(skillAdapter.publishProblems!({ ...base, redistribution: true, sourceUrl: "https://x.test" })).toHaveProperty("skillMd");
  });

  it("the daily token budget pauses the queue without burning attempts", async () => {
    process.env.DEEPSEEK_DAILY_TOKEN_LIMIT = "1000";
    const url = "https://budget.test/a";
    await createUrlJob(db, adminId, url);
    // pretend an earlier item used the budget today
    const [j] = await db.select().from(s.ingestionJobs).limit(1);
    await db.insert(s.ingestionItems).values({ jobId: j.id, status: "done", sourceUrl: "https://old.test", sourceUrlNorm: "old.test", llmTokensIn: 900, llmTokensOut: 200 });
    const { runItem } = await import("@/lib/ingest/worker");
    const item = (await claimItem(db))!;
    await runItem(db, item, { fetcher: fakeWeb({ [url]: { body: page("A", "A description long enough for the extraction threshold here.") } }) });
    delete process.env.DEEPSEEK_DAILY_TOKEN_LIMIT;
    const [row] = await db.select().from(s.ingestionItems).where(eq(s.ingestionItems.id, item.id));
    expect(row).toMatchObject({ status: "queued", attempts: 0 });
    expect(row.error).toContain("上限");
    expect(row.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
  });
});
