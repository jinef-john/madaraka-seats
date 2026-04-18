import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // httpcloak is a Go-compiled native Node addon (.so shared library).
  // The scraper currently runs it via a child process (train.js), so Next.js
  // never bundles it. This entry is a safety net: if httpcloak is ever
  // imported directly inside a route handler, Next.js/Turbopack will leave
  // it unbundled and let Node.js require() handle it natively.
  serverExternalPackages: ["httpcloak"],
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Enables the stable `use cache` directive (and cacheLife / cacheTag APIs).
  cacheComponents: true,
};

export default nextConfig;
