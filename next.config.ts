import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Deliberately not a full script-src policy: Next/GSAP need a separate CSP rollout.
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'" },
        ],
      },
      { source: "/api/auth/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
  outputFileTracingIncludes: {
    "/api/proposals/*/exports/*": ["./src/server/projects/proposal-template-v1/**/*"],
  },
};

export default nextConfig;
