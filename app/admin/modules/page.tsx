import type { Metadata } from "next";
import Link from "next/link";
import { adminData } from "@/lib/admin/server";
import { Notice, StatusBadge, btn } from "@/components/admin/ui";
import { setModuleTierAction } from "../actions";

export const metadata: Metadata = { title: "模块" };

export default async function AdminModulesPage({ searchParams }: { searchParams: Promise<{ saved?: string; err?: string }> }) {
  const [modules, tiers] = await Promise.all([adminData.modulesForTier(), adminData.tiers()]);
  const sp = await searchParams;
  const labels = new Map(tiers.map((t) => [t.code, t.labelZh]));

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900">模块</h1>
      <p className="mt-1 text-[13.5px] leading-6 text-zinc-500">
        设置每个代码模块需要的会员等级。会员模块的标题、简介、适用场景和环境说明对所有人可见，完整代码只发送给有权限的会员。
        模块内容的后台编辑将在模块画廊版本加入，目前内容仍来自 content/ 文件。
      </p>

      <div className="mt-5">
        {sp.saved && <Notice tone="ok">已保存，立即生效。</Notice>}
        {sp.err && <Notice tone="error">{sp.err}</Notice>}
      </div>

      <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] leading-6 text-amber-900">
        注意许可证：以 MIT 等开源许可证发布、且已经公开过的代码，任何拿到它的人都可以合法再分发。设为会员内容前，请确认该模块使用的是允许限制分发的许可证。
      </div>

      <ul className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white">
        {modules.map((m) => (
          <li key={m.id} id={`m-${m.id}`} className={`flex scroll-mt-24 flex-wrap items-center gap-3 px-4 py-3 ${sp.saved === String(m.id) ? "bg-emerald-50/60" : ""}`}>
            <div className="min-w-0 flex-1 basis-56">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-zinc-900">{m.title}</span>
                <StatusBadge status={m.status} />
              </div>
              <div className="mt-0.5 text-[12px] text-zinc-500">
                <Link href={`/modules/${m.slug}/`} target="_blank" className="font-mono">
                  {m.slug}
                </Link>{" "}
                · 许可证 {m.license} · 当前：{labels.get(m.requiredTier) ?? m.requiredTier}
              </div>
            </div>
            <form action={setModuleTierAction} className="flex items-center gap-2">
              <input type="hidden" name="id" value={m.id} />
              <label htmlFor={`tier-${m.id}`} className="sr-only">
                {m.title} 需要的会员等级
              </label>
              <select id={`tier-${m.id}`} name="tier" defaultValue={m.requiredTier} className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-[13px]">
                {tiers
                  .filter((t) => t.isActive)
                  .map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.code === "FREE" ? "免费" : `需要 ${t.labelZh}`}
                    </option>
                  ))}
              </select>
              <button type="submit" className={btn.secondary}>
                保存
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
