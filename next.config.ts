import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { formats: ["image/avif", "image/webp"] },
  outputFileTracingRoot: process.cwd(),
  output: "standalone",
};

export default nextConfig;
