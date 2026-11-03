import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Native modules load from node_modules at runtime instead of being bundled.
  serverExternalPackages: ["better-sqlite3", "@node-rs/argon2", "@prisma/adapter-better-sqlite3"],
};

export default nextConfig;
