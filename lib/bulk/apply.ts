// Carry out a plan through the same code paths as the back office (create, save with version
// token, tier, structure diagram, publish), so every resource uploaded in bulk gets the same
// validation, version history, audit entries and cache invalidation as one made by hand.
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import * as s from "../db/schema";
import * as R from "../admin/resources";
import { moduleAdapter, setDiagram } from "../admin/modules";
import { skillAdapter } from "../admin/skills";
import { promptAdapter } from "../admin/prompts";
import { setModuleTier } from "../admin/members";
import type { Plan, PlanEntry } from "./plan";

export interface Applied {
  entry: PlanEntry;
  id?: number;
  outcome: "created" | "updated" | "skipped" | "failed";
  published?: boolean;
  messages: string[];
}

const adapterOf = (e: PlanEntry) => (e.type === "skill" ? skillAdapter : e.type === "prompt" ? promptAdapter : moduleAdapter) as unknown as R.Adapter<R.CommonInput>;
const fail = (r: { errors: Record<string, string> } | { error: string }) => ("errors" in r ? Object.values(r.errors).join("；") : r.error);

async function applyOne(ctx: R.AdminCtx, e: PlanEntry, publish: boolean): Promise<Applied> {
  const adapter = adapterOf(e);
  const input = e.input as R.CommonInput;
  const messages: string[] = [];
  let id = e.existingId;

  if (e.action === "create") {
    const created = await R.createDraft(ctx, adapter, { title: input.title, slug: input.slug, summary: input.summary, category: input.category });
    if (!created.ok) return { entry: e, outcome: "failed", messages: [fail(created)] };
    id = created.id;
    if (e.licenseSource !== "PLATFORM") {
      // third-party: the licence is the uploader's declaration (or unknown -> index only)
      await ctx.db.update(s.resources).set({ licenseSource: e.licenseSource, redistribution: input.redistribution }).where(eq(s.resources.id, id));
    }
  }
  const current = await R.getForEdit(ctx.db, adapter, id!);
  if (!current) return { entry: e, id, outcome: "failed", messages: ["资源不存在"] };
  const saved = await R.saveResource(ctx, adapter, id!, input, current.version);
  if (!saved.ok) return { entry: e, id, outcome: "failed", messages: [fail(saved)] };

  if (e.type === "module") {
    const tier = await setModuleTier(ctx, id!, e.tier);
    if (!tier.ok) messages.push(`会员等级未设置：${tier.error}`);
    if (e.diagram) {
      const d = await setDiagram(ctx, id!, e.diagram.bytes, `${input.title}结构图`);
      if (!d.ok) messages.push(`结构图 ${e.diagram.file} 未保存：${d.error}`);
    }
  }
  let published = current.status === "PUBLISHED";
  if (publish && !published) {
    const p = await R.publishResource(ctx, adapter, id!);
    if (p.ok) published = true;
    else messages.push(`未发布：${fail(p)}`);
  }
  await R.audit(ctx, e.action === "create" ? "bulk.create" : "bulk.update", id!, { folder: e.folder, type: e.type });
  return { entry: e, id, outcome: e.action === "create" ? "created" : "updated", published, messages };
}

/** Apply every create/update entry. Refuses to start when any entry has errors. */
export async function applyPlan(db: Db, actorId: number, plan: Plan, opts: { publish?: boolean; now?: Date } = {}): Promise<Applied[]> {
  if (plan.entries.some((e) => e.action === "error")) throw new Error("plan has errors; nothing applied");
  const ctx: R.AdminCtx = { db, actorId, now: opts.now };
  const out: Applied[] = [];
  for (const e of plan.entries) {
    if (e.action === "skip") {
      out.push({ entry: e, id: e.existingId, outcome: "skipped", messages: [] });
      continue;
    }
    try {
      out.push(await applyOne(ctx, e, !!opts.publish));
    } catch (err) {
      out.push({ entry: e, outcome: "failed", messages: [(err as Error).message] });
    }
  }
  return out;
}
