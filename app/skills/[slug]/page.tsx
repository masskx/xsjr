import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getAttachment,
  getBody,
  getResource,
} from "@/lib/repo";
import { DetailShell } from "@/components/detail-shell";
import { Markdown } from "@/components/markdown";
import { CodeBlock } from "@/components/code-block";
import { CopyButton } from "@/components/copy-button";
import { TOOL_LABEL, type SkillResource } from "@/lib/types";
import { SkillInstall } from "@/components/skill-install";
import { skillDirName } from "@/lib/stats/zip";
import { SITE_URL } from "@/lib/site";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const r = await getResource(slug);
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
  const r = await getResource(slug);
  if (!r || r.type !== "SKILL") notFound();

  const resource = r as SkillResource;
  const body = await getBody(resource);
  const skillMd = resource.redistribution ? (await getAttachment(resource, "SKILL.md")) ?? "" : "";

  return (
    <DetailShell
      resource={resource}
      download={resource.redistribution && skillMd ? { href: `/api/download/skills/${resource.slug}/`, label: "下载 Skill（ZIP）" } : undefined}
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

      {/* SKILL.md 预览；仅索引的 Skill 不保存原文，只链接来源 */}
      {resource.redistribution ? (
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
      ) : (
        <section className="mt-8 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-[13px] leading-6 text-zinc-600">
          <h2 className="text-[15px] font-semibold text-zinc-900">获取原文</h2>
          <p className="mt-1">
            这个 Skill 的许可证不允许本站转载（或无法确认），本站只做索引。请到来源查看 SKILL.md
            原文与使用条款。
          </p>
          {resource.sourceUrl && (
            <a
              href={resource.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 rounded-lg bg-zinc-900 px-3 py-2 text-[12.5px] font-medium text-white no-underline hover:bg-zinc-700"
            >
              前往来源查看原文 ↗
            </a>
          )}
        </section>
      )}

      <SkillInstall
        resource={resource}
        skillDir={skillDirName(skillMd, resource.slug)}
        zipUrl={resource.redistribution && skillMd ? `${SITE_URL}/api/download/skills/${resource.slug}/` : null}
      />

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
