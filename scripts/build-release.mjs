#!/usr/bin/env node
// Build a deployable release tarball. Plain Node (no bash/PowerShell features), so it runs the
// same on the Windows development machine, in CI and in Linux containers.
//
//   node scripts/build-release.mjs [--skip-build] [--out dist]
//
// Produces dist/rh-<timestamp>-<gitsha>.tar.gz containing:
//   app/          Next.js standalone server (server.js, traced node_modules, .next/static)
//   scripts/      migrate.mjs, import-content.mjs, create-admin.mjs, bulk-import.mjs (single-file esbuild bundles)
//   drizzle/      SQL migrations
//   content/      the file-format content (imported on every deploy; idempotent)
//   infra/        compose.yaml, Caddyfile(s), remote/*.sh
//   RELEASE.json  id, git sha, build time, node version
//
// The release has no native dependencies (sharp is pruned; images are unoptimised), so a build
// made on Windows runs unchanged on the Linux server. Never run this on the 3.7 GB server.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const skipBuild = args.includes("--skip-build");
const outDir = path.resolve(root, args[args.indexOf("--out") + 1] && args.includes("--out") ? args[args.indexOf("--out") + 1] : "dist");
const isWin = process.platform === "win32";

const run = (cmd, cmdArgs, opts = {}) =>
  execFileSync(isWin && !cmd.endsWith(".exe") ? `${cmd}.cmd` : cmd, cmdArgs, { cwd: root, stdio: "inherit", shell: isWin, ...opts });
const capture = (cmd, cmdArgs) => {
  try {
    return execFileSync(cmd, cmdArgs, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};

const sha = capture("git", ["rev-parse", "--short=10", "HEAD"]) || "nogit";
const dirty = capture("git", ["status", "--porcelain"]) ? "-dirty" : "";
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
const id = `rh-${stamp}-${sha}${dirty}`;
const stage = path.join(outDir, id);

console.log(`==> release ${id}`);
if (!skipBuild) {
  console.log("==> typecheck");
  run("npx", ["tsc", "--noEmit"]);
  console.log("==> next build");
  run("npx", ["next", "build"]);
}

const standalone = path.join(root, ".next", "standalone");
if (!fs.existsSync(path.join(standalone, "server.js"))) {
  throw new Error(".next/standalone/server.js missing: run without --skip-build");
}

fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
/**
 * Recursive copy that MATERIALISES symlinks (copies what they point to). fs.cpSync keeps nested
 * symlinks and rewrites relative ones to absolute build-machine paths, which do not exist on the
 * server (Turbopack's standalone output links .next/node_modules/<pkg>-<hash> -> node_modules/<pkg>).
 * A release must contain no links at all, also because Windows tar handles them poorly.
 */
function copy(from, to) {
  const st = fs.statSync(from); // follows links
  if (st.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const name of fs.readdirSync(from)) copy(path.join(from, name), path.join(to, name));
  } else {
    fs.copyFileSync(from, to);
  }
}

console.log("==> assemble app/");
copy(standalone, path.join(stage, "app"));
// standalone bundles a copy of content/ only because lib/content-files.ts is traced; the release
// carries content/ once, at the top level.
fs.rmSync(path.join(stage, "app", "content"), { recursive: true, force: true });
copy(path.join(root, ".next", "static"), path.join(stage, "app", ".next", "static"));
if (fs.existsSync(path.join(root, "public"))) copy(path.join(root, "public"), path.join(stage, "app", "public"));
// Prune platform-specific image binaries: images.unoptimized means sharp is never loaded.
for (const p of ["node_modules/sharp", "node_modules/@img"]) {
  fs.rmSync(path.join(stage, "app", p), { recursive: true, force: true });
}
// Next 16.4 tracing gap: with instrumentation.ts, the Turbopack server runtime loads the
// app-route runtime at start-up but standalone output does not include it. On the build machine
// Node silently finds it in the project's own node_modules one directory up; on the server the
// app would fail to start. Copy it explicitly (the self-test below catches any further gaps).
for (const rel of ["node_modules/next/dist/compiled/next-server/app-route-turbo.runtime.prod.js"]) {
  const dest = path.join(stage, "app", rel);
  if (!fs.existsSync(dest)) copy(path.join(root, rel), dest);
}
// Next writes its data cache here; compose mounts a tmpfs on it (the release is read-only).
fs.mkdirSync(path.join(stage, "app", ".next", "cache"), { recursive: true });
const natives = [];
const findNatives = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) findNatives(p);
    else if (e.name.endsWith(".node")) natives.push(path.relative(stage, p));
  }
};
findNatives(path.join(stage, "app"));
if (natives.length) throw new Error(`native binaries in release (not portable): ${natives.join(", ")}`);
const links = [];
const findLinks = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) links.push(path.relative(stage, p));
    else if (e.isDirectory()) findLinks(p);
  }
};
findLinks(stage);
if (links.length) throw new Error(`symlinks in release: ${links.join(", ")}`);
// Only the runtime belongs in app/: a file-tracing regression once copied the whole project
// (sources, docs, old release tarballs) into the standalone output.
const ALLOWED_APP_ENTRIES = new Set([".next", "node_modules", "package.json", "server.js"]);
const unexpected = fs.readdirSync(path.join(stage, "app")).filter((e) => !ALLOWED_APP_ENTRIES.has(e));
if (unexpected.length) throw new Error(`unexpected entries in app/ (check outputFileTracingExcludes): ${unexpected.join(", ")}`);
// Secrets never ship: production configuration lives only in /opt/research-hub/.env on the server.
const envFiles = [];
const findEnv = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && e.name !== "node_modules") findEnv(p);
    else if (/^\.env/.test(e.name) && e.name !== ".env.example") envFiles.push(path.relative(stage, p));
  }
};
findEnv(path.join(stage, "app"));
if (envFiles.length) throw new Error(`refusing to ship env files: ${envFiles.join(", ")}`);

// Self-test: boot the assembled app from a directory OUTSIDE the project, where Node cannot
// fall back to the project's node_modules, and fail on any missing module.
console.log("==> self-test (boot outside the project)");
await selfTest(path.join(stage, "app"));

console.log("==> bundle scripts/");
const esbuild = await import("esbuild");
for (const name of ["migrate", "import-content", "create-admin", "bulk-import", "fetch-site-icons"]) {
  await esbuild.build({
    entryPoints: [path.join(root, "scripts", `${name}.ts`)],
    outfile: path.join(stage, "scripts", `${name}.mjs`),
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    // pg-native is an optional peer of pg that we do not use
    external: ["pg-native"],
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
    logLevel: "warning",
  });
}

console.log("==> migrations, content, infra");
copy(path.join(root, "drizzle"), path.join(stage, "drizzle"));
copy(path.join(root, "content"), path.join(stage, "content"));
copy(path.join(root, "infra"), path.join(stage, "infra"));
fs.rmSync(path.join(stage, "infra", ".env.local"), { force: true });
for (const f of fs.readdirSync(path.join(stage, "infra"))) {
  if (f.startsWith(".env")) throw new Error(`refusing to ship ${f} inside a release`);
}

fs.writeFileSync(
  path.join(stage, "RELEASE.json"),
  JSON.stringify({ id, gitSha: sha, dirty: !!dirty, builtAt: new Date().toISOString(), builtWithNode: process.version }, null, 2),
);

console.log("==> tar");
const tarball = path.join(outDir, `${id}.tar.gz`);
// bsdtar ships with Windows 10+; GNU tar on Linux. Both accept these flags.
execFileSync("tar", ["-czf", tarball, "-C", stage, "."], { stdio: "inherit" });
fs.rmSync(stage, { recursive: true, force: true });
const mb = (fs.statSync(tarball).size / 1024 / 1024).toFixed(1);
console.log(`==> ${tarball} (${mb} MB)`);
if (Number(mb) > 15) {
  fs.rmSync(tarball, { force: true });
  throw new Error(`release is ${mb} MB (budget 15 MB): something unexpected was packaged`);
}
fs.writeFileSync(path.join(outDir, "LATEST"), `${id}\n`);

async function selfTest(appDir) {
  const os = await import("node:os");
  const net = await import("node:net");
  const { spawn } = await import("node:child_process");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rh-selftest-"));
  try {
    copy(appDir, path.join(dir, "app"));
    const port = await new Promise((resolve) => {
      const srv = net.createServer().listen(0, "127.0.0.1", () => {
        const p = srv.address().port;
        srv.close(() => resolve(p));
      });
    });
    let out = "";
    const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, NODE_ENV: "production", PORT: String(port), HOSTNAME: "127.0.0.1", SITE_URL: "http://127.0.0.1", NEXT_TELEMETRY_DISABLED: "1" };
    const child = spawn(process.execPath, ["server.js"], { cwd: path.join(dir, "app"), env, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    let status = 0;
    for (let i = 0; i < 60 && !status; i++) {
      await new Promise((r) => setTimeout(r, 250));
      status = await fetch(`http://127.0.0.1:${port}/robots.txt`).then((r) => r.status, () => 0);
    }
    await new Promise((r) => setTimeout(r, 1000)); // let start-up hooks (instrumentation) finish
    child.kill();
    const missing = /Cannot find module|Failed to load external module|ERR_MODULE_NOT_FOUND/.test(out);
    if (!status || missing) {
      throw new Error(`release self-test failed (HTTP ${status || "no answer"}):\n${out.split("\n").slice(0, 15).join("\n")}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
