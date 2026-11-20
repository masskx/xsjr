import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProvenancePanel } from "@/components/admin/provenance-panel";
import { SkillEditor } from "@/components/admin/skill-editor";
import { Notice, StatusBadge, btn } from "@/components/admin/ui";
import { adminData } from "@/lib/admin/server";
import {
  archiveSkillAction,
  previewMarkdownAction,
  publishSkillAction,
  restoreSkillAction,
  saveSkillAction,
  unpublishSkillAction,
} from "../../actions";

export const metadata: Metadata = { title: "编辑 Skill" };

const MESSAGES: Record<string, string> = {
  published: "已发布，网站上已可见。",
  unpublished: "已取消发布，网站上不再显示（链接返回 404）。",
  restored: "已恢复为草稿。",
};

export default async function EditSkillPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string; created?: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [skill, versions, provenance] = await Promise.all([adminData.skillForEdit(id), adminData.versionCount(id), adminData.provenance(id)]);
  if (!skill) notFound();
  const sp = await searchParams;

  return (
    <div>
      <Link href="/admin/skills/" className="text-[13px] text-zinc-500">
        ← 返回列表
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 text-xl font-semibold tracking-tight text-zinc-900">{skill.input.title}</h1>
        <StatusBadge status={skill.status} />
        {skill.status === "PUBLISHED" && (
          <Link href={`/skills/${skill.input.slug}/`} target="_blank" className={`${btn.secondary} ml-auto`}>
            查看网站页面 ↗
          </Link>
        )}
      </div>
      <p className="mt-1 text-[12.5px] text-zinc-500">已记录 {versions} 个发布版本 · Skills 始终免费</p>
      <div className="mt-5">
        {sp.created && <Notice tone="ok">草稿已创建。补充 SKILL.md 和兼容性后即可发布。</Notice>}
        {sp.msg && MESSAGES[sp.msg] && <Notice tone="ok">{MESSAGES[sp.msg]}</Notice>}
        {sp.err && <Notice tone="error">{sp.err}</Notice>}
      </div>
      {provenance.records.length > 0 && (
        <div className="mb-5">
          <ProvenancePanel records={provenance.records} licenseSource={skill.licenseSource} />
        </div>
      )}
      <SkillEditor
        key={skill.version}
        id={id}
        licenseSource={skill.licenseSource}
        initial={skill.input}
        version={skill.version}
        slugLocked={!!skill.publishedAt}
        save={saveSkillAction}
        preview={previewMarkdownAction}
        controls={{ status: skill.status, publish: publishSkillAction, unpublish: unpublishSkillAction, archive: archiveSkillAction, restore: restoreSkillAction }}
      />
    </div>
  );
}
