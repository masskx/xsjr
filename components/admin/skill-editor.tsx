"use client";
import {
  Card,
  CommonFields,
  EditorShell,
  Input,
  LinesField,
  MarkdownField,
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
import type { SkillInput } from "@/lib/admin/skills";
import { TOOL_LABEL } from "@/lib/types";

interface CompatRow {
  tool: string;
  supportedRange: string;
  installPath: string;
  note: string;
}
interface FileRow {
  path: string;
  size: string;
  desc: string;
}
interface SkillDraft extends CommonDraft {
  skillMd: string;
  compat: CompatRow[];
  files: FileRow[];
  risks: string;
  dependencies: string;
}

const toDraft = (i: SkillInput): SkillDraft => ({
  ...commonToDraft(i),
  skillMd: i.skillMd,
  compat: i.compat.map((c) => ({ tool: c.tool, supportedRange: c.supportedRange, installPath: c.installPath ?? "", note: c.note ?? "" })),
  files: i.files.map((f) => ({ path: f.path, size: f.size === undefined ? "" : String(f.size), desc: f.desc ?? "" })),
  risks: (i.risks ?? []).join("\n"),
  dependencies: (i.dependencies ?? []).join("\n"),
});

function Rows<T>({
  rows,
  onChange,
  blank,
  render,
  addLabel,
  itemLabel,
}: {
  rows: T[];
  onChange: (rows: T[]) => void;
  blank: T;
  render: (row: T, set: (patch: Partial<T>) => void, i: number) => React.ReactNode;
  addLabel: string;
  itemLabel: string;
}) {
  return (
    <div className="space-y-3">
      {rows.map((row, i) => (
        <div key={i} className="rounded-xl border border-zinc-200 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12.5px] font-medium text-zinc-500">
              {itemLabel} {i + 1}
            </span>
            <button type="button" className={`${btn.icon} text-rose-700`} onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label={`删除${itemLabel} ${i + 1}`}>
              ×
            </button>
          </div>
          {render(row, (patch) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r))), i)}
        </div>
      ))}
      <button type="button" className={btn.secondary} onClick={() => onChange([...rows, blank])}>
        {addLabel}
      </button>
    </div>
  );
}

export function SkillEditor({
  id,
  initial,
  version,
  slugLocked,
  save,
  preview,
  controls,
}: {
  id: number;
  initial: SkillInput;
  version: string;
  slugLocked: boolean;
  save: SaveFn;
  preview: (md: string) => Promise<string>;
  controls: StatusControls;
}) {
  const toInput = (d: SkillDraft): unknown => ({
    ...initial,
    ...draftToCommon(d),
    skillMd: d.skillMd,
    compat: d.compat.map((c) => ({ tool: c.tool.trim(), supportedRange: c.supportedRange, installPath: c.installPath || undefined, note: c.note || undefined })),
    files: d.files.map((f) => ({ path: f.path.trim(), size: f.size.trim() ? Number(f.size) : undefined, desc: f.desc || undefined })),
    risks: lines(d.risks),
    dependencies: lines(d.dependencies),
  });
  const ed = useEditor(toDraft(initial), version, id, save, toInput, controls.status === "PUBLISHED");
  const { draft, setDraft, errors } = ed;
  const set = <K extends keyof SkillDraft>(k: K, v: SkillDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setCommon = <K extends keyof CommonDraft>(k: K, v: CommonDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <EditorShell id={id} controls={controls} dirty={ed.dirty} pending={ed.pending} onSave={ed.onSave} notice={ed.notice} errors={errors}>
      <CommonFields draft={draft} set={setCommon} errors={errors} slugLocked={slugLocked} urlPrefix="/skills/" />

      <Card title="介绍（正文）" description="Markdown，原始 HTML 会被转义。">
        <MarkdownField value={draft.body} onChange={(v) => set("body", v)} error={errors.body} preview={preview} />
      </Card>

      <Card title="SKILL.md" description="Skill 定义文件的完整内容，详情页可预览和复制。">
        <TextArea label="SKILL.md" value={draft.skillMd} onChange={(v) => set("skillMd", v)} error={errors.skillMd} rows={14} mono />
      </Card>

      <Card title={`兼容性（${draft.compat.length}）`} description={`工具标识：${Object.keys(TOOL_LABEL).join("、")} 等（小写、连字符）。`}>
        <Rows
          rows={draft.compat}
          onChange={(rows) => set("compat", rows)}
          blank={{ tool: "", supportedRange: "", installPath: "", note: "" }}
          addLabel="添加一行"
          itemLabel="兼容性"
          render={(c, setRow, i) => (
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="工具标识" value={c.tool} onChange={(v) => setRow({ tool: v.toLowerCase() })} error={errors[`compat.${i}.tool`]} mono maxLength={30} />
              <Input label="支持范围" value={c.supportedRange} onChange={(v) => setRow({ supportedRange: v })} error={errors[`compat.${i}.supportedRange`]} maxLength={80} />
              <Input label="安装路径（可选）" value={c.installPath} onChange={(v) => setRow({ installPath: v })} error={errors[`compat.${i}.installPath`]} mono maxLength={200} />
              <Input label="备注（可选）" value={c.note} onChange={(v) => setRow({ note: v })} error={errors[`compat.${i}.note`]} maxLength={200} />
            </div>
          )}
        />
        {errors.compat && <p className="mt-2 text-[12.5px] text-rose-700">{errors.compat}</p>}
      </Card>

      <Card title={`文件清单（${draft.files.length}）`} description="详情页“文件结构”展示的清单（只展示名称与说明）。">
        <Rows
          rows={draft.files}
          onChange={(rows) => set("files", rows)}
          blank={{ path: "", size: "", desc: "" }}
          addLabel="添加文件"
          itemLabel="文件"
          render={(f, setRow, i) => (
            <div className="grid gap-3 sm:grid-cols-3">
              <Input label="路径" value={f.path} onChange={(v) => setRow({ path: v })} error={errors[`files.${i}.path`]} mono maxLength={200} />
              <Input label="大小（字节，可选）" value={f.size} onChange={(v) => setRow({ size: v.replace(/\D/g, "") })} error={errors[`files.${i}.size`]} />
              <Input label="说明（可选）" value={f.desc} onChange={(v) => setRow({ desc: v })} error={errors[`files.${i}.desc`]} maxLength={200} />
            </div>
          )}
        />
      </Card>

      <Card title="风险与依赖">
        <div className="grid gap-4 sm:grid-cols-2">
          <LinesField label="风险提示（可选）" value={draft.risks} onChange={(v) => set("risks", v)} error={errors.risks} />
          <LinesField label="依赖（可选）" value={draft.dependencies} onChange={(v) => set("dependencies", v)} error={errors.dependencies} mono />
        </div>
      </Card>
    </EditorShell>
  );
}
