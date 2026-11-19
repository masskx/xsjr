import Link from "next/link";
import { getAllResources, getCategories, getResourcesByType } from "@/lib/content";
import { NAV, SITE_NAME } from "@/lib/site";
import { TYPE_LABEL, type ResourceType } from "@/lib/types";
import { ResourceCard } from "@/components/resource-card";
import { HeroSearch } from "@/components/hero-search";

const ENTRY_META: Record<string, { type: ResourceType; hint: string }> = {
  "/prompts": { type: "PROMPT", hint: "填空即用，复制到任意模型" },
  "/skills": { type: "SKILL", hint: "遵循 Agent Skills 规范" },
  "/modules": { type: "MODULE", hint: "可直接复制进项目" },
  "/directory": { type: "SITE", hint: "数据集、工具与机构站点" },
};

const ENTRY_COLOR: Record<string, string> = {
  PROMPT: "from-indigo-500/10 to-transparent",
  SKILL: "from-emerald-500/10 to-transparent",
  MODULE: "from-amber-500/10 to-transparent",
  SITE: "from-sky-500/10 to-transparent",
};

export default function HomePage() {
  const all = getAllResources();
  const featured = all.filter((r) => r.featured).slice(0, 3);
  const recent = all.slice(0, 9);
  const categories = getCategories().slice(0, 10);
  const latest = all[0]?.updatedAt ?? "";

  return (
    <div>
      <section className="border-b border-zinc-100 bg-gradient-to-b from-white to-zinc-50/70">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-600 ring-1 ring-zinc-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            面向科研人员的 AI 资源工作台
          </span>

          <h1 className="mt-5 max-w-3xl text-[30px] font-semibold leading-[1.25] tracking-tight text-zinc-900 sm:text-[42px]">
            找到能直接用的科研 AI 资源，
            <br className="hidden sm:block" />
            复制或下载，回到你自己的工具里用。
          </h1>

          <p className="mt-4 max-w-2xl text-[15px] leading-7 text-zinc-600">
            提示词模板、Agent Skills、可复用代码模块与科研网站导航。平台只做筛选、
            规范化描述与分发——不内置模型、不替你跑结果、不执行任何第三方脚本。
          </p>

          <HeroSearch />

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] text-zinc-500">
            <span>
              共 <b className="font-semibold text-zinc-900">{all.length}</b> 项资源
            </span>
            <span>
              <b className="font-semibold text-zinc-900">{categories.length}</b>{" "}
              个分类
            </span>
            <span>最近更新 {latest}</span>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {NAV.map((n) => {
            const meta = ENTRY_META[n.href];
            const count = getResourcesByType(meta.type).length;
            return (
              <Link
                key={n.href}
                href={n.href}
                className="group relative overflow-hidden rounded-xl border border-zinc-200 bg-white p-4 no-underline transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-16px_rgba(0,0,0,0.25)]"
              >
                <div
                  className={`pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br ${ENTRY_COLOR[meta.type]}`}
                />
                <div className="relative">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold text-zinc-900">
                      {n.label}
                    </span>
                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-500">
                      {count}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[12.5px] leading-5 text-zinc-500">
                    {meta.hint}
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-zinc-400 group-hover:text-zinc-700">
                    浏览{TYPE_LABEL[meta.type]}
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {featured.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-4 pb-4 sm:px-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
              编辑精选
            </h2>
            <span className="text-[12px] text-zinc-400">
              人工核验过可用性与来源
            </span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((r) => (
              <ResourceCard key={r.slug} resource={r} />
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
            最近更新
          </h2>
          <Link
            href="/search/"
            className="text-[12px] text-zinc-500 no-underline hover:text-zinc-900"
          >
            查看全部 →
          </Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {recent.map((r) => (
            <ResourceCard key={r.slug} resource={r} />
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
          按分类浏览
        </h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {categories.map((c) => (
            <Link
              key={c.name}
              href={`/search/?q=${encodeURIComponent(c.name)}`}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[13px] text-zinc-700 no-underline transition-colors hover:border-zinc-300 hover:bg-zinc-50"
            >
              {c.name}
              <span className="ml-1.5 text-[11px] text-zinc-400">{c.count}</span>
            </Link>
          ))}
        </div>

        <div className="mt-10 rounded-xl border border-zinc-200 bg-zinc-50/60 p-5">
          <h3 className="text-sm font-semibold text-zinc-900">
            {SITE_NAME}做什么、不做什么
          </h3>
          <div className="mt-3 grid gap-4 text-[12.5px] leading-6 text-zinc-600 sm:grid-cols-2">
            <p>
              <b className="text-zinc-900">做：</b>
              资源分类与检索、参数化提示词、Skill 包说明与下载、代码模块复用、
              科研站点导航、版本与许可证信息、来源核验记录。
            </p>
            <p>
              <b className="text-zinc-900">不做：</b>
              不内置大模型对话、不生成实验结果、不执行上传的脚本、
              不读取你的科研数据。所有内容在你自己的 Agent / IDE 里使用。
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
