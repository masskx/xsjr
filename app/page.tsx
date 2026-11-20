import type { Metadata } from "next";
import Link from "next/link";
import { getAllResources, getCategories, getDiagram, type Diagram } from "@/lib/repo";
import { SITE_KIND, SITE_NAME } from "@/lib/site";
import { TYPE_HREF, TYPE_LABEL, type ModuleResource, type Resource, type ResourceType } from "@/lib/types";
import { HeroSearch } from "@/components/hero-search";
import { HomeDiscover, type HomeItem } from "@/components/home-discover";

export const metadata: Metadata = {
  title: "科研 AI 资源工作台",
  description: "提示词、Agent Skills、即插即用代码模块与科研站点导航。筛选、复制、下载，回到你自己的 Agent / IDE 里用。",
  alternates: { canonical: "/" },
};

const Arrow = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className} aria-hidden>
    <path d="M4 12h15m-5-6 6 6-6 6" />
  </svg>
);

const byUpdated = (a: { updatedAt: string }, b: { updatedAt: string }) => b.updatedAt.localeCompare(a.updatedAt);

function toItem(r: Resource, diagram?: HomeItem["diagram"]): HomeItem {
  return {
    slug: r.slug,
    type: r.type,
    title: r.title,
    summary: r.summary,
    category: r.category,
    updatedAt: r.updatedAt,
    diagram: diagram ?? null,
  };
}

function TypeVisual({ card }: { card: { key: ResourceType; diagrams: Diagram[] } }) {
  if (card.key === "MODULE" && card.diagrams.length > 0) {
    return (
      <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-zinc-200/70 bg-zinc-50 p-2">
        {card.diagrams.slice(0, 2).map((d, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- images are served by Caddy
          <img key={i} src={d.src} width={d.width} height={d.height} alt="" loading="lazy" decoding="async" className="h-16 w-full object-contain" />
        ))}
      </div>
    );
  }
  if (card.key === "SKILL") {
    return (
      <div className="mt-4 rounded-2xl border border-zinc-200/70 bg-zinc-50 p-3 font-mono text-[10.5px] leading-5 text-zinc-500">
        <div className="text-zinc-800">SKILL.md</div>
        <div>templates/</div>
        <div>scripts/</div>
      </div>
    );
  }
  if (card.key === "PROMPT") {
    return (
      <div className="mt-4 rounded-2xl border border-zinc-200/70 bg-zinc-50 p-3 font-mono text-[10.5px] leading-5 text-zinc-500">
        <div>研究主题：{"{{topic}}"}</div>
        <div>目标期刊：{"{{venue}}"}</div>
        <div className="text-zinc-300">复制 → 填入 → 使用</div>
      </div>
    );
  }
  return (
    <div className="mt-4 flex items-center gap-3 rounded-2xl border border-zinc-200/70 bg-zinc-50 p-3 text-zinc-500">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7 shrink-0" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 2.7 4 5.7 4 9s-1.5 6.3-4 9c-2.5-2.7-4-5.7-4-9s1.5-6.3 4-9Z" />
      </svg>
      <div className="flex flex-wrap gap-1 font-mono text-[10.5px]">
        <span className="rounded border border-zinc-200 bg-white px-1.5 py-0.5">数据集</span>
        <span className="rounded border border-zinc-200 bg-white px-1.5 py-0.5">工具</span>
        <span className="rounded border border-zinc-200 bg-white px-1.5 py-0.5">机构</span>
      </div>
    </div>
  );
}

function TypeCard({ card }: { card: { key: ResourceType; title: string; count: number; hint: string; href: string; diagrams: Diagram[] } }) {
  return (
    <Link
      href={card.href}
      className="group flex min-h-[214px] flex-col rounded-3xl border border-zinc-200 bg-white p-5 no-underline transition-shadow duration-200 hover:shadow-md"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[18px] font-semibold tracking-[-0.01em] text-zinc-900">{card.title}</span>
        <span className="font-mono text-[11px] text-zinc-400">{card.count}</span>
      </div>
      <p className="mt-1.5 text-[12.5px] font-light leading-5 text-zinc-500">{card.hint}</p>
      <div className="mt-auto">
        <TypeVisual card={card} />
      </div>
      <span className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-zinc-700 transition-colors group-hover:text-zinc-950">
        浏览{TYPE_LABEL[card.key]} <Arrow className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

function MiniList({ title, href, items, type, dot }: { title: string; href: string; items: Resource[]; type: ResourceType; dot: string }) {
  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[17px] font-semibold tracking-[-0.01em] text-zinc-900">{title}</h3>
        <Link href={href} className="text-[12px] text-zinc-500 no-underline transition-colors hover:text-zinc-900">
          全部 →
        </Link>
      </div>
      <div className="mt-3 divide-y divide-zinc-100">
        {items.map((r) => (
          <Link key={r.slug} href={`${TYPE_HREF[type]}/${r.slug}/`} className="group flex items-center gap-3 py-3 no-underline">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-[1px] ${dot}`} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-zinc-900 group-hover:underline">{r.title}</span>
              <span className="mt-0.5 block truncate font-mono text-[10.5px] text-zinc-400">
                {r.category} · {r.updatedAt}
              </span>
            </span>
            <Arrow className="h-3.5 w-3.5 text-zinc-300 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-500" />
          </Link>
        ))}
      </div>
    </div>
  );
}

export default async function HomePage() {
  const all = await getAllResources();
  const modules = all.filter((r): r is ModuleResource => r.type === "MODULE");
  const skills = all.filter((r) => r.type === "SKILL");
  const prompts = all.filter((r) => r.type === "PROMPT");
  const sites = all.filter((r) => r.type === "SITE");

  // A small curated set of modules with real structure diagrams for the visual slots.
  const preferred = ["remoe", "adaptconv", "ctf", "ema", "sacm", "mrblock", "can"];
  const preferredModules = preferred
    .map((slug) => modules.find((m) => m.slug === slug))
    .filter((m): m is ModuleResource => Boolean(m));
  const candidates = [...preferredModules, ...modules]
    .filter((m, i, arr) => arr.findIndex((x) => x.slug === m.slug) === i)
    .slice(0, 8);
  const withDiagrams = (
    await Promise.all(candidates.map(async (m) => ({ m, diagram: await getDiagram(m) })))
  ).filter((x): x is { m: ModuleResource; diagram: Diagram } => x.diagram !== null);
  const showcase = withDiagrams.slice(0, 3);

  const recent = [...all].sort(byUpdated);
  const hero = showcase[0]?.m ?? modules[0];
  const heroDiagram = showcase[0]?.diagram ?? null;

  const recentDiscover: HomeItem[] = [];
  if (hero) recentDiscover.push(toItem(hero, heroDiagram));
  for (const r of recent) {
    if (recentDiscover.length >= 9) break;
    if (r.slug === hero?.slug) continue;
    recentDiscover.push(toItem(r));
  }
  const skillDiscover = [...skills].sort(byUpdated).slice(0, 9).map((r) => toItem(r));

  const latestPrompts = [...prompts].sort(byUpdated).slice(0, 4);
  const latestSites = [...sites].sort(byUpdated).slice(0, 4);
  const categories = (await getCategories()).slice(0, 12);

  const typeCards: { key: ResourceType; title: string; count: number; hint: string; href: string; diagrams: Diagram[] }[] = [
    { key: "MODULE", title: "即插即用模块", count: modules.length, hint: "带结构图，复制进项目就能跑", href: "/modules/", diagrams: showcase.map((x) => x.diagram) },
    { key: "SKILL", title: "Agent Skills", count: skills.length, hint: "遵循 Agent Skills 规范，装进你的 Agent", href: "/skills/", diagrams: [] },
    { key: "PROMPT", title: "科研提示词", count: prompts.length, hint: "把研究任务写成可复用的模板", href: "/prompts/", diagrams: [] },
    { key: "SITE", title: "科研导航", count: sites.length, hint: "数据集、工具与机构站点", href: "/directory/", diagrams: [] },
  ];

  return (
    <div className="bg-white">
      <section className="relative overflow-hidden border-b border-rule bg-white">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[460px] bg-[radial-gradient(ellipse_at_top,rgba(0,0,0,0.055),transparent_65%)]" />
        <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center px-4 pb-16 pt-16 text-center sm:px-6 sm:pb-20 sm:pt-24">
          <span className="eyebrow inline-flex items-center gap-2 text-zinc-500">
            <span className="dot" aria-hidden />
            {SITE_NAME} · {SITE_KIND}
          </span>
          <h1 className="mt-6 max-w-3xl text-balance text-[40px] font-semibold leading-[1.08] tracking-[-0.045em] text-zinc-950 sm:text-[62px]">
            让科研 AI 资源，
            <br className="hidden sm:block" />
            真正为你所用。
          </h1>
          <p className="mt-6 max-w-2xl text-[15.5px] font-light leading-8 text-zinc-600">
            提示词、Agent Skills、即插即用代码模块与科研站点导航。筛选、复制、下载，回到你自己的 Agent / IDE 里用。
          </p>
          <div className="mt-8 w-full max-w-2xl">
            <HeroSearch />
          </div>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link href="/modules/" className="btn-ink no-underline">
              浏览全部模块 <Arrow />
            </Link>
            <Link
              href="/skills/"
              className="inline-flex h-11 items-center rounded-xl border border-zinc-200 bg-white px-5 text-[13.5px] font-medium text-zinc-800 no-underline transition-colors hover:border-zinc-300 hover:bg-zinc-50"
            >
              Agent Skills
            </Link>
          </div>
          <p className="mt-6 font-mono text-[11px] tracking-wide text-zinc-400">
            已收录 {all.length} 项资源 · {modules.length} 个模块 · {skills.length} 个 Skills
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="eyebrow text-zinc-400">资源库</span>
            <h2 className="mt-2 text-[26px] font-semibold tracking-[-0.02em] text-zinc-950 sm:text-[30px]">四类资源，一处找齐</h2>
          </div>
          <Link href="/search/" className="link-line text-[13px]">
            全部资源 →
          </Link>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {typeCards.map((card) => (
            <TypeCard key={card.key} card={card} />
          ))}
        </div>
      </section>

      <section className="border-y border-rule bg-zinc-50">
        <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <span className="eyebrow text-zinc-400">发现</span>
              <h2 className="mt-2 text-[26px] font-semibold tracking-[-0.02em] text-zinc-950 sm:text-[30px]">发现当下值得使用的资源</h2>
              <p className="mt-2 text-[13.5px] font-light text-zinc-500">从最近更新与 Agent Skills 中，找到可以直接用的下一件工具。</p>
            </div>
            <Link href="/search/" className="link-line text-[13px]">
              查看全部 →
            </Link>
          </div>
          <HomeDiscover recent={recentDiscover} skills={skillDiscover} />
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="relative overflow-hidden rounded-[32px] border border-zinc-200 bg-gradient-to-br from-zinc-100 via-zinc-50 to-white p-6 sm:p-10">
          <div className="grid items-center gap-8 lg:grid-cols-[1fr_1.15fr]">
            <div>
              <span className="eyebrow text-zinc-500">即插即用模块</span>
              <h2 className="mt-3 text-[28px] font-semibold leading-tight tracking-[-0.03em] text-zinc-950 sm:text-[36px]">把论文里的模块，直接拿进项目。</h2>
              <p className="mt-3 max-w-md text-[13.5px] font-light leading-6 text-zinc-600">
                {modules.length} 个可复用模块，结构图、适用任务、依赖和代码入口一页看完。复制代码或下载 ZIP，回到你的实验里用。
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/modules/" className="btn-ink no-underline">
                  浏览全部 {modules.length} 个模块 <Arrow />
                </Link>
                <Link
                  href="/modules/adaptconv/"
                  className="inline-flex h-11 items-center rounded-xl border border-zinc-300 bg-white/70 px-4 text-[13px] font-medium text-zinc-800 no-underline transition-colors hover:bg-white"
                >
                  看一个示例
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {showcase.slice(0, 3).map((x, i) => (
                <div key={x.m.slug} className={i === 0 ? "col-span-2" : ""}>
                  <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white p-2.5 shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element -- images are served by Caddy */}
                    <img src={x.diagram.src} width={x.diagram.width} height={x.diagram.height} alt={x.diagram.alt} loading="lazy" decoding="async" className="h-24 w-full object-contain sm:h-28" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-14 sm:px-6">
        <div className="mb-5 flex items-end justify-between gap-3">
          <div>
            <span className="eyebrow text-zinc-400">继续探索</span>
            <h2 className="mt-2 text-[26px] font-semibold tracking-[-0.02em] text-zinc-950 sm:text-[30px]">提示词与科研导航</h2>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <MiniList title="最新提示词" href="/prompts/" items={latestPrompts} type="PROMPT" dot="bg-gold" />
          <MiniList title="科研导航" href="/directory/" items={latestSites} type="SITE" dot="bg-zinc-400" />
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3 border-t border-rule pt-10">
          <div>
            <span className="eyebrow text-zinc-400">分类索引</span>
            <h2 className="mt-2 text-[26px] font-semibold tracking-[-0.02em] text-zinc-950 sm:text-[30px]">按分类找资源</h2>
          </div>
          <Link href="/search/" className="link-line text-[13px]">
            全部 {all.length} 项 →
          </Link>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {categories.map((c) => (
            <Link
              key={c.name}
              href={`/search/?q=${encodeURIComponent(c.name)}`}
              className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3.5 py-2 text-[13px] text-zinc-700 no-underline transition-colors hover:border-zinc-300 hover:text-zinc-950"
            >
              {c.name}
              <span className="font-mono text-[10.5px] text-zinc-400">{c.count}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
