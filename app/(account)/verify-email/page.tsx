import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/auth/form";
import { AuthShell } from "@/components/auth/shell";
import { authConfig, getViewer, requestCtx } from "@/lib/auth/server";
import { verifyEmail } from "@/lib/auth/service";

export const metadata: Metadata = { title: "邮箱验证" };

// Verifying on GET is deliberate: a mail scanner following the link only proves what the link
// proves anyway (access to the mailbox). Password reset, by contrast, needs a POST.
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  if (!authConfig().available) notFound();
  const { token } = await searchParams;
  const result = token ? await verifyEmail(await requestCtx(), token) : { ok: false as const, error: "链接不完整，请从邮件中重新打开" };
  const viewer = await getViewer();

  return (
    <AuthShell title="邮箱验证">
      {result.ok ? <Alert tone="ok">邮箱验证成功。</Alert> : <Alert tone="error">{result.error}</Alert>}
      <div className="mt-4 text-[13.5px]">
        <Link href={viewer ? "/account/" : "/login/"} className="font-medium text-zinc-900">
          {viewer ? "返回我的账户" : "去登录"}
        </Link>
      </div>
    </AuthShell>
  );
}
