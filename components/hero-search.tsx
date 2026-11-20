"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

const HOT = ["提示词", "Skills", "模块", "科研导航"];

export function HeroSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");

  function go(query: string) {
    const v = query.trim();
    router.push(v ? `/search/?q=${encodeURIComponent(v)}` : "/search/");
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    go(q);
  }

  return (
    <div className="w-full">
      <form onSubmit={submit} className="relative">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索提示词、Skills、模块或科研站点…"
          aria-label="搜索资源"
          className="h-14 w-full rounded-2xl border border-zinc-200 bg-white pl-12 pr-28 text-[15px] text-zinc-900 shadow-[0_12px_40px_-24px_rgba(0,0,0,0.35)] outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-4 focus:ring-zinc-900/5"
        />
        <button
          type="submit"
          className="absolute right-2 top-2 inline-flex h-10 items-center rounded-xl bg-zinc-900 px-4 text-[13.5px] font-medium text-white transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30"
        >
          搜索
        </button>
      </form>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[12px] text-zinc-500">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400">热门</span>
        {HOT.map((t) => (
          <button
            key={t}
            onClick={() => go(t)}
            className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[12.5px] text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-900"
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
