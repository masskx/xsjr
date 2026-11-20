import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAccess, getBody, getDiagram, getFileIndex, getModuleFiles, getResource } from "@/lib/repo";
import { LockedCode } from "@/components/locked-code";
import { DetailShell } from "@/components/detail-shell";
import { Markdown } from "@/components/markdown";
import { CodeTabs } from "@/components/code-tabs";
import { StructureDiagram } from "@/components/structure-diagram";
import type { ModuleResource } from "@/lib/types";

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
  const r = await getResource(slug);
  if (!r || r.type !== "MODULE") notFound();

  const resource = r as ModuleResource;
  const [body, access, diagram, fileIndex] = await Promise.all([getBody(resource), getAccess(resource), getDiagram(resource), getFileIndex(resource)]);
  // Members-only code is only returned by the repo to an entitled viewer (checked there and in
  // SQL); for everyone else `files` is null and the response contains no code at all.
  const files = access.allowed ? await getModuleFiles(resource) : null;
  const entry = resource.entry.replace(/^files\//, "");

  return (
    <DetailShell
      resource={resource}
      categoryHref={`/modules/?category=${encodeURIComponent(resource.category)}`}
      linkTags={false}
      download={files ? { href: `/api/download/modules/${resource.slug}/`, label: "下载模块（ZIP）" } : undefined}
      extraMeta={[
        { label: "语言", value: resource.language },
        { label: "入口文件", value: entry },
        { label: "文件数", value: `${fileIndex.length} 个` },
      ]}
    >
      {/* 1. structure diagram (public, also for members-only modules) */}
      <section aria-labelledby="structure">
        <h2 id="structure" className="sr-only">
          结构图
        </h2>
        <StructureDiagram diagram={diagram} files={fileIndex} slug={resource.slug} />
      </section>

      {/* 2. introduction */}
      {body && (
        <section className="mt-8">
          <Markdown source={body} />
        </section>
      )}

      {/* 3. applicable tasks */}
      {resource.applicableTasks && resource.applicableTasks.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-[15px] font-semibold text-zinc-900">适用任务</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {resource.applicableTasks.map((t) => (
              <li key={t} className="flex gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px] leading-6 text-zinc-700">
                <span aria-hidden className="text-emerald-600">
                  ✓
                </span>
                {t}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 4. code: one tab per file, copy per file; or the lock panel */}
      <section className="mt-8">
        <h2 className="mb-3 text-[15px] font-semibold text-zinc-900">完整代码</h2>
        {!access.allowed ? (
          <LockedCode access={access} returnTo={`/modules/${resource.slug}/`} />
        ) : files ? (
          <CodeTabs files={files} />
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-[13px] text-zinc-400">代码文件缺失</p>
        )}
      </section>

      {/* 5. environment, dependencies, usage */}
      <section className="mt-8">
        <h2 className="mb-3 text-[15px] font-semibold text-zinc-900">环境与依赖</h2>
        <div className="flex flex-wrap gap-1.5">
          {[...resource.env, ...(resource.dependencies ?? [])].map((e) => (
            <span key={e} className="rounded-md bg-zinc-100 px-2 py-1 font-mono text-[11.5px] text-zinc-600">
              {e}
            </span>
          ))}
        </div>
      </section>

      {resource.usage && resource.usage.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-[15px] font-semibold text-zinc-900">用法示例</h2>
          <ol className="space-y-2">
            {resource.usage.map((u, i) => (
              <li key={i} className="flex gap-3 text-[13px] leading-6 text-zinc-700">
                <span aria-hidden className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-zinc-100 text-[11px] text-zinc-500">
                  {i + 1}
                </span>
                <code className="min-w-0 break-words font-mono text-[12.5px] text-zinc-800">{u}</code>
              </li>
            ))}
          </ol>
        </section>
      )}
    </DetailShell>
  );
}
