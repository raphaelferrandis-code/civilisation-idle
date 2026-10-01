// fetchHouseSkin.mjs — range un objet PixelLab en skin d'habitation des ères cosmiques
// (« <variante>-cosmic-<bande> », public/pixelart/houses/).
//
// Les maisons sont dessinées à l'échelle de leur ENCRE (spriteScale.houseScaleK : unité
// de tuile / HOUSE_UNIT, plafonnée à la largeur du lot), jamais à celle du canevas : on
// garde donc l'encre telle que générée, à 1:1 (une tour de 300 px ne tient pas au
// double dans les 256 px de PixelLab), recadrée avec une marge de 2 px.
// Usage : node scripts/fetchHouseSkin.mjs <objectId> <clé> [rotation=south-west]
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const [id, key, rot = 'south-west'] = process.argv.slice(2);
if (!id || !key) { console.error('usage : <objectId> <clé> [rotation]'); process.exit(1); }
const BASE = 'https://backblaze.pixellab.ai/file/pixellab-characters/objects/f1f2e80b-b12d-4940-a5a9-e76f8558b9e0';
const res = await fetch(`${BASE}/${id}/rotations/${rot}.png`);
if (!res.ok) { console.error('échec', res.status); process.exit(1); }
const src = PNG.sync.read(Buffer.from(await res.arrayBuffer()));
let x0 = src.width, x1 = -1, y0 = src.height, y1 = -1;
for (let y = 0; y < src.height; y += 1) for (let x = 0; x < src.width; x += 1) {
  if (src.data[(y * src.width + x) * 4 + 3] < 128) continue;
  if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
}
const M = 2, w = x1 - x0 + 1 + 2 * M, h = y1 - y0 + 1 + 2 * M;
const out = new PNG({ width: w, height: h });
for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) {
  const s = (y * src.width + x) * 4;
  if (src.data[s + 3] < 128) continue;
  const d = ((y - y0 + M) * w + (x - x0 + M)) * 4;
  out.data[d] = src.data[s]; out.data[d + 1] = src.data[s + 1]; out.data[d + 2] = src.data[s + 2]; out.data[d + 3] = 255;
}
fs.writeFileSync(path.join('public/pixelart/houses', key + '.png'), PNG.sync.write(out));
console.log(`${key} ← ${rot}, encre ${w - 2 * M}×${h - 2 * M}`);
