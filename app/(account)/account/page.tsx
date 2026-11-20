import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Alert, Field, Submit } from "@/components/auth/form";
import { Panel } from "@/components/auth/shell";
import { authConfig, requireUser, tierLabels, viewerSessions } from "@/lib/auth/server";
import {
  changePasswordAction,
  deleteAccountAction,
  logoutAction,
  resendVerificationAction,
  revokeOtherSessionsAction,
  revokeSessionAction,
  updateProfileAction,
} from "../actions";

export const metadata: Metadata = { title: "我的账户" };

const fmt = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short" });
const fmtDate = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "long" });

function deviceName(ua: string | null): string {
  if (!ua) return "未知设备";
  const os = /Windows/.test(ua) ? "Windows" : /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  return [browser, os].filter(Boolean).join(" · ") || "未知设备";
}

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const viewer = await requireUser("/account/");
  const { welcome } = await searchParams;
  const { user } = viewer;
  const [labels, sessions] = await Promise.all([tierLabels(), viewerSessions(viewer)]);
  const now = new Date();
  const expired = user.tier !== "FREE" && user.tierExpiresAt !== null && user.tierExpiresAt <= now;
  const effective = expired ? "FREE" : user.tier;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">我的账户</h1>
          <p className="mt-1 break-all text-[13.5px] text-zinc-500">{user.email}</p>
        </div>
        <form action={logoutAction}>
          <button type="submit" className="rounded-lg border border-zinc-300 px-3 py-1.5 text-[13px] text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20">
            退出登录
          </button>
        </form>
      </div>

      {welcome && (
        <div className="mt-6">
          <Alert tone="ok">注册成功，欢迎！现在就可以浏览、复制和下载全部免费资源。</Alert>
        </div>
      )}

      <div className="mt-6 space-y-5">
        <Panel title="会员">
          <dl className="grid grid-cols-[6rem_1fr] gap-y-2 text-[13.5px]">
            <dt className="text-zinc-500">当前等级</dt>
            <dd className="font-medium text-zinc-900">{labels.get(effective) ?? effective}</dd>
            <dt className="text-zinc-500">有效期</dt>
            <dd className="text-zinc-800">
              {effective === "FREE" ? "长期" : user.tierExpiresAt ? `至 ${fmtDate.format(user.tierExpiresAt)}` : "长期"}
              {expired && <span className="ml-2 text-rose-700">（{labels.get(user.tier) ?? user.tier} 已于 {fmtDate.format(user.tierExpiresAt!)} 到期）</span>}
            </dd>
            <dt className="text-zinc-500">注册时间</dt>
            <dd className="text-zinc-800">{fmtDate.format(user.createdAt)}</dd>
          </dl>
          <p className="mt-3 text-[12.5px] leading-6 text-zinc-500">提示词和 Skills 全部免费；部分代码模块需要会员。在线开通会员即将上线。</p>
        </Panel>

        <Panel title="邮箱">
          {user.emailVerifiedAt ? (
            <p className="text-[13.5px] text-zinc-700">已验证（{fmtDate.format(user.emailVerifiedAt)}）</p>
          ) : (
            <ActionForm action={resendVerificationAction}>
              <p className="text-[13.5px] text-zinc-700">邮箱尚未验证（可选）。只有开通会员时才需要验证邮箱。</p>
              <Submit>重新发送验证邮件</Submit>
            </ActionForm>
          )}
        </Panel>

        <Panel title="资料">
          <ActionForm action={updateProfileAction}>
            <Field name="displayName" label="昵称" autoComplete="nickname" required={false} maxLength={40} defaultValue={user.displayName ?? ""} />
            <Submit>保存</Submit>
          </ActionForm>
        </Panel>

        <Panel id="security" title="安全" description="修改密码后，其他设备会自动退出登录。">
          <ActionForm action={changePasswordAction}>
            <Field name="current" label="当前密码" type="password" autoComplete="current-password" maxLength={128} />
            <Field name="password" label="新密码" type="password" autoComplete="new-password" maxLength={128} />
            <Field name="password2" label="确认新密码" type="password" autoComplete="new-password" maxLength={128} />
            <Submit>修改密码</Submit>
          </ActionForm>

          <h3 className="mt-8 text-[13.5px] font-semibold text-zinc-900">登录设备（{sessions.length}）</h3>
          <ul className="mt-3 divide-y divide-zinc-100 rounded-xl border border-zinc-200">
            {sessions.map((sess) => (
              <li key={sess.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-[13px]">
                <div className="min-w-0">
                  <div className="font-medium text-zinc-800">
                    {deviceName(sess.userAgent)}
                    {sess.id === viewer.id && <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[11.5px] text-emerald-700">当前设备</span>}
                  </div>
                  <div className="text-[12px] text-zinc-500">最近活动 {fmt.format(sess.lastSeenAt)} · 到期 {fmt.format(sess.expiresAt)}</div>
                </div>
                {sess.id !== viewer.id && (
                  <form action={revokeSessionAction}>
                    <input type="hidden" name="sessionId" value={sess.id} />
                    <button type="submit" className="rounded-md px-2 py-1 text-[12.5px] text-rose-700 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600/30">
                      退出该设备
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
          {sessions.length > 1 && (
            <form action={revokeOtherSessionsAction} className="mt-3">
              <button type="submit" className="text-[13px] text-rose-700 underline-offset-2 hover:underline">
                退出其他所有设备
              </button>
            </form>
          )}

          {user.role === "ADMIN" && (<>
          <h3 className="mt-8 text-[13.5px] font-semibold text-zinc-900">两步验证</h3>
          <p className="mt-2 text-[13.5px] text-zinc-700">
            {user.totpEnabledAt ? (
              `已启用（${fmtDate.format(user.totpEnabledAt)}）`
            ) : (
              <>
                未启用。{" "}
                <Link href="/account/mfa/" className="font-medium text-zinc-900">
                  立即设置
                </Link>
                （管理员必须启用）
              </>
            )}
          </p>
          </>)}
        </Panel>

        <Panel title="注销账户" description="永久删除账户、登录记录和收藏。此操作不可恢复。">
          <ActionForm action={deleteAccountAction}>
            <Field name="password" label="当前密码" type="password" autoComplete="current-password" maxLength={128} />
            <Field name="confirm" label="输入“注销”确认" autoComplete="off" maxLength={10} />
            <Submit tone="danger">永久注销</Submit>
          </ActionForm>
        </Panel>

        {!authConfig().canDeliverMail && (
          <p className="text-[12.5px] text-zinc-400">邮件服务尚未开通：验证邮件与找回密码暂由管理员处理。</p>
        )}
      </div>
    </div>
  );
}
