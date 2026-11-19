import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getAllResources,
  getAttachment,
  getBody,
  getResource,
} from "@/lib/content";
import { DetailShell } from "@/components/detail-shell";
import { Markdown } from "@/components/markdown";
import { CodeBlock } from "@/components/code-block";
import { CopyButton } from "@/components/copy-button";
import { TOOL_LABEL, type SkillResource } from "@/lib/types";

export function generateStaticParams() {
  return getAllResources()
    .filter((r) => r.type === "SKILL")
    .map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const r = getResource(slug);
  if (!r) return {};
  return {
    title: r.title,
    description: r.summary,
    alternates: { canonical: `/skills/${slug}/` },
    openGraph: { title: r.title, description: r.summary, type: "article" },
  };
}

export default async function SkillDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const r = getResource(slug);
  if (!r || r.type !== "SKILL") notFound();

  const resource = r as SkillResource;
  const body = getBody(resource);
  const skillMd = getAttachment(resource, "SKILL.md") ?? "";

  return (
    <DetailShell
      resource={resource}
      extraMeta={[
        {
          label: "兼容",
          value:
            resource.compat.map((c) => TOOL_LABEL[c.tool] ?? c.tool).join("、") ||
            "通用",
        },
        { label: "文件数", value: `${resource.files.length} 个` },
      ]}
    >
      {body && <Markdown source={body} />}

      {/* 兼容矩阵 */}
      <section className="mt-8">
        <h2 className="mb-3 text-[15px] font-semibold text-zinc-900">
          兼容工具
        </h2>
        <div className="overflow-hidden rounded-xl border border-zinc-200">
          <table className="w-full text-[12.5px]">
            <thead className="bg-zinc-50 text-left text-[11px] uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-medium">工具</th>
                <th className="px-3 py-2 font-medium">支持版本</th>
                <th className="px-3 py-2 font-medium">安装位置</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {resource.compat.map((c) => (
                <tr key={c.tool}>
                  <td className="px-3 py-2.5 font-medium text-zinc-800">
                    {TOOL_LABEL[c.tool] ?? c.tool}
                  </td>
                  <td className="px-3 py-2.5 text-zinc-600">
                    {c.supportedRange}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11.5px] text-zinc-500">
                    {c.installPath ?? "—"}
                    {c.note && (
                      <div className="mt-0.5 font-sans text-[11px] text-amber-600">
                        {c.note}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 文件树 */}
      <section className="mt-8">
        <h2 className="mb-3 text-[15px] font-semibold text-zinc-900">
          包内文件
        </h2>
        <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {resource.files.map((f) => (
            <li
              key={f.path}
              className="flex items-baseline gap-3 px-3 py-2 text-[12.5px]"
            >
              <span className="font-mono text-zinc-700">{f.path}</span>
              {f.size && (
                <span className="text-[11px] text-zinc-400">{f.size} B</span>
              )}
              {f.desc && (
                <span className="ml-auto truncate text-[11.5px] text-zinc-400">
                  {f.desc}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* 风险提示 */}
      {resource.risks && resource.risks.length > 0 && (
        <section className="mt-6 rounded-xl border border-rose-200 bg-rose-50/60 p-4">
          <h2 className="text-[13px] font-semibold text-rose-900">风险提示</h2>
          <ul className="mt-2 space-y-1.5 text-[12.5px] leading-6 text-rose-800">
            {resource.risks.map((x) => (
              <li key={x} className="flex gap-2">
                <span aria-hidden className="text-rose-400">
                  !
                </span>
                {x}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* SKILL.md 预览 */}
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-zinc-900">
            SKILL.md 预览
          </h2>
          {skillMd && (
            <CopyButton
              text={skillMd}
              label="复制 SKILL.md"
              variant="ghost"
              className="!px-2.5 !py-1.5 !text-[12px]"
            />
          )}
        </div>
        {skillMd ? (
          <CodeBlock code={skillMd} filename="SKILL.md" maxHeight="28rem" />
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-[13px] text-zinc-400">
            SKILL.md 内容待补充
          </p>
        )}
      </section>

      {resource.dependencies && resource.dependencies.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-[15px] font-semibold text-zinc-900">
            运行依赖
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {resource.dependencies.map((d) => (
              <span
                key={d}
                className="rounded-md bg-zinc-100 px-2 py-1 font-mono text-[11.5px] text-zinc-600"
              >
                {d}
              </span>
            ))}
          </div>
        </section>
      )}
    </DetailShell>
  );
}
