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
      className="max-w-[8rem] shrink-0 truncate rounded-lg px-2.5 py-1.5 text-sm text-zinc-700 no-underline transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20"
    >
      {label}
    </Link>
  );
}
