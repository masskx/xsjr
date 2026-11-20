// Sealing for secrets that must live in the database (currently the LLM API key).
//
// A database dump alone must not expose a usable key, so the value is encrypted with a key
// derived from AUTH_SECRET (which lives only in the server environment). AES-256-GCM gives both
// confidentiality and tamper detection. The format is self-describing so the derivation can be
// rotated later: "v1:<iv>:<tag>:<ciphertext>", each part base64.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const VERSION = "v1";
const SALT = "research-hub/llm-key/v1";

/** True when the server has a secret to derive a key from. Without it nothing can be stored. */
export function secretsAvailable(env: Record<string, string | undefined> = process.env): boolean {
  return (env.AUTH_SECRET ?? "").trim().length >= 32;
}

function derive(secret: string): Buffer {
  // scrypt is deliberately slow; the salt is fixed because the secret itself is the entropy.
  return scryptSync(secret, SALT, 32);
}

export function sealSecret(plain: string, env: Record<string, string | undefined> = process.env): string {
  const secret = (env.AUTH_SECRET ?? "").trim();
  if (secret.length < 32) throw new Error("AUTH_SECRET is missing or too short to seal secrets");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derive(secret), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), body.toString("base64")].join(":");
}

/** Returns null when the value cannot be opened (wrong secret, tampered, or unknown version). */
export function openSecret(sealed: string, env: Record<string, string | undefined> = process.env): string | null {
  try {
    const [version, ivB64, tagB64, bodyB64] = sealed.split(":");
    if (version !== VERSION || !ivB64 || !tagB64 || !bodyB64) return null;
    const secret = (env.AUTH_SECRET ?? "").trim();
    if (secret.length < 32) return null;
    const decipher = createDecipheriv("aes-256-gcm", derive(secret), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(bodyB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** "sk-abcd••••wxyz" for display: never more than the first and last four characters. */
export function maskSecret(plain: string): string {
  if (plain.length <= 12) return "••••";
  return `${plain.slice(0, 4)}••••${plain.slice(-4)}`;
}
