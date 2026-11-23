import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { ActionForm, Field, Submit } from "@/components/auth/form";
import { AuthShell } from "@/components/auth/shell";
import { safeNextPath } from "@/lib/auth/next-path";
import { requestCtx, requireUser } from "@/lib/auth/server";
import { beginTotpSetup } from "@/lib/auth/service";
import { totpAction } from "../../actions";

export const metadata: Metadata = { title: "设置两步验证" };

// TOTP enrolment. Mandatory for admins (they are sent here after their first login). A fresh
// secret is generated on every visit until a code is confirmed; the QR code is rendered on the
// server as inline SVG, so the secret never reaches a third-party service.
export default async function MfaSetupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const viewer = await requireUser("/account/mfa/");
  if (viewer.user.role !== "ADMIN") notFound();
  const { next } = await searchParams;
  if (viewer.user.totpEnabledAt) redirect(viewer.mfaVerifiedAt ? "/account/" : `/login/mfa/?next=${encodeURIComponent(safeNextPath(next))}`);

  const setup = await beginTotpSetup(await requestCtx(), viewer.userId);
  if (!setup.ok) redirect("/account/");
  const svg = await QRCode.toString(setup.uri, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#18181b", light: "#ffffff" } });
  const grouped = setup.secret.match(/.{1,4}/g)!.join(" ");

  return (
    <AuthShell
      title="设置两步验证"
      subtitle="管理员账户必须启用两步验证后才能进入后台。"
    >
      <ol className="space-y-5 text-[13.5px] leading-6 text-zinc-700">
        <li>
          <p>1. 用身份验证器 App（Microsoft Authenticator、Google Authenticator、1Password 等）扫描二维码：</p>
          <div className="mx-auto mt-3 w-44 [&>svg]:h-auto [&>svg]:w-full" role="img" aria-label="两步验证二维码" dangerouslySetInnerHTML={{ __html: svg }} />
          <p className="mt-3">
            无法扫码时手动输入密钥：
            <code className="mt-1 block break-all rounded-md bg-zinc-100 px-2 py-1.5 font-mono text-[12.5px] tracking-wider text-zinc-800">{grouped}</code>
          </p>
        </li>
        <li>
          <p>2. 输入 App 里显示的 6 位验证码完成绑定：</p>
          <div className="mt-3">
            <ActionForm action={totpAction}>
              <input type="hidden" name="next" value={safeNextPath(next, viewer.user.role === "ADMIN" ? "/admin/" : "/account/")} />
              <Field name="code" label="验证码" autoComplete="one-time-code" inputMode="numeric" maxLength={8} />
              <Submit>启用两步验证</Submit>
            </ActionForm>
          </div>
        </li>
      </ol>
    </AuthShell>
  );
}
