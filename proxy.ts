// Runs before rendering (Next 16 "proxy", formerly middleware).
//
// Unknown or unpublished resource slugs are rewritten to a path that matches no route, so Next
// renders app/not-found.tsx inside the root layout with status 404.
//
// Why not just notFound() in the page: in Next 16.4, notFound() thrown while a dynamic page
// renders surfaces through the streamed-metadata outlet, which sits outside every not-found
// boundary. The response is still a 404, but its HTML is an empty `__next_error__` shell that
// only renders client-side, so crawlers and no-JS visitors get a blank page. The pages keep
// their notFound() calls as a second line of defence (e.g. a resource unpublished in the
// seconds before this index refreshes).
import { NextResponse, type NextRequest } from "next/server";
import { isPublished } from "@/lib/repo/published-index";
import type { ResourceType } from "@/lib/types";

const PREFIX_TYPE: Record<string, ResourceType> = {
  prompts: "PROMPT",
  skills: "SKILL",
  modules: "MODULE",
  directory: "SITE",
};

const DETAIL = /^\/(prompts|skills|modules|directory)\/([^/]+)\/?$/;

/** A path that no route matches; Next answers it with app/not-found.tsx and status 404. */
const NOT_FOUND_PATH = "/__not-found__/";

export async function proxy(request: NextRequest) {
  const m = DETAIL.exec(request.nextUrl.pathname);
  if (!m) return NextResponse.next();

  let slug: string;
  try {
    slug = decodeURIComponent(m[2]);
  } catch {
    return NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url));
  }

  try {
    if (await isPublished(PREFIX_TYPE[m[1]], slug)) return NextResponse.next();
  } catch (err) {
    // Database unavailable: let the page render path decide (it will error or 404 itself).
    console.error("[proxy] slug index unavailable", err);
    return NextResponse.next();
  }
  return NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url));
}

export const config = {
  matcher: ["/prompts/:slug", "/prompts/:slug/", "/skills/:slug", "/skills/:slug/", "/modules/:slug", "/modules/:slug/", "/directory/:slug", "/directory/:slug/"],
};
