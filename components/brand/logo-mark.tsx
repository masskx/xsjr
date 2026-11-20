/**
 * The 学术蒟蒻 mark: a vermilion seal (印章) holding an open book with a sprout growing from its
 * spine: a beginner (蒟蒻) growing out of scholarship. 蒟蒻 is also the konjac plant, hence the
 * leaves. Pure SVG, no text, so it renders identically everywhere and works as the favicon.
 */
export function LogoMark({ size = 32, className = "", title }: { size?: number; className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      {/* seal with a slightly irregular, hand-cut edge */}
      <path
        d="M3.2 2.4 L16 1.9 L28.9 2.5 Q29.7 2.6 29.7 3.4 L30.1 16 L29.6 28.8 Q29.5 29.6 28.7 29.6 L16 30.1 L3.3 29.7 Q2.4 29.6 2.4 28.8 L1.9 16 L2.4 3.2 Q2.5 2.4 3.2 2.4 Z"
        fill="var(--logo-seal, #b0412b)"
      />
      <g fill="var(--logo-paper, #faf7f0)">
        {/* open book */}
        <path d="M6.2 21.6 Q11 19.4 16 21.8 Q21 19.4 25.8 21.6 L25.8 24.6 Q21 22.5 16 24.9 Q11 22.5 6.2 24.6 Z" />
        {/* left leaf */}
        <path d="M15.6 15.4 C11.8 15.6 9.4 13.3 9.1 9.9 C12.8 9.8 15.3 12 15.6 15.4 Z" />
        {/* right leaf: the broad konjac leaf */}
        <path d="M16.4 13.2 C16.4 9.1 19.1 6.1 23.6 5.9 C23.7 10.2 20.8 13.1 16.4 13.2 Z" />
      </g>
      {/* stem and the book's spine */}
      <path d="M16 21.6 C16 18.6 15.9 15.6 16.1 12.4" stroke="var(--logo-paper, #faf7f0)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <path d="M16 21.9 L16 24.8" stroke="var(--logo-seal, #b0412b)" strokeWidth="0.9" />
    </svg>
  );
}
