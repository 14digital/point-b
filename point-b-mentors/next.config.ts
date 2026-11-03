import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next dev` runs beside the API on :4000, so /api is proxied there. In production server.js serves /api itself.
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    return [{ source: "/api/:path*", destination: `${process.env.API_DEV_URL ?? "http://localhost:4000"}/api/:path*` }];
  },
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
