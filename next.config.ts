import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phase 2: server-rendered. "standalone" emits a self-contained server.js with only the traced
  // node_modules, which is what infra/ ships (never build on the server: 3.7 GB RAM).
  output: "standalone",
  // Phase 1 URLs all end in "/"; keep them byte-identical.
  trailingSlash: true,
  // Caddy sets these; the app does not need to advertise itself.
  poweredByHeader: false,
  images: { unoptimized: true },
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
