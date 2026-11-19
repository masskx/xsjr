// Create an administrator, or promote an existing user, with a freshly generated password that
// is printed once. Also resets an admin's TOTP (lost phone) or password.
//
//   node scripts/create-admin.mjs --email admin@example.cn            create or promote
//   node scripts/create-admin.mjs --email admin@example.cn --reset-mfa
//   node scripts/create-admin.mjs --email admin@example.cn --reset-password
// On the server:
//   sudo docker compose --project-directory /opt/research-hub \
//     -f /opt/research-hub/current/infra/compose.yaml run --rm cli \
//     node scripts/create-admin.mjs --email admin@example.cn
//
// The admin must enrol TOTP at first login before /admin opens. All sessions of the account are
// revoked by every operation here.
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, getPool } from "../lib/db/client";
import * as s from "../lib/db/schema";
import { hashPassword, passwordProblem } from "../lib/auth/password";
import { revokeAllSessions } from "../lib/auth/sessions";
import { normaliseEmail } from "../lib/auth/service";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function generatePassword(): string {
  // 20 chars from an unambiguous alphabet, grouped for reading aloud: ~116 bits
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(20);
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
  return chars.match(/.{1,5}/g)!.join("-");
}

async function main() {
  const email = normaliseEmail(arg("--email") ?? "");
  if (!email) throw new Error("usage: create-admin --email <address> [--reset-mfa | --reset-password]");
  const resetMfa = process.argv.includes("--reset-mfa");
  const resetPassword = process.argv.includes("--reset-password");
  const db = getDb();
  const [existing] = await db.select().from(s.users).where(eq(s.users.email, email));

  if (resetMfa) {
    if (!existing) throw new Error(`no user ${email}`);
    await db.update(s.users).set({ totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null }).where(eq(s.users.id, existing.id));
    await revokeAllSessions(db, existing.id);
    console.log(`[admin] TOTP reset for ${email}; they must enrol again at next login.`);
    return;
  }

  const password = generatePassword();
  const problem = passwordProblem(password, { role: "ADMIN", email });
  if (problem) throw new Error(`generated password rejected: ${problem}`);
  const passwordHash = await hashPassword(password);
  const now = new Date();

  if (existing && existing.role === "ADMIN" && !resetPassword) {
    console.log(`[admin] ${email} is already an admin; nothing changed (use --reset-password or --reset-mfa).`);
    return;
  }
  if (existing) {
    await db
      .update(s.users)
      .set({
        role: "ADMIN",
        emailVerifiedAt: existing.emailVerifiedAt ?? now,
        failedLogins: 0,
        lockedUntil: null,
        passwordHash,
        updatedAt: now,
      })
      .where(eq(s.users.id, existing.id));
    await revokeAllSessions(db, existing.id);
    console.log(`[admin] ${existing.role === "ADMIN" ? "password reset for" : "promoted"} ${email}`);
  } else {
    await db.insert(s.users).values({ email, passwordHash, role: "ADMIN", emailVerifiedAt: now });
    console.log(`[admin] created ${email}`);
  }
  console.log(`\n  one-time password:  ${password}\n`);
  console.log("  Store it in a password manager now; it is not saved anywhere else.");
  console.log("  First login: you will be asked to set up two-step verification (TOTP).");
}

main()
  .catch((err) => {
    console.error("[admin] FAILED:", (err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => getPool().end());
