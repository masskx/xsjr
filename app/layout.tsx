import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { SITE_DESC, SITE_NAME, SITE_TAGLINE, SITE_URL, NAV } from "@/lib/site";
import { HeaderSearch } from "@/components/header-search";
import { AccountLink } from "@/components/account-link";
import { Analytics } from "@/components/analytics";

// Every page renders per request: content comes from PostgreSQL and SITE_URL (canonical URLs,
// metadataBase) is runtime configuration, so nothing may be frozen at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s｜${SITE_NAME}`,
  },
  description: SITE_DESC,
  keywords: [
    "科研提示词",
    "AI Skills",
    "Agent Skills",
    "科研工具",
    "Claude Code",
    "论文写作",
    "科研绘图",
  ],
  openGraph: {
    type: "website",
    locale: "zh_CN",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESC,
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/85 backdrop-blur">
          <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
            <Link
              href="/"
              className="flex shrink-0 items-center gap-2 no-underline"
            >
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-zinc-900 text-[15px] font-semibold text-white">
                研
              </span>
              <span className="hidden text-[15px] font-semibold tracking-tight text-zinc-900 sm:block">
                {SITE_NAME}
              </span>
            </Link>

            <nav className="hidden items-center gap-1 md:flex">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-lg px-3 py-2 text-sm text-zinc-600 no-underline transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-3">
              <HeaderSearch />
              <AccountLink />
            </div>
          </div>

          {/* 移动端导航：横向滚动，不做汉堡菜单 */}
          <nav className="flex gap-1 overflow-x-auto border-t border-zinc-100 px-4 py-2 md:hidden">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="shrink-0 rounded-md px-2.5 py-1.5 text-sm text-zinc-600 no-underline"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>

        <main className="flex-1">{children}</main>
        <Analytics />

        <footer className="mt-20 border-t border-zinc-200 bg-zinc-50">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-md bg-zinc-900 text-sm font-semibold text-white">
                  研
                </span>
                <span className="text-sm font-semibold text-zinc-900">
                  {SITE_NAME}
                </span>
              </div>
              <p className="mt-3 max-w-sm text-sm leading-6 text-zinc-500">
                平台只负责筛选、规范化描述与分发，不内置大模型、不执行任何第三方脚本。资源在你自己的
                Agent / IDE 里使用。
              </p>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                资源
              </h3>
              <ul className="mt-3 space-y-2 text-sm">
                {NAV.map((n) => (
                  <li key={n.href}>
                    <Link
                      href={n.href}
                      className="text-zinc-600 no-underline hover:text-zinc-900"
                    >
                      {n.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                关于
              </h3>
              <ul className="mt-3 space-y-2 text-sm text-zinc-600">
                <li>
                  <Link
                    href="/about/"
                    className="no-underline hover:text-zinc-900"
                  >
                    平台说明与边界
                  </Link>
                </li>
                <li>
                  <Link
                    href="/about/#license"
                    className="no-underline hover:text-zinc-900"
                  >
                    版权与转载规则
                  </Link>
                </li>
                <li>
                  <Link
                    href="/about/#report"
                    className="no-underline hover:text-zinc-900"
                  >
                    举报侵权 / 失效链接
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-zinc-200 py-5 text-center text-xs text-zinc-400">
            本站内容按各自许可证分发；第三方资源版权归原作者所有。
          </div>
        </footer>
      </body>
    </html>
  );
}
