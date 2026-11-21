// Fetch a site's own icon for the research-navigation cards. The URL comes from an admin, so the
// HTTP client is the ingestion one: public http(s) only, DNS pinned to a validated address, no
// credentials/cookies, bounded body and redirects (lib/ingest/net.ts). We read the icon links from
// the page, prefer the largest PNG/touch icon, and fall back to /favicon.ico (ICO is accepted by
// the image validator). SVG/GIF icons are skipped; manual upload remains the fallback.
import { inspectImage, type ImageInfo } from "./images";
import { safeFetch } from "../ingest/net";
import { parseHttpUrl } from "../ingest/url";

export type SiteIconResult = { ok: true; image: ImageInfo; sourceUrl: string } | { ok: false; error: string };

type Resolver = (host: string) => Promise<{ address: string; family: number }[]>;

interface Candidate {
  url: string;
  score: number;
}

const ICON_REL = /(^|\s)(icon|shortcut|apple-touch-icon|apple-touch-icon-precomposed|fluid-icon)(\s|$)/i;
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return out;
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'");
}

function sizeScore(sizes: string | undefined): number {
  if (!sizes) return 0;
  for (const token of sizes.toLowerCase().split(/\s+/)) {
    const m = /^(\d+)x(\d+)$/.exec(token);
    if (m) return Math.max(Number(m[1]), Number(m[2]));
  }
  return 0;
}

function candidateScore(rel: string, type: string, href: string, sizes: string | undefined, manifest = false): number {
  if (/svg/i.test(type) || /\.svg(?:$|\?)/i.test(href)) return -9999;
  let score = sizeScore(sizes);
  if (/apple-touch-icon|apple-touch-icon-precomposed/i.test(rel)) score += 500;
  if (manifest) score += 120;
  if (/image\/png/i.test(type) || /\.png(?:$|\?)/i.test(href)) score += 200;
  if (/image\/webp/i.test(type) || /\.webp(?:$|\?)/i.test(href)) score += 120;
  if (/image\/jpeg/i.test(type) || /\.jpe?g(?:$|\?)/i.test(href)) score += 80;
  if (/image\/(x-icon|vnd\.microsoft\.icon)/i.test(type) || /\.ico(?:$|\?)/i.test(href)) score -= 100;
  return score;
}

function addCandidate(out: Candidate[], seen: Set<string>, base: string, href: string, rel: string, type = "", sizes?: string, manifest = false) {
  const h = decodeEntities(href.trim());
  if (!h || h.startsWith("data:") || h.startsWith("javascript:")) return;
  let url: URL;
  try {
    url = new URL(h, base);
  } catch {
    return;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  const key = url.toString();
  if (seen.has(key)) return;
  const score = candidateScore(rel, type, key, sizes, manifest);
  if (score <= -9999) return;
  seen.add(key);
  out.push({ url: key, score });
}

function addManifestIcons(out: Candidate[], seen: Set<string>, base: string, body: unknown) {
  if (!body || typeof body !== "object") return;
  const icons = (body as { icons?: unknown }).icons;
  if (!Array.isArray(icons)) return;
  for (const raw of icons.slice(0, 12)) {
    if (!raw || typeof raw !== "object") continue;
    const icon = raw as { src?: unknown; sizes?: unknown; type?: unknown };
    if (typeof icon.src !== "string") continue;
    addCandidate(out, seen, base, icon.src, "icon", typeof icon.type === "string" ? icon.type : "", typeof icon.sizes === "string" ? icon.sizes : "", true);
  }
}

async function tryIcon(candidate: Candidate, resolve?: Resolver): Promise<ImageInfo | null> {
  try {
    const res = await safeFetch(candidate.url, {
      accept: "image/png,image/jpeg,image/webp,image/x-icon,image/vnd.microsoft.icon,image/*;q=0.8,*/*;q=0.2",
      maxBytes: 2 * 1024 * 1024,
      timeoutMs: 8000,
      maxRedirects: 3,
      robots: false,
      resolve,
      userAgent: BROWSER_UA,
    });
    if (!/^image\//i.test(res.contentType) && res.body.length < 8) return null;
    return inspectImage(res.body);
  } catch {
    return null;
  }
}

export async function fetchSiteIcon(rawUrl: string, resolve?: Resolver): Promise<SiteIconResult> {
  const input = parseHttpUrl(rawUrl);
  if (!input) return { ok: false, error: "请先填写有效的 http(s) 网址" };

  const out: Candidate[] = [];
  const seen = new Set<string>();
  let pageUrl = input.toString();
  let html = "";
  try {
    const page = await safeFetch(input.toString(), {
      accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
      maxBytes: 1024 * 1024,
      timeoutMs: 8000,
      maxRedirects: 3,
      robots: false,
      resolve,
      userAgent: BROWSER_UA,
    });
    pageUrl = page.url;
    if (/^image\//i.test(page.contentType)) {
      try {
        const image = inspectImage(page.body);
        return { ok: true, image, sourceUrl: page.url };
      } catch {
        return { ok: false, error: "该网址返回的图片格式不受支持" };
      }
    }
    html = page.text;
  } catch {
    // A blocked home page can still have /favicon.ico; try that below.
  }

  let manifestUrl = "";
  if (html) {
    const baseTag = /<base\b[^>]*>/i.exec(html)?.[0] ?? "";
    const baseHref = attrs(baseTag).href;
    let base = pageUrl;
    if (baseHref) {
      try {
        base = new URL(decodeEntities(baseHref), pageUrl).toString();
      } catch {
        /* keep page URL */
      }
    }
    for (const tag of html.matchAll(/<link\b[^>]*>/gi)) {
      const a = attrs(tag[0]);
      const rel = (a.rel ?? "").trim();
      if (/manifest/i.test(rel) && a.href) {
        if (!manifestUrl) {
          try {
            manifestUrl = new URL(decodeEntities(a.href), base).toString();
          } catch {
            /* ignore */
          }
        }
        continue;
      }
      if (!ICON_REL.test(rel) || !a.href) continue;
      addCandidate(out, seen, base, a.href, rel, a.type ?? "", a.sizes);
    }
    const tile = /<meta\b[^>]*>/gi;
    for (const tag of html.matchAll(tile)) {
      const a = attrs(tag[0]);
      if ((a.name ?? "").toLowerCase() === "msapplication-tileimage" && a.content) {
        addCandidate(out, seen, base, a.content, "icon");
      }
    }
    if (manifestUrl && parseHttpUrl(manifestUrl)) {
      try {
        const manifest = await safeFetch(manifestUrl, {
          accept: "application/manifest+json,application/json,text/plain;q=0.8,*/*;q=0.1",
          maxBytes: 512 * 1024,
          timeoutMs: 6000,
          maxRedirects: 2,
          robots: false,
          resolve,
          userAgent: BROWSER_UA,
        });
        addManifestIcons(out, seen, manifest.url, JSON.parse(manifest.text) as unknown);
      } catch {
        /* optional */
      }
    }
  }

  // The conventional file, then the HTML home page itself as an origin hint.
  addCandidate(out, seen, pageUrl, "/favicon.ico", "icon");

  out.sort((a, b) => b.score - a.score);
  const tried = new Set<string>();
  for (const candidate of out.slice(0, 12)) {
    tried.add(candidate.url);
    const image = await tryIcon(candidate, resolve);
    if (image) return { ok: true, image, sourceUrl: candidate.url };
  }
  // The conventional file is the last resort even when many icon links were present.
  const fallback = out.find((c) => /\/favicon\.ico(?:$|\?)/i.test(c.url));
  if (fallback && !tried.has(fallback.url)) {
    const image = await tryIcon(fallback, resolve);
    if (image) return { ok: true, image, sourceUrl: fallback.url };
  }
  return { ok: false, error: "未能自动获取图标；请手动上传 PNG/JPEG/WebP/ICO" };
}
