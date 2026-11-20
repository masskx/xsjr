// Source URL handling for ingestion: parsing admin input and the normalised form used as the
// dedup key (resources.source_url_norm, ingestion_items.source_url_norm).
//
// Normalisation is deliberately conservative: two URLs that normalise equally must be the same
// document. Lower-case scheme and host, drop the default port, the fragment, tracking parameters
// and a trailing slash, sort the remaining query. http and https are treated as the same source.
// GitHub "blob"/"tree" URLs and their raw.githubusercontent.com twins map to one key.

const TRACKING = /^(utm_[a-z]+|spm|from|ref|ref_src|source|fbclid|gclid|share_source|share_medium|si)$/i;

export function parseHttpUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.username || u.password) return null; // never send credentials anywhere
  if (!u.hostname) return null;
  return u;
}

export function normalizeSourceUrl(raw: string): string | null {
  const u = parseHttpUrl(raw);
  if (!u) return null;
  let host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (host.startsWith("www.")) host = host.slice(4);
  let path = u.pathname.replace(/\/{2,}/g, "/");
  // raw.githubusercontent.com/o/r/<ref>/path  ->  github.com/o/r/blob/<ref>/path
  if (host === "raw.githubusercontent.com") {
    const m = path.match(/^\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/);
    if (m) {
      host = "github.com";
      path = `/${m[1]}/${m[2]}/blob/${m[3]}/${m[4]}`;
    }
  }
  if (host === "github.com") {
    // owner and repo names are case-insensitive on GitHub; paths inside the repo are not
    const parts = path.split("/");
    if (parts[1]) parts[1] = parts[1].toLowerCase();
    if (parts[2]) parts[2] = parts[2].toLowerCase().replace(/\.git$/, "");
    if (parts[3] === "tree" && parts.length <= 5) parts.splice(3); // repo root at a ref
    path = parts.join("/");
  }
  if (path.length > 1) path = path.replace(/\/+$/, "");
  if (path === "/") path = "";
  const params = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k)).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const query = params.length ? `?${new URLSearchParams(params).toString()}` : "";
  return `${host}${path}${query}`;
}

/** Split an admin's pasted list (newlines, spaces or commas) into unique valid URLs. */
export function parseUrlList(text: string): { urls: string[]; invalid: string[] } {
  const seen = new Set<string>();
  const urls: string[] = [];
  const invalid: string[] = [];
  for (const token of text.split(/[\s,，]+/).map((t) => t.trim()).filter(Boolean)) {
    const norm = normalizeSourceUrl(token);
    if (!norm) {
      invalid.push(token);
      continue;
    }
    if (seen.has(norm)) continue;
    seen.add(norm);
    urls.push(parseHttpUrl(token)!.toString());
  }
  return { urls, invalid };
}

/** host equals one of the domains or is a subdomain of it */
export function hostAllowed(host: string, domains: string[]): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return domains.some((d) => {
    const dd = d.toLowerCase().replace(/^\*?\./, "").replace(/\.$/, "");
    return dd !== "" && (h === dd || h.endsWith(`.${dd}`));
  });
}

export function parseDomainList(text: string): { domains: string[]; invalid: string[] } {
  const domains: string[] = [];
  const invalid: string[] = [];
  for (const token of text.split(/[\s,，]+/).map((t) => t.trim().toLowerCase()).filter(Boolean)) {
    const d = token.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^\*?\./, "");
    if (/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(d)) {
      if (!domains.includes(d)) domains.push(d);
    } else invalid.push(token);
  }
  return { domains, invalid };
}
