import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["onnxruntime-node", "sharp"],
  outputFileTracingIncludes: { "/api/*": ["./models/**/*"] },
};

export default nextConfig;
