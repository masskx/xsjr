"use client";
// Prompt editor. Edits structured input in local state, saves through a server action with the
// row's version token (stale saves are refused), previews with the real public components.
import { useEffect, useId, useMemo, useState, useTransition, type ReactNode } from "react";
import { PromptPlayground } from "@/components/prompt-playground";
import { btn } from "@/components/admin/ui";
import type { PromptInput } from "@/lib/content/validation";
import type { PromptVariable } from "@/lib/types";
import type { SaveResult } from "@/app/admin/actions";

type VarRow = { key: string; label: string; type: PromptVariable["type"]; required: boolean; default: string; help: string; options: string };

interface Draft {
  slug: string;
  title: string;
  summary: string;
  category: string;
  tags: string;
  author: string;
  license: string;
  licenseNote: string;
  featured: boolean;
  updatedAt: string;
  verifiedAt: string;
  body: string;
  template: string;
  notes: string;
  variables: VarRow[];
}

const toDraft = (i: PromptInput): Draft => ({
  slug: i.slug,
  title: i.title,
  summary: i.summary,
  category: i.category,
  tags: i.tags.join("，"),
  author: i.author,
  license: i.license,
  licenseNote: i.licenseNote ?? "",
  featured: !!i.featured,
  updatedAt: i.updatedAt,
  verifiedAt: i.verifiedAt ?? "",
  body: i.body,
  template: i.template,
  notes: (i.notes ?? []).join("\n"),
  variables: i.variables.map((v) => ({
    key: v.key,
    label: v.label,
    type: v.type,
    required: !!v.required,
    default: v.default ?? "",
    help: v.help ?? "",
    options: (v.options ?? []).join("\n"),
  })),
});

const split = (s: string, re: RegExp) => s.split(re).map((x) => x.trim()).filter(Boolean);

function toInput(d: Draft, keep: PromptInput): PromptInput {
  return {
    ...keep, // fields this editor does not show (redistribution, sourceUrl)
    slug: d.slug,
    title: d.title,
    summary: d.summary,
    category: d.category,
    tags: split(d.tags, /[,，、\n]/),
    author: d.author,
    license: d.license,
    licenseNote: d.licenseNote || undefined,
    featured: d.featured,
    updatedAt: d.updatedAt,
    verifiedAt: d.verifiedAt || undefined,
    body: d.body,
    template: d.template,
    notes: split(d.notes, /\n/),
    variables: d.variables.map((v) => ({
      key: v.key.trim(),
      label: v.label,
      type: v.type,
      required: v.required,
      default: v.default || undefined,
      help: v.help || undefined,
      options: v.type === "select" ? split(v.options, /\n/) : undefined,
    })),
  };
}

const LABELS: Record<string, string> = {
  slug: "网址标识",
  title: "标题",
  summary: "摘要",
  category: "分类",
  tags: "标签",
  author: "作者",
  license: "许可证",
  licenseNote: "版权说明",
  updatedAt: "内容日期",
  verifiedAt: "核验日期",
  body: "正文",
  template: "模板",
  notes: "注意事项",
  variables: "变量",
};

export interface StatusControls {
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  publish: (fd: FormData) => Promise<void>;
  unpublish: (fd: FormData) => Promise<void>;
  archive: (fd: FormData) => Promise<void>;
  restore: (fd: FormData) => Promise<void>;
}

export function PromptEditor({
  id,
  initial,
  version: initialVersion,
  slugLocked,
  save,
  preview,
  controls,
}: {
  id: number;
  initial: PromptInput;
  version: string;
  slugLocked: boolean;
  save: (id: number, input: unknown, version: string) => Promise<SaveResult>;
  preview: (md: string) => Promise<string>;
  controls: StatusControls;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial));
  const [saved, setSaved] = useState<string>(() => JSON.stringify(toDraft(initial)));
  const [version, setVersion] = useState(initialVersion);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(draft) !== saved;
  const archived = controls.status === "ARCHIVED";

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setVar = (i: number, patch: Partial<VarRow>) =>
    setDraft((d) => ({ ...d, variables: d.variables.map((v, j) => (j === i ? { ...v, ...patch } : v)) }));
  const moveVar = (i: number, delta: number) =>
    setDraft((d) => {
      const vs = [...d.variables];
      const j = i + delta;
      if (j < 0 || j >= vs.length) return d;
      [vs[i], vs[j]] = [vs[j], vs[i]];
      return { ...d, variables: vs };
    });

  const onSave = () =>
    start(async () => {
      setNotice(null);
      const r = await save(id, toInput(draft, initial), version);
      if (r.ok) {
        setVersion(r.version);
        setSaved(JSON.stringify(draft));
        setErrors({});
        setNotice({ tone: "ok", text: controls.status === "PUBLISHED" ? "已保存，网站已更新。" : "已保存（草稿，网站上不可见）。" });
      } else {
        setErrors(r.errors);
        setNotice({ tone: "error", text: r.conflict ? r.errors._form : "保存失败，请修正标红的字段。" });
      }
    });

  // live preview of the playground, remounted when the schema changes
  const previewVars: PromptVariable[] = useMemo(
    () =>
      toInput(draft, initial).variables.filter((v) => v.key) as PromptVariable[],
    [draft, initial],
  );
  const previewKey = JSON.stringify([previewVars, draft.template]);
  const fieldErr = (k: string) => errors[k];
  const errorList = Object.entries(errors).filter(([k]) => k !== "_form");

  return (
    <div className="space-y-6">
      {notice && (
        <div role={notice.tone === "error" ? "alert" : "status"} className={`rounded-lg border px-3 py-2.5 text-[13.5px] ${notice.tone === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          {notice.text}
          {errorList.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-[12.5px]">
              {errorList.map(([k, m]) => (
                <li key={k}>
                  {LABELS[k.split(".")[0]] ?? k}
                  {k.startsWith("variables.") ? ` 第 ${Number(k.split(".")[1]) + 1} 个` : ""}：{m}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* sticky action bar */}
      <div className="sticky top-16 z-30 -mx-4 flex flex-wrap items-center gap-2 border-y border-zinc-200 bg-white/95 px-4 py-2.5 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <button type="button" onClick={onSave} disabled={pending || archived || !dirty} className={btn.primary}>
          {pending ? "保存中…" : controls.status === "PUBLISHED" ? "保存（立即生效）" : "保存草稿"}
        </button>
        <span className="text-[12.5px] text-zinc-500" aria-live="polite">
          {archived ? "已归档，恢复后才能编辑" : dirty ? "有未保存的修改" : "已全部保存"}
        </span>
        <span className="ml-auto flex flex-wrap gap-2">
          {controls.status === "DRAFT" && (
            <form action={controls.publish}>
              <input type="hidden" name="id" value={id} />
              <button type="submit" className={btn.secondary} disabled={dirty} title={dirty ? "先保存修改" : undefined}>
                发布
              </button>
            </form>
          )}
          {controls.status === "PUBLISHED" && (
            <form action={controls.unpublish}>
              <input type="hidden" name="id" value={id} />
              <button type="submit" className={btn.secondary} disabled={dirty}>
                取消发布
              </button>
            </form>
          )}
          {controls.status !== "ARCHIVED" ? (
            <form action={controls.archive}>
              <input type="hidden" name="id" value={id} />
              <button type="submit" className={btn.danger} disabled={dirty}>
                归档
              </button>
            </form>
          ) : (
            <form action={controls.restore}>
              <input type="hidden" name="id" value={id} />
              <button type="submit" className={btn.secondary}>
                恢复为草稿
              </button>
            </form>
          )}
        </span>
      </div>

      <fieldset disabled={archived} className="space-y-6">
        <Card title="基本信息">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="标题" value={draft.title} onChange={(v) => set("title", v)} error={fieldErr("title")} maxLength={80} />
            <Input
              label="网址标识"
              value={draft.slug}
              onChange={(v) => set("slug", v.toLowerCase())}
              error={fieldErr("slug")}
              maxLength={60}
              readOnly={slugLocked}
              hint={slugLocked ? `已发布过，固定为 /prompts/${draft.slug}/` : `网址：/prompts/${draft.slug || "…"}/`}
            />
            <div className="sm:col-span-2">
              <Input
                label="摘要"
                value={draft.summary}
                onChange={(v) => set("summary", v)}
                error={fieldErr("summary")}
                maxLength={110}
                hint={`${[...draft.summary.trim()].length} / 110 字（至少 20）`}
              />
            </div>
            <Input label="分类" value={draft.category} onChange={(v) => set("category", v)} error={fieldErr("category")} maxLength={20} />
            <Input label="标签" value={draft.tags} onChange={(v) => set("tags", v)} error={fieldErr("tags")} hint="用逗号分隔，最多 12 个" />
            <Input label="作者" value={draft.author} onChange={(v) => set("author", v)} error={fieldErr("author")} maxLength={40} />
            <Input label="许可证" value={draft.license} onChange={(v) => set("license", v)} error={fieldErr("license")} maxLength={80} hint="SPDX 标识，例如 MIT" />
            <Input label="内容日期" type="date" value={draft.updatedAt} onChange={(v) => set("updatedAt", v)} error={fieldErr("updatedAt")} hint="显示为“更新于”" />
            <Input label="核验日期（可选）" type="date" value={draft.verifiedAt} onChange={(v) => set("verifiedAt", v)} error={fieldErr("verifiedAt")} />
            <div className="sm:col-span-2">
              <Input label="版权说明（可选）" value={draft.licenseNote} onChange={(v) => set("licenseNote", v)} error={fieldErr("licenseNote")} maxLength={300} />
            </div>
            <label className="flex items-center gap-2 text-[13.5px] text-zinc-800">
              <input type="checkbox" checked={draft.featured} onChange={(e) => set("featured", e.target.checked)} className="h-4 w-4 accent-zinc-900" />
              编辑精选（显示在首页，排在列表最前）
            </label>
          </div>
        </Card>

        <Card title="正文" description="Markdown。原始 HTML 会被转义显示，不会执行。">
          <MarkdownField value={draft.body} onChange={(v) => set("body", v)} error={fieldErr("body")} preview={preview} />
        </Card>

        <Card title="提示词模板" description="用 {{变量名}} 引用下方的变量。发布时，模板里的每个变量都必须已定义。">
          <TextArea label="模板" value={draft.template} onChange={(v) => set("template", v)} error={fieldErr("template")} rows={10} mono />
        </Card>

        <Card title={`变量（${draft.variables.length}）`} description="用户在页面上填写这些变量，生成最终提示词。">
          <div className="space-y-4">
            {draft.variables.map((v, i) => (
              <div key={i} className="rounded-xl border border-zinc-200 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-medium text-zinc-500">变量 {i + 1}</span>
                  <span className="flex gap-1">
                    <button type="button" className={btn.icon} onClick={() => moveVar(i, -1)} disabled={i === 0} aria-label={`上移变量 ${i + 1}`}>
                      ↑
                    </button>
                    <button type="button" className={btn.icon} onClick={() => moveVar(i, 1)} disabled={i === draft.variables.length - 1} aria-label={`下移变量 ${i + 1}`}>
                      ↓
                    </button>
                    <button
                      type="button"
                      className={`${btn.icon} text-rose-700`}
                      onClick={() => setDraft((d) => ({ ...d, variables: d.variables.filter((_, j) => j !== i) }))}
                      aria-label={`删除变量 ${i + 1}`}
                    >
                      ×
                    </button>
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Input label="变量名" value={v.key} onChange={(x) => setVar(i, { key: x })} error={fieldErr(`variables.${i}.key`)} mono maxLength={40} hint={v.key ? `模板中写 {{${v.key}}}` : undefined} />
                  <Input label="显示名" value={v.label} onChange={(x) => setVar(i, { label: x })} error={fieldErr(`variables.${i}.label`)} maxLength={30} />
                  <SelectType value={v.type} onChange={(x) => setVar(i, { type: x })} />
                  <Input label="默认值（可选）" value={v.default} onChange={(x) => setVar(i, { default: x })} error={fieldErr(`variables.${i}.default`)} />
                  <div className="sm:col-span-2">
                    <Input label="说明（可选）" value={v.help} onChange={(x) => setVar(i, { help: x })} error={fieldErr(`variables.${i}.help`)} maxLength={200} />
                  </div>
                  {v.type === "select" && (
                    <div className="sm:col-span-3">
                      <TextArea label="选项（每行一个）" value={v.options} onChange={(x) => setVar(i, { options: x })} error={fieldErr(`variables.${i}.options`)} rows={3} />
                    </div>
                  )}
                  <label className="flex items-center gap-2 text-[13px] text-zinc-800">
                    <input type="checkbox" checked={v.required} onChange={(e) => setVar(i, { required: e.target.checked })} className="h-4 w-4 accent-zinc-900" />
                    必填
                  </label>
                </div>
              </div>
            ))}
            {fieldErr("variables") && <p className="text-[12.5px] text-rose-700">{fieldErr("variables")}</p>}
            <button
              type="button"
              className={btn.secondary}
              onClick={() => setDraft((d) => ({ ...d, variables: [...d.variables, { key: "", label: "", type: "text", required: false, default: "", help: "", options: "" }] }))}
            >
              添加变量
            </button>
          </div>
        </Card>

        <Card title="使用注意（可选）" description="每行一条，显示在提示词页面的黄色提示框里。">
          <TextArea label="注意事项" value={draft.notes} onChange={(v) => set("notes", v)} error={fieldErr("notes")} rows={4} />
        </Card>
      </fieldset>

      <Card title="预览" description="和网站上的效果一致（尚未保存的修改也会显示）。">
        <PromptPlayground key={previewKey} template={draft.template} variables={previewVars} />
      </Card>
    </div>
  );
}

// ── small field components ──

function Card({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
      <h2 className="text-[15px] font-semibold text-zinc-900">{title}</h2>
      {description && <p className="mt-1 text-[12.5px] leading-5 text-zinc-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

const inputCls = (error?: string, mono?: boolean) =>
  `block w-full rounded-lg border bg-white px-3 py-2 text-[13.5px] text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 read-only:bg-zinc-50 read-only:text-zinc-500 ${mono ? "font-mono" : ""} ${error ? "border-rose-400" : "border-zinc-300 focus-visible:border-zinc-500"}`;

function Help({ id, error, hint }: { id: string; error?: string; hint?: string }) {
  if (error) return <p id={`${id}-err`} className="mt-1 text-[12px] text-rose-700">{error}</p>;
  if (hint) return <p id={`${id}-hint`} className="mt-1 text-[12px] text-zinc-500">{hint}</p>;
  return null;
}

function Input(props: { label: string; value: string; onChange: (v: string) => void; error?: string; hint?: string; maxLength?: number; type?: string; readOnly?: boolean; mono?: boolean }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[12.5px] font-medium text-zinc-700">
        {props.label}
      </label>
      <input
        id={id}
        type={props.type ?? "text"}
        value={props.value}
        maxLength={props.maxLength}
        readOnly={props.readOnly}
        onChange={(e) => props.onChange(e.target.value)}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={props.error ? `${id}-err` : props.hint ? `${id}-hint` : undefined}
        className={inputCls(props.error, props.mono)}
      />
      <Help id={id} error={props.error} hint={props.hint} />
    </div>
  );
}

function TextArea(props: { label: string; value: string; onChange: (v: string) => void; error?: string; rows?: number; mono?: boolean }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {props.label}
      </label>
      <textarea
        id={id}
        value={props.value}
        rows={props.rows ?? 6}
        onChange={(e) => props.onChange(e.target.value)}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={props.error ? `${id}-err` : undefined}
        className={`${inputCls(props.error, props.mono)} leading-6`}
      />
      <Help id={id} error={props.error} />
    </div>
  );
}

function SelectType({ value, onChange }: { value: VarRow["type"]; onChange: (v: VarRow["type"]) => void }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[12.5px] font-medium text-zinc-700">
        类型
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as VarRow["type"])} className={inputCls()}>
        <option value="text">单行文本</option>
        <option value="textarea">多行文本</option>
        <option value="select">下拉选择</option>
        <option value="boolean">是/否</option>
      </select>
    </div>
  );
}

function MarkdownField({ value, onChange, error, preview }: { value: string; onChange: (v: string) => void; error?: string; preview: (md: string) => Promise<string> }) {
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [html, setHtml] = useState("");
  const [loading, startPreview] = useTransition();
  const show = (t: "edit" | "preview") => {
    setTab(t);
    if (t === "preview") startPreview(async () => setHtml(await preview(value)));
  };
  return (
    <div>
      <div role="tablist" aria-label="正文编辑方式" className="mb-2 flex gap-1">
        {(["edit", "preview"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => show(t)}
            className={`rounded-md px-2.5 py-1 text-[12.5px] ${tab === t ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"}`}
          >
            {t === "edit" ? "编辑" : "预览"}
          </button>
        ))}
      </div>
      {tab === "edit" ? (
        <TextArea label="正文" value={value} onChange={onChange} error={error} rows={12} mono />
      ) : (
        <div className="min-h-32 rounded-lg border border-zinc-200 p-4">
          {loading ? <p className="text-[13px] text-zinc-400">渲染中…</p> : value.trim() ? <div className="md" dangerouslySetInnerHTML={{ __html: html }} /> : <p className="text-[13px] text-zinc-400">（正文为空）</p>}
        </div>
      )}
    </div>
  );
}
