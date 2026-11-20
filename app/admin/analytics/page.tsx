import type { Metadata } from "next";
import Link from "next/link";
import { adminData } from "@/lib/admin/server";
import { TrendChart } from "@/components/admin/trend-chart";

export const metadata: Metadata = { title: "统计" };

const TYPE_HREF: Record<string, string> = { PROMPT: "/prompts/", SKILL: "/skills/", MODULE: "/modules/", SITE: "/directory/" };
const TYPE_LABEL: Record<string, string> = { PROMPT: "提示词", SKILL: "Skill", MODULE: "模块", SITE: "网站" };
const num = (n: number) => n.toLocaleString("zh-CN");

function Ranked({ title, note, rows, empty }: { title: string; note?: string; rows: { key: string; label: React.ReactNode; count: number }[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4">
      <h2 className="text-[14px] font-semibold text-zinc-900">{title}</h2>
      {note && <p className="mt-0.5 text-[12px] text-zinc-500">{note}</p>}
      {rows.length === 0 ? (
        <p className="mt-3 text-[12.5px] text-zinc-400">{empty}</p>
      ) : (
        <ol className="mt-3 space-y-1.5">
          {rows.map((r) => (
            <li key={r.key} className="grid grid-cols-[1fr_auto] items-center gap-x-3 text-[12.5px]">
              <span className="min-w-0 truncate text-zinc-800">{r.label}</span>
              <span className="tabular-nums text-zinc-600">{num(r.count)}</span>
              {/* thin bar: magnitude at a glance; the number beside it carries the value */}
              <span aria-hidden className="col-span-2 block h-1 rounded-full bg-zinc-100">
                <span className="block h-1 rounded-full bg-[#2a78d6]" style={{ width: `${(r.count / max) * 100}%` }} />
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default async function AnalyticsPage() {
  const a = await adminData.analytics();
  const s = a.summary;
  const tierTotal = Object.values(a.tiersDist).reduce((x, y) => x + y, 0);
  const resourceLabel = (r: { slug: string; title: string; type: string }) => (
    <>
      <span className="mr-1.5 text-[11px] text-zinc-400">{TYPE_LABEL[r.type]}</span>
      <Link href={`${TYPE_HREF[r.type]}${r.slug}/`} target="_blank" className="text-zinc-800">
        {r.title}
      </Link>
    </>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">统计</h1>
        <p className="mt-1 text-[12.5px] leading-5 text-zinc-500">
          第一方统计：不用第三方代码、不用 Cookie、不存 IP。访客按“当天”去重（IP + 浏览器标识与每日更换、两天后删除的随机盐做散列），
          所以 7 天 / 30 天显示的是“访客·天”（每天的独立访客相加），不是去重后的人数。爬虫与开启“请勿追踪 / GPC”的访问不计入。
        </p>
      </div>

      <section className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[28rem] text-left text-[13px]">
          <thead className="text-[12px] text-zinc-500">
            <tr className="border-b border-zinc-100">
              <th className="px-4 py-2 font-medium">流量</th>
              <th className="px-4 py-2 text-right font-medium">浏览量</th>
              <th className="px-4 py-2 text-right font-medium">访客</th>
              <th className="px-4 py-2 text-right font-medium">日均访客</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {[
              ["今天", s.today, "人"],
              ["近 7 天", s.d7, "访客·天"],
              ["近 30 天", s.d30, "访客·天"],
            ].map(([label, w, unit]) => {
              const win = w as typeof s.today;
              return (
                <tr key={label as string} className="border-b border-zinc-100 last:border-0">
                  <th scope="row" className="px-4 py-2 font-medium text-zinc-800">
                    {label as string}
                  </th>
                  <td className="px-4 py-2 text-right text-zinc-900">{num(win.pageViews)}</td>
                  <td className="px-4 py-2 text-right text-zinc-900">
                    {num(win.visitors)} <span className="text-[11px] text-zinc-400">{unit as string}</span>
                  </td>
                  <td className="px-4 py-2 text-right text-zinc-600">{num(win.avgDailyVisitors)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4">
        <TrendChart points={a.trend} />
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Ranked
          title="被看最多、但对方没有权限的会员资源"
          note="近 30 天。访问者因会员等级不够而看不到代码的次数，可用来判断哪些模块值得推广会员。"
          rows={a.locked.map((r) => ({ key: r.slug, label: resourceLabel(r), count: r.count }))}
          empty="暂无（目前没有会员模块，或还没有人碰到锁）。"
        />
        <Ranked title="复制最多的资源" note="近 30 天，点击“复制”的次数。" rows={a.copied.map((r) => ({ key: r.slug, label: resourceLabel(r), count: r.count }))} empty="暂无复制记录。" />
        <Ranked title="热门搜索词" note="近 30 天，用户停下来的最终搜索词。" rows={a.searches.map((r) => ({ key: r.query, label: r.query, count: r.count }))} empty="暂无搜索记录。" />
        <Ranked title="访问最多的资源页" note="近 30 天浏览量。" rows={a.viewed.map((r) => ({ key: r.slug, label: resourceLabel(r), count: r.count }))} empty="暂无数据。" />
        <Ranked title="来源网站" note="近 30 天，从外部网站点进来的访问。" rows={a.referrers.map((r) => ({ key: r.host, label: r.host, count: r.count }))} empty="暂无外部来源。" />
        <section className="rounded-2xl border border-zinc-200 bg-white p-4">
          <h2 className="text-[14px] font-semibold text-zinc-900">用户与会员</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-[12.5px]">
            <div>
              <dt className="text-zinc-500">注册用户</dt>
              <dd className="text-[18px] font-semibold tabular-nums text-zinc-900">{num(a.accounts.totalUsers)}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">新注册（7 天 / 30 天）</dt>
              <dd className="text-[18px] font-semibold tabular-nums text-zinc-900">
                {num(a.accounts.registrations7)} / {num(a.accounts.registrations30)}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-zinc-500">近 7 天登录过的用户</dt>
              <dd className="text-[18px] font-semibold tabular-nums text-zinc-900">{num(a.accounts.logins7)}</dd>
            </div>
          </dl>
          <h3 className="mt-4 text-[12.5px] font-medium text-zinc-700">会员分布（按当前有效等级）</h3>
          <table className="mt-1.5 w-full text-[12.5px]">
            <tbody className="tabular-nums">
              {a.tierRows.map((t) => (
                <tr key={t.code} className="border-t border-zinc-100">
                  <th scope="row" className="py-1 text-left font-normal text-zinc-700">
                    {t.labelZh}
                  </th>
                  <td className="py-1 text-right text-zinc-900">{num(a.tiersDist[t.code] ?? 0)}</td>
                  <td className="w-14 py-1 text-right text-zinc-500">{tierTotal ? `${Math.round(((a.tiersDist[t.code] ?? 0) / tierTotal) * 100)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
