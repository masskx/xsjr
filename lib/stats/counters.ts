// Public view and download counters on resources. Each visitor counts at most once per resource
// per day per kind: the dedup key is (resource, Asia/Shanghai day, kind, visitor hash), where the
// visitor hash is the same daily-salted SHA-256 of IP + user agent the analytics use (the salt is
// deleted after two days, so the stored hashes cannot be linked to anyone). Dedup rows older
// than yesterday are pruned. Incrementing never touches updated_at (which is the editors'
// version token) and needs no cache invalidation: counts are read live.
import { and, eq, lt, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import * as s from "../db/schema";
import { shanghaiDay, visitorHash } from "../analytics/visitor";
import { isBot, optedOut } from "../analytics/ingest";

export type CounterKind = "view" | "download";

export interface Visitor {
  ip: string;
  userAgent: string;
  headers: { get(name: string): string | null };
}

// Downloads are often made from a terminal (the install commands use curl / PowerShell), so only
// crawlers are excluded for downloads; views exclude every non-browser client.
const CRAWLER_RE = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|headless|lighthouse|pingdom|uptime|monitor|scrapy/i;

/** Bots, monitors and visitors who send Do-Not-Track / GPC are never counted. */
export function countable(v: Visitor, kind: CounterKind = "view"): boolean {
  if (optedOut(v.headers)) return false;
  if (kind === "download") return !!v.userAgent && !CRAWLER_RE.test(v.userAgent);
  return !isBot(v.userAgent);
}

/** Count once per visitor per day. Returns true when this call incremented the counter. */
export async function countOnce(db: Db, resourceId: number, kind: CounterKind, v: Visitor, now = new Date()): Promise<boolean> {
  if (!countable(v, kind)) return false;
  const hash = await visitorHash(db, v.ip, v.userAgent, now);
  const day = shanghaiDay(now);
  const counted = await db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const inserted = await t
      .insert(s.resourceDailyVisitors)
      .values({ resourceId, day, kind, visitorHash: hash })
      .onConflictDoNothing()
      .returning({ day: s.resourceDailyVisitors.day });
    if (!inserted.length) return false;
    await t
      .update(s.resources)
      .set(kind === "view" ? { viewCount: sql`${s.resources.viewCount} + 1` } : { downloadCount: sql`${s.resources.downloadCount} + 1` })
      .where(eq(s.resources.id, resourceId));
    return true;
  });
  // cheap housekeeping: dedup rows are useless once the day is over
  if (counted && Math.random() < 0.02) {
    await db.delete(s.resourceDailyVisitors).where(lt(s.resourceDailyVisitors.day, shanghaiDay(new Date(now.getTime() - 86_400_000))));
  }
  return counted;
}

export async function countsOf(db: Db, resourceId: number): Promise<{ views: number; downloads: number }> {
  const [row] = await db
    .select({ views: s.resources.viewCount, downloads: s.resources.downloadCount })
    .from(s.resources)
    .where(and(eq(s.resources.id, resourceId)));
  return row ?? { views: 0, downloads: 0 };
}
