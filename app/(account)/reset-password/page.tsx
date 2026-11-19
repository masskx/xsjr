import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm, Field, Submit } from "@/components/auth/form";
import { AuthShell } from "@/components/auth/shell";
import { MIN_LENGTH } from "@/lib/auth/password";
import { authConfig } from "@/lib/auth/server";
import { resetPasswordAction } from "../actions";

export const metadata: Metadata = { title: "设置新密码" };

// The token is only consumed by the POST (form submit), never by opening the link, so mail
// scanners that prefetch links cannot burn it.
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  if (!authConfig().available) notFound();
  const { token } = await searchParams;

  return (
    <AuthShell title="设置新密码" subtitle="设置后，所有设备上的登录都会失效，需要重新登录。">
      <ActionForm action={resetPasswordAction}>
        <input type="hidden" name="token" value={token ?? ""} />
        <Field name="password" label="新密码" type="password" autoComplete="new-password" maxLength={128} hint={`至少 ${MIN_LENGTH.USER} 个字符`} />
        <Field name="password2" label="确认新密码" type="password" autoComplete="new-password" maxLength={128} />
        <Submit>保存新密码</Submit>
      </ActionForm>
    </AuthShell>
  );
}
