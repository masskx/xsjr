import type { Metadata } from "next";
import Link from "next/link";
import { AutoRefresh } from "@/components/admin/auto-refresh";
import { QueryJobForm, UrlJobForm } from "@/components/admin/ingest-forms";
import { JobStatusBadge, MODE_LABEL } from "@/components/admin/job-status";
import { Notice, fmtDateTime } from "@/components/admin/ui";
import { adminData } from "@/lib/admin/server";
import { MAX_QUERY_RESULTS, MAX_URLS_PER_JOB } from "@/lib/ingest/limits";

export const metadata: Metadata = { title: "导入" };

function describeInput(mode: string, input: unknown): string {
  const i = input as { urls?: string[]; query?: string; domains?: string[] };
  if (mode === "QUERY") return `“${i.query ?? ""}” · ${(i.domains ?? []).join(", ")}`;
  const urls = i.urls ?? [];
  return urls.length === 1 ? urls[0] : `${urls[0] ?? ""} 等 ${urls.length} 个`;
}

export default async function IngestPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const sp = await searchParams;
  const [status, jobs] = await Promise.all([adminData.ingestStatus(), adminData.ingestJobs()]);
  const active = jobs.some((j) => j.status === "queued" || j.status === "running");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">导入 Skill</h1>
        <p className="mt-1 text-[13.5px] leading-6 text-zinc-500">
          从网址或搜索结果抓取来源，交给 DeepSeek 整理成<strong className="font-medium text-zinc-700">草稿</strong>。导入的内容不会自动发布；许可证不明确的只做索引（不保存原文，详情页链接到来源）。
        </p>
      </div>

      {sp.msg === "retry" && <Notice tone="ok">已重新排队。</Notice>}
      {sp.err && <Notice tone="error">{sp.err}</Notice>}

      {!status.enabled ? (
        <Notice tone="error">
          导入功能未开启：服务器没有配置 <code>DEEPSEEK_API_KEY</code>。在服务器 <code>.env</code> 中填写后执行 apply-config（见运维手册第 14 节）。
        </Notice>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
            <h2 className="text-[15px] font-semibold text-zinc-900">按网址导入</h2>
            <div className="mt-4">
              <UrlJobForm max={MAX_URLS_PER_JOB} />
            </div>
          </section>
          <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
            <h2 className="text-[15px] font-semibold text-zinc-900">按搜索导入</h2>
            <div className="mt-4">
              {status.searchProvider ? (
                <QueryJobForm max={MAX_QUERY_RESULTS} />
              ) : (
                <p className="text-[13px] leading-6 text-zinc-500">
                  未配置搜索服务。DeepSeek 本身不能联网搜索；配置 <code>SEARCH_PROVIDER=bocha</code> 和 <code>BOCHA_API_KEY</code> 后可用（运维手册第 14 节）。目前请按网址导入。
                </p>
              )}
            </div>
          </section>
        </div>
      )}

      <p className="text-[12.5px] text-zinc-500">
        模型 {status.model} · 今日已用 {status.tokensToday.toLocaleString("zh-CN")} / {status.dailyTokenLimit.toLocaleString("zh-CN")} tokens（超出后当天暂停，次日自动继续）
      </p>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-zinc-900">最近的任务</h2>
          <AutoRefresh active={active} />
        </div>
        {jobs.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-zinc-300 p-6 text-center text-[13px] text-zinc-500">还没有导入任务。</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            {jobs.map((j) => {
              const total = j.counts.queued + j.counts.running + j.counts.failed + j.counts.done;
              return (
                <li key={j.id}>
                  <Link href={`/admin/ingest/${j.id}/`} className="block px-4 py-3 no-underline hover:bg-zinc-50">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-medium text-zinc-900">#{j.id}</span>
                      <JobStatusBadge status={j.status} />
                      <span className="text-[12.5px] text-zinc-500">{MODE_LABEL[j.mode] ?? j.mode}</span>
                      <span className="ml-auto text-[12px] text-zinc-400">{fmtDateTime.format(j.createdAt)}</span>
                    </div>
                    <p className="mt-1 truncate font-mono text-[12px] text-zinc-500">{describeInput(j.mode, j.input)}</p>
                    <p className="mt-1 text-[12.5px] text-zinc-600">
                      共 {total} 条 · 草稿 {j.counts.drafts} · 重复 {j.counts.duplicates} · 失败 {j.counts.failed}
                      {j.counts.queued + j.counts.running > 0 && ` · 进行中 ${j.counts.queued + j.counts.running}`}
                      {j.error && <span className="text-rose-700"> · {j.error}</span>}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
