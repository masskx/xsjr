"use client";
import { useEffect, useState, useTransition } from "react";
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

type SiteIconFetchResult =
  | { ok: true; icon: { src: string; width: number | null; height: number | null; alt: string | null; bytes: number } }
  | { ok: false; error: string };

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
  fetchIcon,
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
  fetchIcon: (id: number, url: string) => Promise<SiteIconFetchResult>;
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
  const [iconPreview, setIconPreview] = useState(icon);
  const [iconNotice, setIconNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [iconPending, startIconFetch] = useTransition();

  useEffect(() => {
    setIconPreview(icon);
  }, [icon]);

  function grabIcon(force: boolean) {
    const url = draft.url.trim();
    if (iconPending) return;
    if (!url || !/^https?:\/\//i.test(url) || /example\.org/i.test(url)) {
      if (force) setIconNotice({ tone: "err", text: "请先在“站点信息”里填写真实的 http(s) 网址。" });
      return;
    }
    if (!force && iconPreview) return;
    startIconFetch(async () => {
      try {
        const result = await fetchIcon(id, url);
        if (result.ok) {
          setIconPreview(result.icon);
          setIconNotice({ tone: "ok", text: "已从站点抓取图标；保存后生效，也可以手动上传覆盖。" });
        } else {
          setIconNotice({ tone: "err", text: result.error });
        }
      } catch {
        setIconNotice({ tone: "err", text: "抓取图标失败，请稍后重试或手动上传。" });
      }
    });
  }

  return (
    <EditorShell id={id} controls={controls} dirty={ed.dirty} pending={ed.pending} onSave={ed.onSave} notice={ed.notice} errors={errors}>
      <div className="mb-3 flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[12.5px] leading-5 text-zinc-600">
          填写网址后离开输入框会自动抓取站点图标；也可以手动上传自定义图标覆盖。
        </p>
        <button
          type="button"
          onClick={() => grabIcon(true)}
          disabled={iconPending}
          className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 text-[12.5px] font-medium text-zinc-800 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {iconPending ? "抓取中…" : "从当前网址抓取图标"}
        </button>
      </div>
      {iconNotice && (
        <p role="status" className={`mb-3 text-[12.5px] ${iconNotice.tone === "ok" ? "text-emerald-700" : "text-rose-700"}`}>
          {iconNotice.text}
        </p>
      )}
      <DiagramCard
        id={id}
        diagram={iconPreview}
        upload={uploadIcon}
        remove={removeIcon}
        accept="image/png,image/jpeg,image/webp,image/x-icon,image/vnd.microsoft.icon,.ico"
        labels={{
          title: "站点图标",
          description: "输入网址后会自动抓取站点自身的图标；也可以上传正方形 PNG、JPEG、WebP 或 ICO（建议 128×128 以上），最大 2 MB。请使用你有权使用的图标。",
          empty: "尚未设置图标，导航卡片显示自动生成的字母图标；填写网址后会自动抓取。",
          placeholder: "例如：arXiv 图标",
          removeLabel: "删除图标（改为显示字母图标）",
        }}
      />
      <Card title="站点信息">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="网址"
            value={draft.url}
            onChange={(v) => set("url", v)}
            onBlur={() => grabIcon(false)}
            error={errors.url}
            mono
            maxLength={500}
            hint="离开输入框后会自动抓取网站图标；也可在图标卡片里重新抓取或手动上传。"
          />
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
