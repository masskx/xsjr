import type { Metadata } from "next";
import Link from "next/link";
import { adminData } from "@/lib/admin/server";
import { movePromptAction } from "../actions";
import { Notice, StatusBadge, btn } from "@/components/admin/ui";
import type { Status } from "@/lib/admin/prompts";

export const metadata: Metadata = { title: "提示词" };

const TABS: { key: Status | "ALL"; label: string }[] = [
  { key: "ALL", label: "全部" },
  { key: "PUBLISHED", label: "已发布" },
  { key: "DRAFT", label: "草稿" },
  { key: "ARCHIVED", label: "已归档" },
];

export default async function AdminPromptList({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; category?: string; msg?: string; err?: string; moved?: string }>;
}) {
  const sp = await searchParams;
  const status = (TABS.find((t) => t.key === sp.status)?.key ?? "ALL") as Status | "ALL";
  const q = (sp.q ?? "").slice(0, 60);
  const category = (sp.category ?? "").slice(0, 20);
  const [rows, categories] = await Promise.all([adminData.listPrompts({ status, q, category: category || undefined }), adminData.categories()]);
  const canReorder = status !== "ARCHIVED" && !q && !category;
  const qs = new URLSearchParams({ ...(status !== "ALL" ? { status } : {}), ...(q ? { q } : {}), ...(category ? { category } : {}) }).toString();

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">提示词</h1>
        <Link href="/admin/prompts/new/" className={btn.primary}>
          新建提示词
        </Link>
      </div>

      <div className="mt-5">
        {sp.msg === "archived" && <Notice tone="ok">已归档。可在“已归档”里恢复。</Notice>}
        {sp.err && <Notice tone="error">{sp.err}</Notice>}
      </div>

      <nav aria-label="状态筛选" className="flex flex-wrap gap-1">
        {TABS.map((t) => {
          const href = `/admin/prompts/${t.key === "ALL" ? "" : `?status=${t.key}`}`;
          return (
            <Link
              key={t.key}
              href={href}
              aria-current={status === t.key ? "page" : undefined}
              className={`rounded-full px-3 py-1 text-[13px] no-underline ${status === t.key ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"}`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      <form method="get" className="mt-4 flex flex-wrap gap-2" role="search">
        {status !== "ALL" && <input type="hidden" name="status" value={status} />}
        <label className="sr-only" htmlFor="q">
          搜索标题或网址标识
        </label>
        <input id="q" name="q" defaultValue={q} placeholder="搜索标题或网址标识" className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-[13.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 sm:max-w-xs" />
        <label className="sr-only" htmlFor="category">
          分类
        </label>
        <select id="category" name="category" defaultValue={category} className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-[13.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20">
          <option value="">全部分类</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button type="submit" className={btn.secondary}>
          筛选
        </button>
      </form>

      {!canReorder && status !== "ARCHIVED" && <p className="mt-3 text-[12.5px] text-zinc-500">清除搜索与分类筛选后可以调整顺序。</p>}

      {rows.length === 0 ? (
        <p className="mt-8 text-center text-[13.5px] text-zinc-500">没有符合条件的提示词。</p>
      ) : (
        <ol className="mt-4 divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white">
          {rows.map((r, i) => (
            <li
              key={r.id}
              id={`p-${r.id}`}
              className={`flex scroll-mt-24 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 ${sp.moved === String(r.id) ? "bg-amber-50/60" : ""}`}
            >
              <div className="min-w-0 flex-1 basis-60">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/prompts/${r.id}/`} className="font-medium text-zinc-900">
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
              <div className="flex items-center gap-1.5">
                {canReorder && (
                  <>
                    <form action={movePromptAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="dir" value="up" />
                      <input type="hidden" name="qs" value={qs} />
                      <button type="submit" className={btn.icon} disabled={i === 0} aria-label={`上移 ${r.title}`} title="上移">
                        ↑
                      </button>
                    </form>
                    <form action={movePromptAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="dir" value="down" />
                      <input type="hidden" name="qs" value={qs} />
                      <button type="submit" className={btn.icon} disabled={i === rows.length - 1} aria-label={`下移 ${r.title}`} title="下移">
                        ↓
                      </button>
                    </form>
                  </>
                )}
                <Link href={`/admin/prompts/${r.id}/`} className={btn.secondary}>
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
