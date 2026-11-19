import type { Diagram, FileMeta } from "@/lib/repo";
import { FileTree } from "./file-tree";

/**
 * Module structure diagram: the uploaded image when there is one, otherwise a file-structure
 * diagram generated from file names. Public for everyone (members-only modules included).
 */
export function StructureDiagram({ diagram, files, slug }: { diagram: Diagram | null; files: FileMeta[]; slug: string }) {
  return (
    <figure className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      {diagram ? (
        // eslint-disable-next-line @next/next/no-img-element -- plain <img>: images.unoptimized, served by Caddy
        <img
          src={diagram.src}
          width={diagram.width}
          height={diagram.height}
          alt={diagram.alt}
          loading="eager"
          decoding="async"
          className="mx-auto block h-auto max-h-[28rem] w-auto max-w-full bg-zinc-50 object-contain"
        />
      ) : (
        <div className="overflow-x-auto bg-zinc-50/60 px-5 py-4">
          <FileTree files={files} root={slug} />
        </div>
      )}
      <figcaption className="border-t border-zinc-100 px-4 py-2 text-[12px] text-zinc-500">
        {diagram ? diagram.alt : "文件结构（根据模块文件自动生成）"}
      </figcaption>
    </figure>
  );
}
