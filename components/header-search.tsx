"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function HeaderSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    const query = q.trim();
    router.push(query ? `/search/?q=${encodeURIComponent(query)}` : "/search/");
  }

  return (
    <form onSubmit={submit} className="relative">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="搜索资源…"
        aria-label="搜索资源"
        className="h-9 w-36 rounded-lg border border-zinc-200 bg-zinc-50 pl-8 pr-2 text-sm text-zinc-800 outline-none transition-all placeholder:text-zinc-400 focus:w-52 focus:border-zinc-300 focus:bg-white sm:w-48 sm:focus:w-64"
      />
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400"
        aria-hidden
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
    </form>
  );
}
