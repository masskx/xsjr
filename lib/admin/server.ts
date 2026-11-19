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
  statusCounts: async (type: "PROMPT" | "SKILL" | "MODULE" | "SITE") => {
    const rows = await getDb()
      .select({ status: s.resources.status, n: sql<number>`count(*)::int` })
      .from(s.resources)
      .where(and(eq(s.resources.type, type)))
      .groupBy(s.resources.status);
    return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<prompts.Status, number>>;
  },
};
