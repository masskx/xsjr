import type { Metadata } from "next";
import { getResourcesByType } from "@/lib/content";
import { buildSearchIndex } from "@/lib/search";
import { TypeListing } from "@/components/type-listing";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "科研导航",
  description:
    "科研常用站点与数据集导航：文献检索、预印本、数据集与代码托管、写作工具。标注收费模式、访问条件与核验日期。",
};

export default function DirectoryPage() {
  const docs = buildSearchIndex(getResourcesByType("SITE"));
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <PageHeader
        title="科研导航"
        desc="经过人工核验的科研站点：写明收费模式、是否需要登录、适用领域与最近核验时间。跳转均在新窗口打开。"
        count={docs.length}
      />
      <TypeListing docs={docs} />
    </div>
  );
}
