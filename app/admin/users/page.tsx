import type { Metadata } from "next";
import Link from "next/link";
import { adminData } from "@/lib/admin/server";
import { btn } from "@/components/admin/ui";

export const metadata: Metadata = { title: "用户" };

const fmtDate = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium" });

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string; email?: string; tier?: string; page?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? sp.email ?? "").slice(0, 100);
  const [tiers, stats] = await Promise.all([adminData.tiers(), adminData.memberStats()]);
  const tier = tiers.some((t) => t.code === sp.tier) ? sp.tier : undefined;
  const { rows, total, page, pages } = await adminData.users({ q, tier, page: Number(sp.page) || 1 });
  const labels = new Map(tiers.map((t) => [t.code, t.labelZh]));
  const href = (p: number) => `/admin/users/?${new URLSearchParams({ ...(q ? { q } : {}), ...(tier ? { tier } : {}), page: String(p) })}`;

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900">用户</h1>
      <p className="mt-1 text-[13.5px] text-zinc-500">
        共 {Object.values(stats).reduce((a, b) => a + b, 0)} 人：
        {tiers.map((t) => `${t.labelZh} ${stats[t.code] ?? 0}`).join(" · ")}（按当前有效等级，过期计为免费）
      </p>

      <form method="get" role="search" className="mt-5 flex flex-wrap gap-2">
        <label htmlFor="q" className="sr-only">
          邮箱
        </label>
        <input id="q" name="q" defaultValue={q} placeholder="按邮箱搜索" className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-[13.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 sm:max-w-xs" />
        <label htmlFor="tier" className="sr-only">
          会员等级
        </label>
        <select id="tier" name="tier" defaultValue={tier ?? ""} className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-[13.5px]">
          <option value="">全部等级</option>
          {tiers.map((t) => (
            <option key={t.code} value={t.code}>
              {t.labelZh}
            </option>
          ))}
        </select>
        <button type="submit" className={btn.secondary}>
          筛选
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="mt-8 text-center text-[13.5px] text-zinc-500">没有符合条件的用户。</p>
      ) : (
        <ul className="mt-4 divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white">
          {rows.map((u) => (
            <li key={u.id}>
              <Link href={`/admin/users/${u.id}/`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 no-underline hover:bg-zinc-50">
                <span className="min-w-0 flex-1 basis-56 truncate font-medium text-zinc-900">
                  {u.email}
                  {u.role === "ADMIN" && <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-600">管理员</span>}
                  {!u.emailVerifiedAt && <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800">邮箱未验证</span>}
                </span>
                <span className="text-[12.5px] text-zinc-700">
                  {labels.get(u.effectiveTier) ?? u.effectiveTier}
                  {u.effectiveTier !== "FREE" && u.tierExpiresAt && ` · 至 ${fmtDate.format(u.tierExpiresAt)}`}
                  {u.effectiveTier !== u.tier && <span className="text-rose-700"> · {u.tier} 已过期</span>}
                </span>
                <span className="w-full text-[12px] text-zinc-500 sm:w-auto">注册于 {fmtDate.format(u.createdAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav aria-label="分页" className="mt-4 flex items-center justify-between text-[13px]">
          {page > 1 ? <Link href={href(page - 1)}>← 上一页</Link> : <span />}
          <span className="text-zinc-500">
            第 {page} / {pages} 页 · 共 {total} 人
          </span>
          {page < pages ? <Link href={href(page + 1)}>下一页 →</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
