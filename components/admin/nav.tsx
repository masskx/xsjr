"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/admin/", label: "概览", exact: true },
  { href: "/admin/prompts/", label: "提示词" },
  { href: "/admin/modules/", label: "模块" },
  { href: "/admin/skills/", label: "Skills" },
  { href: "/admin/users/", label: "用户" },
];

export function AdminNav() {
  const path = usePathname() ?? "";
  return (
    <nav aria-label="后台导航" className="-mx-1 flex gap-1 overflow-x-auto">
      {ITEMS.map((item) => {
        const active = item.exact ? path === item.href || path === item.href.slice(0, -1) : path.startsWith(item.href.slice(0, -1));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-[13.5px] no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 ${
              active ? "bg-zinc-900 font-medium text-white" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
