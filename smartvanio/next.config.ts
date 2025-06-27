import type { NextConfig } from "next";

const basePath = process.env.BASE_PATH || "";
const token = process.env.SUPERVISOR_TOKEN || "";
const host = process.env.HA_HOST || "";
const websocketPath = "/api/websocket";

const nextConfig: NextConfig = {
  trailingSlash: false,
  assetPrefix: basePath,
  output: "standalone",
  publicRuntimeConfig: {
    basePath,
    token,
    host,
    websocketPath,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "brands.home-assistant.io",
      },
    ],
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: "/api/services/number/set_value",
        destination: `http://supervisor/core/api/services/number/set_value`,
      },
      {
        source: "/api/services/text/set_value",
        destination: `http://supervisor/core/api/services/text/set_value`,
      },
    ];
  },
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    // !! WARN !!
    ignoreBuildErrors: true,
  },
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
