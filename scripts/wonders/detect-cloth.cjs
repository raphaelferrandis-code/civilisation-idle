// Détecte les tissus cuits (clusters de pixels rouge bordeaux) dans un sprite.
// Même logique que detect-flames.cjs mais prédicat "étoffe pourpre/cramoisie".
// Usage: node detect-cloth.cjs <sprite.png> [--boxes out-debug.png]
const fs = require("fs");
const path = require("path");
const { PNG } = require(path.join(__dirname, "..", "..", "node_modules", "pngjs"));

const inPath = process.argv[2];
const boxesIdx = process.argv.indexOf("--boxes");
const boxesPath = boxesIdx > 0 ? process.argv[boxesIdx + 1] : null;

const png = PNG.sync.read(fs.readFileSync(inPath));
const { width: W, height: H, data } = png;

// Pixel "étoffe" : rouge sombre à cramoisi, dominante rouge nette, opaque.
function isCloth(i) {
  if (data[i + 3] < 200) return false;
  const r = data[i], g = data[i + 1], b = data[i + 2];
  return r >= 70 && r <= 215 && g <= r * 0.55 && b <= r * 0.65 && r > g + 35;
}

const seen = new Uint8Array(W * H);
const clusters = [];
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const p = y * W + x;
    if (seen[p] || !isCloth(p * 4)) continue;
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
        if (seen[np] || !isCloth(np * 4)) continue;
        seen[np] = 1;
        stack.push(nx, ny);
      }
    }
    clusters.push({ minX, maxX, minY, maxY, count });
  }
}

// Fusionne les clusters proches (un galon d'or peut couper l'étoffe en deux).
let merged = true;
while (merged) {
  merged = false;
  outer: for (let a = 0; a < clusters.length; a++) {
    for (let b = a + 1; b < clusters.length; b++) {
      const A = clusters[a], B = clusters[b];
      const gapX = Math.max(A.minX, B.minX) - Math.min(A.maxX, B.maxX);
      const gapY = Math.max(A.minY, B.minY) - Math.min(A.maxY, B.maxY);
      if (gapX <= 3 && gapY <= 3) {
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
  .filter(c => c.count >= 12) // une bannière fait des dizaines de px, ignore liserés isolés
  .map(c => ({
    x: c.minX, y: c.minY,
    w: c.maxX - c.minX + 1, h: c.maxY - c.minY + 1,
    px: c.count,
    // point d'ancrage : centre horizontal, HAUT du cluster (le tissu pend)
    anchorX: Math.round((c.minX + c.maxX) / 2), anchorY: c.minY
  }))
  .sort((a, b) => a.y - b.y || a.x - b.x);

console.log(JSON.stringify({ file: path.basename(inPath), width: W, height: H, cloth: out }, null, 2));

if (boxesPath) {
  for (const c of out) {
    for (let x = c.x - 1; x <= c.x + c.w; x++) {
      for (const y of [c.y - 1, c.y + c.h]) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = (y * W + x) * 4;
        data[i] = 0; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255;
      }
    }
    for (let y = c.y - 1; y <= c.y + c.h; y++) {
      for (const x of [c.x - 1, c.x + c.w]) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = (y * W + x) * 4;
        data[i] = 0; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255;
      }
    }
  }
  fs.writeFileSync(boxesPath, PNG.sync.write(png));
}
