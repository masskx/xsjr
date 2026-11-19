// Server-side sessions. The browser holds a random 256-bit token in an HttpOnly cookie; the
// database holds only its SHA-256. Revocation is immediate (revoked_at), expiry is absolute.
import { and, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import * as s from "../db/schema";
import { ADMIN_SESSION_MS, USER_SESSION_MS } from "./config";
import { randomToken, sha256 } from "./crypto";

export type Role = "USER" | "ADMIN";

export interface SessionUser {
  id: number;
  email: string;
  displayName: string | null;
  role: Role;
  tier: string;
  tierExpiresAt: Date | null;
  emailVerifiedAt: Date | null;
  totpEnabledAt: Date | null;
  createdAt: Date;
}

export interface ActiveSession {
  id: number;
  userId: number;
  createdAt: Date;
  expiresAt: Date;
  mfaVerifiedAt: Date | null;
  reauthAt: Date | null;
  user: SessionUser;
}

export async function createSession(
  db: Db,
  user: { id: number; role: Role },
  opts: { userAgent?: string | null; now?: Date } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const now = opts.now ?? new Date();
  const token = randomToken();
  const expiresAt = new Date(now.getTime() + (user.role === "ADMIN" ? ADMIN_SESSION_MS : USER_SESSION_MS));
  await db.insert(s.sessions).values({
    userId: user.id,
    tokenHash: sha256(token),
    createdAt: now,
    lastSeenAt: now,
    expiresAt,
    userAgent: opts.userAgent ? opts.userAgent.slice(0, 300) : null,
  });
  return { token, expiresAt };
}

const LAST_SEEN_RESOLUTION_MS = 3600_000;

/** Resolve a cookie token to a live session. Returns null for unknown/expired/revoked tokens
 *  and for disabled users. Updates last_seen_at at most once per hour. */
export async function resolveSession(db: Db, token: string | undefined, now = new Date()): Promise<ActiveSession | null> {
  if (!token || token.length > 100) return null;
  const [row] = await db
    .select({
      id: s.sessions.id,
      userId: s.sessions.userId,
      createdAt: s.sessions.createdAt,
      lastSeenAt: s.sessions.lastSeenAt,
      expiresAt: s.sessions.expiresAt,
      mfaVerifiedAt: s.sessions.mfaVerifiedAt,
      reauthAt: s.sessions.reauthAt,
      user: {
        id: s.users.id,
        email: s.users.email,
        displayName: s.users.displayName,
        role: s.users.role,
        tier: s.users.tier,
        tierExpiresAt: s.users.tierExpiresAt,
        emailVerifiedAt: s.users.emailVerifiedAt,
        totpEnabledAt: s.users.totpEnabledAt,
        createdAt: s.users.createdAt,
        disabledAt: s.users.disabledAt,
      },
    })
    .from(s.sessions)
    .innerJoin(s.users, eq(s.users.id, s.sessions.userId))
    .where(and(eq(s.sessions.tokenHash, sha256(token)), isNull(s.sessions.revokedAt), gt(s.sessions.expiresAt, now)));
  if (!row || row.user.disabledAt) return null;

  if (now.getTime() - row.lastSeenAt.getTime() > LAST_SEEN_RESOLUTION_MS) {
    await db.update(s.sessions).set({ lastSeenAt: now }).where(eq(s.sessions.id, row.id));
  }
  const { disabledAt: _disabled, ...user } = row.user;
  void _disabled;
  return {
    id: row.id,
    userId: row.userId,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    mfaVerifiedAt: row.mfaVerifiedAt,
    reauthAt: row.reauthAt,
    user,
  };
}

export async function revokeSession(db: Db, sessionId: number, userId: number) {
  await db
    .update(s.sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(s.sessions.id, sessionId), eq(s.sessions.userId, userId), isNull(s.sessions.revokedAt)));
}

/** Revoke every live session of a user, optionally keeping one (the caller's). */
export async function revokeAllSessions(db: Db, userId: number, exceptSessionId?: number): Promise<number> {
  const rows = await db
    .update(s.sessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(s.sessions.userId, userId),
        isNull(s.sessions.revokedAt),
        exceptSessionId ? ne(s.sessions.id, exceptSessionId) : undefined,
      ),
    )
    .returning({ id: s.sessions.id });
  return rows.length;
}

export async function listSessions(db: Db, userId: number, now = new Date()) {
  return db
    .select({
      id: s.sessions.id,
      createdAt: s.sessions.createdAt,
      lastSeenAt: s.sessions.lastSeenAt,
      expiresAt: s.sessions.expiresAt,
      userAgent: s.sessions.userAgent,
    })
    .from(s.sessions)
    .where(and(eq(s.sessions.userId, userId), isNull(s.sessions.revokedAt), gt(s.sessions.expiresAt, now)))
    .orderBy(desc(s.sessions.lastSeenAt));
}

export async function markSession(db: Db, sessionId: number, field: "mfa" | "reauth", now = new Date()) {
  await db
    .update(s.sessions)
    .set(field === "mfa" ? { mfaVerifiedAt: now, reauthAt: now } : { reauthAt: now })
    .where(eq(s.sessions.id, sessionId));
}

/** Housekeeping: drop sessions that expired or were revoked more than 30 days ago. */
export async function pruneSessions(db: Db) {
  await db.execute(
    sql`DELETE FROM sessions WHERE expires_at < now() - interval '30 days' OR revoked_at < now() - interval '30 days'`,
  );
}
