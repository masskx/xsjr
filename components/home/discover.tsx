"use client";
import Link from "next/link";
import { useState } from "react";

export interface RankItem {
  href: string;
  title: string;
  summary: string;
  typeLabel: string;
  category: string;
  views: number;
  downloads: number;
  glyph: string;
  tone: string;
}

const num = (n: number) => (n >= 10000 ? `${(n / 10000).toFixed(1)} 万` : String(n));

function Glyph({ item, size = 40 }: { item: RankItem; size?: number }) {
  return (
    <span aria-hidden className="grid shrink-0 place-items-center rounded-xl font-display font-semibold text-white" style={{ width: size, height: size, background: item.tone, fontSize: size * 0.44 }}>
      {item.glyph}
    </span>
  );
}

const Stat = ({ item, light = false }: { item: RankItem; light?: boolean }) => (
  <span className={`inline-flex shrink-0 items-center gap-2.5 font-mono text-[12px] ${light ? "text-white/70" : "text-zinc-500"}`}>
    <span title="浏览">◉ {num(item.views)}</span>
    {item.downloads > 0 && <span title="下载">↓ {num(item.downloads)}</span>}
  </span>
);

/** "发现" section: tabs (热门 / 最新 / Skills), a dark featured card for #1, a numbered list. */
export function Discover({ tabs }: { tabs: { key: string; label: string; items: RankItem[] }[] }) {
  const [active, setActive] = useState(0);
  const items = tabs[active]?.items ?? [];
  const [top, ...rest] = items;
  return (
    <div>
      <div role="tablist" aria-label="榜单" className="flex gap-6 border-b border-zinc-200">
        {tabs.map((t, i) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={i === active}
            onClick={() => setActive(i)}
            className={`-mb-px border-b-2 pb-3 text-[15px] transition-colors ${i === active ? "border-zinc-900 font-semibold text-zinc-950" : "border-transparent text-zinc-500 hover:text-zinc-800"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {top && (
        <div key={active} role="tabpanel" className="fade-up mt-6 grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <Link href={top.href} className="group relative flex min-h-[260px] flex-col overflow-hidden rounded-[24px] bg-zinc-950 p-6 text-white no-underline">
            <div aria-hidden className="absolute inset-0 opacity-40 [background:radial-gradient(circle_at_80%_10%,rgba(255,255,255,0.18),transparent_55%)]" />
            <span className="relative font-mono text-[11px] tracking-[0.14em] text-white/60">{tabs[active].label} · 榜首</span>
            <span className="relative mt-5">
              <Glyph item={top} size={48} />
            </span>
            <span className="relative mt-4 text-[22px] font-semibold leading-snug">{top.title}</span>
            <span className="relative mt-2 line-clamp-3 text-[13px] font-light leading-6 text-white/70">{top.summary}</span>
            <span className="relative mt-auto flex items-center justify-between gap-2 pt-5">
              <span className="text-[12px] text-white/60">{top.typeLabel} · {top.category}</span>
              <Stat item={top} light />
            </span>
          </Link>
          <ol className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-x-6 sm:grid-cols-2">
            {rest.map((it, i) => (
              <li key={it.href}>
                <Link href={it.href} className="group flex items-center gap-3 rounded-2xl px-2 py-3 no-underline transition-colors hover:bg-zinc-50">
                  <span className="w-6 shrink-0 font-mono text-[12px] text-zinc-400">{String(i + 2).padStart(2, "0")}</span>
                  <Glyph item={it} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-medium text-zinc-900 group-hover:underline">{it.title}</span>
                    <span className="mt-0.5 block truncate text-[12px] text-zinc-500">{it.typeLabel} · {it.category}</span>
                  </span>
                  <Stat item={it} />
                </Link>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
