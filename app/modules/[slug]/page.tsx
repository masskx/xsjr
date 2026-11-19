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
import type { ModuleResource } from "@/lib/types";

export function generateStaticParams() {
  return getAllResources()
    .filter((r) => r.type === "MODULE")
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
    alternates: { canonical: `/modules/${slug}/` },
    openGraph: { title: r.title, description: r.summary, type: "article" },
  };
}

export default async function ModuleDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const r = getResource(slug);
  if (!r || r.type !== "MODULE") notFound();

  const resource = r as ModuleResource;
  const body = getBody(resource);
  const code = getAttachment(resource, resource.entry) ?? "";

  return (
    <DetailShell
      resource={resource}
      extraMeta={[
        { label: "语言", value: resource.language },
        { label: "入口文件", value: resource.entry.replace(/^files\//, "") },
      ]}
    >
      {body && <Markdown source={body} />}

      <section className="mt-8">
        <h2 className="mb-3 text-[15px] font-semibold text-zinc-900">
          环境与依赖
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {resource.env.map((e) => (
            <span
              key={e}
              className="rounded-md bg-zinc-100 px-2 py-1 font-mono text-[11.5px] text-zinc-600"
            >
              {e}
            </span>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-[15px] font-semibold text-zinc-900">
          完整代码
        </h2>
        {code ? (
          <CodeBlock
            code={code}
            filename={resource.entry.replace(/^files\//, "")}
            language={resource.language}
            maxHeight="40rem"
          />
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-[13px] text-zinc-400">
            代码文件缺失
          </p>
        )}
      </section>
    </DetailShell>
  );
}
