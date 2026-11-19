"use client";

import { useMemo, useState } from "react";
import type { SearchDoc } from "@/lib/search";
import { ResourceCard } from "./resource-card";

export function TypeListing({ docs }: { docs: SearchDoc[] }) {
  const [cat, setCat] = useState<string>("ALL");
  const [tag, setTag] = useState<string>("ALL");

  const categories = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of docs) m.set(d.category, (m.get(d.category) ?? 0) + 1);
    return [...m.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [docs]);

  const tags = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of docs) {
      if (cat !== "ALL" && d.category !== cat) continue;
      for (const t of d.tags) m.set(t, (m.get(t) ?? 0) + 1);
    }
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"))
      .slice(0, 12);
  }, [docs, cat]);

  const list = useMemo(
    () =>
      docs.filter(
        (d) =>
          (cat === "ALL" || d.category === cat) &&
          (tag === "ALL" || d.tags.includes(tag)),
      ),
    [docs, cat, tag],
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-zinc-200 pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-medium uppercase tracking-wider text-zinc-400">
            分类
          </span>
          <Chip active={cat === "ALL"} onClick={() => setCat("ALL")}>
            全部 {docs.length}
          </Chip>
          {categories.map((c) => (
            <Chip
              key={c.name}
              active={cat === c.name}
              onClick={() => {
                setCat(c.name);
                setTag("ALL");
              }}
            >
              {c.name} {c.count}
            </Chip>
          ))}
        </div>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-100 py-2.5">
          <span className="mr-1 text-[11px] font-medium uppercase tracking-wider text-zinc-400">
            标签
          </span>
          <Chip active={tag === "ALL"} onClick={() => setTag("ALL")}>
            全部
          </Chip>
          {tags.map(([t, n]) => (
            <Chip key={t} active={tag === t} onClick={() => setTag(t)}>
              {t} {n}
            </Chip>
          ))}
        </div>
      )}

      {list.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-zinc-300 py-16 text-center text-sm text-zinc-500">
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
      className={`rounded-md px-2 py-1 text-[12px] transition-colors ${
        active
          ? "bg-zinc-900 text-white"
          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}
