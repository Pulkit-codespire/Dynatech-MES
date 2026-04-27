/**
 * Face detection + recognition using onnxruntime-node + sharp.
 *
 * Models: InsightFace buffalo_sc (SCRFD 500M + MobileFaceNet w600k).
 * Detection outputs bounding boxes + 5 keypoints.
 * Recognition outputs 512-dimensional L2-normalised embeddings.
 *
 * Singleton: ONNX sessions load once per Node.js process.
 * ONLY import in Node.js runtime routes (never in client components).
 */

import * as ort from "onnxruntime-node";
import sharp from "sharp";
import path from "path";

export type FaceDescriptor = Float32Array;

/* ------------------------------------------------------------------ */
/*  Model paths & session cache                                       */
/* ------------------------------------------------------------------ */

const MODELS_DIR = path.join(process.cwd(), "models");
const DET_MODEL = path.join(MODELS_DIR, "det_500m.onnx");
const REC_MODEL = path.join(MODELS_DIR, "w600k_mbf.onnx");

let detSession: ort.InferenceSession | null = null;
let recSession: ort.InferenceSession | null = null;
let initPromise: Promise<void> | null = null;

export async function ensureFaceApiReady(): Promise<void> {
  if (detSession && recSession) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    detSession = await ort.InferenceSession.create(DET_MODEL, {
      executionProviders: ["cpu"],
    });
    recSession = await ort.InferenceSession.create(REC_MODEL, {
      executionProviders: ["cpu"],
    });
  })();
  return initPromise;
}

/* ------------------------------------------------------------------ */
/*  SCRFD face detection                                              */
/* ------------------------------------------------------------------ */

interface FaceBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  score: number;
  /** 5 keypoints: leftEye, rightEye, nose, leftMouth, rightMouth */
  kps: [number, number][];
}

const DET_SIZE = 640;

// Output tensor names per stride (scores, bboxes, keypoints)
const DET_OUTPUTS = [
  { score: "443", bbox: "446", kps: "449", stride: 8 },
  { score: "468", bbox: "471", kps: "474", stride: 16 },
  { score: "493", bbox: "496", kps: "499", stride: 32 },
];

async function detectFaces(
  imageBuffer: Buffer,
  scoreThreshold = 0.5
): Promise<{ faces: FaceBox[]; origW: number; origH: number }> {
  await ensureFaceApiReady();

  const meta = await sharp(imageBuffer).metadata();
  const origW = meta.width!;
  const origH = meta.height!;

  // Compute scale to fit within DET_SIZE preserving aspect ratio
  const scale = Math.min(DET_SIZE / origW, DET_SIZE / origH);
  const resW = Math.round(origW * scale);
  const resH = Math.round(origH * scale);

  // Resize then pad to DET_SIZE × DET_SIZE (zero-padded = black)
  const { data: rawPixels } = await sharp(imageBuffer)
    .resize(resW, resH, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const padded = Buffer.alloc(DET_SIZE * DET_SIZE * 3, 0);
  for (let y = 0; y < resH; y++) {
    rawPixels.copy(
      padded,
      y * DET_SIZE * 3,
      y * resW * 3,
      (y + 1) * resW * 3
    );
  }

  // HWC uint8 → NCHW float32, normalise: (pixel - 127.5) / 128
  const input = new Float32Array(3 * DET_SIZE * DET_SIZE);
  for (let c = 0; c < 3; c++) {
    for (let y = 0; y < DET_SIZE; y++) {
      for (let x = 0; x < DET_SIZE; x++) {
        const src = (y * DET_SIZE + x) * 3 + c;
        const dst = c * DET_SIZE * DET_SIZE + y * DET_SIZE + x;
        input[dst] = (padded[src] - 127.5) / 128.0;
      }
    }
  }

  const tensor = new ort.Tensor("float32", input, [1, 3, DET_SIZE, DET_SIZE]);
  const results = await detSession!.run({ "input.1": tensor });

  // Decode detections from all strides
  const faces: FaceBox[] = [];

  for (const { score: sName, bbox: bName, kps: kName, stride } of DET_OUTPUTS) {
    const scores = results[sName].data as Float32Array;
    const bboxes = results[bName].data as Float32Array;
    const kpss = results[kName].data as Float32Array;

    const gridH = Math.floor(DET_SIZE / stride);
    const gridW = Math.floor(DET_SIZE / stride);
    const numAnchors = 2;

    let idx = 0;
    for (let iy = 0; iy < gridH; iy++) {
      for (let ix = 0; ix < gridW; ix++) {
        for (let a = 0; a < numAnchors; a++, idx++) {
          if (scores[idx] < scoreThreshold) continue;

          const ax = ix * stride;
          const ay = iy * stride;

          // Bbox: distance from anchor to edges (scaled back to original)
          const bi = idx * 4;
          const x1 = (ax - bboxes[bi] * stride) / scale;
          const y1 = (ay - bboxes[bi + 1] * stride) / scale;
          const x2 = (ax + bboxes[bi + 2] * stride) / scale;
          const y2 = (ay + bboxes[bi + 3] * stride) / scale;

          // Keypoints: offset from anchor (scaled back to original)
          const ki = idx * 10;
          const kps: [number, number][] = [];
          for (let k = 0; k < 5; k++) {
            kps.push([
              (ax + kpss[ki + k * 2] * stride) / scale,
              (ay + kpss[ki + k * 2 + 1] * stride) / scale,
            ]);
          }

          faces.push({
            x1: Math.max(0, x1),
            y1: Math.max(0, y1),
            x2: Math.min(origW, x2),
            y2: Math.min(origH, y2),
            score: scores[idx],
            kps,
          });
        }
      }
    }
  }

  return { faces: nms(faces, 0.4), origW, origH };
}

function nms(boxes: FaceBox[], iouThreshold: number): FaceBox[] {
  boxes.sort((a, b) => b.score - a.score);
  const keep: FaceBox[] = [];
  const suppressed = new Set<number>();

  for (let i = 0; i < boxes.length; i++) {
    if (suppressed.has(i)) continue;
    keep.push(boxes[i]);
    for (let j = i + 1; j < boxes.length; j++) {
      if (suppressed.has(j)) continue;
      if (computeIoU(boxes[i], boxes[j]) > iouThreshold) suppressed.add(j);
    }
  }
  return keep;
}

function computeIoU(a: FaceBox, b: FaceBox): number {
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
  return inter / (areaA + areaB - inter);
}

/* ------------------------------------------------------------------ */
/*  Face alignment (similarity transform via Umeyama)                 */
/* ------------------------------------------------------------------ */

// Standard ArcFace alignment template for 112×112
const ALIGN_TEMPLATE: [number, number][] = [
  [38.2946, 51.6963], // left eye
  [73.5318, 51.5014], // right eye
  [56.0252, 71.7366], // nose
  [41.5493, 92.3655], // left mouth corner
  [70.7299, 92.2041], // right mouth corner
];

/**
 * Compute inverse similarity transform (dst→src mapping) from
 * detected keypoints to standard template using Umeyama method.
 */
function computeAlignMatrix(srcKps: [number, number][]) {
  const n = srcKps.length;
  let srcMx = 0, srcMy = 0, dstMx = 0, dstMy = 0;

  for (let i = 0; i < n; i++) {
    srcMx += srcKps[i][0];
    srcMy += srcKps[i][1];
    dstMx += ALIGN_TEMPLATE[i][0];
    dstMy += ALIGN_TEMPLATE[i][1];
  }
  srcMx /= n; srcMy /= n;
  dstMx /= n; dstMy /= n;

  let num1 = 0, den1 = 0, num2 = 0;
  for (let i = 0; i < n; i++) {
    const sx = srcKps[i][0] - srcMx;
    const sy = srcKps[i][1] - srcMy;
    const dx = ALIGN_TEMPLATE[i][0] - dstMx;
    const dy = ALIGN_TEMPLATE[i][1] - dstMy;
    num1 += dx * sx + dy * sy;
    num2 += dx * sy - dy * sx;
    den1 += sx * sx + sy * sy;
  }

  const a = num1 / den1;
  const b = num2 / den1;
  const det = a * a + b * b;

  // Inverse: [[a, b], [-b, a]] / det
  return {
    ia: a / det,
    ib: b / det,
    tx: srcMx - (a * dstMx + b * dstMy) / det,
    ty: srcMy - (-b * dstMx + a * dstMy) / det,
  };
}

/** Warp source image to 112×112 aligned face using keypoints. */
function warpAligned(
  srcPixels: Buffer,
  srcW: number,
  srcH: number,
  kps: [number, number][]
): Buffer {
  const { ia, ib, tx, ty } = computeAlignMatrix(kps);
  const S = 112;
  const out = Buffer.alloc(S * S * 3);

  for (let dy = 0; dy < S; dy++) {
    for (let dx = 0; dx < S; dx++) {
      const sx = ia * dx + ib * dy + tx;
      const sy = -ib * dx + ia * dy + ty;

      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;
      const oi = (dy * S + dx) * 3;

      if (x0 >= 0 && x0 < srcW - 1 && y0 >= 0 && y0 < srcH - 1) {
        for (let c = 0; c < 3; c++) {
          const v00 = srcPixels[(y0 * srcW + x0) * 3 + c];
          const v10 = srcPixels[(y0 * srcW + x0 + 1) * 3 + c];
          const v01 = srcPixels[((y0 + 1) * srcW + x0) * 3 + c];
          const v11 = srcPixels[((y0 + 1) * srcW + x0 + 1) * 3 + c];
          out[oi + c] = Math.round(
            v00 * (1 - fx) * (1 - fy) +
            v10 * fx * (1 - fy) +
            v01 * (1 - fx) * fy +
            v11 * fx * fy
          );
        }
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  MobileFaceNet embedding                                           */
/* ------------------------------------------------------------------ */

async function computeEmbedding(alignedRgb: Buffer): Promise<FaceDescriptor> {
  await ensureFaceApiReady();
  const S = 112;

  const input = new Float32Array(3 * S * S);
  for (let c = 0; c < 3; c++) {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        input[c * S * S + y * S + x] =
          (alignedRgb[(y * S + x) * 3 + c] - 127.5) / 127.5;
      }
    }
  }

  const tensor = new ort.Tensor("float32", input, [1, 3, S, S]);
  const result = await recSession!.run({ "input.1": tensor });
  const raw = result["516"].data as Float32Array;

  // L2 normalise
  let norm = 0;
  for (let i = 0; i < raw.length; i++) norm += raw[i] * raw[i];
  norm = Math.sqrt(norm);

  const emb = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) emb[i] = raw[i] / norm;
  return emb;
}

/* ------------------------------------------------------------------ */
/*  Public API (drop-in replacement — same exports)                   */
/* ------------------------------------------------------------------ */

/**
 * Extract a 512-dimensional face descriptor from an image buffer.
 * Returns null if no face is detected.
 */
export async function extractDescriptor(
  imageBuffer: Buffer
): Promise<FaceDescriptor | null> {
  await ensureFaceApiReady();

  const { faces, origW, origH } = await detectFaces(imageBuffer, 0.25);
  if (faces.length === 0) return null;

  const best = faces[0]; // highest confidence

  const { data: srcPixels } = await sharp(imageBuffer)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const aligned = warpAligned(srcPixels, origW, origH, best.kps);
  return computeEmbedding(aligned);
}

/** Serialize Float32Array to number[] for Postgres vector insertion */
export function descriptorToArray(d: FaceDescriptor): number[] {
  return Array.from(d);
}

/** Deserialize from number[] back to Float32Array */
export function arrayToDescriptor(a: number[]): FaceDescriptor {
  return new Float32Array(a);
}
