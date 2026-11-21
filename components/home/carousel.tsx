"use client";
import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Infinite, auto-advancing card carousel (like a showroom). The slides are rendered three times;
 * the track sits on the middle copy and silently jumps back when it drifts into a neighbour, so it
 * never runs out. Pauses on hover, focus and when the tab is hidden; no autoplay with reduced
 * motion. Arrow buttons and the keyboard (when focused) move one card.
 */
export function Carousel({ children, label, interval = 4800 }: { children: ReactNode; label: string; interval?: number }) {
  const slides = Children.toArray(children);
  const n = slides.length;
  const [index, setIndex] = useState(n); // first card of the middle copy
  const [animate, setAnimate] = useState(true);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
  }, []);

  // measure one card + gap
  const measure = useCallback(() => {
    const first = trackRef.current?.children[0] as HTMLElement | undefined;
    const second = trackRef.current?.children[1] as HTMLElement | undefined;
    if (first && second) setStep(second.offsetLeft - first.offsetLeft);
  }, []);
  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  const go = useCallback((d: number) => {
    setAnimate(true);
    setIndex((i) => i + d);
  }, []);

  // autoplay
  useEffect(() => {
    if (paused || reduced || n < 2) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") go(1);
    }, interval);
    return () => clearInterval(t);
  }, [paused, reduced, n, interval, go]);

  // seamless wrap once the slide transition ends
  const onEnd = () => {
    if (index >= 2 * n || index < n) {
      setAnimate(false);
      setIndex((i) => ((i - n) % n + n) % n + n);
    }
  };
  useEffect(() => {
    if (!animate) {
      const r = requestAnimationFrame(() => setAnimate(true));
      return () => cancelAnimationFrame(r);
    }
  }, [animate]);

  const current = ((index - n) % n + n) % n;
  return (
    <div
      className="relative"
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(1);
        if (e.key === "ArrowLeft") go(-1);
      }}
    >
      <div className="overflow-hidden">
        <div
          ref={trackRef}
          onTransitionEnd={onEnd}
          className="flex gap-4"
          style={{
            transform: `translateX(calc(50% - ${index * step}px - var(--card-w) / 2))`,
            transition: animate && step ? "transform 700ms cubic-bezier(0.22, 1, 0.36, 1)" : "none",
            ["--card-w" as string]: "min(640px, 86vw)",
          }}
        >
          {[0, 1, 2].flatMap((copy) =>
            slides.map((s, i) => (
              <div
                key={`${copy}-${i}`}
                className="w-[var(--card-w)] shrink-0 transition-opacity duration-500"
                style={{ opacity: copy * n + i === index ? 1 : 0.55 }}
                aria-hidden={copy * n + i !== index}
                inert={copy * n + i !== index}
              >
                {s}
              </div>
            )),
          )}
        </div>
      </div>
      <div className="mt-6 flex items-center justify-center gap-3">
        <button type="button" aria-label="上一张" onClick={() => go(-1)} className="grid h-12 w-12 place-items-center rounded-full bg-zinc-100 text-zinc-800 transition-colors hover:bg-zinc-200">
          ←
        </button>
        <div className="flex gap-1.5" aria-hidden>
          {slides.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all duration-500 ${i === current ? "w-6 bg-zinc-900" : "w-1.5 bg-zinc-300"}`} />
          ))}
        </div>
        <button type="button" aria-label="下一张" onClick={() => go(1)} className="grid h-12 w-12 place-items-center rounded-full bg-zinc-100 text-zinc-800 transition-colors hover:bg-zinc-200">
          →
        </button>
      </div>
      <p className="sr-only" aria-live="polite">
        第 {current + 1} 张，共 {n} 张
      </p>
    </div>
  );
}
