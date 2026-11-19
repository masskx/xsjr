export const SITE_NAME = "科研 AI 资源工作台";
export const SITE_TAGLINE =
  "科研提示词、Agent Skills、即插即用代码模块与科研网站导航";
export const SITE_DESC =
  "面向科研人员的 AI 资源发现与分发平台：按场景筛选可用的提示词、Skills、代码模块与科研网站，复制或下载后在你自己的 Agent / IDE 里使用。";

/** 部署地址：由环境变量注入（部署脚本会自动设置），本地开发回落到 localhost */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
).replace(/\/$/, "");

export const NAV = [
  { href: "/prompts", label: "提示词", desc: "参数化模板，填空即用" },
  { href: "/skills", label: "Skills", desc: "Agent 技能包" },
  { href: "/modules", label: "模块", desc: "可直接复用的代码" },
  { href: "/directory", label: "科研导航", desc: "数据集、工具与站点" },
] as const;
