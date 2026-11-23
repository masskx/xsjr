import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ActionForm, Field, Submit } from "@/components/auth/form";
import { AuthShell } from "@/components/auth/shell";
import { safeNextPath } from "@/lib/auth/next-path";
import { authConfig, getViewer } from "@/lib/auth/server";
import { totpAction } from "../../actions";

export const metadata: Metadata = { title: "两步验证" };

export default async function LoginMfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!authConfig().available) notFound();
  const viewer = await getViewer();
  if (!viewer) redirect("/login/");
  if (viewer.user.role !== "ADMIN") redirect("/account/");
  const { next } = await searchParams;
  if (!viewer.user.totpEnabledAt) redirect(`/account/mfa/?next=${encodeURIComponent(safeNextPath(next))}`);
  if (viewer.mfaVerifiedAt) redirect(safeNextPath(next, "/admin/"));

  return (
    <AuthShell title="两步验证" subtitle="管理员账户需要输入身份验证器 App 里的 6 位验证码。">
      <ActionForm action={totpAction}>
        <input type="hidden" name="next" value={safeNextPath(next, "/admin/")} />
        <Field name="code" label="验证码" autoComplete="one-time-code" inputMode="numeric" maxLength={8} />
        <Submit>验证</Submit>
      </ActionForm>
    </AuthShell>
  );
}
