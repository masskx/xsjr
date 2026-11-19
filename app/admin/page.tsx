import Link from "next/link";
import { adminData } from "@/lib/admin/server";
import { STATUS_LABEL, fmtDateTime } from "@/components/admin/ui";

const ACTION_LABEL: Record<string, string> = {
  "resource.create": "新建",
  "resource.update": "编辑",
  "resource.publish": "发布",
  "resource.unpublish": "取消发布",
  "resource.archive": "归档",
  "resource.restore": "恢复",
  "resource.reorder": "调整顺序",
  "user.issue_verify_link": "生成验证链接",
  "user.issue_reset_link": "生成重置链接",
};

export default async function AdminHome() {
  const [counts, held, audit] = await Promise.all([adminData.statusCounts("PROMPT"), adminData.heldMails(), adminData.audit(15)]);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">概览</h1>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Link href="/admin/prompts/" className="rounded-2xl border border-zinc-200 bg-white p-4 no-underline hover:border-zinc-300">
            <div className="text-[13px] text-zinc-500">提示词</div>
            <div className="mt-1 text-[13.5px] text-zinc-800">
              {(["PUBLISHED", "DRAFT", "ARCHIVED"] as const).map((st) => `${STATUS_LABEL[st]} ${counts[st] ?? 0}`).join(" · ")}
            </div>
          </Link>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="text-[13px] text-zinc-500">待人工发送的邮件</div>
            <div className="mt-1 text-[13.5px] text-zinc-800">{held} 封（邮件服务开通前）</div>
          </div>
          <Link href="/admin/users/" className="rounded-2xl border border-zinc-200 bg-white p-4 no-underline hover:border-zinc-300">
            <div className="text-[13px] text-zinc-500">用户</div>
            <div className="mt-1 text-[13.5px] text-zinc-800">按邮箱查找、生成验证/重置链接</div>
          </Link>
        </div>
        <p className="mt-3 text-[12.5px] text-zinc-500">Skills、模块与网站的后台编辑将在后续版本加入；目前它们仍通过 content/ 文件导入。</p>
      </section>

      <section>
        <h2 className="text-[15px] font-semibold text-zinc-900">最近操作</h2>
        {audit.length === 0 ? (
          <p className="mt-3 text-[13.5px] text-zinc-500">暂无记录。</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white">
            {audit.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-[13px]">
                <span className="min-w-0 text-zinc-800">
                  {ACTION_LABEL[a.action] ?? a.action}
                  {a.slug && (
                    <>
                      {" "}
                      <Link href={`/admin/prompts/${a.targetId}/`} className="font-mono text-[12.5px] text-zinc-600">
                        {a.slug}
                      </Link>
                    </>
                  )}
                  {a.targetType === "user" && <span className="text-zinc-500"> · 用户 #{a.targetId}</span>}
                </span>
                <span className="text-[12px] text-zinc-500">
                  {a.actor} · {fmtDateTime.format(a.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
