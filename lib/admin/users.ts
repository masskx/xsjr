// Admin lookups on user accounts (slice 3: find a user, issue verification / reset links while
// there is no mail provider). Tier management arrives in slice 4.
import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import * as s from "../db/schema";
import { normaliseEmail } from "../auth/service";

export interface UserSummary {
  id: number;
  email: string;
  displayName: string | null;
  role: "USER" | "ADMIN";
  tier: string;
  tierExpiresAt: Date | null;
  emailVerifiedAt: Date | null;
  totpEnabledAt: Date | null;
  createdAt: Date;
  lastLoginAt: Date | null;
  lockedUntil: Date | null;
  disabledAt: Date | null;
  activeSessions: number;
}

export async function findUserByEmail(db: Db, rawEmail: string): Promise<UserSummary | null> {
  const email = normaliseEmail(rawEmail);
  if (!email) return null;
  const [u] = await db
    .select({
      id: s.users.id,
      email: s.users.email,
      displayName: s.users.displayName,
      role: s.users.role,
      tier: s.users.tier,
      tierExpiresAt: s.users.tierExpiresAt,
      emailVerifiedAt: s.users.emailVerifiedAt,
      totpEnabledAt: s.users.totpEnabledAt,
      createdAt: s.users.createdAt,
      lastLoginAt: s.users.lastLoginAt,
      lockedUntil: s.users.lockedUntil,
      disabledAt: s.users.disabledAt,
      activeSessions: sql<number>`(SELECT count(*)::int FROM sessions WHERE user_id = ${s.users.id} AND revoked_at IS NULL AND expires_at > now())`,
    })
    .from(s.users)
    .where(eq(s.users.email, email));
  return u ?? null;
}

export async function heldMailCount(db: Db): Promise<number> {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.mailOutbox).where(eq(s.mailOutbox.status, "held"));
  return n;
}

export async function recentAudit(db: Db, limit = 20) {
  return db
    .select({
      id: s.adminAuditLog.id,
      action: s.adminAuditLog.action,
      targetType: s.adminAuditLog.targetType,
      targetId: s.adminAuditLog.targetId,
      createdAt: s.adminAuditLog.createdAt,
      actor: s.users.email,
      slug: s.resources.slug,
      resourceType: s.resources.type,
    })
    .from(s.adminAuditLog)
    .innerJoin(s.users, eq(s.users.id, s.adminAuditLog.actorId))
    .leftJoin(s.resources, and(eq(s.adminAuditLog.targetType, "resource"), eq(s.resources.id, s.adminAuditLog.targetId)))
    .orderBy(desc(s.adminAuditLog.id))
    .limit(limit);
}

export async function auditUserAction(db: Db, actorId: number, action: string, userId: number) {
  await db.insert(s.adminAuditLog).values({ actorId, action, targetType: "user", targetId: userId });
}
