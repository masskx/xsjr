"use client";
// Shared building blocks for the admin editors (prompts, modules, skills).
import { useEffect, useId, useState, useTransition, type ReactNode } from "react";
import { btn } from "@/components/admin/ui";

// ── small field components ──

export function Card({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
      <h2 className="text-[15px] font-semibold text-zinc-900">{title}</h2>
      {description && <p className="mt-1 text-[12.5px] leading-5 text-zinc-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export const inputCls = (error?: string, mono?: boolean) =>
  `block w-full rounded-lg border bg-white px-3 py-2 text-[13.5px] text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 read-only:bg-zinc-50 read-only:text-zinc-500 ${mono ? "font-mono" : ""} ${error ? "border-rose-400" : "border-zinc-300 focus-visible:border-zinc-500"}`;

export function Help({ id, error, hint }: { id: string; error?: string; hint?: string }) {
  if (error) return <p id={`${id}-err`} className="mt-1 text-[12px] text-rose-700">{error}</p>;
  if (hint) return <p id={`${id}-hint`} className="mt-1 text-[12px] text-zinc-500">{hint}</p>;
  return null;
}

export function Input(props: { label: string; value: string; onChange: (v: string) => void; error?: string; hint?: string; maxLength?: number; type?: string; readOnly?: boolean; mono?: boolean }) {
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

export function TextArea(props: { label: string; value: string; onChange: (v: string) => void; error?: string; rows?: number; mono?: boolean }) {
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

export function MarkdownField({ value, onChange, error, preview }: { value: string; onChange: (v: string) => void; error?: string; preview: (md: string) => Promise<string> }) {
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

export function Select({ label, value, onChange, options, error }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; error?: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[12.5px] font-medium text-zinc-700">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls(error)} aria-invalid={error ? true : undefined}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Help id={id} error={error} />
    </div>
  );
}

/** A list edited as "one item per line". */
export function LinesField({ label, value, onChange, error, rows = 4, hint, mono }: { label: string; value: string; onChange: (v: string) => void; error?: string; rows?: number; hint?: string; mono?: boolean }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[12.5px] font-medium text-zinc-700">
        {label}
      </label>
      <textarea id={id} value={value} rows={rows} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined} className={`${inputCls(error, mono)} leading-6`} />
      <Help id={id} error={error} hint={hint ?? "每行一条"} />
    </div>
  );
}

export const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
export const splitTags = (s: string) => s.split(/[,，、\n]/).map((x) => x.trim()).filter(Boolean);

// ── fields shared by every resource type ──

export interface CommonDraft {
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
  applicableTasks: string;
  body: string;
}

export interface CommonInputLike {
  slug: string;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  author: string;
  license: string;
  licenseNote?: string;
  featured?: boolean;
  updatedAt: string;
  verifiedAt?: string;
  applicableTasks?: string[];
  body: string;
}

export const commonToDraft = (i: CommonInputLike): CommonDraft => ({
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
  applicableTasks: (i.applicableTasks ?? []).join("\n"),
  body: i.body,
});

export const draftToCommon = (d: CommonDraft) => ({
  slug: d.slug,
  title: d.title,
  summary: d.summary,
  category: d.category,
  tags: splitTags(d.tags),
  author: d.author,
  license: d.license,
  licenseNote: d.licenseNote || undefined,
  featured: d.featured,
  updatedAt: d.updatedAt,
  verifiedAt: d.verifiedAt || undefined,
  applicableTasks: lines(d.applicableTasks),
  body: d.body,
});

export function CommonFields({
  draft,
  set,
  errors,
  slugLocked,
  urlPrefix,
}: {
  draft: CommonDraft;
  set: <K extends keyof CommonDraft>(k: K, v: CommonDraft[K]) => void;
  errors: Record<string, string>;
  slugLocked: boolean;
  urlPrefix: string;
}) {
  return (
    <Card title="基本信息">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="标题" value={draft.title} onChange={(v) => set("title", v)} error={errors.title} maxLength={80} />
        <Input
          label="网址标识"
          value={draft.slug}
          onChange={(v) => set("slug", v.toLowerCase())}
          error={errors.slug}
          maxLength={60}
          readOnly={slugLocked}
          hint={slugLocked ? `已发布过，固定为 ${urlPrefix}${draft.slug}/` : `网址：${urlPrefix}${draft.slug || "…"}/`}
        />
        <div className="sm:col-span-2">
          <Input label="摘要" value={draft.summary} onChange={(v) => set("summary", v)} error={errors.summary} maxLength={110} hint={`${[...draft.summary.trim()].length} / 110 字（至少 20）`} />
        </div>
        <Input label="分类" value={draft.category} onChange={(v) => set("category", v)} error={errors.category} maxLength={20} />
        <Input label="标签" value={draft.tags} onChange={(v) => set("tags", v)} error={errors.tags} hint="用逗号分隔，最多 12 个" />
        <Input label="作者" value={draft.author} onChange={(v) => set("author", v)} error={errors.author} maxLength={40} />
        <Input label="许可证" value={draft.license} onChange={(v) => set("license", v)} error={errors.license} maxLength={80} hint="SPDX 标识，例如 MIT" />
        <Input label="内容日期" type="date" value={draft.updatedAt} onChange={(v) => set("updatedAt", v)} error={errors.updatedAt} hint="显示为“更新于”" />
        <Input label="核验日期（可选）" type="date" value={draft.verifiedAt} onChange={(v) => set("verifiedAt", v)} error={errors.verifiedAt} />
        <div className="sm:col-span-2">
          <Input label="版权说明（可选）" value={draft.licenseNote} onChange={(v) => set("licenseNote", v)} error={errors.licenseNote} maxLength={300} />
        </div>
        <div className="sm:col-span-2">
          <LinesField label="适用任务" value={draft.applicableTasks} onChange={(v) => set("applicableTasks", v)} error={errors.applicableTasks} rows={4} hint="每行一条，例如“两组独立样本的均值比较”。最多 12 条，显示在卡片和详情页。" />
        </div>
        <label className="flex items-center gap-2 text-[13.5px] text-zinc-800">
          <input type="checkbox" checked={draft.featured} onChange={(e) => set("featured", e.target.checked)} className="h-4 w-4 accent-zinc-900" />
          编辑精选（显示在首页，排在列表最前）
        </label>
      </div>
    </Card>
  );
}

// ── shell: notices, error list, sticky action bar ──

export interface StatusControls {
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  publish: (fd: FormData) => Promise<void>;
  unpublish: (fd: FormData) => Promise<void>;
  archive: (fd: FormData) => Promise<void>;
  restore: (fd: FormData) => Promise<void>;
}

export type SaveFn = (id: number, input: unknown, version: string) => Promise<{ ok: true; version: string } | { ok: false; errors: Record<string, string>; conflict?: boolean }>;

const FIELD_LABELS: Record<string, string> = {
  slug: "网址标识", title: "标题", summary: "摘要", category: "分类", tags: "标签", author: "作者", license: "许可证",
  licenseNote: "版权说明", updatedAt: "内容日期", verifiedAt: "核验日期", body: "正文", applicableTasks: "适用任务",
  files: "代码文件", entry: "入口文件", language: "语言", env: "环境要求", dependencies: "依赖", usage: "用法",
  compat: "兼容性", risks: "风险提示", skillMd: "SKILL.md",
};

/** Owns save state and renders notices + the sticky action bar around an editor body. */
export function useEditor<D>(initial: D, initialVersion: string, id: number, save: SaveFn, toInput: (d: D) => unknown, published: boolean) {
  const [draft, setDraft] = useState<D>(initial);
  const [saved, setSaved] = useState(() => JSON.stringify(initial));
  const [version, setVersion] = useState(initialVersion);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(draft) !== saved;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const onSave = () =>
    start(async () => {
      setNotice(null);
      const r = await save(id, toInput(draft), version);
      if (r.ok) {
        setVersion(r.version);
        setSaved(JSON.stringify(draft));
        setErrors({});
        setNotice({ tone: "ok", text: published ? "已保存，网站已更新。" : "已保存（草稿，网站上不可见）。" });
      } else {
        setErrors(r.errors);
        setNotice({ tone: "error", text: r.conflict ? r.errors._form : "保存失败，请修正标红的字段。" });
      }
    });

  return { draft, setDraft, errors, notice, pending, dirty, onSave };
}

export function EditorShell({
  id,
  controls,
  dirty,
  pending,
  onSave,
  notice,
  errors,
  children,
}: {
  id: number;
  controls: StatusControls;
  dirty: boolean;
  pending: boolean;
  onSave: () => void;
  notice: { tone: "ok" | "error"; text: string } | null;
  errors: Record<string, string>;
  children: ReactNode;
}) {
  const archived = controls.status === "ARCHIVED";
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
                  {FIELD_LABELS[k.split(".")[0]] ?? k}
                  {/^\w+\.\d+/.test(k) ? ` 第 ${Number(k.split(".")[1]) + 1} 项` : ""}：{m}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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
          {!archived ? (
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
        {children}
      </fieldset>
    </div>
  );
}
