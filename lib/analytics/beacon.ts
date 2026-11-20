// First-party analytics beacon: POST /api/e with {"t":"pv"|"copy"|"search","p":path,"r"?:referrer,"q"?:query}
// (sent with navigator.sendBeacon as text/plain, so no CORS preflight). Always answers 204:
// a rejected event and an accepted one look the same to the caller.
import "server-only";
import { clientIp } from "../auth/server";
import { getAccess, resourceForPath } from "../repo";
import { getDb } from "../db/client";
import { beaconAllowed, beaconSchema, cleanPath, cleanQuery, isBot, optedOut, recordEvent, referrerHost } from "./ingest";

const done = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

function sameSite(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function handleBeacon(req: Request): Promise<Response> {
  const ua = req.headers.get("user-agent") ?? "";
  if (!sameSite(req) || isBot(ua) || optedOut(req.headers)) return done();
  const raw = await req.text();
  if (raw.length > 2000) return done();
  let payload;
  try {
    payload = beaconSchema.parse(JSON.parse(raw));
  } catch {
    return done();
  }
  const ip = await clientIp();
  if (!beaconAllowed(ip)) return done();
  const path = cleanPath(payload.p);
  if (!path) return done();

  const db = getDb();
  const target = await resourceForPath(path);
  // page views, copies and searches are deliberately NOT linked to user accounts
  const base = { path, ip, userAgent: ua, resourceId: target?.id ?? null };

  if (payload.t === "pv") {
    // the viewer lacked the tier for a members-only resource: the "viewed but locked" signal
    const locked = target && target.tier !== "FREE" ? !(await getAccess(target.resource)).allowed : false;
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    await recordEvent(db, { ...base, type: "page_view", referrerHost: referrerHost(payload.r, host), locked });
  } else if (payload.t === "copy") {
    await recordEvent(db, { ...base, type: "copy" });
  } else {
    const q = cleanQuery(payload.q);
    if (q) await recordEvent(db, { ...base, type: "search", searchQuery: q });
  }
  return done();
}
