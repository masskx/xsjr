#!/usr/bin/env node
// Serve a Next static export like the production Caddyfile does:
// try_files {path} {path}.html {path}/index.html, then 404.html with status 404.
//   node static-serve.mjs <outDir> [port]
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, normalize, extname } from "node:path";
const [root, port = "8099"] = process.argv.slice(2);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml", ".ico": "image/x-icon", ".json": "application/json", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
const isFile = async (p) => (await stat(p).catch(() => null))?.isFile();
createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  for (const c of [path, `${path}.html`, join(path, "index.html")]) {
    const f = join(root, c);
    if (await isFile(f)) { res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }); return res.end(await readFile(f)); }
  }
  res.writeHead(404, { "content-type": types[".html"] }); res.end(await readFile(join(root, "404.html")));
}).listen(Number(port), "127.0.0.1", () => console.log(`serving ${root} on http://127.0.0.1:${port}`));
