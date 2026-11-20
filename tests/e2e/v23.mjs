#!/usr/bin/env node
// Release 2.3 end to end: brand Easter egg, AI timeline, external search, counters and ZIP
// downloads, skill install guides, continue-browsing, changelog, daily announcement, icon
// navigation, easier registration, and the bulk-upload API.
//   BASE_URL=... DATABASE_URL=... ADMIN_EMAIL=... SHOTS=./shots node tests/e2e/v23.mjs
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import pg from "pg";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { strToU8, unzipSync, zipSync } = require("fflate");
const BASE = (process.env.BASE_URL ?? "http://localhost:8100").replace(/\/$/, "");
const SHOTS = process.env.SHOTS;
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const counts = async (slug) => (await q("SELECT view_count, download_count FROM resources WHERE slug = $1", [slug]))[0];

await q("DELETE FROM announcements");
await q("DELETE FROM resource_daily_visitors");
await q("UPDATE resources SET view_count = 0, download_count = 0");
await q("DELETE FROM rate_limits");
await q("DELETE FROM api_tokens");
await q("DELETE FROM users WHERE email LIKE 'v23-%@example.com'");

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: UA, acceptDownloads: true });
  // third-party sites must never be contacted by the page itself
  const external = [];
  await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => {
    external.push(route.request().url());
    route.abort();
  });
  const p = await ctx.newPage();

  // ── home: brand, timeline, external search ──
  await p.goto(`${BASE}/`);
  // an announcement from a previous run may still be cached by the server for up to a minute
  if (await p.getByRole("dialog").waitFor({ timeout: 2000 }).then(() => true, () => false)) await p.getByRole("button", { name: /今天不再显示/ }).click();
  check("site is called 学术蒟蒻", (await p.title()).includes("学术蒟蒻"));
  await p.getByRole("button", { name: "蒟蒻" }).hover();
  const tip = p.getByRole("tooltip");
  check("hovering 蒟蒻 shows pinyin and meaning", (await tip.isVisible()) && /jǔ/.test(await tip.textContent()) && /新手/.test(await tip.textContent()));
  await p.mouse.move(5, 500);
  const timeline = p.getByRole("region", { name: /人工智能发展时间线/ });
  check("timeline region with all milestones", (await timeline.locator("li h3").count()) >= 21);
  check("timeline starts in 1943 and reaches 2025", (await timeline.textContent()).includes("1943") && (await timeline.textContent()).includes("2025"));
  if (SHOTS) {
    fs.mkdirSync(SHOTS, { recursive: true });
    await p.screenshot({ path: path.join(SHOTS, "v23-home.png"), fullPage: true });
  }
  await p.getByRole("tab", { name: "中文文献" }).click();
  await p.getByRole("radio", { name: "万方" }).click();
  await p.getByLabel(/中文文献：在 万方 中搜索/).fill("深度学习 医学影像");
  const [popup] = await Promise.all([ctx.waitForEvent("page"), p.getByRole("button", { name: /搜索 ↗/ }).click()]);
  await popup.waitForLoadState("domcontentloaded").catch(() => {});
  // the test blocks third-party hosts, so read the URL the tab tried to open
  const opened = [popup.url(), ...external].reverse().find((u) => u.startsWith("https://")) ?? popup.url();
  check("external search opens the engine in a new tab with the encoded query", opened.startsWith("https://s.wanfangdata.com.cn/paper?q=") && decodeURIComponent(opened).includes("深度学习 医学影像"), opened);
  await popup.close();
  await p.goto(`${BASE}/search/`);
  check("/search/ also has the external search", (await p.getByRole("tablist", { name: "检索类型" }).count()) === 1);

  // ── counters and downloads ──
  await p.goto(`${BASE}/skills/paper-reviewer-simulator/`);
  await p.reload();
  let c = await counts("paper-reviewer-simulator");
  check("a view is counted once per visitor per day", c.view_count === 1, JSON.stringify(c));
  const head = await p.textContent("main header");
  check("the page shows the counts", /浏览 1/.test(head) && /下载 0/.test(head), head?.slice(0, 120));
  const [dl] = await Promise.all([p.waitForEvent("download"), p.getByRole("link", { name: "下载 Skill（ZIP）" }).click()]);
  const zipPath = await dl.path();
  const files = Object.keys(unzipSync(fs.readFileSync(zipPath)));
  check("skill ZIP holds <name>/SKILL.md", files.includes("paper-reviewer-simulator/SKILL.md"), files.join(","));
  c = await counts("paper-reviewer-simulator");
  check("the download was counted", c.download_count === 1);
  const install = await p.locator("section", { has: p.getByRole("heading", { name: "安装到你的工具" }) }).textContent();
  check("install guide: verified tools with paths, commands and sources", /Claude Code.*已核实/.test(install) && install.includes("~/.claude/skills/paper-reviewer-simulator/SKILL.md") && install.includes("~/.agents/skills") && install.includes("/api/download/skills/paper-reviewer-simulator/") && install.includes("依据"));
  check("old compatibility table is gone", (await p.getByRole("heading", { name: "兼容工具" }).count()) === 0);
  const nextLink = p.locator("section", { has: p.getByRole("heading", { name: "继续浏览" }) }).getByText("下一篇");
  check("continue browsing: next article and related resources", (await nextLink.count()) === 1 && (await p.getByRole("heading", { name: "相关资源" }).count()) >= 1);

  const modZip = await fetch(`${BASE}/api/download/modules/stat-tests-py/`, { headers: { "User-Agent": UA } });
  check("free module ZIP downloads", modZip.status === 200 && modZip.headers.get("content-type") === "application/zip");
  await q("UPDATE resources SET required_tier = 'EI' WHERE slug = 'bootstrap-ci-py'");
  await q("NOTIFY content_changed");
  await new Promise((r) => setTimeout(r, 800));
  const locked = await fetch(`${BASE}/api/download/modules/bootstrap-ci-py/`, { headers: { "User-Agent": UA } });
  check("members-only module ZIP refused to anonymous visitors (403), not counted", locked.status === 403 && (await counts("bootstrap-ci-py")).download_count === 0);
  await q("UPDATE resources SET required_tier = 'FREE' WHERE slug = 'bootstrap-ci-py'");
  await q("NOTIFY content_changed");
  const prompt404 = await fetch(`${BASE}/api/download/prompts/abstract-polish/`);
  check("prompts have no ZIP", prompt404.status === 404);

  // ── changelog, navigation ──
  await p.goto(`${BASE}/changelog/`);
  check("changelog page", (await p.getByRole("heading", { level: 1 }).textContent()).includes("更新日志") && (await p.locator("ol > li").count()) >= 4);
  await p.goto(`${BASE}/directory/`);
  const cards = p.locator("main ul a[href^='/directory/']");
  check("navigation shows icon cards", (await cards.count()) === (await q("SELECT count(*)::int n FROM resources WHERE type='SITE' AND status='PUBLISHED'"))[0].n);
  await Promise.all([p.waitForURL(/\/directory\/[a-z0-9-]+\/$/), cards.first().click()]);
  check("clicking a card opens its detail page with a visit button", (await p.getByRole("link", { name: /打开 / }).count()) === 1);

  // ── daily announcement ──
  await q("INSERT INTO announcements (title, body_md, is_active) VALUES ('系统维护通知', '今晚 **22:00** 维护，<script>alert(1)</script>', true)");
  await new Promise((r) => setTimeout(r, 61_000)); // the layout caches the announcement for a minute
  const a = await browser.newContext({ viewport: { width: 1280, height: 900 }, userAgent: UA });
  const ap = await a.newPage();
  await ap.goto(`${BASE}/`);
  const dialog = ap.getByRole("dialog", { name: "系统维护通知" });
  await dialog.waitFor({ timeout: 5000 }).catch(() => {});
  check("announcement shows on the first visit of the day", await dialog.isVisible());
  check("announcement Markdown rendered, HTML escaped", (await dialog.locator("strong").textContent()) === "22:00" && (await dialog.innerHTML()).includes("&lt;script&gt;"));
  await dialog.getByRole("button", { name: /今天不再显示/ }).click();
  await ap.goto(`${BASE}/prompts/`);
  check("not shown again the same day", !(await ap.getByRole("dialog").isVisible()));
  await a.close();

  // ── registration without extra steps ──
  const r = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: UA });
  const rp = await r.newPage();
  await rp.goto(`${BASE}/register/`);
  // a new browser is a first visit of the day: dismiss the announcement first
  const ann = rp.getByRole("dialog");
  if (await ann.waitFor({ timeout: 3000 }).then(() => true, () => false)) await ann.getByRole("button", { name: /今天不再显示/ }).click();
  await rp.getByLabel("邮箱").fill("v23-user@example.com");
  await rp.getByLabel("密码", { exact: true }).fill("Kq7#mVt2");
  await rp.getByLabel("确认密码").fill("Kq7#mVt2");
  await rp.locator("input[name=consent]").check();
  await Promise.all([rp.waitForURL(/\/account\//), rp.getByRole("button", { name: /注册/ }).click()]);
  const acct = await rp.textContent("main");
  check("8-character password accepted; signed in right away", rp.url().includes("/account/") && acct.includes("注册成功"));
  check("regular users see no two-step verification", !acct.includes("两步验证"));
  check("no horizontal overflow at 390px (signed in)", await rp.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth));
  for (const u of ["/", "/directory/", "/changelog/", "/skills/paper-reviewer-simulator/"]) {
    await rp.goto(`${BASE}${u}`);
    check(`no horizontal overflow at 390px: ${u}`, await rp.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth));
  }
  if (SHOTS) await rp.goto(`${BASE}/`).then(() => rp.screenshot({ path: path.join(SHOTS, "v23-home-mobile.png"), fullPage: true }));
  await r.close();

  // ── bulk API ──
  const token = `rhk_${randomBytes(32).toString("base64url")}`;
  const [admin] = await q("SELECT id FROM users WHERE email = $1", [process.env.ADMIN_EMAIL]);
  await q("INSERT INTO api_tokens (user_id, name, token_hash, prefix, scopes) VALUES ($1, 'e2e', $2, $3, '{bulk}')", [admin.id, createHash("sha256").update(token).digest(), token.slice(0, 10)]);
  const zip = zipSync({
    "modules/v23-api-mod/main.py": strToU8("def run():\n    return 1\n"),
    "modules/v23-api-mod/README.md": strToU8("# API 上传的模块\n\n通过批量接口上传的测试模块，用来验证接口的检查与保存流程是否正常工作。\n"),
    "清单.csv": strToU8("﻿类型,文件夹,分类\r\n模块,v23-api-mod,测试\r\n"),
  });
  const post = (qs, auth = `Bearer ${token}`) => fetch(`${BASE}/api/admin/bulk/${qs}`, { method: "POST", headers: { Authorization: auth, "Content-Type": "application/zip" }, body: zip });
  check("bulk API rejects a missing/invalid token (401)", (await post("", "Bearer rhk_wrongwrongwrongwrongwrong")).status === 401);
  const dry = await post("");
  const dryBody = await dry.json();
  check("bulk API check-only: plan returned, nothing saved", dry.status === 200 && dryBody.entries?.[0]?.action === "create" && !(await q("SELECT 1 FROM resources WHERE slug = 'v23-api-mod'")).length, JSON.stringify(dryBody).slice(0, 200));
  const applied = await post("?apply=1");
  const appliedBody = await applied.json();
  const [row] = await q("SELECT status, origin FROM resources WHERE slug = 'v23-api-mod'");
  check("bulk API apply=1 creates a draft", applied.status === 200 && appliedBody.results?.[0]?.outcome === "created" && row?.status === "DRAFT");
  const bad = await fetch(`${BASE}/api/admin/bulk/`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/zip" }, body: "not a zip" });
  check("bulk API rejects a non-ZIP body (400)", bad.status === 400);
  check("the site itself never contacted a third-party host", external.every((u) => u.startsWith("https://s.wanfangdata.com.cn/")), external.join(" "));
  await ctx.close();
} finally {
  await browser.close();
  await q("DELETE FROM resources WHERE slug = 'v23-api-mod'");
  await q("DELETE FROM announcements");
  await q("DELETE FROM api_tokens");
  await q("DELETE FROM users WHERE email LIKE 'v23-%@example.com'");
  await db.query("NOTIFY content_changed");
  await db.end();
}

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
