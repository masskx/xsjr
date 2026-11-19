import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAllResources, getBody, getResource } from "@/lib/content";
import { DetailShell } from "@/components/detail-shell";
import { Markdown } from "@/components/markdown";
import type { SiteResource } from "@/lib/types";

export function generateStaticParams() {
  return getAllResources()
    .filter((r) => r.type === "SITE")
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
    alternates: { canonical: `/directory/${slug}/` },
  };
}

export default async function SiteDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const r = getResource(slug);
  if (!r || r.type !== "SITE") notFound();

  const resource = r as SiteResource;
  const body = getBody(resource);

  return (
    <DetailShell
      resource={resource}
      extraMeta={[
        { label: "收费", value: resource.pricing },
        ...(resource.region
          ? [{ label: "访问地区", value: resource.region }]
          : []),
        {
          label: "登录",
          value: resource.loginRequired ? "需要登录" : "无需登录",
        },
      ]}
    >
      {body && <Markdown source={body} />}

      <section className="mt-8 rounded-xl border border-zinc-200 bg-zinc-50/60 p-5">
        <h2 className="text-[13px] font-semibold text-zinc-900">
          前往官网
        </h2>
        <p className="mt-1.5 text-[12.5px] leading-6 text-zinc-500">
          将在新窗口打开第三方站点，本站不对其内容与可用性负责。核验时间：
          {resource.verifiedAt ?? resource.updatedAt}。
        </p>
        <a
          href={resource.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white no-underline transition-colors hover:bg-zinc-800"
        >
          打开 {safeHost(resource.url)}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="h-4 w-4"
            aria-hidden
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <path d="M15 3h6v6" />
            <path d="M10 14 21 3" />
          </svg>
        </a>
      </section>
    </DetailShell>
  );
}

function safeHost(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
