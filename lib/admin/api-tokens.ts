// Personal API tokens for administrators (bulk upload over HTTPS). The token is shown once at
// creation; only its SHA-256 is stored. A token works only while its owner is still an active
// administrator, is not revoked and has not expired. Scope: "bulk" (POST /api/admin/bulk/).
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "../db/client";
import * as s from "../db/schema";

export const TOKEN_PREFIX = "rhk_";
const sha256 = (v: string) => createHash("sha256").update(v).digest();

export async function createApiToken(db: Db, userId: number, name: string, days: number | null): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const label = name.trim();
  if (!label || [...label].length > 40) return { ok: false, error: "名称需要 1–40 个字，例如“本机批量上传”" };
  const active = await db.select({ id: s.apiTokens.id }).from(s.apiTokens).where(and(eq(s.apiTokens.userId, userId), isNull(s.apiTokens.revokedAt)));
  if (active.length >= 10) return { ok: false, error: "最多同时保留 10 个令牌，请先撤销不用的" };
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  const [row] = await db
    .insert(s.apiTokens)
    .values({
      userId,
      name: label,
      tokenHash: sha256(token),
      prefix: token.slice(0, 10),
      scopes: ["bulk"],
      expiresAt: days ? new Date(Date.now() + days * 86_400_000) : null,
    })
    .returning({ id: s.apiTokens.id });
  await db.insert(s.adminAuditLog).values({ actorId: userId, action: "api_token.create", targetType: "api_token", targetId: row.id, diff: { name: label, days } });
  return { ok: true, token };
}

export const listApiTokens = (db: Db, userId: number) =>
  db
    .select({ id: s.apiTokens.id, name: s.apiTokens.name, prefix: s.apiTokens.prefix, scopes: s.apiTokens.scopes, createdAt: s.apiTokens.createdAt, lastUsedAt: s.apiTokens.lastUsedAt, expiresAt: s.apiTokens.expiresAt, revokedAt: s.apiTokens.revokedAt })
    .from(s.apiTokens)
    .where(eq(s.apiTokens.userId, userId))
    .orderBy(desc(s.apiTokens.id));

export async function revokeApiToken(db: Db, userId: number, id: number) {
  await db.update(s.apiTokens).set({ revokedAt: new Date() }).where(and(eq(s.apiTokens.id, id), eq(s.apiTokens.userId, userId), isNull(s.apiTokens.revokedAt)));
  await db.insert(s.adminAuditLog).values({ actorId: userId, action: "api_token.revoke", targetType: "api_token", targetId: id });
}

/** The administrator behind a bearer token with the given scope, or null. */
export async function authenticateToken(db: Db, authorization: string | null, scope: string, now = new Date()): Promise<{ userId: number; tokenId: number } | null> {
  const m = /^Bearer\s+(rhk_[A-Za-z0-9_-]{20,80})\s*$/.exec(authorization ?? "");
  if (!m) return null;
  const [row] = await db
    .select({ id: s.apiTokens.id, userId: s.apiTokens.userId, scopes: s.apiTokens.scopes, expiresAt: s.apiTokens.expiresAt, revokedAt: s.apiTokens.revokedAt, role: s.users.role, disabledAt: s.users.disabledAt })
    .from(s.apiTokens)
    .innerJoin(s.users, eq(s.users.id, s.apiTokens.userId))
    .where(eq(s.apiTokens.tokenHash, sha256(m[1])));
  if (!row || row.revokedAt || (row.expiresAt && row.expiresAt <= now) || row.role !== "ADMIN" || row.disabledAt || !row.scopes.includes(scope)) return null;
  await db.update(s.apiTokens).set({ lastUsedAt: now }).where(eq(s.apiTokens.id, row.id));
  return { userId: row.userId, tokenId: row.id };
}
