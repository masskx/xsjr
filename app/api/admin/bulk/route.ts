// POST /api/admin/bulk/  (Authorization: Bearer rhk_..., Content-Type: application/zip)
// Bulk upload of skills / modules / prompts as a ZIP in the bulk-folder layout (RUNBOOK §15/§16).
//   ?apply=1    save (as drafts); without it the request only checks and returns the plan
//   ?publish=1  publish what passes (with apply)
//   ?update=1   overwrite resources that already exist with the same slug
// Same rules as infra/bulk.ps1: all-or-nothing, the editors' validation, licence rules.
// Available only when accounts are enabled (HTTPS), like the back office itself.
import { applyPlan } from "@/lib/bulk/apply";
import { buildPlan } from "@/lib/bulk/plan";
import { applyReport, planReport } from "@/lib/bulk/report";
import { scanBatch } from "@/lib/bulk/scan";
import { cleanupBatch, unzipBatch, ZIP_LIMITS, ZipInputError } from "@/lib/bulk/zip-input";
import { authenticateToken } from "@/lib/admin/api-tokens";
import { authConfig } from "@/lib/auth/server";
import { hit } from "@/lib/auth/rate-limit";
import { getDb } from "@/lib/db/client";
import { SITE_URL } from "@/lib/site";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  if (!authConfig().available) return json(404, { ok: false, error: "not available (accounts are disabled on this server)" });
  const db = getDb();
  const auth = await authenticateToken(db, req.headers.get("authorization"), "bulk");
  if (!auth) return json(401, { ok: false, error: "missing, invalid, expired or revoked API token" });
  const rl = await hit(db, `api-bulk:token:${auth.tokenId}`, 30, 3600);
  if (!rl.allowed) return json(429, { ok: false, error: "rate limit: 30 requests per hour per token", retryAfter: rl.retryAfter });

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > ZIP_LIMITS.compressedBytes) return json(413, { ok: false, error: `ZIP larger than ${ZIP_LIMITS.compressedBytes / 1024 / 1024} MB` });
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.length) return json(400, { ok: false, error: "empty body: send the batch as application/zip" });

  const url = new URL(req.url);
  const flag = (k: string) => url.searchParams.get(k) === "1";
  const opts = { apply: flag("apply"), publish: flag("publish"), update: flag("update") };
  let dir: string;
  try {
    dir = unzipBatch(bytes);
  } catch (err) {
    if (err instanceof ZipInputError) return json(400, { ok: false, error: err.message });
    throw err;
  }
  try {
    const { items, problems } = scanBatch(dir);
    const plan = await buildPlan(db, dir, items, problems, { update: opts.update, publish: opts.publish });
    const entries = plan.entries.map((e) => ({ type: e.type, folder: e.folder, slug: e.slug, title: e.title, action: e.action, errors: e.errors, warnings: e.warnings }));
    const hasErrors = plan.entries.some((e) => e.action === "error") || !plan.entries.length;
    if (!opts.apply || hasErrors) {
      return json(hasErrors ? 422 : 200, { ok: !hasErrors, applied: false, problems: plan.problems, entries, report: planReport(plan, opts) });
    }
    const results = await applyPlan(db, auth.userId, plan, { publish: opts.publish });
    return json(results.some((r) => r.outcome === "failed") ? 207 : 200, {
      ok: !results.some((r) => r.outcome === "failed"),
      applied: true,
      results: results.map((r) => ({ type: r.entry.type, folder: r.entry.folder, slug: r.entry.slug, outcome: r.outcome, published: !!r.published, id: r.id ?? null, messages: r.messages })),
      report: applyReport(results, SITE_URL),
    });
  } finally {
    cleanupBatch(dir);
  }
}
