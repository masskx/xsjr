import type { Metadata } from "next";
import Link from "next/link";
import { getAttachment, getDiagram, getFileIndex, getResourcesByType } from "@/lib/repo";
import { PageHeader } from "@/components/page-header";
import { GalleryCard } from "@/components/gallery-card";
import type { ModuleResource } from "@/lib/types";

export const metadata: Metadata = {
  title: "即插即用模块",
  description:
    "可直接复制进项目的科研代码模块：统计检验选择与执行、出版级绘图样式、Bootstrap 置信区间与效应量。含结构图、适用任务、依赖、用法与输出示例。",
  alternates: { canonical: "/modules/" },
};

const chip = (active: boolean) =>
  `rounded-md px-2 py-1 text-[12px] no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 ${
    active ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
  }`;

// Gallery: server-rendered, filters are plain links (?category=&tag=), so every filtered view
// is shareable and crawlable without JavaScript.
export default async function ModulesPage({ searchParams }: { searchParams: Promise<{ category?: string; tag?: string }> }) {
  const all = (await getResourcesByType("MODULE")) as ModuleResource[];
  const sp = await searchParams;
  const categories = [...new Map(all.map((m) => [m.category, all.filter((x) => x.category === m.category).length]))];
  const category = categories.some(([c]) => c === sp.category) ? sp.category! : null;
  const inCategory = category ? all.filter((m) => m.category === category) : all;
  const tagCounts = new Map<string, number>();
  for (const m of inCategory) for (const t of m.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  const tags = [...tagCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN")).slice(0, 12);
  const tag = tagCounts.has(sp.tag ?? "") ? sp.tag! : null;
  const list = tag ? inCategory.filter((m) => m.tags.includes(tag)) : inCategory;
  // code preview only for free modules without a diagram: members-only code never reaches a list
  const cards = await Promise.all(
    list.map(async (m) => {
      const diagram = await getDiagram(m);
      const preview = !diagram && m.tier === "FREE" ? ((await getAttachment(m, m.entry.replace(/^files\//, ""))) ?? undefined) : undefined;
      return { m, diagram, files: await getFileIndex(m), preview };
    }),
  );

  const href = (c: string | null, t: string | null) => {
    const q = new URLSearchParams({ ...(c ? { category: c } : {}), ...(t ? { tag: t } : {}) }).toString();
    return `/modules/${q ? `?${q}` : ""}`;
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <PageHeader title="即插即用模块" desc="单文件优先、依赖清晰、带自检示例的代码模块。先看结构图和适用任务，再复制代码进项目就能跑。" count={all.length} />

      <nav aria-label="按分类筛选" className="flex flex-wrap items-center gap-1.5 border-b border-zinc-200 pb-3">
        <span className="mr-1 text-[11px] font-medium uppercase tracking-wider text-zinc-400">分类</span>
        <Link href={href(null, null)} className={chip(!category)} aria-current={!category ? "page" : undefined}>
          全部 {all.length}
        </Link>
        {categories.map(([c, n]) => (
          <Link key={c} href={href(c, null)} className={chip(category === c)} aria-current={category === c ? "page" : undefined}>
            {c} {n}
          </Link>
        ))}
      </nav>

      {tags.length > 0 && (
        <nav aria-label="按标签筛选" className="flex flex-wrap items-center gap-1.5 border-b border-zinc-100 py-2.5">
          <span className="mr-1 text-[11px] font-medium uppercase tracking-wider text-zinc-400">标签</span>
          <Link href={href(category, null)} className={chip(!tag)} aria-current={!tag ? "page" : undefined}>
            全部
          </Link>
          {tags.map(([t, n]) => (
            <Link key={t} href={href(category, t)} className={chip(tag === t)} aria-current={tag === t ? "page" : undefined}>
              {t} {n}
            </Link>
          ))}
        </nav>
      )}

      {cards.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-zinc-300 py-16 text-center text-sm text-zinc-500">这个筛选组合下还没有模块。</div>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(({ m, diagram, files, preview }) => (
            <GalleryCard key={m.slug} module={m} diagram={diagram} files={files} preview={preview} />
          ))}
        </div>
      )}
    </div>
  );
}
