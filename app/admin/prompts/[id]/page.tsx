import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PromptEditor } from "@/components/admin/prompt-editor";
import { Notice, StatusBadge, btn } from "@/components/admin/ui";
import { adminData } from "@/lib/admin/server";
import {
  archivePromptAction,
  previewMarkdownAction,
  publishPromptAction,
  restorePromptAction,
  savePromptAction,
  unpublishPromptAction,
} from "../../actions";

export const metadata: Metadata = { title: "编辑提示词" };

const MESSAGES: Record<string, string> = {
  published: "已发布，网站上已可见。",
  unpublished: "已取消发布，网站上不再显示（链接返回 404）。",
  restored: "已恢复为草稿。",
};

export default async function EditPromptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; err?: string; created?: string }>;
}) {
  const { id: raw } = await params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [prompt, versions] = await Promise.all([adminData.promptForEdit(id), adminData.versionCount(id)]);
  if (!prompt) notFound();
  const sp = await searchParams;

  return (
    <div>
      <Link href="/admin/prompts/" className="text-[13px] text-zinc-500">
        ← 返回列表
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 text-xl font-semibold tracking-tight text-zinc-900">{prompt.input.title}</h1>
        <StatusBadge status={prompt.status} />
        {prompt.status === "PUBLISHED" && (
          <Link href={`/prompts/${prompt.input.slug}/`} target="_blank" className={`${btn.secondary} ml-auto`}>
            查看网站页面 ↗
          </Link>
        )}
      </div>
      <p className="mt-1 text-[12.5px] text-zinc-500">
        已记录 {versions} 个发布版本{prompt.publishedAt ? "" : " · 从未发布"}
      </p>

      <div className="mt-5">
        {sp.created && <Notice tone="ok">草稿已创建。完善模板和变量后即可发布。</Notice>}
        {sp.msg && MESSAGES[sp.msg] && <Notice tone="ok">{MESSAGES[sp.msg]}</Notice>}
        {sp.err && <Notice tone="error">{sp.err}</Notice>}
      </div>

      <PromptEditor
        key={prompt.version}
        id={id}
        initial={prompt.input}
        version={prompt.version}
        slugLocked={!!prompt.publishedAt}
        save={savePromptAction}
        preview={previewMarkdownAction}
        controls={{
          status: prompt.status,
          publish: publishPromptAction,
          unpublish: unpublishPromptAction,
          archive: archivePromptAction,
          restore: restorePromptAction,
        }}
      />
    </div>
  );
}
