import type { Metadata } from "next";
import { adminData } from "@/lib/admin/server";
import { IssueLinkForm } from "@/components/admin/issue-link-form";
import { btn, fmtDateTime } from "@/components/admin/ui";

export const metadata: Metadata = { title: "用户" };

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email = "" } = await searchParams;
  const user = email ? await adminData.userByEmail(email) : null;

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900">用户</h1>
      <p className="mt-1 text-[13.5px] text-zinc-500">按邮箱查找用户。用户列表、会员等级管理将在下一版本加入。</p>

      <form method="get" role="search" className="mt-5 flex gap-2">
        <label htmlFor="email" className="sr-only">
          邮箱
        </label>
        <input
          id="email"
          name="email"
          type="email"
          defaultValue={email}
          placeholder="user@example.com"
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-[13.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20"
        />
        <button type="submit" className={btn.secondary}>
          查找
        </button>
      </form>

      {email && !user && <p className="mt-6 text-[13.5px] text-zinc-500">没有找到这个邮箱的用户。</p>}

      {user && (
        <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="break-all text-[15px] font-semibold text-zinc-900">{user.email}</h2>
          <dl className="mt-3 grid grid-cols-[7rem_1fr] gap-y-1.5 text-[13px]">
            <dt className="text-zinc-500">昵称</dt>
            <dd className="text-zinc-800">{user.displayName ?? "—"}</dd>
            <dt className="text-zinc-500">角色</dt>
            <dd className="text-zinc-800">{user.role === "ADMIN" ? "管理员" : "普通用户"}</dd>
            <dt className="text-zinc-500">会员</dt>
            <dd className="text-zinc-800">
              {user.tier}
              {user.tierExpiresAt && `（至 ${fmtDateTime.format(user.tierExpiresAt)}）`}
            </dd>
            <dt className="text-zinc-500">邮箱验证</dt>
            <dd className="text-zinc-800">{user.emailVerifiedAt ? `已验证 · ${fmtDateTime.format(user.emailVerifiedAt)}` : "未验证"}</dd>
            <dt className="text-zinc-500">两步验证</dt>
            <dd className="text-zinc-800">{user.totpEnabledAt ? "已启用" : "未启用"}</dd>
            <dt className="text-zinc-500">注册时间</dt>
            <dd className="text-zinc-800">{fmtDateTime.format(user.createdAt)}</dd>
            <dt className="text-zinc-500">最近登录</dt>
            <dd className="text-zinc-800">{user.lastLoginAt ? fmtDateTime.format(user.lastLoginAt) : "—"}</dd>
            <dt className="text-zinc-500">登录设备</dt>
            <dd className="text-zinc-800">{user.activeSessions} 个</dd>
            {user.lockedUntil && user.lockedUntil > new Date() && (
              <>
                <dt className="text-zinc-500">状态</dt>
                <dd className="text-rose-700">因多次密码错误锁定至 {fmtDateTime.format(user.lockedUntil)}</dd>
              </>
            )}
          </dl>

          <div className="mt-5 space-y-4 border-t border-zinc-100 pt-4">
            {!user.emailVerifiedAt && (
              <IssueLinkForm userId={user.id} email={user.email} purpose="EMAIL_VERIFY" label="生成邮箱验证链接" description="发给用户本人（例如通过微信），24 小时内有效。" />
            )}
            {user.role !== "ADMIN" && (
              <IssueLinkForm
                userId={user.id}
                email={user.email}
                purpose="PASSWORD_RESET"
                label="生成重置密码链接"
                description="需要先再次验证你的身份。务必确认对方是账户本人后再发送；1 小时内有效，使用后该用户所有设备退出登录。"
              />
            )}
            {user.role === "ADMIN" && <p className="text-[12.5px] text-zinc-500">管理员的密码与两步验证请在服务器上用 create-admin 命令重置（见运维手册）。</p>}
          </div>
        </section>
      )}
    </div>
  );
}
