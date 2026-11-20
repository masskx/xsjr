// Query mode: turn a search query into candidate URLs. DeepSeek's API cannot search the web, so
// this sits behind a small provider interface. One provider is implemented:
//
//   bocha — 博查 Web Search API (reachable from mainland China). Set SEARCH_PROVIDER=bocha and
//           BOCHA_API_KEY. Request: POST {base}/v1/web-search {query, count, summary:false},
//           Bearer auth; results are read from data.webPages.value[] {url, name, snippet}.
//
// Results are always filtered to the admin's allowed domains before anything is fetched.
import { hostAllowed, parseHttpUrl } from "./url";

export interface SearchHit {
  url: string;
  title: string;
}

export interface SearchProvider {
  name: string;
  search(query: string, limit: number): Promise<SearchHit[]>;
}

export class SearchError extends Error {
  constructor(message: string, readonly permanent: boolean) {
    super(message);
  }
}

function bocha(key: string, base: string, fetchImpl: typeof fetch): SearchProvider {
  return {
    name: "bocha",
    async search(query, limit) {
      let res: Response;
      try {
        res = await fetchImpl(`${base}/v1/web-search`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({ query, count: Math.min(Math.max(limit, 1), 50), summary: false, freshness: "noLimit" }),
          signal: AbortSignal.timeout(15_000),
        });
      } catch (e) {
        throw new SearchError(`搜索服务请求失败：${(e as Error).message}`, false);
      }
      if (!res.ok) throw new SearchError(`搜索服务返回 HTTP ${res.status}`, [400, 401, 402, 403].includes(res.status));
      const body = (await res.json().catch(() => null)) as { data?: { webPages?: { value?: { url?: unknown; name?: unknown }[] } } } | null;
      const value = body?.data?.webPages?.value;
      if (!Array.isArray(value)) throw new SearchError("搜索服务返回的格式无法识别", false);
      return value
        .filter((v) => typeof v.url === "string")
        .map((v) => ({ url: v.url as string, title: typeof v.name === "string" ? v.name : "" }));
    },
  };
}

export function searchProvider(fetchImpl: typeof fetch = fetch): SearchProvider | null {
  const name = process.env.SEARCH_PROVIDER?.trim().toLowerCase();
  if (name === "bocha") {
    const key = process.env.BOCHA_API_KEY?.trim();
    if (!key) return null;
    return bocha(key, (process.env.BOCHA_BASE_URL?.trim() || "https://api.bochaai.com").replace(/\/$/, ""), fetchImpl);
  }
  return null;
}

/** Search, keep only http(s) URLs on the allowed domains, unique, at most `limit`. */
export async function searchCandidates(provider: SearchProvider, query: string, domains: string[], limit: number): Promise<SearchHit[]> {
  // ask for more than needed: results outside the allowed domains are dropped
  const hits = await provider.search(query, Math.min(limit * 3, 50));
  const out: SearchHit[] = [];
  const seen = new Set<string>();
  for (const h of hits) {
    const u = parseHttpUrl(h.url);
    if (!u || !hostAllowed(u.hostname, domains) || seen.has(u.toString())) continue;
    seen.add(u.toString());
    out.push({ url: u.toString(), title: h.title });
    if (out.length >= limit) break;
  }
  return out;
}
