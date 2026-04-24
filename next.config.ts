import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: [
    "@tensorflow/tfjs",
    "@tensorflow/tfjs-node",
    "@vladmandic/face-api",
    "canvas",
  ],
};

export default nextConfig;
