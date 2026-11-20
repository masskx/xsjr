import Link from "next/link";
import { authConfig, getViewer } from "@/lib/auth/server";

/** Header entry point for accounts. Renders nothing while accounts are switched off, so the
 *  public site is byte-for-byte unchanged until HTTPS exists. */
export async function AccountLink() {
  if (!authConfig().available) return null;
  const viewer = await getViewer();
  const href = viewer ? "/account/" : "/login/";
  const label = viewer ? (viewer.user.displayName || "我的账户") : "登录";
  return (
    <Link
      href={href}
      className="max-w-[5.5rem] shrink-0 truncate rounded-[3px] border border-rule bg-paper-raised px-2 py-1.5 sm:max-w-[8rem] sm:px-3 text-sm text-zinc-800 no-underline shadow-xs transition-shadow hover:shadow-md"
    >
      {label}
    </Link>
  );
}
