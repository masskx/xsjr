// Password hashing (Argon2id, OWASP baseline parameters) and the password policy.
// hash-wasm is WebAssembly: no native binary, so the same release runs on Windows and Linux.
import { randomBytes } from "node:crypto";
import { argon2Verify, argon2id } from "hash-wasm";
import { COMMON_PASSWORDS } from "./data/common-passwords";

// OWASP Password Storage Cheat Sheet: m=19 MiB, t=2, p=1.
const PARAMS = { memorySize: 19_456, iterations: 2, parallelism: 1, hashLength: 32 } as const;

export async function hashPassword(password: string): Promise<string> {
  return argon2id({ password: password.normalize("NFKC"), salt: randomBytes(16), ...PARAMS, outputType: "encoded" });
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  try {
    return await argon2Verify({ password: password.normalize("NFKC"), hash: encoded });
  } catch {
    return false;
  }
}

/** Hash of a random password: verifying against it costs the same as a real check, so a login for
 *  an unknown email takes as long as one for a known email (no timing-based account discovery). */
let dummyHash: Promise<string> | undefined;
export function dummyPasswordHash(): Promise<string> {
  return (dummyHash ??= hashPassword(randomBytes(24).toString("base64")));
}

let common: Set<string> | undefined;
function isCommon(password: string): boolean {
  common ??= new Set(COMMON_PASSWORDS.split("\n"));
  return common.has(password.toLowerCase());
}

export const MIN_LENGTH = { USER: 10, ADMIN: 14 } as const;
export const MAX_LENGTH = 128;

/** Returns a user-facing (Chinese) problem description, or null when the password is acceptable. */
export function passwordProblem(password: string, opts: { role?: "USER" | "ADMIN"; email?: string } = {}): string | null {
  const min = MIN_LENGTH[opts.role ?? "USER"];
  const chars = [...password];
  if (chars.length < min) return `密码至少 ${min} 个字符`;
  if (chars.length > MAX_LENGTH) return `密码不能超过 ${MAX_LENGTH} 个字符`;
  if (new Set(chars).size < 4) return "密码过于简单（重复字符太多）";
  if (isCommon(password)) return "这是常见密码，请换一个";
  const local = opts.email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && password.toLowerCase().includes(local)) return "密码不能包含邮箱用户名";
  return null;
}
