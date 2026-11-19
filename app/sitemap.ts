import type { MetadataRoute } from "next";
import { getAllResources } from "@/lib/content";
import { SITE_URL } from "@/lib/site";
import { TYPE_HREF } from "@/lib/types";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const statics = [
    "",
    "/prompts/",
    "/skills/",
    "/modules/",
    "/directory/",
    "/search/",
    "/about/",
  ].map((p) => ({
    url: `${SITE_URL}${p}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: p === "" ? 1 : 0.8,
  }));

  const resources = getAllResources().map((r) => ({
    url: `${SITE_URL}${TYPE_HREF[r.type]}/${r.slug}/`,
    lastModified: new Date(r.updatedAt),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  return [...statics, ...resources];
}
