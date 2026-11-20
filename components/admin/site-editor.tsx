"use client";
import {
  Card,
  CommonFields,
  EditorShell,
  Input,
  MarkdownField,
  Select,
  commonToDraft,
  draftToCommon,
  useEditor,
  type CommonDraft,
  type SaveFn,
  type StatusControls,
} from "@/components/admin/editor-kit";
import { DiagramCard } from "@/components/admin/module-editor";
import type { AdminFormState } from "@/app/admin/actions";
import type { SiteInput } from "@/lib/admin/sites";

interface SiteDraft extends CommonDraft {
  url: string;
  pricing: SiteInput["pricing"];
  region: string;
  loginRequired: boolean;
}

const PRICING: SiteInput["pricing"][] = ["免费", "部分免费", "付费", "机构订阅"];

export function SiteEditor({
  id,
  initial,
  version,
  slugLocked,
  save,
  preview,
  controls,
  icon,
  uploadIcon,
  removeIcon,
}: {
  id: number;
  initial: SiteInput;
  version: string;
  slugLocked: boolean;
  save: SaveFn;
  preview: (md: string) => Promise<string>;
  controls: StatusControls;
  icon: { src: string; width: number | null; height: number | null; alt: string | null; bytes: number } | null;
  uploadIcon: (state: AdminFormState, fd: FormData) => Promise<AdminFormState>;
  removeIcon: (fd: FormData) => Promise<void>;
}) {
  const toDraft = (i: SiteInput): SiteDraft => ({ ...commonToDraft(i), url: i.url, pricing: i.pricing, region: i.region ?? "", loginRequired: !!i.loginRequired });
  const toInput = (d: SiteDraft): unknown => ({
    ...initial,
    ...draftToCommon(d),
    url: d.url.trim(),
    pricing: d.pricing,
    region: d.region.trim() || undefined,
    loginRequired: d.loginRequired,
  });
  const ed = useEditor(toDraft(initial), version, id, save, toInput, controls.status === "PUBLISHED");
  const { draft, setDraft, errors } = ed;
  const set = <K extends keyof SiteDraft>(k: K, v: SiteDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  return (
    <EditorShell id={id} controls={controls} dirty={ed.dirty} pending={ed.pending} onSave={ed.onSave} notice={ed.notice} errors={errors}>
      <DiagramCard
        id={id}
        diagram={icon}
        upload={uploadIcon}
        remove={removeIcon}
        labels={{
          title: "站点图标",
          description: "正方形 PNG、JPEG 或 WebP（建议 128×128 以上），最大 2 MB。不上传时显示自动生成的字母图标。请使用你有权使用的图标。",
          empty: "尚未上传，导航卡片显示自动生成的字母图标。",
          placeholder: "例如：arXiv 图标",
        }}
      />
      <Card title="站点信息">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="网址" value={draft.url} onChange={(v) => set("url", v)} error={errors.url} mono maxLength={500} />
          <Select label="收费方式" value={draft.pricing} onChange={(v) => set("pricing", v as SiteInput["pricing"])} options={PRICING.map((p) => ({ value: p, label: p }))} error={errors.pricing} />
          <Input label="访问地区（可选）" value={draft.region} onChange={(v) => set("region", v)} error={errors.region} maxLength={40} hint="例如：全球可访问、需校园网" />
          <label className="flex items-center gap-2 self-end pb-2 text-[13px] text-zinc-800">
            <input type="checkbox" checked={draft.loginRequired} onChange={(e) => set("loginRequired", e.target.checked)} />
            需要登录才能使用
          </label>
        </div>
      </Card>
      <CommonFields draft={draft} set={(k, v) => setDraft((d) => ({ ...d, [k]: v }))} errors={errors} slugLocked={slugLocked} urlPrefix="/directory/" />
      <Card title="介绍（正文）" description="Markdown，原始 HTML 会被转义。">
        <MarkdownField value={draft.body} onChange={(v) => set("body", v)} error={errors.body} preview={preview} />
      </Card>
    </EditorShell>
  );
}
