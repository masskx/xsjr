"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Continuously flowing horizontal timeline.
 *
 * The track is rendered twice by the caller ([data-tl-copy]); the flow advances `scrollLeft` at a
 * constant speed and, on passing exactly one copy width, subtracts that width — so the motion never
 * stops, never jumps, and never runs out of content. The copy sitting in the middle of the viewport
 * is highlighted, and its year travels along under the controls.
 *
 * Pausing: hovering, focusing or touching the track holds the flow; the button stops it entirely.
 * `prefers-reduced-motion: reduce` keeps it stopped, and without JavaScript the track is a plain
 * horizontally scrollable list containing every milestone.
 */
export function TimelineScroller({
  children,
  label,
  count = 0,
  step = 212,
  speed = 34,
  autoplay = true,
}: {
  children: ReactNode;
  label: string;
  /** number of milestones in ONE copy of the track */
  count?: number;
  /** px per milestone, used by the previous/next buttons */
  step?: number;
  /** flow speed in px per second */
  speed?: number;
  autoplay?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(autoplay);
  const [reduced, setReduced] = useState(false);
  const [now, setNow] = useState<{ year: string; title: string } | null>(null);
  const hold = useRef(false);
  const raf = useRef<number | null>(null);
  const lastFrame = useRef(0);

  // Respect the OS setting: no flow at all, and no smooth scrolling.
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

  /** Mark the milestone currently nearest the middle of the viewport. */
  const track = useCallback(() => {
    const el = ref.current;
    if (!el || count < 1) return;
    const list = nodes();
    if (!list.length) return;
    const box = el.getBoundingClientRect();
    const centre = box.left + box.width / 2;
    let best = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < list.length; i++) {
      const r = list[i].getBoundingClientRect();
      const distance = Math.abs(r.left + r.width / 2 - centre);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }
    const index = best % count;
    setActive((current) => (current === index ? current : index));
    const node = list[best];
    const year = node.dataset.year ?? "";
    const title = node.dataset.title ?? "";
    setNow((current) => (current?.year === year && current?.title === title ? current : { year, title }));
    list.forEach((n, i) => {
      if (i === best) n.setAttribute("data-active", "true");
      else n.removeAttribute("data-active");
    });
  }, [count, nodes]);

  // The flow. One rAF loop advances scrollLeft by speed * dt and wraps exactly one copy width.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const copy = el.querySelector<HTMLElement>("[data-tl-copy]");
    if (!copy) return;

    // Distance from the very start of the scroll content to the first copy, and one copy's width.
    const box = el.getBoundingClientRect();
    const start = copy.getBoundingClientRect().left - box.left + el.scrollLeft;
    const width = copy.offsetWidth;
    if (width <= 0) return;

    let lastPaint = 0;

    const frame = (t: number) => {
      const dt = lastFrame.current ? Math.min(0.05, (t - lastFrame.current) / 1000) : 0;
      lastFrame.current = t;

      if (playing && !hold.current) {
        el.scrollLeft += speed * dt;
        // seamless wrap: past the end of copy one, subtract one copy
        if (el.scrollLeft >= start + width) el.scrollLeft -= width;
      }

      // Tracking the centred node does not need 60 Hz.
      if (t - lastPaint > 120) {
        lastPaint = t;
        track();
      }

      raf.current = requestAnimationFrame(frame);
    };

    raf.current = requestAnimationFrame(frame);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      raf.current = null;
      lastFrame.current = 0;
    };
  }, [playing, speed, track]);

  // Fading edges.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () =>
      setEdges({
        start: el.scrollLeft < 8,
        end: el.scrollLeft + el.clientWidth > el.scrollWidth - 8,
      });
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const jump = (dir: number) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * step, behavior: reduced ? "auto" : "smooth" });
  };

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
          onPointerDown={() => {
            hold.current = true;
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
          <button type="button" onClick={() => jump(-1)} className={ctl} aria-label="上一条">
            ‹ 上一条
          </button>
          <button type="button" onClick={() => jump(1)} className={ctl} aria-label="下一条">
            下一条 ›
          </button>

          <div className="mx-1 h-px min-w-16 flex-1 bg-rule" aria-hidden />

          <span className="flex items-baseline gap-2 font-mono text-[11.5px] tracking-[0.06em]">
            <span className="tabular-nums text-zinc-900">{now?.year || "—"}</span>
            <span className="max-w-[16rem] truncate text-zinc-500">{now?.title ?? ""}</span>
          </span>
          <span className="font-mono text-[11px] tabular-nums text-zinc-400">
            {String(active + 1).padStart(2, "0")}/{String(count).padStart(2, "0")}
          </span>
        </div>
      )}
    </div>
  );
}
