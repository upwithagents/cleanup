import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the project root: sibling lockfiles in the multi-repo workspace
  // otherwise make Next infer the wrong root for build artifacts.
  turbopack: { root: __dirname },
};

export default nextConfig;
