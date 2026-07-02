// Détecte les flammes cuites dans un sprite (clusters de pixels chauds orange/jaune).
// Usage: node detect-flames.cjs <sprite.png> [--boxes out-debug.png]
// Sort la liste des clusters (bbox + centre-bas = point d'ancrage de la flamme animée).
const fs = require("fs");
const path = require("path");
const { PNG } = require(path.join(__dirname, "..", "node_modules", "pngjs"));

const inPath = process.argv[2];
const boxesIdx = process.argv.indexOf("--boxes");
const boxesPath = boxesIdx > 0 ? process.argv[boxesIdx + 1] : null;

const png = PNG.sync.read(fs.readFileSync(inPath));
const { width: W, height: H, data } = png;

// Pixel "feu" : chaud, saturé vers l'orange/jaune, opaque.
function isFire(i) {
  if (data[i + 3] < 200) return false;
  const r = data[i], g = data[i + 1], b = data[i + 2];
  return r >= 190 && g >= 80 && b <= 130 && r > b + 90 && g > b + 20;
}

const seen = new Uint8Array(W * H);
const clusters = [];
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const p = y * W + x;
    if (seen[p] || !isFire(p * 4)) continue;
    // BFS 8-connexe
    let minX = x, maxX = x, minY = y, maxY = y, count = 0;
    const stack = [x, y];
    seen[p] = 1;
    while (stack.length) {
      const cy = stack.pop(), cx = stack.pop();
      count++;
      if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const np = ny * W + nx;
        if (seen[np] || !isFire(np * 4)) continue;
        seen[np] = 1;
        stack.push(nx, ny);
      }
    }
    clusters.push({ minX, maxX, minY, maxY, count });
  }
}

// Fusionne les clusters proches (une flamme peut être coupée par des pixels sombres).
let merged = true;
while (merged) {
  merged = false;
  outer: for (let a = 0; a < clusters.length; a++) {
    for (let b = a + 1; b < clusters.length; b++) {
      const A = clusters[a], B = clusters[b];
      const gapX = Math.max(A.minX, B.minX) - Math.min(A.maxX, B.maxX);
      const gapY = Math.max(A.minY, B.minY) - Math.min(A.maxY, B.maxY);
      if (gapX <= 2 && gapY <= 2) {
        A.minX = Math.min(A.minX, B.minX); A.maxX = Math.max(A.maxX, B.maxX);
        A.minY = Math.min(A.minY, B.minY); A.maxY = Math.max(A.maxY, B.maxY);
        A.count += B.count;
        clusters.splice(b, 1);
        merged = true;
        break outer;
      }
    }
  }
}

const out = clusters
  .filter(c => c.count >= 4) // ignore le bruit de 1-3 px
  .map(c => ({
    x: c.minX, y: c.minY,
    w: c.maxX - c.minX + 1, h: c.maxY - c.minY + 1,
    px: c.count,
    // point d'ancrage : centre horizontal, bas du cluster
    anchorX: Math.round((c.minX + c.maxX) / 2), anchorY: c.maxY
  }))
  .sort((a, b) => a.y - b.y || a.x - b.x);

console.log(JSON.stringify({ file: path.basename(inPath), width: W, height: H, flames: out }, null, 2));

if (boxesPath) {
  // Copie de debug avec bboxes magenta
  for (const c of out) {
    for (let x = c.x - 1; x <= c.x + c.w; x++) {
      for (const y of [c.y - 1, c.y + c.h]) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = (y * W + x) * 4;
        data[i] = 255; data[i + 1] = 0; data[i + 2] = 255; data[i + 3] = 255;
      }
    }
    for (let y = c.y - 1; y <= c.y + c.h; y++) {
      for (const x of [c.x - 1, c.x + c.w]) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = (y * W + x) * 4;
        data[i] = 255; data[i + 1] = 0; data[i + 2] = 255; data[i + 3] = 255;
      }
    }
  }
  fs.writeFileSync(boxesPath, PNG.sync.write(png));
}
