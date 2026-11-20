#!/usr/bin/env node
// End-to-end analytics: a real browser generates page views (including a client-side
// navigation), a copy and a search; the database and the admin dashboard must reflect them, and
// bots, opted-out visitors, cross-site posts and admin pages must not be counted.
//   BASE_URL=... DATABASE_URL=... ADMIN_EMAIL=... ADMIN_PASSWORD=... SHOTS=./shots node tests/e2e/analytics.mjs
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import pg from "pg";

const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = (process.env.BASE_URL ?? "http://localhost:8100").replace(/\/$/, "");
const SHOTS = process.env.SHOTS;
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const count = async (where, params = []) => Number((await db.query(`SELECT count(*) AS n FROM events WHERE ${where}`, params)).rows[0].n);
const settle = () => new Promise((r) => setTimeout(r, 800));
function base32Decode(s) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0;
  const out = [];
  for (const ch of s.replace(/\s/g, "").toUpperCase()) {
    value = (value << 5) | A.indexOf(ch);
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
function totp(secret) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const mac = createHmac("sha1", secret).update(counter).digest();
  const o = mac[mac.length - 1] & 15;
  return String((((mac[o] & 127) << 24) | (mac[o + 1] << 16) | (mac[o + 2] << 8) | mac[o + 3]) % 1e6).padStart(6, "0");
}

await db.query("DELETE FROM events");
await db.query("DELETE FROM rate_limits");
await db.query("UPDATE users SET totp_secret_enc = NULL, totp_enabled_at = NULL, totp_last_step = NULL WHERE email = $1", [process.env.ADMIN_EMAIL]);

// Headless Chromium announces itself as "HeadlessChrome", which the bot filter (rightly) drops;
// visitors here use a regular desktop Chrome user agent.
const REAL_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const browser = await chromium.launch();
try {
  // ── a visitor ──
  const v = await browser.newContext({ viewport: { width: 1280, height: 900 }, userAgent: REAL_UA, permissions: ["clipboard-read", "clipboard-write"] });
  const p = await v.newPage();
  await p.goto(`${BASE}/`, { referer: "https://www.baidu.com/s?wd=科研提示词" });
  await settle();
  check("landing page view recorded with the external referrer host", (await count("type = 'page_view' AND path = '/' AND referrer_host = 'baidu.com'")) === 1);

  // client-side navigation (no full page load) still counts
  await Promise.all([p.waitForURL(`${BASE}/prompts/`), p.locator("header nav").getByRole("link", { name: "提示词" }).first().click()]);
  await settle();
  check("client-side navigation recorded as a page view", (await count("type = 'page_view' AND path = '/prompts/'")) === 1);
  check("internal navigation stores no referrer", (await count("path = '/prompts/' AND referrer_host IS NOT NULL")) === 0);

  await p.goto(`${BASE}/prompts/abstract-polish/`);
  await p.getByRole("button", { name: /复制/ }).first().click();
  await settle();
  check("copy recorded against the resource", (await count("type = 'copy' AND resource_id = (SELECT id FROM resources WHERE slug = 'abstract-polish')")) === 1);
  check("detail page view linked to its resource", (await count("type = 'page_view' AND resource_id = (SELECT id FROM resources WHERE slug = 'abstract-polish')")) === 1);

  await p.goto(`${BASE}/search/`);
  await p.getByLabel("搜索全部资源").fill("统计检验");
  await new Promise((r) => setTimeout(r, 2000));
  check("settled search query recorded once", (await count("type = 'search' AND search_query = '统计检验'")) === 1);

  // members-only module viewed without the tier -> locked
  await db.query("UPDATE resources SET required_tier = 'EI' WHERE slug = 'stat-tests-py'");
  await db.query("NOTIFY content_changed");
  await settle();
  await p.goto(`${BASE}/modules/stat-tests-py/`);
  await settle();
  check("locked view flagged for a members-only module", (await count("type = 'page_view' AND locked AND path = '/modules/stat-tests-py/'")) === 1);
  await db.query("UPDATE resources SET required_tier = 'FREE' WHERE slug = 'stat-tests-py'");
  await db.query("NOTIFY content_changed");
  await v.close();

  // ── not counted ──
  const before = await count("true");
  const gpc = await browser.newContext({ userAgent: REAL_UA, extraHTTPHeaders: { "Sec-GPC": "1" } });
  const gp = await gpc.newPage();
  await gp.goto(`${BASE}/skills/`);
  await settle();
  await gpc.close();
  const send = (headers, body = { t: "pv", p: "/directory/" }) => fetch(`${BASE}/api/e`, { method: "POST", headers: { "Content-Type": "text/plain", ...headers }, body: JSON.stringify(body) });
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36";
  const r1 = await send({ "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)", "Sec-Fetch-Site": "same-origin" });
  const r2 = await send({ "User-Agent": ua, "Sec-Fetch-Site": "cross-site" });
  const r3 = await send({ "User-Agent": ua, Origin: "https://evil.example" });
  const r4 = await send({ "User-Agent": ua, "Sec-Fetch-Site": "same-origin" }, { t: "pv", p: "/api/e" });
  await settle();
  check("bots, GPC, cross-site posts and non-page paths are not counted", (await count("true")) === before, `before=${before} after=${await count("true")}`);
  check("the beacon answers 204 either way", [r1, r2, r3, r4].every((r) => r.status === 204));

  // ── admin: own pages are not traffic; dashboard shows the numbers ──
  const admin = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const ap = await admin.newPage();
  await ap.goto(`${BASE}/login/?next=%2Fadmin%2Fanalytics%2F`);
  await ap.getByLabel("邮箱").fill(process.env.ADMIN_EMAIL);
  await ap.getByLabel("密码").fill(process.env.ADMIN_PASSWORD);
  await Promise.all([ap.waitForURL(/\/account\/mfa\//), ap.getByRole("button", { name: "登录" }).click()]);
  await ap.getByLabel("验证码").fill(totp(base32Decode(await ap.locator("code").textContent())));
  await Promise.all([ap.waitForURL(`${BASE}/admin/analytics/`), ap.getByRole("button", { name: "启用两步验证" }).click()]);
  await settle();
  check("admin pages are not counted as traffic", (await count("path LIKE '/admin/%'")) === 0);
  check("login event recorded and linked to the account", (await count("type = 'login' AND user_id IS NOT NULL")) >= 1);

  const body = await ap.textContent("main");
  const todayRow = await ap.locator("tbody tr").first().textContent();
  const pv = await count("type = 'page_view'");
  check("dashboard 'today' row shows the recorded page views", todayRow.includes(String(pv)), `${todayRow.trim()} / pv=${pv}`);
  const section = (title) => ap.locator("section", { has: ap.getByRole("heading", { name: title, exact: true }) }).textContent();
  check("dashboard: top copied lists the copied prompt", (await section("复制最多的资源")).includes("中文摘要译润为英文期刊摘要"));
  check("dashboard: top searches lists the query", (await section("热门搜索词")).includes("统计检验"));
  check("dashboard: referrers list baidu.com", (await section("来源网站")).includes("baidu.com"));
  check("dashboard: locked list names the members-only module", (await section("被看最多、但对方没有权限的会员资源")).includes("统计检验选择与执行工具包"));
  void body;

  const chart = ap.getByRole("img", { name: "每日访客（近 30 天）" });
  const box = await chart.boundingBox();
  await ap.mouse.move(box.x + box.width - 60, box.y + box.height / 2);
  check("hovering the trend shows a tooltip with the day's numbers", (await ap.getByRole("status").filter({ hasText: "访客" }).textContent()).includes("浏览"));
  await chart.focus();
  await ap.keyboard.press("ArrowLeft");
  check("the chart is keyboard-explorable", await ap.getByRole("status").filter({ hasText: "访客" }).isVisible());
  await ap.getByText("查看数据表").click();
  check("a data table backs the chart", (await ap.locator("details table tbody tr").count()) === 30);
  if (SHOTS) {
    fs.mkdirSync(SHOTS, { recursive: true });
    await ap.mouse.move(box.x + box.width - 60, box.y + box.height / 2);
    await ap.screenshot({ path: path.join(SHOTS, "analytics-desktop.png"), fullPage: true });
  }
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, storageState: await admin.storageState() });
  const mp = await mobile.newPage();
  await mp.goto(`${BASE}/admin/analytics/`);
  check("dashboard: no horizontal overflow at 390px", await mp.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth));
  if (SHOTS) await mp.screenshot({ path: path.join(SHOTS, "analytics-mobile.png"), fullPage: true });
  await mobile.close();
  await admin.close();

  const raw = JSON.stringify((await db.query("SELECT * FROM events")).rows);
  check("no IP address stored in any event", !/\b(127\.0\.0\.1|::1|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/.test(raw));
} finally {
  await browser.close();
  await db.end();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
