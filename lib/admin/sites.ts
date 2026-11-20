// Admin operations on research-navigation sites (type SITE): adapter for lib/admin/resources.ts.
// A site's icon reuses the structure-diagram slot (resources.structure_media_id): see setDiagram.
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client";
import * as s from "../db/schema";
import { baseMetaSchema, siteFieldsSchema, slugSchema } from "../content/validation";
import * as R from "./resources";

export const siteInputSchema = baseMetaSchema.extend({
  slug: slugSchema,
  body: z.string().max(20_000, "正文不能超过 20000 个字符"),
  ...siteFieldsSchema.shape,
});
export type SiteInput = z.infer<typeof siteInputSchema>;

export const siteAdapter: R.Adapter<SiteInput> = {
  type: "SITE",
  label: "导航站点",
  schema: siteInputSchema,
  defaults: () => ({ url: "https://example.org", pricing: "免费" as const }),
  publishProblems(input): Record<string, string> {
    return /example\.org/.test(input.url) ? { url: "请填写站点的真实网址" } : {};
  },
  async readDetails(db, id) {
    const [row] = await db.select().from(s.resourceSite).where(eq(s.resourceSite.resourceId, id));
    return {
      url: row?.url ?? "",
      pricing: (row?.pricing ?? "免费") as SiteInput["pricing"],
      region: row?.region ?? undefined,
      loginRequired: row?.loginRequired ?? undefined,
    };
  },
  async writeDetails(db, id, input) {
    await db.delete(s.resourceSite).where(eq(s.resourceSite.resourceId, id));
    await db.insert(s.resourceSite).values({ resourceId: id, url: input.url, pricing: input.pricing, region: input.region ?? null, loginRequired: input.loginRequired ?? null });
  },
};

export const getSiteForEdit = (db: Db, id: number) => R.getForEdit(db, siteAdapter, id);
