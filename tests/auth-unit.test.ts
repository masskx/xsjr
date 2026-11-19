import { describe, expect, it } from "vitest";
import { readAuthConfig } from "@/lib/auth/config";
import { keyedHash, open, randomToken, seal } from "@/lib/auth/crypto";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { base32Decode, base32Encode, totpAt, verifyTotp } from "@/lib/auth/totp";
import { safeNextPath } from "@/lib/auth/next-path";

describe("auth availability", () => {
  const base = { AUTH_ENABLED: "1", AUTH_SECRET: "x".repeat(32) };
  it.each([
    [{ ...base, SITE_URL: "https://www.example.cn" }, true],
    [{ ...base, SITE_URL: "http://localhost:3000" }, true],
    [{ ...base, SITE_URL: "http://127.0.0.1:8100" }, true],
    [{ ...base, SITE_URL: "http://129.204.142.223" }, false], // plain HTTP on a public IP
    [{ ...base, SITE_URL: "https://x.cn", AUTH_ENABLED: "0" }, false],
    [{ ...base, SITE_URL: "https://x.cn", AUTH_SECRET: "short" }, false],
  ])("%o -> available=%s", (env, expected) => {
    const c = readAuthConfig(env);
    expect(c.available).toBe(expected);
    if (!expected) expect(c.reason).toBeTruthy();
  });

  it("only smtp and log can deliver mail", () => {
    expect(readAuthConfig({ MAIL_DRIVER: "hold" }).canDeliverMail).toBe(false);
    expect(readAuthConfig({ MAIL_DRIVER: "smtp" }).canDeliverMail).toBe(true);
    expect(readAuthConfig({ MAIL_DRIVER: "bogus" }).mailDriver).toBe("hold");
  });
});

describe("passwords", () => {
  it("hashes with argon2id and verifies", async () => {
    const h = await hashPassword("correct horse battery staple");
    expect(h).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await verifyPassword("correct horse battery staple", h)).toBe(true);
    expect(await verifyPassword("correct horse battery stapl", h)).toBe(false);
    expect(await verifyPassword("anything", "not-a-hash")).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same password 123")).not.toBe(await hashPassword("same password 123"));
  });

  it("normalises unicode so visually identical passwords match", async () => {
    const h = await hashPassword("ｐａｓｓ密码ｗｏｒｄ12"); // full-width
    expect(await verifyPassword("pass密码word12", h)).toBe(true);
  });

  it.each([
    ["short", "至少 10"],
    ["aaaaaaaaaaaaaa", "过于简单"],
    ["password123", "常见密码"],
    ["Correct-Horse-27", null],
  ])("policy %j", (pw, expected) => {
    const problem = passwordProblem(pw);
    if (expected === null) expect(problem).toBeNull();
    else expect(problem).toContain(expected);
  });

  it("admins need 14 characters; email name is rejected", () => {
    expect(passwordProblem("Tr0ub4dour&3x", { role: "ADMIN" })).toContain("14");
    expect(passwordProblem("zhangsan-research-2026", { email: "zhangsan@example.com" })).toContain("邮箱");
  });
});

describe("TOTP (RFC 6238 appendix B, SHA-1 seed)", () => {
  const seed = Buffer.from("12345678901234567890");
  it.each([
    [59, "94287082"],
    [1111111109, "07081804"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
  ])("t=%i -> %s", (t, code) => {
    expect(totpAt(seed, Math.floor(t / 30), 8)).toBe(code);
  });

  it("base32 round-trips", () => {
    const buf = Buffer.from("12345678901234567890");
    expect(base32Encode(buf)).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode("gezd gnbv gy3t qojq gezd gnbv gy3t qojq")).toEqual(buf);
  });

  it("accepts +/- one step and rejects garbage", () => {
    const now = 1_800_000_000_000;
    const step = Math.floor(now / 30_000);
    expect(verifyTotp(seed, totpAt(seed, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(seed, totpAt(seed, step + 2), now)).toBeNull();
    expect(verifyTotp(seed, "12345", now)).toBeNull();
    expect(verifyTotp(seed, "abcdef", now)).toBeNull();
  });
});

describe("crypto helpers", () => {
  it("tokens are 256-bit url-safe", () => {
    const t = randomToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(t);
  });

  it("sealed secrets open only with the same key and purpose", () => {
    const sealed = seal("k".repeat(32), "totp", Buffer.from("seed"));
    expect(open("k".repeat(32), "totp", sealed).toString()).toBe("seed");
    expect(() => open("j".repeat(32), "totp", sealed)).toThrow();
    expect(() => open("k".repeat(32), "other", sealed)).toThrow();
  });

  it("keyed hashes are stable per key and never contain the input", () => {
    const a = keyedHash("s".repeat(32), "ip", "203.0.113.7");
    expect(a).toBe(keyedHash("s".repeat(32), "ip", "203.0.113.7"));
    expect(a).not.toContain("203");
    expect(a).not.toBe(keyedHash("t".repeat(32), "ip", "203.0.113.7"));
  });
});

describe("post-login redirect target", () => {
  it.each([
    [undefined, "/account/"],
    ["/modules/stat-tests-py/", "/modules/stat-tests-py/"],
    ["/account/?tab=security", "/account/?tab=security"],
    ["//evil.example/", "/account/"],
    ["https://evil.example/", "/account/"],
    ["/\\evil.example", "/account/"],
    ["javascript:alert(1)", "/account/"],
    ["/login/", "/account/"],
  ])("%j -> %s", (input, expected) => expect(safeNextPath(input)).toBe(expected));
});
