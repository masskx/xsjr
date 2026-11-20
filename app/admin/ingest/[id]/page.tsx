import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/admin/auto-refresh";
import { JobStatusBadge, MODE_LABEL } from "@/components/admin/job-status";
import { Notice, btn, fmtDateTime } from "@/components/admin/ui";
import { adminData } from "@/lib/admin/server";
import { retryIngestItemAction } from "../../actions";

export const metadata: Metadata = { title: "导入任务" };

const LICENSE_SOURCE: Record<string, string> = {
  SPDX_DETECTED: "LICENSE 文件识别",
  PAGE_DECLARED: "页面声明",
  UNKNOWN: "未能确定",
};

const ADMIN_PATH: Record<string, string> = { SKILL: "skills", PROMPT: "prompts", MODULE: "modules" };

export default async function IngestJobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; skipped?: string; msg?: string; err?: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const data = await adminData.ingestJob(id);
  if (!data) notFound();
  const sp = await searchParams;
  const { job, items } = data;
  const active = job.status === "queued" || job.status === "running" || items.some((i) => i.item.status === "queued" || i.item.status === "running");
  const input = job.input as { query?: string; domains?: string[] };

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/ingest/" className="text-[13px] text-zinc-500">
          ← 返回导入
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">导入任务 #{job.id}</h1>
          <JobStatusBadge status={job.status} />
          <span className="text-[13px] text-zinc-500">{MODE_LABEL[job.mode] ?? job.mode}</span>
        </div>
        <p className="mt-1 text-[12.5px] text-zinc-500">
          创建于 {fmtDateTime.format(job.createdAt)}
          {job.finishedAt && ` · 完成于 ${fmtDateTime.format(job.finishedAt)}`}
          {job.mode === "QUERY" && ` · 搜索“${input.query}”，限 ${(input.domains ?? []).join(", ")}`}
        </p>
      </div>

      {sp.created && sp.created !== "query" && (
        <Notice tone="ok">
          已排队 {sp.created} 个网址{Number(sp.skipped) > 0 ? `，${sp.skipped} 个已在其他任务中处理，已跳过` : ""}。结果都是草稿，审核后再发布。
        </Notice>
      )}
      {sp.created === "query" && <Notice tone="ok">已排队：先搜索，再逐条导入允许域名内的结果。</Notice>}
      {sp.msg === "retry" && <Notice tone="ok">已重新排队。</Notice>}
      {sp.err && <Notice tone="error">{sp.err}</Notice>}
      {job.error && <Notice tone="error">{job.error}</Notice>}
      <AutoRefresh active={active} />

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-[13px] text-zinc-500">{active ? "正在搜索…" : "没有条目。"}</p>
      ) : (
        <ul className="space-y-3">
          {items.map(({ item, draftTitle, draftStatus, dupTitle, dupType }) => (
            <li key={item.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <JobStatusBadge status={item.status} />
                <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="min-w-0 break-all font-mono text-[12.5px] text-indigo-700">
                  {item.sourceUrl}
                </a>
              </div>
              {item.title && <p className="mt-1.5 text-[13px] text-zinc-700">{item.title}</p>}
              <dl className="mt-2 grid gap-x-4 gap-y-1 text-[12.5px] text-zinc-600 sm:grid-cols-2">
                {item.httpStatus !== null && (
                  <div>
                    <dt className="inline text-zinc-400">HTTP </dt>
                    <dd className="inline">{item.httpStatus}{item.fetchedBytes !== null && ` · ${item.fetchedBytes < 1024 ? `${item.fetchedBytes} B` : `${Math.round(item.fetchedBytes / 1024)} KB`}`}</dd>
                  </div>
                )}
                {item.licenseSource && (
                  <div>
                    <dt className="inline text-zinc-400">许可证 </dt>
                    <dd className="inline">
                      {item.detectedLicense ?? "未知"}（{LICENSE_SOURCE[item.licenseSource] ?? item.licenseSource}）
                    </dd>
                  </div>
                )}
                {item.licenseEvidence && (
                  <div className="sm:col-span-2">
                    <dt className="inline text-zinc-400">依据 </dt>
                    <dd className="inline">{item.licenseEvidence}</dd>
                  </div>
                )}
                {item.llmModel && (
                  <div>
                    <dt className="inline text-zinc-400">模型 </dt>
                    <dd className="inline">
                      {item.llmModel} · {(item.llmTokensIn ?? 0) + (item.llmTokensOut ?? 0)} tokens
                    </dd>
                  </div>
                )}
                {item.attempts > 1 && (
                  <div>
                    <dt className="inline text-zinc-400">尝试 </dt>
                    <dd className="inline">{item.attempts} 次</dd>
                  </div>
                )}
              </dl>
              {item.resourceId && (
                <p className="mt-2 text-[13px]">
                  已生成草稿：
                  <Link href={`/admin/skills/${item.resourceId}/`} className="font-medium text-indigo-700">
                    {draftTitle ?? `#${item.resourceId}`}
                  </Link>
                  {draftStatus && draftStatus !== "DRAFT" && <span className="text-zinc-500">（当前状态：{draftStatus === "PUBLISHED" ? "已发布" : "已归档"}）</span>}
                </p>
              )}
              {item.duplicateOf && (
                <p className="mt-2 text-[13px] text-amber-800">
                  重复，未创建：{item.error}。已有：
                  <Link href={`/admin/${ADMIN_PATH[dupType ?? "SKILL"] ?? "skills"}/${item.duplicateOf}/`} className="font-medium text-indigo-700">
                    {dupTitle ?? `#${item.duplicateOf}`}
                  </Link>
                </p>
              )}
              {item.status !== "done" && item.error && <p className={`mt-2 text-[13px] ${item.status === "failed" ? "text-rose-700" : "text-zinc-600"}`}>{item.error}</p>}
              {item.status === "failed" && (
                <form action={retryIngestItemAction} className="mt-3">
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="job" value={job.id} />
                  <button className={btn.secondary}>重试</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
