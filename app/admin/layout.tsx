import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/server";
import { AdminNav } from "@/components/admin/nav";

export const metadata: Metadata = {
  title: { default: "管理后台", template: "%s｜管理后台" },
  robots: { index: false, follow: false },
};

// proxy.ts already rewrites non-admins to the 404 page; this is the second check.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-3">
        <AdminNav />
        <span className="max-w-full truncate text-[12px] text-zinc-500">{admin.user.email}</span>
      </div>
      <div className="pt-6">{children}</div>
    </div>
  );
}
