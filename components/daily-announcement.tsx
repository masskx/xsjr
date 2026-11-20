"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const KEY = "rh-announcement-seen";

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
}

/**
 * Shows the current announcement once per day per browser. Editing an announcement (new
 * version) shows it again the same day. Without storage access it shows once per page load.
 */
export function DailyAnnouncement({ id, version, title, html }: { id: number; version: string; title: string; html: string }) {
  const path = usePathname() ?? "";
  const ref = useRef<HTMLDialogElement>(null);
  const [mark] = useState(() => `${id}:${version}:${today()}`);
  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(KEY) === mark;
    } catch {
      /* storage blocked */
    }
    // not on back-office pages
    if (!seen && !path.startsWith("/admin")) ref.current?.showModal?.();
  }, [mark, path]);
  const close = () => {
    try {
      localStorage.setItem(KEY, mark);
    } catch {
      /* ignore */
    }
    ref.current?.close();
  };
  return (
    <dialog
      ref={ref}
      aria-labelledby="ann-title"
      onCancel={close}
      className="m-auto w-[min(92vw,34rem)] rounded-[4px] border border-rule bg-paper-raised p-0 text-zinc-800 shadow-lg backdrop:bg-[oklch(13%_0_0/0.35)]"
    >
      <div className="border-b border-rule px-6 pb-4 pt-5">
        <span className="tag-gold">今日公告</span>
        <h2 id="ann-title" className="headline mt-3 text-[24px]">{title}</h2>
      </div>
      {html && <div className="md max-h-[55vh] overflow-y-auto px-6 py-4" dangerouslySetInnerHTML={{ __html: html }} />}
      <div className="flex justify-end gap-2 border-t border-rule px-6 py-4">
        <button type="button" onClick={close} className="btn-ink !min-h-10 text-sm" autoFocus>
          知道了，今天不再显示
        </button>
      </div>
    </dialog>
  );
}
