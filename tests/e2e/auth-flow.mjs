#!/usr/bin/env node
// End-to-end account flows in a real browser (Playwright/Chromium) against a running server with
// accounts enabled. Not part of `npm test` (needs a server); run before enabling accounts:
//
//   BASE_URL=http://localhost:8100 DATABASE_URL=postgres://... SHOTS=./shots node tests/e2e/auth-flow.mjs
//
// The server must run with AUTH_ENABLED=1, SITE_URL=$BASE_URL, MAIL_DRIVER=log or hold (links are
// read from the mail_outbox table, as an admin would while mail is on hold), and an admin created
// with scripts/create-admin.ts whose email/password are passed as ADMIN_EMAIL / ADMIN_PASSWORD.
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { createRequire } from "node:module";

// CommonJS resolution so a globally installed Playwright (NODE_PATH) is found as well as a local one.
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = (process.env.BASE_URL ?? "http://localhost:8100").replace(/\/$/, "");
const SHOTS = process.env.SHOTS;
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const stamp = Date.now().toString(36);
const email = `e2e-${stamp}@example.com`;
const password = "Quiet-Lantern-Harbor-58";
const results = [];

function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function lastLink(to, template) {
  const { rows } = await db.query(
    "SELECT payload->>'link' AS link FROM mail_outbox WHERE to_email = $1 AND template = $2 ORDER BY id DESC LIMIT 1",
    [to, template],
  );
  return rows[0]?.link ?? null;
}

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
function totp(secret, offset = 0) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset));
  const mac = createHmac("sha1", secret).update(counter).digest();
  const o = mac[mac.length - 1] & 15;
  const bin = ((mac[o] & 127) << 24) | (mac[o + 1] << 16) | (mac[o + 2] << 8) | mac[o + 3];
  return String(bin % 1e6).padStart(6, "0");
}

async function noOverflow(page, label) {
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  check(`${label}: no horizontal overflow at 390px`, sw === cw, `scrollWidth=${sw} clientWidth=${cw}`);
}

async function shot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

// self-contained: the admin part exercises TOTP enrolment, so start from "not enrolled"
if (process.env.ADMIN_EMAIL) {
  await db.query("UPDATE users SET totp_secret_enc = NULL, totp_enabled_at = NULL, totp_last_step = NULL WHERE email = $1", [process.env.ADMIN_EMAIL]);
}
await db.query("DELETE FROM rate_limits");

const browser = await chromium.launch();
try {
  // ── visitor ──
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "zh-CN" });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  check("header shows 登录 when signed out", await page.getByRole("link", { name: "登录", exact: true }).isVisible());
  await noOverflow(page, "home");

  const r = await page.goto(`${BASE}/account/`);
  check("signed-out /account/ redirects to login with next", page.url().startsWith(`${BASE}/login/?next=%2Faccount%2F`), page.url());
  void r;

  const adminAnon = await page.goto(`${BASE}/admin/`);
  check("signed-out /admin/ is a 404 page", adminAnon.status() === 404 && (await page.locator("h1").textContent())?.includes("不存在"));

  // ── register ──
  await page.goto(`${BASE}/register/`);
  await noOverflow(page, "register");
  await shot(page, "register");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码", { exact: true }).fill("password123");
  await page.getByLabel("确认密码").fill("password123");
  await page.getByRole("button", { name: "注册" }).click();
  // scope to the form: Next.js renders a hidden route announcer that also has role="alert"
  await page.locator("form [role=alert], form [id$='-err']").first().waitFor();
  check("weak/common password rejected inline", (await page.content()).includes("请先阅读") || (await page.content()).includes("常见密码") || (await page.content()).includes("至少"));

  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("昵称（可选）").fill("测试用户");
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByLabel("确认密码").fill(password);
  await page.getByRole("checkbox").check();
  await Promise.all([page.waitForURL(`${BASE}/account/?welcome=1`), page.getByRole("button", { name: "注册" }).click()]);
  check("registration signs in and lands on the account page", (await page.textContent("body")).includes(email));
  await noOverflow(page, "account");
  await shot(page, "account");

  const cookies = await ctx.cookies();
  const sc = cookies.find((c) => c.name === "__Host-rh_s");
  check("session cookie is HttpOnly, Secure, SameSite=Lax, host-only", !!sc && sc.httpOnly && sc.secure && sc.sameSite === "Lax" && sc.path === "/" && !sc.domain.startsWith("."), JSON.stringify(sc && { httpOnly: sc.httpOnly, secure: sc.secure, sameSite: sc.sameSite, domain: sc.domain }));
  check("session cookie not readable from page script", !(await page.evaluate(() => document.cookie)).includes("rh_s"));
  check("header shows the display name when signed in", await page.getByRole("link", { name: "测试用户" }).isVisible());

  // ── verify email ──
  const verifyLink = await lastLink(email, "verify_email");
  check("verification mail recorded in outbox", !!verifyLink);
  await page.goto(verifyLink);
  check("verification link verifies", (await page.textContent("body")).includes("邮箱验证成功"));
  await page.goto(verifyLink);
  check("verification link is single-use", (await page.textContent("body")).includes("无效或已过期"));

  // ── second device, change password revokes it ──
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/login/`);
  await p2.getByLabel("邮箱").fill(email);
  await p2.getByLabel("密码").fill("Wrong-Lantern-Harbor-00");
  await p2.getByRole("button", { name: "登录" }).click();
  await p2.locator("form [role=alert]").waitFor();
  check("wrong password shows a generic error", (await p2.locator("form [role=alert]").textContent()).includes("邮箱或密码不正确"));
  await p2.getByLabel("密码").fill(password);
  await Promise.all([p2.waitForURL(`${BASE}/account/`), p2.getByRole("button", { name: "登录" }).click()]);
  check("second device signed in", p2.url() === `${BASE}/account/`);

  await page.goto(`${BASE}/account/`);
  check("account page lists 2 devices", (await page.textContent("body")).includes("登录设备（2）"));
  await page.getByLabel("当前密码").first().fill(password);
  await page.getByLabel("新密码", { exact: true }).fill("Brighter-Lantern-Harbor-59");
  await page.getByLabel("确认新密码").fill("Brighter-Lantern-Harbor-59");
  await page.getByRole("button", { name: "修改密码" }).click();
  await page.getByText("其他 1 个设备已退出登录").waitFor();
  check("password change reports the other device signed out", true);
  await p2.goto(`${BASE}/account/`);
  check("other device is signed out after password change", p2.url().startsWith(`${BASE}/login/`), p2.url());
  await ctx2.close();

  // ── non-admin cannot reach /admin ──
  const adminUser = await page.goto(`${BASE}/admin/`);
  check("signed-in non-admin gets 404 on /admin/", adminUser.status() === 404);

  // ── logout ──
  await page.goto(`${BASE}/account/`);
  await Promise.all([page.waitForURL(`${BASE}/`), page.getByRole("button", { name: "退出登录" }).click()]);
  check("logout returns home signed out", await page.getByRole("link", { name: "登录", exact: true }).isVisible());

  // ── login page screenshot ──
  await page.goto(`${BASE}/login/`);
  await noOverflow(page, "login");
  await shot(page, "login");

  // ── admin with mandatory TOTP enrolment ──
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const actx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const ap = await actx.newPage();
    await ap.goto(`${BASE}/login/?next=%2Fadmin%2F`);
    await ap.getByLabel("邮箱").fill(process.env.ADMIN_EMAIL);
    await ap.getByLabel("密码").fill(process.env.ADMIN_PASSWORD);
    await Promise.all([ap.waitForURL(/\/account\/mfa\//), ap.getByRole("button", { name: "登录" }).click()]);
    check("admin without TOTP is sent to enrolment", ap.url().includes("/account/mfa/"));
    const preMfa = await ap.goto(`${BASE}/admin/`);
    check("admin cannot open /admin/ before TOTP", ap.url().includes("/account/mfa/") || preMfa.status() === 404, ap.url());
    await noOverflow(ap, "mfa setup");
    await shot(ap, "mfa-setup");
    const secret = base32Decode(await ap.locator("code").textContent());
    await ap.getByLabel("验证码").fill("000000");
    await ap.getByRole("button", { name: "启用两步验证" }).click();
    await ap.locator("form [id$='-err']").waitFor();
    check("wrong TOTP code rejected", (await ap.textContent("body")).includes("验证码不正确"));
    await ap.getByLabel("验证码").fill(totp(secret));
    await Promise.all([ap.waitForURL(`${BASE}/admin/`), ap.getByRole("button", { name: "启用两步验证" }).click()]);
    check("TOTP enrolment opens /admin/", ap.url() === `${BASE}/admin/` && (await ap.locator("h1").first().textContent()) === "概览");
    await shot(ap, "admin");
    await actx.close();

    // fresh login now asks for the code
    const bctx = await browser.newContext();
    const bp = await bctx.newPage();
    await bp.goto(`${BASE}/login/?next=%2Fadmin%2F`);
    await bp.getByLabel("邮箱").fill(process.env.ADMIN_EMAIL);
    await bp.getByLabel("密码").fill(process.env.ADMIN_PASSWORD);
    await Promise.all([bp.waitForURL(/\/login\/mfa\//), bp.getByRole("button", { name: "登录" }).click()]);
    check("enrolled admin is asked for a TOTP code at login", bp.url().includes("/login/mfa/"));
    await new Promise((r) => setTimeout(r, Math.max(0, 30_500 - (Date.now() % 30_000)))); // next step: previous code is spent
    await bp.getByLabel("验证码").fill(totp(secret));
    await Promise.all([bp.waitForURL(`${BASE}/admin/`), bp.getByRole("button", { name: "验证" }).click()]);
    check("valid TOTP opens /admin/", bp.url() === `${BASE}/admin/`);
    await bctx.close();
  }

  // ── delete account ──
  await page.goto(`${BASE}/login/`);
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill("Brighter-Lantern-Harbor-59");
  await Promise.all([page.waitForURL(`${BASE}/account/`), page.getByRole("button", { name: "登录" }).click()]);
  const del = page.locator("form", { has: page.getByRole("button", { name: "永久注销" }) });
  await del.getByLabel("当前密码").fill("Brighter-Lantern-Harbor-59");
  await del.getByLabel("输入“注销”确认").fill("注销");
  await Promise.all([page.waitForURL(/account-deleted=1/), del.getByRole("button", { name: "永久注销" }).click()]);
  const { rows } = await db.query("SELECT count(*)::int AS n FROM users WHERE email = $1", [email]);
  check("account deletion removes the user row", rows[0].n === 0);
} finally {
  await browser.close();
  await db.end();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
