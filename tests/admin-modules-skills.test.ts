import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import * as s from "@/lib/db/schema";
import type { Db } from "@/lib/db/client";
import { loadContentDir } from "@/lib/content-files";
import { importContent } from "@/lib/import/content-import";
import { loadAttachment, loadAttachments, loadSnapshot } from "@/lib/repo/store";
import * as R from "@/lib/admin/resources";
import { getModuleForEdit, moduleAdapter, removeDiagram, setDiagram } from "@/lib/admin/modules";
import { getSkillForEdit, skillAdapter } from "@/lib/admin/skills";
import { pathForKey } from "@/lib/media/storage";
import { TEST_DATABASE_URL, freshDb } from "./helpers/db";

const CONTENT = path.resolve(__dirname, "../content");
const fx = (n: string) => fs.readFileSync(path.resolve(__dirname, "fixtures", n));

describe.skipIf(!TEST_DATABASE_URL)("admin: modules and skills", () => {
  let db: Db;
  let pool: Pool;
  let ctx: R.AdminCtx;
  const idOf = async (slug: string) => (await db.select({ id: s.resources.id }).from(s.resources).where(eq(s.resources.slug, slug)))[0].id;
  const uploads = fs.mkdtempSync(path.join(os.tmpdir(), "rh-uploads-"));

  beforeAll(async () => {
    process.env.UPLOADS_DIR = uploads;
    ({ db, pool } = await freshDb());
    await importContent(db, loadContentDir(CONTENT));
    const [admin] = await db.insert(s.users).values({ email: "admin@example.test", passwordHash: "x", role: "ADMIN" }).returning({ id: s.users.id });
    ctx = { db, actorId: admin.id };
  });
  afterAll(async () => {
    await pool?.end();
    fs.rmSync(uploads, { recursive: true, force: true });
  });

  it("every imported module and skill opens in the editor and saves without changing the public page", async () => {
    const before = await loadSnapshot(db);
    for (const slug of ["stat-tests-py", "pub-figure-mpl", "bootstrap-ci-py"]) {
      const cur = (await getModuleForEdit(db, await idOf(slug)))!;
      expect(moduleAdapter.schema.safeParse(cur.input).success).toBe(true);
      expect((await R.saveResource(ctx, moduleAdapter, cur.id, cur.input, cur.version)).ok).toBe(true);
    }
    for (const slug of ["figure-quality-review", "paper-reviewer-simulator", "reference-verification"]) {
      const cur = (await getSkillForEdit(db, await idOf(slug)))!;
      const parsed = skillAdapter.schema.safeParse(cur.input);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
      expect((await R.saveResource(ctx, skillAdapter, cur.id, cur.input, cur.version)).ok).toBe(true);
    }
    const after = await loadSnapshot(db);
    for (const r of before.all.filter((x) => x.type === "MODULE" || x.type === "SKILL")) {
      expect(JSON.parse(JSON.stringify(after.bySlug.get(r.slug)))).toEqual(JSON.parse(JSON.stringify(r)));
      expect(after.bodies.get(r.slug)).toBe(before.bodies.get(r.slug));
    }
    for (const item of loadContentDir(CONTENT).filter((i) => i.resource.type !== "PROMPT")) {
      for (const f of item.files) expect(await loadAttachment(db, item.resource.slug, f.path, 0)).toBe(f.content);
    }
  });

  it("modules can have several files; the entry file comes first", async () => {
    const id = await idOf("bootstrap-ci-py");
    const cur = (await getModuleForEdit(db, id))!;
    const files = [{ path: "examples/demo.py", content: "from bootstrap_ci import compare_groups\n" }, ...cur.input.files];
    expect((await R.saveResource(ctx, moduleAdapter, id, { ...cur.input, files, applicableTasks: ["两组均值差异的置信区间"] }, cur.version)).ok).toBe(true);
    const loaded = await loadAttachments(db, "bootstrap-ci-py", 0);
    expect(loaded.map((f) => f.path)).toEqual(["bootstrap_ci.py", "examples/demo.py"]);
    expect(loaded[1].language).toBe("python");
    const snap = await loadSnapshot(db);
    expect(snap.files.get("bootstrap-ci-py")?.map((f) => [f.path, f.isEntry])).toEqual([
      ["bootstrap_ci.py", true],
      ["examples/demo.py", false],
    ]);
    expect(snap.bySlug.get("bootstrap-ci-py")?.applicableTasks).toEqual(["两组均值差异的置信区间"]);
  });

  it("validates entry and file paths", async () => {
    const id = await idOf("pub-figure-mpl");
    const cur = (await getModuleForEdit(db, id))!;
    const bad = async (patch: object) => R.saveResource(ctx, moduleAdapter, id, { ...cur.input, ...patch }, cur.version);
    expect(await bad({ entry: "files/missing.py" })).toMatchObject({ ok: false, errors: { entry: expect.any(String) } });
    expect(await bad({ files: [{ path: "../escape.py", content: "x" }] })).toMatchObject({ ok: false });
    expect(await bad({ files: [{ path: "/abs.py", content: "x" }] })).toMatchObject({ ok: false });
    expect(await bad({ files: [] })).toMatchObject({ ok: false });
    expect(await bad({ files: [...cur.input.files, cur.input.files[0]] })).toMatchObject({ ok: false });
  });

  it("creates and publishes a new module and a new skill", async () => {
    const m = await R.createDraft(ctx, moduleAdapter, { title: "新模块", slug: "new-module", summary: "这是一个用于测试后台新建与发布流程的代码模块，包含一个文件。", category: "数据分析" });
    if (!m.ok) throw new Error(JSON.stringify(m.errors));
    expect((await R.publishResource(ctx, moduleAdapter, m.id)).ok).toBe(true);
    expect((await loadSnapshot(db)).bySlug.get("new-module")?.type).toBe("MODULE");

    const k = await R.createDraft(ctx, skillAdapter, { title: "新技能", slug: "new-skill", summary: "这是一个用于测试后台新建与发布流程的 Agent Skill，带兼容性矩阵。", category: "论文写作" });
    if (!k.ok) throw new Error(JSON.stringify(k.errors));
    const cur = (await getSkillForEdit(db, k.id))!;
    const compat = [
      { tool: "claude-code", supportedRange: "1.x", installPath: "~/.claude/skills/new-skill/" },
      { tool: "codex", supportedRange: "实验性" },
    ];
    expect((await R.saveResource(ctx, skillAdapter, k.id, { ...cur.input, compat }, cur.version)).ok).toBe(true);
    expect((await R.publishResource(ctx, skillAdapter, k.id)).ok).toBe(true);
    const skill = (await loadSnapshot(db)).bySlug.get("new-skill");
    expect(skill && "compat" in skill && skill.compat.map((c) => c.tool)).toEqual(["claude-code", "codex"]);
    expect(await loadAttachment(db, "new-skill", "SKILL.md", 0)).toContain("name: my-skill");
  });

  it("uploads, replaces and removes a structure diagram (files cleaned up)", async () => {
    const id = await idOf("stat-tests-py");
    expect(await setDiagram(ctx, id, Buffer.from("<svg/>"), "x")).toMatchObject({ ok: false, error: expect.stringContaining("PNG") });
    expect((await setDiagram(ctx, id, fx("sample.png"), "统计检验工具包结构图")).ok).toBe(true);
    let d = (await loadSnapshot(db)).diagrams.get("stat-tests-py")!;
    expect(d).toMatchObject({ width: 40, height: 30, alt: "统计检验工具包结构图" });
    const firstKey = d.src.replace("/media/", "");
    expect(fs.existsSync(pathForKey(firstKey))).toBe(true);

    expect((await setDiagram(ctx, id, fx("sample.webp"), "新版结构图")).ok).toBe(true);
    d = (await loadSnapshot(db)).diagrams.get("stat-tests-py")!;
    expect(d.src).toMatch(/\.webp$/);
    expect(fs.existsSync(pathForKey(firstKey))).toBe(false); // replaced file deleted

    // diagrams stay public on members-only modules
    await db.update(s.resources).set({ requiredTier: "EI" }).where(eq(s.resources.id, id));
    expect((await loadSnapshot(db)).diagrams.has("stat-tests-py")).toBe(true);
    expect(await loadAttachments(db, "stat-tests-py", 0)).toEqual([]);

    expect((await removeDiagram(ctx, id)).ok).toBe(true);
    expect((await loadSnapshot(db)).diagrams.has("stat-tests-py")).toBe(false);
    expect(await db.select().from(s.media)).toEqual([]);
  });
});
