"use client";
import { useEffect, useId, useRef, useState } from "react";
import { NAME_NOTE } from "@/lib/site";

/**
 * "蒟蒻" in the wordmark is a small Easter egg: hover, focus or tap it to see the pinyin and what
 * the word means. Keyboard: Tab to it, Enter/Space toggles, Escape closes.
 */
export function NameEgg({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);
  return (
    <span ref={ref} className={`group relative inline-block ${className}`} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-expanded={open}
        aria-describedby={id}
        onClick={() => setOpen((o) => !o)}
        className="cursor-help border-b border-dotted border-zinc-400 leading-none text-inherit"
      >
        {NAME_NOTE.word}
      </button>
      <span
        id={id}
        role="tooltip"
        className={`absolute left-1/2 top-full z-50 mt-3 w-64 -translate-x-1/2 rounded-[3px] border border-rule bg-paper-raised p-4 text-left shadow-lg transition-opacity duration-150 ${open ? "visible opacity-100" : "invisible opacity-0"}`}
      >
        <span className="block text-center font-display text-[30px] leading-tight text-zinc-900">
          <ruby>
            蒟<rt className="font-mono text-[11px] tracking-wider text-vermilion">jǔ</rt>
          </ruby>
          <ruby>
            蒻<rt className="font-mono text-[11px] tracking-wider text-vermilion">ruò</rt>
          </ruby>
        </span>
        <span className="mt-2 block text-[13px] leading-6 text-zinc-800">{NAME_NOTE.meaning}</span>
        <span className="block text-[12.5px] leading-6 text-zinc-500">{NAME_NOTE.origin}</span>
        <span className="mt-2 block border-t border-rule pt-2 text-[12.5px] leading-6 text-zinc-700">{NAME_NOTE.motto}</span>
      </span>
    </span>
  );
}
