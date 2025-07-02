import type { NextConfig } from "next";

const basePath = process.env.BASE_PATH || "";
const token = process.env.SUPERVISOR_TOKEN || "";
const host = process.env.HA_HOST || "";
const isHa = process.env.IS_HA || "";
const websocketPath = "/api/websocket";

console.log(
  "IS_HA",
  `http://${isHa ? "supervisor" : host}/core/api/services/number/set_value`
);

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
