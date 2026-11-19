// Fixed-window rate limiting in PostgreSQL (rate_limits table). One upsert per check; correct
// across processes and restarts. Keys never contain raw IPs or emails (see keyedHash).
import { sql } from "drizzle-orm";
import type { Db } from "../db/client";

export interface RateResult {
  allowed: boolean;
  count: number;
  /** seconds until the window resets */
  retryAfter: number;
}

export async function hit(db: Db, key: string, limit: number, windowSec: number, now = new Date()): Promise<RateResult> {
  const windowMs = windowSec * 1000;
  const start = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const res = await db.execute<{ count: number }>(sql`
    INSERT INTO rate_limits (key, window_start, count) VALUES (${key}, ${start.toISOString()}, 1)
    ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
    RETURNING count`);
  const count = Number(res.rows[0].count);
  // occasional cleanup of old windows keeps the table tiny
  if (Math.random() < 0.01) {
    await db.execute(sql`DELETE FROM rate_limits WHERE window_start < now() - interval '2 days'`);
  }
  return {
    allowed: count <= limit,
    count,
    retryAfter: Math.ceil((start.getTime() + windowMs - now.getTime()) / 1000),
  };
}

/** Read-only peek (no increment). */
export async function peek(db: Db, key: string, windowSec: number, now = new Date()): Promise<number> {
  const windowMs = windowSec * 1000;
  const start = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const res = await db.execute<{ count: number }>(
    sql`SELECT count FROM rate_limits WHERE key = ${key} AND window_start = ${start.toISOString()}`,
  );
  return res.rows.length ? Number(res.rows[0].count) : 0;
}

export const LIMITS = {
  loginPerIp: { limit: 20, windowSec: 15 * 60 },
  registerPerIp: { limit: 5, windowSec: 3600 },
  resetPerIp: { limit: 5, windowSec: 3600 },
  resetPerAccount: { limit: 3, windowSec: 3600 },
  verifyResendPerUser: { limit: 3, windowSec: 3600 },
  mfaPerUser: { limit: 5, windowSec: 15 * 60 },
} as const;
