import Link from "next/link";
import { getNext, getRelated, recordViewAndGetStats } from "@/lib/repo";
import { TYPE_LABEL, TYPE_HREF, type Resource } from "@/lib/types";
import { ResourceCard, TypeBadge, TierBadge } from "./resource-card";

export async function DetailShell({
  resource,
  children,
  extraMeta,
  download,
}: {
  resource: Resource;
  children: React.ReactNode;
  extraMeta?: { label: string; value: React.ReactNode }[];
  /** ZIP download (skills and modules the viewer may download) */
  download?: { href: string; label: string };
}) {
  const [related, next, stats] = await Promise.all([getRelated(resource, 3), getNext(resource), recordViewAndGetStats(resource)]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <nav className="flex items-center gap-1.5 font-mono text-[12px] text-zinc-500">
        <Link href="/" className="no-underline hover:text-zinc-700">
          首页
        </Link>
        <span aria-hidden>/</span>
        <Link
          href={TYPE_HREF[resource.type]}
          className="no-underline hover:text-zinc-700"
        >
          {TYPE_LABEL[resource.type]}
        </Link>
        <span aria-hidden>/</span>
        <span className="truncate text-zinc-800">{resource.title}</span>
      </nav>

      <header className="mt-6 border-b border-rule pb-8">
        <div className="flex items-center gap-1.5">
          <TypeBadge type={resource.type} />
          <TierBadge tier={resource.tier} />
          <span className="font-mono text-[11px] text-zinc-500">
            更新于 {resource.updatedAt}
          </span>
          <span className="font-mono text-[11px] text-zinc-500" aria-label={`浏览 ${stats.views} 次`}>
            · 浏览 {stats.views}
          </span>
          {(resource.type === "SKILL" || resource.type === "MODULE") && (
            <span className="font-mono text-[11px] text-zinc-500" aria-label={`下载 ${stats.downloads} 次`}>
              · 下载 {stats.downloads}
            </span>
          )}
        </div>

        <h1 className="headline mt-4 max-w-4xl text-[36px] sm:text-[48px]">
          {resource.title}
        </h1>

        <p className="mt-4 max-w-3xl text-[16px] font-light leading-[1.75] text-zinc-700">
          {resource.summary}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="tag-mono">
            {resource.category}
          </span>
          {resource.tags.map((t) => (
            <Link
              key={t}
              href={`/search/?q=${encodeURIComponent(t)}`}
              className="rounded-[2px] border border-rule bg-paper-raised px-2 py-0.5 text-[12.5px] text-zinc-700 no-underline transition-shadow hover:shadow-md"
            >
              {t}
            </Link>
          ))}
        </div>
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_288px]">
        <div className="min-w-0">{children}</div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          {download && (
            <a href={download.href} className="btn-ink mb-4 w-full" download>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4" aria-hidden>
                <path d="M12 4v11m-5-5 5 5 5-5M5 20h14" />
              </svg>
              {download.label}
            </a>
          )}
          <div className="surface shadow-sm">
            <h2 className="eyebrow border-b border-rule px-4 py-3 text-zinc-600">
              资源信息
            </h2>
            <dl className="divide-y divide-[var(--color-rule)] text-[13px]">
              <Row label="许可证" value={resource.license} />
              <Row label="分类" value={resource.category} />
              <Row
                label="二次分发"
                value={
                  resource.redistribution ? (
                    <span className="inline-flex items-center gap-1.5 text-zinc-900"><span aria-hidden className="dot" />允许</span>
                  ) : (
                    <span className="text-zinc-500">仅索引，原文以来源为准</span>
                  )
                }
              />
              <Row label="最近更新" value={resource.updatedAt} />
              {resource.verifiedAt && (
                <Row label="最近核验" value={resource.verifiedAt} />
              )}
              {extraMeta?.map((m) => (
                <Row key={m.label} label={m.label} value={m.value} />
              ))}
              {resource.sourceUrl && (
                <Row
                  label="来源"
                  value={
                    <a
                      href={resource.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-line break-all"
                    >
                      {hostOf(resource.sourceUrl)}
                    </a>
                  }
                />
              )}
              {resource.licenseNote && (
                <Row label="版权说明" value={resource.licenseNote} />
              )}
            </dl>
          </div>

        </aside>
      </div>

      {(next || related.length > 0) && (
        <section aria-labelledby="continue-h" className="mt-16 border-t border-rule pt-10">
          <h2 id="continue-h" className="headline text-[30px]">继续浏览</h2>
          {next && (
            <Link
              href={`${TYPE_HREF[next.type]}/${next.slug}/`}
              className="surface group mt-5 flex items-center gap-4 p-5 no-underline transition-shadow hover:shadow-md"
            >
              <span className="eyebrow shrink-0 text-zinc-500">下一篇</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-semibold text-zinc-900 decoration-gold underline-offset-4 group-hover:underline">{next.title}</span>
                <span className="mt-0.5 block truncate text-[13px] font-light text-zinc-600">{next.summary}</span>
              </span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5 shrink-0 text-zinc-700 transition-transform group-hover:translate-x-1" aria-hidden>
                <path d="M4 12h15m-5-6 6 6-6 6" />
              </svg>
            </Link>
          )}
          {related.length > 0 && (
            <>
              <h3 className="eyebrow mb-3 mt-8 text-zinc-500">相关资源</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {related.map((r) => (
                  <ResourceCard key={r.slug} resource={r} />
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 px-4 py-2.5">
      <dt className="w-16 shrink-0 text-zinc-500">{label}</dt>
      <dd className="min-w-0 flex-1 text-zinc-800">{value}</dd>
    </div>
  );
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0];
  }
}
