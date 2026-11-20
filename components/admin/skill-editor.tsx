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
  sourceUrl: string;
  redistribution: boolean;
  licenseDeclared: boolean;
}

const LICENSE_SOURCE_LABEL: Record<string, string> = {
  PLATFORM: "平台原创",
  SPDX_DETECTED: "自动识别（LICENSE 文件）",
  PAGE_DECLARED: "自动识别（页面声明）",
  ADMIN_DECLARED: "管理员核实声明",
  UNKNOWN: "未知",
};

const toDraft = (i: SkillInput): SkillDraft => ({
  ...commonToDraft(i),
  skillMd: i.skillMd,
  compat: i.compat.map((c) => ({ tool: c.tool, supportedRange: c.supportedRange, installPath: c.installPath ?? "", note: c.note ?? "" })),
  files: i.files.map((f) => ({ path: f.path, size: f.size === undefined ? "" : String(f.size), desc: f.desc ?? "" })),
  risks: (i.risks ?? []).join("\n"),
  dependencies: (i.dependencies ?? []).join("\n"),
  sourceUrl: i.sourceUrl ?? "",
  redistribution: i.redistribution,
  licenseDeclared: false,
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
  licenseSource = "PLATFORM",
}: {
  licenseSource?: string;
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
    sourceUrl: d.sourceUrl.trim() || undefined,
    redistribution: d.redistribution,
    licenseDeclared: d.licenseDeclared || undefined,
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

      <Card title="来源与转载" description="第三方 Skill 必须填写来源。只有许可证允许时才能转载 SKILL.md 原文，否则仅做索引（详情页链接到来源）。">
        <div className="space-y-3">
          <Input label="来源链接（第三方 Skill 必填）" value={draft.sourceUrl} onChange={(v) => set("sourceUrl", v)} error={errors.sourceUrl} mono maxLength={500} />
          <p className="text-[12.5px] text-zinc-600">
            许可证来源：<span className="font-medium text-zinc-800">{LICENSE_SOURCE_LABEL[licenseSource] ?? licenseSource}</span>
          </p>
          <label className="flex items-start gap-2 text-[13px] text-zinc-800">
            <input type="checkbox" className="mt-0.5" checked={draft.redistribution} onChange={(e) => set("redistribution", e.target.checked)} aria-invalid={errors.redistribution ? true : undefined} />
            <span>允许转载 SKILL.md 原文（关闭 = 仅索引，不保存原文）</span>
          </label>
          {draft.redistribution && licenseSource !== "PLATFORM" && (!initial.redistribution || draft.license !== initial.license) && (
            <label className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-900">
              <input type="checkbox" className="mt-0.5" checked={draft.licenseDeclared} onChange={(e) => set("licenseDeclared", e.target.checked)} />
              <span>我已核实来源许可证允许转载（会以“管理员核实声明”记录在审计日志中）</span>
            </label>
          )}
          {errors.redistribution && <p className="text-[12.5px] text-rose-700">{errors.redistribution}</p>}
        </div>
      </Card>

      <Card title="SKILL.md" description={draft.redistribution ? "Skill 定义文件的完整内容，详情页可预览和复制。" : "仅索引：保存时不会存储 SKILL.md 原文，详情页显示“前往来源查看原文”。"}>
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
