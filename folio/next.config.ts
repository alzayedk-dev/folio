import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Local build checks use a separate folder (NEXT_DIST_DIR=.next-build) so they never clash with the running dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
