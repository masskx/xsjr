// The batch list (清单.csv): read what Excel writes, write what Excel opens.
//
// Excel on Chinese Windows saves "CSV" as GB18030/GBK and "CSV UTF-8" with a BOM; both are
// accepted. We write UTF-8 WITH a BOM, otherwise Excel shows the Chinese as mojibake.
// RFC 4180: quoted fields may contain commas, quotes ("") and line breaks.

export function decodeCsv(buf: Buffer): string {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString("utf8");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("gb18030").decode(buf);
  }
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const delim = sniffDelimiter(text);
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

/** Excel in some locales saves with semicolons or tabs. */
function sniffDelimiter(text: string): string {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = [",", ";", "\t"].map((d) => [d, first.split(d).length] as const);
  return counts.sort((a, b) => b[1] - a[1])[0][1] > 1 ? counts[0][0] : ",";
}

const needsQuote = /[",\r\n]/;
export function toCsv(rows: string[][]): Buffer {
  const body = rows.map((r) => r.map((f) => (needsQuote.test(f) ? `"${f.replace(/"/g, '""')}"` : f)).join(",")).join("\r\n") + "\r\n";
  return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(body, "utf8")]);
}

/** Rows as objects keyed by canonical column name (Chinese or English headers accepted). */
export function csvRecords(text: string, aliases: Record<string, string[]>): { records: Record<string, string>[]; unknownColumns: string[] } {
  const [header, ...rows] = parseCsv(text);
  if (!header) return { records: [], unknownColumns: [] };
  const lookup = new Map<string, string>();
  for (const [key, names] of Object.entries(aliases)) for (const n of [key, ...names]) lookup.set(n.trim().toLowerCase(), key);
  const keys = header.map((h) => lookup.get(h.trim().toLowerCase()) ?? null);
  const unknownColumns = header.filter((_, i) => !keys[i]).map((h) => h.trim()).filter(Boolean);
  const records = rows.map((r) => {
    const rec: Record<string, string> = {};
    keys.forEach((k, i) => {
      if (k) rec[k] = (r[i] ?? "").trim();
    });
    return rec;
  });
  return { records, unknownColumns };
}
