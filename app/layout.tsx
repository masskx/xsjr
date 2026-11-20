import type { Metadata } from "next";
import Link from "next/link";
import "@fontsource-variable/albert-sans";
import "@fontsource-variable/alumni-sans";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import { SITE_DESC, SITE_NAME, SITE_TAGLINE, SITE_URL, NAV, filingNumbers } from "@/lib/site";
import { HeaderSearch } from "@/components/header-search";
import { AccountLink } from "@/components/account-link";
import { Analytics } from "@/components/analytics";
import { SiteNav } from "@/components/site-nav";

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
  const filing = filingNumbers();
  return (
    <html lang="zh-CN" className="h-full">
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-40 border-b border-rule bg-paper/90 backdrop-blur">
          <div className="mx-auto flex h-[62px] w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
            <Link
              href="/"
              className="flex shrink-0 items-center gap-2.5 no-underline"
            >
              <span className="grid h-8 w-8 place-items-center rounded-[3px] bg-ink text-[15px] font-medium text-white">
                研
              </span>
              <span className="hidden text-[15px] font-medium tracking-[0.12em] text-zinc-900 sm:block">
                {SITE_NAME}
              </span>
            </Link>

            <nav className="hidden items-center gap-1 md:ml-auto md:flex">
              <SiteNav />
            </nav>

            <div className="ml-auto flex items-center gap-3 md:ml-2">
              <HeaderSearch />
              <AccountLink />
            </div>
          </div>

          {/* 移动端导航：横向滚动，不做汉堡菜单 */}
          <nav className="flex gap-1 overflow-x-auto border-t border-rule px-2 py-1.5 md:hidden">
            <SiteNav mobile />
          </nav>
        </header>

        <main className="flex-1">{children}</main>
        <Analytics />

        <footer className="mt-24 border-t border-rule bg-paper-deep">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.6fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="grid h-7 w-7 place-items-center rounded-[3px] bg-ink text-sm font-medium text-white">
                  研
                </span>
                <span className="text-sm font-medium tracking-[0.12em] text-zinc-900">
                  {SITE_NAME}
                </span>
              </div>
              <p className="mt-4 max-w-sm text-sm font-light leading-7 text-zinc-600">
                平台只负责筛选、规范化描述与分发，不内置大模型、不执行任何第三方脚本。资源在你自己的
                Agent / IDE 里使用。
              </p>
            </div>

            <div>
              <h3 className="eyebrow text-zinc-500">资源</h3>
              <ul className="mt-4 space-y-2.5 text-sm">
                {NAV.map((n) => (
                  <li key={n.href}>
                    <Link href={n.href} className="link-line text-zinc-700 no-underline hover:underline">
                      {n.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="eyebrow text-zinc-500">关于</h3>
              <ul className="mt-4 space-y-2.5 text-sm text-zinc-700">
                <li>
                  <Link href="/about/" className="link-line text-zinc-700 no-underline hover:underline">
                    平台说明与边界
                  </Link>
                </li>
                <li>
                  <Link href="/about/#license" className="link-line text-zinc-700 no-underline hover:underline">
                    版权与转载规则
                  </Link>
                </li>
                <li>
                  <Link href="/about/#report" className="link-line text-zinc-700 no-underline hover:underline">
                    举报侵权 / 失效链接
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="rule-dots" aria-hidden />
          <div className="py-5 text-center font-mono text-[11px] tracking-wider text-zinc-500">
            本站内容按各自许可证分发；第三方资源版权归原作者所有。
            {(filing.icp || filing.psb) && (
              <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
                {filing.icp && (
                  <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" className="text-zinc-500 no-underline hover:text-zinc-800">
                    {filing.icp}
                  </a>
                )}
                {filing.psb && <span>{filing.psb}</span>}
              </div>
            )}
          </div>
        </footer>
      </body>
    </html>
  );
}
