import type { NextConfig } from "next";

const brain = process.env.BRAIN_URL || "http://127.0.0.1:8000";
const exporting = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(exporting ? { output: "export" as const, images: { unoptimized: true } } : {}),
  async rewrites() {
    if (exporting) return [];
    return [
      { source: "/b", destination: `${brain}/` },
      { source: "/b/:path*", destination: `${brain}/:path*` },
    ];
  },
};

export default nextConfig;
