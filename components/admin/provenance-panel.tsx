import { fmtDateTime } from "@/components/admin/ui";

const SOURCE: Record<string, string> = {
  PLATFORM: "平台原创",
  SPDX_DETECTED: "自动识别（LICENSE 文件）",
  PAGE_DECLARED: "自动识别（页面声明）",
  ADMIN_DECLARED: "管理员核实声明",
  UNKNOWN: "未能确定（仅索引）",
};

export interface ProvenanceRecord {
  id: number;
  sourceUrl: string;
  retrievedAt: Date;
  httpStatus: number | null;
  contentSha256: string | null;
  license: string;
  licenseSource: string;
  licenseEvidence: string | null;
  llmModel: string | null;
  licenseOpinion: string | null;
  jobId: number | null;
}

/** Read-only review panel for imported drafts: where it came from and why the licence is what it is. */
export function ProvenancePanel({ records, licenseSource }: { records: ProvenanceRecord[]; licenseSource: string | null }) {
  if (!records.length) return null;
  return (
    <section aria-labelledby="prov-h" className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 sm:p-5">
      <h2 id="prov-h" className="text-[15px] font-semibold text-zinc-900">来源与许可证依据</h2>
      <p className="mt-1 text-[12.5px] leading-5 text-zinc-600">
        这是自动导入的草稿，介绍文字由 AI 整理，发布前请逐项核对。当前许可证来源：
        <span className="font-medium text-zinc-800">{SOURCE[licenseSource ?? ""] ?? licenseSource}</span>
      </p>
      {records.map((r) => (
        <dl key={r.id} className="mt-3 grid gap-x-4 gap-y-1.5 text-[12.5px] text-zinc-700 sm:grid-cols-[7rem_minmax(0,1fr)]">
          <dt className="text-zinc-500">来源</dt>
          <dd className="min-w-0 break-all">
            <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-indigo-700">
              {r.sourceUrl}
            </a>
          </dd>
          <dt className="text-zinc-500">抓取时间</dt>
          <dd>
            {fmtDateTime.format(r.retrievedAt)}
            {r.httpStatus !== null && ` · HTTP ${r.httpStatus}`}
            {r.jobId && (
              <>
                {" · "}
                <a href={`/admin/ingest/${r.jobId}/`} className="text-indigo-700">
                  任务 #{r.jobId}
                </a>
              </>
            )}
          </dd>
          <dt className="text-zinc-500">许可证</dt>
          <dd>
            {r.license}（{SOURCE[r.licenseSource] ?? r.licenseSource}）
          </dd>
          {r.licenseEvidence && (
            <>
              <dt className="text-zinc-500">识别依据</dt>
              <dd>{r.licenseEvidence}</dd>
            </>
          )}
          {r.licenseOpinion && (
            <>
              <dt className="text-zinc-500">AI 看到的许可证</dt>
              <dd>
                {r.licenseOpinion} <span className="text-zinc-500">（仅供参考，不作为转载依据）</span>
              </dd>
            </>
          )}
          {r.llmModel && (
            <>
              <dt className="text-zinc-500">整理模型</dt>
              <dd>{r.llmModel}</dd>
            </>
          )}
          {r.contentSha256 && (
            <>
              <dt className="text-zinc-500">内容指纹</dt>
              <dd className="break-all font-mono text-[11.5px] text-zinc-500">sha256:{r.contentSha256}</dd>
            </>
          )}
        </dl>
      ))}
    </section>
  );
}
