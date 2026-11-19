import Link from "next/link";
import type { Diagram, FileMeta } from "@/lib/repo";
import type { ModuleResource } from "@/lib/types";
import { FileTree } from "./file-tree";
import { TierBadge } from "./resource-card";

/** Module gallery card: a visual thumbnail (structure diagram or file tree) above the text. */
export function GalleryCard({ module, diagram, files }: { module: ModuleResource; diagram: Diagram | null; files: FileMeta[] }) {
  return (
    <Link
      href={`/modules/${module.slug}/`}
      className="group flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white no-underline transition-all hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.15)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <div className="relative flex aspect-[16/9] items-center justify-center overflow-hidden border-b border-zinc-100 bg-zinc-50">
        {diagram ? (
          // eslint-disable-next-line @next/next/no-img-element -- images.unoptimized; served by Caddy
          <img src={diagram.src} width={diagram.width} height={diagram.height} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain" />
        ) : (
          <div aria-hidden className="w-full max-w-full overflow-hidden px-4 py-3">
            <FileTree files={files} root={module.slug} compact />
          </div>
        )}
        <span className="absolute left-2 top-2 flex gap-1">
          <span className="rounded bg-white/90 px-1.5 py-0.5 font-mono text-[11px] text-zinc-600 ring-1 ring-zinc-200">{module.language}</span>
          <TierBadge tier={module.tier} />
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-[14.5px] font-semibold leading-snug text-zinc-900 group-hover:text-indigo-700">{module.title}</h3>
        <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-5 text-zinc-500">{module.summary}</p>
        {module.applicableTasks && module.applicableTasks.length > 0 && (
          <ul className="mt-2.5 space-y-0.5 text-[12px] text-zinc-600">
            {module.applicableTasks.slice(0, 3).map((t) => (
              <li key={t} className="flex gap-1.5">
                <span aria-hidden className="text-emerald-600">
                  ✓
                </span>
                <span className="line-clamp-1">{t}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-auto flex flex-wrap gap-1 pt-3">
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-600">{module.category}</span>
          {module.tags.slice(0, 3).map((t) => (
            <span key={t} className="rounded px-1.5 py-0.5 text-[11px] text-zinc-500 ring-1 ring-inset ring-zinc-200">
              {t}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
