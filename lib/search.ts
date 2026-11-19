import "server-only";
import { pinyin } from "pinyin-pro";
import type { Resource, ResourceType } from "./types";
import { TYPE_HREF } from "./types";

export interface SearchDoc {
  slug: string;
  type: ResourceType;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  tier: "FREE" | "PRO";
  license: string;
  updatedAt: string;
  href: string;
  /** 全拼，支持 "tongjixianzhu" 这类输入 */
  pinyin: string;
  /** 首字母，支持 "tjxj" 这类输入 */
  initials: string;
}

const clean = (s: string) => s.toLowerCase().replace(/[\s\-_/·、，,.]/g, "");

export function buildSearchIndex(resources: Resource[]): SearchDoc[] {
  return resources.map((r) => {
    const focused = `${r.title} ${r.tags.join(" ")}`;
    return {
      slug: r.slug,
      type: r.type,
      title: r.title,
      summary: r.summary,
      category: r.category,
      tags: r.tags,
      tier: r.tier,
      license: r.license,
      updatedAt: r.updatedAt,
      href: `${TYPE_HREF[r.type]}/${r.slug}/`,
      pinyin: clean(
        pinyin(focused, { toneType: "none", type: "array" }).join(""),
      ),
      initials: clean(
        pinyin(focused, { toneType: "none", pattern: "first", type: "array" }).join(
          "",
        ),
      ),
    };
  });
}
