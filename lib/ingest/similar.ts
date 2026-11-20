// Title similarity for dedup. PostgreSQL's pg_trgm does the work where it can; this JS twin
// (character-bigram Dice coefficient) is also applied because pg_trgm's handling of CJK text
// depends on the database locale, and Chinese titles are the common case here.

function bigrams(s: string): Map<string, number> {
  const chars = [...s.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "")];
  const m = new Map<string, number>();
  if (chars.length === 1) m.set(chars[0], 1);
  for (let i = 0; i < chars.length - 1; i++) {
    const g = chars[i] + chars[i + 1];
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

export function titleSimilarity(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  let total = 0;
  let common = 0;
  for (const n of A.values()) total += n;
  for (const n of B.values()) total += n;
  for (const [g, n] of A) common += Math.min(n, B.get(g) ?? 0);
  return total ? (2 * common) / total : 0;
}

export const SIMILARITY_THRESHOLD = 0.6;
