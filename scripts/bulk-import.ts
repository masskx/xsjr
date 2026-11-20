// Bulk upload of skills and modules from a folder of loose files (see docs/RUNBOOK.md §15).
// Normally started by infra/bulk.ps1 on the owner's PC via infra/remote/bulk.sh on the server:
//
//   node scripts/bulk-import.mjs --dir /bulk/<id>/in --out /bulk/<id>/out --as admin@example.cn
//        [--apply] [--publish] [--update]
//
// Without --apply nothing is written (a check). --apply refuses to start while any item has
// errors. Writes 检查报告.txt (and 清单.csv when the batch has none) into --out.
// Local development:  npx tsx --env-file=.env.local scripts/bulk-import.ts --dir D:\batch --as owner@example.com
import fs from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { getDb, getPool } from "../lib/db/client";
import * as s from "../lib/db/schema";
import { normaliseEmail } from "../lib/auth/service";
import { scanBatch } from "../lib/bulk/scan";
import { buildPlan, LIST_FILE } from "../lib/bulk/plan";
import { applyPlan } from "../lib/bulk/apply";
import { applyReport, planReport } from "../lib/bulk/report";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(name);

async function main(): Promise<number> {
  const dir = arg("--dir");
  const out = arg("--out") ?? dir;
  const email = normaliseEmail(arg("--as") ?? "");
  if (!dir || !out || !email) {
    console.error("usage: bulk-import --dir <folder> --as <admin email> [--out <folder>] [--apply] [--publish] [--update]");
    return 2;
  }
  const opts = { apply: flag("--apply"), publish: flag("--publish"), update: flag("--update") };
  const db = getDb();
  const [admin] = await db
    .select({ id: s.users.id })
    .from(s.users)
    .where(and(eq(s.users.email, email), eq(s.users.role, "ADMIN")));
  if (!admin) {
    console.error(`no administrator with email ${email} (create one with scripts/create-admin.mjs)`);
    return 2;
  }

  const { items, problems } = scanBatch(dir);
  const plan = await buildPlan(db, dir, items, problems, { update: opts.update, publish: opts.publish });
  fs.mkdirSync(out, { recursive: true });
  let report = planReport(plan, opts);
  if (plan.suggestedList) fs.writeFileSync(path.join(out, LIST_FILE), plan.suggestedList);
  const hasErrors = plan.entries.some((e) => e.action === "error") || !plan.entries.length;

  if (opts.apply && !hasErrors) {
    const results = await applyPlan(db, admin.id, plan, { publish: opts.publish });
    const site = (process.env.SITE_URL ?? "").replace(/\/$/, "");
    report = applyReport(results, site) + "\n" + report.replace("（仅检查，没有保存任何内容）", "（保存前的检查）");
    fs.writeFileSync(path.join(out, "检查报告.txt"), report);
    process.stdout.write(report);
    return results.some((r) => r.outcome === "failed") ? 1 : 0;
  }
  if (opts.apply && hasErrors) report += "\n没有保存任何内容：请先修改上面标 ✗ 的项。\n";
  fs.writeFileSync(path.join(out, "检查报告.txt"), report);
  process.stdout.write(report);
  return hasErrors ? 1 : 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error("[bulk-import] FAILED", err);
    process.exitCode = 1;
  })
  .finally(() => getPool().end());
