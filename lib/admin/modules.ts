// Admin operations on code modules: adapter for lib/admin/resources.ts, plus structure diagrams.
import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client";
import * as s from "../db/schema";
import { normaliseAttachmentPath } from "../content-files";
import { baseMetaSchema, moduleFieldsSchema, slugSchema } from "../content/validation";
import { languageFor, notifyContentChanged } from "../import/content-import";
import { ImageError } from "../media/images";
import { deleteMedia, saveImage } from "../media/storage";
import * as R from "./resources";

const MAX_FILE_CHARS = 200_000;

export const moduleInputSchema = baseMetaSchema
  .extend({
    slug: slugSchema,
    body: z.string().max(50_000, "正文不能超过 50000 个字符"),
    files: z
      .array(
        z.object({
          path: z
            .string()
            .trim()
            .refine((p) => normaliseAttachmentPath(p) === p, "文件路径无效（不能以 / 开头，不能包含 .. 或反斜杠）"),
          content: z.string().max(MAX_FILE_CHARS, `单个文件不能超过 ${MAX_FILE_CHARS} 个字符`),
        }),
      )
      .min(1, "至少需要一个代码文件")
      .max(20, "文件最多 20 个")
      .refine((fs) => new Set(fs.map((f) => f.path)).size === fs.length, "文件路径不能重复"),
    ...moduleFieldsSchema.shape,
  })
  .superRefine((m, ctx) => {
    const entry = normaliseAttachmentPath(m.entry);
    if (!entry || !m.files.some((f) => f.path === entry)) {
      ctx.addIssue({ code: "custom", path: ["entry"], message: "入口文件必须是下方文件列表中的一个" });
    }
  });
export type ModuleInput = z.infer<typeof moduleInputSchema>;

export const moduleAdapter: R.Adapter<ModuleInput> = {
  type: "MODULE",
  label: "模块",
  schema: moduleInputSchema,
  defaults: () => ({
    language: "Python",
    entry: "files/main.py",
    env: ["Python >= 3.9"],
    files: [{ path: "main.py", content: '"""在这里粘贴模块代码。"""\n' }],
  }),
  publishProblems(input): Record<string, string> {
    return input.files.some((f) => f.content.trim()) ? {} : { files: "代码文件都是空的" };
  },
  async readDetails(db, id) {
    const [[mod], files] = await Promise.all([
      db.select().from(s.resourceModule).where(eq(s.resourceModule.resourceId, id)),
      db
        .select({ path: s.resourceFiles.path, content: s.resourceFiles.content })
        .from(s.resourceFiles)
        .where(eq(s.resourceFiles.resourceId, id))
        .orderBy(desc(s.resourceFiles.isEntry), asc(s.resourceFiles.sortOrder), asc(s.resourceFiles.path)),
    ]);
    return {
      language: mod?.language ?? "",
      entry: mod?.entryPath ?? "",
      env: mod?.env ?? [],
      dependencies: mod?.dependencies?.length ? mod.dependencies : undefined,
      usage: mod?.usage ?? undefined,
      files,
    };
  },
  async writeDetails(db, id, input) {
    const entry = normaliseAttachmentPath(input.entry)!;
    await db.delete(s.resourceModule).where(eq(s.resourceModule.resourceId, id));
    await db.insert(s.resourceModule).values({
      resourceId: id,
      language: input.language,
      entryPath: `files/${entry}`,
      env: input.env,
      dependencies: input.dependencies ?? [],
      usage: input.usage?.length ? input.usage : null,
    });
    await db.delete(s.resourceFiles).where(eq(s.resourceFiles.resourceId, id));
    await db.insert(s.resourceFiles).values(
      input.files.map((f, i) => ({
        resourceId: id,
        path: f.path,
        content: f.content,
        language: languageFor(f.path),
        sizeBytes: Buffer.byteLength(f.content, "utf8"),
        isEntry: f.path === entry,
        sortOrder: i,
      })),
    );
  },
};

export const listModules = (db: Db, filter: Parameters<typeof R.listResources>[2] = {}) => R.listResources(db, "MODULE", filter);
export const getModuleForEdit = (db: Db, id: number) => R.getForEdit(db, moduleAdapter, id);

// ── structure diagrams ──

async function diagramTarget(db: Db, resourceId: number) {
  const [row] = await db
    .select({ type: s.resources.type, mediaId: s.resources.structureMediaId })
    .from(s.resources)
    .where(eq(s.resources.id, resourceId));
  // modules: structure diagram; navigation sites: their icon
  return row?.type === "MODULE" || row?.type === "SITE" ? row : null;
}

/** Upload (or replace) a module's structure diagram. Returns a user-facing error on bad input. */
export async function setDiagram(ctx: R.AdminCtx, resourceId: number, file: Buffer, alt: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const target = await diagramTarget(ctx.db, resourceId);
  if (!target) return { ok: false, error: "资源不存在" };
  let media;
  try {
    media = await saveImage(ctx.db, file, { prefix: "diagrams", alt, createdBy: ctx.actorId });
  } catch (err) {
    if (err instanceof ImageError) return { ok: false, error: err.message };
    throw err;
  }
  await ctx.db.update(s.resources).set({ structureMediaId: media.id }).where(eq(s.resources.id, resourceId));
  if (target.mediaId) await deleteMedia(ctx.db, target.mediaId);
  await R.audit(ctx, "resource.set_diagram", resourceId, { media: media.storageKey, bytes: media.bytes });
  await notifyContentChanged(ctx.db);
  return { ok: true };
}

export async function removeDiagram(ctx: R.AdminCtx, resourceId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const target = await diagramTarget(ctx.db, resourceId);
  if (!target) return { ok: false, error: "模块不存在" };
  if (!target.mediaId) return { ok: true };
  await ctx.db.update(s.resources).set({ structureMediaId: null }).where(eq(s.resources.id, resourceId));
  await deleteMedia(ctx.db, target.mediaId);
  await R.audit(ctx, "resource.remove_diagram", resourceId);
  await notifyContentChanged(ctx.db);
  return { ok: true };
}

export async function diagramOf(db: Db, resourceId: number) {
  const [row] = await db
    .select({ key: s.media.storageKey, width: s.media.width, height: s.media.height, alt: s.media.alt, bytes: s.media.bytes })
    .from(s.resources)
    .innerJoin(s.media, eq(s.media.id, s.resources.structureMediaId))
    .where(eq(s.resources.id, resourceId));
  return row ? { ...row, src: `/media/${row.key}` } : null;
}
