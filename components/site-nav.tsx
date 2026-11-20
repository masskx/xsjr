"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/lib/site";

/** Main navigation; the current section is marked with a teal dot (and aria-current). */
export function SiteNav({ mobile = false }: { mobile?: boolean }) {
  const path = usePathname() ?? "/";
  return (
    <>
      {NAV.map((item) => {
        const active = path === item.href || path.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex shrink-0 items-center gap-2 no-underline transition-colors ${
              mobile ? "px-2.5 py-1.5 text-[14px]" : "px-3 py-2 text-[15px]"
            } ${active ? "font-medium text-zinc-900" : "text-zinc-600 hover:text-zinc-900"}`}
          >
            {active && <span aria-hidden className="dot" />}
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
