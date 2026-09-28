// Conditionnement d'une retouche ImageGen à la taille native du sprite.
// Ne redessine rien : recadrage alpha puis réduction nearest-neighbour.
// Usage: node scripts/wonders/prepare-retouch.mjs source.png original.png sortie.png
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const [input, reference, output] = process.argv.slice(2);
if (!input || !reference || !output) throw new Error('source.png original.png sortie.png requis');
const source = PNG.sync.read(fs.readFileSync(input));
const original = PNG.sync.read(fs.readFileSync(reference));
function bounds(png) {
  let x0 = png.width, y0 = png.height, x1 = -1, y1 = -1;
  for (let y = 0; y < png.height; y += 1) for (let x = 0; x < png.width; x += 1) {
    if (png.data[(y * png.width + x) * 4 + 3] < 128) continue;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y);
    x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  if (x1 < x0) throw new Error('Sprite vide');
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
const a = bounds(source), b = bounds(original);
const result = new PNG({ width: original.width, height: original.height });
for (let y = 0; y < b.h; y += 1) for (let x = 0; x < b.w; x += 1) {
  const sx = a.x0 + Math.min(a.w - 1, Math.floor((x + 0.5) * a.w / b.w));
  const sy = a.y0 + Math.min(a.h - 1, Math.floor((y + 0.5) * a.h / b.h));
  const from = (sy * source.width + sx) * 4;
  const to = ((y + b.y0) * result.width + x + b.x0) * 4;
  source.data.copy(result.data, to, from, from + 4);
}
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, PNG.sync.write(result));
console.log(`${output}: ${result.width} × ${result.height}, alpha conservé`);
