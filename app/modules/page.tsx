import type { Metadata } from "next";
import { getResourcesByType } from "@/lib/content";
import { buildSearchIndex } from "@/lib/search";
import { TypeListing } from "@/components/type-listing";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "即插即用模块",
  description:
    "可直接复制进项目的科研代码模块：统计检验选择与执行、出版级绘图样式、Bootstrap 置信区间与效应量。含依赖、用法与输出示例。",
};

export default function ModulesPage() {
  const docs = buildSearchIndex(getResourcesByType("MODULE"));
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <PageHeader
        title="即插即用模块"
        desc="单文件优先、依赖清晰、带自检示例的代码模块。复制进项目就能跑，不必先读完整仓库。"
        count={docs.length}
      />
      <TypeListing docs={docs} />
    </div>
  );
}
