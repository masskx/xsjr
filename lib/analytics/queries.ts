// Dashboard queries. Days are Asia/Shanghai calendar days. Every query filters on
// events(type, occurred_at) first, which the events_type_time_idx index serves.
//
// Unique visitors: exact within one day ("访客"). Over 7 and 30 days the daily-salted hash cannot
// link a person across days (by design, see visitor.ts), so the dashboard shows "visitor-days"
// (the sum of daily uniques) and the daily average, labelled as such.
import { sql } from "drizzle-orm";
import type { Db } from "../db/client";

const DAY = sql.raw(`(occurred_at AT TIME ZONE 'Asia/Shanghai')::date`);

/** Start of the Shanghai day `daysAgo` days before `now`, as a timestamptz SQL fragment. */
const dayStart = (now: Date, daysAgo: number) =>
  sql`((date_trunc('day', ${now.toISOString()}::timestamptz AT TIME ZONE 'Asia/Shanghai') - ${`${daysAgo} days`}::interval) AT TIME ZONE 'Asia/Shanghai')`;

const rows = <T>(r: { rows: unknown[] }) => r.rows as T[];
const n = (v: unknown) => Number(v ?? 0);

export interface TrafficWindow {
  pageViews: number;
  /** today: distinct visitors; 7/30 days: visitor-days */
  visitors: number;
  /** visitors per day on average over the window */
  avgDailyVisitors: number;
}

/** Today / 7 days / 30 days, derived from the per-day trend (one indexed query, no global
 *  DISTINCT sort): today's uniques are the last day's; visitor-days are the sum of daily uniques. */
export function summarise(trend: DayPoint[]): { today: TrafficWindow; d7: TrafficWindow; d30: TrafficWindow } {
  const window = (days: number): TrafficWindow => {
    const slice = trend.slice(-days);
    const pageViews = slice.reduce((a, d) => a + d.pageViews, 0);
    const visitors = slice.reduce((a, d) => a + d.visitors, 0);
    return { pageViews, visitors, avgDailyVisitors: Math.round((visitors / days) * 10) / 10 };
  };
  return { today: window(1), d7: window(7), d30: window(30) };
}

export async function trafficSummary(db: Db, now = new Date()) {
  return summarise(await dailyTrend(db, 30, now));
}

export interface DayPoint {
  day: string;
  pageViews: number;
  visitors: number;
}

/** Last `days` Shanghai days including today, zero-filled. */
export async function dailyTrend(db: Db, days = 30, now = new Date()): Promise<DayPoint[]> {
  const r = rows<{ day: string; pv: string; uv: string }>(
    await db.execute(sql`
      WITH d AS (
        SELECT generate_series(
          (${now.toISOString()}::timestamptz AT TIME ZONE 'Asia/Shanghai')::date - ${days - 1}::int,
          (${now.toISOString()}::timestamptz AT TIME ZONE 'Asia/Shanghai')::date,
          interval '1 day')::date AS day
      ), e AS (
        SELECT ${DAY} AS day, count(*) AS pv, count(DISTINCT visitor_hash) AS uv
        FROM events
        WHERE type = 'page_view' AND occurred_at >= ${dayStart(now, days - 1)} AND occurred_at <= ${now.toISOString()}::timestamptz
        GROUP BY 1
      )
      SELECT to_char(d.day, 'YYYY-MM-DD') AS day, coalesce(e.pv, 0) AS pv, coalesce(e.uv, 0) AS uv
      FROM d LEFT JOIN e USING (day) ORDER BY d.day`),
  );
  return r.map((x) => ({ day: x.day, pageViews: n(x.pv), visitors: n(x.uv) }));
}

export interface ResourceCount {
  slug: string;
  title: string;
  type: string;
  count: number;
}

async function topResources(db: Db, where: ReturnType<typeof sql>, days: number, limit: number, now: Date): Promise<ResourceCount[]> {
  return rows<{ slug: string; title: string; type: string; c: string }>(
    await db.execute(sql`
      SELECT r.slug, r.title, r.type, count(*) AS c
      FROM events e JOIN resources r ON r.id = e.resource_id
      WHERE ${where} AND e.occurred_at >= ${dayStart(now, days - 1)} AND e.resource_id IS NOT NULL
      GROUP BY r.slug, r.title, r.type
      ORDER BY c DESC, r.slug
      LIMIT ${limit}`),
  ).map((x) => ({ slug: x.slug, title: x.title, type: x.type, count: n(x.c) }));
}

export const topCopied = (db: Db, days = 30, limit = 10, now = new Date()) => topResources(db, sql`e.type = 'copy'`, days, limit, now);
export const topViewed = (db: Db, days = 30, limit = 10, now = new Date()) => topResources(db, sql`e.type = 'page_view'`, days, limit, now);
/** Members-only resources most often viewed by someone without the tier: the conversion signal. */
export const topLocked = (db: Db, days = 30, limit = 10, now = new Date()) => topResources(db, sql`e.type = 'page_view' AND e.locked`, days, limit, now);

export async function topSearches(db: Db, days = 30, limit = 15, now = new Date()): Promise<{ query: string; count: number }[]> {
  return rows<{ q: string; c: string }>(
    await db.execute(sql`
      SELECT lower(search_query) AS q, count(*) AS c
      FROM events
      WHERE type = 'search' AND occurred_at >= ${dayStart(now, days - 1)} AND search_query IS NOT NULL
      GROUP BY 1 ORDER BY c DESC, q LIMIT ${limit}`),
  ).map((x) => ({ query: x.q, count: n(x.c) }));
}

export async function topReferrers(db: Db, days = 30, limit = 10, now = new Date()): Promise<{ host: string; count: number }[]> {
  return rows<{ host: string; c: string }>(
    await db.execute(sql`
      SELECT referrer_host AS host, count(*) AS c
      FROM events
      WHERE type = 'page_view' AND occurred_at >= ${dayStart(now, days - 1)} AND referrer_host IS NOT NULL
      GROUP BY 1 ORDER BY c DESC, host LIMIT ${limit}`),
  ).map((x) => ({ host: x.host, count: n(x.c) }));
}

export async function accountStats(db: Db, now = new Date()): Promise<{ registrations7: number; registrations30: number; logins7: number; totalUsers: number }> {
  const [r] = rows<Record<string, string>>(
    await db.execute(sql`
      SELECT
        (SELECT count(*) FROM events WHERE type = 'register' AND occurred_at >= ${dayStart(now, 6)})  AS reg7,
        (SELECT count(*) FROM events WHERE type = 'register' AND occurred_at >= ${dayStart(now, 29)}) AS reg30,
        (SELECT count(DISTINCT user_id) FROM events WHERE type = 'login' AND occurred_at >= ${dayStart(now, 6)}) AS login7,
        (SELECT count(*) FROM users) AS users`),
  );
  return { registrations7: n(r.reg7), registrations30: n(r.reg30), logins7: n(r.login7), totalUsers: n(r.users) };
}
