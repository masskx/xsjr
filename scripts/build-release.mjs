#!/usr/bin/env node
// Build a deployable release tarball. Plain Node (no bash/PowerShell features), so it runs the
// same on the Windows development machine, in CI and in Linux containers.
//
//   node scripts/build-release.mjs [--skip-build] [--out dist]
//
// Produces dist/rh-<timestamp>-<gitsha>.tar.gz containing:
//   app/          Next.js standalone server (server.js, traced node_modules, .next/static)
//   scripts/      migrate.mjs, import-content.mjs (single-file esbuild bundles)
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

console.log("==> bundle scripts/");
const esbuild = await import("esbuild");
for (const name of ["migrate", "import-content"]) {
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
fs.writeFileSync(path.join(outDir, "LATEST"), `${id}\n`);
