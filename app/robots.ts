import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// SITE_URL is read at runtime so the domain can change without a rebuild.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
