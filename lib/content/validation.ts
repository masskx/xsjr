// Validation rules for resource content, shared by the file importer, the admin editor and (in
// slice 7) the ingestion pipeline. Lengths count Unicode code points, like PostgreSQL's
// char_length, so the database CHECK constraints and these rules always agree.
// Messages are user-facing (Simplified Chinese) and name the field.
import { z } from "zod";

const len = (s: string) => [...s].length;
const text = (label: string, min: number, max: number) =>
  z
    .string()
    .transform((s) => s.trim())
    .refine((s) => len(s) >= min, `${label}至少 ${min} 个字`)
    .refine((s) => len(s) <= max, `${label}不能超过 ${max} 个字`);
const optionalText = (label: string, max: number) =>
  z
    .string()
    .transform((s) => s.trim())
    .refine((s) => len(s) <= max, `${label}不能超过 ${max} 个字`)
    .transform((s) => (s === "" ? undefined : s))
    .optional();

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const slugSchema = z
  .string()
  .trim()
  .min(2, "网址标识至少 2 个字符")
  .max(60, "网址标识不能超过 60 个字符")
  .regex(SLUG_RE, "网址标识只能用小写字母、数字和连字符，例如 abstract-polish");

const isoDate = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label}格式应为 YYYY-MM-DD`)
    .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), `${label}不是有效日期`);

export const baseMetaSchema = z.object({
  title: text("标题", 2, 80),
  summary: text("摘要", 20, 110),
  category: text("分类", 1, 20),
  tags: z
    .array(text("标签", 1, 20))
    .max(12, "标签最多 12 个")
    .refine((t) => new Set(t).size === t.length, "标签不能重复"),
  author: text("作者", 1, 40),
  license: text("许可证", 1, 80),
  licenseNote: optionalText("版权说明", 300),
  redistribution: z.boolean(),
  /** "PRO" is the Phase 1 spelling of the first paid tier; the importer maps it to EI */
  tier: z.enum(["FREE", "PRO", "EI", "SCI"], { message: "会员等级只能是 FREE、EI 或 SCI" }).optional(),
  sourceUrl: z.string().trim().url("来源链接不是有效网址").refine((u) => /^https?:\/\//i.test(u), "来源链接必须以 http(s):// 开头").optional(),
  featured: z.boolean().optional(),
  updatedAt: isoDate("更新日期"),
  verifiedAt: isoDate("核验日期").optional(),
  applicableTasks: z.array(text("适用任务", 1, 80)).max(12, "适用任务最多 12 条").optional(),
  /** admin editor only: "I checked the source licence allows redistribution" (never stored as such) */
  licenseDeclared: z.boolean().optional(),
});

const shortList = (label: string, maxItems: number, maxLen: number) =>
  z.array(text(label, 1, maxLen)).max(maxItems, `${label}最多 ${maxItems} 条`);

export const moduleFieldsSchema = z.object({
  language: text("语言", 1, 30),
  entry: z.string().trim().min(1, "请填写入口文件").max(200),
  env: shortList("环境要求", 12, 120),
  dependencies: shortList("依赖", 20, 120).optional(),
  usage: shortList("用法", 20, 500).optional(),
});

export const skillFieldsSchema = z.object({
  compat: z
    .array(
      z.object({
        tool: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,29}$/, "工具标识只能用小写字母、数字和连字符"),
        supportedRange: text("支持范围", 1, 80),
        installPath: optionalText("安装路径", 200),
        note: optionalText("备注", 200),
      }),
    )
    .max(12, "兼容性最多 12 行")
    .refine((rows) => new Set(rows.map((r) => r.tool)).size === rows.length, "同一工具只能出现一次"),
  files: z
    .array(z.object({ path: z.string().trim().min(1).max(200), size: z.number().int().nonnegative().optional(), desc: optionalText("文件说明", 200) }))
    .max(50, "文件最多 50 个"),
  risks: shortList("风险提示", 10, 200).optional(),
  dependencies: shortList("依赖", 20, 120).optional(),
});

export const siteFieldsSchema = z.object({
  url: z.string().trim().url("网址无效").refine((u) => /^https?:\/\//.test(u), "网址必须以 http(s):// 开头"),
  pricing: z.enum(["免费", "部分免费", "付费", "机构订阅"], { message: "收费方式无效" }),
  region: optionalText("地区", 40),
  loginRequired: z.boolean().optional(),
  isPromotion: z.boolean().optional(),
});

export const VAR_KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_]{0,39}$/;

export const promptVariableSchema = z
  .object({
    key: z.string().trim().regex(VAR_KEY_RE, "变量名只能用字母、数字和下划线，且不能以数字开头"),
    label: text("变量显示名", 1, 30),
    type: z.enum(["text", "textarea", "select", "boolean"], { message: "变量类型无效" }),
    required: z.boolean().optional(),
    default: optionalText("默认值", 500),
    help: optionalText("说明", 200),
    options: z.array(text("选项", 1, 50)).max(20, "选项最多 20 个").optional(),
  })
  .superRefine((v, ctx) => {
    if (v.type === "select" && (!v.options || v.options.length < 2)) {
      ctx.addIssue({ code: "custom", message: `变量 ${v.key}：下拉选择至少需要 2 个选项`, path: ["options"] });
    }
    if (v.type === "select" && v.default && v.options && !v.options.includes(v.default)) {
      ctx.addIssue({ code: "custom", message: `变量 ${v.key}：默认值必须是选项之一`, path: ["default"] });
    }
  });

export const promptFieldsSchema = z.object({
  variables: z
    .array(promptVariableSchema)
    .max(20, "变量最多 20 个")
    .refine((vs) => new Set(vs.map((v) => v.key)).size === vs.length, "变量名不能重复"),
  notes: z.array(text("注意事项", 1, 200)).max(10, "注意事项最多 10 条").optional(),
});

/** Everything the admin editor submits for a prompt. */
export const promptInputSchema = baseMetaSchema.extend({
  slug: slugSchema,
  body: z.string().max(50_000, "正文不能超过 50000 个字符"),
  template: z.string().max(20_000, "模板不能超过 20000 个字符").refine((s) => s.trim().length > 0, "模板不能为空"),
  ...promptFieldsSchema.shape,
});
export type PromptInput = z.infer<typeof promptInputSchema>;

/** {{ key }} placeholders used in a template. */
export function placeholders(template: string): string[] {
  return [...new Set([...template.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((m) => m[1]))];
}

/** Publishing rule: every placeholder must be a declared variable. Returns problems (empty = ok). */
export function templateProblems(template: string, variables: { key: string }[]): string[] {
  const keys = new Set(variables.map((v) => v.key));
  return placeholders(template)
    .filter((p) => !keys.has(p))
    .map((p) => `模板里的 {{${p}}} 没有对应的变量`);
}

/** First issue per field, as { path: message }, for inline form errors. */
export function issuesByField(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    out[key] ??= issue.message;
  }
  return out;
}
