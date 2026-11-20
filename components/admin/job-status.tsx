export const JOB_STATUS_LABEL = { queued: "排队中", running: "处理中", failed: "失败", done: "完成" } as const;
const STYLE = {
  queued: "bg-zinc-100 text-zinc-700",
  running: "bg-sky-100 text-sky-800",
  failed: "bg-rose-100 text-rose-800",
  done: "bg-emerald-100 text-emerald-800",
} as const;

export function JobStatusBadge({ status }: { status: string }) {
  const k = (status in JOB_STATUS_LABEL ? status : "queued") as keyof typeof JOB_STATUS_LABEL;
  return <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[12px] font-medium ${STYLE[k]}`}>{JOB_STATUS_LABEL[k]}</span>;
}

export const MODE_LABEL: Record<string, string> = { URL: "单个网址", BULK: "批量网址", QUERY: "搜索" };
