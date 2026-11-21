/**
 * Headline whose characters rise in one after another (pure CSS, no JavaScript). Screen readers
 * get the plain text once; the animated spans are hidden from them.
 */
export function TypedTitle({ lines, accent, after, className = "" }: { lines: string[]; accent?: string; after?: React.ReactNode; className?: string }) {
  let i = 0;
  return (
    <h1 className={className}>
      <span className="sr-only">{lines.join("")}</span>
      <span aria-hidden>
        {lines.map((line, li) => (
          <span key={li} className="block">
            {[...line].map((ch, ci) => {
              const delay = 40 * i++;
              const accented = accent && line.includes(accent) && line.indexOf(accent) <= ci && ci < line.indexOf(accent) + [...accent].length;
              return (
                <span key={ci} className={`char-in inline-block whitespace-pre ${accented ? "text-vermilion" : ""}`} style={{ animationDelay: `${delay}ms` }}>
                  {ch}
                </span>
              );
            })}
            {li === lines.length - 1 && after}
          </span>
        ))}
      </span>
    </h1>
  );
}
