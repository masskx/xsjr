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
import { PromptPlayground } from "@/components/prompt-playground";
import type { PromptResource } from "@/lib/types";

export function generateStaticParams() {
  return getAllResources()
    .filter((r) => r.type === "PROMPT")
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
    alternates: { canonical: `/prompts/${slug}/` },
    openGraph: { title: r.title, description: r.summary, type: "article" },
  };
}

export default async function PromptDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const r = getResource(slug);
  if (!r || r.type !== "PROMPT") notFound();

  const resource = r as PromptResource;
  const body = getBody(resource);
  const template = getAttachment(resource, "template.md") ?? "";

  return (
    <DetailShell
      resource={resource}
      extraMeta={[
        { label: "变量", value: `${resource.variables.length} 个` },
        { label: "模型无关", value: "是，任意对话产品可用" },
      ]}
    >
      {body && (
        <section>
          <Markdown source={body} />
        </section>
      )}

      {resource.notes && resource.notes.length > 0 && (
        <section className="mt-6 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <h2 className="text-[13px] font-semibold text-amber-900">使用注意</h2>
          <ul className="mt-2 space-y-1.5 text-[12.5px] leading-6 text-amber-800">
            {resource.notes.map((n) => (
              <li key={n} className="flex gap-2">
                <span aria-hidden className="text-amber-400">
                  ·
                </span>
                {n}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold text-zinc-900">提示词模板</h2>
          <span className="text-[11px] text-zinc-400">
            {`{{ }}`} 内为可替换变量
          </span>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4">
          <Markdown source={template} highlight />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-[15px] font-semibold text-zinc-900">
          填写变量并生成最终文本
        </h2>
        <PromptPlayground template={template} variables={resource.variables} />
      </section>
    </DetailShell>
  );
}
