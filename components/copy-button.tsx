"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { track } from "./analytics";

export function CopyButton({
  text,
  label = "复制",
  className = "",
  variant = "primary",
}: {
  text: string;
  label?: string;
  className?: string;
  variant?: "primary" | "ghost";
}) {
  const [state, setState] = useState<"idle" | "done" | "fail">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = useCallback(async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // 非 HTTPS 环境（如 IP 直连）的兜底
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setState("done");
      track("copy");
    } catch {
      setState("fail");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1800);
  }, [text]);

  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-[3px] px-3 py-2 text-sm font-medium no-underline transition-all disabled:opacity-50";
  const styles =
    variant === "primary"
      ? "bg-zinc-900 text-white hover:bg-zinc-800"
      : "border border-rule bg-paper-raised text-zinc-800 shadow-xs hover:shadow-md";

  return (
    <button
      type="button"
      onClick={copy}
      className={`${base} ${styles} ${className}`}
    >
      {state === "done" ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className="h-4 w-4"
          aria-hidden
        >
          <path d="m5 13 4 4L19 7" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="h-4 w-4"
          aria-hidden
        >
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h8" />
        </svg>
      )}
      {state === "done" ? "已复制" : state === "fail" ? "复制失败" : label}
    </button>
  );
}
