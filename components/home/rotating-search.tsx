"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

/** Search pill whose placeholder types out example searches; submitting goes to /search/. */
export function RotatingSearch({ examples }: { examples: string[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [shown, setShown] = useState("");
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !examples.length) {
      setShown(examples[0] ?? "");
      return;
    }
    let word = 0;
    let pos = 0;
    let deleting = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const w = examples[word];
      if (!deleting) {
        pos++;
        setShown(w.slice(0, pos));
        if (pos >= w.length) {
          deleting = true;
          timer = setTimeout(tick, 1600);
          return;
        }
      } else {
        pos--;
        setShown(w.slice(0, pos));
        if (pos <= 0) {
          deleting = false;
          word = (word + 1) % examples.length;
        }
      }
      timer = setTimeout(tick, deleting ? 45 : 110);
    };
    timer = setTimeout(tick, 900);
    return () => clearTimeout(timer);
  }, [examples]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const v = q.trim() || "";
    router.push(v ? `/search/?q=${encodeURIComponent(v)}` : "/search/");
  }
  return (
    <form onSubmit={submit} className="flex w-full max-w-[600px] items-center gap-2 rounded-full border border-zinc-200 bg-white p-1.5 pl-5 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.18)] transition-shadow focus-within:border-zinc-400">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[18px] w-[18px] shrink-0 text-zinc-400" aria-hidden>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="搜索资源"
        placeholder={`搜索：${shown}`}
        className="h-10 min-w-0 flex-1 bg-transparent text-[15px] text-zinc-900 outline-none placeholder:text-zinc-400"
      />
      <button type="submit" className="h-10 shrink-0 rounded-full bg-zinc-100 px-4 text-[14px] font-medium text-zinc-800 transition-colors hover:bg-zinc-200">
        搜索
      </button>
    </form>
  );
}
