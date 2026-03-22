import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
  serverExternalPackages: ['pdf-parse', 'sharp'],
  experimental: {
    proxyClientMaxBodySize: '200mb',
  },
};

export default nextConfig;
