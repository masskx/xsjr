// Cookie-less visitor identity for unique-visitor counts.
//
//   visitor_hash = SHA-256(daily_salt || ip || user-agent)
//
// The salt is random, generated per calendar day (Asia/Shanghai) and DELETED after two days, so
// stored hashes can neither be reversed nor linked across days. Consequences, stated on the
// dashboard: unique visitors are exact for a single day; 7- and 30-day figures are
// "visitor-days" (the sum of daily uniques), not de-duplicated people.
import { createHash, randomBytes } from "node:crypto";
import { lt, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import * as s from "../db/schema";

export function shanghaiDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(now);
}

declare global {
  var __rhSalt: { day: string; salt: Buffer } | undefined;
}

export async function dailySalt(db: Db, now = new Date()): Promise<Buffer> {
  const day = shanghaiDay(now);
  if (globalThis.__rhSalt?.day === day) return globalThis.__rhSalt.salt;
  // first writer wins; concurrent processes read the same row
  await db.insert(s.dailySalts).values({ day, salt: randomBytes(32) }).onConflictDoNothing();
  const [row] = await db.select().from(s.dailySalts).where(sql`${s.dailySalts.day} = ${day}`);
  // drop salts older than yesterday: from then on those days' hashes are unlinkable
  await db.delete(s.dailySalts).where(lt(s.dailySalts.day, shanghaiDay(new Date(now.getTime() - 2 * 86_400_000))));
  globalThis.__rhSalt = { day, salt: row.salt };
  return row.salt;
}

export async function visitorHash(db: Db, ip: string, userAgent: string, now = new Date()): Promise<Buffer> {
  const salt = await dailySalt(db, now);
  return createHash("sha256").update(salt).update("\0").update(ip).update("\0").update(userAgent.slice(0, 300)).digest();
}
