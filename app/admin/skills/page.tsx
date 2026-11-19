import type { Metadata } from "next";
import { adminData } from "@/lib/admin/server";
import { ResourceList, parseStatus } from "@/components/admin/resource-list";
import { moveSkillAction } from "../actions";

export const metadata: Metadata = { title: "Skills" };

export default async function AdminSkillsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; err?: string; msg?: string; moved?: string }> }) {
  const sp = await searchParams;
  const status = parseStatus(sp.status);
  const q = (sp.q ?? "").slice(0, 60);
  const rows = await adminData.listResources("SKILL", { status, q });
  return (
    <ResourceList
      title="Skills"
      base="/admin/skills/"
      newLabel="新建 Skill"
      rows={rows}
      status={status}
      q={q}
      msg={sp.msg}
      err={sp.err}
      moved={sp.moved}
      move={moveSkillAction}
      intro={<p className="mt-1 text-[13.5px] text-zinc-500">Skills 全部免费。兼容性矩阵、文件清单和 SKILL.md 都在编辑页维护。</p>}
    />
  );
}
