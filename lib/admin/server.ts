// Next.js glue for the admin area. Every admin page AND every admin action calls adminContext():
// proxy.ts already keeps non-admins out of /admin, but server actions are POST endpoints that
// must check for themselves.
import "server-only";
import { redirect } from "next/navigation";
import { getDb } from "../db/client";
import { REAUTH_WINDOW_MS } from "../auth/config";
import { requireAdmin } from "../auth/server";
import type { ActiveSession } from "../auth/sessions";
import type { AdminCtx } from "./prompts";
import { and, eq, sql } from "drizzle-orm";
import * as s from "../db/schema";
import * as prompts from "./prompts";
import * as users from "./users";
import * as members from "./members";
import * as resources from "./resources";
import * as modules from "./modules";
import * as skills from "./skills";
import * as sites from "./sites";
import * as analytics from "../analytics/queries";
import * as ingest from "../ingest/jobs";
import * as announcements from "../announcements";
import * as apiTokens from "./api-tokens";
import * as llm from "./llm";

export async function adminContext(): Promise<{ viewer: ActiveSession; ctx: AdminCtx }> {
  const viewer = await requireAdmin();
  return { viewer, ctx: { db: getDb(), actorId: viewer.userId } };
}

export function recentlyReauthenticated(viewer: ActiveSession, now = Date.now()): boolean {
  return !!viewer.reauthAt && now - viewer.reauthAt.getTime() < REAUTH_WINDOW_MS;
}

/** Destructive actions (archive, password-reset links) need a TOTP check within 10 minutes. */
export function requireRecentReauth(viewer: ActiveSession, returnTo: string) {
  if (!recentlyReauthenticated(viewer)) redirect(`/admin/reauth/?next=${encodeURIComponent(returnTo)}`);
}

// ── data for admin pages (pages never import lib/db directly) ──

export const adminData = {
  listPrompts: (filter: Parameters<typeof prompts.listPrompts>[1]) => prompts.listPrompts(getDb(), filter),
  categories: () => prompts.listCategories(getDb()),
  promptForEdit: (id: number) => prompts.getPromptForEdit(getDb(), id),
  userByEmail: (email: string) => users.findUserByEmail(getDb(), email),
  heldMails: () => users.heldMailCount(getDb()),
  audit: (limit?: number) => users.recentAudit(getDb(), limit),
  versionCount: async (id: number) => {
    const [{ n }] = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(s.resourceVersions)
      .where(eq(s.resourceVersions.resourceId, id));
    return n;
  },
  tiers: () => members.listTiers(getDb()),
  users: (filter: Parameters<typeof members.listUsers>[1]) => members.listUsers(getDb(), filter),
  user: (id: number) => members.getUser(getDb(), id),
  entitlementHistory: (id: number) => members.entitlementHistory(getDb(), id),
  memberStats: () => members.memberStats(getDb()),
  modulesForTier: () => members.listModulesForTier(getDb()),
  listResources: (type: resources.ResourceType, filter: Parameters<typeof resources.listResources>[2]) => resources.listResources(getDb(), type, filter),
  moduleForEdit: (id: number) => modules.getModuleForEdit(getDb(), id),
  skillForEdit: (id: number) => skills.getSkillForEdit(getDb(), id),
  siteForEdit: (id: number) => sites.getSiteForEdit(getDb(), id),
  diagramOf: (id: number) => modules.diagramOf(getDb(), id),
  ingestStatus: async () => ({ ...(await ingest.ingestStatus()), tokensToday: await ingest.tokensToday(getDb()) }),
  llmSettings: () => llm.readLlmSettings(getDb()),
  ingestJobs: () => ingest.listJobs(getDb()),
  ingestJob: (id: number) => ingest.getJob(getDb(), id),
  provenance: (id: number) => ingest.provenanceOf(getDb(), id),
  announcements: () => announcements.listAnnouncements(getDb()),
  apiTokens: (userId: number) => apiTokens.listApiTokens(getDb(), userId),
  analytics: async () => {
    const db = getDb();
    const [trend, copied, locked, viewed, searches, referrers, accounts, tiersDist, tierRows] = await Promise.all([
      analytics.dailyTrend(db, 30),
      analytics.topCopied(db),
      analytics.topLocked(db),
      analytics.topViewed(db),
      analytics.topSearches(db),
      analytics.topReferrers(db),
      analytics.accountStats(db),
      members.memberStats(db),
      members.listTiers(db),
    ]);
    return { trend, summary: analytics.summarise(trend), copied, locked, viewed, searches, referrers, accounts, tiersDist, tierRows };
  },
  statusCounts: async (type: "PROMPT" | "SKILL" | "MODULE" | "SITE") => {
    const rows = await getDb()
      .select({ status: s.resources.status, n: sql<number>`count(*)::int` })
      .from(s.resources)
      .where(and(eq(s.resources.type, type)))
      .groupBy(s.resources.status);
    return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<prompts.Status, number>>;
  },
};
