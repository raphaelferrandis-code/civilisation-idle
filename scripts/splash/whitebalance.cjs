"use strict";
// White-balance anti-sépia générique pour un splash-art (gray-world partiel + léger
// gain de saturation naturel). Reproduit la recette validée sur l'antique.
//   Usage : NODE_PATH=<projet>/node_modules node scripts/splash/whitebalance.cjs <in.png> <out.png> [A] [SAT]
//   A = force de neutralisation (défaut 0.72 ; 1.0 = gray-world plein, retire tout le cast).
const fs = require("fs");
const { PNG } = require("pngjs");

const [inP, outP, aArg, satArg] = process.argv.slice(2);
if (!inP || !outP) { console.error("usage: whitebalance.cjs <in.png> <out.png> [A] [SAT]"); process.exit(1); }

const src = PNG.sync.read(fs.readFileSync(inP));
let sr = 0, sg = 0, sb = 0, n = 0;
for (let i = 0; i < src.data.length; i += 4) {
  if (src.data[i + 3] < 8) continue;
  sr += src.data[i]; sg += src.data[i + 1]; sb += src.data[i + 2]; n++;
}
const mr = sr / n, mg = sg / n, mb = sb / n, gray = (mr + mg + mb) / 3;
const A = aArg ? parseFloat(aArg) : 0.72;   // force de neutralisation (0 = rien, 1 = gray-world plein)
const SAT = satArg ? parseFloat(satArg) : 1.12; // gain de saturation NATUREL (pas de sursaturation)
const gR = 1 * (1 - A) + (gray / mr) * A;
const gG = 1 * (1 - A) + (gray / mg) * A;
const gB = 1 * (1 - A) + (gray / mb) * A;
const cl = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
const out = new PNG({ width: src.width, height: src.height });
for (let i = 0; i < src.data.length; i += 4) {
  let r = cl(src.data[i] * gR), g = cl(src.data[i + 1] * gG), b = cl(src.data[i + 2] * gB);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  r = cl(lum + (r - lum) * SAT); g = cl(lum + (g - lum) * SAT); b = cl(lum + (b - lum) * SAT);
  out.data[i] = r; out.data[i + 1] = g; out.data[i + 2] = b; out.data[i + 3] = src.data[i + 3];
}
fs.writeFileSync(outP, PNG.sync.write(out));
console.log("WB " + inP.replace(/\\/g, "/").split("/").pop() +
  " | means " + (mr | 0) + "/" + (mg | 0) + "/" + (mb | 0) +
  " | gains " + gR.toFixed(2) + "/" + gG.toFixed(2) + "/" + gB.toFixed(2));
