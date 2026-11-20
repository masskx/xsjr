// Public changelog (/changelog/): what changed for visitors, in plain Chinese. Newest first.
// The engineering changelog with every technical detail is CHANGELOG.md in the repository.

export interface Release {
  version: string;
  date: string;
  title: string;
  items: { kind: "新增" | "改进" | "修复"; text: string }[];
}

export const RELEASES: Release[] = [
  {
    version: "2.3",
    date: "2026-11-20",
    title: "学术蒟蒻：新名字、新首页",
    items: [
      { kind: "新增", text: "网站更名为“学术蒟蒻”，启用新标识（悬停或点按“蒟蒻”二字看看它的读音和意思）。" },
      { kind: "新增", text: "首页加入“人工智能，一部简史”时间线：从 1943 年的神经元模型到 2025 年的推理模型与智能体。" },
      { kind: "新增", text: "外部聚合检索：综合搜索、中文文献、英文文献、专利、期刊、自媒体和中英互译七类，一键在新标签页打开知网、万方、PubMed、Google Scholar 等站点。" },
      { kind: "新增", text: "Skill 和代码模块支持打包下载（ZIP），详情页显示浏览量和下载量。" },
      { kind: "新增", text: "Skill 详情页改为按工具分别给出的安装说明（Claude Code、Codex、Cursor、Gemini CLI），附官方文档出处；未核实的工具明确标注“未验证”。" },
      { kind: "新增", text: "资源详情页底部增加“下一篇”和“相关资源”，方便连续浏览。" },
      { kind: "新增", text: "科研导航改为图标卡片，按分类排列；每天首次访问时显示站点公告。" },
      { kind: "改进", text: "模块画廊在没有结构图时显示入口代码的预览。" },
      { kind: "改进", text: "注册更简单：普通用户密码至少 8 位即可，邮箱验证改为可选，登录无需两步验证。" },
      { kind: "改进", text: "标题改用衬线字体，整体更接近学术出版物的版式。" },
    ],
  },
  {
    version: "2.2",
    date: "2026-11-20",
    title: "新的视觉风格与批量上传",
    items: [
      { kind: "改进", text: "全站改为“纸与墨”风格：更安静的配色、更清楚的层次，字体随网站一起提供，国内访问不依赖境外字体服务。" },
      { kind: "新增", text: "管理员可以批量上传 Skills 和代码模块（含结构图）。" },
      { kind: "新增", text: "页脚显示 ICP 备案号与公安备案号（取得后）。" },
    ],
  },
  {
    version: "2.1",
    date: "2026-11-20",
    title: "从网页导入 Skill",
    items: [
      { kind: "新增", text: "管理员可以从网址导入第三方 Skill，由 AI 整理成草稿，人工审核后发布。" },
      { kind: "改进", text: "许可证不允许转载的 Skill 只做索引，详情页提供“前往来源查看原文”。" },
    ],
  },
  {
    version: "2.0",
    date: "2026-11-19",
    title: "账户、会员与统计",
    items: [
      { kind: "新增", text: "支持注册与登录（开通 HTTPS 后启用）、EI / SCI 会员模块。" },
      { kind: "新增", text: "模块画廊与结构图。" },
      { kind: "新增", text: "第一方匿名访问统计：不用第三方代码、不用 Cookie、不保存 IP。" },
    ],
  },
  {
    version: "1.0",
    date: "2026-11-01",
    title: "上线",
    items: [{ kind: "新增", text: "提示词、Agent Skills、代码模块与科研导航四类资源，支持中文、拼音与首字母搜索。" }],
  },
];
