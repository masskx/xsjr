import Link from "next/link";

export function LoginGate({ next, label = "登录后可复制、下载并查看完整代码。" }: { next: string; label?: string }) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3">
      <p className="text-[13px] leading-6 text-amber-900">{label}</p>
      <Link
        href={`/login/?next=${encodeURIComponent(next)}`}
        className="inline-flex h-8 items-center rounded-md bg-zinc-900 px-3 text-[12.5px] font-medium text-white no-underline hover:bg-zinc-700"
      >
        登录 / 注册
      </Link>
    </div>
  );
}
