// Membership administration (slice 4). Until payment exists, admins hand out tiers manually.
//
// users.tier / users.tier_expires_at hold the CURRENT membership (one active tier per user);
// entitlements is the ledger of every grant and revocation, written in the same transaction, so
// the history survives and payment (orders -> entitlements) can plug in later without a retrofit.
import { and, asc, count, desc, eq, ilike, isNull, ne, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import * as s from "../db/schema";
import { notifyContentChanged } from "../import/content-import";
import { effectiveTier } from "../auth/entitlement";
import type { AdminCtx } from "./prompts";

export type Fail = { ok: false; error: string };

async function audit(ctx: AdminCtx, action: string, targetType: "user" | "resource", targetId: number, diff?: unknown) {
  await ctx.db.insert(s.adminAuditLog).values({ actorId: ctx.actorId, action, targetType, targetId, diff: diff ?? null });
}

export async function listTiers(db: Db) {
  return db.select().from(s.tiers).orderBy(asc(s.tiers.rank));
}

// ── users ──

export interface UserListRow {
  id: number;
  email: string;
  displayName: string | null;
  role: "USER" | "ADMIN";
  tier: string;
  effectiveTier: string;
  tierExpiresAt: Date | null;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  lastLoginAt: Date | null;
}

export const PAGE_SIZE = 50;

export async function listUsers(
  db: Db,
  filter: { q?: string; tier?: string; page?: number } = {},
  now = new Date(),
): Promise<{ rows: UserListRow[]; total: number; page: number; pages: number }> {
  const conds = [];
  if (filter.q?.trim()) conds.push(ilike(s.users.email, `%${filter.q.trim().replace(/[%_\\]/g, "\\$&")}%`));
  if (filter.tier === "FREE") {
    // effective FREE: no paid tier, or an expired one
    conds.push(sql`(${s.users.tier} = 'FREE' OR ${s.users.tierExpiresAt} <= ${now.toISOString()})`);
  } else if (filter.tier) {
    conds.push(eq(s.users.tier, filter.tier), sql`(${s.users.tierExpiresAt} IS NULL OR ${s.users.tierExpiresAt} > ${now.toISOString()})`);
  }
  const where = conds.length ? and(...conds) : undefined;
  const [{ total }] = await db.select({ total: count() }).from(s.users).where(where);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, filter.page ?? 1), pages);
  const rows = await db
    .select({
      id: s.users.id,
      email: s.users.email,
      displayName: s.users.displayName,
      role: s.users.role,
      tier: s.users.tier,
      tierExpiresAt: s.users.tierExpiresAt,
      emailVerifiedAt: s.users.emailVerifiedAt,
      createdAt: s.users.createdAt,
      lastLoginAt: s.users.lastLoginAt,
    })
    .from(s.users)
    .where(where)
    .orderBy(desc(s.users.createdAt), desc(s.users.id))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  return { rows: rows.map((r) => ({ ...r, effectiveTier: effectiveTier(r, now) })), total, page, pages };
}

/** Registrations and effective tier distribution, for the overview page. */
export async function memberStats(db: Db, now = new Date()) {
  const rows = await db
    .select({
      tier: sql<string>`CASE WHEN ${s.users.tier} <> 'FREE' AND ${s.users.tierExpiresAt} <= ${now.toISOString()} THEN 'FREE' ELSE ${s.users.tier} END`,
      n: sql<number>`count(*)::int`,
    })
    .from(s.users)
    .groupBy(sql`1`);
  return Object.fromEntries(rows.map((r) => [r.tier, r.n])) as Record<string, number>;
}

export async function getUser(db: Db, id: number) {
  const [u] = await db.select().from(s.users).where(eq(s.users.id, id));
  if (!u) return null;
  const { passwordHash: _p, totpSecretEnc: _t, ...safe } = u;
  void _p;
  void _t;
  return safe;
}

export async function entitlementHistory(db: Db, userId: number) {
  return db
    .select({
      id: s.entitlements.id,
      tier: s.entitlements.tier,
      source: s.entitlements.source,
      startsAt: s.entitlements.startsAt,
      endsAt: s.entitlements.endsAt,
      revokedAt: s.entitlements.revokedAt,
      note: s.entitlements.note,
      grantedBy: s.users.email,
      createdAt: s.entitlements.createdAt,
    })
    .from(s.entitlements)
    .leftJoin(s.users, eq(s.users.id, s.entitlements.grantedBy))
    .where(eq(s.entitlements.userId, userId))
    .orderBy(desc(s.entitlements.id));
}

/**
 * Give a user a paid tier, replacing whatever they had. `endsAt` null = no expiry.
 * Requires a verified email: an unverified address could belong to someone else.
 */
export async function grantTier(
  ctx: AdminCtx,
  userId: number,
  input: { tier: string; endsAt: Date | null; note?: string },
): Promise<{ ok: true } | Fail> {
  const now = ctx.now ?? new Date();
  const [tier] = await ctx.db.select().from(s.tiers).where(eq(s.tiers.code, input.tier));
  if (!tier || !tier.isActive || tier.code === "FREE") return { ok: false, error: "请选择一个付费等级（降为免费请用“撤销会员”）" };
  if (input.endsAt && input.endsAt.getTime() <= now.getTime()) return { ok: false, error: "到期时间必须晚于现在" };
  const note = input.note?.trim().slice(0, 200) || null;

  const result = await ctx.db.transaction(async (tx) => {
    const db = tx as unknown as Db;
    const [user] = await db.select().from(s.users).where(eq(s.users.id, userId)).for("update");
    if (!user) return "missing";
    if (!user.emailVerifiedAt) return "unverified";
    // close any grant still open, then record the new one
    await db
      .update(s.entitlements)
      .set({ revokedAt: now, revokedBy: ctx.actorId })
      .where(and(eq(s.entitlements.userId, userId), isNull(s.entitlements.revokedAt)));
    await db.insert(s.entitlements).values({
      userId,
      tier: tier.code,
      source: "ADMIN_GRANT",
      startsAt: now,
      endsAt: input.endsAt,
      grantedBy: ctx.actorId,
      note,
    });
    await db.update(s.users).set({ tier: tier.code, tierExpiresAt: input.endsAt, updatedAt: now }).where(eq(s.users.id, userId));
    return { from: effectiveTier(user, now) };
  });
  if (result === "missing") return { ok: false, error: "用户不存在" };
  if (result === "unverified") return { ok: false, error: "该用户邮箱尚未验证，不能开通会员。请先为其生成验证链接。" };
  await audit(ctx, "user.grant_tier", "user", userId, { from: result.from, to: tier.code, endsAt: input.endsAt?.toISOString() ?? null, note });
  return { ok: true };
}

/** Back to FREE; the open ledger entry is closed. */
export async function revokeTier(ctx: AdminCtx, userId: number, note?: string): Promise<{ ok: true } | Fail> {
  const now = ctx.now ?? new Date();
  const result = await ctx.db.transaction(async (tx) => {
    const db = tx as unknown as Db;
    const [user] = await db.select().from(s.users).where(eq(s.users.id, userId)).for("update");
    if (!user) return "missing";
    if (user.tier === "FREE") return "free";
    await db
      .update(s.entitlements)
      .set({ revokedAt: now, revokedBy: ctx.actorId, note: note?.trim().slice(0, 200) || undefined })
      .where(and(eq(s.entitlements.userId, userId), isNull(s.entitlements.revokedAt)));
    await db.update(s.users).set({ tier: "FREE", tierExpiresAt: null, updatedAt: now }).where(eq(s.users.id, userId));
    return { from: user.tier };
  });
  if (result === "missing") return { ok: false, error: "用户不存在" };
  if (result === "free") return { ok: false, error: "该用户当前就是免费用户" };
  await audit(ctx, "user.revoke_tier", "user", userId, { from: result.from });
  return { ok: true };
}

// ── resource tiers ──

export async function listModulesForTier(db: Db) {
  return db
    .select({
      id: s.resources.id,
      slug: s.resources.slug,
      title: s.resources.title,
      status: s.resources.status,
      requiredTier: s.resources.requiredTier,
      license: s.resources.license,
    })
    .from(s.resources)
    .where(and(eq(s.resources.type, "MODULE"), ne(s.resources.status, "ARCHIVED")))
    .orderBy(asc(s.resources.sortOrder), asc(s.resources.slug));
}

/** Set the tier a module requires. Prompts and skills are always FREE (database constraint). */
export async function setModuleTier(ctx: AdminCtx, resourceId: number, tierCode: string): Promise<{ ok: true } | Fail> {
  const [tier] = await ctx.db.select().from(s.tiers).where(eq(s.tiers.code, tierCode));
  if (!tier || !tier.isActive) return { ok: false, error: "等级无效" };
  const [current] = await ctx.db
    .select({ tier: s.resources.requiredTier, type: s.resources.type })
    .from(s.resources)
    .where(eq(s.resources.id, resourceId));
  if (!current) return { ok: false, error: "资源不存在" };
  if (current.type !== "MODULE") return { ok: false, error: "提示词和 Skills 始终免费，只有代码模块可以设置会员等级" };
  if (current.tier === tierCode) return { ok: true };
  // Deliberately NOT setting updated_by: the tier is admin-owned and the file importer never
  // touches it on update, so changing it must not stop content updates from content/ files.
  await ctx.db.update(s.resources).set({ requiredTier: tierCode }).where(eq(s.resources.id, resourceId));
  await audit(ctx, "resource.set_tier", "resource", resourceId, { from: current.tier, to: tierCode });
  await notifyContentChanged(ctx.db);
  return { ok: true };
}
