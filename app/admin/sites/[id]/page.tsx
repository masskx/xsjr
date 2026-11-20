import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProvenancePanel } from "@/components/admin/provenance-panel";
import { SiteEditor } from "@/components/admin/site-editor";
import { Notice, StatusBadge, btn } from "@/components/admin/ui";
import { adminData } from "@/lib/admin/server";
import {
  archiveSiteAction,
  previewMarkdownAction,
  publishSiteAction,
  restoreSiteAction,
  saveSiteAction,
  uploadSiteIconAction,
  removeSiteIconAction,
  unpublishSiteAction,
} from "../../actions";

export const metadata: Metadata = { title: "编辑导航站点" };

const MESSAGES: Record<string, string> = {
  published: "已发布，网站上已可见。",
  unpublished: "已取消发布，网站上不再显示（链接返回 404）。",
  restored: "已恢复为草稿。",
  icon: "图标已更新。",
  "icon-removed": "图标已删除，改为显示字母图标。",
};

export default async function EditSitePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string; created?: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [skill, versions, provenance, icon] = await Promise.all([adminData.siteForEdit(id), adminData.versionCount(id), adminData.provenance(id), adminData.diagramOf(id)]);
  if (!skill) notFound();
  const sp = await searchParams;

  return (
    <div>
      <Link href="/admin/sites/" className="text-[13px] text-zinc-500">
        ← 返回列表
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 text-xl font-semibold tracking-tight text-zinc-900">{skill.input.title}</h1>
        <StatusBadge status={skill.status} />
        {skill.status === "PUBLISHED" && (
          <Link href={`/directory/${skill.input.slug}/`} target="_blank" className={`${btn.secondary} ml-auto`}>
            查看网站页面 ↗
          </Link>
        )}
      </div>
      <p className="mt-1 text-[12.5px] text-zinc-500">已记录 {versions} 个发布版本 · 站点卡片对所有人可见</p>
      <div className="mt-5">
        {sp.created && <Notice tone="ok">草稿已创建。填写网址、上传图标后即可发布。</Notice>}
        {sp.msg && MESSAGES[sp.msg] && <Notice tone="ok">{MESSAGES[sp.msg]}</Notice>}
        {sp.err && <Notice tone="error">{sp.err}</Notice>}
      </div>
      {provenance.records.length > 0 && (
        <div className="mb-5">
          <ProvenancePanel records={provenance.records} licenseSource={skill.licenseSource} />
        </div>
      )}
      <SiteEditor
        key={skill.version}
        id={id}
        initial={skill.input}
        version={skill.version}
        slugLocked={!!skill.publishedAt}
        save={saveSiteAction}
        preview={previewMarkdownAction}
        controls={{ status: skill.status, publish: publishSiteAction, unpublish: unpublishSiteAction, archive: archiveSiteAction, restore: restoreSiteAction }}
        icon={icon}
        uploadIcon={uploadSiteIconAction}
        removeIcon={removeSiteIconAction}
      />
    </div>
  );
}
