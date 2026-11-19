import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Alert, Field, Submit } from "@/components/auth/form";
import { AuthShell } from "@/components/auth/shell";
import { authConfig } from "@/lib/auth/server";
import { forgotPasswordAction } from "../actions";

export const metadata: Metadata = { title: "找回密码" };

export default function ForgotPasswordPage() {
  const config = authConfig();
  if (!config.available) notFound();

  return (
    <AuthShell
      title="找回密码"
      footer={
        <Link href="/login/" className="font-medium text-zinc-900">
          返回登录
        </Link>
      }
    >
      {config.canDeliverMail ? (
        <ActionForm action={forgotPasswordAction}>
          <p className="text-[13.5px] leading-6 text-zinc-600">输入注册邮箱，我们会发送一个 1 小时内有效的重置链接。</p>
          <Field name="email" label="邮箱" type="email" autoComplete="email" inputMode="email" maxLength={254} />
          <Submit>发送重置链接</Submit>
        </ActionForm>
      ) : (
        <Alert tone="info">邮件服务尚未开通，暂不支持自助找回密码。请联系管理员重置。</Alert>
      )}
    </AuthShell>
  );
}
