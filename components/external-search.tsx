"use client";
import { useEffect, useId, useState, type FormEvent } from "react";
import { SEARCH_MODES, buildSearchUrl } from "@/lib/external-search";

const KEY = "rh-external-search";

/**
 * 外部聚合检索: pick a mode and an engine, the query opens on that site in a new tab. The last
 * choice is remembered in this browser only (localStorage; optional).
 */
export function ExternalSearch({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState(0);
  const [engine, setEngine] = useState(0);
  const [q, setQ] = useState("");
  const id = useId();
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as { m?: number; e?: number } | null;
      if (saved && SEARCH_MODES[saved.m ?? -1]) {
        setMode(saved.m!);
        setEngine(SEARCH_MODES[saved.m!].engines[saved.e ?? 0] ? saved.e! : 0);
      }
    } catch {
      /* private mode or blocked storage: defaults are fine */
    }
  }, []);
  const remember = (m: number, e: number) => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ m, e }));
    } catch {
      /* ignore */
    }
  };
  const current = SEARCH_MODES[mode];
  const eng = current.engines[engine] ?? current.engines[0];

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    window.open(buildSearchUrl(eng.url, q), "_blank", "noopener,noreferrer");
  }

  return (
    <div className={compact ? "" : "surface p-4 shadow-sm sm:p-6"}>
      <div role="tablist" aria-label="检索类型" className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {SEARCH_MODES.map((m, i) => (
          <button
            key={m.key}
            type="button"
            role="tab"
            aria-selected={i === mode}
            aria-controls={`${id}-panel`}
            onClick={() => {
              setMode(i);
              setEngine(0);
              remember(i, 0);
            }}
            className={`shrink-0 rounded-[3px] px-3 py-1.5 text-[14px] transition-colors ${i === mode ? "bg-ink text-white" : "text-zinc-700 hover:bg-paper-deep"}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div id={`${id}-panel`} role="tabpanel">
        <form onSubmit={submit} className="relative mt-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`${current.placeholder} · 在 ${eng.name} 中打开`}
            aria-label={`${current.label}：在 ${eng.name} 中搜索`}
            className="h-12 w-full rounded-[3px] border border-edge/30 bg-paper-raised pl-4 pr-28 text-[15px] text-zinc-900 outline-none placeholder:text-zinc-500 focus:border-zinc-900"
          />
          <button type="submit" className="btn-ink absolute right-1 top-1 !min-h-10 !px-4 text-sm">
            搜索 ↗
          </button>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="搜索引擎">
          {current.engines.map((en, i) => (
            <button
              key={en.name}
              type="button"
              role="radio"
              aria-checked={i === engine}
              onClick={() => {
                setEngine(i);
                remember(mode, i);
              }}
              className={`rounded-[3px] border px-2.5 py-1 text-[13px] transition-colors ${i === engine ? "border-zinc-900 bg-paper-raised font-medium text-zinc-900" : "border-rule text-zinc-600 hover:text-zinc-900"}`}
            >
              {en.name}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11.5px] text-zinc-500">在新标签页打开第三方网站，本站不读取、不保存搜索结果。</p>
      </div>
    </div>
  );
}
