import type { Metadata } from "next";
import { RELEASES } from "@/lib/changelog";

export const metadata: Metadata = {
  title: "更新日志",
  description: "学术蒟蒻的版本更新记录：新增功能、改进与修复。",
  alternates: { canonical: "/changelog/" },
};

const KIND_STYLE: Record<string, string> = {
  新增: "bg-gold text-on-gold",
  改进: "bg-paper-deep text-zinc-700",
  修复: "bg-vermilion-pale text-vermilion",
};

export default function ChangelogPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <span className="tag-gold">Changelog</span>
      <h1 className="display mt-5 text-[44px]">更新日志</h1>
      <p className="mt-3 text-[15px] font-light leading-7 text-zinc-700">每次更新改了什么。有建议或发现问题，欢迎通过页脚的联系渠道告诉我们。</p>

      <ol className="mt-12 space-y-12 border-l border-rule pl-6 sm:pl-8">
        {RELEASES.map((r) => (
          <li key={r.version} className="relative">
            <span aria-hidden className="absolute -left-[31px] top-2 h-2.5 w-2.5 rounded-full bg-ink ring-4 ring-paper sm:-left-[37px]" />
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="headline text-[26px]">
                v{r.version} · {r.title}
              </h2>
              <time dateTime={r.date} className="font-mono text-[12px] text-zinc-500">
                {r.date}
              </time>
            </div>
            <ul className="mt-4 space-y-2.5">
              {r.items.map((it, i) => (
                <li key={i} className="flex gap-3 text-[14.5px] font-light leading-7 text-zinc-800">
                  <span className={`mt-1 h-fit shrink-0 rounded-[2px] px-1.5 py-0.5 font-mono text-[11px] font-medium ${KIND_STYLE[it.kind]}`}>{it.kind}</span>
                  <span>{it.text}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
