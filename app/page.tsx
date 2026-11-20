import Link from "next/link";
import { getAllResources, getCategories } from "@/lib/repo";
import { NAV, SITE_KIND, SITE_NAME } from "@/lib/site";
import { AiTimeline } from "@/components/ai-timeline";
import { ExternalSearch } from "@/components/external-search";
import { TYPE_LABEL, type ResourceType } from "@/lib/types";
import { ResourceCard } from "@/components/resource-card";
import { HeroSearch } from "@/components/hero-search";

const ENTRY_META: Record<string, { type: ResourceType; hint: string }> = {
  "/prompts": { type: "PROMPT", hint: "填空即用，复制到任意模型" },
  "/skills": { type: "SKILL", hint: "遵循 Agent Skills 规范" },
  "/modules": { type: "MODULE", hint: "可直接复制进项目" },
  "/directory": { type: "SITE", hint: "数据集、工具与机构站点" },
};

const Arrow = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className} aria-hidden>
    <path d="M4 12h15m-5-6 6 6-6 6" />
  </svg>
);

function SectionTag({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <span className="tag-gold">
      {n} <span aria-hidden>·</span> {children}
    </span>
  );
}

export default async function HomePage() {
  const all = await getAllResources();
  const featured = all.filter((r) => r.featured).slice(0, 3);
  // "最近更新": newest content date first (stable sort keeps the display order for equal dates)
  const recent = [...all].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 9);
  const categories = (await getCategories()).slice(0, 10);
  const latest = all[0]?.updatedAt ?? "";

  return (
    <div>
      <section className="border-b border-rule">
        <div className="mx-auto grid w-full max-w-6xl items-end gap-10 px-4 pb-12 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div>
            <span className="eyebrow inline-flex items-center gap-2 text-zinc-600">
              <span className="dot" aria-hidden />
              {SITE_KIND} · Academic Juruo
            </span>
            <h1 className="display mt-6 text-[40px] sm:text-[56px] lg:text-[60px]">
              给学术新手的
              <br />
              AI 工具箱。
            </h1>
            <p className="mt-6 max-w-xl text-[16px] font-light leading-[1.8] text-zinc-700">
              找到能直接用的科研 AI 资源，复制或下载，回到你自己的工具里用：提示词模板、Agent Skills、可复用代码模块与科研网站导航。平台只做筛选、规范化描述与分发——不内置模型、不替你跑结果、不执行任何第三方脚本。
            </p>
          </div>
          <div>
            <span className="eyebrow text-zinc-500">站内搜索</span>
            <HeroSearch />
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[12px] tracking-wide text-zinc-500">
              <span>
                共 <b className="font-semibold text-zinc-900">{all.length}</b> 项资源
              </span>
              <span>
                <b className="font-semibold text-zinc-900">{categories.length}</b> 个分类
              </span>
              <span>最近更新 {latest}</span>
            </div>
          </div>
        </div>
      </section>

      <AiTimeline />

      <section className="mx-auto w-full max-w-6xl px-4 pt-16 sm:px-6">
        <SectionTag n="01">外部聚合检索</SectionTag>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-2">
          <h2 className="headline text-[34px] sm:text-[40px]">一个框，搜遍常用学术站点</h2>
          <Link href="/search/" className="link-line text-[14px]">站内资源搜索 →</Link>
        </div>
        <div className="mt-6">
          <ExternalSearch />
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
        <SectionTag n="02">四类资源</SectionTag>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {NAV.map((n) => {
            const meta = ENTRY_META[n.href];
            const count = all.filter((r) => r.type === meta.type).length;
            return (
              <Link
                key={n.href}
                href={n.href}
                className="surface group flex flex-col p-5 no-underline transition-shadow duration-200 hover:shadow-md"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="headline text-[28px]">{n.label}</span>
                  <span className="font-mono text-[12px] text-zinc-500">{count}</span>
                </div>
                <p className="mt-2 text-[13px] font-light leading-6 text-zinc-600">
                  {meta.hint}
                </p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-zinc-900">
                  浏览{TYPE_LABEL[meta.type]}
                  <Arrow className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="rule-dots" aria-hidden />

      {featured.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-4 pt-16 sm:px-6">
          <SectionTag n="03">人工核验</SectionTag>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-2">
            <h2 className="headline text-[36px] sm:text-[44px]">编辑精选</h2>
            <span className="text-[13px] font-light text-zinc-600">
              人工核验过可用性与来源
            </span>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((r) => (
              <ResourceCard key={r.slug} resource={r} />
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <SectionTag n={featured.length > 0 ? "04" : "03"}>新近收录</SectionTag>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-2">
          <h2 className="headline text-[36px] sm:text-[44px]">最近更新</h2>
          <Link href="/search/" className="link-line inline-flex items-center gap-1.5 text-[14px]">
            查看全部 <Arrow className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {recent.map((r) => (
            <ResourceCard key={r.slug} resource={r} />
          ))}
        </div>
      </section>

      <div className="rule-dots" aria-hidden />

      <section className="mx-auto w-full max-w-6xl px-4 pb-8 pt-16 sm:px-6">
        <SectionTag n={featured.length > 0 ? "05" : "04"}>分类索引</SectionTag>
        <h2 className="headline mt-5 text-[36px] sm:text-[44px]">按分类浏览</h2>
        <div className="mt-6 flex flex-wrap gap-2">
          {categories.map((c) => (
            <Link
              key={c.name}
              href={`/search/?q=${encodeURIComponent(c.name)}`}
              className="inline-flex items-center gap-2 rounded-[3px] border border-rule bg-paper-raised px-3 py-2 text-[14px] text-zinc-800 no-underline shadow-xs transition-shadow hover:shadow-md"
            >
              {c.name}
              <span className="font-mono text-[11px] text-zinc-500">{c.count}</span>
            </Link>
          ))}
        </div>

        <div className="surface mt-14 grid gap-8 p-6 sm:p-8 md:grid-cols-[1fr_1.4fr]">
          <h3 className="headline text-[30px]">
            {SITE_NAME}做什么、不做什么
          </h3>
          <div className="grid gap-6 text-[14px] font-light leading-7 text-zinc-700 sm:grid-cols-2">
            <p>
              <span className="eyebrow mb-2 block text-patina-deep">做</span>
              资源分类与检索、参数化提示词、Skill 包说明与下载、代码模块复用、
              科研站点导航、版本与许可证信息、来源核验记录。
            </p>
            <p>
              <span className="eyebrow mb-2 block text-zinc-500">不做</span>
              不内置大模型对话、不生成实验结果、不执行上传的脚本、
              不读取你的科研数据。所有内容在你自己的 Agent / IDE 里使用。
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
