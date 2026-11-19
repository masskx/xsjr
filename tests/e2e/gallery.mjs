#!/usr/bin/env node
// End-to-end: module gallery, structure diagrams, module/skill editors. Every admin change is
// checked on the public site. Run against a test database (it re-imports content/ with --force
// at the end to restore the edited resources).
//   BASE_URL=... DATABASE_URL=... ADMIN_EMAIL=... ADMIN_PASSWORD=... SHOTS=./shots node tests/e2e/gallery.mjs
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = (process.env.BASE_URL ?? "http://localhost:8100").replace(/\/$/, "");
const SHOTS = process.env.SHOTS;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const stamp = Date.now().toString(36);
const NEW_SLUG = `e2e-module-${stamp}`;
const SECOND_FILE = "examples/run_demo.py";
const SECOND_MARKER = `def e2e_second_file_marker_${stamp}(x)`;
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const text = async (url, headers = {}) => (await fetch(url, { headers })).text();
const shot = async (page, name, full = true) => {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: full });
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

await db.query("UPDATE users SET totp_secret_enc = NULL, totp_enabled_at = NULL, totp_last_step = NULL WHERE email = $1", [process.env.ADMIN_EMAIL]);
await db.query("DELETE FROM rate_limits");

const browser = await chromium.launch();
try {
  // ── public gallery ──
  const anon = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pg1 = await anon.newPage();
  await pg1.goto(`${BASE}/modules/`);
  check("gallery lists 3 modules", (await pg1.locator("main a[href^='/modules/'] h3").count()) === 3);
  check("cards without a diagram show a file-tree thumbnail", (await pg1.locator("main a[href^='/modules/'] [role=tree]").count()) === 3);
  await Promise.all([pg1.waitForURL(/category=/), pg1.getByRole("link", { name: /^统计方法/ }).click()]);
  check("category filter is a shareable URL and filters", (await pg1.locator("main a[href^='/modules/'] h3").count()) === 1 && pg1.url().includes("category="));
  await Promise.all([pg1.waitForURL(/tag=/), pg1.getByRole("link", { name: /^APA 报告/ }).click()]);
  check("tag filter combines with category", pg1.url().includes("category=") && pg1.url().includes("tag=") && (await pg1.locator("main a[href^='/modules/'] h3").count()) === 1);
  const noJs = await text(`${BASE}/modules/?category=${encodeURIComponent("科研绘图")}`);
  check("filtered gallery is server-rendered (no JS needed)", noJs.includes("出版级 Matplotlib 样式") && !noJs.includes("统计检验选择与执行工具包</h3>"));

  // ── admin sign-in ──
  const admin = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const ap = await admin.newPage();
  await ap.goto(`${BASE}/login/?next=%2Fadmin%2Fmodules%2F`);
  await ap.getByLabel("邮箱").fill(process.env.ADMIN_EMAIL);
  await ap.getByLabel("密码").fill(process.env.ADMIN_PASSWORD);
  await Promise.all([ap.waitForURL(/\/account\/mfa\//), ap.getByRole("button", { name: "登录" }).click()]);
  await ap.getByLabel("验证码").fill(totp(base32Decode(await ap.locator("code").textContent())));
  await Promise.all([ap.waitForURL(`${BASE}/admin/modules/`), ap.getByRole("button", { name: "启用两步验证" }).click()]);

  // ── edit a module: tasks + a second file ──
  await Promise.all([ap.waitForURL(/\/admin\/modules\/\d+\/$/), ap.locator("li", { hasText: "stat-tests-py" }).getByRole("link", { name: "编辑" }).click()]);
  const editUrl = ap.url();
  await ap.getByLabel("适用任务", { exact: true }).fill("两组独立样本的均值比较\n多组方差分析并给出效应量\n生成可直接粘贴进论文的 APA 结果句");
  await ap.getByRole("button", { name: "添加文件" }).click();
  await ap.getByLabel("文件 2 路径").fill(SECOND_FILE);
  await ap.getByLabel("文件 2 内容").fill(`${SECOND_MARKER}:\n    return x\n`);
  await ap.getByRole("button", { name: "保存（立即生效）" }).click();
  await ap.getByText("网站已更新").waitFor();
  await shot(ap, "admin-module-editor");

  const pubHtml = await text(`${BASE}/modules/stat-tests-py/`);
  check("applicable tasks appear on the public page", pubHtml.includes("适用任务") && pubHtml.includes("多组方差分析并给出效应量"));
  check("both files are served to an entitled (free) viewer", pubHtml.includes(SECOND_MARKER));
  const pp = await anon.newPage();
  await pp.goto(`${BASE}/modules/stat-tests-py/`);
  const tabs = pp.getByRole("tab");
  check("one code tab per file", (await tabs.count()) === 2);
  await tabs.first().focus();
  await pp.keyboard.press("ArrowRight");
  check("arrow keys switch tabs", (await tabs.nth(1).getAttribute("aria-selected")) === "true" && (await pp.getByRole("tabpanel").filter({ hasText: SECOND_MARKER }).isVisible()));
  check("each tab has its own copy button", (await pp.locator("[role=tabpanel] button", { hasText: "复制" }).count()) === 2);

  // ── structure diagram upload ──
  const bad = path.join(root, "tests/fixtures/not-an-image.png");
  fs.writeFileSync(bad, '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  await ap.getByLabel("图片说明（替代文字）").fill("x");
  await ap.locator("input[type=file]").setInputFiles(bad);
  await ap.getByRole("button", { name: "上传" }).click();
  await ap.getByText("只支持 PNG、JPEG、WebP").waitFor();
  check("a script disguised as .png is rejected", true);
  fs.rmSync(bad);

  await ap.getByLabel("图片说明（替代文字）").fill("统计检验工具包的模块结构");
  await ap.locator("input[type=file]").setInputFiles(path.join(root, "tests/fixtures/sample.jpg"));
  await Promise.all([ap.waitForURL(/msg=diagram/), ap.getByRole("button", { name: "上传" }).click()]);
  check("diagram uploaded", (await ap.textContent("body")).includes("结构图已更新"));
  const detail = await text(`${BASE}/modules/stat-tests-py/`);
  const src = detail.match(/<img src="(\/media\/diagrams\/[^"]+)"/)?.[1];
  check("public page shows the diagram with alt text and dimensions", !!src && detail.includes('alt="统计检验工具包的模块结构"') && detail.includes('width="40"'));
  const media = await fetch(`${BASE}${src}`);
  check("diagram is served as an image with nosniff", media.status === 200 && media.headers.get("content-type") === "image/jpeg" && media.headers.get("x-content-type-options") === "nosniff");
  const bytes = Buffer.from(await media.arrayBuffer());
  check("served image has no EXIF segment", !bytes.toString("latin1").includes("Exif\0\0"));
  check("gallery card uses the diagram as thumbnail", (await text(`${BASE}/modules/`)).includes(src));

  // ── gated module: diagram and tasks public, code (all files) withheld ──
  await db.query("UPDATE resources SET required_tier = 'EI' WHERE slug = 'stat-tests-py'");
  await db.query("NOTIFY content_changed");
  await new Promise((r) => setTimeout(r, 500));
  const gated = await text(`${BASE}/modules/stat-tests-py/`);
  const gatedRsc = await text(`${BASE}/modules/stat-tests-py/`, { RSC: "1" });
  check("members-only: diagram and tasks still public", gated.includes(src) && gated.includes("多组方差分析并给出效应量"));
  check("members-only: no file content in HTML or RSC (second file included)", !gated.includes(SECOND_MARKER) && !gatedRsc.includes(SECOND_MARKER) && gated.includes("完整代码仅对"));
  check("members-only: file names stay visible in the structure (names only)", gated.includes("stat_tests.py"));
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const mp = await mobile.newPage();
  await mp.goto(`${BASE}/modules/stat-tests-py/`);
  const ov = await mp.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth);
  check("module page with diagram: no overflow at 390px", ov);
  await shot(mp, "module-diagram-mobile", false);
  await mp.goto(`${BASE}/modules/`);
  check("gallery: no overflow at 390px", await mp.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth));
  await shot(mp, "gallery-mobile");
  await mobile.close();
  await db.query("UPDATE resources SET required_tier = 'FREE' WHERE slug = 'stat-tests-py'");

  // ── skill editor: compatibility rows ──
  await ap.goto(`${BASE}/admin/skills/`);
  await Promise.all([ap.waitForURL(/\/admin\/skills\/\d+\/$/), ap.locator("li", { hasText: "figure-quality-review" }).getByRole("link", { name: "编辑" }).click()]);
  await ap.getByRole("button", { name: "添加一行" }).click();
  const rows = await ap.getByLabel("工具标识").count();
  await ap.getByLabel("工具标识").nth(rows - 1).fill("cursor");
  await ap.getByLabel("支持范围").nth(rows - 1).fill("0.50+（e2e）");
  await ap.getByRole("button", { name: "保存（立即生效）" }).click();
  await ap.getByText("网站已更新").waitFor();
  check("skill compatibility edit is live", (await text(`${BASE}/skills/figure-quality-review/`)).includes("0.50+（e2e）"));

  // ── create and publish a new module ──
  await ap.goto(`${BASE}/admin/modules/new/`);
  await ap.getByLabel("标题", { exact: true }).fill("端到端测试模块");
  await ap.getByLabel("网址标识", { exact: true }).fill(NEW_SLUG);
  await ap.getByLabel("摘要", { exact: true }).fill("这是一个由端到端测试创建的代码模块，用于验证模块画廊与后台发布流程。");
  await ap.getByLabel("分类", { exact: true }).fill("数据分析");
  await Promise.all([ap.waitForURL(/created=1/), ap.getByRole("button", { name: "创建草稿" }).click()]);
  check("new module draft is not in the gallery", !(await text(`${BASE}/modules/`)).includes(NEW_SLUG));
  await Promise.all([ap.waitForURL(/msg=published/), ap.getByRole("button", { name: "发布" }).click()]);
  check("published module appears in the gallery", (await text(`${BASE}/modules/`)).includes(`/modules/${NEW_SLUG}/`));
  check("and has a page", (await fetch(`${BASE}/modules/${NEW_SLUG}/`)).status === 200);
  await admin.close();
  await anon.close();
} finally {
  await browser.close();
  // restore: delete what we created, drop the diagram, re-import edited resources from files
  await db.query("DELETE FROM resources WHERE slug = $1", [NEW_SLUG]);
  await db.query("UPDATE resources SET structure_media_id = NULL, required_tier = 'FREE' WHERE slug = 'stat-tests-py'");
  await db.query("DELETE FROM media");
  await db.end();
  execFileSync("npx", ["tsx", "scripts/import-content.ts", "--force"], { cwd: root, env: { ...process.env, NODE_NO_WARNINGS: "1" }, stdio: "ignore" });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
