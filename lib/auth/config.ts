// Authentication configuration and the rule that decides whether accounts are switched on.
//
// Accounts need Secure cookies, and browsers drop Secure cookies on plain-HTTP origins. Until the
// site has HTTPS (domain + ICP filing, or an IP certificate), login must stay off: we never send
// passwords over plain HTTP. So auth is available only when ALL of these hold:
//   - AUTH_ENABLED=1
//   - SITE_URL is https://..., or http://localhost / 127.0.0.1 (browsers treat those as secure)
//   - AUTH_SECRET is set (>= 32 chars)
// When unavailable, every account route answers 404 and the header shows no login link, so the
// public site is unchanged.

export type MailDriver = "hold" | "log" | "smtp";

export interface AuthConfig {
  available: boolean;
  /** why auth is off, for logs and the runbook; null when available */
  reason: string | null;
  siteUrl: string;
  secret: string;
  mailDriver: MailDriver;
  /** self-service flows that depend on mail actually arriving */
  canDeliverMail: boolean;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function readAuthConfig(env: Record<string, string | undefined> = process.env): AuthConfig {
  const siteUrl = (env.SITE_URL || env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  const secret = env.AUTH_SECRET ?? "";
  const driver = (env.MAIL_DRIVER ?? "hold") as MailDriver;
  const mailDriver: MailDriver = ["hold", "log", "smtp"].includes(driver) ? driver : "hold";

  let reason: string | null = null;
  let url: URL | null = null;
  try {
    url = new URL(siteUrl);
  } catch {
    reason = `SITE_URL is not a valid URL: ${siteUrl}`;
  }
  if (!reason && env.AUTH_ENABLED !== "1") reason = "AUTH_ENABLED is not 1";
  if (!reason && url && url.protocol !== "https:" && !LOCAL_HOSTS.has(url.hostname)) {
    reason = "SITE_URL is not https (Secure cookies would be dropped; passwords would travel in clear text)";
  }
  if (!reason && secret.length < 32) reason = "AUTH_SECRET is missing or shorter than 32 characters";

  return {
    available: reason === null,
    reason,
    siteUrl,
    secret,
    mailDriver,
    canDeliverMail: mailDriver === "smtp" || mailDriver === "log",
  };
}

// Session lifetimes. Absolute (not sliding): the cookie and the database row expire together.
export const USER_SESSION_MS = 30 * 24 * 3600_000;
export const ADMIN_SESSION_MS = 12 * 3600_000;
/** Destructive admin actions need a password or TOTP check within this window (slice 3). */
export const REAUTH_WINDOW_MS = 10 * 60_000;

export const SESSION_COOKIE = "__Host-rh_s";
