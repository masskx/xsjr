// Outbound fetching for ingestion. Every URL here comes from an admin or a search result, so it is
// treated as hostile (SSRF):
//
// - only http(s), no credentials in the URL, no cookies or auth headers ever sent;
// - the host is resolved ONCE, every address must be public unicast (private, loopback,
//   link-local incl. the Tencent Cloud metadata range 169.254.0.0/16, CGNAT, ULA, multicast,
//   documentation ranges and IPv4-mapped/NAT64 forms of them are refused), and the connection
//   is made to that validated address (no second DNS lookup, so no DNS-rebinding window);
// - redirects are followed by hand, at most 2, and every hop is checked again (scheme, address
//   and robots.txt);
// - 10 s overall deadline, 2 MB cap on the decoded body (gzip/deflate/br bombs included).
//
// Uses node:http(s) directly: no proxy support is needed on the server, and the custom `lookup`
// is what pins the connection to the validated address.
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";
import type { Readable } from "node:stream";
import robotsParser from "robots-parser";
import { parseHttpUrl } from "./url";

export const USER_AGENT_TOKEN = "ResearchHubBot";
export const FETCH_LIMITS = { timeoutMs: 10_000, maxBytes: 2 * 1024 * 1024, maxRedirects: 2 };

export class FetchError extends Error {
  /** permanent: retrying will not help (blocked, 4xx, too large); otherwise transient */
  constructor(message: string, readonly permanent: boolean, readonly httpStatus?: number) {
    super(message);
  }
}

// ── address policy ──

const blocked = new net.BlockList();
for (const [addr, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(addr, prefix, "ipv4");
for (const [addr, prefix] of [
  ["::", 128], ["::1", 128], ["100::", 64], ["2001::", 23], ["2001:db8::", 32], ["fc00::", 7],
  ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
] as const) blocked.addSubnet(addr, prefix, "ipv6");

/** The IPv4 address embedded in an IPv4-mapped, IPv4-compatible, NAT64 or 6to4 IPv6 address. */
function embeddedV4(ip6: string): string | null {
  const full = expandV6(ip6);
  if (!full) return null;
  const words = full.split(":").map((w) => parseInt(w, 16));
  const v4 = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  const zeros = (n: number) => words.slice(0, n).every((w) => w === 0);
  if (zeros(5) && words[5] === 0xffff) return v4(words[6], words[7]); // ::ffff:a.b.c.d
  if (zeros(6)) return v4(words[6], words[7]); // ::a.b.c.d (deprecated)
  if (words[0] === 0x64 && words[1] === 0xff9b && words.slice(2, 6).every((w) => w === 0)) return v4(words[6], words[7]); // 64:ff9b::/96
  if (words[0] === 0x2002) return v4(words[1], words[2]); // 6to4
  return null;
}

function expandV6(ip: string): string | null {
  let s = ip.toLowerCase();
  const m = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (m) {
    const o = m[2].split(".").map(Number);
    s = `${m[1]}${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  const words = [...head, ...Array(fill).fill("0"), ...tail];
  return words.length === 8 ? words.map((w) => w.padStart(4, "0")).join(":") : null;
}

export function isPublicAddress(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return !blocked.check(ip, "ipv4");
  if (family === 6) {
    const v4 = embeddedV4(ip);
    if (v4) return isPublicAddress(v4);
    if (blocked.check(ip, "ipv6")) return false;
    return /^[23]/.test(expandV6(ip) ?? ""); // global unicast is 2000::/3
  }
  return false;
}

/** Test-only escape hatch: hosts whose addresses are not checked (e2e fixtures on 127.0.0.1).
 *  Never set in production; the worker logs a warning at start when it is. */
export function testAllowedHosts(): string[] {
  return (process.env.INGEST_TEST_ALLOW_PRIVATE_HOSTS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

type Resolver = (host: string) => Promise<{ address: string; family: number }[]>;
const systemResolver: Resolver = (host) => dns.promises.lookup(host, { all: true, verbatim: true });

export async function resolvePublic(hostname: string, resolve: Resolver = systemResolver): Promise<{ address: string; family: number }> {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const exempt = testAllowedHosts().includes(host);
  let addrs: { address: string; family: number }[];
  if (net.isIP(host)) addrs = [{ address: host, family: net.isIP(host) }];
  else {
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
      if (!exempt) throw new FetchError(`拒绝访问内网地址（${host}）`, true);
    }
    try {
      addrs = await resolve(host);
    } catch {
      throw new FetchError(`域名解析失败（${host}）`, false);
    }
  }
  if (!addrs.length) throw new FetchError(`域名解析失败（${host}）`, false);
  if (!exempt) {
    const bad = addrs.find((a) => !isPublicAddress(a.address));
    if (bad) throw new FetchError(`拒绝访问内网或保留地址（${host} → ${bad.address}）`, true);
  }
  return addrs[0];
}

// ── HTTP ──

export interface FetchResult {
  url: string;
  status: number;
  contentType: string;
  body: Buffer;
  text: string;
  /** every URL visited, the final one last */
  hops: string[];
}

export interface FetchOptions {
  accept?: string;
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  /** check robots.txt on every hop (default true) */
  robots?: boolean;
  resolve?: Resolver;
  /** 404 etc. are returned instead of thrown (used for optional files) */
  allowStatus?: (status: number) => boolean;
}

function userAgent(): string {
  const site = process.env.SITE_URL?.replace(/\/$/, "");
  return `Mozilla/5.0 (compatible; ${USER_AGENT_TOKEN}/1.0${site ? `; +${site}/about/` : ""})`;
}

function requestOnce(url: URL, pinned: { address: string; family: number }, opts: Required<Pick<FetchOptions, "accept" | "maxBytes">>, signal: AbortSignal): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      url,
      {
        method: "GET",
        signal,
        headers: { "User-Agent": userAgent(), Accept: opts.accept, "Accept-Encoding": "gzip, deflate, br", "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8" },
        // connect to the address we validated, whatever DNS says now
        lookup: (_host, options, cb) => {
          if ((options as { all?: boolean }).all) (cb as unknown as (e: null, a: { address: string; family: number }[]) => void)(null, [pinned]);
          else cb(null, pinned.address, pinned.family);
        },
        agent: false,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          resolve({ status, headers: res.headers, body: Buffer.alloc(0) });
          return;
        }
        const declared = Number(res.headers["content-length"] ?? 0);
        if (declared > opts.maxBytes) {
          res.destroy();
          reject(new FetchError(`响应超过 ${Math.round(opts.maxBytes / 1024 / 1024)} MB 上限`, true, status));
          return;
        }
        let stream: Readable = res;
        const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
        if (enc === "gzip" || enc === "x-gzip") stream = res.pipe(zlib.createGunzip());
        else if (enc === "deflate") stream = res.pipe(zlib.createInflate());
        else if (enc === "br") stream = res.pipe(zlib.createBrotliDecompress());
        const chunks: Buffer[] = [];
        let size = 0;
        stream.on("data", (c: Buffer) => {
          size += c.length;
          if (size > opts.maxBytes) {
            res.destroy();
            stream.destroy();
            reject(new FetchError(`响应超过 ${Math.round(opts.maxBytes / 1024 / 1024)} MB 上限`, true, status));
            return;
          }
          chunks.push(c);
        });
        stream.on("end", () => resolve({ status, headers: res.headers, body: Buffer.concat(chunks) }));
        stream.on("error", (e) => reject(new FetchError(`读取响应失败：${e.message}`, false, status)));
      },
    );
    req.on("error", (e) => {
      if (signal.aborted) reject(new FetchError("请求超时", false));
      else reject(e instanceof FetchError ? e : new FetchError(`连接失败：${(e as NodeJS.ErrnoException).code ?? e.message}`, false));
    });
    req.end();
  });
}

function decode(body: Buffer, contentType: string): string {
  let charset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
  if (!charset && /html/i.test(contentType)) {
    charset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(body.subarray(0, 4096).toString("latin1"))?.[1];
  }
  try {
    return new TextDecoder((charset ?? "utf-8").toLowerCase()).decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}

export async function safeFetch(raw: string, options: FetchOptions = {}): Promise<FetchResult> {
  const opts = {
    accept: options.accept ?? "text/html,application/xhtml+xml,text/markdown,text/plain;q=0.9,*/*;q=0.5",
    maxBytes: options.maxBytes ?? FETCH_LIMITS.maxBytes,
    timeoutMs: options.timeoutMs ?? FETCH_LIMITS.timeoutMs,
    maxRedirects: options.maxRedirects ?? FETCH_LIMITS.maxRedirects,
    robots: options.robots ?? true,
  };
  const signal = AbortSignal.timeout(opts.timeoutMs);
  const hops: string[] = [];
  let url = parseHttpUrl(raw);
  if (!url) throw new FetchError("不是有效的 http(s) 网址", true);
  for (let hop = 0; ; hop++) {
    hops.push(url.toString());
    if (opts.robots && !(await robotsAllows(url, options.resolve))) {
      throw new FetchError(`robots.txt 不允许抓取 ${url.host}${url.pathname}`, true);
    }
    const pinned = await resolvePublic(url.hostname, options.resolve);
    const res = await requestOnce(url, pinned, opts, signal);
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      if (hop >= opts.maxRedirects) throw new FetchError(`重定向次数超过 ${opts.maxRedirects} 次`, true, res.status);
      const next = parseHttpUrl(new URL(res.headers.location, url).toString());
      if (!next) throw new FetchError("重定向到了不支持的地址", true, res.status);
      url = next;
      continue;
    }
    const contentType = String(res.headers["content-type"] ?? "");
    if (res.status < 200 || res.status >= 300) {
      if (options.allowStatus?.(res.status)) return { url: url.toString(), status: res.status, contentType, body: res.body, text: "", hops };
      const permanent = res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429;
      throw new FetchError(`来源返回 HTTP ${res.status}`, permanent, res.status);
    }
    return { url: url.toString(), status: res.status, contentType, body: res.body, text: decode(res.body, contentType), hops };
  }
}

// ── robots.txt ──
// 2xx: obey; 4xx (none published): allowed; 5xx, timeout or network error: treated as
// "disallow everything" for now (the item fails as transient and is retried later).

const robotsCache = new Map<string, { at: number; robots: ReturnType<typeof robotsParser> | "allow-all" }>();
const ROBOTS_TTL = 60 * 60 * 1000;

export async function robotsAllows(url: URL, resolve?: Resolver): Promise<boolean> {
  const origin = url.origin;
  let entry = robotsCache.get(origin);
  if (!entry || Date.now() - entry.at > ROBOTS_TTL) {
    const robotsUrl = `${origin}/robots.txt`;
    let res: FetchResult;
    try {
      res = await safeFetch(robotsUrl, { robots: false, maxBytes: 512 * 1024, timeoutMs: 5000, accept: "text/plain,*/*", resolve, allowStatus: (s) => s >= 400 && s < 500 });
    } catch (e) {
      if (e instanceof FetchError && e.permanent) throw e; // e.g. the host itself is private
      throw new FetchError(`无法读取 ${origin}/robots.txt，稍后重试`, false);
    }
    entry = { at: Date.now(), robots: res.status >= 400 ? "allow-all" : robotsParser(robotsUrl, res.text) };
    robotsCache.set(origin, entry);
  }
  if (entry.robots === "allow-all") return true;
  return entry.robots.isAllowed(url.toString(), USER_AGENT_TOKEN) !== false;
}

export function clearRobotsCache() {
  robotsCache.clear();
}
