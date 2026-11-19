import Link from "next/link";
import type { ReactNode } from "react";
import type { ResourceRow, Status } from "@/lib/admin/resources";
import { Notice, StatusBadge, btn } from "@/components/admin/ui";

const TABS: { key: Status | "ALL"; label: string }[] = [
  { key: "ALL", label: "全部" },
  { key: "PUBLISHED", label: "已发布" },
  { key: "DRAFT", label: "草稿" },
  { key: "ARCHIVED", label: "已归档" },
];

export function parseStatus(s: string | undefined): Status | "ALL" {
  return (TABS.find((t) => t.key === s)?.key ?? "ALL") as Status | "ALL";
}

/** Admin list for one resource type: status tabs, search, reorder, edit link, optional row extras. */
export function ResourceList({
  title,
  base,
  newLabel,
  rows,
  status,
  q,
  msg,
  err,
  moved,
  move,
  extra,
  intro,
}: {
  title: string;
  base: string;
  newLabel: string;
  rows: ResourceRow[];
  status: Status | "ALL";
  q: string;
  msg?: string;
  err?: string;
  moved?: string;
  move: (fd: FormData) => Promise<void>;
  extra?: (row: ResourceRow) => ReactNode;
  intro?: ReactNode;
}) {
  const canReorder = status !== "ARCHIVED" && !q;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">{title}</h1>
        <Link href={`${base}new/`} className={btn.primary}>
          {newLabel}
        </Link>
      </div>
      {intro}
      <div className="mt-5">
        {msg === "archived" && <Notice tone="ok">已归档。可在“已归档”里恢复。</Notice>}
        {err && <Notice tone="error">{err}</Notice>}
      </div>

      <nav aria-label="状态筛选" className="flex flex-wrap gap-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`${base}${t.key === "ALL" ? "" : `?status=${t.key}`}`}
            aria-current={status === t.key ? "page" : undefined}
            className={`rounded-full px-3 py-1 text-[13px] no-underline ${status === t.key ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <form method="get" className="mt-4 flex flex-wrap gap-2" role="search">
        {status !== "ALL" && <input type="hidden" name="status" value={status} />}
        <label className="sr-only" htmlFor="q">
          搜索标题或网址标识
        </label>
        <input id="q" name="q" defaultValue={q} placeholder="搜索标题或网址标识" className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-[13.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 sm:max-w-xs" />
        <button type="submit" className={btn.secondary}>
          搜索
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="mt-8 text-center text-[13.5px] text-zinc-500">没有符合条件的内容。</p>
      ) : (
        <ol className="mt-4 divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white">
          {rows.map((r, i) => (
            <li key={r.id} id={`p-${r.id}`} className={`flex scroll-mt-24 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 ${moved === String(r.id) ? "bg-amber-50/60" : ""}`}>
              <div className="min-w-0 flex-1 basis-60">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`${base}${r.id}/`} className="font-medium text-zinc-900">
                    {r.title}
                  </Link>
                  <StatusBadge status={r.status} />
                  {r.featured && <span className="text-[11.5px] text-amber-700">精选</span>}
                </div>
                <div className="mt-0.5 text-[12px] text-zinc-500">
                  <span className="font-mono">{r.slug}</span> · {r.category ?? "未分类"} · 内容日期 {r.contentUpdatedOn}
                  {r.origin === "FILE_IMPORT" && " · 来自文件导入"}
                </div>
              </div>
              {extra?.(r)}
              <div className="flex items-center gap-1.5">
                {canReorder && (
                  <>
                    <form action={move}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="dir" value="up" />
                      <button type="submit" className={btn.icon} disabled={i === 0} aria-label={`上移 ${r.title}`} title="上移">
                        ↑
                      </button>
                    </form>
                    <form action={move}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="dir" value="down" />
                      <button type="submit" className={btn.icon} disabled={i === rows.length - 1} aria-label={`下移 ${r.title}`} title="下移">
                        ↓
                      </button>
                    </form>
                  </>
                )}
                <Link href={`${base}${r.id}/`} className={btn.secondary}>
                  编辑
                </Link>
              </div>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-3 text-[12.5px] text-zinc-500">列表顺序即网站上的展示顺序（精选内容固定在最前）。</p>
    </div>
  );
}
