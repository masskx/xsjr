"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Horizontal timeline with a slow, looping "flow": one milestone every `dwellMs`, centred in the
 * viewport, wrapping back to the first item after the last one. Users can pause, step one item at
 * a time, or scroll freely — hovering or focusing the track holds the flow so it cannot move while
 * being read.
 *
 * Without JavaScript the track is a plain horizontally scrollable list, and
 * `prefers-reduced-motion: reduce` disables the flow entirely.
 */
export function TimelineScroller({
  children,
  label,
  count = 0,
  autoplay = true,
  dwellMs = 3000,
}: {
  children: ReactNode;
  label: string;
  count?: number;
  autoplay?: boolean;
  dwellMs?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(autoplay);
  const [reduced, setReduced] = useState(false);
  const [tick, setTick] = useState(0);
  const [ratio, setRatio] = useState(0);
  const hold = useRef(false);

  // Respect the OS "reduce motion" setting: no automatic flow, no smooth scrolling.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      setReduced(mq.matches);
      if (mq.matches) setPlaying(false);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const nodes = useCallback(
    () => Array.from(ref.current?.querySelectorAll<HTMLElement>("[data-tl-item]") ?? []),
    [],
  );

  /** Put item `i` in the middle of the viewport. */
  const centreOn = useCallback(
    (i: number) => {
      const el = ref.current;
      if (!el) return;
      const item = nodes()[i];
      if (!item) return;
      const er = el.getBoundingClientRect();
      const ir = item.getBoundingClientRect();
      const left = el.scrollLeft + (ir.left - er.left) - (er.width - ir.width) / 2;
      el.scrollTo({ left, behavior: reduced ? "auto" : "smooth" });
    },
    [nodes, reduced],
  );

  // Mark the current node so CSS can highlight it.
  useEffect(() => {
    nodes().forEach((el, i) => {
      if (i === active) el.setAttribute("data-active", "true");
      else el.removeAttribute("data-active");
    });
  }, [active, nodes]);

  useEffect(() => {
    centreOn(active);
  }, [active, centreOn]);

  // The flow itself: one step per dwell, wrapping at the end.
  useEffect(() => {
    if (!playing || reduced || count < 2) return;
    const id = window.setTimeout(() => {
      // While the pointer or keyboard focus is inside the track, keep the tick alive but do not move.
      if (hold.current) {
        setTick((t) => t + 1);
        return;
      }
      setActive((i) => (i + 1) % count);
    }, dwellMs);
    return () => window.clearTimeout(id);
  }, [playing, reduced, count, dwellMs, active, tick]);

  // Fading edges and progress readout.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      setEdges({
        start: el.scrollLeft < 8,
        end: el.scrollLeft + el.clientWidth > el.scrollWidth - 8,
      });
      const max = el.scrollWidth - el.clientWidth;
      setRatio(max > 8 ? Math.min(1, Math.max(0, el.scrollLeft / max)) : 1);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const jump = (i: number) => setActive(Math.min(Math.max(i, 0), Math.max(count - 1, 0)));

  const btn =
    "grid h-10 w-10 place-items-center rounded-full border border-rule bg-paper-raised text-zinc-800 shadow-md transition-opacity disabled:opacity-0";
  const ctl =
    "inline-flex h-8 items-center gap-1.5 rounded-[3px] border border-rule bg-paper-raised px-2.5 font-mono text-[11.5px] tracking-[0.06em] text-zinc-700 transition-colors hover:bg-paper disabled:opacity-40";

  return (
    <div className="relative">
      <div className="relative">
        <div
          ref={ref}
          tabIndex={0}
          role="region"
          aria-label={label}
          onPointerEnter={() => {
            hold.current = true;
          }}
          onPointerLeave={() => {
            hold.current = false;
          }}
          onFocus={() => {
            hold.current = true;
          }}
          onBlur={() => {
            hold.current = false;
          }}
          className="thin-scroll overflow-x-auto overscroll-x-contain px-4 pb-2 pt-4 sm:px-6 [scrollbar-width:thin]"
          style={{
            maskImage: `linear-gradient(to right, ${edges.start ? "black" : "transparent"}, black 6%, black 94%, ${edges.end ? "black" : "transparent"})`,
          }}
        >
          <div className="mx-auto w-max lg:pl-[max(0px,calc((100vw-72rem)/2))]">{children}</div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-1/2 hidden -translate-y-1/2 justify-between px-3 sm:flex">
          <button
            type="button"
            aria-label="向前"
            onClick={() => ref.current?.scrollBy({ left: -Math.max(320, (ref.current?.clientWidth ?? 600) * 0.7), behavior: reduced ? "auto" : "smooth" })}
            disabled={edges.start}
            className={`pointer-events-auto ${btn}`}
          >
            ←
          </button>
          <button
            type="button"
            aria-label="向后"
            onClick={() => ref.current?.scrollBy({ left: Math.max(320, (ref.current?.clientWidth ?? 600) * 0.7), behavior: reduced ? "auto" : "smooth" })}
            disabled={edges.end}
            className={`pointer-events-auto ${btn}`}
          >
            →
          </button>
        </div>
      </div>

      {/* Playback controls: pause/resume, one step at a time, and how far along we are. */}
      {count > 1 && (
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-2 px-4 pb-8 sm:px-6">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            disabled={reduced}
            aria-pressed={playing && !reduced}
            className={ctl}
            title={reduced ? "系统已开启「减少动态效果」，自动播放不可用" : undefined}
          >
            <span aria-hidden>{playing && !reduced ? "❙❙" : "▶"}</span>
            {playing && !reduced ? "暂停" : "播放"}
          </button>
          <button type="button" onClick={() => jump(active - 1)} disabled={active === 0} className={ctl} aria-label="上一个节点">
            ‹ 上一条
          </button>
          <button type="button" onClick={() => jump(active + 1)} disabled={active >= count - 1} className={ctl} aria-label="下一个节点">
            下一条 ›
          </button>

          <div className="mx-1 h-px min-w-16 flex-1 bg-rule">
            <div
              className="h-px bg-ink transition-[width] duration-300 ease-out"
              style={{ width: `${Math.round(ratio * 100)}%` }}
            />
          </div>

          <span className="font-mono text-[11px] tabular-nums tracking-[0.08em] text-zinc-500" aria-live="off">
            {String(active + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
          </span>
        </div>
      )}
    </div>
  );
}
