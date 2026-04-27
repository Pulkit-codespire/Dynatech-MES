import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Face recognition routes are disabled for deployment (route.ts.disabled).
  // Uncomment below when re-enabling them:
  // serverExternalPackages: ["onnxruntime-node", "sharp"],
  // outputFileTracingIncludes: { "/api/faces/recognize": ["./models/**/*"], ... },
  // outputFileTracingExcludes: { "/api/faces/recognize": ["node_modules/onnxruntime-node/bin/napi-v6/win32/**/*", ...], ... },
};

export default nextConfig;
