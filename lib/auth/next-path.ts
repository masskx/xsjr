/**
 * Where to send the browser after login. Only same-site absolute paths are allowed, so a crafted
 * `?next=` cannot turn the login page into an open redirect.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/account/"): string {
  if (!next || typeof next !== "string" || next.length > 300) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  if (/[\u0000-\u001f]/.test(next)) return fallback;
  // never bounce back into the auth pages themselves
  if (/^\/(login|register|logout|reset-password|forgot-password)(\/|$)/.test(next)) return fallback;
  return next;
}
