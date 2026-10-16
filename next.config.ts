import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Native / font-parsing packages must stay outside the bundle so they can load their binaries.
  serverExternalPackages: ["@resvg/resvg-js", "satori", "opentype.js"],
};

export default config;
