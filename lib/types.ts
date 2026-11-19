// 资源数据契约。与 content/<type>/<slug>/meta.json 一一对应。
// 后续迁 PostgreSQL 时，这些类型可直接映射为表结构，页面不感知数据来源。

export type ResourceType = "PROMPT" | "SKILL" | "MODULE" | "SITE";

export interface PromptVariable {
  key: string;
  label: string;
  type: "text" | "textarea" | "select" | "boolean";
  required?: boolean;
  default?: string;
  help?: string;
  options?: string[];
}

export interface CompatRow {
  tool: string;
  supportedRange: string;
  installPath?: string;
  note?: string;
}

export interface FileNode {
  path: string;
  size?: number;
  desc?: string;
}

interface Base {
  slug: string;
  type: ResourceType;
  title: string;
  /** 30–80 字，卡片上直接展示 */
  summary: string;
  /** 一级分类：学科或用途 */
  category: string;
  tags: string[];
  author: string;
  /** 上游来源（第三方必填） */
  sourceUrl?: string;
  /** SPDX 标识，或「平台原创」 */
  license: string;
  licenseNote?: string;
  /** 是否允许平台二次分发原文/附件；只索引时为 false */
  redistribution: boolean;
  /** required membership tier: a code from the `tiers` table (FREE, EI, SCI, ...).
   *  Phase 1 meta.json files may still say "PRO", which the importer maps to EI. */
  tier: string;
  updatedAt: string;
  verifiedAt?: string;
  featured?: boolean;
}

export interface PromptResource extends Base {
  type: "PROMPT";
  variables: PromptVariable[];
  /** 变量外的固定说明（适用条件、注意事项） */
  notes?: string[];
}

export interface SkillResource extends Base {
  type: "SKILL";
  compat: CompatRow[];
  files: FileNode[];
  risks?: string[];
  dependencies?: string[];
}

export interface ModuleResource extends Base {
  type: "MODULE";
  language: string;
  env: string[];
  /** 主文件相对路径，详情页默认展示它的代码 */
  entry: string;
  usage?: string[];
}

export interface SiteResource extends Base {
  type: "SITE";
  url: string;
  pricing: "免费" | "部分免费" | "付费" | "机构订阅";
  region?: string;
  /** 官网可达性核对；docs 要求公开页展示 */
  loginRequired?: boolean;
}

export type Resource =
  | PromptResource
  | SkillResource
  | ModuleResource
  | SiteResource;

export const TYPE_LABEL: Record<ResourceType, string> = {
  PROMPT: "提示词",
  SKILL: "Skill",
  MODULE: "模块",
  SITE: "网站",
};

export const TYPE_DIR: Record<ResourceType, string> = {
  PROMPT: "prompts",
  SKILL: "skills",
  MODULE: "modules",
  SITE: "sites",
};

export const DIR_TYPE: Record<string, ResourceType> = {
  prompts: "PROMPT",
  skills: "SKILL",
  modules: "MODULE",
  sites: "SITE",
};

/** 详情页路由前缀 */
export const TYPE_HREF: Record<ResourceType, string> = {
  PROMPT: "/prompts",
  SKILL: "/skills",
  MODULE: "/modules",
  SITE: "/directory",
};

export const TOOL_LABEL: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  "gemini-cli": "Gemini CLI",
  generic: "通用",
};
