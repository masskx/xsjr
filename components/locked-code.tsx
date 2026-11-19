import Link from "next/link";
import type { Access } from "@/lib/repo";
import { OPERATOR } from "@/lib/site";

/**
 * Shown instead of members-only code. The code itself never reaches this response: the page
 * only receives it from lib/repo when the viewer is entitled.
 */
export function LockedCode({ access, returnTo }: { access: Access; returnTo: string }) {
  let message: React.ReactNode;
  let actions: React.ReactNode = null;

  if (!access.accountsAvailable) {
    message = <>完整代码仅对 {access.requiredLabel}开放。会员服务即将上线。</>;
  } else if (!access.signedIn) {
    message = <>完整代码仅对 {access.requiredLabel}开放。已是会员？请先登录。</>;
    actions = (
      <>
        <Link href={`/login/?next=${encodeURIComponent(returnTo)}`} className="rounded-lg bg-zinc-900 px-4 py-2 text-[13.5px] font-medium text-white no-underline hover:bg-zinc-800">
          登录
        </Link>
        <Link href="/register/" className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-[13.5px] text-zinc-800 no-underline hover:bg-zinc-50">
          注册
        </Link>
      </>
    );
  } else {
    message = (
      <>
        你当前是 {access.viewerTierLabel}
        {access.expired && "（会员已到期）"}，完整代码需要 {access.requiredLabel}。在线开通即将上线，如需开通请联系 {OPERATOR.contact}。
      </>
    );
    actions = (
      <Link href="/account/" className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-[13.5px] text-zinc-800 no-underline hover:bg-zinc-50">
        查看我的会员
      </Link>
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/60 px-5 py-8 text-center">
      <div aria-hidden className="text-2xl">
        🔒
      </div>
      <p className="mx-auto mt-2 max-w-md text-[13.5px] leading-6 text-zinc-700">{message}</p>
      {actions && <div className="mt-4 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}
