// Account operations. Pure functions over a Db handle (no Next.js imports) so they are tested
// directly against PostgreSQL. All user-facing messages are Simplified Chinese.
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import * as s from "../db/schema";
import type { AuthConfig } from "./config";
import { keyedHash, open, randomToken, seal, sha256 } from "./crypto";
import { enqueueMail, type Mailer } from "./mail";
import { dummyPasswordHash, hashPassword, passwordProblem, verifyPassword } from "./password";
import { LIMITS, hit } from "./rate-limit";
import { createSession, revokeAllSessions, type Role } from "./sessions";
import { base32Encode, newTotpSecret, otpauthUri, verifyTotp } from "./totp";

// bump whenever the privacy policy or terms change materially (2026-11-19.2: first-party statistics)
export const CONSENT_VERSION = "2026-11-19.2";
const SITE_NAME = "学术蒟蒻";
const VERIFY_TTL_MS = 24 * 3600_000;
const RESET_TTL_MS = 3600_000;
/** consecutive failures before an account is locked; each further batch doubles the lock */
const LOCK_AFTER = 5;
const LOCK_BASE_MS = 15 * 60_000;
const LOCK_MAX_MS = 24 * 3600_000;

export interface Ctx {
  db: Db;
  config: AuthConfig;
  mailer: Mailer;
  /** client IP as seen behind Caddy; only ever used through keyedHash */
  ip: string;
  userAgent?: string | null;
  now?: Date;
}

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; field?: string; retryAfter?: number };

const fail = (error: string, field?: string, retryAfter?: number) => ({ ok: false as const, error, field, retryAfter });

export function normaliseEmail(email: string): string | null {
  const e = email.trim().toLowerCase();
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return null;
  return e;
}

const ipKey = (ctx: Ctx, purpose: string) => `${purpose}:ip:${keyedHash(ctx.config.secret, "ip", ctx.ip)}`;
const acctKey = (ctx: Ctx, purpose: string, email: string) => `${purpose}:acct:${keyedHash(ctx.config.secret, "email", email)}`;

async function issueToken(ctx: Ctx, userId: number, email: string, purpose: "EMAIL_VERIFY" | "PASSWORD_RESET", ttlMs: number, createdBy?: number) {
  const token = randomToken();
  const now = ctx.now ?? new Date();
  // one live token per purpose: older ones stop working
  await ctx.db
    .update(s.authTokens)
    .set({ usedAt: now })
    .where(and(eq(s.authTokens.userId, userId), eq(s.authTokens.purpose, purpose), isNull(s.authTokens.usedAt)));
  await ctx.db.insert(s.authTokens).values({
    userId,
    email,
    purpose,
    tokenHash: sha256(token),
    expiresAt: new Date(now.getTime() + ttlMs),
    createdBy: createdBy ?? null,
  });
  return token;
}

/** Admin-issued link (no mail provider yet, or a user cannot receive mail). */
export async function issueAccountLink(
  ctx: Ctx,
  userId: number,
  purpose: "EMAIL_VERIFY" | "PASSWORD_RESET",
  adminId: number,
): Promise<{ link: string; expiresAt: Date } | null> {
  const [user] = await ctx.db.select().from(s.users).where(eq(s.users.id, userId));
  if (!user) return null;
  const ttl = purpose === "EMAIL_VERIFY" ? VERIFY_TTL_MS : RESET_TTL_MS;
  const token = await issueToken(ctx, user.id, user.email, purpose, ttl, adminId);
  const path = purpose === "EMAIL_VERIFY" ? "verify-email" : "reset-password";
  return { link: `${ctx.config.siteUrl}/${path}/?token=${token}`, expiresAt: new Date((ctx.now ?? new Date()).getTime() + ttl) };
}

async function consumeToken(ctx: Ctx, token: string, purpose: "EMAIL_VERIFY" | "PASSWORD_RESET") {
  if (!token || token.length > 100) return null;
  const now = ctx.now ?? new Date();
  const [row] = await ctx.db
    .update(s.authTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(s.authTokens.tokenHash, sha256(token)),
        eq(s.authTokens.purpose, purpose),
        isNull(s.authTokens.usedAt),
        gt(s.authTokens.expiresAt, now),
      ),
    )
    .returning({ userId: s.authTokens.userId, email: s.authTokens.email });
  return row ?? null;
}

// ── registration and verification ──

export async function register(
  ctx: Ctx,
  input: { email: string; password: string; displayName?: string; consent: boolean },
): Promise<Result<{ userId: number; mail: "sent" | "held" | "failed" }>> {
  const rl = await hit(ctx.db, ipKey(ctx, "register"), LIMITS.registerPerIp.limit, LIMITS.registerPerIp.windowSec, ctx.now);
  if (!rl.allowed) return fail("注册过于频繁，请稍后再试", undefined, rl.retryAfter);

  const email = normaliseEmail(input.email);
  if (!email) return fail("请输入有效的邮箱地址", "email");
  if (!input.consent) return fail("请先阅读并同意《用户协议》和《隐私政策》", "consent");
  const displayName = input.displayName?.trim() || null;
  if (displayName && [...displayName].length > 40) return fail("昵称不能超过 40 个字符", "displayName");
  const problem = passwordProblem(input.password, { role: "USER", email });
  if (problem) return fail(problem, "password");

  const passwordHash = await hashPassword(input.password);
  const now = ctx.now ?? new Date();
  const inserted = await ctx.db
    .insert(s.users)
    .values({ email, passwordHash, displayName, consentAt: now, consentVersion: CONSENT_VERSION })
    .onConflictDoNothing()
    .returning({ id: s.users.id });
  if (!inserted.length) return fail("该邮箱已注册，请直接登录或找回密码", "email");

  const userId = inserted[0].id;
  const token = await issueToken(ctx, userId, email, "EMAIL_VERIFY", VERIFY_TTL_MS);
  const mail = await enqueueMail(ctx.db, ctx.mailer, email, "verify_email", {
    link: `${ctx.config.siteUrl}/verify-email/?token=${token}`,
    siteName: SITE_NAME,
  });
  return { ok: true, userId, mail: mail.status };
}

export async function verifyEmail(ctx: Ctx, token: string): Promise<Result<{ userId: number }>> {
  const row = await consumeToken(ctx, token, "EMAIL_VERIFY");
  if (!row?.userId) return fail("链接无效或已过期，请在账户页重新发送验证邮件");
  // the token is bound to the address it was sent to: if the email changed since, it does not verify
  const updated = await ctx.db
    .update(s.users)
    .set({ emailVerifiedAt: ctx.now ?? new Date(), updatedAt: ctx.now ?? new Date() })
    .where(and(eq(s.users.id, row.userId), eq(s.users.email, row.email)))
    .returning({ id: s.users.id });
  if (!updated.length) return fail("链接无效或已过期，请在账户页重新发送验证邮件");
  return { ok: true, userId: row.userId };
}

export async function resendVerification(ctx: Ctx, userId: number): Promise<Result<{ mail: "sent" | "held" | "failed" }>> {
  const rl = await hit(ctx.db, `verify-resend:user:${userId}`, LIMITS.verifyResendPerUser.limit, LIMITS.verifyResendPerUser.windowSec, ctx.now);
  if (!rl.allowed) return fail("发送过于频繁，请稍后再试", undefined, rl.retryAfter);
  const [user] = await ctx.db.select().from(s.users).where(eq(s.users.id, userId));
  if (!user) return fail("账户不存在");
  if (user.emailVerifiedAt) return fail("邮箱已经验证过了");
  const token = await issueToken(ctx, user.id, user.email, "EMAIL_VERIFY", VERIFY_TTL_MS);
  const mail = await enqueueMail(ctx.db, ctx.mailer, user.email, "verify_email", {
    link: `${ctx.config.siteUrl}/verify-email/?token=${token}`,
    siteName: SITE_NAME,
  });
  return { ok: true, mail: mail.status };
}

// ── login ──

export type LoginResult = Result<{
  userId: number;
  token: string;
  expiresAt: Date;
  role: Role;
  /** admin must still pass the TOTP step (or enrol) before admin pages open */
  next: "done" | "mfa" | "mfa-setup";
}>;

export async function login(ctx: Ctx, input: { email: string; password: string }): Promise<LoginResult> {
  const rl = await hit(ctx.db, ipKey(ctx, "login"), LIMITS.loginPerIp.limit, LIMITS.loginPerIp.windowSec, ctx.now);
  if (!rl.allowed) return fail("尝试次数过多，请稍后再试", undefined, rl.retryAfter);

  const generic = "邮箱或密码不正确";
  const email = normaliseEmail(input.email);
  const now = ctx.now ?? new Date();
  const [user] = email ? await ctx.db.select().from(s.users).where(eq(s.users.email, email)) : [];
  if (!user) {
    await verifyPassword(input.password, await dummyPasswordHash()); // same cost as a real check
    return fail(generic);
  }
  if (user.lockedUntil && user.lockedUntil > now) {
    return fail("该账户因多次密码错误被暂时锁定，请稍后再试或找回密码", undefined, Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 1000));
  }
  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) {
    const failures = user.failedLogins + 1;
    const batches = Math.floor(failures / LOCK_AFTER);
    const lockedUntil =
      failures % LOCK_AFTER === 0 ? new Date(now.getTime() + Math.min(LOCK_MAX_MS, LOCK_BASE_MS * 2 ** (batches - 1))) : user.lockedUntil;
    await ctx.db.update(s.users).set({ failedLogins: failures, lockedUntil }).where(eq(s.users.id, user.id));
    return fail(generic);
  }
  if (user.disabledAt) return fail("该账户已停用");

  await ctx.db.update(s.users).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: now }).where(eq(s.users.id, user.id));
  const session = await createSession(ctx.db, { id: user.id, role: user.role }, { userAgent: ctx.userAgent, now });
  const next = user.role !== "ADMIN" ? "done" : user.totpEnabledAt ? "mfa" : "mfa-setup";
  return { ok: true, userId: user.id, ...session, role: user.role, next };
}

// ── password reset (self-service needs working mail) ──

export async function requestPasswordReset(ctx: Ctx, rawEmail: string): Promise<Result> {
  if (!ctx.config.canDeliverMail) return fail("邮件服务尚未开通，暂不支持自助找回密码。请联系管理员。");
  const rl = await hit(ctx.db, ipKey(ctx, "reset"), LIMITS.resetPerIp.limit, LIMITS.resetPerIp.windowSec, ctx.now);
  if (!rl.allowed) return fail("请求过于频繁，请稍后再试", undefined, rl.retryAfter);
  const email = normaliseEmail(rawEmail);
  if (!email) return fail("请输入有效的邮箱地址", "email");
  const per = await hit(ctx.db, acctKey(ctx, "reset", email), LIMITS.resetPerAccount.limit, LIMITS.resetPerAccount.windowSec, ctx.now);
  // Same answer whether or not the account exists (no account discovery).
  if (!per.allowed) return { ok: true };
  const [user] = await ctx.db.select().from(s.users).where(eq(s.users.email, email));
  if (user && !user.disabledAt) {
    const token = await issueToken(ctx, user.id, email, "PASSWORD_RESET", RESET_TTL_MS);
    await enqueueMail(ctx.db, ctx.mailer, email, "password_reset", {
      link: `${ctx.config.siteUrl}/reset-password/?token=${token}`,
      siteName: SITE_NAME,
    });
  }
  return { ok: true };
}

export async function resetPassword(ctx: Ctx, token: string, newPassword: string): Promise<Result> {
  // Validate before consuming, so a weak password does not burn the link.
  const [peek] = token
    ? await ctx.db
        .select({ email: s.authTokens.email, userId: s.authTokens.userId })
        .from(s.authTokens)
        .where(and(eq(s.authTokens.tokenHash, sha256(token)), eq(s.authTokens.purpose, "PASSWORD_RESET"), isNull(s.authTokens.usedAt), gt(s.authTokens.expiresAt, ctx.now ?? new Date())))
    : [];
  if (!peek?.userId) return fail("链接无效或已过期，请重新申请");
  const [user] = await ctx.db.select({ role: s.users.role }).from(s.users).where(eq(s.users.id, peek.userId));
  const problem = passwordProblem(newPassword, { role: user?.role ?? "USER", email: peek.email });
  if (problem) return fail(problem, "password");

  const row = await consumeToken(ctx, token, "PASSWORD_RESET");
  if (!row?.userId) return fail("链接无效或已过期，请重新申请");
  await ctx.db
    .update(s.users)
    .set({ passwordHash: await hashPassword(newPassword), failedLogins: 0, lockedUntil: null, updatedAt: ctx.now ?? new Date() })
    .where(eq(s.users.id, row.userId));
  await revokeAllSessions(ctx.db, row.userId);
  return { ok: true };
}

// ── signed-in account management ──

export async function changePassword(ctx: Ctx, userId: number, sessionId: number, current: string, next: string): Promise<Result<{ revoked: number }>> {
  const [user] = await ctx.db.select().from(s.users).where(eq(s.users.id, userId));
  if (!user || !(await verifyPassword(current, user.passwordHash))) return fail("当前密码不正确", "current");
  const problem = passwordProblem(next, { role: user.role, email: user.email });
  if (problem) return fail(problem, "password");
  if (await verifyPassword(next, user.passwordHash)) return fail("新密码不能与当前密码相同", "password");
  await ctx.db.update(s.users).set({ passwordHash: await hashPassword(next), updatedAt: ctx.now ?? new Date() }).where(eq(s.users.id, userId));
  const revoked = await revokeAllSessions(ctx.db, userId, sessionId);
  return { ok: true, revoked };
}

export async function updateProfile(ctx: Ctx, userId: number, displayName: string): Promise<Result> {
  const name = displayName.trim() || null;
  if (name && [...name].length > 40) return fail("昵称不能超过 40 个字符", "displayName");
  await ctx.db.update(s.users).set({ displayName: name, updatedAt: ctx.now ?? new Date() }).where(eq(s.users.id, userId));
  return { ok: true };
}

/** PIPL: users can delete their account. Requires the password (re-authentication). */
export async function deleteAccount(ctx: Ctx, userId: number, password: string): Promise<Result> {
  const [user] = await ctx.db.select().from(s.users).where(eq(s.users.id, userId));
  if (!user || !(await verifyPassword(password, user.passwordHash))) return fail("密码不正确", "password");
  if (user.role === "ADMIN") {
    const [{ n }] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(s.users).where(eq(s.users.role, "ADMIN"));
    if (n <= 1) return fail("这是最后一个管理员账户，不能删除");
  }
  const [{ orders }] = await ctx.db.select({ orders: sql<number>`count(*)::int` }).from(s.orders).where(eq(s.orders.userId, userId));
  if (orders > 0) return fail("账户存在订单记录，请联系管理员处理注销");
  await ctx.db.transaction(async (tx) => {
    await tx.delete(s.authTokens).where(eq(s.authTokens.userId, userId));
    await tx.delete(s.mailOutbox).where(eq(s.mailOutbox.toEmail, user.email));
    await tx.delete(s.users).where(eq(s.users.id, userId)); // sessions, bookmarks, entitlements cascade
  });
  return { ok: true };
}

// ── TOTP for admins ──

export async function beginTotpSetup(ctx: Ctx, userId: number): Promise<Result<{ secret: string; uri: string }>> {
  const [user] = await ctx.db.select().from(s.users).where(eq(s.users.id, userId));
  if (!user) return fail("账户不存在");
  if (user.totpEnabledAt) return fail("已经启用了两步验证");
  const secret = newTotpSecret();
  await ctx.db
    .update(s.users)
    .set({ totpSecretEnc: seal(ctx.config.secret, "totp", secret), totpLastStep: null })
    .where(eq(s.users.id, userId));
  const b32 = base32Encode(secret);
  return { ok: true, secret: b32, uri: otpauthUri(b32, user.email, SITE_NAME) };
}

/** Check a TOTP code: enables TOTP on first success (setup) and marks the session verified. */
export async function checkTotp(ctx: Ctx, userId: number, code: string): Promise<Result<{ enabled: boolean }>> {
  const rl = await hit(ctx.db, `mfa:user:${userId}`, LIMITS.mfaPerUser.limit, LIMITS.mfaPerUser.windowSec, ctx.now);
  if (!rl.allowed) return fail("尝试次数过多，请稍后再试", undefined, rl.retryAfter);
  const [user] = await ctx.db.select().from(s.users).where(eq(s.users.id, userId));
  if (!user?.totpSecretEnc) return fail("尚未设置两步验证");
  let secret: Buffer;
  try {
    secret = open(ctx.config.secret, "totp", user.totpSecretEnc);
  } catch {
    return fail("两步验证密钥无法解密（AUTH_SECRET 已更换？），请联系管理员重置");
  }
  const step = verifyTotp(secret, code, (ctx.now ?? new Date()).getTime());
  if (step === null) return fail("验证码不正确", "code");
  if (user.totpLastStep !== null && step <= user.totpLastStep) return fail("这个验证码已经用过了，请等待下一个", "code");
  const enabling = !user.totpEnabledAt;
  await ctx.db
    .update(s.users)
    .set({ totpLastStep: step, ...(enabling ? { totpEnabledAt: ctx.now ?? new Date() } : {}) })
    .where(eq(s.users.id, userId));
  return { ok: true, enabled: enabling };
}
