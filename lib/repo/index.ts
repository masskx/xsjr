// The ONLY data-access layer for pages and components (replaces Phase 1 lib/content.ts).
// Same function names as before; they are async now because the data lives in PostgreSQL.
//
// Caching: published resources are small (metadata + bodies, no attachment content), so the
// whole published set is held as one in-memory snapshot per server process. It is rebuilt when
// - PostgreSQL delivers NOTIFY content_changed (importer, admin actions), or
// - the snapshot is older than SNAPSHOT_MAX_AGE_MS (safety net if a notification is missed).
// Unpublishing therefore disappears from lists, search, sitemap and detail pages on the next
// request after the notification.
import "server-only";
import { connection } from "next/server";
import { getDb } from "../db/client";
import { canAccess, effectiveTier, isExpired, viewerRank } from "../auth/entitlement";
import { authConfig, getViewer } from "../auth/server";
import type { Resource, ResourceType } from "../types";
import { ensureContentListener } from "./listen";
import { categoriesOf, loadAttachment, loadSnapshot, relatedOf, tagsOf, type Snapshot } from "./store";

const SNAPSHOT_MAX_AGE_MS = Number(process.env.SNAPSHOT_MAX_AGE_MS ?? 5 * 60_000);

interface RepoState {
  snapshot?: Promise<Snapshot>;
  attachments: Map<string, string | null>;
}

declare global {
  var __rhRepo: RepoState | undefined;
}
const state: RepoState = (globalThis.__rhRepo ??= { attachments: new Map() });

export function invalidate() {
  state.snapshot = undefined;
  state.attachments.clear();
}

async function snapshot(): Promise<Snapshot> {
  // Request-time only: the build must never touch the database.
  await connection();
  ensureContentListener("pages", invalidate);
  if (state.snapshot) {
    const snap = await state.snapshot.catch(() => undefined);
    if (snap && Date.now() - snap.loadedAt < SNAPSHOT_MAX_AGE_MS) return snap;
    invalidate();
  }
  state.snapshot ??= loadSnapshot(getDb());
  try {
    return await state.snapshot;
  } catch (err) {
    state.snapshot = undefined;
    throw err;
  }
}

export async function getAllResources(): Promise<Resource[]> {
  return (await snapshot()).all;
}

export async function getResourcesByType(type: ResourceType): Promise<Resource[]> {
  return (await getAllResources()).filter((r) => r.type === type);
}

export async function getResource(slug: string): Promise<Resource | undefined> {
  return (await snapshot()).bySlug.get(slug);
}

/** body.md content; "" when absent */
export async function getBody(resource: Resource): Promise<string> {
  return (await snapshot()).bodies.get(resource.slug) ?? "";
}

export interface Access {
  allowed: boolean;
  /** required tier code and label, e.g. "EI" / "EI 会员" */
  required: string;
  requiredLabel: string;
  signedIn: boolean;
  /** the viewer's effective tier (FREE when anonymous or expired) */
  viewerTier: string;
  viewerTierLabel: string;
  /** the viewer held a paid tier that has expired */
  expired: boolean;
  /** accounts are switched on (otherwise nobody can sign in to unlock) */
  accountsAvailable: boolean;
}

/** May the current viewer open this resource's members-only parts? */
export async function getAccess(resource: Resource): Promise<Access> {
  const snap = await snapshot();
  const viewer = resource.tier === "FREE" ? null : await getViewer();
  const user = viewer?.user ?? null;
  const tier = effectiveTier(user);
  return {
    allowed: canAccess(user, resource.tier, snap.tierRanks),
    required: resource.tier,
    requiredLabel: snap.tierLabels.get(resource.tier) ?? resource.tier,
    signedIn: !!viewer,
    viewerTier: tier,
    viewerTierLabel: snap.tierLabels.get(tier) ?? tier,
    expired: isExpired(user),
    accountsAvailable: authConfig().available,
  };
}

/**
 * A single attachment (module code, SKILL.md, template.md). Members-only attachments are
 * returned only to an entitled viewer: the rank check runs here AND in the SQL query
 * (loadAttachment), so no page can leak gated code by forgetting to ask.
 */
export async function getAttachment(resource: Resource, relativePath: string): Promise<string | null> {
  const snap = await snapshot();
  const current = snap.bySlug.get(resource.slug);
  if (!current) return null;
  let maxRank = snap.tierRanks.get("FREE") ?? 0;
  if (current.tier !== "FREE") {
    const viewer = await getViewer();
    if (!canAccess(viewer?.user ?? null, current.tier, snap.tierRanks)) return null;
    maxRank = viewerRank(viewer?.user ?? null, snap.tierRanks);
  }
  const key = `${resource.slug}\u0000${relativePath}`;
  if (state.attachments.has(key)) return state.attachments.get(key)!;
  const content = await loadAttachment(getDb(), resource.slug, relativePath, maxRank);
  // gated content is never cached: a cache hit must not bypass the database rank filter
  if (current.tier === "FREE") state.attachments.set(key, content);
  return content;
}

export async function getCategories(): Promise<{ name: string; count: number }[]> {
  return categoriesOf(await getAllResources());
}

export async function getTags(limit = 40): Promise<{ name: string; count: number }[]> {
  return tagsOf(await getAllResources(), limit);
}

export async function getRelated(resource: Resource, limit = 3): Promise<Resource[]> {
  return relatedOf(await getAllResources(), resource, limit);
}
