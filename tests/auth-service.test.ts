// Account flows against a real PostgreSQL (TEST_DATABASE_URL), through lib/auth/service.ts.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import * as s from "@/lib/db/schema";
import type { Db } from "@/lib/db/client";
import { readAuthConfig, type AuthConfig } from "@/lib/auth/config";
import type { Mailer, MailMessage } from "@/lib/auth/mail";
import {
  beginTotpSetup,
  changePassword,
  checkTotp,
  deleteAccount,
  login,
  register,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  verifyEmail,
  type Ctx,
} from "@/lib/auth/service";
import { listSessions, resolveSession } from "@/lib/auth/sessions";
import { base32Decode, totpAt } from "@/lib/auth/totp";
import { TEST_DATABASE_URL, freshDb } from "./helpers/db";

const PW = "Correct-Horse-27";

describe.skipIf(!TEST_DATABASE_URL)("account service", () => {
  let db: Db;
  let pool: Pool;
  let sent: MailMessage[];
  let config: AuthConfig;
  let ipCounter = 0;

  const mailer: Mailer = { driver: "log", send: async (m) => void sent.push(m) };
  // a fresh IP per test so per-IP limits do not leak between tests
  const ctx = (over: Partial<Ctx> = {}): Ctx => ({ db, config, mailer, ip: `198.51.100.${ipCounter}`, userAgent: "vitest", ...over });
  const linkToken = (m: MailMessage) => new URL(m.text.match(/https?:\/\/\S+/)![0]).searchParams.get("token")!;

  beforeAll(async () => {
    ({ db, pool } = await freshDb());
    config = readAuthConfig({
      AUTH_ENABLED: "1",
      AUTH_SECRET: "test-secret-".padEnd(40, "x"),
      SITE_URL: "https://www.example.cn",
      MAIL_DRIVER: "log",
    });
  });
  afterAll(async () => pool?.end());
  beforeEach(() => {
    sent = [];
    ipCounter++;
  });

  it("registers, sends a verification link, verifies once", async () => {
    const r = await register(ctx(), { email: "  Alice@Example.COM ", password: PW, consent: true });
    expect(r.ok).toBe(true);
    const [u] = await db.select().from(s.users).where(eq(s.users.email, "alice@example.com"));
    expect(u.passwordHash).toMatch(/^\$argon2id\$/);
    expect(u.passwordHash).not.toContain(PW);
    expect(u.consentVersion).toBeTruthy();
    expect(u.emailVerifiedAt).toBeNull();
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain("https://www.example.cn/verify-email/?token=");

    const token = linkToken(sent[0]);
    expect((await verifyEmail(ctx(), token)).ok).toBe(true);
    expect((await verifyEmail(ctx(), token)).ok).toBe(false); // single use
    const [v] = await db.select().from(s.users).where(eq(s.users.id, u.id));
    expect(v.emailVerifiedAt).not.toBeNull();
    // the raw token is never stored
    const tokens = await db.select().from(s.authTokens).where(eq(s.authTokens.userId, u.id));
    expect(tokens.every((t) => !t.tokenHash.toString("utf8").includes(token))).toBe(true);
  });

  it("rejects duplicates, missing consent and weak passwords", async () => {
    expect(await register(ctx(), { email: "alice@example.com", password: PW, consent: true })).toMatchObject({ ok: false, field: "email" });
    expect(await register(ctx(), { email: "bob@example.com", password: PW, consent: false })).toMatchObject({ ok: false, field: "consent" });
    expect(await register(ctx(), { email: "bob@example.com", password: "password123", consent: true })).toMatchObject({ ok: false, field: "password" });
    expect(await register(ctx(), { email: "not-an-email", password: PW, consent: true })).toMatchObject({ ok: false, field: "email" });
  });

  it("logs in, resolves the session cookie, and gives one generic error for bad email or password", async () => {
    const ok = await login(ctx(), { email: "ALICE@example.com", password: PW });
    if (!ok.ok) throw new Error(ok.error);
    expect(ok.next).toBe("done");
    const session = await resolveSession(db, ok.token);
    expect(session?.user.email).toBe("alice@example.com");
    expect(ok.expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * 24 * 3600_000);

    const wrongPw = await login(ctx(), { email: "alice@example.com", password: "Wrong-Horse-27" });
    const noUser = await login(ctx(), { email: "nobody@example.com", password: PW });
    expect(wrongPw).toEqual(noUser); // no account discovery
    expect(await resolveSession(db, "forged-token")).toBeNull();
  });

  it("locks an account after 5 failures and unlocks after the lock window", async () => {
    await register(ctx(), { email: "carol@example.com", password: PW, consent: true });
    for (let i = 0; i < 5; i++) await login(ctx(), { email: "carol@example.com", password: "Wrong-Horse-27" });
    const locked = await login(ctx(), { email: "carol@example.com", password: PW });
    expect(locked).toMatchObject({ ok: false });
    expect(!locked.ok && locked.error).toContain("锁定");

    const later = new Date(Date.now() + 16 * 60_000);
    const unlocked = await login(ctx({ now: later }), { email: "carol@example.com", password: PW });
    expect(unlocked.ok).toBe(true);
    const [u] = await db.select().from(s.users).where(eq(s.users.email, "carol@example.com"));
    expect(u.failedLogins).toBe(0);
  });

  it("limits login attempts per IP", async () => {
    const c = ctx({ ip: "203.0.113.99" });
    let last;
    for (let i = 0; i < 21; i++) last = await login(c, { email: `x${i}@example.com`, password: PW });
    expect(last).toMatchObject({ ok: false });
    expect(last && !last.ok && last.retryAfter).toBeGreaterThan(0);
  });

  it("resets a password with a single-use link and signs out everywhere", async () => {
    const s1 = await login(ctx(), { email: "alice@example.com", password: PW });
    if (!s1.ok) throw new Error(s1.error);
    expect((await requestPasswordReset(ctx(), "alice@example.com")).ok).toBe(true);
    expect((await requestPasswordReset(ctx(), "nobody@example.com")).ok).toBe(true); // same answer
    expect(sent).toHaveLength(1);
    const token = linkToken(sent[0]);

    expect(await resetPassword(ctx(), token, "short")).toMatchObject({ ok: false, field: "password" });
    expect((await resetPassword(ctx(), token, "Brand-New-Horse-31")).ok).toBe(true); // weak attempt did not burn the link
    expect((await resetPassword(ctx(), token, "Another-Horse-32")).ok).toBe(false);
    expect(await resolveSession(db, s1.token)).toBeNull();
    expect((await login(ctx(), { email: "alice@example.com", password: "Brand-New-Horse-31" })).ok).toBe(true);
  });

  it("refuses self-service reset when mail cannot be delivered (hold mode)", async () => {
    const held = readAuthConfig({ ...process.env, AUTH_ENABLED: "1", AUTH_SECRET: config.secret, SITE_URL: config.siteUrl, MAIL_DRIVER: "hold" });
    const r = await requestPasswordReset(ctx({ config: held, mailer: { driver: "hold", send: async () => {} } }), "alice@example.com");
    expect(r).toMatchObject({ ok: false });
    expect(sent).toHaveLength(0);
  });

  it("changes the password and keeps only the current session", async () => {
    const a = await login(ctx(), { email: "alice@example.com", password: "Brand-New-Horse-31" });
    const b = await login(ctx(), { email: "alice@example.com", password: "Brand-New-Horse-31" });
    if (!a.ok || !b.ok) throw new Error("login failed");
    const sa = (await resolveSession(db, a.token))!;
    expect(await changePassword(ctx(), sa.userId, sa.id, "wrong", "Third-Horse-33-x")).toMatchObject({ ok: false, field: "current" });
    const r = await changePassword(ctx(), sa.userId, sa.id, "Brand-New-Horse-31", "Third-Horse-33-x");
    expect(r.ok).toBe(true);
    expect(await resolveSession(db, a.token)).not.toBeNull();
    expect(await resolveSession(db, b.token)).toBeNull();
    expect((await listSessions(db, sa.userId)).map((x) => x.id)).toEqual([sa.id]);
  });

  it("rate-limits verification resends", async () => {
    await register(ctx(), { email: "dave@example.com", password: PW, consent: true });
    const [u] = await db.select().from(s.users).where(eq(s.users.email, "dave@example.com"));
    const results = [];
    for (let i = 0; i < 4; i++) results.push((await resendVerification(ctx(), u.id)).ok);
    expect(results).toEqual([true, true, true, false]);
    // only the newest link works
    const newest = linkToken(sent[sent.length - 1]);
    expect((await verifyEmail(ctx(), linkToken(sent[1]))).ok).toBe(false);
    expect((await verifyEmail(ctx(), newest)).ok).toBe(true);
  });

  it("admin: must enrol TOTP, codes are single-use, sessions are 12 h", async () => {
    expect((await register(ctx(), { email: "admin@example.com", password: "Staple-Horse-Battery-42", consent: true })).ok).toBe(true);
    await db.update(s.users).set({ role: "ADMIN" }).where(eq(s.users.email, "admin@example.com"));
    const first = await login(ctx(), { email: "admin@example.com", password: "Staple-Horse-Battery-42" });
    if (!first.ok) throw new Error(first.error);
    expect(first.next).toBe("mfa-setup");
    expect(first.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(12 * 3600_000);

    const sess = (await resolveSession(db, first.token))!;
    const setup = await beginTotpSetup(ctx(), sess.userId);
    if (!setup.ok) throw new Error(setup.error);
    expect(setup.uri).toMatch(/^otpauth:\/\/totp\//);
    const [stored] = await db.select().from(s.users).where(eq(s.users.id, sess.userId));
    expect(stored.totpSecretEnc!.toString("latin1")).not.toContain(setup.secret); // encrypted at rest

    const secret = base32Decode(setup.secret);
    const code = totpAt(secret, Math.floor(Date.now() / 30_000));
    expect(await checkTotp(ctx(), sess.userId, "000000")).toMatchObject({ ok: false });
    expect(await checkTotp(ctx(), sess.userId, code)).toMatchObject({ ok: true, enabled: true });
    expect(await checkTotp(ctx(), sess.userId, code)).toMatchObject({ ok: false }); // replay

    const second = await login(ctx(), { email: "admin@example.com", password: "Staple-Horse-Battery-42" });
    expect(second.ok && second.next).toBe("mfa");
  });

  it("deletes an account only with the password, and never the last admin", async () => {
    const [carol] = await db.select().from(s.users).where(eq(s.users.email, "carol@example.com"));
    expect(await deleteAccount(ctx(), carol.id, "wrong")).toMatchObject({ ok: false });
    expect((await deleteAccount(ctx(), carol.id, PW)).ok).toBe(true);
    expect(await db.select().from(s.users).where(eq(s.users.id, carol.id))).toEqual([]);
    expect(await db.select().from(s.sessions).where(eq(s.sessions.userId, carol.id))).toEqual([]);

    const [admin] = await db.select().from(s.users).where(eq(s.users.email, "admin@example.com"));
    const r = await deleteAccount(ctx(), admin.id, "Staple-Horse-Battery-42");
    expect(!r.ok && r.error).toContain("最后一个管理员");
  });
});
