// Runs before rendering (Next 16 "proxy", formerly middleware).
//
// 1. Resource detail pages: unknown or unpublished slugs are rewritten to a path that matches no
//    route, so Next renders app/not-found.tsx inside the root layout with status 404.
//    Why not just notFound() in the page: in Next 16.4, notFound() thrown while a dynamic page
//    renders surfaces through the streamed-metadata outlet, which sits outside every not-found
//    boundary. The response is still a 404, but its HTML is an empty `__next_error__` shell that
//    only renders client-side. The pages keep their notFound() calls as a second line of defence.
// 2. Account pages: while accounts are switched off (no HTTPS yet, see lib/auth/config.ts) they
//    all answer the 404 page, so the public site is unchanged.
// 3. /admin: only an ADMIN whose session passed TOTP gets through; everyone else sees the 404
//    page (the admin area is not advertised). A signed-in admin who has not entered the TOTP code
//    yet is sent to that step instead.
import { NextResponse, type NextRequest } from "next/server";
import { readAuthConfig, SESSION_COOKIE } from "@/lib/auth/config";
import { getDb } from "@/lib/db/client";
import { resolveSession } from "@/lib/auth/sessions";
import { isPublished } from "@/lib/repo/published-index";
import type { ResourceType } from "@/lib/types";

const PREFIX_TYPE: Record<string, ResourceType> = {
  prompts: "PROMPT",
  skills: "SKILL",
  modules: "MODULE",
  directory: "SITE",
};

const DETAIL = /^\/(prompts|skills|modules|directory)\/([^/]+)\/?$/;
const ACCOUNT = /^\/(login|register|verify-email|forgot-password|reset-password|account|privacy|terms)(\/|$)/;
const ADMIN = /^\/admin(\/|$)/;

/** A path that no route matches; Next answers it with app/not-found.tsx and status 404. */
const NOT_FOUND_PATH = "/__not-found__/";

const auth = readAuthConfig();

function notFound(request: NextRequest) {
  return NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url));
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (ACCOUNT.test(path)) {
    return auth.available ? NextResponse.next() : notFound(request);
  }

  if (ADMIN.test(path)) {
    if (!auth.available) return notFound(request);
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return notFound(request);
    try {
      const session = await resolveSession(getDb(), token);
      if (!session || session.user.role !== "ADMIN") return notFound(request);
      if (!session.mfaVerifiedAt) {
        const step = session.user.totpEnabledAt ? "/login/mfa/" : "/account/mfa/";
        return NextResponse.redirect(new URL(`${step}?next=${encodeURIComponent(path)}`, request.url));
      }
      return NextResponse.next();
    } catch (err) {
      console.error("[proxy] session lookup failed", err);
      return notFound(request); // fail closed
    }
  }

  const m = DETAIL.exec(path);
  if (!m) return NextResponse.next();

  let slug: string;
  try {
    slug = decodeURIComponent(m[2]);
  } catch {
    return notFound(request);
  }

  try {
    if (await isPublished(PREFIX_TYPE[m[1]], slug)) return NextResponse.next();
  } catch (err) {
    // Database unavailable: let the page render path decide (it will error or 404 itself).
    console.error("[proxy] slug index unavailable", err);
    return NextResponse.next();
  }
  return notFound(request);
}

export const config = {
  matcher: [
    "/prompts/:slug",
    "/prompts/:slug/",
    "/skills/:slug",
    "/skills/:slug/",
    "/modules/:slug",
    "/modules/:slug/",
    "/directory/:slug",
    "/directory/:slug/",
    "/login/:path*",
    "/register/:path*",
    "/verify-email/:path*",
    "/forgot-password/:path*",
    "/reset-password/:path*",
    "/account/:path*",
    "/privacy/:path*",
    "/terms/:path*",
    "/admin/:path*",
  ],
};
