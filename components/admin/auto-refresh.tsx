"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-render the server page every few seconds while a job is still running. */
export function AutoRefresh({ active, seconds = 3 }: { active: boolean; seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [active, seconds, router]);
  return active ? (
    <p role="status" className="text-[12.5px] text-zinc-500">
      任务进行中，页面每 {seconds} 秒自动刷新。
    </p>
  ) : null;
}
