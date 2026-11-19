// Admin operations on Agent Skills: adapter for lib/admin/resources.ts. Skills are always free
// (database constraint); the compatibility matrix lives in skill_compat so the admin can edit it.
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client";
import * as s from "../db/schema";
import { baseMetaSchema, skillFieldsSchema, slugSchema } from "../content/validation";
import * as R from "./resources";

const SKILL_FILE = "SKILL.md";

export const skillInputSchema = baseMetaSchema.extend({
  slug: slugSchema,
  body: z.string().max(50_000, "正文不能超过 50000 个字符"),
  skillMd: z.string().max(100_000, "SKILL.md 不能超过 100000 个字符"),
  ...skillFieldsSchema.shape,
});
export type SkillInput = z.infer<typeof skillInputSchema>;

export const skillAdapter: R.Adapter<SkillInput> = {
  type: "SKILL",
  label: "Skill",
  schema: skillInputSchema,
  defaults: () => ({
    skillMd: "---\nname: my-skill\ndescription: 一句话说明这个 Skill 做什么、什么时候用。\n---\n\n# 使用说明\n",
    compat: [{ tool: "claude-code", supportedRange: "当前版本" }],
    files: [{ path: SKILL_FILE }],
  }),
  publishProblems(input): Record<string, string> {
    const p: Record<string, string> = {};
    if (!input.skillMd.trim()) p.skillMd = "SKILL.md 不能为空";
    if (!input.compat.length) p.compat = "至少填写一行兼容性";
    return p;
  },
  async readDetails(db, id) {
    const [[skill], compat, files] = await Promise.all([
      db.select().from(s.resourceSkill).where(eq(s.resourceSkill.resourceId, id)),
      db.select().from(s.skillCompat).where(eq(s.skillCompat.resourceId, id)).orderBy(asc(s.skillCompat.sortOrder)),
      db.select().from(s.resourceFiles).where(and(eq(s.resourceFiles.resourceId, id), eq(s.resourceFiles.path, SKILL_FILE))),
    ]);
    return {
      skillMd: files[0]?.content ?? "",
      compat: compat.map((c) => ({ tool: c.toolKey, supportedRange: c.supportedRange, installPath: c.installPath ?? undefined, note: c.note ?? undefined })),
      files: ((skill?.fileTree as { path: string; size?: number; desc?: string }[] | undefined) ?? []).map((f) => ({ path: f.path, size: f.size, desc: f.desc })),
      risks: skill?.risks ?? undefined,
      dependencies: skill?.dependencies ?? undefined,
    };
  },
  async writeDetails(db, id, input) {
    await db.delete(s.resourceSkill).where(eq(s.resourceSkill.resourceId, id));
    await db.insert(s.resourceSkill).values({
      resourceId: id,
      risks: input.risks?.length ? input.risks : null,
      dependencies: input.dependencies?.length ? input.dependencies : null,
      fileTree: input.files.map((f) => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined))),
    });
    await db.delete(s.skillCompat).where(eq(s.skillCompat.resourceId, id));
    if (input.compat.length) {
      await db.insert(s.skillCompat).values(
        input.compat.map((c, i) => ({
          resourceId: id,
          toolKey: c.tool,
          supportedRange: c.supportedRange,
          installPath: c.installPath ?? null,
          note: c.note ?? null,
          sortOrder: i,
        })),
      );
    }
    await db.delete(s.resourceFiles).where(and(eq(s.resourceFiles.resourceId, id), eq(s.resourceFiles.path, SKILL_FILE)));
    await db.insert(s.resourceFiles).values({
      resourceId: id,
      path: SKILL_FILE,
      content: input.skillMd,
      language: "markdown",
      sizeBytes: Buffer.byteLength(input.skillMd, "utf8"),
    });
  },
};

export const listSkills = (db: Db, filter: Parameters<typeof R.listResources>[2] = {}) => R.listResources(db, "SKILL", filter);
export const getSkillForEdit = (db: Db, id: number) => R.getForEdit(db, skillAdapter, id);
