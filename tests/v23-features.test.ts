// Features of release 2.3: counters (dedup per visitor/day), ZIP packages, skill install guides,
// external search templates, announcements, API tokens, safe ZIP unpacking, prompts in bulk upload.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { strToU8, unzipSync, zipSync } from "fflate";
import type { Pool } from "pg";
import * as s from "@/lib/db/schema";
import type { Db } from "@/lib/db/client";
import { loadContentDir } from "@/lib/content-files";
import { importContent } from "@/lib/import/content-import";
import { loadAttachment } from "@/lib/repo/store";
import { countOnce, countsOf, countable } from "@/lib/stats/counters";
import { moduleZip, skillDirName, skillZip } from "@/lib/stats/zip";
import { TOOL_GUIDES, guideFor, installCommands } from "@/lib/skills/install";
import { SEARCH_MODES, buildSearchUrl } from "@/lib/external-search";
import { activeAnnouncement, saveAnnouncement } from "@/lib/announcements";
import { authenticateToken, createApiToken, revokeApiToken } from "@/lib/admin/api-tokens";
import { cleanupBatch, unzipBatch, ZipInputError } from "@/lib/bulk/zip-input";
import { scanBatch } from "@/lib/bulk/scan";
import { buildPlan } from "@/lib/bulk/plan";
import { applyPlan } from "@/lib/bulk/apply";
import { MILESTONES, ERAS } from "@/lib/ai-timeline";
import { TEST_DATABASE_URL, freshDb } from "./helpers/db";

const browser = { ip: "203.0.113.5", userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36", headers: new Headers() };
const curl = { ...browser, userAgent: "curl/8.5.0" };

describe("counters: who is counted", () => {
  it("views: browsers only; downloads: terminals too, never crawlers; DNT/GPC never", () => {
    expect(countable(browser, "view")).toBe(true);
    expect(countable(curl, "view")).toBe(false);
    expect(countable(curl, "download")).toBe(true); // the install commands use curl
    expect(countable({ ...browser, userAgent: "Googlebot/2.1" }, "download")).toBe(false);
    expect(countable({ ...browser, headers: new Headers({ dnt: "1" }) }, "view")).toBe(false);
    expect(countable({ ...browser, headers: new Headers({ "sec-gpc": "1" }) }, "download")).toBe(false);
  });
});

describe("ZIP packages", () => {
  it("names the skill folder after SKILL.md's name and adds a notice for third-party skills", () => {
    const md = "---\nname: paper-review\ndescription: x\n---\n# x";
    expect(skillDirName(md, "slug")).toBe("paper-review");
    expect(skillDirName("# no front matter", "the-slug")).toBe("the-slug");
    expect(skillDirName("---\nname: ../evil\n---", "safe")).toBe("safe");
    const own = unzipSync(skillZip({ slug: "s", title: "T", license: "MIT", author: "平台原创" }, md, "https://x.cn").bytes);
    expect(Object.keys(own)).toEqual(["paper-review/SKILL.md"]);
    const third = unzipSync(skillZip({ slug: "s", title: "T", license: "Apache-2.0", author: "someone", sourceUrl: "https://github.com/o/r" }, md, "https://x.cn").bytes);
    expect(new TextDecoder().decode(third["paper-review/NOTICE.txt"])).toContain("https://github.com/o/r");
  });
  it("packages module files under the slug with a generated README", () => {
    const z = moduleZip({ slug: "m", title: "模块", summary: "摘要", license: "MIT", author: "平台原创", env: ["Python 3.9+"] }, [{ path: "main.py", content: "x=1\n" }, { path: "utils/a.py", content: "y=2\n" }], "https://x.cn");
    const files = unzipSync(z.bytes);
    expect(Object.keys(files).sort()).toEqual(["m/README.md", "m/main.py", "m/utils/a.py"]);
    expect(new TextDecoder().decode(files["m/README.md"])).toContain("Python 3.9+");
    expect(z.filename).toBe("m.zip");
  });
});

describe("skill install guides", () => {
  it("verified tools have both directories and an official source; unverified ones have nothing invented", () => {
    for (const g of Object.values(TOOL_GUIDES)) {
      if (g.verified) {
        expect(g.personal, g.key).toMatch(/^~\/\.[a-z]+\/skills$/);
        expect(g.project, g.key).toMatch(/^\.[a-z]+\/skills$/);
        expect(g.source?.url, g.key).toMatch(/^https:\/\//);
      } else {
        expect(g.personal ?? g.project ?? g.source, g.key).toBeUndefined();
      }
    }
    expect(guideFor("trae").verified).toBe(false);
    expect(guideFor("some-new-tool")).toMatchObject({ verified: false, label: "some-new-tool" });
    expect(TOOL_GUIDES["claude-code"]).toMatchObject({ personal: "~/.claude/skills", project: ".claude/skills" });
    expect(TOOL_GUIDES.codex).toMatchObject({ personal: "~/.agents/skills", project: ".agents/skills" });
  });
  it("builds runnable download-and-unzip commands for both shells", () => {
    const c = installCommands("~/.claude/skills", "https://x.cn/api/download/skills/s/", "paper-review");
    expect(c.posix).toContain('curl -fL -o /tmp/paper-review.zip "https://x.cn/api/download/skills/s/"');
    expect(c.posix).toContain("unzip -o /tmp/paper-review.zip -d ~/.claude/skills/");
    expect(c.windows).toContain('Expand-Archive "$env:TEMP\\paper-review.zip" -DestinationPath "$HOME\\.claude\\skills" -Force');
  });
});

describe("external aggregated search", () => {
  it("has the seven modes, every engine an https URL template with {q}", () => {
    expect(SEARCH_MODES.map((m) => m.label)).toEqual(["综合搜索", "中文文献", "英文文献", "专利检索", "期刊检索", "自媒体", "中英互译"]);
    for (const m of SEARCH_MODES) {
      expect(m.engines.length, m.label).toBeGreaterThan(1);
      for (const e of m.engines) {
        expect(e.url, e.name).toMatch(/^https:\/\//);
        expect(e.url.split("{q}").length, e.name).toBe(2);
      }
    }
    const names = SEARCH_MODES.flatMap((m) => m.engines.map((e) => e.name));
    for (const required of ["知网", "维普", "万方", "PubMed", "Google Scholar", "必应学术", "微信公众号", "哔哩哔哩", "知乎", "微博", "百度翻译"]) expect(names).toContain(required);
  });
  it("encodes the query safely", () => {
    expect(buildSearchUrl("https://pubmed.ncbi.nlm.nih.gov/?term={q}", " deep learning & cancer ")).toBe("https://pubmed.ncbi.nlm.nih.gov/?term=deep%20learning%20%26%20cancer");
    expect(buildSearchUrl("https://www.baidu.com/s?wd={q}", "统计检验")).toBe("https://www.baidu.com/s?wd=%E7%BB%9F%E8%AE%A1%E6%A3%80%E9%AA%8C");
  });
});

describe("timeline data", () => {
  it("is in chronological order and every milestone belongs to an era", () => {
    const years = MILESTONES.map((m) => Number(m.year));
    expect([...years].sort((a, b) => a - b)).toEqual(years);
    for (const m of MILESTONES) expect(ERAS.map((e) => e.key)).toContain(m.era);
  });
});

describe("safe ZIP unpacking", () => {
  it("unpacks a batch and strips a single wrapping folder", () => {
    const zip = zipSync({ "batch/modules/m/main.py": strToU8("x=1\n"), "batch/modules/m/README.md": strToU8("# 模块\n\n一段足够长的说明文字，用来作为摘要并通过长度校验。\n"), "batch/__MACOSX/._junk": strToU8("x") });
    const dir = unzipBatch(zip);
    try {
      expect(fs.readFileSync(path.join(dir, "modules/m/main.py"), "utf8")).toBe("x=1\n");
      expect(fs.existsSync(path.join(dir, "__MACOSX"))).toBe(false);
    } finally {
      cleanupBatch(dir);
    }
    expect(fs.existsSync(dir)).toBe(false);
  });
  it("refuses path traversal and stops a zip bomb while inflating", () => {
    const evil = zipSync({ "../../etc/x": strToU8("x") });
    expect(() => unzipBatch(evil)).toThrow(ZipInputError);
    const bomb = zipSync({ "modules/m/big.py": new Uint8Array(12 * 1024 * 1024) }, { level: 9 });
    expect(bomb.length).toBeLessThan(200_000);
    expect(() => unzipBatch(bomb)).toThrow(/超过/);
    expect(() => unzipBatch(strToU8("not a zip at all"))).toThrow(ZipInputError);
    const leftovers = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("rh-bulk-api-"));
    expect(leftovers).toEqual([]);
  });
});

describe.skipIf(!TEST_DATABASE_URL)("with the database", () => {
  let db: Db;
  let pool: Pool;
  let adminId: number;
  let userId: number;
  const idOf = async (slug: string) => (await db.select({ id: s.resources.id }).from(s.resources).where(eq(s.resources.slug, slug)))[0].id;

  beforeAll(async () => {
    ({ db, pool } = await freshDb());
    await importContent(db, loadContentDir(path.resolve(__dirname, "../content")));
    [{ id: adminId }] = await db.insert(s.users).values({ email: "admin@example.test", passwordHash: "x", role: "ADMIN" }).returning({ id: s.users.id });
    [{ id: userId }] = await db.insert(s.users).values({ email: "user@example.test", passwordHash: "x" }).returning({ id: s.users.id });
  });
  afterAll(async () => {
    await pool?.end();
  });

  it("counts a visitor once per resource per day and kind, without touching updated_at", async () => {
    const id = await idOf("abstract-polish");
    const [before] = await db.select({ u: s.resources.updatedAt }).from(s.resources).where(eq(s.resources.id, id));
    const day = new Date("2026-11-20T04:00:00Z");
    expect(await countOnce(db, id, "view", browser, day)).toBe(true);
    expect(await countOnce(db, id, "view", browser, day)).toBe(false); // same visitor, same day
    expect(await countOnce(db, id, "view", { ...browser, ip: "203.0.113.6" }, day)).toBe(true);
    expect(await countOnce(db, id, "view", browser, new Date("2026-11-21T04:00:00Z"))).toBe(true); // next day
    expect(await countOnce(db, id, "view", curl, day)).toBe(false);
    expect(await countOnce(db, id, "download", curl, day)).toBe(true);
    expect(await countsOf(db, id)).toEqual({ views: 3, downloads: 1 });
    const [after] = await db.select({ u: s.resources.updatedAt }).from(s.resources).where(eq(s.resources.id, id));
    expect(after.u.getTime()).toBe(before.u.getTime());
    // the dedup rows hold only the daily-salted hash, never the IP
    const raw = JSON.stringify((await db.execute(sql`SELECT * FROM resource_daily_visitors`)).rows);
    expect(raw).not.toContain("203.0.113");
  });

  it("announcements: the newest active one inside its time window is shown", async () => {
    const now = new Date("2026-11-20T08:00:00Z");
    expect(await activeAnnouncement(db, now)).toBeNull();
    expect(await saveAnnouncement(db, adminId, null, { title: "", bodyMd: "", isActive: true, startsAt: null, endsAt: null })).toMatchObject({ ok: false });
    expect(await saveAnnouncement(db, adminId, null, { title: "坏的时间", bodyMd: "", isActive: true, startsAt: now, endsAt: new Date(now.getTime() - 1) })).toMatchObject({ ok: false });
    await saveAnnouncement(db, adminId, null, { title: "旧公告", bodyMd: "", isActive: true, startsAt: null, endsAt: null });
    await new Promise((r) => setTimeout(r, 5));
    await saveAnnouncement(db, adminId, null, { title: "未来的公告", bodyMd: "", isActive: true, startsAt: new Date("2026-12-01T00:00:00Z"), endsAt: null });
    await saveAnnouncement(db, adminId, null, { title: "停用的公告", bodyMd: "", isActive: false, startsAt: null, endsAt: null });
    expect((await activeAnnouncement(db, now))?.title).toBe("旧公告");
    await new Promise((r) => setTimeout(r, 5));
    const r = await saveAnnouncement(db, adminId, null, { title: "**新**公告", bodyMd: "<b>x</b>", isActive: true, startsAt: null, endsAt: new Date("2026-11-30T00:00:00Z") });
    expect(r.ok).toBe(true);
    expect((await activeAnnouncement(db, now))?.title).toBe("**新**公告");
    expect(await activeAnnouncement(db, new Date("2026-12-02T00:00:00Z"))).toMatchObject({ title: "未来的公告" });
  });

  it("API tokens: shown once, hashed, admin-only, revocable, expiring", async () => {
    const created = await createApiToken(db, adminId, "本机", 30);
    if (!created.ok) throw new Error(created.error);
    expect(created.token).toMatch(/^rhk_[A-Za-z0-9_-]{43}$/);
    const raw = JSON.stringify((await db.select().from(s.apiTokens)).map((t) => ({ ...t, tokenHash: Buffer.from(t.tokenHash).toString("hex") })));
    expect(raw).not.toContain(created.token.slice(4));
    expect(await authenticateToken(db, `Bearer ${created.token}`, "bulk")).toMatchObject({ userId: adminId });
    expect(await authenticateToken(db, `Bearer ${created.token}`, "other-scope")).toBeNull();
    expect(await authenticateToken(db, `Bearer ${created.token}x`, "bulk")).toBeNull();
    expect(await authenticateToken(db, null, "bulk")).toBeNull();
    expect(await authenticateToken(db, `Bearer ${created.token}`, "bulk", new Date(Date.now() + 31 * 86_400_000))).toBeNull(); // expired
    // demoted owner: token stops working
    await db.update(s.users).set({ role: "USER" }).where(eq(s.users.id, adminId));
    expect(await authenticateToken(db, `Bearer ${created.token}`, "bulk")).toBeNull();
    await db.update(s.users).set({ role: "ADMIN" }).where(eq(s.users.id, adminId));
    const [row] = await db.select({ id: s.apiTokens.id }).from(s.apiTokens);
    await revokeApiToken(db, userId, row.id); // someone else's token: no effect
    expect(await authenticateToken(db, `Bearer ${created.token}`, "bulk")).not.toBeNull();
    await revokeApiToken(db, adminId, row.id);
    expect(await authenticateToken(db, `Bearer ${created.token}`, "bulk")).toBeNull();
  });

  it("bulk upload accepts prompts: variables come from the template's {{placeholders}}", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "rh-bulk-prompt-"));
    fs.mkdirSync(path.join(root, "prompts/rewrite"), { recursive: true });
    fs.writeFileSync(path.join(root, "prompts/rewrite/template.md"), "请改写这段 {{field}} 领域的文字：\n{{original_text}}\n");
    fs.writeFileSync(path.join(root, "prompts/rewrite/README.md"), "# 段落改写提示词\n\n在保留原意和引用的前提下，把你本人写作中措辞过近的段落改写成自己的表达。\n");
    fs.writeFileSync(path.join(root, "清单.csv"), "﻿类型,文件夹,分类,变量,会员等级\r\n提示词,rewrite,论文写作,field=学科领域；original_text=原文,\r\n");
    const { items, problems } = scanBatch(root);
    const plan = await buildPlan(db, root, items, problems, {});
    expect(plan.entries[0]).toMatchObject({ type: "prompt", action: "create", errors: [] });
    expect((plan.entries[0].input as { variables: unknown[] }).variables).toEqual([
      { key: "field", label: "学科领域", type: "text", required: true },
      { key: "original_text", label: "原文", type: "textarea", required: true },
    ]);
    const [res] = await applyPlan(db, adminId, plan);
    expect(res).toMatchObject({ outcome: "created" });
    // a draft: not visible through the public loader, but stored
    expect(await loadAttachment(db, "rewrite", "template.md", 0)).toBeNull();
    const [file] = await db.select({ content: s.resourceFiles.content }).from(s.resourceFiles).where(eq(s.resourceFiles.resourceId, res.id!));
    expect(file.content).toContain("{{original_text}}");
  });

  it("the shipped draft batch (office and rewriting skills, prompts) passes every check", async () => {
    const root = path.resolve(__dirname, "../tools/seed-batches/office-and-writing");
    const { items, problems } = scanBatch(root);
    const plan = await buildPlan(db, root, items, problems, { publish: true });
    expect(plan.problems).toEqual([]);
    expect(plan.entries.filter((e) => e.action !== "create").map((e) => [e.folder, e.errors])).toEqual([]);
    const byCat = (c: string) => plan.entries.filter((e) => e.type === "skill" && (e.input as { category: string }).category === c).length;
    expect(byCat("办公技能")).toBe(11);
    expect(byCat("降重降AI")).toBe(6);
    expect(plan.entries.filter((e) => e.type === "prompt").length).toBe(6);
  });
});
