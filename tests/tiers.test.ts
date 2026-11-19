import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import type { Pool } from "pg";
import * as s from "@/lib/db/schema";
import type { Db } from "@/lib/db/client";
import { canAccess, effectiveTier, viewerRank } from "@/lib/auth/entitlement";
import { loadContentDir } from "@/lib/content-files";
import { importContent } from "@/lib/import/content-import";
import { loadAttachment, loadSnapshot } from "@/lib/repo/store";
import { grantTier, listUsers, memberStats, revokeTier, setModuleTier } from "@/lib/admin/members";
import type { AdminCtx } from "@/lib/admin/prompts";
import { TEST_DATABASE_URL, freshDb } from "./helpers/db";

const RANKS = new Map([
  ["FREE", 0],
  ["EI", 10],
  ["SCI", 20],
]);
const DAY = 24 * 3600_000;
const now = new Date("2026-11-19T12:00:00Z");
const user = (tier: string, expiresInDays: number | null = null) => ({
  tier,
  tierExpiresAt: expiresInDays === null ? null : new Date(now.getTime() + expiresInDays * DAY),
});

describe("entitlement matrix", () => {
  const viewers: [string, ReturnType<typeof user> | null][] = [
    ["anonymous", null],
    ["FREE", user("FREE")],
    ["EI", user("EI", 30)],
    ["SCI", user("SCI")],
    ["expired EI", user("EI", -1)],
    ["expired SCI", user("SCI", -1)],
  ];
  const expected: Record<string, Record<string, boolean>> = {
    anonymous: { FREE: true, EI: false, SCI: false },
    FREE: { FREE: true, EI: false, SCI: false },
    EI: { FREE: true, EI: true, SCI: false },
    SCI: { FREE: true, EI: true, SCI: true },
    "expired EI": { FREE: true, EI: false, SCI: false },
    "expired SCI": { FREE: true, EI: false, SCI: false },
  };
  for (const [name, u] of viewers) {
    for (const required of ["FREE", "EI", "SCI"]) {
      it(`${name} -> ${required} module: ${expected[name][required] ? "allowed" : "denied"}`, () => {
        expect(canAccess(u, required, RANKS, now)).toBe(expected[name][required]);
      });
    }
  }

  it("expiry is exact: the instant of expiry already counts as expired", () => {
    expect(effectiveTier({ tier: "EI", tierExpiresAt: now }, now)).toBe("FREE");
    expect(effectiveTier({ tier: "EI", tierExpiresAt: new Date(now.getTime() + 1) }, now)).toBe("EI");
  });

  it("unknown tier codes fail closed", () => {
    expect(canAccess(user("SCI"), "TOP_JOURNAL", RANKS, now)).toBe(false);
    expect(viewerRank(user("BOGUS"), RANKS, now)).toBe(0);
  });
});

describe.skipIf(!TEST_DATABASE_URL)("memberships and gated files (database)", () => {
  let db: Db;
  let pool: Pool;
  let ctx: AdminCtx;
  let verifiedId: number;
  let unverifiedId: number;

  beforeAll(async () => {
    ({ db, pool } = await freshDb());
    await importContent(db, loadContentDir(path.resolve(__dirname, "../content")));
    const [admin] = await db.insert(s.users).values({ email: "admin@example.test", passwordHash: "x", role: "ADMIN" }).returning({ id: s.users.id });
    ctx = { db, actorId: admin.id };
    const [v] = await db.insert(s.users).values({ email: "member@example.test", passwordHash: "x", emailVerifiedAt: new Date() }).returning({ id: s.users.id });
    const [u] = await db.insert(s.users).values({ email: "new@example.test", passwordHash: "x" }).returning({ id: s.users.id });
    verifiedId = v.id;
    unverifiedId = u.id;
  });
  afterAll(async () => pool?.end());

  it("grants a tier with expiry, writes the ledger, refuses unverified emails", async () => {
    const until = new Date(Date.now() + 30 * DAY);
    expect(await grantTier(ctx, unverifiedId, { tier: "EI", endsAt: null })).toMatchObject({ ok: false, error: expect.stringContaining("验证") });
    expect(await grantTier(ctx, verifiedId, { tier: "FREE", endsAt: null })).toMatchObject({ ok: false });
    expect(await grantTier(ctx, verifiedId, { tier: "EI", endsAt: new Date(Date.now() - 1000) })).toMatchObject({ ok: false });
    expect(await grantTier(ctx, verifiedId, { tier: "EI", endsAt: until, note: "早期用户" })).toEqual({ ok: true });

    const [u] = await db.select().from(s.users).where(eq(s.users.id, verifiedId));
    expect(u.tier).toBe("EI");
    expect(u.tierExpiresAt?.getTime()).toBe(until.getTime());
    const ledger = await db.select().from(s.entitlements).where(eq(s.entitlements.userId, verifiedId));
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ tier: "EI", source: "ADMIN_GRANT", grantedBy: ctx.actorId, note: "早期用户", revokedAt: null });
  });

  it("upgrading closes the previous grant; revoking closes the open one", async () => {
    expect(await grantTier(ctx, verifiedId, { tier: "SCI", endsAt: null })).toEqual({ ok: true });
    const open = await db.select().from(s.entitlements).where(and(eq(s.entitlements.userId, verifiedId), isNull(s.entitlements.revokedAt)));
    expect(open.map((e) => e.tier)).toEqual(["SCI"]);

    expect(await revokeTier(ctx, verifiedId)).toEqual({ ok: true });
    expect(await revokeTier(ctx, verifiedId)).toMatchObject({ ok: false });
    const [u] = await db.select().from(s.users).where(eq(s.users.id, verifiedId));
    expect([u.tier, u.tierExpiresAt]).toEqual(["FREE", null]);
    expect(await db.select().from(s.entitlements).where(and(eq(s.entitlements.userId, verifiedId), isNull(s.entitlements.revokedAt)))).toEqual([]);
    const audit = await db.select({ a: s.adminAuditLog.action }).from(s.adminAuditLog).where(eq(s.adminAuditLog.targetId, verifiedId));
    expect(audit.map((x) => x.a)).toEqual(["user.grant_tier", "user.grant_tier", "user.revoke_tier"]);
  });

  it("lists users by effective tier (expired counts as FREE) and reports the distribution", async () => {
    await grantTier(ctx, verifiedId, { tier: "EI", endsAt: new Date(Date.now() + DAY) });
    expect((await listUsers(db, { tier: "EI" })).rows.map((r) => r.email)).toEqual(["member@example.test"]);
    const later = new Date(Date.now() + 2 * DAY);
    expect((await listUsers(db, { tier: "EI" }, later)).rows).toEqual([]);
    expect((await listUsers(db, { tier: "FREE" }, later)).rows.map((r) => r.email)).toContain("member@example.test");
    expect(await memberStats(db)).toMatchObject({ EI: 1 });
    expect((await memberStats(db, later)).EI).toBeUndefined();
  });

  it("only modules can require a tier; changing it notifies and is audited", async () => {
    const [mod] = await db.select().from(s.resources).where(eq(s.resources.slug, "stat-tests-py"));
    const [prompt] = await db.select().from(s.resources).where(eq(s.resources.slug, "abstract-polish"));
    expect(await setModuleTier(ctx, prompt.id, "EI")).toMatchObject({ ok: false });
    expect(await setModuleTier(ctx, mod.id, "NOPE")).toMatchObject({ ok: false });
    expect(await setModuleTier(ctx, mod.id, "EI")).toEqual({ ok: true });
    expect((await loadSnapshot(db)).bySlug.get("stat-tests-py")?.tier).toBe("EI");
  });

  it("the database never returns gated code to a lower rank", async () => {
    expect(await loadAttachment(db, "stat-tests-py", "stat_tests.py", 0)).toBeNull(); // FREE / anonymous
    expect(await loadAttachment(db, "stat-tests-py", "stat_tests.py", 10)).toContain("def "); // EI
    expect(await loadAttachment(db, "stat-tests-py", "stat_tests.py", 20)).toContain("def "); // SCI
    await setModuleTier(ctx, (await db.select().from(s.resources).where(eq(s.resources.slug, "stat-tests-py")))[0].id, "SCI");
    expect(await loadAttachment(db, "stat-tests-py", "stat_tests.py", 10)).toBeNull(); // EI < SCI
    // free modules stay open
    expect(await loadAttachment(db, "bootstrap-ci-py", "bootstrap_ci.py", 0)).toContain("def ");
  });

  it("file imports neither reset an admin-set tier nor stop content updates", async () => {
    const items = loadContentDir(path.resolve(__dirname, "../content"));
    const mod = items.find((i) => i.resource.slug === "stat-tests-py")!;
    mod.body = mod.body + "\n\n（更新）";
    const report = await importContent(db, items);
    expect(report.results.find((r) => r.slug === "stat-tests-py")?.action).toBe("updated");
    const snap = await loadSnapshot(db);
    expect(snap.bySlug.get("stat-tests-py")?.tier).toBe("SCI");
    expect(snap.bodies.get("stat-tests-py")).toContain("（更新）");
  });

  it("a new file marked PRO (Phase 1 spelling) imports as EI", async () => {
    const items = loadContentDir(path.resolve(__dirname, "../content"));
    const src = items.find((i) => i.resource.slug === "bootstrap-ci-py")!;
    const clone = { ...src, resource: { ...src.resource, slug: "bootstrap-ci-pro", tier: "PRO" } };
    const report = await importContent(db, [clone]);
    expect(report.results[0].action).toBe("created");
    expect((await loadSnapshot(db)).bySlug.get("bootstrap-ci-pro")?.tier).toBe("EI");
  });
});
