// Shared helpers for the parity capture/compare tools. Zero dependencies (Node >= 20).
import { createHash } from "node:crypto";

export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const cp = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  return m ? decodeEntities(m[2] ?? m[3] ?? "") : null;
};

// Normalise a URL found in HTML so that origin/build-hash differences do not count as changes.
export function normaliseHref(href, origins) {
  if (!href) return href;
  let h = href.trim();
  for (const o of [].concat(origins ?? [])) if (o && h.startsWith(o)) { h = h.slice(o.length) || "/"; break; }
  // hashed build assets differ on every build
  h = h.replace(/\/_next\/static\/[^"'\s?#]+/, "/_next/static/<asset>");
  return h;
}

/**
 * Reduce an HTML document to what a visitor or a crawler actually gets:
 * head metadata, heading outline, links, code blocks, and visible text.
 * Scripts (including the inlined RSC payload), styles and build hashes are excluded.
 */
export function extract(html, origin) {
  const head = (html.match(/<head[^>]*>([\s\S]*?)<\/head>/i) || [, ""])[1];
  const meta = {};
  const t = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  meta.title = t ? decodeEntities(t[1]).trim() : null;
  meta.lang = attr(html.match(/<html[^>]*>/i)?.[0] ?? "", "lang");
  for (const tag of head.match(/<meta\b[^>]*>/gi) || []) {
    const key = attr(tag, "name") || attr(tag, "property");
    if (key && !/^next-|^generator$/i.test(key)) meta[`meta:${key}`] = attr(tag, "content");
  }
  for (const tag of head.match(/<link\b[^>]*>/gi) || []) {
    const rel = (attr(tag, "rel") || "").toLowerCase();
    if (["canonical", "alternate", "icon", "manifest"].includes(rel)) {
      meta[`link:${rel}`] = normaliseHref(attr(tag, "href"), origin);
    }
  }

  let body = (html.match(/<body[^>]*>([\s\S]*)<\/body>/i) || [, html])[1];
  body = body
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, "");

  const headings = [...body.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map(
    (m) => `h${m[1]} ${clean(m[2])}`,
  );
  const links = [...body.matchAll(/<a\b[^>]*>/gi)]
    .map((m) => normaliseHref(attr(m[0], "href"), origin))
    .filter(Boolean);
  const code = [...body.matchAll(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi)].map((m) =>
    decodeEntities(m[1].replace(/<[^>]+>/g, "")),
  );
  const text = clean(body.replace(/<\/(p|div|li|h[1-6]|tr|pre|section|article|br)>/gi, "\n$&"));

  return { meta, headings, links, codeSha256: code.map((c) => sha256(c)), codeChars: code.reduce((n, c) => n + c.length, 0), text };
}

function clean(fragment) {
  return decodeEntities(fragment.replace(/<[^>]+>/g, " "))
    .split("\n")
    .map((l) => l.replace(/[ \t\r\f\v ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export async function get(url, { timeoutMs = 20000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = performance.now();
  try {
    const res = await fetch(url, { redirect: "manual", signal: ctrl.signal, headers: { "user-agent": "rh-parity/1" } });
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      status: res.status,
      location: res.headers.get("location"),
      contentType: res.headers.get("content-type"),
      cacheControl: res.headers.get("cache-control"),
      ms: Math.round(performance.now() - t0),
      body: buf,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function slugFile(path) {
  const p = path.replace(/^\/+|\/+$/g, "");
  return (p === "" ? "index" : p.replace(/[^a-zA-Z0-9._-]+/g, "__")) ;
}
