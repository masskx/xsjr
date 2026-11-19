"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { SearchDoc } from "@/lib/search";
import { TYPE_LABEL, type ResourceType } from "@/lib/types";
import { TypeBadge } from "./resource-card";

const TYPE_ORDER: ResourceType[] = ["PROMPT", "SKILL", "MODULE", "SITE"];

function normalize(s: string) {
  return s.toLowerCase().replace(/[\s\-_/·、，,.]/g, "");
}

function score(doc: SearchDoc, q: string): number {
  if (!q) return 1;
  const nq = normalize(q);
  if (!nq) return 1;

  const title = doc.title.toLowerCase();
  const ntitle = normalize(doc.title);
  let s = 0;

  if (title === q) s += 200;
  if (ntitle.startsWith(nq)) s += 120;
  else if (ntitle.includes(nq)) s += 90;

  if (doc.initials.startsWith(nq)) s += 85;
  else if (doc.initials.includes(nq)) s += 45;

  if (doc.pinyin.startsWith(nq)) s += 70;
  else if (doc.pinyin.includes(nq)) s += 35;

  for (const t of doc.tags) {
    const nt = normalize(t);
    if (nt.includes(nq)) s += 40;
  }
  if (normalize(doc.category).includes(nq)) s += 30;
  if (normalize(doc.summary).includes(nq)) s += 20;
  if (normalize(doc.slug).includes(nq)) s += 15;

  return s;
}

export function ResourceSearch({ docs }: { docs: SearchDoc[] }) {
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [type, setType] = useState<ResourceType | "ALL">(
    (params.get("type") as ResourceType) || "ALL",
  );

  useEffect(() => {
    setQ(params.get("q") ?? "");
  }, [params]);

  const results = useMemo(() => {
    return docs
      .map((d) => ({ d, s: score(d, q.trim()) }))
      .filter((x) => x.s > 0 && (type === "ALL" || x.d.type === type))
      .sort((a, b) => b.s - a.s || b.d.updatedAt.localeCompare(a.d.updatedAt))
      .map((x) => x.d);
  }, [docs, q, type]);

  const countAll = docs.length;

  return (
    <div>
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="relative">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="pointer-events-none absolute left-3.5 top-3.5 h-5 w-5 text-zinc-400"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="输入中文、拼音或首字母，例如「审稿」「shengao」「sg」"
            className="h-12 w-full rounded-lg border border-zinc-200 bg-zinc-50 pl-11 pr-24 text-[15px] text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-400 focus:bg-white"
          />
          <span className="absolute right-4 top-4 text-xs text-zinc-400">
            {results.length} / {countAll}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setType("ALL")}
            className={`rounded-md px-2.5 py-1 text-[12px] transition-colors ${
              type === "ALL"
                ? "bg-zinc-900 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            }`}
          >
            全部
          </button>
          {TYPE_ORDER.map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`rounded-md px-2.5 py-1 text-[12px] transition-colors ${
                type === t
                  ? "bg-zinc-900 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      {results.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-zinc-300 py-16 text-center">
          <p className="text-sm text-zinc-500">
            没有找到「{q}」相关的资源。
          </p>
          <p className="mt-2 text-xs text-zinc-400">
            试试更短的关键词，或用标签浏览；也可以
            <Link href="/about/#report" className="mx-1 text-indigo-600">
              告诉我们你缺什么
            </Link>
            。
          </p>
        </div>
      ) : (
        <div className="mt-4 divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {results.map((d) => (
            <Link
              key={`${d.type}-${d.slug}`}
              href={d.href}
              className="group flex items-start gap-3 px-4 py-3.5 no-underline transition-colors hover:bg-zinc-50"
            >
              <div className="mt-0.5 shrink-0">
                <TypeBadge type={d.type} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <h3 className="truncate text-[14px] font-medium text-zinc-900 group-hover:text-indigo-700">
                    {d.title}
                  </h3>
                  {d.tier !== "FREE" && (
                    <span title={`${d.tier} 会员内容`} className="shrink-0 rounded bg-zinc-900 px-1 py-px text-[10px] font-medium text-white">
                      {d.tier}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 line-clamp-1 text-[12.5px] text-zinc-500">
                  {d.summary}
                </p>
                <div className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-zinc-400">
                  <span>{d.category}</span>
                  {d.tags.slice(0, 3).map((t) => (
                    <span key={t}>· {t}</span>
                  ))}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
