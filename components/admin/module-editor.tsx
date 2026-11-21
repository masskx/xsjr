"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  Card,
  CommonFields,
  EditorShell,
  Input,
  LinesField,
  MarkdownField,
  Select,
  TextArea,
  commonToDraft,
  draftToCommon,
  lines,
  useEditor,
  type CommonDraft,
  type SaveFn,
  type StatusControls,
} from "@/components/admin/editor-kit";
import { btn } from "@/components/admin/ui";
import type { ModuleInput } from "@/lib/admin/modules";
import type { AdminFormState } from "@/app/admin/actions";

interface ModuleDraft extends CommonDraft {
  language: string;
  entry: string;
  env: string;
  dependencies: string;
  usage: string;
  files: { path: string; content: string }[];
}

const toDraft = (i: ModuleInput): ModuleDraft => ({
  ...commonToDraft(i),
  language: i.language,
  entry: i.entry.replace(/^files\//, ""),
  env: i.env.join("\n"),
  dependencies: (i.dependencies ?? []).join("\n"),
  usage: (i.usage ?? []).join("\n"),
  files: i.files.map((f) => ({ path: f.path, content: f.content })),
});

export function ModuleEditor({
  id,
  initial,
  version,
  slugLocked,
  save,
  preview,
  controls,
  diagram,
  uploadDiagram,
  removeDiagram,
}: {
  id: number;
  initial: ModuleInput;
  version: string;
  slugLocked: boolean;
  save: SaveFn;
  preview: (md: string) => Promise<string>;
  controls: StatusControls;
  diagram: { src: string; width: number | null; height: number | null; alt: string | null; bytes: number } | null;
  uploadDiagram: (state: AdminFormState, fd: FormData) => Promise<AdminFormState>;
  removeDiagram: (fd: FormData) => Promise<void>;
}) {
  const toInput = (d: ModuleDraft): unknown => ({
    ...initial, // fields this editor does not show (redistribution, sourceUrl)
    ...draftToCommon(d),
    language: d.language,
    entry: `files/${d.entry}`,
    env: lines(d.env),
    dependencies: lines(d.dependencies),
    usage: lines(d.usage),
    files: d.files.map((f) => ({ path: f.path.trim(), content: f.content })),
  });
  const ed = useEditor(toDraft(initial), version, id, save, toInput, controls.status === "PUBLISHED");
  const { draft, setDraft, errors } = ed;
  const set = <K extends keyof ModuleDraft>(k: K, v: ModuleDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setCommon = <K extends keyof CommonDraft>(k: K, v: CommonDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setFile = (i: number, patch: Partial<{ path: string; content: string }>) =>
    setDraft((d) => ({ ...d, files: d.files.map((f, j) => (j === i ? { ...f, ...patch } : f)) }));
  const moveFile = (i: number, delta: number) =>
    setDraft((d) => {
      const fs = [...d.files];
      const j = i + delta;
      if (j < 0 || j >= fs.length) return d;
      [fs[i], fs[j]] = [fs[j], fs[i]];
      return { ...d, files: fs };
    });

  return (
    <EditorShell id={id} controls={controls} dirty={ed.dirty} pending={ed.pending} onSave={ed.onSave} notice={ed.notice} errors={errors}>
      <DiagramCard id={id} diagram={diagram} upload={uploadDiagram} remove={removeDiagram} />

      <CommonFields draft={draft} set={setCommon} errors={errors} slugLocked={slugLocked} urlPrefix="/modules/" />

      <Card title="介绍（正文）" description="Markdown，公开可见（会员模块也一样）。不要把完整代码写在这里。">
        <MarkdownField value={draft.body} onChange={(v) => set("body", v)} error={errors.body} preview={preview} />
      </Card>

      <Card title="运行环境">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="语言" value={draft.language} onChange={(v) => set("language", v)} error={errors.language} maxLength={30} />
          <Select
            label="入口文件"
            value={draft.entry}
            onChange={(v) => set("entry", v)}
            error={errors.entry}
            options={draft.files.filter((f) => f.path.trim()).map((f) => ({ value: f.path.trim(), label: f.path.trim() }))}
          />
          <LinesField label="环境要求" value={draft.env} onChange={(v) => set("env", v)} error={errors.env} mono hint="每行一条，例如 Python >= 3.9" />
          <LinesField label="依赖（可选）" value={draft.dependencies} onChange={(v) => set("dependencies", v)} error={errors.dependencies} mono hint="每行一条，例如 numpy>=1.24" />
          <div className="sm:col-span-2">
            <LinesField label="用法示例（可选）" value={draft.usage} onChange={(v) => set("usage", v)} error={errors.usage} mono hint="每行一条命令或一行代码，公开显示" />
          </div>
        </div>
      </Card>

      <Card title={`代码文件（${draft.files.length}）`} description="会员模块的代码只发送给有权限的会员。每个文件在详情页是一个标签页，带独立的复制按钮。">
        <div className="space-y-4">
          {draft.files.map((f, i) => (
            <div key={i} className="rounded-xl border border-zinc-200 p-3">
              <div className="mb-2 flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <Input label={`文件 ${i + 1} 路径`} value={f.path} onChange={(v) => setFile(i, { path: v })} error={errors[`files.${i}.path`]} mono maxLength={200} />
                </div>
                <span className="flex gap-1 pb-0.5">
                  <button type="button" className={btn.icon} onClick={() => moveFile(i, -1)} disabled={i === 0} aria-label={`上移文件 ${i + 1}`}>
                    ↑
                  </button>
                  <button type="button" className={btn.icon} onClick={() => moveFile(i, 1)} disabled={i === draft.files.length - 1} aria-label={`下移文件 ${i + 1}`}>
                    ↓
                  </button>
                  <button
                    type="button"
                    className={`${btn.icon} text-rose-700`}
                    onClick={() => setDraft((d) => ({ ...d, files: d.files.filter((_, j) => j !== i) }))}
                    disabled={draft.files.length === 1}
                    aria-label={`删除文件 ${i + 1}`}
                  >
                    ×
                  </button>
                </span>
              </div>
              <TextArea label={`文件 ${i + 1} 内容`} value={f.content} onChange={(v) => setFile(i, { content: v })} error={errors[`files.${i}.content`]} rows={12} mono />
            </div>
          ))}
          {errors.files && <p className="text-[12.5px] text-rose-700">{errors.files}</p>}
          <button type="button" className={btn.secondary} onClick={() => setDraft((d) => ({ ...d, files: [...d.files, { path: "", content: "" }] }))}>
            添加文件
          </button>
        </div>
      </Card>
    </EditorShell>
  );
}

function UploadButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={btn.secondary} disabled={pending}>
      {pending ? "上传中…" : "上传"}
    </button>
  );
}

export function DiagramCard({
  id,
  diagram,
  upload,
  remove,
  accept = "image/png,image/jpeg,image/webp",
  labels = {},
}: {
  labels?: { title?: string; description?: string; empty?: string; placeholder?: string; removeLabel?: string };
  id: number;
  diagram: { src: string; width: number | null; height: number | null; alt: string | null; bytes: number } | null;
  upload: (state: AdminFormState, fd: FormData) => Promise<AdminFormState>;
  remove: (fd: FormData) => Promise<void>;
  accept?: string;
}) {
  const [state, action] = useActionState(upload, {});
  return (
    <Card title={labels.title ?? "结构图"} description={labels.description ?? "PNG、JPEG 或 WebP，最大 2 MB；JPEG 的 EXIF（含定位）会被去除。没有上传时，详情页自动显示文件结构图。结构图对所有人可见。"}>
      {diagram ? (
        <figure className="mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={diagram.src} alt={diagram.alt ?? ""} width={diagram.width ?? undefined} height={diagram.height ?? undefined} className="h-auto max-h-64 w-auto max-w-full rounded-lg border border-zinc-200" />
          <figcaption className="mt-1 text-[12px] text-zinc-500">
            {diagram.alt} · {diagram.width}×{diagram.height} · {(diagram.bytes / 1024).toFixed(0)} KB
          </figcaption>
        </figure>
      ) : (
        <p className="mb-4 text-[13px] text-zinc-500">{labels.empty ?? "尚未上传，详情页显示自动生成的文件结构图。"}</p>
      )}
      <form action={action} className="flex flex-wrap items-end gap-2" encType="multipart/form-data">
        <input type="hidden" name="id" value={id} />
        <label className="min-w-0 flex-1 basis-56 text-[12.5px] font-medium text-zinc-700">
          图片说明（替代文字）
          <input name="alt" required maxLength={200} defaultValue={diagram?.alt ?? ""} placeholder={labels.placeholder ?? "例如：统计检验工具包的模块结构"} className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-[13.5px] font-normal" />
        </label>
        <label className="text-[12.5px] font-medium text-zinc-700">
          文件
          <input name="file" type="file" required accept={accept} className="mt-1 block max-w-full text-[13px] font-normal" />
        </label>
        <UploadButton />
      </form>
      {state.error && (
        <p role="alert" className="mt-2 text-[12.5px] text-rose-700">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="mt-2 text-[12.5px] text-emerald-700">
          {state.message}
        </p>
      )}
      {diagram && (
        <form action={remove} className="mt-3">
          <input type="hidden" name="id" value={id} />
          <button type="submit" className="text-[12.5px] text-rose-700 underline-offset-2 hover:underline">
            {labels.removeLabel ?? "删除结构图（改为显示文件结构）"}
          </button>
        </form>
      )}
    </Card>
  );
}
