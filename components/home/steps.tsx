"use client";
import { useEffect, useState, type ReactNode } from "react";

export interface Step {
  title: string;
  text: string;
  visual: ReactNode;
}

/** Steps that advance on their own (with a progress bar); clicking one selects it. */
export function Steps({ steps, interval = 4200 }: { steps: Step[]; interval?: number }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => setActive((a) => (a + 1) % steps.length), interval);
    return () => clearTimeout(t);
  }, [active, paused, interval, steps.length, tick]);
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={s.title}>
            <button
              type="button"
              aria-current={i === active ? "step" : undefined}
              onClick={() => {
                setActive(i);
                setTick((x) => x + 1);
              }}
              className={`w-full rounded-2xl px-5 py-4 text-left transition-colors ${i === active ? "bg-zinc-100" : "hover:bg-zinc-50"}`}
            >
              <span className="flex items-baseline gap-3">
                <span className={`font-mono text-[12px] ${i === active ? "text-zinc-900" : "text-zinc-400"}`}>0{i + 1}</span>
                <span className={`text-[17px] font-semibold ${i === active ? "text-zinc-950" : "text-zinc-500"}`}>{s.title}</span>
              </span>
              <span className={`grid transition-[grid-template-rows] duration-500 ${i === active ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                <span className="overflow-hidden">
                  <span className="mt-2 block pl-8 text-[14px] font-light leading-6 text-zinc-600">{s.text}</span>
                  {i === active && !paused && (
                    <span className="mt-3 ml-8 block h-0.5 overflow-hidden rounded-full bg-zinc-200">
                      <span key={`${active}-${tick}`} className="step-progress block h-full bg-zinc-900" style={{ animationDuration: `${interval}ms` }} />
                    </span>
                  )}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>
      <div className="relative min-h-[340px] overflow-hidden rounded-[28px] bg-zinc-100 p-6 sm:p-8" aria-live="polite">
        {steps.map((s, i) => (
          <div
            key={s.title}
            aria-hidden={i !== active}
            className={`absolute inset-6 transition-all duration-500 sm:inset-8 ${i === active ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"}`}
          >
            {s.visual}
          </div>
        ))}
      </div>
    </div>
  );
}
