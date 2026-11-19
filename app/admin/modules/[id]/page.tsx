import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ModuleEditor } from "@/components/admin/module-editor";
import { Notice, StatusBadge, btn } from "@/components/admin/ui";
import { adminData } from "@/lib/admin/server";
import {
  archiveModuleAction,
  previewMarkdownAction,
  publishModuleAction,
  removeDiagramAction,
  restoreModuleAction,
  saveModuleAction,
  unpublishModuleAction,
  uploadDiagramAction,
} from "../../actions";

export const metadata: Metadata = { title: "编辑模块" };

const MESSAGES: Record<string, string> = {
  published: "已发布，网站上已可见。",
  unpublished: "已取消发布，网站上不再显示（链接返回 404）。",
  restored: "已恢复为草稿。",
  diagram: "结构图已更新，网站上立即生效。",
  "diagram-removed": "结构图已删除，详情页改为显示文件结构。",
};

export default async function EditModulePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string; created?: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [mod, versions, diagram, tiers] = await Promise.all([adminData.moduleForEdit(id), adminData.versionCount(id), adminData.diagramOf(id), adminData.tiers()]);
  if (!mod) notFound();
  const sp = await searchParams;
  const tierLabel = tiers.find((t) => t.code === mod.requiredTier)?.labelZh ?? mod.requiredTier;

  return (
    <div>
      <Link href="/admin/modules/" className="text-[13px] text-zinc-500">
        ← 返回列表
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 text-xl font-semibold tracking-tight text-zinc-900">{mod.input.title}</h1>
        <StatusBadge status={mod.status} />
        {mod.status === "PUBLISHED" && (
          <Link href={`/modules/${mod.input.slug}/`} target="_blank" className={`${btn.secondary} ml-auto`}>
            查看网站页面 ↗
          </Link>
        )}
      </div>
      <p className="mt-1 text-[12.5px] text-zinc-500">
        会员等级：{mod.requiredTier === "FREE" ? "免费" : `需要 ${tierLabel}`}（在
        <Link href={`/admin/modules/#m-${id}`}>模块列表</Link>中修改）· 已记录 {versions} 个发布版本
      </p>
      <div className="mt-5">
        {sp.created && <Notice tone="ok">草稿已创建。补充代码文件、适用任务和结构图后即可发布。</Notice>}
        {sp.msg && MESSAGES[sp.msg] && <Notice tone="ok">{MESSAGES[sp.msg]}</Notice>}
        {sp.err && <Notice tone="error">{sp.err}</Notice>}
      </div>
      <ModuleEditor
        key={mod.version}
        id={id}
        initial={mod.input}
        version={mod.version}
        slugLocked={!!mod.publishedAt}
        save={saveModuleAction}
        preview={previewMarkdownAction}
        diagram={diagram}
        uploadDiagram={uploadDiagramAction}
        removeDiagram={removeDiagramAction}
        controls={{ status: mod.status, publish: publishModuleAction, unpublish: unpublishModuleAction, archive: archiveModuleAction, restore: restoreModuleAction }}
      />
    </div>
  );
}
