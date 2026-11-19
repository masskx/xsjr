#!/usr/bin/env node
// End-to-end membership gating: members-only module code must be ABSENT from every response
// (HTML and the RSC payload used by client navigation) for viewers without the tier.
//   BASE_URL=http://localhost:8100 DATABASE_URL=... ADMIN_EMAIL=... ADMIN_PASSWORD=... SHOTS=./shots \
//   node tests/e2e/tiers.mjs
// Uses the database to reset the admin's TOTP, to expire a membership, and to clean up.
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = (process.env.BASE_URL ?? "http://localhost:8100").replace(/\/$/, "");
const SHOTS = process.env.SHOTS;
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SLUG = "stat-tests-py";
const PAGE = `${BASE}/modules/${SLUG}/`;
// a line that only exists in the module's code file (not in its body or metadata)
const source = fs.readFileSync(path.join(root, "content/modules/stat-tests-py/files/stat_tests.py"), "utf8");
const body = fs.readFileSync(path.join(root, "content/modules/stat-tests-py/body.md"), "utf8");
// No characters HTML would escape (< > & " '): the marker must match the raw HTML byte-for-byte,
// otherwise an "absent" check could pass while an escaped copy of the code is present.
// We take a function signature without its return annotation ("->" contains ">").
const MARKER = source
  .split("\n")
  .map((l) => l.trim().match(/^def \w+\([^)]*\)/)?.[0])
  .find((sig) => sig && sig.length > 25 && /^[\w\s(),.=:\-*[\]]+$/.test(sig) && !body.includes(sig));
if (!MARKER) {
  console.error("FATAL: no usable marker in the module's code file; the gating checks would be meaningless");
  process.exit(2);
}
const stamp = Date.now().toString(36);
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
function totp(secret) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const mac = createHmac("sha1", secret).update(counter).digest();
  const o = mac[mac.length - 1] & 15;
  return String((((mac[o] & 127) << 24) | (mac[o + 1] << 16) | (mac[o + 2] << 8) | mac[o + 3]) % 1e6).padStart(6, "0");
}

/** Both representations of the page for a given browser context (cookies included). */
async function fetchBoth(request) {
  const html = await (await request.get(PAGE)).text();
  const rsc = await (await request.get(PAGE, { headers: { RSC: "1" } })).text();
  return { html, rsc };
}
async function expectGate(label, request, allowed) {
  const { html, rsc } = await fetchBoth(request);
  const inHtml = html.includes(MARKER);
  const inRsc = rsc.includes(MARKER);
  check(`${label}: code ${allowed ? "present" : "ABSENT"} in HTML and RSC payload`, inHtml === allowed && inRsc === allowed, `html=${inHtml} rsc=${inRsc}`);
  return html;
}

await db.query("UPDATE users SET totp_secret_enc = NULL, totp_enabled_at = NULL, totp_last_step = NULL WHERE email = $1", [process.env.ADMIN_EMAIL]);
await db.query("UPDATE resources SET required_tier = 'FREE' WHERE slug = $1; NOTIFY content_changed", [SLUG]).catch(async () => {
  await db.query("UPDATE resources SET required_tier = 'FREE' WHERE slug = $1", [SLUG]);
  await db.query("NOTIFY content_changed");
});
await db.query("DELETE FROM rate_limits");
check("test marker found in the code file (and not in the public body)", !!MARKER, MARKER?.slice(0, 50));

const browser = await chromium.launch();
try {
  // ── admin: sign in, set the module to EI ──
  const admin = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const ap = await admin.newPage();
  await ap.goto(`${BASE}/login/?next=%2Fadmin%2Fmodules%2F`);
  await ap.getByLabel("邮箱").fill(process.env.ADMIN_EMAIL);
  await ap.getByLabel("密码").fill(process.env.ADMIN_PASSWORD);
  await Promise.all([ap.waitForURL(/\/account\/mfa\//), ap.getByRole("button", { name: "登录" }).click()]);
  await ap.getByLabel("验证码").fill(totp(base32Decode(await ap.locator("code").textContent())));
  await Promise.all([ap.waitForURL(`${BASE}/admin/modules/`), ap.getByRole("button", { name: "启用两步验证" }).click()]);

  const anon = await browser.newContext();
  await expectGate("FREE module, anonymous (baseline)", anon.request, true);

  const row = ap.locator("li", { hasText: SLUG });
  await row.locator("select").selectOption("EI");
  await Promise.all([ap.waitForURL(/saved=/), row.getByRole("button", { name: "保存" }).click()]);
  check("admin set the module to EI", (await ap.textContent("body")).includes("已保存"));

  // ── anonymous ──
  const anonHtml = await expectGate("EI module, anonymous", anon.request, false);
  check("locked page still shows title and lock message", anonHtml.includes("统计检验选择与执行工具包") && anonHtml.includes("完整代码仅对"));
  check("locked page is still 200 (indexable)", (await anon.request.get(PAGE)).status() === 200);
  check("module stays in the sitemap", (await (await anon.request.get(`${BASE}/sitemap.xml`)).text()).includes(`/modules/${SLUG}/`));
  check("module card shows the EI badge", (await (await anon.request.get(`${BASE}/modules/`)).text()).includes("EI 会员内容"));

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const mp = await mobile.newPage();
  await mp.goto(PAGE);
  const { sw, cw } = await mp.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  check("locked module page: no horizontal overflow at 390px", sw === cw, `${sw}/${cw}`);
  if (SHOTS) {
    fs.mkdirSync(SHOTS, { recursive: true });
    await mp.locator("text=完整代码").first().scrollIntoViewIfNeeded();
    await mp.screenshot({ path: path.join(SHOTS, "module-locked-mobile.png") });
  }
  await mobile.close();

  // ── a free user ──
  const email = `e2e-member-${stamp}@example.com`;
  const user = await browser.newContext();
  const up = await user.newPage();
  await up.goto(`${BASE}/register/`);
  await up.getByLabel("邮箱").fill(email);
  await up.getByLabel("密码", { exact: true }).fill("Quiet-Lantern-Harbor-58");
  await up.getByLabel("确认密码").fill("Quiet-Lantern-Harbor-58");
  await up.getByRole("checkbox").check();
  await Promise.all([up.waitForURL(/\/account\//), up.getByRole("button", { name: "注册" }).click()]);
  await expectGate("EI module, signed-in FREE user", user.request, false);

  // ── admin cannot grant before the email is verified ──
  const { rows } = await db.query("SELECT id FROM users WHERE email = $1", [email]);
  const userId = rows[0].id;
  await ap.goto(`${BASE}/admin/users/${userId}/`);
  check("grant is disabled for an unverified email", await ap.getByRole("button", { name: "开通" }).isDisabled());
  await ap.getByRole("button", { name: "生成邮箱验证链接" }).click();
  const verify = await ap.locator("code").first().textContent();
  await up.goto(verify);

  // ── grant EI for 30 days ──
  await ap.goto(`${BASE}/admin/users/${userId}/`);
  await ap.getByLabel("等级").selectOption("EI");
  await ap.getByLabel("有效期").selectOption("30");
  await ap.getByLabel("备注（可选）").fill("e2e");
  await Promise.all([ap.waitForURL(/msg=granted/), ap.getByRole("button", { name: "开通" }).click()]);
  check("admin granted EI", (await ap.textContent("body")).includes("会员已开通"));
  if (SHOTS) await ap.screenshot({ path: path.join(SHOTS, "admin-user-detail.png"), fullPage: true });
  await expectGate("EI module, EI member", user.request, true);

  // ── module raised to SCI: EI is no longer enough ──
  await ap.goto(`${BASE}/admin/modules/`);
  await ap.locator("li", { hasText: SLUG }).locator("select").selectOption("SCI");
  await Promise.all([ap.waitForURL(/saved=/), ap.locator("li", { hasText: SLUG }).getByRole("button", { name: "保存" }).click()]);
  const eiHtml = await expectGate("SCI module, EI member", user.request, false);
  check("lock message names the viewer's tier", eiHtml.includes("你当前是") && eiHtml.includes("EI 会员"));

  // ── upgrade to SCI ──
  await ap.goto(`${BASE}/admin/users/${userId}/`);
  await ap.getByLabel("等级").selectOption("SCI");
  await ap.getByLabel("有效期").selectOption("forever");
  await Promise.all([ap.waitForURL(/msg=granted/), ap.getByRole("button", { name: "开通" }).click()]);
  await expectGate("SCI module, SCI member", user.request, true);

  // ── expiry ──
  await db.query("UPDATE users SET tier_expires_at = now() - interval '1 minute' WHERE id = $1", [userId]);
  const expiredHtml = await expectGate("SCI module, expired SCI member", user.request, false);
  check("lock message says the membership expired", expiredHtml.includes("已到期"));
  await up.goto(`${BASE}/account/`);
  check("account page shows the expiry", (await up.textContent("body")).includes("已于"));

  // ── revoke ──
  await db.query("UPDATE users SET tier_expires_at = NULL WHERE id = $1", [userId]);
  await ap.goto(`${BASE}/admin/users/${userId}/`);
  await Promise.all([ap.waitForURL(/msg=revoked/), ap.getByRole("button", { name: "撤销会员（改为免费）" }).click()]);
  await expectGate("SCI module, revoked member", user.request, false);
  const ledger = await db.query("SELECT tier, revoked_at IS NOT NULL AS closed FROM entitlements WHERE user_id = $1 ORDER BY id", [userId]);
  check("ledger has both grants, both closed", JSON.stringify(ledger.rows) === JSON.stringify([{ tier: "EI", closed: true }, { tier: "SCI", closed: true }]), JSON.stringify(ledger.rows));

  // ── free modules are unaffected throughout ──
  const free = await (await anon.request.get(`${BASE}/modules/bootstrap-ci-py/`)).text();
  check("FREE modules still show code to anonymous visitors", free.includes("def "));

  await user.close();
  await anon.close();
  await admin.close();
} finally {
  await browser.close();
  await db.query("UPDATE resources SET required_tier = 'FREE' WHERE slug = $1", [SLUG]);
  await db.query("DELETE FROM users WHERE email LIKE 'e2e-member-%@example.com'");
  await db.query("NOTIFY content_changed");
  await db.end();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
