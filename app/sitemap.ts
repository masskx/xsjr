import type { MetadataRoute } from "next";
import { getAllResources } from "@/lib/repo";
import { SITE_URL } from "@/lib/site";
import { TYPE_HREF } from "@/lib/types";

// Rendered per request from the database; drafts never appear because the repo only
// returns PUBLISHED rows.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const statics = [
    "",
    "/prompts/",
    "/skills/",
    "/modules/",
    "/drawing/",
    "/directory/",
    "/search/",
    "/about/",
    "/changelog/",
  ].map((p) => ({
    url: `${SITE_URL}${p}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: p === "" ? 1 : 0.8,
  }));

  const resources = (await getAllResources()).map((r) => ({
    url: `${SITE_URL}${TYPE_HREF[r.type]}/${r.slug}/`,
    lastModified: new Date(r.updatedAt),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  return [...statics, ...resources];
}
