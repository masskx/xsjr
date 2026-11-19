import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "平台说明与边界",
  description:
    "科研 AI 资源工作台做什么、不做什么，资源来源与版权规则，以及侵权与失效链接的举报渠道。",
};

export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        平台说明与边界
      </h1>
      <p className="mt-3 text-[14px] leading-7 text-zinc-600">
        {SITE_NAME}
        是一个面向科研人员的 AI 资源发现与分发站点。我们做的事情很少，但要求做得准：把分散在
        GitHub、博客、群聊和网盘里的科研 AI
        资源，整理成可检索、可判断、可直接取用的条目。
      </p>

      <Section title="我们做什么">
        <ul className="md">
          <li>资源分类与检索：按类型、学科、标签与兼容工具筛选。</li>
          <li>规范化描述：每个资源写清解决什么问题、适合谁、怎么用、来源与许可证。</li>
          <li>参数化提示词：把模板里的变量做成表单，填完直接复制最终文本。</li>
          <li>Skill 与模块展示：给出文件结构、依赖、风险提示与可复制的代码。</li>
          <li>科研站点导航：标注收费模式、登录要求与最近核验时间。</li>
        </ul>
      </Section>

      <Section title="我们不做什么">
        <ul className="md">
          <li>不内置大模型对话，不代替你生成研究结论。</li>
          <li>不执行任何上传的脚本，不自动运行第三方代码。</li>
          <li>不读取、不存储你的科研数据与本地 Agent 配置。</li>
          <li>不把无法确认再分发权的资源重新打包分发。</li>
        </ul>
      </Section>

      <Section title="资源来源与版权规则" anchor="license">
        <ul className="md">
          <li>自制资源：标注作者、许可证与修订记录。</li>
          <li>
            第三方资源：标注上游仓库、许可证与作者署名；许可证允许再分发且经人工核验的，
            才提供下载，否则只提供摘要与原始链接。
          </li>
          <li>
            标有「EI」「SCI」的资源是会员内容，代表平台提供的整理、维护或已获授权的增值服务，
            不代表对第三方开源内容主张独占权。会员内容的标题、简介与适用场景对所有人可见。
          </li>
        </ul>
        <p className="mt-3 text-[13px] leading-6 text-zinc-500">
          如果你的作品不希望在本站展示，或发现许可证标注有误，请联系我们立即下架并更正。
        </p>
      </Section>

      <Section title="举报侵权与失效链接" anchor="report">
        <p className="text-[13.5px] leading-7 text-zinc-600">
          发现侵权内容、失效链接或危险脚本，请通过页脚的联系渠道反馈，并附上资源链接与具体情况。
          我们会在核实后下架或标记，并保留处理记录。
        </p>
        {/* TODO: 上线前把举报邮箱 / 表单地址填入 lib/site.ts 的 CONTACT */}
        <p className="mt-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2.5 text-[12.5px] text-zinc-500">
          举报渠道正在配置中（正式上线前公布邮箱与处理时限）。
        </p>
      </Section>

      <Section title="免责声明">
        <p className="text-[13.5px] leading-7 text-zinc-600">
          本站对第三方站点的内容、可用性与安全性不作担保。资源的使用效果取决于你使用的模型、
          工具版本与具体数据，请自行核验后再用于正式研究流程。
        </p>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
  anchor,
}: {
  title: string;
  children: React.ReactNode;
  anchor?: string;
}) {
  return (
    <section id={anchor} className="mt-10 scroll-mt-24">
      <h2 className="text-[15px] font-semibold tracking-tight text-zinc-900">
        {title}
      </h2>
      <div className="mt-3 text-[13.5px] leading-7 text-zinc-600">{children}</div>
    </section>
  );
}
