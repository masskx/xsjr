import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminData } from "@/lib/admin/server";
import { effectiveTier, isExpired } from "@/lib/auth/entitlement";
import { GrantTierForm } from "@/components/admin/grant-tier-form";
import { IssueLinkForm } from "@/components/admin/issue-link-form";
import { Notice, btn, fmtDateTime } from "@/components/admin/ui";
import { revokeTierAction } from "../../actions";

export const metadata: Metadata = { title: "用户详情" };

const SOURCE: Record<string, string> = { ADMIN_GRANT: "管理员开通", ORDER: "订单", PROMO: "活动" };

export default async function AdminUserPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [user, history, tiers] = await Promise.all([adminData.user(id), adminData.entitlementHistory(id), adminData.tiers()]);
  if (!user) notFound();
  const sp = await searchParams;
  const labels = new Map(tiers.map((t) => [t.code, t.labelZh]));
  const current = effectiveTier(user);
  const expired = isExpired(user);

  return (
    <div className="max-w-3xl">
      <Link href="/admin/users/" className="text-[13px] text-zinc-500">
        ← 返回用户列表
      </Link>
      <h1 className="mt-2 break-all text-xl font-semibold tracking-tight text-zinc-900">{user.email}</h1>

      <div className="mt-4">
        {sp.msg === "granted" && <Notice tone="ok">会员已开通，立即生效。</Notice>}
        {sp.msg === "revoked" && <Notice tone="ok">会员已撤销，该用户现在是免费用户。</Notice>}
        {sp.err && <Notice tone="error">{sp.err}</Notice>}
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <dl className="grid grid-cols-[7rem_1fr] gap-y-1.5 text-[13px]">
          <dt className="text-zinc-500">当前会员</dt>
          <dd className="font-medium text-zinc-900">
            {labels.get(current) ?? current}
            {current !== "FREE" && (user.tierExpiresAt ? ` · 至 ${fmtDateTime.format(user.tierExpiresAt)}` : " · 长期")}
            {expired && <span className="font-normal text-rose-700">（{labels.get(user.tier)} 已于 {fmtDateTime.format(user.tierExpiresAt!)} 到期）</span>}
          </dd>
          <dt className="text-zinc-500">昵称</dt>
          <dd className="text-zinc-800">{user.displayName ?? "—"}</dd>
          <dt className="text-zinc-500">角色</dt>
          <dd className="text-zinc-800">{user.role === "ADMIN" ? "管理员" : "普通用户"}</dd>
          <dt className="text-zinc-500">邮箱验证</dt>
          <dd className="text-zinc-800">{user.emailVerifiedAt ? `已验证 · ${fmtDateTime.format(user.emailVerifiedAt)}` : "未验证（验证后才能开通会员）"}</dd>
          <dt className="text-zinc-500">注册时间</dt>
          <dd className="text-zinc-800">{fmtDateTime.format(user.createdAt)}</dd>
          <dt className="text-zinc-500">最近登录</dt>
          <dd className="text-zinc-800">{user.lastLoginAt ? fmtDateTime.format(user.lastLoginAt) : "—"}</dd>
        </dl>
      </section>

      <section className="mt-5 rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-[15px] font-semibold text-zinc-900">开通 / 变更会员</h2>
        <p className="mt-1 text-[12.5px] text-zinc-500">新的开通会替换当前会员。支付上线前，会员由管理员在这里手动开通。</p>
        <div className="mt-4">
          <GrantTierForm userId={user.id} tiers={tiers.filter((t) => t.code !== "FREE" && t.isActive).map((t) => ({ code: t.code, label: t.labelZh }))} disabled={!user.emailVerifiedAt} />
        </div>
        {user.tier !== "FREE" && (
          <form action={revokeTierAction} className="mt-5 border-t border-zinc-100 pt-4">
            <input type="hidden" name="userId" value={user.id} />
            <button type="submit" className={btn.danger}>
              撤销会员（改为免费）
            </button>
          </form>
        )}
      </section>

      <section className="mt-5 rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-[15px] font-semibold text-zinc-900">会员记录</h2>
        {history.length === 0 ? (
          <p className="mt-2 text-[13px] text-zinc-500">暂无记录。</p>
        ) : (
          <ul className="mt-3 space-y-2 text-[13px]">
            {history.map((h) => (
              <li key={h.id} className="rounded-lg border border-zinc-100 px-3 py-2">
                <div className="font-medium text-zinc-800">
                  {labels.get(h.tier) ?? h.tier} · {SOURCE[h.source] ?? h.source}
                  {h.revokedAt ? <span className="ml-2 font-normal text-zinc-500">已结束</span> : <span className="ml-2 font-normal text-emerald-700">当前</span>}
                </div>
                <div className="text-[12px] text-zinc-500">
                  {fmtDateTime.format(h.startsAt)} 起 · {h.endsAt ? `至 ${fmtDateTime.format(h.endsAt)}` : "长期"}
                  {h.revokedAt && ` · 结束于 ${fmtDateTime.format(h.revokedAt)}`}
                  {h.grantedBy && ` · ${h.grantedBy}`}
                  {h.note && ` · 备注：${h.note}`}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-5 space-y-4 rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-[15px] font-semibold text-zinc-900">账户链接</h2>
        {!user.emailVerifiedAt && <IssueLinkForm userId={user.id} email={user.email} purpose="EMAIL_VERIFY" label="生成邮箱验证链接" description="发给用户本人（例如通过微信），24 小时内有效。" />}
        {user.role !== "ADMIN" ? (
          <IssueLinkForm
            userId={user.id}
            email={user.email}
            purpose="PASSWORD_RESET"
            label="生成重置密码链接"
            description="需要先再次验证你的身份。务必确认对方是账户本人后再发送；1 小时内有效，使用后该用户所有设备退出登录。"
          />
        ) : (
          <p className="text-[12.5px] text-zinc-500">管理员的密码与两步验证请在服务器上用 create-admin 命令重置（见运维手册）。</p>
        )}
      </section>
    </div>
  );
}
