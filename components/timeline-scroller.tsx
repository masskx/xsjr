"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Horizontal scroll area with previous/next buttons and fading edges. Works without JS too. */
export function TimelineScroller({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setEdges({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth > el.scrollWidth - 8 });
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  const by = (dir: number) => ref.current?.scrollBy({ left: dir * Math.max(320, (ref.current?.clientWidth ?? 600) * 0.7), behavior: "smooth" });
  const btn =
    "grid h-10 w-10 place-items-center rounded-full border border-rule bg-paper-raised text-zinc-800 shadow-md transition-opacity disabled:opacity-0";
  return (
    <div className="relative">
      <div
        ref={ref}
        tabIndex={0}
        role="region"
        aria-label={label}
        className="thin-scroll overflow-x-auto overscroll-x-contain px-4 pb-6 pt-4 sm:px-6 [scrollbar-width:thin]"
        style={{ maskImage: `linear-gradient(to right, ${edges.start ? "black" : "transparent"}, black 6%, black 94%, ${edges.end ? "black" : "transparent"})` }}
      >
        <div className="mx-auto w-max lg:pl-[max(0px,calc((100vw-72rem)/2))]">{children}</div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-1/2 hidden -translate-y-1/2 justify-between px-3 sm:flex">
        <button type="button" aria-label="向前" onClick={() => by(-1)} disabled={edges.start} className={`pointer-events-auto ${btn}`}>
          ←
        </button>
        <button type="button" aria-label="向后" onClick={() => by(1)} disabled={edges.end} className={`pointer-events-auto ${btn}`}>
          →
        </button>
      </div>
    </div>
  );
}
