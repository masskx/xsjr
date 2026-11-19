// URL normalisation used as a deduplication key (resources.source_url_norm, ingestion).
// Two URLs that point at the same page should normalise to the same string.
const TRACKING = /^(utm_[a-z]+|spm|from|ref|ref_src|fbclid|gclid|mc_[a-z]+)$/i;

export function normaliseSourceUrl(input: string): string | null {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;

  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  let pathname = u.pathname.replace(/\/{2,}/g, "/");

  // GitHub: blob/tree views of the same file or directory share one key
  if (host === "github.com") {
    pathname = pathname.replace(/^\/([^/]+)\/([^/]+)\/(?:blob|tree)\/[^/]+\//, "/$1/$2/").toLowerCase();
  }
  pathname = pathname.replace(/\/(index\.html?)?$/i, "") || "/";

  const params = [...u.searchParams.entries()]
    .filter(([k]) => !TRACKING.test(k))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const query = params.length ? `?${new URLSearchParams(params).toString()}` : "";
  const port = u.port && !["80", "443"].includes(u.port) ? `:${u.port}` : "";

  // scheme is dropped on purpose: http and https of the same page are the same source
  return `${host}${port}${pathname === "/" ? "" : pathname}${query}`;
}
