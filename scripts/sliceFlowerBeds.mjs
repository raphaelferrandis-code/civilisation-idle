// sliceFlowerBeds.mjs — découpe une PLANCHE PixelLab de parterres de fleurs
// (props séparés sur fond transparent — le format que PixelLab réussit, cf. le
// chantier terre-plein : les bandes entières s'effondrent, les props sont bons)
// en sprites individuels public/pixelart/iso/flowerbed-1..N.png, triés de
// gauche à droite. Chaque composante connexe (8-connexité, ombre attachée
// comprise) devient un sprite rogné à 1 px de marge.
//   Lancer :  node scripts/sliceFlowerBeds.mjs <planche.png> [préfixe]
//     préfixe par défaut `flowerbed` ; la planche HIVER se découpe avec
//     `flowerbed-winter` (⚠ sans préfixe elle ÉCRASE les bacs d'été).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ISO = path.resolve(HERE, '..', 'public', 'pixelart', 'iso');
const srcPath = process.argv[2];
const prefix = process.argv[3] || 'flowerbed';
if (!srcPath) { console.error('usage: node scripts/sliceFlowerBeds.mjs <planche.png> [préfixe]'); process.exit(1); }
const img = PNG.sync.read(fs.readFileSync(srcPath));
const W = img.width, H = img.height;
const A = (x, y) => img.data[(y * W + x) * 4 + 3];

const seen = new Uint8Array(W * H), comps = [];
for (let y0 = 0; y0 < H; y0 += 1) for (let x0 = 0; x0 < W; x0 += 1) {
  if (seen[y0 * W + x0] || A(x0, y0) <= 16) continue;
  let n = 0, bx0 = W, by0 = H, bx1 = -1, by1 = -1;
  const stack = [x0, y0];
  seen[y0 * W + x0] = 1;
  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    n += 1;
    if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ny * W + nx] || A(nx, ny) <= 16) continue;
      seen[ny * W + nx] = 1; stack.push(nx, ny);
    }
  }
  if (n >= 60) comps.push({ x0: bx0, y0: by0, x1: bx1, y1: by1, n });   // poussière ignorée
}
comps.sort((a, b) => a.x0 - b.x0);
if (!comps.length) { console.error('aucun parterre trouvé'); process.exit(1); }
comps.forEach((c, i) => {
  const m = 1;
  const x0 = Math.max(0, c.x0 - m), y0 = Math.max(0, c.y0 - m);
  const w = Math.min(W - 1, c.x1 + m) - x0 + 1, h = Math.min(H - 1, c.y1 + m) - y0 + 1;
  const out = new PNG({ width: w, height: h });
  PNG.bitblt(img, out, x0, y0, w, h, 0, 0);
  const dest = path.join(ISO, `${prefix}-${i + 1}.png`);
  fs.writeFileSync(dest, PNG.sync.write(out));
  console.log(`${prefix}-${i + 1}.png  ${w}x${h}  (${c.n} px)`);
});
console.log(`${comps.length} parterres → ${ISO}`);
