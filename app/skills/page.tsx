import type { Metadata } from "next";
import { getResourcesByType } from "@/lib/repo";
import { buildSearchIndex } from "@/lib/search";
import { TypeListing } from "@/components/type-listing";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "Agent Skills",
  description:
    "遵循 Agent Skills 规范的科研技能包：模拟审稿人、绘图自检、参考文献核验、学位论文结构规划。含 SKILL.md 预览、文件树、兼容工具与风险提示。",
};

export default async function SkillsPage() {
  const docs = buildSearchIndex(await getResourcesByType("SKILL"));
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <PageHeader
        title="科研 Skills"
        desc="按 Agent Skills 规范组织的技能包，可直接放进 Claude Code、Codex 等工具的 skills 目录。平台不执行任何包内脚本。"
        count={docs.length}
      />
      <TypeListing docs={docs} />
    </div>
  );
}
