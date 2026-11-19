#!/usr/bin/env node
// End-to-end admin workflow in a real browser against a running server with accounts enabled.
//   BASE_URL=http://localhost:8100 DATABASE_URL=postgres://... ADMIN_EMAIL=... ADMIN_PASSWORD=... \
//   SHOTS=./shots node tests/e2e/admin-prompts.mjs
// Uses the database to reset the admin's TOTP first (so enrolment is exercised and the test knows
// the secret) and to clean up the prompt it creates. Run against a test or staging database only.
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import pg from "pg";

const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = (process.env.BASE_URL ?? "http://localhost:8100").replace(/\/$/, "");
const SHOTS = process.env.SHOTS;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const stamp = Date.now().toString(36);
const slug = `e2e-prompt-${stamp}`;
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

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
let lastStep = -1;
async function freshCode(secret) {
  // codes are single-use per 30 s step: wait for a step we have not used yet
  while (Math.floor(Date.now() / 30000) <= lastStep) await new Promise((r) => setTimeout(r, 500));
  const step = Math.floor(Date.now() / 30000);
  lastStep = step;
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", secret).update(counter).digest();
  const o = mac[mac.length - 1] & 15;
  return String((((mac[o] & 127) << 24) | (mac[o + 1] << 16) | (mac[o + 2] << 8) | mac[o + 3]) % 1e6).padStart(6, "0");
}
const status = async (url) => (await fetch(url, { redirect: "manual" })).status;
const text = async (url) => (await fetch(url)).text();
async function noOverflow(page, label) {
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  check(`${label}: no horizontal overflow`, sw === cw, `scrollWidth=${sw} clientWidth=${cw}`);
}
async function shot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

await db.query("UPDATE users SET totp_secret_enc = NULL, totp_enabled_at = NULL, totp_last_step = NULL WHERE email = $1", [ADMIN_EMAIL]);
await db.query("DELETE FROM rate_limits");

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, locale: "zh-CN" });
  const page = await ctx.newPage();

  // ── sign in, enrol TOTP ──
  await page.goto(`${BASE}/login/?next=%2Fadmin%2Fprompts%2F`);
  await page.getByLabel("邮箱").fill(ADMIN_EMAIL);
  await page.getByLabel("密码").fill(ADMIN_PASSWORD);
  await Promise.all([page.waitForURL(/\/account\/mfa\//), page.getByRole("button", { name: "登录" }).click()]);
  const secret = base32Decode(await page.locator("code").textContent());
  await page.getByLabel("验证码").fill(await freshCode(secret));
  await Promise.all([page.waitForURL(`${BASE}/admin/prompts/`), page.getByRole("button", { name: "启用两步验证" }).click()]);
  check("admin lands on the prompt list after TOTP", page.url() === `${BASE}/admin/prompts/`);
  check("list shows the 4 imported prompts", (await page.locator("ol > li").count()) === 4);
  await shot(page, "admin-list-desktop");

  // ── create a draft ──
  await Promise.all([page.waitForURL(`${BASE}/admin/prompts/new/`), page.getByRole("link", { name: "新建提示词" }).click()]);
  await page.getByLabel("标题", { exact: true }).fill("端到端测试提示词");
  await page.getByLabel("网址标识", { exact: true }).fill(slug);
  await page.getByLabel("摘要", { exact: true }).fill("这是一条由端到端测试创建的提示词，用于验证后台的草稿、发布与下架流程。");
  await page.getByLabel("分类", { exact: true }).fill("论文写作");
  await Promise.all([page.waitForURL(/\/admin\/prompts\/\d+\/\?created=1/), page.getByRole("button", { name: "创建草稿" }).click()]);
  const editUrl = page.url().split("?")[0];
  check("draft created, editor opened", /\/admin\/prompts\/\d+\/$/.test(editUrl));
  check("draft is 404 on the public site", (await status(`${BASE}/prompts/${slug}/`)) === 404);
  check("draft is not in the sitemap", !(await text(`${BASE}/sitemap.xml`)).includes(slug));

  // ── undeclared placeholder blocks publishing ──
  const tpl = page.getByLabel("模板", { exact: true });
  await tpl.fill("请根据 {{topic}} 的实验记录，写出规范的方法部分。");
  await page.getByRole("button", { name: "保存草稿" }).click();
  await page.getByText("已保存（草稿").waitFor();
  await Promise.all([page.waitForURL(/err=/), page.getByRole("button", { name: "发布" }).click()]);
  check("publishing with an undeclared {{topic}} is refused", (await page.textContent("body")).includes("没有对应的变量"));

  // ── declare the variable, save, publish ──
  await page.getByRole("button", { name: "添加变量" }).click();
  await page.getByLabel("变量名", { exact: true }).fill("topic");
  await page.getByLabel("显示名", { exact: true }).fill("研究主题");
  check("live preview shows the new variable field", await page.getByText("研究主题").first().isVisible());
  check("publish is disabled while there are unsaved changes", await page.getByRole("button", { name: "发布" }).isDisabled());
  await page.getByRole("button", { name: "保存草稿" }).click();
  await page.getByText("已保存（草稿").waitFor();
  await Promise.all([page.waitForURL(/msg=published/), page.getByRole("button", { name: "发布" }).click()]);
  check("published", (await page.textContent("body")).includes("已发布，网站上已可见"));
  await shot(page, "admin-editor-desktop");

  check("published prompt is 200 on the public site", (await status(`${BASE}/prompts/${slug}/`)) === 200);
  check("published prompt is in /prompts/", (await text(`${BASE}/prompts/`)).includes(slug));
  check("published prompt is in the sitemap", (await text(`${BASE}/sitemap.xml`)).includes(`/prompts/${slug}/`));
  check("published prompt is in the search index", (await text(`${BASE}/search/`)).includes(slug));

  // ── edit while published goes live immediately ──
  await page.getByLabel("标题", { exact: true }).fill("端到端测试提示词（已修改）");
  await page.getByRole("button", { name: "保存（立即生效）" }).click();
  await page.getByText("网站已更新").waitFor();
  check("edit of a published prompt is live", (await text(`${BASE}/prompts/${slug}/`)).includes("端到端测试提示词（已修改）"));

  // ── a stale editor cannot overwrite ──
  const stale = await ctx.newPage();
  await stale.goto(editUrl);
  await page.getByLabel("摘要", { exact: true }).fill("第一位管理员修改了摘要：这是一条用于验证并发保存保护的端到端测试提示词。");
  await page.getByRole("button", { name: "保存（立即生效）" }).click();
  await page.getByText("网站已更新").waitFor();
  await stale.getByLabel("摘要", { exact: true }).fill("第二位管理员基于旧版本修改：这次保存应当被拒绝，不能覆盖别人的修改。");
  await stale.getByRole("button", { name: "保存（立即生效）" }).click();
  await stale.getByText("被修改过").waitFor();
  check("stale editor's save is refused", (await stale.textContent("body")).includes("被修改过"));
  await stale.close();

  // ── reorder: move it up one place; the public order follows ──
  const order = async () => [...(await text(`${BASE}/prompts/`)).matchAll(/href="\/prompts\/([a-z0-9-]+)\/"/g)].map((m) => m[1]).filter((s, i, a) => a.indexOf(s) === i);
  const before = await order();
  await page.goto(`${BASE}/admin/prompts/`);
  await Promise.all([page.waitForURL(/moved=/), page.getByRole("button", { name: `上移 端到端测试提示词（已修改）` }).click()]);
  const after = await order();
  check("moving up changes the public order", after.indexOf(slug) === before.indexOf(slug) - 1, `${before.indexOf(slug)} -> ${after.indexOf(slug)}`);

  // ── mobile layout ──
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, storageState: await ctx.storageState() });
  const mp = await mobile.newPage();
  await mp.goto(`${BASE}/admin/prompts/`);
  await noOverflow(mp, "admin list at 390px");
  await shot(mp, "admin-list-mobile");
  await mp.goto(editUrl);
  await noOverflow(mp, "editor at 390px");
  await shot(mp, "admin-editor-mobile");
  await mobile.close();

  // ── unpublish ──
  await page.goto(editUrl);
  await Promise.all([page.waitForURL(/msg=unpublished/), page.getByRole("button", { name: "取消发布" }).click()]);
  check("unpublished prompt is 404", (await status(`${BASE}/prompts/${slug}/`)) === 404);
  check("unpublished prompt left the sitemap", !(await text(`${BASE}/sitemap.xml`)).includes(slug));
  check("unpublished prompt left /prompts/", !(await text(`${BASE}/prompts/`)).includes(slug));

  // ── archive needs re-authentication ──
  await db.query("UPDATE sessions SET reauth_at = now() - interval '1 hour' WHERE user_id = (SELECT id FROM users WHERE email = $1)", [ADMIN_EMAIL]);
  await Promise.all([page.waitForURL(/\/admin\/reauth\//), page.getByRole("button", { name: "归档" }).click()]);
  check("archive asks for re-authentication", page.url().includes("/admin/reauth/"));
  await page.getByLabel("验证码").fill(await freshCode(secret));
  await Promise.all([page.waitForURL(new RegExp(editUrl.replace(BASE, ""))), page.getByRole("button", { name: "验证" }).click()]);
  await Promise.all([page.waitForURL(/msg=archived/), page.getByRole("button", { name: "归档" }).click()]);
  check("archived after re-auth, gone from the default list", !(await page.locator("ol").textContent()).includes("端到端测试提示词"));

  // ── user lookup and a reset link that really works ──
  const userEmail = `e2e-user-${stamp}@example.com`;
  const visitor = await browser.newContext();
  const vp = await visitor.newPage();
  await vp.goto(`${BASE}/register/`);
  await vp.getByLabel("邮箱").fill(userEmail);
  await vp.getByLabel("密码", { exact: true }).fill("Quiet-Lantern-Harbor-58");
  await vp.getByLabel("确认密码").fill("Quiet-Lantern-Harbor-58");
  await vp.getByRole("checkbox").check();
  await Promise.all([vp.waitForURL(/\/account\//), vp.getByRole("button", { name: "注册" }).click()]);
  check("non-admin user gets 404 on /admin/prompts/", (await vp.goto(`${BASE}/admin/prompts/`)).status() === 404);

  await page.goto(`${BASE}/admin/users/?email=${encodeURIComponent(userEmail)}`);
  check("user lookup finds the account", (await page.textContent("body")).includes("未验证"));
  await page.getByRole("button", { name: "生成邮箱验证链接" }).click();
  const verifyLink = await page.locator("code").first().textContent();
  check("verification link issued", verifyLink.includes("/verify-email/?token="));
  await page.getByRole("button", { name: "生成重置密码链接" }).click();
  await page.locator("code").nth(1).waitFor();
  const resetLink = await page.locator("code").nth(1).textContent();
  check("reset link issued (re-auth still fresh)", resetLink.includes("/reset-password/?token="));
  await shot(page, "admin-users");

  await vp.goto(resetLink);
  await vp.getByLabel("新密码", { exact: true }).fill("Brand-New-Lantern-77");
  await vp.getByLabel("确认新密码").fill("Brand-New-Lantern-77");
  await Promise.all([vp.waitForURL(/\/login\/\?reset=1/), vp.getByRole("button", { name: "保存新密码" }).click()]);
  check("admin-issued reset link resets the password", vp.url().includes("reset=1"));
  await vp.getByLabel("邮箱").fill(userEmail);
  await vp.getByLabel("密码").fill("Brand-New-Lantern-77");
  await Promise.all([vp.waitForURL(`${BASE}/account/`), vp.getByRole("button", { name: "登录" }).click()]);
  check("user signs in with the new password", vp.url() === `${BASE}/account/`);
  await visitor.close();

  const { rows } = await db.query(
    "SELECT action FROM admin_audit_log WHERE created_at > now() - interval '10 minutes' ORDER BY id",
  );
  const actions = new Set(rows.map((r) => r.action));
  check(
    "audit log recorded every kind of change",
    ["resource.create", "resource.update", "resource.publish", "resource.reorder", "resource.unpublish", "resource.archive", "user.issue_verify_link", "user.issue_reset_link"].every((a) => actions.has(a)),
    [...actions].join(","),
  );
} finally {
  await browser.close();
  await db.query("DELETE FROM resources WHERE slug = $1", [slug]);
  await db.query("DELETE FROM users WHERE email LIKE 'e2e-user-%@example.com'");
  await db.query("NOTIFY content_changed");
  await db.end();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
