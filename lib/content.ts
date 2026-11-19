import fs from "node:fs";
import path from "node:path";
import {
  DIR_TYPE,
  type Resource,
  type ResourceType,
  type SiteResource,
} from "./types";

const CONTENT_DIR = path.join(process.cwd(), "content");

/** 构建期缓存：静态导出时每个页面都会调用，避免重复读盘 */
const metaCache = new Map<string, Resource>();

function readAll(): Resource[] {
  if (metaCache.size > 0) return [...metaCache.values()];

  for (const dir of Object.keys(DIR_TYPE)) {
    const base = path.join(CONTENT_DIR, dir);
    if (!fs.existsSync(base)) continue;

    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const metaPath = path.join(base, entry.name, "meta.json");
      if (!fs.existsSync(metaPath)) continue;

      const raw = JSON.parse(fs.readFileSync(metaPath, "utf8")) as Record<
        string,
        unknown
      >;
      const resource = {
        ...raw,
        slug: entry.name,
        type: DIR_TYPE[dir],
      } as unknown as Resource;

      validate(resource, metaPath);
      metaCache.set(`${dir}/${entry.name}`, resource);
    }
  }

  return [...metaCache.values()];
}

function validate(r: Resource, where: string) {
  const need: (keyof Resource)[] = [
    "title",
    "summary",
    "category",
    "tags",
    "author",
    "license",
    "tier",
    "updatedAt",
  ];
  const missing = need.filter((k) => r[k] === undefined || r[k] === null);
  if (missing.length) {
    throw new Error(`[content] ${where} 缺少字段: ${missing.join(", ")}`);
  }
  if (r.summary.length < 20 || r.summary.length > 110) {
    throw new Error(
      `[content] ${where} summary 长度 ${r.summary.length}，要求 20–110 字`,
    );
  }
  if (r.type === "SITE" && !(r as SiteResource).url) {
    throw new Error(`[content] ${where} SITE 类型必须有 url`);
  }
}

export function getAllResources(): Resource[] {
  return readAll().sort((a, b) => {
    if (!!b.featured !== !!a.featured) return a.featured ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export function getResourcesByType(type: ResourceType): Resource[] {
  return getAllResources().filter((r) => r.type === type);
}

export function getResource(slug: string): Resource | undefined {
  return readAll().find((r) => r.slug === slug);
}

/** 读正文 Markdown；没有 body.md 返回空串 */
export function getBody(resource: Resource): string {
  const dir = Object.keys(DIR_TYPE).find((d) => DIR_TYPE[d] === resource.type)!;
  const p = path.join(CONTENT_DIR, dir, resource.slug, "body.md");
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}

/** 读附件目录里的单个文本文件（模块代码、SKILL.md 等） */
export function getAttachment(
  resource: Resource,
  relativePath: string,
): string | null {
  const dir = Object.keys(DIR_TYPE).find((d) => DIR_TYPE[d] === resource.type)!;
  const root = path.resolve(CONTENT_DIR, dir, resource.slug, "files");
  // 兼容 "stat_tests.py" 与 "files/stat_tests.py" 两种写法
  const rel = relativePath
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .replace(/^files\//, "");
  const target = path.resolve(root, rel);
  // 防目录逃逸：只允许 files/ 之下的文件
  if (!target.startsWith(root + path.sep)) return null;
  return fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null;
}

export function getCategories(): { name: string; count: number }[] {
  const map = new Map<string, number>();
  for (const r of getAllResources()) {
    map.set(r.category, (map.get(r.category) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

export function getTags(limit = 40): { name: string; count: number }[] {
  const map = new Map<string, number>();
  for (const r of getAllResources()) {
    for (const t of r.tags) map.set(t, (map.get(t) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"))
    .slice(0, limit);
}

/** 相关资源：同类同分类优先，其次共享标签数 */
export function getRelated(resource: Resource, limit = 3): Resource[] {
  return getAllResources()
    .filter((r) => r.slug !== resource.slug)
    .map((r) => {
      let score = 0;
      if (r.type === resource.type) score += 2;
      if (r.category === resource.category) score += 3;
      score += r.tags.filter((t) => resource.tags.includes(t)).length;
      return { r, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.r);
}
