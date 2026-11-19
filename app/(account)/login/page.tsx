import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActionForm, Alert, Field, Submit } from "@/components/auth/form";
import { AuthShell } from "@/components/auth/shell";
import { safeNextPath } from "@/lib/auth/next-path";
import { authConfig, getViewer } from "@/lib/auth/server";
import { loginAction } from "../actions";

export const metadata: Metadata = { title: "登录" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  if (!authConfig().available) notFound();
  const { next, reset } = await searchParams;
  const target = safeNextPath(next);
  if (await getViewer()) redirect(target);

  return (
    <AuthShell
      title="登录"
      subtitle="登录后可查看会员模块代码、管理账户。浏览和复制免费资源不需要登录。"
      footer={
        <>
          还没有账户？{" "}
          <Link href={`/register/${next ? `?next=${encodeURIComponent(target)}` : ""}`} className="font-medium text-zinc-900">
            注册
          </Link>
        </>
      }
    >
      {reset && (
        <div className="mb-4">
          <Alert tone="ok">密码已重置，请用新密码登录。</Alert>
        </div>
      )}
      <ActionForm action={loginAction}>
        <input type="hidden" name="next" value={target} />
        <Field name="email" label="邮箱" type="email" autoComplete="email" inputMode="email" maxLength={254} />
        <Field name="password" label="密码" type="password" autoComplete="current-password" maxLength={128} />
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/forgot-password/" className="text-[13px] text-zinc-500">
            忘记密码？
          </Link>
          <Submit>登录</Submit>
        </div>
      </ActionForm>
    </AuthShell>
  );
}
