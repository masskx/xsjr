// Admin prompt management against a real PostgreSQL (TEST_DATABASE_URL).
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { Pool } from "pg";
import * as s from "@/lib/db/schema";
import type { Db } from "@/lib/db/client";
import { loadContentDir } from "@/lib/content-files";
import { importContent } from "@/lib/import/content-import";
import { loadAttachment, loadSnapshot } from "@/lib/repo/store";
import {
  archivePrompt,
  createPromptDraft,
  getPromptForEdit,
  listPrompts,
  movePrompt,
  publishPrompt,
  restorePrompt,
  savePrompt,
  unpublishPrompt,
  type AdminCtx,
} from "@/lib/admin/prompts";
import type { PromptInput } from "@/lib/content/validation";
import { TEST_DATABASE_URL, freshDb } from "./helpers/db";

const CONTENT = path.resolve(__dirname, "../content");

describe.skipIf(!TEST_DATABASE_URL)("admin: prompts", () => {
  let db: Db;
  let pool: Pool;
  let ctx: AdminCtx;
  let id: number;

  beforeAll(async () => {
    ({ db, pool } = await freshDb());
    await importContent(db, loadContentDir(CONTENT));
    const [admin] = await db
      .insert(s.users)
      .values({ email: "admin@example.test", passwordHash: "x", role: "ADMIN" })
      .returning({ id: s.users.id });
    ctx = { db, actorId: admin.id };
  });
  afterAll(async () => pool?.end());

  const edit = async (patch: Partial<PromptInput>) => {
    const cur = (await getPromptForEdit(db, id))!;
    return savePrompt(ctx, id, { ...cur.input, ...patch }, cur.version);
  };

  it("creates a draft that is invisible publicly", async () => {
    const bad = await createPromptDraft(ctx, { title: "x", slug: "Bad Slug", summary: "短", category: "" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(["category", "slug", "summary", "title"]);

    const taken = await createPromptDraft(ctx, { title: "重复", slug: "abstract-polish", summary: "这是一个用于测试的摘要，长度足够二十个字以上。", category: "论文写作" });
    expect(taken).toMatchObject({ ok: false, errors: { slug: expect.stringContaining("占用") } });

    const r = await createPromptDraft(ctx, {
      title: "方法部分写作助手",
      slug: "methods-writer",
      summary: "把实验记录整理成符合期刊规范的方法部分，覆盖样本、流程、统计方法与可重复性细节。",
      category: "论文写作",
    });
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    id = r.id;
    const snap = await loadSnapshot(db);
    expect(snap.bySlug.has("methods-writer")).toBe(false);
    expect((await listPrompts(db)).map((p) => p.slug)).toContain("methods-writer");
  });

  it("validates fields, variables and template placeholders", async () => {
    const r = await edit({
      summary: "太短",
      variables: [
        { key: "1bad", label: "x", type: "text" },
        { key: "lang", label: "语言", type: "select", options: ["中文"] },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.summary).toContain("20");
      expect(r.errors["variables.0.key"]).toContain("变量名");
      expect(r.errors["variables.1.options"]).toContain("2 个选项");
    }
    // a draft may reference undeclared placeholders, but publishing refuses
    expect((await edit({ template: "请用 {{topic}} 写方法部分" })).ok).toBe(true);
    const pub = await publishPrompt(ctx, id);
    expect(pub).toMatchObject({ ok: false, errors: { template: expect.stringContaining("{{topic}}") } });
  });

  it("publishes: visible in lists, search snapshot and detail; version and audit recorded", async () => {
    const saved = await edit({
      template: "请根据 {{topic}} 的实验记录写方法部分。",
      variables: [{ key: "topic", label: "研究主题", type: "text", required: true }],
      tags: ["方法", "论文写作"],
      body: "## 解决什么问题\n\n把零散的实验记录变成规范的方法部分。",
    });
    expect(saved.ok).toBe(true);
    expect((await publishPrompt(ctx, id)).ok).toBe(true);

    const snap = await loadSnapshot(db);
    const r = snap.bySlug.get("methods-writer");
    expect(r?.type).toBe("PROMPT");
    expect(r && "variables" in r && r.variables[0].key).toBe("topic");
    expect(r?.tags).toEqual(["方法", "论文写作"]);
    expect(await loadAttachment(db, "methods-writer", "template.md", 0)).toContain("{{topic}}");

    const versions = await db.select().from(s.resourceVersions).where(eq(s.resourceVersions.resourceId, id));
    expect(versions.map((v) => v.version)).toEqual([1]);
    const audit = await db.select().from(s.adminAuditLog).where(and(eq(s.adminAuditLog.targetId, id), eq(s.adminAuditLog.targetType, "resource")));
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(["resource.create", "resource.update", "resource.publish"]));
  });

  it("locks the slug after first publish and refuses stale saves", async () => {
    expect(await edit({ slug: "methods-writer-2" })).toMatchObject({ ok: false, errors: { slug: expect.stringContaining("不能修改") } });

    const stale = (await getPromptForEdit(db, id))!;
    expect((await savePrompt(ctx, id, { ...stale.input, title: "第一个人的修改" }, stale.version)).ok).toBe(true);
    const second = await savePrompt(ctx, id, { ...stale.input, title: "第二个人的修改" }, stale.version);
    expect(second).toMatchObject({ ok: false, conflict: true });
    expect((await loadSnapshot(db)).bySlug.get("methods-writer")?.title).toBe("第一个人的修改");
    // editing a published prompt records a new version
    const versions = await db.select().from(s.resourceVersions).where(eq(s.resourceVersions.resourceId, id));
    expect(versions.length).toBe(2);
  });

  it("unpublish hides it; archive removes it from the admin list; restore brings it back as draft", async () => {
    expect((await unpublishPrompt(ctx, id)).ok).toBe(true);
    expect((await loadSnapshot(db)).bySlug.has("methods-writer")).toBe(false);
    expect(await loadAttachment(db, "methods-writer", "template.md", 0)).toBeNull();

    expect((await archivePrompt(ctx, id)).ok).toBe(true);
    expect((await listPrompts(db)).some((p) => p.id === id)).toBe(false);
    expect((await listPrompts(db, { status: "ARCHIVED" })).map((p) => p.id)).toEqual([id]);
    expect((await edit({ title: "改不了" })).ok).toBe(false);
    expect((await publishPrompt(ctx, id)).ok).toBe(false);

    expect((await restorePrompt(ctx, id)).ok).toBe(true);
    expect((await getPromptForEdit(db, id))!.status).toBe("DRAFT");
    expect((await unpublishPrompt(ctx, id)).ok).toBe(false); // not published
  });

  it("reorders prompts and the public order follows", async () => {
    await publishPrompt(ctx, id);
    const before = (await loadSnapshot(db)).all.filter((r) => r.type === "PROMPT" && !r.featured).map((r) => r.slug);
    const last = before[before.length - 1];
    const rows = await listPrompts(db);
    const target = rows.find((r) => r.slug === last)!;
    expect((await movePrompt(ctx, target.id, "up")).ok).toBe(true);
    const after = (await loadSnapshot(db)).all.filter((r) => r.type === "PROMPT" && !r.featured).map((r) => r.slug);
    expect(after.indexOf(last)).toBe(before.indexOf(last) - 1);

    const first = (await listPrompts(db))[0];
    expect((await movePrompt(ctx, first.id, "up")).ok).toBe(false);
  });

  it("the file importer leaves admin-edited prompts and the admin's order alone", async () => {
    const [ap] = await db.select().from(s.resources).where(eq(s.resources.slug, "abstract-polish"));
    const cur = (await getPromptForEdit(db, ap.id))!;
    expect((await savePrompt(ctx, ap.id, { ...cur.input, title: "后台改过的标题" }, cur.version)).ok).toBe(true);
    const orderBefore = (await db.select({ slug: s.resources.slug, o: s.resources.sortOrder }).from(s.resources).where(eq(s.resources.type, "PROMPT")));

    const report = await importContent(db, loadContentDir(CONTENT), { force: false });
    expect(report.results.find((r) => r.slug === "abstract-polish")?.action).toBe("skipped-admin-edited");
    expect((await loadSnapshot(db)).bySlug.get("abstract-polish")?.title).toBe("后台改过的标题");
    const orderAfter = (await db.select({ slug: s.resources.slug, o: s.resources.sortOrder }).from(s.resources).where(eq(s.resources.type, "PROMPT")));
    expect(orderAfter).toEqual(orderBefore);
  });
});
