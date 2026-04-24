/**
 * Creates a @tensorflow/tfjs-node shim that re-exports @tensorflow/tfjs.
 * Needed because @vladmandic/face-api's node dist hard-requires tfjs-node,
 * but tfjs-node native bindings don't build on Node.js 24+.
 *
 * Run via: node scripts/patch-tfjs-node.js
 * (Also wired as npm postinstall.)
 */
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", "node_modules", "@tensorflow", "tfjs-node");

if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

fs.writeFileSync(
  path.join(dir, "package.json"),
  JSON.stringify(
    {
      name: "@tensorflow/tfjs-node",
      version: "0.0.0-shim",
      description: "Shim re-exporting @tensorflow/tfjs for Node 24+",
      main: "index.js",
    },
    null,
    2
  ) + "\n"
);

fs.writeFileSync(
  path.join(dir, "index.js"),
  '// Shim: re-export @tensorflow/tfjs (pure JS CPU)\nmodule.exports = require("@tensorflow/tfjs");\n'
);

console.log("[patch-tfjs-node] shim created at", dir);
