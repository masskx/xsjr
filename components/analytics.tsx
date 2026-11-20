"use client";
// First-party analytics: one beacon per page view (including client-side navigations), plus
// copy and search events. No cookies, no third parties; the server hashes IP + user agent with a
// daily salt that is deleted after two days (lib/analytics/visitor.ts).
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

type Kind = "pv" | "copy" | "search";

export function track(t: Kind, extra: { q?: string; r?: string } = {}) {
  try {
    const path = window.location.pathname;
    if (path.startsWith("/admin")) return; // our own work is not traffic
    const body = JSON.stringify({ t, p: path, ...extra });
    const blob = new Blob([body], { type: "text/plain" }); // text/plain: no CORS preflight
    if (!navigator.sendBeacon?.("/api/e", blob)) {
      void fetch("/api/e", { method: "POST", body, keepalive: true, headers: { "Content-Type": "text/plain" } });
    }
  } catch {
    /* analytics must never break the page */
  }
}

export function Analytics() {
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => {
    // the referrer only describes how the visitor arrived, i.e. the first page of the visit
    track("pv", first.current && document.referrer ? { r: document.referrer } : {});
    first.current = false;
  }, [pathname]);
  return null;
}
