import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 纯静态导出：服务器上不需要 Node 运行时，Caddy 直接托管 out/
  output: "export",
  trailingSlash: true,
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
