// The human-readable report (检查报告.txt), written in Chinese for the site owner.
import type { Applied } from "./apply";
import { LIST_FILE, type Plan, type PlanEntry } from "./plan";

const TYPE: Record<string, string> = { skill: "技能", module: "模块", prompt: "提示词" };
const DIR: Record<string, string> = { skill: "skills", module: "modules", prompt: "prompts" };
const fmt = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short" });

function head(e: PlanEntry) {
  return `${TYPE[e.type]}「${e.title}」 ${DIR[e.type]}/${e.folder} → /${DIR[e.type]}/${e.slug}/`;
}

function details(e: PlanEntry): string[] {
  const lines: string[] = [];
  if (e.type === "module" && e.action !== "error") {
    const files = (e.input as { files?: unknown[] } | undefined)?.files?.length ?? 0;
    lines.push(`    ${files} 个代码文件 · 等级 ${e.tier} · 许可证 ${e.input?.license}${e.diagram ? ` · 结构图 ${e.diagram.file}` : ""}`);
  }
  if (e.type === "skill" && e.action !== "error") {
    lines.push(`    许可证 ${e.input?.license}${e.input?.redistribution ? "" : " · 仅索引（不保存 SKILL.md 原文）"}`);
  }
  for (const err of e.errors) lines.push(`    ✗ ${err}`);
  for (const w of e.warnings) lines.push(`    ! ${w}`);
  return lines;
}

export function planReport(plan: Plan, opts: { update?: boolean; publish?: boolean; now?: Date }): string {
  const n = (a: string) => plan.entries.filter((e) => e.action === a).length;
  const lines = [
    `批量上传检查报告  ${fmt.format(opts.now ?? new Date())}  （仅检查，没有保存任何内容）`,
    `共 ${plan.entries.length} 项：可新建 ${n("create")}，${opts.update ? `将更新 ${n("update")}` : `已存在将跳过 ${n("skip")}`}，有问题 ${n("error")}`,
    "",
  ];
  if (plan.problems.length) {
    lines.push("整体问题：", ...plan.problems.map((p) => `  ! ${p}`), "");
  }
  for (const e of plan.entries) {
    const mark = { create: "✓ 新建", update: "↻ 更新", skip: "– 跳过（已存在，加 -Update 可覆盖）", error: "✗ 有问题" }[e.action];
    lines.push(`${mark}  ${head(e)}`, ...details(e));
  }
  lines.push("");
  if (!plan.listFound && plan.entries.length) {
    lines.push(`已在你的文件夹里生成 ${LIST_FILE}：用 Excel 打开，补全“分类”等空白，保存后再检查一次。`);
  }
  if (n("error")) lines.push(`有 ${n("error")} 项需要修改。改好后再运行检查；全部通过后加 -Apply 保存。`);
  else if (plan.entries.length) lines.push(`全部通过。加 -Apply 保存为草稿${opts.publish ? "" : "（或 -Apply -Publish 直接发布）"}。`);
  return lines.join("\n") + "\n";
}

export function applyReport(results: Applied[], site: string, now = new Date()): string {
  const n = (o: string) => results.filter((r) => r.outcome === o).length;
  const lines = [
    `批量上传结果  ${fmt.format(now)}`,
    `新建 ${n("created")}，更新 ${n("updated")}，跳过 ${n("skipped")}，失败 ${n("failed")}，其中已发布 ${results.filter((r) => r.published).length}`,
    "",
  ];
  for (const r of results) {
    const mark = { created: "✓ 已新建", updated: "↻ 已更新", skipped: "– 已跳过", failed: "✗ 失败" }[r.outcome];
    const state = r.outcome === "failed" || r.outcome === "skipped" ? "" : r.published ? "（已发布）" : "（草稿）";
    lines.push(`${mark}${state}  ${head(r.entry)}`);
    if (r.id) lines.push(`    后台：${site}/admin/${DIR[r.entry.type]}/${r.id}/`);
    for (const m of r.messages) lines.push(`    ! ${m}`);
  }
  return lines.join("\n") + "\n";
}
