// First-party event ingestion. No third-party trackers, no cookies, no raw IPs.
// Events: page_view, copy, search (from the browser beacon) and login, register (server-side).
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client";
import * as s from "../db/schema";
import { visitorHash } from "./visitor";

export type EventType = "page_view" | "copy" | "search" | "login" | "register";

/** Browser beacon payload (short keys keep it small). */
export const beaconSchema = z.object({
  t: z.enum(["pv", "copy", "search"]),
  p: z.string().max(500),
  r: z.string().max(1000).optional(),
  q: z.string().max(200).optional(),
});
export type Beacon = z.infer<typeof beaconSchema>;

const BOT_RE = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora link preview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python-requests|go-http-client|okhttp|axios|node-fetch|scrapy|httpclient|java\//i;

export function isBot(userAgent: string | null | undefined): boolean {
  return !userAgent || userAgent.length < 10 || BOT_RE.test(userAgent);
}

/** Respect the visitor's "do not track me" signals. */
export function optedOut(headers: { get(name: string): string | null }): boolean {
  return headers.get("sec-gpc") === "1" || headers.get("dnt") === "1";
}

/** Only the pathname, normalised, without query or fragment; null for things we do not count. */
export function cleanPath(raw: string): string | null {
  let p: string;
  try {
    p = new URL(raw, "http://x").pathname;
  } catch {
    return null;
  }
  if (!p.startsWith("/") || p.startsWith("/_next/") || p.startsWith("/api/") || p.startsWith("/media/")) return null;
  try {
    p = decodeURIComponent(p);
  } catch {
    /* keep encoded */
  }
  if (!p.endsWith("/")) p += "/";
  return p.slice(0, 300);
}

/** External referrer host, or null for same-site / missing / malformed referrers. */
export function referrerHost(referrer: string | undefined, ownHost: string | null): string | null {
  if (!referrer) return null;
  try {
    const u = new URL(referrer);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const own = ownHost?.toLowerCase().replace(/:\d+$/, "").replace(/^www\./, "");
    return host && host !== own ? host.slice(0, 253) : null;
  } catch {
    return null;
  }
}

export function cleanQuery(q: string | undefined): string | null {
  const v = (q ?? "").replace(/\s+/g, " ").trim();
  return [...v].length >= 2 ? [...v].slice(0, 100).join("") : null;
}

export const DETAIL_RE = /^\/(prompts|skills|modules|directory)\/([^/]+)\/$/;

export interface EventRecord {
  type: EventType;
  path: string;
  ip: string;
  userAgent: string;
  userId?: number | null;
  resourceId?: number | null;
  referrerHost?: string | null;
  searchQuery?: string | null;
  locked?: boolean;
  now?: Date;
}

export async function recordEvent(db: Db, e: EventRecord) {
  const now = e.now ?? new Date();
  await db.insert(s.events).values({
    type: e.type,
    occurredAt: now,
    userId: e.userId ?? null,
    visitorHash: await visitorHash(db, e.ip, e.userAgent, now),
    resourceId: e.resourceId ?? null,
    path: e.path.slice(0, 300),
    referrerHost: e.referrerHost ?? null,
    searchQuery: e.searchQuery ?? null,
    locked: e.locked ?? false,
  });
  // occasional retention: raw events are kept 13 months
  if (Math.random() < 0.001) {
    await db.execute(sql`DELETE FROM events WHERE occurred_at < now() - interval '13 months'`);
  }
}

// ── per-process rate limit for the public beacon (cheap; no database write per check) ──

declare global {
  var __rhBeaconBuckets: Map<string, { count: number; reset: number }> | undefined;
}

/** At most `limit` beacon events per minute per key (the hashed visitor). */
export function beaconAllowed(key: string, limit = 120, now = Date.now()): boolean {
  const buckets = (globalThis.__rhBeaconBuckets ??= new Map());
  const b = buckets.get(key);
  if (!b || b.reset <= now) {
    if (buckets.size > 50_000) buckets.clear();
    buckets.set(key, { count: 1, reset: now + 60_000 });
    return true;
  }
  b.count++;
  return b.count <= limit;
}
