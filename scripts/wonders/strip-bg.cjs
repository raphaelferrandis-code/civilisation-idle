// Retire un fond opaque uni (gris PixelLab) par flood fill depuis les bords.
// Usage: node strip-bg.cjs <in.png> <out.png> [tolerance] [maxChroma]
//   maxChroma (déf. 14) : écart max entre canaux pour compter comme "fond
//   neutre" — monter à ~40 pour les fonds bleu-gris que PixelLab sort parfois.
const fs = require("fs");
const path = require("path");
const { PNG } = require(path.join(__dirname, "..", "..", "node_modules", "pngjs"));

const [, , inPath, outPath, tolArg, chromaArg] = process.argv;
const TOL = Number(tolArg) || 20;
const MAX_CHROMA = Number(chromaArg) || 14;

const png = PNG.sync.read(fs.readFileSync(inPath));
const { width: W, height: H, data } = png;

// Couleur de fond = médiane des 4 coins (ils peuvent varier légèrement).
const corners = [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]].map(([x, y]) => {
  const i = (y * W + x) * 4;
  return [data[i], data[i + 1], data[i + 2]];
});
const bg = [0, 1, 2].map(c => Math.round(corners.reduce((s, k) => s + k[c], 0) / 4));

function isBg(i) {
  if (data[i + 3] === 0) return false; // déjà transparent
  const r = data[i], g = data[i + 1], b = data[i + 2];
  // proche de la couleur de fond ET grisâtre (peu de saturation)
  const near = Math.abs(r - bg[0]) <= TOL && Math.abs(g - bg[1]) <= TOL && Math.abs(b - bg[2]) <= TOL;
  const grey = Math.max(r, g, b) - Math.min(r, g, b) <= MAX_CHROMA;
  return near && grey;
}

const visited = new Uint8Array(W * H);
const stack = [];
for (let x = 0; x < W; x++) { stack.push(x, 0, x, H - 1); }
for (let y = 0; y < H; y++) { stack.push(0, y, W - 1, y); }

let cleared = 0;
while (stack.length) {
  const y = stack.pop(), x = stack.pop();
  if (x < 0 || y < 0 || x >= W || y >= H) continue;
  const p = y * W + x;
  if (visited[p]) continue;
  visited[p] = 1;
  const i = p * 4;
  if (!isBg(i)) continue;
  data[i + 3] = 0;
  cleared++;
  stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
}

fs.writeFileSync(outPath, PNG.sync.write(png));
console.log(`${path.basename(inPath)}: bg rgb(${bg.join(",")}) -> ${cleared} px effaces (${(100 * cleared / (W * H)).toFixed(1)}%)`);
