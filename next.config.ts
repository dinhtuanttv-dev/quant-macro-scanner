import type { NextConfig } from "next";

const ALLOWED_ORIGINS = [
  "https://global-quanta.vercel.app",
  "https://global-quanta-git-main-dinhtuanttv-devs-projects.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "https://global-quanta.vercel.app" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,DELETE,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization, X-Requested-With" },
          { key: "Access-Control-Max-Age", value: "86400" },
        ],
      },
    ];
  },
};

export default nextConfig;
