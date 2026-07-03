// Variante de strip-bg pour les fonds PixelLab en DÉGRADÉ vertical : la couleur
// de fond est estimée PAR LIGNE (moyenne des 6 px de chaque bord de la ligne),
// puis flood fill depuis les bords (mêmes protections : proximité + outline).
// Usage: node strip-bg-gradient.cjs <in.png> <out.png> [tolerance] [maxChroma]
const fs = require("fs");
const path = require("path");
const { PNG } = require(path.join(__dirname, "..", "..", "node_modules", "pngjs"));

const [, , inPath, outPath, tolArg, chromaArg] = process.argv;
const TOL = Number(tolArg) || 22;
const MAX_CHROMA = Number(chromaArg) || 18;

const png = PNG.sync.read(fs.readFileSync(inPath));
const { width: W, height: H, data } = png;

// Fond estimé par ligne : moyenne des 6 pixels de chaque bord (opaque uniquement).
const rowBg = new Array(H);
for (let y = 0; y < H; y++) {
  let r = 0, g = 0, b = 0, n = 0;
  for (const x of [0, 1, 2, W - 3, W - 2, W - 1]) {
    const i = (y * W + x) * 4;
    if (data[i + 3] < 200) continue;
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
  }
  rowBg[y] = n ? [r / n, g / n, b / n] : null;
}
// Combler les lignes sans bord opaque avec la ligne valide la plus proche.
for (let y = 0; y < H; y++) {
  if (rowBg[y]) continue;
  for (let d = 1; d < H; d++) {
    if (rowBg[y - d]) { rowBg[y] = rowBg[y - d]; break; }
    if (rowBg[y + d]) { rowBg[y] = rowBg[y + d]; break; }
  }
}

function isBg(x, y) {
  const i = (y * W + x) * 4;
  if (data[i + 3] === 0) return false;
  const bg = rowBg[y];
  if (!bg) return false;
  const r = data[i], g = data[i + 1], b = data[i + 2];
  const near = Math.abs(r - bg[0]) <= TOL && Math.abs(g - bg[1]) <= TOL && Math.abs(b - bg[2]) <= TOL;
  const grey = Math.max(r, g, b) - Math.min(r, g, b) <= MAX_CHROMA;
  return near && grey;
}

const visited = new Uint8Array(W * H);
const stack = [];
for (let x = 0; x < W; x++) stack.push(x, 0, x, H - 1);
for (let y = 0; y < H; y++) stack.push(0, y, W - 1, y);
let cleared = 0;
while (stack.length) {
  const y = stack.pop(), x = stack.pop();
  if (x < 0 || y < 0 || x >= W || y >= H) continue;
  const p = y * W + x;
  if (visited[p]) continue;
  visited[p] = 1;
  if (!isBg(x, y)) continue;
  data[p * 4 + 3] = 0;
  cleared++;
  stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
}
fs.writeFileSync(outPath, PNG.sync.write(png));
console.log(`${path.basename(inPath)}: ${cleared} px effaces (${(100 * cleared / (W * H)).toFixed(1)}%)`);
