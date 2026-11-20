import type { Metadata } from "next";
import Link from "next/link";
import { CreatePromptForm } from "@/components/admin/create-prompt-form";
import { adminData } from "@/lib/admin/server";
import { createSiteAction } from "../../actions";

export const metadata: Metadata = { title: "新建导航站点" };

export default async function NewSitePage() {
  const categories = await adminData.categories();
  return (
    <div className="max-w-xl">
      <Link href="/admin/sites/" className="text-[13px] text-zinc-500">
        ← 返回列表
      </Link>
      <h1 className="mt-2 text-xl font-semibold tracking-tight text-zinc-900">新建导航站点</h1>
      <p className="mt-1 text-[13.5px] text-zinc-500">先填基本信息创建草稿，再在编辑页完善其余内容。草稿不会出现在网站上。</p>
      <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-5">
        <CreatePromptForm categories={categories} action={createSiteAction} example="arxiv" />
      </div>
    </div>
  );
}
