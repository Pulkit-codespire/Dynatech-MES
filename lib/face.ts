/**
 * Face recognition utility using @vladmandic/face-api + @tensorflow/tfjs.
 *
 * Singleton: models load once per Node.js process.
 * ONLY import in Node.js runtime routes (never in client components).
 */

import path from "path";

// face-api.node.js requires @tensorflow/tfjs-node — we provide a shim
// that re-exports @tensorflow/tfjs (pure JS CPU) since tfjs-node won't
// build on Node 24+.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const faceapi = require("@vladmandic/face-api");

export type FaceDescriptor = Float32Array;

let initialised = false;
let initPromise: Promise<void> | null = null;

const MODELS_PATH = path.join(process.cwd(), "models");

export async function ensureFaceApiReady(): Promise<void> {
  if (initialised) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const { Canvas, Image, ImageData } = await import("canvas");
    faceapi.env.monkeyPatch({
      Canvas: Canvas as unknown as typeof HTMLCanvasElement,
      Image: Image as unknown as typeof HTMLImageElement,
      ImageData: ImageData as unknown as typeof globalThis.ImageData,
    });

    await faceapi.tf.setBackend("cpu");
    await faceapi.tf.ready();

    await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODELS_PATH);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS_PATH);
    await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS_PATH);

    initialised = true;
  })();

  return initPromise;
}

/**
 * Extract a 128-dimensional face descriptor from an image buffer.
 * Returns null if no face is detected.
 */
export async function extractDescriptor(
  imageBuffer: Buffer
): Promise<FaceDescriptor | null> {
  await ensureFaceApiReady();

  const { loadImage, createCanvas } = await import("canvas");
  const img = await loadImage(imageBuffer);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  const detection = await faceapi
    .detectSingleFace(
      canvas as unknown as HTMLCanvasElement,
      new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 })
    )
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) return null;
  return detection.descriptor as FaceDescriptor;
}

/** Serialize Float32Array to number[] for Postgres vector insertion */
export function descriptorToArray(d: FaceDescriptor): number[] {
  return Array.from(d);
}

/** Deserialize from number[] back to Float32Array */
export function arrayToDescriptor(a: number[]): FaceDescriptor {
  return new Float32Array(a);
}
