import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import * as s from "@/lib/db/schema";
import type { Db } from "@/lib/db/client";
import { loadContentDir } from "@/lib/content-files";
import { importContent } from "@/lib/import/content-import";
import { beaconAllowed, cleanPath, cleanQuery, isBot, optedOut, recordEvent, referrerHost } from "@/lib/analytics/ingest";
import { dailySalt, shanghaiDay, visitorHash } from "@/lib/analytics/visitor";
import { accountStats, dailyTrend, topCopied, topLocked, topReferrers, topSearches, topViewed, trafficSummary } from "@/lib/analytics/queries";
import { TEST_DATABASE_URL, freshDb } from "./helpers/db";

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";

describe("ingestion helpers", () => {
  it.each([
    [CHROME, false],
    [IPHONE, false],
    ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", true],
    ["Mozilla/5.0 (compatible; Baiduspider/2.0)", true],
    ["curl/8.5.0", true],
    ["python-requests/2.32", true],
    ["", true],
    [null, true],
  ])("isBot(%j) = %s", (ua, bot) => expect(isBot(ua)).toBe(bot));

  it.each([
    ["/modules/stat-tests-py/", "/modules/stat-tests-py/"],
    ["/modules/stat-tests-py", "/modules/stat-tests-py/"],
    ["/search/?q=统计#x", "/search/"],
    ["/%E6%A8%A1%E5%9D%97/", "/模块/"],
    ["/_next/static/chunk.js", null],
    ["/api/e", null],
    ["/media/diagrams/x.png", null],
  ])("cleanPath(%j) = %j", (input, out) => expect(cleanPath(input)).toBe(out));

  it("keeps only external referrer hosts", () => {
    expect(referrerHost("https://www.baidu.com/s?wd=科研", "rh.example.cn")).toBe("baidu.com");
    expect(referrerHost("https://www.rh.example.cn/prompts/", "rh.example.cn")).toBeNull();
    expect(referrerHost("http://129.204.142.223/modules/", "129.204.142.223")).toBeNull();
    expect(referrerHost("android-app://com.tencent.mm/", "x")).toBeNull();
    expect(referrerHost("not a url", "x")).toBeNull();
  });

  it("normalises search queries and drops one-character ones", () => {
    expect(cleanQuery("  统计   检验 ")).toBe("统计 检验");
    expect(cleanQuery("统")).toBeNull();
    expect([...cleanQuery("长".repeat(150))!].length).toBe(100);
  });

  it("respects Global Privacy Control and Do Not Track", () => {
    expect(optedOut(new Headers({ "sec-gpc": "1" }))).toBe(true);
    expect(optedOut(new Headers({ dnt: "1" }))).toBe(true);
    expect(optedOut(new Headers({}))).toBe(false);
  });

  it("rate-limits the beacon per key per minute", () => {
    const t = 1_000_000;
    const results = Array.from({ length: 5 }, () => beaconAllowed("k-test", 3, t));
    expect(results).toEqual([true, true, true, false, false]);
    expect(beaconAllowed("k-test", 3, t + 61_000)).toBe(true);
  });
});

describe.skipIf(!TEST_DATABASE_URL)("analytics (database)", () => {
  let db: Db;
  let pool: Pool;
  // a fixed "now": 2026-11-19 12:00 Asia/Shanghai
  const NOW = new Date("2026-11-19T04:00:00Z");
  const at = (shanghai: string) => new Date(`${shanghai}+08:00`);

  beforeAll(async () => {
    ({ db, pool } = await freshDb());
    await importContent(db, loadContentDir(path.resolve(__dirname, "../content")));
  });
  afterAll(async () => pool?.end());

  it("the same visitor hashes alike within a day, differently across days; old salts are deleted", async () => {
    globalThis.__rhSalt = undefined;
    const a = await visitorHash(db, "203.0.113.7", CHROME, at("2026-11-17T10:00:00"));
    const b = await visitorHash(db, "203.0.113.7", CHROME, at("2026-11-17T22:00:00"));
    const c = await visitorHash(db, "203.0.113.8", CHROME, at("2026-11-17T22:00:00"));
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
    globalThis.__rhSalt = undefined;
    const nextDay = await visitorHash(db, "203.0.113.7", CHROME, at("2026-11-18T09:00:00"));
    expect(a.equals(nextDay)).toBe(false);
    expect(a.toString("hex")).not.toContain("203.0.113.7");
    globalThis.__rhSalt = undefined;
    await dailySalt(db, at("2026-11-20T09:00:00"));
    const days = (await db.select({ d: s.dailySalts.day }).from(s.dailySalts)).map((r) => r.d).sort();
    expect(days).toEqual(["2026-11-18", "2026-11-20"]); // 11-17 deleted: its hashes are now unlinkable
  });

  it("uses Shanghai calendar days (23:30 and 00:30 are different days)", () => {
    expect(shanghaiDay(at("2026-11-18T23:30:00"))).toBe("2026-11-18");
    expect(shanghaiDay(at("2026-11-19T00:30:00"))).toBe("2026-11-19");
  });

  it("computes the dashboard numbers", async () => {
    globalThis.__rhSalt = undefined;
    await db.delete(s.events);
    const [mod] = await db.select({ id: s.resources.id }).from(s.resources).where(eq(s.resources.slug, "stat-tests-py"));
    const [prompt] = await db.select({ id: s.resources.id }).from(s.resources).where(eq(s.resources.slug, "abstract-polish"));
    const pv = (ip: string, when: string, extra: Partial<Parameters<typeof recordEvent>[1]> = {}) =>
      recordEvent(db, { type: "page_view", path: "/", ip, userAgent: CHROME, now: at(when), ...extra });

    // today: 3 page views from 2 visitors
    await pv("198.51.100.1", "2026-11-19T09:00:00", { referrerHost: "baidu.com" });
    await pv("198.51.100.1", "2026-11-19T09:05:00", { path: "/modules/stat-tests-py/", resourceId: mod.id, locked: true });
    await pv("198.51.100.2", "2026-11-19T00:10:00", { path: "/modules/stat-tests-py/", resourceId: mod.id, locked: true });
    // yesterday late evening (a different Shanghai day): visitor 1 again
    await pv("198.51.100.1", "2026-11-18T23:50:00", { referrerHost: "baidu.com" });
    // 10 days ago: inside 30 days, outside 7
    await pv("198.51.100.3", "2026-11-09T12:00:00", { referrerHost: "zhihu.com" });
    // 40 days ago: outside every window
    await pv("198.51.100.4", "2026-10-10T12:00:00");
    // after "now": ignored
    await pv("198.51.100.5", "2026-11-19T13:00:00");

    await recordEvent(db, { type: "copy", path: "/prompts/abstract-polish/", ip: "198.51.100.1", userAgent: CHROME, resourceId: prompt.id, now: at("2026-11-19T09:10:00") });
    await recordEvent(db, { type: "copy", path: "/prompts/abstract-polish/", ip: "198.51.100.2", userAgent: CHROME, resourceId: prompt.id, now: at("2026-11-19T09:11:00") });
    for (const q of ["统计检验", "统计检验", "Bootstrap", "统计检验"]) {
      await recordEvent(db, { type: "search", path: "/search/", ip: "198.51.100.1", userAgent: CHROME, searchQuery: q, now: at("2026-11-19T09:20:00") });
    }
    const [u] = await db.insert(s.users).values({ email: "a@example.test", passwordHash: "x" }).returning({ id: s.users.id });
    await recordEvent(db, { type: "register", path: "/register/", ip: "198.51.100.1", userAgent: CHROME, userId: u.id, now: at("2026-11-17T10:00:00") });
    await recordEvent(db, { type: "login", path: "/login/", ip: "198.51.100.1", userAgent: CHROME, userId: u.id, now: at("2026-11-19T08:00:00") });

    const t = await trafficSummary(db, NOW);
    expect(t.today).toEqual({ pageViews: 3, visitors: 2, avgDailyVisitors: 2 });
    expect(t.d7).toMatchObject({ pageViews: 4, visitors: 3 }); // visitor 1 counts once per day
    expect(t.d30).toMatchObject({ pageViews: 5, visitors: 4 });

    const trend = await dailyTrend(db, 30, NOW);
    expect(trend).toHaveLength(30);
    expect(trend[29]).toEqual({ day: "2026-11-19", pageViews: 3, visitors: 2 });
    expect(trend[28]).toEqual({ day: "2026-11-18", pageViews: 1, visitors: 1 });
    expect(trend.reduce((a, d) => a + d.pageViews, 0)).toBe(5);

    expect(await topCopied(db, 30, 10, NOW)).toEqual([{ slug: "abstract-polish", title: expect.any(String), type: "PROMPT", count: 2 }]);
    expect((await topLocked(db, 30, 10, NOW)).map((r) => [r.slug, r.count])).toEqual([["stat-tests-py", 2]]);
    expect((await topViewed(db, 30, 10, NOW)).map((r) => r.slug)).toEqual(["stat-tests-py"]);
    expect(await topSearches(db, 30, 10, NOW)).toEqual([
      { query: "统计检验", count: 3 },
      { query: "bootstrap", count: 1 },
    ]);
    expect(await topReferrers(db, 30, 10, NOW)).toEqual([
      { host: "baidu.com", count: 2 },
      { host: "zhihu.com", count: 1 },
    ]);
    expect(await accountStats(db, NOW)).toEqual({ registrations7: 1, registrations30: 1, logins7: 1, totalUsers: 1 });
  });

  it("stores no raw IP anywhere", async () => {
    const all = await db.execute("SELECT * FROM events");
    expect(JSON.stringify(all.rows)).not.toMatch(/198\.51\.100\./);
  });
});
