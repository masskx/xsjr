import type { Metadata } from "next";
import { adminData } from "@/lib/admin/server";
import { ResourceList, parseStatus } from "@/components/admin/resource-list";
import { moveSiteAction } from "../actions";

export const metadata: Metadata = { title: "科研导航" };

export default async function AdminSitesPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; err?: string; msg?: string; moved?: string }> }) {
  const sp = await searchParams;
  const status = parseStatus(sp.status);
  const q = (sp.q ?? "").slice(0, 60);
  const rows = await adminData.listResources("SITE", { status, q });
  return (
    <ResourceList
      title="科研导航"
      base="/admin/sites/"
      newLabel="新建站点"
      rows={rows}
      status={status}
      q={q}
      msg={sp.msg}
      err={sp.err}
      moved={sp.moved}
      move={moveSiteAction}
      intro={<p className="mt-1 text-[13.5px] text-zinc-500">导航页按分类展示这些站点的图标卡片；点击卡片进入详情页，详情页上有“打开官网”按钮。</p>}
    />
  );
}
