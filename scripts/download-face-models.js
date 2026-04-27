/**
 * Download InsightFace ONNX models for face detection + recognition.
 * Models: SCRFD 500M (detection) + MobileFaceNet (recognition, 512d).
 * Source: InsightFace buffalo_sc pack on HuggingFace.
 *
 * Run: node scripts/download-face-models.js
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const MODELS_DIR = path.join(__dirname, "..", "models");

const MODELS = [
  {
    name: "det_500m.onnx",
    url: "https://huggingface.co/WePrompt/buffalo_sc/resolve/main/det_500m.onnx",
    size: "~2.5 MB",
  },
  {
    name: "w600k_mbf.onnx",
    url: "https://huggingface.co/WePrompt/buffalo_sc/resolve/main/w600k_mbf.onnx",
    size: "~13.6 MB",
  },
];

function download(url, dest, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error("Too many redirects"));

    const proto = url.startsWith("https") ? https : require("http");
    proto
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return download(res.headers.location, dest, maxRedirects - 1).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
        file.on("error", (err) => {
          fs.unlink(dest, () => {});
          reject(err);
        });
      })
      .on("error", reject);
  });
}

async function main() {
  if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
  }

  for (const model of MODELS) {
    const dest = path.join(MODELS_DIR, model.name);
    if (fs.existsSync(dest)) {
      console.log(`✓ ${model.name} already exists, skipping`);
      continue;
    }
    console.log(`Downloading ${model.name} (${model.size})...`);
    try {
      await download(model.url, dest);
      console.log(`✓ ${model.name} downloaded`);
    } catch (err) {
      console.error(`✗ Failed to download ${model.name}: ${err.message}`);
      console.error(`  Manual download: ${model.url}`);
      console.error(`  Place in: ${dest}`);
      process.exit(1);
    }
  }

  console.log("All models ready.");
}

main();
