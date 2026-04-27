import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["onnxruntime-node", "sharp"],
  outputFileTracingIncludes: {
    // Only include ONNX models for face recognition routes (not all /api/*)
    "/api/faces/recognize": ["./models/**/*"],
    "/api/faces/train": ["./models/**/*"],
    "/api/faces/train-stored": ["./models/**/*"],
    "/api/face/recognize": ["./models/**/*"],
    "/api/images": ["./models/**/*"],
  },
  outputFileTracingExcludes: {
    // Exclude unused platform binaries from all routes
    "*": [
      "./node_modules/onnxruntime-node/bin/napi-v6/win32/**/*",
      "./node_modules/onnxruntime-node/bin/napi-v6/darwin/**/*",
    ],
  },
};

export default nextConfig;
