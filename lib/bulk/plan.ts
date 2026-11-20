// Merge what the scanner found with the batch list (清单.csv), apply the defaults and the licence
// rules, and validate every item with the same schemas as the back-office editors. Nothing is
// written here: the plan says, per item, create / update / skip / error and why.
import fs from "node:fs";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client";
import * as s from "../db/schema";
import { issuesByField } from "../content/validation";
import { moduleAdapter, type ModuleInput } from "../admin/modules";
import { skillAdapter, type SkillInput } from "../admin/skills";
import { todayShanghai } from "../admin/resources";
import { canonicalSpdx, PERMISSIVE, UNKNOWN_LICENSE_LABEL } from "../ingest/license";
import { normalizeSourceUrl } from "../ingest/url";
import { csvRecords, decodeCsv, toCsv } from "./csv";
import type { ItemType, ScannedItem } from "./scan";

export const LIST_FILE = "清单.csv";

/** canonical key -> accepted header names; the first Chinese name is what we write */
export const COLUMNS: Record<string, string[]> = {
  type: ["类型"],
  folder: ["文件夹"],
  slug: ["网址标识"],
  title: ["标题"],
  summary: ["摘要"],
  category: ["分类"],
  tags: ["标签"],
  tier: ["会员等级", "等级"],
  author: ["作者"],
  license: ["许可证"],
  sourceUrl: ["来源链接", "来源"],
  language: ["语言"],
  entry: ["入口文件"],
  env: ["环境要求"],
  dependencies: ["依赖"],
  compat: ["兼容工具"],
  tasks: ["适用任务"],
  featured: ["精选"],
};
const FIELD_LABEL: Record<string, string> = {
  slug: "网址标识", title: "标题", summary: "摘要", category: "分类", tags: "标签", author: "作者", license: "许可证",
  sourceUrl: "来源链接", language: "语言", entry: "入口文件", env: "环境要求", dependencies: "依赖", compat: "兼容工具",
  applicableTasks: "适用任务", files: "文件", skillMd: "SKILL.md", body: "正文", licenseNote: "版权说明", tier: "会员等级",
};

const TYPE_WORDS: Record<string, ItemType> = { skill: "skill", skills: "skill", 技能: "skill", module: "module", modules: "module", 模块: "module" };
const TYPE_LABEL: Record<ItemType, string> = { skill: "技能", module: "模块" };
const DEFAULT_ENV: Record<string, string[]> = { Python: ["Python 3.9+"], R: ["R 4.0+"], MATLAB: ["MATLAB R2020a+"], Julia: ["Julia 1.6+"] };

const splitList = (v: string | undefined, sep = /[、，,;；\n]+/) => (v ?? "").split(sep).map((x) => x.trim()).filter(Boolean);
const yes = (v: string | undefined) => /^(是|y|yes|true|1|✓)$/i.test((v ?? "").trim());

export type Action = "create" | "update" | "skip" | "error";
export interface PlanEntry {
  type: ItemType;
  folder: string;
  slug: string;
  title: string;
  action: Action;
  input?: SkillInput | ModuleInput;
  tier: string;
  licenseSource: "PLATFORM" | "ADMIN_DECLARED" | "UNKNOWN";
  diagram?: { file: string; bytes: Buffer };
  existingId?: number;
  errors: string[];
  warnings: string[];
}

export interface Plan {
  entries: PlanEntry[];
  problems: string[];
  /** a filled-in 清单.csv to write when the batch has none */
  suggestedList?: Buffer;
  listFound: boolean;
}

export function readList(root: string): { records: Map<string, Record<string, string>>; problems: string[]; found: boolean } {
  const file = path.join(root, LIST_FILE);
  const records = new Map<string, Record<string, string>>();
  if (!fs.existsSync(file)) return { records, problems: [], found: false };
  const problems: string[] = [];
  const { records: rows, unknownColumns } = csvRecords(decodeCsv(fs.readFileSync(file)), COLUMNS);
  if (unknownColumns.length) problems.push(`${LIST_FILE}：未识别的列 ${unknownColumns.join("、")}（已忽略）`);
  rows.forEach((r, i) => {
    const type = TYPE_WORDS[(r.type ?? "").toLowerCase()];
    if (!type || !r.folder) {
      problems.push(`${LIST_FILE} 第 ${i + 2} 行：需要“类型”（技能/模块）和“文件夹”`);
      return;
    }
    const key = `${type}/${r.folder}`;
    if (records.has(key)) problems.push(`${LIST_FILE}：${TYPE_LABEL[type]}“${r.folder}”出现了两次`);
    records.set(key, r);
  });
  return { records, problems, found: true };
}

export function suggestedList(items: ScannedItem[]): Buffer {
  const header = Object.values(COLUMNS).map((names) => names[0]);
  const rows = items.map((it) => {
    const row: Record<string, string> = {
      type: TYPE_LABEL[it.type],
      folder: it.folder,
      slug: it.slug,
      title: it.title ?? "",
      summary: it.summary ?? "",
      tier: it.type === "module" ? "FREE" : "",
      author: "平台原创",
      language: it.language ?? "",
      entry: it.entry ?? "",
      dependencies: (it.dependencies ?? []).join("；"),
      compat: it.type === "skill" ? "claude-code" : "",
    };
    return Object.keys(COLUMNS).map((k) => row[k] ?? "");
  });
  return toCsv([header, ...rows]);
}

export interface PlanOptions {
  update?: boolean;
  publish?: boolean;
  now?: Date;
}

export async function buildPlan(db: Db, root: string, items: ScannedItem[], scanProblems: string[], opts: PlanOptions = {}): Promise<Plan> {
  const list = readList(root);
  const problems = [...scanProblems, ...list.problems];
  const keys = new Set(items.map((i) => `${i.type}/${i.folder}`));
  for (const k of list.records.keys()) if (!keys.has(k)) problems.push(`${LIST_FILE}：找不到“${k}”对应的文件夹（已忽略这一行）`);

  const activeTiers = new Set((await db.select({ code: s.tiers.code }).from(s.tiers).where(eq(s.tiers.isActive, true))).map((t) => t.code));
  const entries: PlanEntry[] = items.map((it) => planItem(it, list.records.get(`${it.type}/${it.folder}`) ?? {}, activeTiers, opts));

  // slugs: unique within the batch, and against the database
  const bySlug = new Map<string, PlanEntry[]>();
  for (const e of entries) bySlug.set(e.slug, [...(bySlug.get(e.slug) ?? []), e]);
  for (const [slug, es] of bySlug) if (es.length > 1) for (const e of es) e.errors.push(`网址标识“${slug}”在这批里重复（${es.map((x) => x.folder).join("、")}）`);
  const slugs = [...bySlug.keys()].filter(Boolean);
  const existing = slugs.length
    ? await db.select({ id: s.resources.id, slug: s.resources.slug, type: s.resources.type, status: s.resources.status }).from(s.resources).where(inArray(s.resources.slug, slugs))
    : [];
  const norms = entries.map((e) => (e.input?.sourceUrl ? normalizeSourceUrl(e.input.sourceUrl) : null)).filter((n): n is string => !!n);
  const usedSources = norms.length
    ? await db.select({ slug: s.resources.slug, norm: s.resources.sourceUrlNorm }).from(s.resources).where(inArray(s.resources.sourceUrlNorm, norms))
    : [];
  for (const e of entries) {
    const hit = existing.find((x) => x.slug === e.slug);
    if (hit) {
      const want = e.type === "skill" ? "SKILL" : "MODULE";
      if (hit.type !== want) e.errors.push(`网址标识“${e.slug}”已被其他类型的资源使用`);
      else if (hit.status === "ARCHIVED") e.errors.push(`网址标识“${e.slug}”属于一条已归档的资源；先在后台恢复，或换一个网址标识`);
      else e.existingId = hit.id;
    }
    const norm = e.input?.sourceUrl ? normalizeSourceUrl(e.input.sourceUrl) : null;
    const used = norm && usedSources.find((u) => u.norm === norm && u.slug !== e.slug);
    if (used) e.errors.push(`来源链接已被“${used.slug}”收录`);
    e.action = e.errors.length ? "error" : e.existingId ? (opts.update ? "update" : "skip") : "create";
  }
  return { entries, problems, listFound: list.found, suggestedList: list.found ? undefined : suggestedList(items) };
}

function planItem(it: ScannedItem, row: Record<string, string>, activeTiers: Set<string>, opts: PlanOptions): PlanEntry {
  const errors = [...it.errors];
  const warnings = [...it.warnings];
  const pick = (k: string, fallback?: string) => (row[k]?.trim() ? row[k].trim() : fallback);
  const slug = pick("slug", it.slug) ?? "";
  const title = pick("title", it.title) ?? "";
  const summary = pick("summary", it.summary) ?? "";
  const category = pick("category") ?? "";
  // fields reported here are not reported again by the schema
  const reported = new Set<string>();
  const missing = (field: string, msg: string) => {
    reported.add(field);
    errors.push(msg);
  };
  if (!category) missing("category", `分类：请在 ${LIST_FILE} 填写`);
  if (!title) missing("title", `标题：请在 ${LIST_FILE} 填写`);
  if (!summary) missing("summary", `摘要：请在 ${LIST_FILE} 填写（20–110 字）`);

  // tier
  let tier = (pick("tier", "FREE") ?? "FREE").toUpperCase();
  if (tier === "PRO" || tier === "免费") tier = tier === "PRO" ? "EI" : "FREE";
  if (it.type === "skill" && tier !== "FREE") {
    errors.push("会员等级：Skills 始终免费，请留空或填 FREE");
    tier = "FREE";
  } else if (!activeTiers.has(tier)) {
    errors.push(`会员等级“${tier}”无效（可用：${[...activeTiers].join("、")}）`);
    tier = "FREE";
  }

  // licence: own work by default; a source link marks third-party content
  const sourceUrl = pick("sourceUrl");
  let license: string;
  let licenseSource: PlanEntry["licenseSource"] = "PLATFORM";
  let redistribution = true;
  if (!sourceUrl) {
    license = pick("license") ?? (tier === "FREE" ? "MIT" : "All rights reserved");
    if (tier !== "FREE" && PERMISSIVE.has(canonicalSpdx(license) ?? "")) {
      warnings.push(`会员模块使用 ${license} 许可证：拿到代码的人可以合法转载。会员内容建议用“All rights reserved”或自拟会员许可`);
    }
  } else {
    const declared = pick("license");
    const spdx = declared ? canonicalSpdx(declared) : null;
    const permissive = !!spdx && PERMISSIVE.has(spdx);
    if (it.type === "module" && !permissive) {
      errors.push(declared ? `第三方代码的许可证“${declared}”不允许本站转载代码（只接受 ${[...PERMISSIVE].join("、")}）` : "第三方代码必须在清单中填写许可证（如 MIT）");
    }
    license = declared ?? UNKNOWN_LICENSE_LABEL;
    licenseSource = declared ? "ADMIN_DECLARED" : "UNKNOWN";
    redistribution = permissive;
    if (it.type === "skill" && !permissive) warnings.push("第三方 Skill 的许可证不允许转载或未填写：只建索引（不保存 SKILL.md 原文，详情页链接到来源）");
  }

  const common = {
    slug,
    title,
    summary,
    category,
    tags: splitList(row.tags),
    author: pick("author", "平台原创")!,
    license,
    redistribution,
    sourceUrl,
    featured: yes(row.featured),
    updatedAt: todayShanghai(opts.now),
    applicableTasks: splitList(row.tasks, /[\n;；]+/).length ? splitList(row.tasks, /[\n;；]+/) : undefined,
    body: pick("summary") || it.bodyAfterSummary === undefined ? it.body : it.bodyAfterSummary,
    licenseDeclared: licenseSource === "ADMIN_DECLARED" ? true : undefined,
  };

  let input: SkillInput | ModuleInput | undefined;
  const validate = <I>(adapter: { schema: { safeParse(v: unknown): { success: true; data: I } | { success: false; error: Parameters<typeof issuesByField>[0] } }; publishProblems?(i: I): Record<string, string> }, raw: unknown) => {
    const parsed = adapter.schema.safeParse(raw);
    if (!parsed.success) {
      for (const [k, msg] of Object.entries(issuesByField(parsed.error))) if (!reported.has(k.split(".")[0])) errors.push(`${FIELD_LABEL[k.split(".")[0]] ?? k}：${msg}`);
      return undefined;
    }
    if (opts.publish) for (const [k, msg] of Object.entries(adapter.publishProblems?.(parsed.data) ?? {})) errors.push(`发布前需要：${FIELD_LABEL[k] ?? k}：${msg}`);
    return parsed.data;
  };
  if (it.type === "skill") {
    const compat = splitList(row.compat).map((tool) => ({ tool: tool.toLowerCase(), supportedRange: "当前版本" }));
    if (it.skillMd !== undefined) {
      input = validate<SkillInput>(skillAdapter as never, {
        ...common,
        skillMd: it.skillMd,
        compat: compat.length ? compat : [{ tool: "claude-code", supportedRange: "当前版本" }],
        files: it.files.map((f) => ({ path: f.path, size: f.size })),
        dependencies: splitList(row.dependencies).length ? splitList(row.dependencies) : undefined,
      });
    }
  } else if (it.files.length) {
    const language = pick("language", it.language) ?? "";
    if (!language) errors.push(`语言：无法从文件判断，请在 ${LIST_FILE} 填写`);
    const entry = pick("entry", it.entry) ?? "";
    if (!entry) errors.push(`入口文件：请在 ${LIST_FILE} 填写`);
    const env = splitList(row.env, /[\n;；]+/);
    const deps = splitList(row.dependencies);
    if (language && entry) {
      input = validate<ModuleInput>(moduleAdapter as never, {
        ...common,
        language,
        entry,
        env: env.length ? env : (DEFAULT_ENV[language] ?? []),
        dependencies: deps.length ? deps : it.dependencies?.length ? it.dependencies : undefined,
        files: it.files.map((f) => ({ path: f.path, content: f.content ?? "" })),
      });
    }
    if (it.diagram === undefined) warnings.push("没有结构图：详情页会显示自动生成的文件树");
  }

  return {
    type: it.type,
    folder: it.folder,
    slug,
    title: title || it.folder,
    action: "error",
    input,
    tier,
    licenseSource,
    diagram: it.diagram,
    errors: [...new Set(errors)],
    warnings,
  };
}
