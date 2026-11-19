import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center px-4 py-24 text-center">
      <span className="font-mono text-[11px] uppercase tracking-widest text-zinc-400">
        404
      </span>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900">
        这个资源不存在，或已下架
      </h1>
      <p className="mt-3 text-[13.5px] leading-6 text-zinc-500">
        可能是链接过期、资源被作者撤回，或地址拼写有误。
      </p>
      <div className="mt-6 flex gap-2">
        <Link
          href="/"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white no-underline hover:bg-zinc-800"
        >
          回到首页
        </Link>
        <Link
          href="/search/"
          className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 no-underline hover:bg-zinc-50"
        >
          搜索资源
        </Link>
      </div>
    </div>
  );
}
