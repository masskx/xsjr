import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActionForm, Checkbox, Field, Submit } from "@/components/auth/form";
import { AuthShell } from "@/components/auth/shell";
import { MIN_LENGTH } from "@/lib/auth/password";
import { authConfig, getViewer } from "@/lib/auth/server";
import { registerAction } from "../actions";

export const metadata: Metadata = { title: "注册" };

export default async function RegisterPage() {
  if (!authConfig().available) notFound();
  if (await getViewer()) redirect("/account/");

  return (
    <AuthShell
      title="注册账户"
      subtitle="免费资源无需注册即可使用。注册后可开通会员、查看会员模块代码。"
      footer={
        <>
          已有账户？{" "}
          <Link href="/login/" className="font-medium text-zinc-900">
            登录
          </Link>
        </>
      }
    >
      <ActionForm action={registerAction}>
        <Field name="email" label="邮箱" type="email" autoComplete="email" inputMode="email" maxLength={254} hint="用于登录和找回密码，不会公开。" />
        <Field name="displayName" label="昵称（可选）" autoComplete="nickname" required={false} maxLength={40} />
        <Field
          name="password"
          label="密码"
          type="password"
          autoComplete="new-password"
          maxLength={128}
          hint={`至少 ${MIN_LENGTH.USER} 个字符；常见密码会被拒绝。建议使用密码管理器生成。`}
        />
        <Field name="password2" label="确认密码" type="password" autoComplete="new-password" maxLength={128} />
        <Checkbox name="consent">
          我已阅读并同意{" "}
          <Link href="/terms/" target="_blank" className="font-medium text-zinc-900">
            《用户协议》
          </Link>
          和{" "}
          <Link href="/privacy/" target="_blank" className="font-medium text-zinc-900">
            《隐私政策》
          </Link>
        </Checkbox>
        <Submit>注册</Submit>
      </ActionForm>
    </AuthShell>
  );
}
