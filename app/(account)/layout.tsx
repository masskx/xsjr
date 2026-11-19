import type { Metadata } from "next";

// Account pages are personal or transactional: never indexed, never in the sitemap.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AccountGroupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
