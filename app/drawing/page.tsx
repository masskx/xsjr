import type { Metadata } from "next";
import Link from "next/link";
import { getDiagram, getResourcesByType } from "@/lib/repo";
import { PageHeader } from "@/components/page-header";
import { DRAWING_PALETTES } from "@/lib/drawing/palettes";
import type { ModuleResource } from "@/lib/types";

export const metadata: Metadata = {
  title: "科研绘图",
  description: "从即插即用模块架构图中提取的科研配色方案，左侧成品图、右侧色条，适合论文示意图、海报与演示文稿。",
  alternates: { canonical: "/drawing/" },
};

export default async function DrawingPage() {
  const modules = (await getResourcesByType("MODULE")) as ModuleResource[];
  const cards = await Promise.all(
    modules.map(async (module) => ({
      module,
      diagram: await getDiagram(module),
      colors: DRAWING_PALETTES[module.slug] ?? [],
    })),
  );
  const items = cards.filter((item) => item.diagram && item.colors.length > 0);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <PageHeader
        title="科研绘图"
        desc="从模块架构图中自动提取的配色方案。左侧是成品图，右侧是从图中提取的色条，适合用于论文示意图、海报和演示文稿；点击卡片可查看对应模块。"
        count={items.length}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map(({ module, diagram, colors }) => (
          <Link
            key={module.slug}
            href={`/modules/${module.slug}/`}
            className="surface group flex gap-3 p-3 no-underline transition-shadow duration-200 hover:shadow-md"
          >
            <div className="flex w-[44%] shrink-0 items-center justify-center overflow-hidden rounded-[8px] border border-rule bg-white p-1.5">
              <img
                src={diagram!.src}
                alt={`${module.title} 架构图`}
                loading="lazy"
                decoding="async"
                className="max-h-[120px] w-full object-contain"
              />
            </div>
            <div className="flex min-w-0 flex-1 gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="line-clamp-2 text-[13px] font-semibold leading-snug text-zinc-900 group-hover:underline group-hover:underline-offset-4">
                  {module.title}
                </h2>
                <p className="mt-1 line-clamp-1 font-mono text-[10.5px] text-zinc-500">{module.category || "模块"}</p>
                <span className="mt-3 inline-block text-[11px] text-zinc-500 group-hover:text-zinc-900">查看模块 →</span>
              </div>
              <div
                className="flex w-8 shrink-0 flex-col overflow-hidden rounded-[5px] border border-rule"
                aria-label={`${module.title} 配色`}
              >
                {colors.map((color, index) => (
                  <span
                    key={`${color}-${index}`}
                    className="min-h-[10px] flex-1"
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
