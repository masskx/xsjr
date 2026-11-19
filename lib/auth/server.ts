// Next.js glue for authentication: cookies, request context, guards. Server-only.
// The account logic itself lives in service.ts / sessions.ts (framework-free, tested directly).
import "server-only";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "../db/client";
import { readAuthConfig, SESSION_COOKIE, type AuthConfig } from "./config";
import { createMailer } from "./mail";
import type { Ctx } from "./service";
import { asc } from "drizzle-orm";
import { tiers } from "../db/schema";
import { listSessions, markSession, resolveSession, revokeAllSessions, revokeSession, type ActiveSession } from "./sessions";

let configCache: AuthConfig | undefined;
export function authConfig(): AuthConfig {
  if (!configCache) {
    configCache = readAuthConfig();
    if (!configCache.available) console.log(`[auth] accounts are OFF: ${configCache.reason}`);
  }
  return configCache;
}

/** Client IP as Caddy reports it. Caddy overwrites X-Forwarded-For for untrusted clients, so
 *  the last entry is the real peer; without Caddy (development) we fall back to "local". */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  return xff?.split(",").pop()?.trim() || h.get("x-real-ip") || "local";
}

export async function requestCtx(): Promise<Ctx> {
  const config = authConfig();
  const h = await headers();
  return { db: getDb(), config, mailer: createMailer(config.mailDriver), ip: await clientIp(), userAgent: h.get("user-agent") };
}

/** The signed-in session for this request (memoised per request), or null. */
export const getViewer = cache(async (): Promise<ActiveSession | null> => {
  if (!authConfig().available) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return resolveSession(getDb(), token);
});

export function isAdminVerified(v: ActiveSession | null): boolean {
  return !!v && v.user.role === "ADMIN" && !!v.mfaVerifiedAt;
}

/** Pages that need a signed-in user. Redirects to login and comes back afterwards. */
export async function requireUser(returnTo: string): Promise<ActiveSession> {
  if (!authConfig().available) notFound();
  const viewer = await getViewer();
  if (!viewer) redirect(`/login/?next=${encodeURIComponent(returnTo)}`);
  return viewer;
}

/** Admin pages. proxy.ts already rewrites non-admins to the 404 page; this is the second check. */
export async function requireAdmin(): Promise<ActiveSession> {
  const viewer = await getViewer();
  if (!isAdminVerified(viewer)) notFound();
  return viewer!;
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  (await cookies()).set(SESSION_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
}

// ── data helpers for account pages and actions (pages never import lib/db directly) ──

export async function viewerSessions(viewer: ActiveSession) {
  return listSessions(getDb(), viewer.userId);
}

export async function revokeViewerSession(viewer: ActiveSession, sessionId: number) {
  await revokeSession(getDb(), sessionId, viewer.userId);
}

export async function revokeOtherViewerSessions(viewer: ActiveSession) {
  return revokeAllSessions(getDb(), viewer.userId, viewer.id);
}

export async function markViewerSession(viewer: ActiveSession, field: "mfa" | "reauth") {
  await markSession(getDb(), viewer.id, field);
}

/** Membership tiers with display labels, ordered by rank. */
export async function tierLabels(): Promise<Map<string, string>> {
  const rows = await getDb().select().from(tiers).orderBy(asc(tiers.rank));
  return new Map(rows.map((t) => [t.code, t.labelZh]));
}
