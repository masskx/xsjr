import { getGptPromoPrice } from "@/lib/promo/gpt";

/** Prominent top-nav offer. Price is rendered on the server from the shop API; clients never see
 *  the API credentials. Without a configured shop URL the button is omitted. */
export async function GptPromoButton({ compact = false }: { compact?: boolean }) {
  const shopUrl = process.env.GPT_PROMO_SHOP_URL?.trim();
  if (!shopUrl) return null;

  const promo = await getGptPromoPrice();
  const price = promo ? promo.price.toFixed(1) : null;

  return (
    <a
      href={shopUrl}
      target="_blank"
      rel="sponsored nofollow noopener noreferrer"
      aria-label={price ? `推广：GPT Plus 代充 ${price} 元` : "推广：GPT Plus 代充"}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-500 font-semibold text-white no-underline shadow-sm transition-colors hover:bg-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 ${
        compact ? "h-8 px-3 text-[12.5px]" : "h-9 px-3.5 text-[13px]"
      }`}
    >
      <span>GPT Plus 代充</span>
      {price && <span className="font-mono text-[1.02em] tracking-tight">¥{price}</span>}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden>
        <path d="M5 12h14m-5-5 5 5-5 5" />
      </svg>
    </a>
  );
}
