"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

const HOT = ["审稿回复", "统计检验", "文献综述", "科研绘图"];

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
    <div className="mt-8 max-w-xl">
      <form onSubmit={submit} className="relative">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="pointer-events-none absolute left-4 top-4 h-5 w-5 text-zinc-400"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索提示词、Skill、代码模块或科研网站…"
          aria-label="搜索资源"
          className="h-[52px] w-full rounded-xl border border-zinc-200 bg-white pl-12 pr-28 text-[15px] text-zinc-900 shadow-sm outline-none transition-shadow placeholder:text-zinc-400 focus:border-zinc-300 focus:shadow-md"
        />
        <button
          type="submit"
          className="absolute right-2 top-2 h-9 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
        >
          搜索
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-zinc-400">
        <span>常见需求</span>
        {HOT.map((t) => (
          <button
            key={t}
            onClick={() => go(t)}
            className="rounded-md bg-white px-2 py-1 text-zinc-600 ring-1 ring-zinc-200 transition-colors hover:bg-zinc-50 hover:text-zinc-900"
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
