// Deterministic licence detection. The LLM's opinion of a licence is recorded for the reviewer
// but NEVER used here: redistribution is decided only by what this file can match.
//
// Sources, in order of strength:
//   SPDX_DETECTED  — a LICENSE/COPYING file whose text matches a known licence, or an explicit
//                    "SPDX-License-Identifier:" line
//   PAGE_DECLARED  — the page declares a licence in markup (<link|a rel="license">, Creative
//                    Commons URL) or a SKILL.md front-matter `license:` that is an SPDX id
//   UNKNOWN        — anything else: index only (database constraint), no copied body
//
// Only the permissive licences in PERMISSIVE allow the platform to redistribute a copy. Others
// (GPL, CC BY-SA, NC, ND, ...) are recorded truthfully but the draft stays index-only; the admin
// can still declare otherwise in the editor after checking (ADMIN_DECLARED, audited).

export type LicenseSource = "SPDX_DETECTED" | "PAGE_DECLARED" | "UNKNOWN";
export interface LicenseFinding {
  spdx: string | null;
  source: LicenseSource;
  evidence: string | null;
  /** first "Copyright ..." line of the licence file, kept for attribution */
  copyright?: string;
}

export const PERMISSIVE = new Set(["MIT", "MIT-0", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "0BSD", "Unlicense", "CC0-1.0", "CC-BY-4.0"]);

const KNOWN_IDS = [
  "MIT", "MIT-0", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "0BSD", "Unlicense", "CC0-1.0",
  "CC-BY-4.0", "CC-BY-SA-4.0", "CC-BY-NC-4.0", "CC-BY-NC-SA-4.0", "CC-BY-ND-4.0", "CC-BY-NC-ND-4.0",
  "GPL-2.0", "GPL-2.0-only", "GPL-2.0-or-later", "GPL-3.0", "GPL-3.0-only", "GPL-3.0-or-later",
  "LGPL-2.1", "LGPL-3.0", "AGPL-3.0", "AGPL-3.0-only", "AGPL-3.0-or-later", "MPL-2.0", "EPL-2.0",
];
const BY_LOWER = new Map(KNOWN_IDS.map((id) => [id.toLowerCase(), id]));

/** Canonical SPDX id for a declared string, or null if it is not one we recognise exactly. */
export function canonicalSpdx(raw: string): string | null {
  const s = raw.trim().replace(/^["']|["']$/g, "");
  return BY_LOWER.get(s.toLowerCase()) ?? null;
}

export const canRedistribute = (f: LicenseFinding) => f.source !== "UNKNOWN" && !!f.spdx && PERMISSIVE.has(f.spdx);

const squash = (t: string) => t.replace(/\s+/g, " ").trim();

/** Match the text of a LICENSE file. */
export function detectFromLicenseText(text: string, fileName = "LICENSE"): LicenseFinding {
  const t = squash(text);
  const copyright = text.split(/\r?\n/).map((l) => l.trim()).find((l) => /^(copyright|©|\(c\))/i.test(l))?.slice(0, 200);
  const found = (spdx: string, what: string): LicenseFinding => ({ spdx, source: "SPDX_DETECTED", evidence: `${fileName}：${what}`, copyright });
  const spdxLine = /SPDX-License-Identifier:\s*([A-Za-z0-9.+-]+)/.exec(text);
  if (spdxLine) {
    const id = canonicalSpdx(spdxLine[1]);
    if (id) return found(id, `SPDX-License-Identifier: ${id}`);
  }
  if (/Permission is hereby granted, free of charge, to any person obtaining a copy/i.test(t) && /PROVIDED "?AS IS"?/i.test(t)) {
    return /above copyright notice and this permission notice shall be included/i.test(t)
      ? found("MIT", "MIT 许可证全文")
      : found("MIT-0", "MIT No Attribution 许可证全文");
  }
  if (/Apache License/i.test(t) && /Version 2\.0, January 2004/i.test(t)) return found("Apache-2.0", "Apache License 2.0 全文");
  if (/GNU AFFERO GENERAL PUBLIC LICENSE/i.test(t) && /Version 3/i.test(t)) return found("AGPL-3.0", "GNU AGPL v3 全文");
  if (/GNU LESSER GENERAL PUBLIC LICENSE/i.test(t)) return found(/Version 3/i.test(t) ? "LGPL-3.0" : "LGPL-2.1", "GNU LGPL 全文");
  if (/GNU GENERAL PUBLIC LICENSE/i.test(t)) {
    if (/Version 3, 29 June 2007/i.test(t)) return found("GPL-3.0", "GNU GPL v3 全文");
    if (/Version 2, June 1991/i.test(t)) return found("GPL-2.0", "GNU GPL v2 全文");
  }
  if (/Mozilla Public License,? Version 2\.0/i.test(t)) return found("MPL-2.0", "Mozilla Public License 2.0 全文");
  if (/Redistribution and use in source and binary forms, with or without modification, are permitted/i.test(t)) {
    return /Neither the name of/i.test(t) ? found("BSD-3-Clause", "BSD 3-Clause 全文") : found("BSD-2-Clause", "BSD 2-Clause 全文");
  }
  if (/Permission to use, copy, modify, and\/?or distribute this software for any purpose with or without fee is hereby granted/i.test(t)) {
    return /above copyright notice and this permission notice appear in all copies/i.test(t) ? found("ISC", "ISC 许可证全文") : found("0BSD", "0BSD 许可证全文");
  }
  if (/This is free and unencumbered software released into the public domain/i.test(t)) return found("Unlicense", "The Unlicense 全文");
  if (/CC0 1\.0 Universal/i.test(t)) return found("CC0-1.0", "CC0 1.0 全文");
  const cc = /Attribution(-NonCommercial)?(-ShareAlike|-NoDerivatives)? 4\.0 International/i.exec(t);
  if (cc) {
    const id = `CC-BY${cc[1] ? "-NC" : ""}${cc[2] ? (/Share/i.test(cc[2]) ? "-SA" : "-ND") : ""}-4.0`;
    return found(id, `Creative Commons ${id} 全文`);
  }
  return { spdx: null, source: "UNKNOWN", evidence: `${fileName} 存在，但未能匹配已知许可证`, copyright };
}

/** Creative Commons licence URL -> SPDX id */
export function spdxFromCcUrl(href: string): string | null {
  const m = /creativecommons\.org\/(licenses|publicdomain)\/([a-z-]+)\/(\d\.\d)/i.exec(href);
  if (!m) return null;
  if (m[1].toLowerCase() === "publicdomain") return m[2].toLowerCase() === "zero" && m[3] === "1.0" ? "CC0-1.0" : null;
  return canonicalSpdx(`CC-${m[2].toUpperCase()}-${m[3]}`);
}

/** Licence declared in page markup. `doc` is a parsed DOM (linkedom). */
export function detectFromHtml(doc: { querySelectorAll(sel: string): ArrayLike<{ getAttribute(n: string): string | null }> }): LicenseFinding | null {
  for (const el of Array.from(doc.querySelectorAll('link[rel~="license"], a[rel~="license"]'))) {
    const href = el.getAttribute("href") ?? "";
    const id = spdxFromCcUrl(href) ?? (/opensource\.org\/licenses?\/([A-Za-z0-9.-]+)/i.exec(href)?.[1] ? canonicalSpdx(/opensource\.org\/licenses?\/([A-Za-z0-9.-]+)/i.exec(href)![1]) : null);
    if (id) return { spdx: id, source: "PAGE_DECLARED", evidence: `页面声明 rel="license"：${href.slice(0, 200)}` };
  }
  for (const el of Array.from(doc.querySelectorAll('meta[name="license"], meta[name="dc.rights"], meta[property="og:license"]'))) {
    const content = el.getAttribute("content") ?? "";
    const id = canonicalSpdx(content) ?? spdxFromCcUrl(content);
    if (id) return { spdx: id, source: "PAGE_DECLARED", evidence: `页面 meta 声明：${content.slice(0, 200)}` };
  }
  return null;
}

/** `license:` in SKILL.md YAML front matter, accepted only if it is exactly an SPDX id. */
export function detectFromFrontMatter(md: string): LicenseFinding | null {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md);
  if (!fm) return null;
  const line = /^license:\s*(.+)$/im.exec(fm[1]);
  if (!line) return null;
  const id = canonicalSpdx(line[1]);
  return id ? { spdx: id, source: "PAGE_DECLARED", evidence: `SKILL.md 头部声明 license: ${id}` } : null;
}

export const UNKNOWN_LICENSE_LABEL = "未声明（仅索引）";
