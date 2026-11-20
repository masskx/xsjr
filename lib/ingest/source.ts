// Fetch one source and turn it into plain text for the LLM, plus the deterministic licence
// finding and (only when the source IS a skill file) the original SKILL.md text.
//
// GitHub sources are read from raw.githubusercontent.com (the SKILL.md or README.md of the
// directory, and the nearest LICENSE file), never by scraping github.com HTML.
// Everything else: HTML through Readability (main text only), Markdown/plain text as-is.
import { createHash } from "node:crypto";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { detectFromFrontMatter, detectFromHtml, detectFromLicenseText, type LicenseFinding } from "./license";
import { FetchError, safeFetch, type FetchOptions, type FetchResult } from "./net";
import { parseHttpUrl } from "./url";

export const MAX_TEXT_CHARS = 24_000;

export interface SourceDoc {
  finalUrl: string;
  httpStatus: number;
  fetchedBytes: number;
  title: string | null;
  /** extracted text sent to the LLM (truncated to MAX_TEXT_CHARS) */
  text: string;
  /** original SKILL.md, when the source is one */
  skillMd: string | null;
  license: LicenseFinding;
  contentSha256: Buffer;
  /** author hint for the draft: GitHub owner or site host */
  author: string;
}

export type Fetcher = (url: string, opts?: FetchOptions) => Promise<FetchResult>;

const collapse = (s: string) =>
  s
    .replace(/\r/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();

const truncate = (s: string) => ([...s].length > MAX_TEXT_CHARS ? [...s].slice(0, MAX_TEXT_CHARS).join("") + "\n…（已截断）" : s);

function markdownTitle(md: string): string | null {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md);
  const name = fm && /^name:\s*["']?(.+?)["']?\s*$/im.exec(fm[1])?.[1];
  if (name) return name.slice(0, 120);
  return /^#\s+(.+)$/m.exec(md)?.[1]?.trim().slice(0, 120) ?? null;
}

export function extractHtml(html: string, url: string): { title: string | null; text: string; license: LicenseFinding | null } {
  const { document } = parseHTML(html);
  const license = detectFromHtml(document as unknown as Parameters<typeof detectFromHtml>[0]);
  for (const el of Array.from(document.querySelectorAll("script, style, noscript, template, iframe, svg"))) el.remove();
  let title: string | null = document.querySelector("title")?.textContent?.trim() || null;
  let text = "";
  try {
    // Readability needs a base URL for relative links; linkedom documents have none.
    Object.defineProperty(document, "documentURI", { value: url, configurable: true });
    Object.defineProperty(document, "baseURI", { value: url, configurable: true });
    const article = new Readability(document as unknown as Document, { charThreshold: 200 }).parse();
    if (article?.textContent) {
      text = article.textContent;
      title = article.title?.trim() || title;
    }
  } catch {
    /* fall through to the whole body */
  }
  if (!text) text = parseHTML(html).document.body?.textContent ?? "";
  return { title: title?.slice(0, 120) ?? null, text: collapse(text), license };
}

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest();

// ── GitHub ──

export interface GithubTarget {
  owner: string;
  repo: string;
  ref: string;
  /** directory inside the repo ("" = root) */
  dir: string;
  /** a specific file, when the URL named one */
  file: string | null;
}

export function parseGithub(raw: string): GithubTarget | null {
  const u = parseHttpUrl(raw);
  if (!u) return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const parts = u.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (host === "raw.githubusercontent.com" && parts.length >= 4) {
    const file = parts.slice(3).join("/");
    return { owner: parts[0], repo: parts[1], ref: parts[2], dir: file.split("/").slice(0, -1).join("/"), file };
  }
  if (host !== "github.com" || parts.length < 2) return null;
  const [owner, repo0, kind, ref, ...rest] = parts;
  const repo = repo0.replace(/\.git$/, "");
  if (!kind) return { owner, repo, ref: "HEAD", dir: "", file: null };
  if ((kind === "tree" || kind === "blob") && ref) {
    const p = rest.join("/");
    if (kind === "blob") return { owner, repo, ref, dir: p.split("/").slice(0, -1).join("/"), file: p };
    return { owner, repo, ref, dir: p, file: null };
  }
  return null; // issues, pulls, wiki ... are not skill sources
}

const RAW_BASE = () => (process.env.INGEST_GITHUB_RAW_BASE ?? "https://raw.githubusercontent.com").replace(/\/$/, "");
const rawUrl = (t: GithubTarget, path: string) => `${RAW_BASE()}/${t.owner}/${t.repo}/${t.ref}/${path.split("/").map(encodeURIComponent).join("/")}`;
const join = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);

async function firstExisting(fetcher: Fetcher, t: GithubTarget, paths: string[]): Promise<{ path: string; res: FetchResult } | null> {
  for (const path of paths) {
    const res = await fetcher(rawUrl(t, path), { accept: "text/plain,*/*", allowStatus: (s) => s === 404 });
    if (res.status === 200) return { path, res };
  }
  return null;
}

async function fetchGithub(t: GithubTarget, fetcher: Fetcher): Promise<SourceDoc> {
  const candidates = t.file ? [t.file] : [join(t.dir, "SKILL.md"), join(t.dir, "README.md")];
  const main = await firstExisting(fetcher, t, candidates);
  if (!main) throw new FetchError(`仓库中没有找到 ${candidates.join(" 或 ")}`, true, 404);
  const md = main.res.text;

  const licenseFiles = ["LICENSE", "LICENSE.txt", "LICENSE.md", "COPYING"];
  const dirs = t.dir ? [t.dir, ""] : [""];
  let license: LicenseFinding | null = null;
  for (const d of dirs) {
    const lic = await firstExisting(fetcher, t, licenseFiles.map((f) => join(d, f)));
    if (lic) {
      license = detectFromLicenseText(lic.res.text, lic.path);
      break;
    }
  }
  if (!license || license.source === "UNKNOWN") license = detectFromFrontMatter(md) ?? license;
  const isSkill = /(^|\/)SKILL\.md$/i.test(main.path);
  return {
    finalUrl: main.res.url,
    httpStatus: main.res.status,
    fetchedBytes: main.res.body.length,
    title: markdownTitle(md),
    text: truncate(collapse(md)),
    skillMd: isSkill ? md : null,
    license: license ?? { spdx: null, source: "UNKNOWN", evidence: "仓库中没有 LICENSE 文件" },
    contentSha256: sha256(md),
    author: t.owner,
  };
}

// ── entry point ──

export async function fetchSource(url: string, fetcher: Fetcher = safeFetch): Promise<SourceDoc> {
  const gh = parseGithub(url);
  if (gh) return fetchGithub(gh, fetcher);

  const res = await fetcher(url);
  const host = new URL(res.url).hostname.replace(/^www\./, "");
  const isMarkdown = /markdown|text\/plain/i.test(res.contentType) || /\.(md|markdown|txt)$/i.test(new URL(res.url).pathname);
  if (isMarkdown) {
    const fm = detectFromFrontMatter(res.text);
    return {
      finalUrl: res.url,
      httpStatus: res.status,
      fetchedBytes: res.body.length,
      title: markdownTitle(res.text),
      text: truncate(collapse(res.text)),
      skillMd: /(^|\/)SKILL\.md$/i.test(new URL(res.url).pathname) ? res.text : null,
      license: fm ?? { spdx: null, source: "UNKNOWN", evidence: "文件未声明许可证" },
      contentSha256: sha256(res.text),
      author: host,
    };
  }
  if (!/html|xml/i.test(res.contentType) && res.contentType) throw new FetchError(`不支持的内容类型：${res.contentType.split(";")[0]}`, true, res.status);
  const ex = extractHtml(res.text, res.url);
  if ([...ex.text].length < 50) throw new FetchError("页面几乎没有可提取的正文（可能需要登录或由脚本渲染）", true, res.status);
  return {
    finalUrl: res.url,
    httpStatus: res.status,
    fetchedBytes: res.body.length,
    title: ex.title,
    text: truncate(ex.text),
    skillMd: null,
    license: ex.license ?? { spdx: null, source: "UNKNOWN", evidence: "页面未声明许可证" },
    contentSha256: sha256(ex.text),
    author: host,
  };
}
