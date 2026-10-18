/** @type {import("next").NextConfig} */
const nextConfig = {
  async redirects() { return [{source:"/documents/ready-room-event-flight-plan.pdf",destination:"/private-events#build-menu",permanent:true}]; },
  images: { formats: ["image/avif", "image/webp"] },
  outputFileTracingRoot: process.cwd(),
  output: "standalone",
};

export default nextConfig;
