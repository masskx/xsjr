"use client";

import Link from "next/link";
import { useState } from "react";
import { TYPE_HREF, TYPE_LABEL, type ResourceType } from "@/lib/types";

export interface HomeDiagram {
  src: string;
  width: number;
  height: number;
  alt: string;
}

export interface HomeItem {
  slug: string;
  type: ResourceType;
  title: string;
  summary: string;
  category: string;
  updatedAt: string;
  diagram?: HomeDiagram | null;
}

const TYPE_DOT: Record<ResourceType, string> = {
  PROMPT: "bg-gold",
  SKILL: "bg-patina",
  MODULE: "bg-gold-deep",
  SITE: "bg-zinc-400",
};

const Arrow = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4 shrink-0 text-zinc-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-zinc-500" aria-hidden>
    <path d="M4 12h15m-5-6 6 6-6 6" />
  </svg>
);

export function HomeDiscover({ recent, skills }: { recent: HomeItem[]; skills: HomeItem[] }) {
  const [tab, setTab] = useState<"recent" | "skills">("recent");
  const items = tab === "recent" ? recent : skills;
  if (items.length === 0) return null;

  const feature = items[0];
  const list = items.slice(1, 9);

  return (
    <div>
      <div className="mt-7 flex items-end justify-between gap-4 border-b border-zinc-200">
        <div className="flex gap-6">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "recent"}
            onClick={() => setTab("recent")}
            className={`relative -mb-px border-b-2 pb-3 text-[14px] font-medium transition-colors ${
              tab === "recent" ? "border-zinc-900 text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-800"
            }`}
          >
            最近更新
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "skills"}
            onClick={() => setTab("skills")}
            className={`relative -mb-px border-b-2 pb-3 text-[14px] font-medium transition-colors ${
              tab === "skills" ? "border-zinc-900 text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-800"
            }`}
          >
            Agent Skills
          </button>
        </div>
        <span className="pb-3 font-mono text-[11px] text-zinc-400">{items.length} 项</span>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <Link
          href={`${TYPE_HREF[feature.type]}/${feature.slug}/`}
          className="group relative flex min-h-[318px] flex-col overflow-hidden rounded-3xl bg-zinc-900 p-6 text-white no-underline sm:p-8"
        >
          <span aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          <div className="relative flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400">
            <span className={`h-1.5 w-1.5 rounded-[1px] ${TYPE_DOT[feature.type]}`} />
            {TYPE_LABEL[feature.type]} · {tab === "recent" ? "最近更新" : "Agent Skills"}
          </div>
          <h3 className="relative mt-4 max-w-md text-[24px] font-semibold leading-tight tracking-[-0.02em] text-white sm:text-[28px]">
            {feature.title}
          </h3>
          <p className="relative mt-3 line-clamp-3 max-w-md text-[13.5px] font-light leading-6 text-zinc-300">
            {feature.summary}
          </p>
          <div className="relative mt-5 flex items-center gap-2 font-mono text-[11px] text-zinc-500">
            <span>{feature.category}</span>
            <span aria-hidden>·</span>
            <span>{feature.updatedAt}</span>
          </div>

          {feature.diagram ? (
            <div className="relative mt-auto pt-6">
              <div className="overflow-hidden rounded-2xl bg-white p-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element -- images are served by Caddy */}
                <img
                  src={feature.diagram.src}
                  width={feature.diagram.width}
                  height={feature.diagram.height}
                  alt={feature.diagram.alt}
                  loading="lazy"
                  decoding="async"
                  className="h-28 w-full object-contain"
                />
              </div>
            </div>
          ) : (
            <div aria-hidden className="relative mt-auto pt-8 font-mono text-[64px] font-semibold leading-none text-white/10">
              {TYPE_LABEL[feature.type].slice(0, 1)}
            </div>
          )}

          <span className="relative mt-5 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-white/80 transition-colors group-hover:text-white">
            查看详情 <span aria-hidden>→</span>
          </span>
        </Link>

        <div className="grid overflow-hidden rounded-3xl border border-zinc-200 bg-white sm:grid-cols-2">
          {list.map((item, i) => (
            <Link
              key={`${item.type}-${item.slug}`}
              href={`${TYPE_HREF[item.type]}/${item.slug}/`}
              className="group flex min-w-0 items-center gap-2.5 border-b border-zinc-100 px-4 py-3.5 no-underline transition-colors hover:bg-zinc-50 sm:odd:border-r"
            >
              <span className="w-5 shrink-0 text-right font-mono text-[10.5px] text-zinc-300">{String(i + 1).padStart(2, "0")}</span>
              <span className={`h-1.5 w-1.5 shrink-0 rounded-[1px] ${TYPE_DOT[item.type]}`} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-zinc-900 group-hover:underline">{item.title}</span>
                <span className="mt-0.5 block truncate font-mono text-[10.5px] text-zinc-400">
                  {TYPE_LABEL[item.type]} · {item.category} · {item.updatedAt}
                </span>
              </span>
              <Arrow />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
