"use client";

import { useMemo, useState } from "react";
import type { SearchDoc } from "@/lib/search";
import { ResourceCard } from "./resource-card";

export function TypeListing({ docs }: { docs: SearchDoc[] }) {
  const [cat, setCat] = useState<string>("ALL");

  const categories = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of docs) m.set(d.category, (m.get(d.category) ?? 0) + 1);
    return [...m.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [docs]);

  const list = useMemo(
    () => docs.filter((d) => cat === "ALL" || d.category === cat),
    [docs, cat],
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-rule pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="eyebrow mr-2 text-zinc-500">
            分类
          </span>
          <Chip active={cat === "ALL"} onClick={() => setCat("ALL")}>
            全部 {docs.length}
          </Chip>
          {categories.map((c) => (
            <Chip
              key={c.name}
              active={cat === c.name}
              onClick={() => setCat(c.name)}
            >
              {c.name} {c.count}
            </Chip>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-zinc-300 py-16 text-center text-sm font-light text-zinc-600">
          这个筛选组合下还没有资源。
        </div>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((d) => (
            <ResourceCard key={`${d.type}-${d.slug}`} resource={d} />
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-[3px] px-2.5 py-1 text-[13px] transition-colors ${
        active
          ? "bg-ink text-white"
          : "text-zinc-700 hover:bg-paper-deep"
      }`}
    >
      {children}
    </button>
  );
}
