import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/server";

export const metadata: Metadata = { title: "管理后台", robots: { index: false, follow: false } };

// Placeholder until slice 3 (content CRUD). Access control is already real: proxy.ts rewrites
// anyone who is not an admin with a TOTP-verified session to the 404 page, and requireAdmin()
// checks again here.
export default async function AdminHome() {
  const admin = await requireAdmin();
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">管理后台</h1>
      <p className="mt-2 text-[13.5px] text-zinc-500">已登录：{admin.user.email}（两步验证已通过）</p>
      <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 p-6 text-[13.5px] leading-6 text-zinc-600">
        内容管理、会员管理与统计将在后续版本上线。
      </div>
    </div>
  );
}
