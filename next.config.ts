import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3's native addon locates itself via V8 stack traces,
  // which breaks under `next dev --webpack`'s rewritten require calls -
  // externalizing it (and the Prisma driver adapter that loads it) skips
  // webpack bundling entirely so the normal Node require path is used.
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3"],
  // Pin the project root: sibling lockfiles in the multi-repo workspace
  // otherwise make Next infer the wrong root for build artifacts.
  turbopack: { root: __dirname },
  basePath: "/cleanup",
};

export default nextConfig;
