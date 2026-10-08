import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/proposals/*/exports/*": ["./src/server/projects/proposal-template-v1/**/*"],
  },
};

export default nextConfig;
