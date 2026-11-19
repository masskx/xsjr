// RFC 6238 TOTP (HMAC-SHA1, 30 s, 6 digits) with RFC 4648 base32, using only node:crypto.
// Compatible with Google Authenticator, Microsoft Authenticator, 1Password, Authy, etc.
import { createHmac, randomBytes } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error("invalid base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function newTotpSecret(): Buffer {
  return randomBytes(20); // 160 bits, as RFC 4226 recommends
}

export const STEP_SECONDS = 30;

export function stepAt(timeMs: number): number {
  return Math.floor(timeMs / 1000 / STEP_SECONDS);
}

export function totpAt(secret: Buffer, step: number, digits = 6, algorithm: "sha1" | "sha256" | "sha512" = "sha1"): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac(algorithm, secret).update(counter).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

/**
 * Verify a code within +/- `window` steps of `now`. Returns the matched step, or null.
 * Callers must reject a step <= the last accepted one (replay protection).
 */
export function verifyTotp(secret: Buffer, code: string, now = Date.now(), window = 1): number | null {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const current = stepAt(now);
  for (let d = -window; d <= window; d++) {
    if (totpAt(secret, current + d) === clean) return current + d;
  }
  return null;
}

export function otpauthUri(secretB32: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const q = new URLSearchParams({ secret: secretB32, issuer, algorithm: "SHA1", digits: "6", period: String(STEP_SECONDS) });
  return `otpauth://totp/${label}?${q.toString()}`;
}
