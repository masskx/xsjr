import type { NextConfig } from "next";

// Content Security Policy (production builds only: the dev server needs eval). Next inlines its
// hydration data as <script> tags, so script-src needs 'unsafe-inline' until we move to nonces;
// everything else is locked to this origin: no third-party scripts, styles, frames or form targets.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    if (process.env.NODE_ENV !== "production") return [];
    return [{ source: "/:path*", headers: [{ key: "Content-Security-Policy", value: CSP }] }];
  },
  // Phase 2: server-rendered. "standalone" emits a self-contained server.js with only the traced
  // node_modules, which is what infra/ ships (never build on the server: 3.7 GB RAM).
  output: "standalone",
  // Phase 1 URLs all end in "/"; keep them byte-identical.
  trailingSlash: true,
  // Caddy sets these; the app does not need to advertise itself.
  poweredByHeader: false,
  images: { unoptimized: true },
  // The uploads directory is computed at runtime (lib/media/storage.ts); the file tracer cannot
  // resolve it and would otherwise copy the whole project (sources, docs, old releases in dist/)
  // into the standalone server. Nothing below is read at runtime. build-release.mjs also fails if
  // anything unexpected reaches the release.
  outputFileTracingExcludes: {
    "/*": [
      "./dist/**/*",
      "./data/**/*",
      "./docs/**/*",
      "./tests/**/*",
      "./tools/**/*",
      "./infra/**/*",
      "./scripts/**/*",
      "./drizzle/**/*",
      "./content/**/*",
      "./app/**/*",
      "./components/**/*",
      "./lib/**/*",
      "./*.md",
      "./LICENSE",
      "./*.ts",
      "./*.mts",
      "./*.json",
      "./*.tsbuildinfo",
    ],
  },
  // Structure-diagram uploads go through a server action: images are capped at 2 MB by the
  // validator (lib/media/images.ts); the multipart envelope needs a little headroom.
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
