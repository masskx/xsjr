import type { Diagram } from "@/lib/repo";

// Monogram colours for sites without an uploaded icon (paper-and-ink palette).
const TILES = ["var(--color-ink)", "var(--color-vermilion)", "var(--color-patina-deep)", "var(--color-gold-deep)", "oklch(36% 0.05 260)", "oklch(40% 0.06 150)"];

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.codePointAt(0)!) >>> 0;
  return h;
}

/** First meaningful character of a site title: a CJK character or the first Latin letter. */
export function monogram(title: string): string {
  const m = /[一-鿿]|[A-Za-z0-9]/.exec(title);
  return (m?.[0] ?? "站").toUpperCase();
}

/** Site icon: the uploaded image (served from /media) or a generated monogram tile. */
export function SiteIcon({ title, slug, icon, size = 48 }: { title: string; slug: string; icon: Diagram | null; size?: number }) {
  if (icon) {
    // Bump the URL when bundled icon files change: a browser may have cached a previous 404/old
    // media response for the same media key.
    const src = `${icon.src}${icon.src.includes("?") ? "&" : "?"}v=20261123-icons`;
    return (
      // eslint-disable-next-line @next/next/no-img-element -- images.unoptimized; served by Caddy from /media
      <img src={src} alt="" width={size} height={size} loading="lazy" decoding="async" className="shrink-0 rounded-[10px] border border-rule bg-paper-raised object-contain p-1" style={{ width: size, height: size }} />
    );
  }
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-[10px] font-display font-semibold text-white shadow-sm"
      style={{ width: size, height: size, background: TILES[hash(slug) % TILES.length], fontSize: size * 0.46 }}
    >
      {monogram(title)}
    </span>
  );
}
