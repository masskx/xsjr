import type { Metadata } from "next";
import { adminData } from "@/lib/admin/server";
import { Notice, btn } from "@/components/admin/ui";
import { ResourceList, parseStatus } from "@/components/admin/resource-list";
import { moveModuleAction, setModuleTierAction } from "../actions";

export const metadata: Metadata = { title: "模块" };

export default async function AdminModulesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; saved?: string; err?: string; msg?: string; moved?: string }>;
}) {
  const sp = await searchParams;
  const status = parseStatus(sp.status);
  const q = (sp.q ?? "").slice(0, 60);
  const [rows, tiers] = await Promise.all([adminData.listResources("MODULE", { status, q }), adminData.tiers()]);

  return (
    <ResourceList
      title="模块"
      base="/admin/modules/"
      newLabel="新建模块"
      rows={rows}
      status={status}
      q={q}
      msg={sp.msg}
      err={sp.err}
      moved={sp.moved}
      move={moveModuleAction}
      intro={
        <>
          <p className="mt-1 text-[13.5px] leading-6 text-zinc-500">
            会员模块的标题、简介、结构图、适用任务和环境说明对所有人可见，完整代码只发送给有权限的会员。
          </p>
          {sp.saved && (
            <div className="mt-4">
              <Notice tone="ok">会员等级已保存，立即生效。</Notice>
            </div>
          )}
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] leading-6 text-amber-900">
            注意许可证：以 MIT 等开源许可证发布、且已经公开过的代码，任何拿到它的人都可以合法再分发。设为会员内容前，请确认该模块使用的是允许限制分发的许可证。
          </div>
        </>
      }
      extra={(m) => (
        <form action={setModuleTierAction} className="flex items-center gap-2" id={`m-${m.id}`}>
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
            保存等级
          </button>
        </form>
      )}
    />
  );
}
