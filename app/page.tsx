import type { Metadata } from "next";
import Link from "next/link";
import { getAllResources, getAttachment, getCategories, getDiagram, getPopularity, type Diagram } from "@/lib/repo";
import { NAV, SITE_KIND, SITE_NAME } from "@/lib/site";
import { RELEASES } from "@/lib/changelog";
import { SEARCH_MODES } from "@/lib/external-search";
import { TYPE_HREF, TYPE_LABEL, type ModuleResource, type Resource, type ResourceType, type SkillResource } from "@/lib/types";
import { LogoMark } from "@/components/brand/logo-mark";
import { ExternalSearch } from "@/components/external-search";
import { TypedTitle } from "@/components/home/typed-title";
import { RotatingSearch } from "@/components/home/rotating-search";
import { Carousel } from "@/components/home/carousel";
import { Discover, type RankItem } from "@/components/home/discover";
import { Steps } from "@/components/home/steps";
import { CountUp } from "@/components/home/count-up";

export const metadata: Metadata = {
  title: `${SITE_NAME} · ${SITE_KIND}`,
  description: "提示词、Agent Skills、即插即用代码模块与科研站点导航。筛选、复制、下载，回到你自己的 Agent / IDE 里用。",
  alternates: { canonical: "/" },
};

const TONE: Record<ResourceType, string> = {
  PROMPT: "oklch(55% 0.11 75)",
  SKILL: "oklch(45% 0.1 190)",
  MODULE: "oklch(22% 0 0)",
  SITE: "oklch(52% 0.16 35)",
};
const glyphOf = (title: string) => (/[一-鿿]|[A-Za-z0-9]/.exec(title)?.[0] ?? "研").toUpperCase();
const hrefOf = (r: Resource) => `${TYPE_HREF[r.type]}/${r.slug}/`;

const Arrow = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden>
    <path d="M4 12h15m-5-6 6 6-6 6" />
  </svg>
);

/** One showroom card in the carousel. */
function Slide({ eyebrow, title, sub, href, cta, dark = false, children }: { eyebrow: string; title: string; sub: string; href: string; cta: string; dark?: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`group relative flex h-[300px] overflow-hidden rounded-[28px] no-underline sm:h-[320px] ${dark ? "bg-zinc-950 text-white" : "bg-[#f3f3f4] text-zinc-950"}`}
    >
      {dark && <div aria-hidden className="absolute inset-0 [background:radial-gradient(circle_at_85%_15%,oklch(52%_0.16_35/0.45),transparent_50%),radial-gradient(circle_at_10%_100%,oklch(45%_0.1_190/0.5),transparent_55%)]" />}
      <div className="relative z-10 flex w-full flex-col p-7 sm:w-[46%] sm:p-8">
        <span className={`text-[13px] ${dark ? "text-white/60" : "text-zinc-500"}`}>{eyebrow}</span>
        <span className="mt-3 text-[22px] font-semibold leading-snug sm:text-[24px]">{title}</span>
        <span className={`mt-1.5 text-[15px] leading-6 ${dark ? "text-white/75" : "text-zinc-700"}`}>{sub}</span>
        <span className={`mt-auto inline-flex items-center gap-1.5 text-[14px] ${dark ? "text-white/80" : "text-zinc-600"} group-hover:gap-2.5 transition-all`}>
          {cta} <Arrow className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="absolute bottom-0 right-0 top-0 hidden w-[54%] items-center sm:flex">{children}</div>
    </Link>
  );
}

const Panel = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`translate-x-6 rounded-[18px] bg-white p-4 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.35)] transition-transform duration-500 group-hover:translate-x-3 ${className}`}>{children}</div>
);

export default async function HomePage() {
  const [all, categories, pop] = await Promise.all([getAllResources(), getCategories(), getPopularity()]);
  const modules = all.filter((r): r is ModuleResource => r.type === "MODULE");
  const skills = all.filter((r): r is SkillResource => r.type === "SKILL");
  const prompts = all.filter((r) => r.type === "PROMPT");
  const sites = all.filter((r) => r.type === "SITE");
  const stat = (r: Resource) => pop.get(r.slug) ?? { views: 0, downloads: 0 };
  const totals = [...pop.values()].reduce((a, b) => ({ views: a.views + b.views, downloads: a.downloads + b.downloads }), { views: 0, downloads: 0 });

  // visuals from real content
  const diagrams = (await Promise.all(modules.slice(0, 12).map((m) => getDiagram(m)))).filter((d): d is Diagram => !!d).slice(0, 3);
  const freeModule = modules.find((m) => m.tier === "FREE");
  const code = freeModule ? ((await getAttachment(freeModule, freeModule.entry.replace(/^files\//, ""))) ?? "") : "";
  const sampleSkill = skills.find((s) => s.redistribution) ?? skills[0];
  const samplePrompt = prompts[0];
  const latest = RELEASES[0];

  // rankings
  const toRank = (r: Resource): RankItem => ({
    href: hrefOf(r),
    title: r.title,
    summary: r.summary,
    typeLabel: TYPE_LABEL[r.type],
    category: r.category,
    views: stat(r).views,
    downloads: stat(r).downloads,
    glyph: glyphOf(r.title),
    tone: TONE[r.type],
  });
  const score = (r: Resource) => stat(r).views + stat(r).downloads * 3;
  const hot = [...all].filter((r) => r.type !== "SITE").sort((a, b) => score(b) - score(a) || b.updatedAt.localeCompare(a.updatedAt)).slice(0, 9).map(toRank);
  const fresh = [...all].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 9).map(toRank);
  const skillRank = [...skills].sort((a, b) => score(b) - score(a) || b.updatedAt.localeCompare(a.updatedAt)).slice(0, 9).map(toRank);

  const hotWords = [...new Set([...categories.map((c) => c.name), "降重", "统计检验", "文献综述", "论文配图"])].slice(0, 8);
  const half = Math.ceil(categories.length / 2);
  const rows = [categories.slice(0, half), categories.slice(half)].filter((r) => r.length);

  const engines = SEARCH_MODES.flatMap((m) => m.engines.map((e) => e.name)).slice(0, 14);

  return (
    <div className="bg-white">
      {/* ── hero ── */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-[-240px] h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,oklch(90%_0.04_40/0.55),transparent)] blur-2xl" />
        <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center px-4 pb-14 pt-20 text-center sm:px-6 sm:pt-28">
          <TypedTitle
            lines={["让你的科研，装上", "学术蒟蒻的 AI 工具箱"]}
            accent="学术蒟蒻"
            className="text-balance text-[36px] font-semibold leading-[1.18] tracking-[-0.03em] text-zinc-950 sm:text-[56px]"
            after={
              <span className="bob ml-1 inline-block -translate-y-[0.55em] align-middle">
                <LogoMark size={30} />
              </span>
            }
          />
          <p className="fade-up mt-5 text-[17px] text-zinc-500 [animation-delay:900ms] sm:text-[19px]">让提示词、Skills 与代码模块被使用、被复用、被分享</p>
          <div className="fade-up mt-10 flex w-full flex-col items-center gap-3 [animation-delay:1100ms] sm:flex-row sm:justify-center">
            <RotatingSearch examples={hotWords} />
            <Link href="/search/" className="inline-flex h-[52px] shrink-0 items-center gap-2 rounded-full bg-zinc-950 px-6 text-[15px] font-medium text-white no-underline transition-colors hover:bg-zinc-800">
              浏览全部资源 <Arrow />
            </Link>
          </div>
          <p className="fade-up mt-5 font-mono text-[12px] tracking-wide text-zinc-400 [animation-delay:1300ms]">
            已收录 {all.length} 项 · {modules.length} 个模块 · {skills.length} 个 Skills · {prompts.length} 个提示词
          </p>
        </div>
      </section>

      {/* ── showroom carousel ── */}
      <section className="pb-20" aria-label="精选专区">
        <Carousel label="精选专区">
          <Slide eyebrow={`即插即用模块 · ${modules.length} 个`} title="把论文里的模块，直接拿进项目" sub="结构图、依赖、代码入口一页看完，可下载 ZIP" href="/modules/" cta="浏览模块">
            {diagrams.length ? (
              <Panel className="grid w-[92%] grid-cols-2 gap-2">
                {diagrams.map((d, i) => (
                  // eslint-disable-next-line @next/next/no-img-element -- served by Caddy
                  <img key={i} src={d.src} alt="" width={d.width} height={d.height} className={`h-24 w-full object-contain ${i === 0 ? "col-span-2" : ""}`} loading="lazy" />
                ))}
              </Panel>
            ) : (
              <Panel className="w-[92%] !bg-zinc-950 !p-5">
                <pre className="m-0 overflow-hidden font-mono text-[11px] leading-[1.6] text-zinc-300 [mask-image:linear-gradient(to_bottom,black_70%,transparent)]">{code.split("\n").slice(0, 11).join("\n") || "def run():\n    ..."}</pre>
              </Panel>
            )}
          </Slide>
          <Slide dark eyebrow={`Agent Skills · ${skills.length} 个`} title="装进你的 Agent，按技能包干活" sub="附官方出处的安装说明：Claude Code、Codex、Cursor、Gemini CLI" href="/skills/" cta="浏览 Skills">
            <Panel className="w-[86%] !bg-white/95 font-mono text-[12px] leading-6 text-zinc-600">
              <div className="text-zinc-400">~/.claude/skills/</div>
              <div className="pl-3 text-zinc-900">{sampleSkill ? (sampleSkill.slug.length > 26 ? `${sampleSkill.slug.slice(0, 26)}…` : sampleSkill.slug) : "paper-review"}/</div>
              <div className="pl-6">SKILL.md</div>
              <div className="pl-6 text-zinc-400">references/</div>
              <div className="mt-2 flex flex-wrap gap-1.5 font-sans text-[11px]">
                {["Claude Code", "Codex", "Cursor", "Gemini CLI"].map((t) => (
                  <span key={t} className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-700">{t}</span>
                ))}
              </div>
            </Panel>
          </Slide>
          <Slide eyebrow={`科研提示词 · ${prompts.length} 个`} title="把研究任务写成可复用的模板" sub="填空即用，复制到任意大模型" href="/prompts/" cta="浏览提示词">
            <Panel className="w-[90%] text-[13px] leading-7 text-zinc-700">
              <div className="font-semibold text-zinc-900">{samplePrompt?.title ?? "论文摘要润色"}</div>
              <div>
                研究主题：<span className="rounded bg-amber-100 px-1 font-mono text-[12px] text-amber-900">{"{{topic}}"}</span>
              </div>
              <div>
                目标期刊：<span className="rounded bg-amber-100 px-1 font-mono text-[12px] text-amber-900">{"{{venue}}"}</span>
              </div>
              <div className="mt-1 text-[12px] text-zinc-400">填入变量 → 复制 → 发送</div>
            </Panel>
          </Slide>
          <Slide dark eyebrow={`科研导航 · ${sites.length} 个站点`} title="常用科研站点，一屏找齐" sub="写明收费、是否需要登录与核验日期" href="/directory/" cta="打开导航">
            <Panel className="grid w-[86%] grid-cols-4 gap-3 !bg-white/95">
              {(sites.length ? sites : all).slice(0, 8).map((r) => (
                <span key={r.slug} className="flex flex-col items-center gap-1">
                  <span className="grid h-10 w-10 place-items-center rounded-xl font-display text-[16px] font-semibold text-white" style={{ background: TONE[r.type] }}>
                    {glyphOf(r.title)}
                  </span>
                  <span className="w-full truncate text-center text-[10.5px] text-zinc-600">{r.title}</span>
                </span>
              ))}
            </Panel>
          </Slide>
          <Slide eyebrow="外部聚合检索 · 7 类" title="一个框，搜遍常用学术站点" sub="知网、万方、PubMed、Google Scholar，在新标签页打开" href="/search/" cta="去搜索">
            <Panel className="flex w-[90%] flex-wrap gap-1.5">
              {engines.map((e) => (
                <span key={e} className="rounded-full border border-zinc-200 px-2.5 py-1 text-[12px] text-zinc-700">{e}</span>
              ))}
            </Panel>
          </Slide>
          <Slide dark eyebrow={`更新日志 · v${latest.version}`} title={latest.title} sub={latest.date} href="/changelog/" cta="查看更新">
            <Panel className="w-[88%] !bg-white/95 text-[12.5px] leading-6 text-zinc-700">
              {latest.items.slice(0, 4).map((it, i) => (
                <div key={i} className="flex gap-2">
                  <span className="shrink-0 rounded bg-zinc-900 px-1.5 text-[10.5px] leading-5 text-white">{it.kind}</span>
                  <span className="line-clamp-1">{it.text}</span>
                </div>
              ))}
            </Panel>
          </Slide>
        </Carousel>
      </section>

      {/* ── discover ── */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[30px] font-semibold tracking-[-0.02em] text-zinc-950 sm:text-[40px]">发现当下值得使用的资源</h2>
            <p className="mt-2 text-[15px] text-zinc-500">按真实的浏览与下载热度排序，快速找到值得一试的工具。</p>
          </div>
          <Link href="/search/" className="inline-flex items-center gap-1.5 text-[14px] text-zinc-500 no-underline hover:text-zinc-900">
            查看更多 <Arrow className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="mt-8">
          <Discover
            tabs={[
              { key: "hot", label: "人气热榜", items: hot },
              { key: "new", label: "最新上架", items: fresh },
              { key: "skills", label: "Skills 榜", items: skillRank },
            ]}
          />
        </div>
      </section>

      {/* ── external search showcase ── */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
        <div className="relative overflow-hidden rounded-[32px] bg-[#f3f3f4] p-6 sm:p-12">
          <div aria-hidden className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,oklch(82%_0.07_188/0.6),transparent)]" />
          <div className="relative grid items-center gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div>
              <span className="text-[13px] text-zinc-500">外部聚合检索</span>
              <h2 className="mt-2 text-[30px] font-semibold leading-tight tracking-[-0.02em] text-zinc-950 sm:text-[36px]">一个框，搜遍常用学术站点</h2>
              <p className="mt-3 max-w-sm text-[15px] leading-7 text-zinc-600">综合、中英文文献、专利、期刊、自媒体与翻译七类检索，在新标签页打开对应网站，本站不读取结果。</p>
            </div>
            <div className="rounded-[24px] bg-white p-2 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.35)]">
              <ExternalSearch compact />
            </div>
          </div>
        </div>
      </section>

      {/* ── how it works ── */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
        <h2 className="text-[30px] font-semibold leading-tight tracking-[-0.02em] text-zinc-950 sm:text-[40px]">
          四步，
          <br />
          把资源用进你的研究
        </h2>
        <p className="mt-3 text-[15px] text-zinc-500">不内置模型、不替你跑结果：资源在你自己的 Agent / IDE 里用。</p>
        <div className="mt-10">
          <Steps
            steps={[
              {
                title: "搜索与筛选",
                text: "按标题、标签、分类搜索，支持拼音和首字母；或者从热榜和分类开始。",
                visual: (
                  <div className="space-y-2.5">
                    <div className="flex h-11 items-center rounded-full bg-white px-4 text-[14px] text-zinc-500 shadow-sm">🔍 {hotWords[1] ?? "统计检验"}</div>
                    {fresh.slice(0, 3).map((r) => (
                      <div key={r.href} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg font-display text-[15px] font-semibold text-white" style={{ background: r.tone }}>{r.glyph}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13.5px] font-medium text-zinc-900">{r.title}</span>
                          <span className="block truncate text-[11.5px] text-zinc-500">{r.typeLabel} · {r.category}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                ),
              },
              {
                title: "看清来源与许可证",
                text: "每个资源写明作者、许可证、能否转载与最近核验时间；第三方内容附来源链接。",
                visual: (
                  <div className="rounded-2xl bg-white p-5 text-[13px] shadow-sm">
                    <div className="text-[12px] font-semibold tracking-wide text-zinc-500">资源信息</div>
                    {[["许可证", sampleSkill?.license ?? "MIT"], ["二次分发", sampleSkill?.redistribution === false ? "仅索引" : "允许"], ["作者", sampleSkill?.author ?? "平台原创"], ["最近更新", sampleSkill?.updatedAt ?? ""]].map(([k, v]) => (
                      <div key={k} className="flex border-t border-zinc-100 py-2.5">
                        <span className="w-20 text-zinc-500">{k}</span>
                        <span className="text-zinc-900">{v}</span>
                      </div>
                    ))}
                  </div>
                ),
              },
              {
                title: "下载或一键复制",
                text: "Skills 和模块可下载 ZIP；Skill 详情页给出每个工具的安装目录和命令。",
                visual: (
                  <div className="rounded-2xl bg-zinc-950 p-5 font-mono text-[12px] leading-6 text-zinc-300 shadow-sm">
                    <div className="text-zinc-500"># macOS / Linux</div>
                    <div>mkdir -p ~/.claude/skills</div>
                    <div className="truncate">curl -fL -o /tmp/s.zip &quot;…/api/download/skills/{sampleSkill?.slug ?? "skill"}/&quot;</div>
                    <div>unzip -o /tmp/s.zip -d ~/.claude/skills/</div>
                  </div>
                ),
              },
              {
                title: "在你的 Agent 里使用",
                text: "Skill 由 Agent 按需加载；提示词复制到任意模型；模块直接放进项目。",
                visual: (
                  <div className="space-y-3 text-[13.5px]">
                    <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-zinc-900 px-4 py-2.5 text-white">帮我按期刊要求审一遍这篇稿子</div>
                    <div className="w-fit max-w-[90%] rounded-2xl rounded-bl-md bg-white px-4 py-2.5 text-zinc-800 shadow-sm">
                      <span className="mb-1 block font-mono text-[11px] text-zinc-400">已加载 Skill：{sampleSkill?.title ?? "模拟审稿人"}</span>
                      好的，我先确认目标期刊和稿件类型，再按五个维度逐条给出可执行的修改意见。
                    </div>
                  </div>
                ),
              },
            ]}
          />
        </div>
      </section>

      {/* ── numbers ── */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
        <div className="grid grid-cols-2 gap-y-10 rounded-[32px] border border-zinc-200 px-6 py-12 text-center sm:grid-cols-5">
          {[
            ["收录资源", all.length],
            ["Agent Skills", skills.length],
            ["即插即用模块", modules.length],
            ["累计浏览", totals.views],
            ["累计下载", totals.downloads],
          ].map(([label, v]) => (
            <div key={label as string}>
              <div className="text-[32px] font-semibold tracking-[-0.02em] text-zinc-950 sm:text-[40px]">
                <CountUp value={v as number} />
              </div>
              <div className="mt-1 text-[13px] text-zinc-500">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── categories marquee ── */}
      {rows.length > 0 && (
        <section className="pb-24" aria-labelledby="cat-h">
          <div className="mx-auto w-full max-w-6xl px-4 text-center sm:px-6">
            <h2 id="cat-h" className="text-[28px] font-semibold tracking-[-0.02em] text-zinc-950 sm:text-[36px]">按分类找资源</h2>
            <p className="mt-2 text-[15px] text-zinc-500">{categories.length} 个分类，持续更新。</p>
          </div>
          <div className="marquee-host mt-8 space-y-3 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
            {rows.map((row, ri) => (
              <div key={ri} className={`marquee flex w-max gap-3 ${ri % 2 ? "marquee-reverse" : ""}`} style={{ ["--marquee-duration" as string]: `${Math.max(30, row.length * 6)}s` }}>
                {[...row, ...row, ...row, ...row].map((c, i) => (
                  <Link
                    key={`${c.name}-${i}`}
                    href={`/search/?q=${encodeURIComponent(c.name)}`}
                    tabIndex={i < row.length ? undefined : -1}
                    aria-hidden={i < row.length ? undefined : true}
                    className="inline-flex shrink-0 items-center gap-2 rounded-full border border-zinc-200 bg-white px-5 py-2.5 text-[14px] text-zinc-800 no-underline transition-colors hover:border-zinc-400"
                  >
                    {c.name}
                    <span className="font-mono text-[11px] text-zinc-400">{c.count}</span>
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── closing CTA ── */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
        <div className="relative flex flex-col items-start gap-6 overflow-hidden rounded-[32px] bg-zinc-950 px-8 py-10 text-white sm:flex-row sm:items-center sm:px-12">
          <div aria-hidden className="absolute inset-0 [background:radial-gradient(circle_at_90%_50%,oklch(52%_0.16_35/0.45),transparent_45%)]" />
          <span className="bob relative">
            <LogoMark size={48} />
          </span>
          <div className="relative flex-1">
            <h2 className="text-[24px] font-semibold sm:text-[28px]">从一个 Skill 开始</h2>
            <p className="mt-1 text-[14.5px] text-white/70">学术新手也能用的工具箱：选一个，下载，装进你的 Agent。</p>
          </div>
          <div className="relative flex flex-wrap gap-3">
            {NAV.slice(0, 2).map((n, i) => (
              <Link key={n.href} href={n.href} className={`inline-flex h-11 items-center gap-2 rounded-full px-5 text-[14px] font-medium no-underline ${i === 0 ? "bg-white text-zinc-950 hover:bg-zinc-100" : "border border-white/30 text-white hover:bg-white/10"}`}>
                浏览{n.label} {i === 0 && <Arrow className="h-3.5 w-3.5" />}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
