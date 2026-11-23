import type { Metadata } from "next";
import Link from "next/link";
import { getDiagram, getResourcesByType } from "@/lib/repo";
import { PageHeader } from "@/components/page-header";
import { SiteIcon } from "@/components/site-icon";
import type { SiteResource } from "@/lib/types";

export const metadata: Metadata = {
  title: "科研导航",
  description:
    "科研常用站点与精选在线工具：文献检索、预印本、数据集与代码托管、写作工具。标注收费模式、访问条件与核验日期。",
};

const slugOf = (cat: string) => `cat-${[...cat].map((c) => c.codePointAt(0)!.toString(36)).join("")}`;
const PINNED_CATEGORY = "热门推荐工具";

export default async function DirectoryPage() {
  const sites = (await getResourcesByType("SITE")) as SiteResource[];
  const icons = new Map(await Promise.all(sites.map(async (s) => [s.slug, await getDiagram(s)] as const)));
  const groups = new Map<string, SiteResource[]>();
  for (const s of sites) groups.set(s.category, [...(groups.get(s.category) ?? []), s]);
  const orderedGroups = [...groups.entries()].sort(([a], [b]) => (a === PINNED_CATEGORY ? -1 : b === PINNED_CATEGORY ? 1 : 0));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <PageHeader
        title="科研导航"
        desc="科研常用站点与精选在线工具：写明收费模式、是否需要登录、适用领域与最近核验时间。点击图标查看详情，从详情页打开站点。"
        count={sites.length}
      />

      {groups.size > 1 && (
        <nav aria-label="分类" className="mb-8 flex flex-wrap gap-1.5">
          {orderedGroups.map(([cat, list]) => (
            <a key={cat} href={`#${slugOf(cat)}`} className="rounded-[3px] border border-rule bg-paper-raised px-3 py-1 text-[13px] text-zinc-700 no-underline shadow-xs hover:shadow-md">
              {cat} <span className="font-mono text-[11px] text-zinc-500">{list.length}</span>
            </a>
          ))}
        </nav>
      )}

      <div className="space-y-12">
        {orderedGroups.map(([cat, list]) => (
          <section key={cat} id={slugOf(cat)} aria-labelledby={`${slugOf(cat)}-h`} className="scroll-mt-24">
            <h2 id={`${slugOf(cat)}-h`} className="headline flex items-baseline gap-3 text-[24px]">
              {cat}
              <span className="font-mono text-[12px] font-normal text-zinc-500">{list.length}</span>
            </h2>
            <ul className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {list.map((s) => (
                <li key={s.slug}>
                  <Link
                    href={`/directory/${s.slug}/`}
                    className="surface group flex h-full flex-col items-center gap-2 px-2.5 py-3 text-center no-underline transition-shadow duration-200 hover:shadow-md"
                  >
                    <SiteIcon title={s.title} slug={s.slug} icon={icons.get(s.slug) ?? null} size={40} />
                    <span className="text-[13px] font-semibold leading-snug text-zinc-900 decoration-gold underline-offset-4 group-hover:underline">{s.title}</span>
                    <span className="line-clamp-2 text-[11.5px] font-light leading-4 text-zinc-600">{s.summary}</span>
                    <span className="mt-auto flex flex-wrap justify-center gap-1">
                      <span className="tag-mono text-[10px]">{s.pricing}</span>
                      {s.isPromotion && <span className="tag-mono border-amber-300 bg-amber-50 text-[10px] text-amber-800">推广</span>}
                      {s.loginRequired && <span className="tag-mono text-[10px]">需登录</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {sites.length === 0 && <p className="text-[14px] text-zinc-600">还没有收录站点。</p>}
      </div>
    </div>
  );
}
