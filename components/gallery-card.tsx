import Link from "next/link";
import type { Diagram, FileMeta } from "@/lib/repo";
import type { ModuleResource } from "@/lib/types";
import { FileTree } from "./file-tree";
import { TierBadge } from "./resource-card";

/** Module gallery card: a visual thumbnail (structure diagram or file tree) above the text. */
export function GalleryCard({ module, diagram, files, preview }: { module: ModuleResource; diagram: Diagram | null; files: FileMeta[]; preview?: string }) {
  const snippet = preview?.split("\n").slice(0, 14).join("\n");
  return (
    <Link
      href={`/modules/${module.slug}/`}
      className="surface group flex flex-col overflow-hidden no-underline transition-shadow duration-200 hover:shadow-md"
    >
      <div className="relative flex aspect-[16/9] items-center justify-center overflow-hidden border-b border-rule bg-paper-deep">
        {diagram ? (
          // eslint-disable-next-line @next/next/no-img-element -- images.unoptimized; served by Caddy
          <img src={diagram.src} width={diagram.width} height={diagram.height} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain" />
        ) : snippet ? (
          <pre aria-hidden className="m-0 h-full w-full overflow-hidden bg-[oklch(17%_0_0)] px-4 pb-3 pt-9 font-mono text-[10.5px] leading-[1.55] text-zinc-300 [mask-image:linear-gradient(to_bottom,black_70%,transparent)]">
            {snippet}
          </pre>
        ) : (
          <div aria-hidden className="w-full max-w-full overflow-hidden px-4 py-3">
            <FileTree files={files} root={module.slug} compact />
          </div>
        )}
        <span className="absolute left-2 top-2 flex gap-1">
          <span className="tag-mono bg-paper-raised/95 ring-1 ring-rule">{module.language}</span>
          <TierBadge tier={module.tier} />
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-[16px] font-semibold leading-snug text-zinc-900 decoration-gold decoration-1 underline-offset-4 group-hover:underline">{module.title}</h3>
        <p className="mt-1.5 line-clamp-2 text-[13.5px] font-light leading-6 text-zinc-600">{module.summary}</p>
        {module.applicableTasks && module.applicableTasks.length > 0 && (
          <ul className="mt-2.5 space-y-0.5 text-[12px] text-zinc-600">
            {module.applicableTasks.slice(0, 3).map((t) => (
              <li key={t} className="flex gap-1.5">
                <span aria-hidden className="text-patina-deep">
                  ✓
                </span>
                <span className="line-clamp-1">{t}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-auto flex flex-wrap gap-1 pt-3">
          <span className="tag-mono">{module.category}</span>
          {module.tags.slice(0, 3).map((t) => (
            <span key={t} className="rounded-[2px] border border-rule px-1.5 py-0.5 text-[11.5px] text-zinc-600">
              {t}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
