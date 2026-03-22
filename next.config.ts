import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  turbopack: {},
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
  serverExternalPackages: ['pdf-parse'],
  experimental: {
    proxyClientMaxBodySize: '200mb',
  },
};

export default nextConfig;
