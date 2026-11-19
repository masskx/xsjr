// Small crypto helpers: random tokens, hashing, keyed hashes, and authenticated encryption for
// secrets at rest (TOTP seeds). Only node:crypto.
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

/** URL-safe random token (default 32 bytes = 256 bits). Only its SHA-256 is ever stored. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(input: string | Buffer): Buffer {
  return createHash("sha256").update(input).digest();
}

/** Keyed hash for identifiers we must not store in clear (IPs in rate-limit keys). */
export function keyedHash(secret: string, purpose: string, value: string): string {
  return createHmac("sha256", subKey(secret, `hmac:${purpose}`)).update(value).digest("base64url").slice(0, 32);
}

export function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

function subKey(secret: string, info: string): Buffer {
  return Buffer.from(hkdfSync("sha256", Buffer.from(secret, "utf8"), Buffer.alloc(0), Buffer.from(info, "utf8"), 32));
}

/** AES-256-GCM. Output: 12-byte IV | 16-byte tag | ciphertext. */
export function seal(secret: string, purpose: string, plaintext: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", subKey(secret, `seal:${purpose}`), iv);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

export function open(secret: string, purpose: string, sealed: Buffer): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", subKey(secret, `seal:${purpose}`), sealed.subarray(0, 12));
  decipher.setAuthTag(sealed.subarray(12, 28));
  return Buffer.concat([decipher.update(sealed.subarray(28)), decipher.final()]);
}
