import type { ReactNode } from "react";

export const STATUS_LABEL = { DRAFT: "草稿", PUBLISHED: "已发布", ARCHIVED: "已归档" } as const;

export function StatusBadge({ status }: { status: keyof typeof STATUS_LABEL }) {
  const style = {
    DRAFT: "bg-amber-50 text-amber-800 ring-amber-200",
    PUBLISHED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    ARCHIVED: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  }[status];
  return <span className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[11.5px] font-medium ring-1 ring-inset ${style}`}>{STATUS_LABEL[status]}</span>;
}

export function Notice({ tone, children }: { tone: "ok" | "error"; children: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`mb-5 rounded-lg border px-3 py-2.5 text-[13.5px] leading-6 ${
        tone === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}
    >
      {children}
    </div>
  );
}

export const btn = {
  primary:
    "inline-flex items-center justify-center rounded-lg bg-zinc-900 px-3.5 py-2 text-[13.5px] font-medium text-white no-underline hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 focus-visible:ring-offset-2 disabled:opacity-60",
  secondary:
    "inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-[13.5px] text-zinc-800 no-underline hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 disabled:opacity-60",
  danger:
    "inline-flex items-center justify-center rounded-lg border border-rose-300 bg-white px-3.5 py-2 text-[13.5px] text-rose-700 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600/30",
  icon: "inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 disabled:opacity-40",
};

export const fmtDateTime = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short" });
