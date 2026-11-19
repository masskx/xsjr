import type { Metadata } from "next";
import { ReauthForm } from "@/components/admin/reauth-form";
import { safeNextPath } from "@/lib/auth/next-path";

export const metadata: Metadata = { title: "再次验证身份" };

export default async function ReauthPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900">再次验证身份</h1>
      <p className="mt-2 text-[13.5px] leading-6 text-zinc-500">归档内容、生成重置密码链接等操作需要在 10 分钟内验证过身份。请输入身份验证器 App 里的 6 位验证码。</p>
      <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-5">
        <ReauthForm next={safeNextPath(next, "/admin/")} />
      </div>
    </div>
  );
}
