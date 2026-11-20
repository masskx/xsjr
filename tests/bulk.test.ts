// Bulk upload (docs/RUNBOOK.md §15): CSV handling, folder scanning, the plan's rules, and the
// whole apply path against a real database (drafts, publish, tiers, diagrams, licences, update).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { Pool } from "pg";
import * as s from "@/lib/db/schema";
import type { Db } from "@/lib/db/client";
import { loadContentDir } from "@/lib/content-files";
import { importContent } from "@/lib/import/content-import";
import { loadAttachment, loadSnapshot } from "@/lib/repo/store";
import { csvRecords, decodeCsv, parseCsv, toCsv } from "@/lib/bulk/csv";
import { scanBatch, slugify } from "@/lib/bulk/scan";
import { buildPlan, COLUMNS, LIST_FILE, type Plan } from "@/lib/bulk/plan";
import { applyPlan } from "@/lib/bulk/apply";
import { applyReport, planReport } from "@/lib/bulk/report";
import { TEST_DATABASE_URL, freshDb } from "./helpers/db";

const PNG = fs.readFileSync(path.resolve(__dirname, "fixtures/sample.png"));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "rh-bulk-test-"));
function write(root: string, files: Record<string, string | Buffer>) {
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
}
const list = (rows: Record<string, string>[]) => {
  const keys = Object.keys(COLUMNS);
  return toCsv([keys.map((k) => COLUMNS[k][0]), ...rows.map((r) => keys.map((k) => r[k] ?? ""))]);
};

describe("batch list (CSV)", () => {
  it("round-trips quotes, commas and line breaks, with a BOM Excel understands", () => {
    const buf = toCsv([["标题", "摘要"], ['含"引号"', "第一行,逗号\n第二行"]]);
    expect([...buf.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(parseCsv(decodeCsv(buf))).toEqual([["标题", "摘要"], ['含"引号"', "第一行,逗号\n第二行"]]);
  });
  it("reads GBK files saved by Excel, and semicolon-separated ones", () => {
    const gbk = Buffer.from([0xb1, 0xea, 0xcc, 0xe2, 0x2c, 0x61, 0x0d, 0x0a]); // "标题,a\r\n" in GBK
    expect(parseCsv(decodeCsv(gbk))).toEqual([["标题", "a"]]);
    expect(parseCsv("a;b;c\n1;2;3\n")).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
  });
  it("maps Chinese and English headers and reports unknown columns", () => {
    const { records, unknownColumns } = csvRecords("类型,folder,备注\n技能,x,y\n", COLUMNS);
    expect(records).toEqual([{ type: "技能", folder: "x" }]);
    expect(unknownColumns).toEqual(["备注"]);
  });
});

describe("folder scanning", () => {
  it("turns Chinese folder names into pinyin slugs", () => {
    expect(slugify("统计检验工具")).toBe("tong-ji-jian-yan-gong-ju");
    expect(slugify("Paper_Review v2")).toBe("paper-review-v2");
  });
  it("works out titles, summaries, entry, language, dependencies and the diagram", () => {
    const root = tmp();
    write(root, {
      "modules/统计工具/README.md": "# 统计检验工具包\n\n自动选择合适的统计检验方法并输出效应量与报告句子，适合论文结果部分。\n\n## 用法\n...",
      "modules/统计工具/main.py": "print('hi')\n",
      "modules/统计工具/utils/helpers.py": "x = 1\n",
      "modules/统计工具/requirements.txt": "scipy>=1.10  # stats\nnumpy\n-r other.txt\n",
      "modules/统计工具/结构图.png": PNG,
      "modules/统计工具/__pycache__/main.cpython-311.pyc": Buffer.from([0, 1, 2]),
      "modules/统计工具/data.bin": Buffer.from([0, 0, 0, 1]),
      "modules/统计工具/.env": "SECRET=1",
      "skills/review/SKILL.md": "---\nname: paper-review\ndescription: 投稿前模拟审稿人给出意见\n---\n# x",
      "skills/review/templates/report.md": "# r",
    });
    const { items, problems } = scanBatch(root);
    expect(problems).toEqual([]);
    const mod = items.find((i) => i.type === "module")!;
    expect(mod).toMatchObject({ slug: "tong-ji-gong-ju", title: "统计检验工具包", entry: "main.py", language: "Python", dependencies: ["scipy>=1.10", "numpy"] });
    expect(mod.summary).toContain("自动选择合适的统计检验方法");
    expect(mod.body).toContain("## 用法");
    expect(mod.diagram?.file).toBe("结构图.png");
    expect(mod.files.map((f) => f.path).sort()).toEqual(["main.py", "requirements.txt", "utils/helpers.py"]); // no .pyc, binary, .env, image
    expect(mod.warnings.join()).toContain("data.bin");
    const skill = items.find((i) => i.type === "skill")!;
    expect(skill).toMatchObject({ slug: "paper-review", title: "paper-review", summary: "投稿前模拟审稿人给出意见" });
    expect(skill.files.map((f) => f.path)).toEqual(["SKILL.md", "templates/report.md"]);
  });
  it("never follows symlinks and reports a wrong layout", () => {
    const root = tmp();
    write(root, { "modules/m/main.py": "x=1\n", "misc/a.txt": "x" });
    fs.symlinkSync("/etc/passwd", path.join(root, "modules/m/passwd.py"));
    const { items, problems } = scanBatch(root);
    expect(items[0].files.map((f) => f.path)).toEqual(["main.py"]);
    expect(items[0].warnings.join()).toContain("符号链接");
    expect(problems.join()).toContain("misc");
    expect(scanBatch(tmp()).problems.join()).toContain("skills/");
  });
  it("reads GBK source files and refuses oversized ones", () => {
    const root = tmp();
    write(root, { "modules/m/main.py": Buffer.concat([Buffer.from("# "), Buffer.from([0xd6, 0xd0, 0xce, 0xc4]), Buffer.from("\n")]), "modules/m/big.py": "x".repeat(200_001) });
    const [m] = scanBatch(root).items;
    expect(m.files.find((f) => f.path === "main.py")?.content).toBe("# 中文\n");
    expect(m.errors.join()).toContain("big.py");
  });
});

describe.skipIf(!TEST_DATABASE_URL)("bulk upload against the database", () => {
  let db: Db;
  let pool: Pool;
  let adminId: number;
  const plan = async (root: string, opts = {}) => {
    const { items, problems } = scanBatch(root);
    return buildPlan(db, root, items, problems, opts);
  };

  beforeAll(async () => {
    process.env.UPLOADS_DIR = tmp();
    ({ db, pool } = await freshDb());
    await importContent(db, loadContentDir(path.resolve(__dirname, "../content")));
    const [admin] = await db.insert(s.users).values({ email: "admin@example.test", passwordHash: "x", role: "ADMIN" }).returning({ id: s.users.id });
    adminId = admin.id;
  });
  afterAll(async () => {
    await pool?.end();
  });
  beforeEach(async () => {
    await db.execute(sql`DELETE FROM resources WHERE origin = 'ADMIN'`);
  });

  function batch(): string {
    const root = tmp();
    write(root, {
      "modules/group-compare/README.md": "# 分组均值比较\n\n对两组或多组数据自动选择 t 检验、Welch 检验或方差分析，并输出效应量和报告句子。\n\n正文。",
      "modules/group-compare/main.py": "def compare():\n    return 1\n",
      "modules/group-compare/diagram.png": PNG,
      "modules/power-analysis/README.md": "# 样本量与功效分析\n\n根据效应量、显著性水平与目标功效计算所需样本量，并给出功效曲线。",
      "modules/power-analysis/power.R": "power <- function() 1\n",
      "skills/rebuttal/SKILL.md": "---\nname: rebuttal-letter\ndescription: 根据审稿意见逐条起草回复信，区分已修改、解释与保留意见三种情况。\n---\n# Rebuttal",
    });
    return root;
  }

  it("a first check lists what is missing and writes a batch list to fill in", async () => {
    const root = batch();
    const p = await plan(root);
    expect(p.listFound).toBe(false);
    expect(p.entries.every((e) => e.action === "error")).toBe(true);
    expect(p.entries[0].errors).toEqual(["分类：请在 清单.csv 填写"]);
    const rows = parseCsv(decodeCsv(p.suggestedList!));
    expect(rows[0].slice(0, 4)).toEqual(["类型", "文件夹", "网址标识", "标题"]);
    expect(rows.slice(1).map((r) => [r[0], r[1], r[2]])).toEqual([
      ["模块", "group-compare", "group-compare"],
      ["模块", "power-analysis", "power-analysis"],
      ["技能", "rebuttal", "rebuttal-letter"],
    ]);
    expect(planReport(p, {})).toContain("有问题 3");
    await expect(applyPlan(db, adminId, p)).rejects.toThrow(/errors/);
    expect(await db.select().from(s.resources).where(eq(s.resources.origin, "ADMIN"))).toHaveLength(0);
  });

  async function filled(extra: Record<string, Record<string, string>> = {}) {
    const root = batch();
    fs.writeFileSync(
      path.join(root, LIST_FILE),
      list([
        { type: "模块", folder: "group-compare", category: "统计分析", tags: "统计、t 检验", tier: "EI", ...extra["group-compare"] },
        { type: "模块", folder: "power-analysis", category: "统计分析", ...extra["power-analysis"] },
        { type: "技能", folder: "rebuttal", category: "论文写作", title: "审稿回复信起草", ...extra.rebuttal },
      ]),
    );
    return root;
  }

  it("applies: drafts by default, with tiers, diagrams, licences and the right files", async () => {
    const p = await plan(await filled());
    expect(p.entries.map((e) => [e.slug, e.action, e.errors])).toEqual([
      ["group-compare", "create", []],
      ["power-analysis", "create", []],
      ["rebuttal-letter", "create", []],
    ]);
    expect(p.entries[1].input).toMatchObject({ language: "R", entry: "power.R", env: ["R 4.0+"], license: "MIT" });
    expect(p.entries[0].input).toMatchObject({ license: "All rights reserved" }); // members-only default
    const results = await applyPlan(db, adminId, p);
    expect(results.map((r) => [r.outcome, r.published])).toEqual([["created", false], ["created", false], ["created", false]]);

    const rows = await db.select().from(s.resources).where(eq(s.resources.origin, "ADMIN")).orderBy(s.resources.id);
    expect(rows.map((r) => [r.slug, r.status, r.requiredTier, r.licenseSource])).toEqual([
      ["group-compare", "DRAFT", "EI", "PLATFORM"],
      ["power-analysis", "DRAFT", "FREE", "PLATFORM"],
      ["rebuttal-letter", "DRAFT", "FREE", "PLATFORM"],
    ]);
    expect(rows[0].structureMediaId).not.toBeNull();
    expect(rows[2].title).toBe("审稿回复信起草"); // the list overrides the inferred name
    expect(rows[0].bodyMd).toBe("正文。");
    const audit = await db.select().from(s.adminAuditLog).where(eq(s.adminAuditLog.action, "bulk.create"));
    expect(audit).toHaveLength(3);
    expect((await loadSnapshot(db)).bySlug.has("group-compare")).toBe(false); // drafts stay private
    expect(applyReport(results, "https://example.cn")).toContain("/admin/modules/");
  });

  it("re-running skips what exists; -Update saves a new version; -Publish publishes", async () => {
    const root = await filled();
    await applyPlan(db, adminId, await plan(root));
    const again = await plan(root);
    expect(again.entries.map((e) => e.action)).toEqual(["skip", "skip", "skip"]);
    expect((await applyPlan(db, adminId, again)).every((r) => r.outcome === "skipped")).toBe(true);

    fs.writeFileSync(path.join(root, "modules/group-compare/main.py"), "def compare():\n    return 2\n");
    const upd = await plan(root, { update: true, publish: true });
    expect(upd.entries.map((e) => e.action)).toEqual(["update", "update", "update"]);
    const results = await applyPlan(db, adminId, upd, { publish: true });
    expect(results.every((r) => r.outcome === "updated" && r.published)).toBe(true);
    const snap = await loadSnapshot(db);
    expect(snap.bySlug.get("power-analysis")?.type).toBe("MODULE");
    expect(await loadAttachment(db, "group-compare", "main.py", 10)).toContain("return 2"); // EI rank
    expect(await loadAttachment(db, "group-compare", "main.py", 0)).toBeNull(); // still gated for free users
    expect(await loadAttachment(db, "rebuttal-letter", "SKILL.md", 0)).toContain("# Rebuttal");
  });

  it("third-party content: permissive licence is copied, unknown skill is index-only, unlicensed code is refused", async () => {
    const p = await plan(
      await filled({
        "power-analysis": { sourceUrl: "https://github.com/someone/power", license: "Apache-2.0", author: "someone" },
        "group-compare": { sourceUrl: "https://github.com/other/compare", tier: "FREE" },
        rebuttal: { sourceUrl: "https://example.org/rebuttal-skill" },
      }),
    );
    expect(p.entries[0].errors.join()).toContain("第三方代码必须在清单中填写许可证");
    expect(p.entries[1]).toMatchObject({ action: "create", licenseSource: "ADMIN_DECLARED", input: { redistribution: true, license: "Apache-2.0" } });
    expect(p.entries[2]).toMatchObject({ action: "create", licenseSource: "UNKNOWN", input: { redistribution: false } });

    // apply the valid two (drop the refused one)
    const ok: Plan = { ...p, entries: p.entries.slice(1) };
    await applyPlan(db, adminId, ok);
    const [mod] = await db.select().from(s.resources).where(eq(s.resources.slug, "power-analysis"));
    expect(mod).toMatchObject({ licenseSource: "ADMIN_DECLARED", license: "Apache-2.0", redistribution: true, sourceUrlNorm: "github.com/someone/power" });
    const [skill] = await db.select().from(s.resources).where(eq(s.resources.slug, "rebuttal-letter"));
    expect(skill).toMatchObject({ licenseSource: "UNKNOWN", redistribution: false });
    expect(await db.select().from(s.resourceFiles).where(eq(s.resourceFiles.resourceId, skill.id))).toHaveLength(0);
  });

  it("refuses bad tiers, slug clashes with other types, duplicates in the batch and the template examples", async () => {
    const root = await filled({ rebuttal: { tier: "SCI" }, "power-analysis": { slug: "abstract-polish" }, "group-compare": { slug: "abstract-polish", tier: "VIP" } });
    write(root, { "skills/example-skill/SKILL.md": "---\nname: example\ndescription: 示例示例示例示例示例示例示例示例示例示例示例\n---" });
    const p = await plan(root);
    const errs = Object.fromEntries(p.entries.map((e) => [e.folder, e.errors.join(" | ")]));
    expect(errs.rebuttal).toContain("Skills 始终免费");
    expect(errs["group-compare"]).toContain("会员等级“VIP”无效");
    expect(errs["power-analysis"]).toMatch(/重复|其他类型/);
    expect(errs["example-skill"]).toContain("示例");
  });

  it("--publish reports what would block publishing before anything is saved", async () => {
    const root = await filled();
    fs.writeFileSync(path.join(root, "modules/power-analysis/power.R"), "   \n");
    const p = await plan(root, { publish: true });
    expect(p.entries[1].errors.join()).toContain("发布前需要");
  });
});
