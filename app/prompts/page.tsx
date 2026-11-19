import type { Metadata } from "next";
import { getResourcesByType } from "@/lib/repo";
import { buildSearchIndex } from "@/lib/search";
import { TypeListing } from "@/components/type-listing";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "科研提示词",
  description:
    "按场景整理的科研提示词模板：文献综述、审稿回复、统计检验、论文润色、实验设计。带变量表单，填空后一键复制到 Claude、ChatGPT 等工具使用。",
};

export default async function PromptsPage() {
  const docs = buildSearchIndex(await getResourcesByType("PROMPT"));
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <PageHeader
        title="科研提示词"
        desc="带变量的模板：填好研究主题、数据情况或期刊要求，一键生成最终文本，复制到你自己的模型里用。"
        count={docs.length}
      />
      <TypeListing docs={docs} />
    </div>
  );
}
