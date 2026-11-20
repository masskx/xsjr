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
import { headers } from "next/headers";
import { clientIp } from "../auth/server";
import { countOnce, countsOf } from "../stats/counters";
import { moduleZip, skillZip } from "../stats/zip";
import { SITE_URL } from "../site";
import { activeAnnouncement } from "../announcements";
import { renderMarkdown } from "../markdown";
import type { ModuleResource } from "../types";
import { categoriesOf, loadAttachment, loadAttachments, loadSnapshot, relatedOf, tagsOf, type Diagram, type FileMeta, type Snapshot } from "./store";
export type { Diagram, FileMeta };

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

/** File names, languages and sizes (public: used for the file-tree diagram). Never contents. */
export async function getFileIndex(resource: Resource): Promise<FileMeta[]> {
  return (await snapshot()).files.get(resource.slug) ?? [];
}

export async function getDiagram(resource: Resource): Promise<Diagram | null> {
  return (await snapshot()).diagrams.get(resource.slug) ?? null;
}

/**
 * All files of a module with their contents, for the code tabs. Same two-layer gate as
 * getAttachment: the viewer is checked here and the SQL filters by tier rank.
 * Returns null when the viewer may not see the code.
 */
export async function getModuleFiles(resource: Resource): Promise<{ path: string; language: string; content: string }[] | null> {
  const snap = await snapshot();
  const current = snap.bySlug.get(resource.slug);
  if (!current) return null;
  let maxRank = snap.tierRanks.get("FREE") ?? 0;
  if (current.tier !== "FREE") {
    const viewer = await getViewer();
    if (!canAccess(viewer?.user ?? null, current.tier, snap.tierRanks)) return null;
    maxRank = viewerRank(viewer?.user ?? null, snap.tierRanks);
  }
  const rows = await loadAttachments(getDb(), resource.slug, maxRank);
  return rows.length ? rows : null;
}

const PREFIX_TYPE: Record<string, ResourceType> = { prompts: "PROMPT", skills: "SKILL", modules: "MODULE", directory: "SITE" };

/** The published resource a detail-page path refers to (analytics), or null. */
export async function resourceForPath(path: string): Promise<{ id: number; slug: string; tier: string; resource: Resource } | null> {
  const m = /^\/(prompts|skills|modules|directory)\/([^/]+)\/$/.exec(path);
  if (!m) return null;
  const snap = await snapshot();
  const r = snap.bySlug.get(m[2]);
  if (!r || r.type !== PREFIX_TYPE[m[1]]) return null;
  return { id: snap.ids.get(r.slug)!, slug: r.slug, tier: r.tier, resource: r };
}

// ── counters and downloads (task: ZIP downloads + resource statistics) ──

async function visitor() {
  const h = await headers();
  return { ip: await clientIp(), userAgent: h.get("user-agent") ?? "", headers: h };
}

/** Count a detail-page view (once per visitor per resource per day) and return the counts. */
export async function recordViewAndGetStats(resource: Resource): Promise<{ views: number; downloads: number }> {
  const snap = await snapshot();
  const id = snap.ids.get(resource.slug);
  if (!id) return { views: 0, downloads: 0 };
  try {
    await countOnce(getDb(), id, "view", await visitor());
  } catch (err) {
    // a counter must never break the page
    console.error("[stats] view count failed", err);
  }
  return countsOf(getDb(), id);
}

/** Whether a resource offers a ZIP at all (independent of the viewer's tier). */
export function downloadable(resource: Resource): boolean {
  return (resource.type === "SKILL" && resource.redistribution) || resource.type === "MODULE";
}

export type DownloadResult =
  | { ok: true; filename: string; bytes: Uint8Array }
  | { ok: false; status: 403 | 404; reason: string };

/** Build the ZIP for a resource the current viewer may download, counting the download first. */
export async function downloadResource(type: string, slug: string): Promise<DownloadResult> {
  const snap = await snapshot();
  const r = snap.bySlug.get(slug);
  const want = type === "skills" ? "SKILL" : type === "modules" ? "MODULE" : null;
  if (!r || !want || r.type !== want || !downloadable(r)) return { ok: false, status: 404, reason: "没有可下载的文件" };
  let pkg: { filename: string; bytes: Uint8Array };
  if (r.type === "SKILL") {
    const md = await getAttachment(r, "SKILL.md");
    if (!md) return { ok: false, status: 404, reason: "没有可下载的文件" };
    pkg = skillZip(r, md, SITE_URL);
  } else {
    const files = await getModuleFiles(r);
    if (!files) return { ok: false, status: r.tier === "FREE" ? 404 : 403, reason: r.tier === "FREE" ? "没有可下载的文件" : "这是会员模块，需要相应会员等级才能下载" };
    pkg = moduleZip(r as ModuleResource, files, SITE_URL);
  }
  const id = snap.ids.get(slug)!;
  try {
    await countOnce(getDb(), id, "download", await visitor());
  } catch (err) {
    console.error("[stats] download count failed", err);
  }
  return { ok: true, ...pkg };
}

/** Next resource of the same type in display order (wraps around), for "下一篇". */
export async function getNext(resource: Resource): Promise<Resource | null> {
  const list = (await snapshot()).all.filter((r) => r.type === resource.type);
  if (list.length < 2) return null;
  const i = list.findIndex((r) => r.slug === resource.slug);
  return list[(i + 1) % list.length] ?? null;
}

// ── announcement (shown once a day; cached for a minute per process) ──
let annCache: { at: number; value: { id: number; version: string; title: string; html: string } | null } | null = null;

export async function getAnnouncement() {
  await connection();
  if (annCache && Date.now() - annCache.at < 60_000) return annCache.value;
  try {
    const row = await activeAnnouncement(getDb());
    const value = row ? { id: row.id, version: String(row.updatedAt.getTime()), title: row.title, html: renderMarkdown(row.bodyMd) } : null;
    annCache = { at: Date.now(), value };
    return value;
  } catch (err) {
    console.error("[announcement] load failed", err);
    return null;
  }
}

export function invalidateAnnouncement() {
  annCache = null;
}
