// Admin operations on prompts: the prompt adapter for lib/admin/resources.ts plus the
// prompt-named wrappers the admin pages, actions and tests use.
import { and, asc, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import * as s from "../db/schema";
import { promptInputSchema, templateProblems, type PromptInput } from "../content/validation";
import * as R from "./resources";

export type { AdminCtx, Status } from "./resources";
export type PromptRow = R.ResourceRow;
export type Fail = R.Fail;
export type PromptForEdit = R.ForEdit<PromptInput>;

const TEMPLATE_PATH = "template.md";

export const promptAdapter: R.Adapter<PromptInput> = {
  type: "PROMPT",
  label: "提示词",
  schema: promptInputSchema,
  defaults: () => ({ template: "（在这里编写提示词模板，用 {{变量名}} 引用下方定义的变量。）", variables: [] }),
  publishProblems(input): Record<string, string> {
    const problems = templateProblems(input.template, input.variables);
    return problems.length ? { template: problems.join("；") } : {};
  },
  async readDetails(db, id) {
    const [vars, prompt, files] = await Promise.all([
      db.select().from(s.promptVariables).where(eq(s.promptVariables.resourceId, id)).orderBy(asc(s.promptVariables.sortOrder)),
      db.select().from(s.resourcePrompt).where(eq(s.resourcePrompt.resourceId, id)),
      db.select().from(s.resourceFiles).where(and(eq(s.resourceFiles.resourceId, id), eq(s.resourceFiles.path, TEMPLATE_PATH))),
    ]);
    return {
      template: files[0]?.content ?? "",
      notes: prompt[0]?.notes ?? undefined,
      variables: vars.map((v) => ({
        key: v.key,
        label: v.label,
        type: v.type,
        required: v.required ?? undefined,
        default: v.defaultValue ?? undefined,
        help: v.help ?? undefined,
        options: (v.options as string[] | null) ?? undefined,
      })),
    };
  },
  async writeDetails(db, id, input) {
    await db.delete(s.resourcePrompt).where(eq(s.resourcePrompt.resourceId, id));
    await db.insert(s.resourcePrompt).values({ resourceId: id, notes: input.notes?.length ? input.notes : null });
    await db.delete(s.promptVariables).where(eq(s.promptVariables.resourceId, id));
    if (input.variables.length) {
      await db.insert(s.promptVariables).values(
        input.variables.map((v, i) => ({
          resourceId: id,
          key: v.key,
          label: v.label,
          type: v.type,
          required: v.required ?? null,
          defaultValue: v.default ?? null,
          help: v.help ?? null,
          options: v.type === "select" ? (v.options ?? null) : null,
          sortOrder: i,
        })),
      );
    }
    await db.delete(s.resourceFiles).where(and(eq(s.resourceFiles.resourceId, id), eq(s.resourceFiles.path, TEMPLATE_PATH)));
    await db.insert(s.resourceFiles).values({
      resourceId: id,
      path: TEMPLATE_PATH,
      content: input.template,
      language: "markdown",
      sizeBytes: Buffer.byteLength(input.template, "utf8"),
    });
  },
};

export const listPrompts = (db: Db, filter: Parameters<typeof R.listResources>[2] = {}) => R.listResources(db, "PROMPT", filter);
export const listCategories = R.listCategories;
export const getPromptForEdit = (db: Db, id: number) => R.getForEdit(db, promptAdapter, id);
export const createPromptDraft = (ctx: R.AdminCtx, raw: { title: string; slug: string; summary: string; category: string }) => R.createDraft(ctx, promptAdapter, raw);
export const savePrompt = (ctx: R.AdminCtx, id: number, raw: unknown, version: string) => R.saveResource(ctx, promptAdapter, id, raw, version);
export const publishPrompt = (ctx: R.AdminCtx, id: number) => R.publishResource(ctx, promptAdapter, id);
export const unpublishPrompt = (ctx: R.AdminCtx, id: number) => R.unpublish(ctx, "PROMPT", id);
export const archivePrompt = (ctx: R.AdminCtx, id: number) => R.archive(ctx, "PROMPT", id);
export const restorePrompt = (ctx: R.AdminCtx, id: number) => R.restore(ctx, "PROMPT", id);
export const movePrompt = (ctx: R.AdminCtx, id: number, direction: "up" | "down") => R.move(ctx, "PROMPT", id, direction);
