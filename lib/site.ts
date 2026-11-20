export const SITE_NAME = "科研 AI 资源工作台";
export const SITE_TAGLINE =
  "科研提示词、Agent Skills、即插即用代码模块与科研网站导航";
export const SITE_DESC =
  "面向科研人员的 AI 资源发现与分发平台：按场景筛选可用的提示词、Skills、代码模块与科研网站，复制或下载后在你自己的 Agent / IDE 里使用。";

/**
 * 部署地址（canonical、sitemap、metadataBase 用）。
 * SITE_URL is server-only runtime configuration (infra/.env), so switching from the IP to the
 * filed domain needs no rebuild. NEXT_PUBLIC_SITE_URL is the Phase 1 build-time fallback.
 */
export const SITE_URL = (
  process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
).replace(/\/$/, "");

export const NAV = [
  { href: "/prompts", label: "提示词", desc: "参数化模板，填空即用" },
  { href: "/skills", label: "Skills", desc: "Agent 技能包" },
  { href: "/modules", label: "模块", desc: "可直接复用的代码" },
  { href: "/directory", label: "科研导航", desc: "数据集、工具与站点" },
] as const;

/**
 * The legal operator shown in the privacy policy and terms (PIPL requires naming who processes
 * personal data and how to reach them). Runtime configuration in /opt/research-hub/.env; the
 * placeholders are deliberately visible so an unconfigured site is obvious.
 */
export const OPERATOR = {
  name: process.env.OPERATOR_NAME || "（运营者名称待填写）",
  contact: process.env.CONTACT_EMAIL || "（联系邮箱待填写）",
} as const;

/** Filing numbers shown in the footer once granted (runtime config; empty = hidden). */
export function filingNumbers() {
  return { icp: process.env.ICP_RECORD?.trim() || "", psb: process.env.PSB_RECORD?.trim() || "" };
}
