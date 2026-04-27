import type { NextConfig } from "next";

// Vercel runs Linux x64 — exclude all other onnxruntime platform binaries
// to stay under the 250 MB serverless function size limit.
const onnxExcludes = [
  "node_modules/onnxruntime-node/bin/napi-v6/win32/**/*",
  "node_modules/onnxruntime-node/bin/napi-v6/darwin/**/*",
  "node_modules/onnxruntime-node/bin/napi-v6/linux/arm64/**/*",
];

// Routes that use ONNX (face detection / recognition)
const faceRoutes = [
  "/api/faces/recognize",
  "/api/faces/train",
  "/api/faces/train-stored",
  "/api/face/recognize",
  "/api/images",
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["onnxruntime-node", "sharp"],
  outputFileTracingIncludes: Object.fromEntries(
    faceRoutes.map((r) => [r, ["./models/**/*"]])
  ),
  outputFileTracingExcludes: Object.fromEntries(
    faceRoutes.map((r) => [r, onnxExcludes])
  ),
};

export default nextConfig;
