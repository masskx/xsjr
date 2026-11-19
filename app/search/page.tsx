import type { Metadata } from "next";
import { Suspense } from "react";
import { getAllResources } from "@/lib/repo";
import { buildSearchIndex } from "@/lib/search";
import { ResourceSearch } from "@/components/resource-search";

export const metadata: Metadata = {
  title: "全站搜索",
  description:
    "按标题、标签、分类检索科研提示词、Skills、代码模块与科研网站。支持中文、拼音与首字母输入。",
};

export default async function SearchPage() {
  const docs = buildSearchIndex(await getAllResources());

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        搜索资源
      </h1>
      <p className="mt-2 text-[13.5px] text-zinc-500">
        共 {docs.length} 项资源。支持中文关键词、全拼（shengao）与首字母（sg）。
      </p>

      <div className="mt-5">
        <Suspense
          fallback={
            <div className="rounded-xl border border-zinc-200 p-4 text-sm text-zinc-400">
              正在加载搜索框…
            </div>
          }
        >
          <ResourceSearch docs={docs} />
        </Suspense>
      </div>
    </div>
  );
}
