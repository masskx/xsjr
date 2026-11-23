import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBody, getDiagram, getResource } from "@/lib/repo";
import { SiteIcon } from "@/components/site-icon";
import { DetailShell } from "@/components/detail-shell";
import { Markdown } from "@/components/markdown";
import type { SiteResource } from "@/lib/types";

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
    alternates: { canonical: `/directory/${slug}/` },
  };
}

export default async function SiteDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const r = await getResource(slug);
  if (!r || r.type !== "SITE") notFound();

  const resource = r as SiteResource;
  const [body, icon] = await Promise.all([getBody(resource), getDiagram(resource)]);

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
        ...(resource.isPromotion
          ? [{ label: "链接性质", value: <span className="tag-mono border-amber-300 bg-amber-50 text-amber-800">推广</span> }]
          : []),
      ]}
    >
      {body && <Markdown source={body} />}

      <section className="surface mt-8 flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <SiteIcon title={resource.title} slug={resource.slug} icon={icon} size={72} />
        <div className="min-w-0 flex-1">
        <h2 className="text-[15px] font-semibold text-zinc-900">
          前往官网
        </h2>
        <p className="mt-1.5 text-[12.5px] leading-6 text-zinc-500">
          将在新窗口打开第三方站点，本站不对其内容与可用性负责。核验时间：
          {resource.verifiedAt ?? resource.updatedAt}。
        </p>
        <a
          href={resource.url}
          target="_blank"
          rel={resource.isPromotion ? "sponsored nofollow noopener noreferrer" : "noopener noreferrer"}
          className="btn-ink mt-4"
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
        {resource.isPromotion && (
          <p className="mt-2 text-[12px] text-amber-800">该链接为推广链接。</p>
        )}
        </div>
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
