import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // uuid v13 ships ESM-only, so it must be transpiled by SWC for both
  // the Next.js webpack build and the Jest test environment.
  transpilePackages: ["uuid"],
};

export default nextConfig;
