// fetchCosmicScene.mjs — range un objet PixelLab en scène de bâtiment-moteur COSMIQUE
// (bandes 7-9) : public/pixelart/agents/buildings/<clé>.png.
//
// Toutes les scènes cosmiques passent par `blitCosmicTower` (cityEngineSprites.js), qui
// pose un canevas 128×224 à 1,72 hauteur de boîte, PIED au ras du bas du canevas, centré.
// Jusqu'au 2026-10-01 toutes ces images étaient des TOURS (la « forêt de flèches »). Les
// nouvelles ont trois tailles de génération — haute 128×224, moyenne 128×176, basse
// 128×128 — et sont reposées ici dans le canevas commun, encre calée comme les anciennes :
// bas de l'encre sur la dernière rangée, centre de l'encre au milieu. Une maison basse
// garde ainsi la densité de pixel des tours et n'occupe que le bas du canevas : la
// skyline gagne une gamme de hauteurs sans une ligne de code de pose en plus.
//
// Usage : node scripts/fetchCosmicScene.mjs <objectId> <clé> [rotation=south-west]
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const [id, key, rot = 'south-west'] = process.argv.slice(2);
if (!id || !key) { console.error('usage : <objectId> <clé> [rotation]'); process.exit(1); }
const BASE = 'https://backblaze.pixellab.ai/file/pixellab-characters/objects/f1f2e80b-b12d-4940-a5a9-e76f8558b9e0';
const W = 128, H = 224;

const res = await fetch(`${BASE}/${id}/rotations/${rot}.png`);
if (!res.ok) { console.error('échec', res.status); process.exit(1); }
const src = PNG.sync.read(Buffer.from(await res.arrayBuffer()));

// Encre : alpha seuillé (un pixel à demi transparent fait un bord sale en pixel art).
let x0 = src.width, x1 = -1, y0 = src.height, y1 = -1;
for (let y = 0; y < src.height; y += 1) for (let x = 0; x < src.width; x += 1) {
  if (src.data[(y * src.width + x) * 4 + 3] < 128) continue;
  if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
}
if (x1 < 0) { console.error('image vide'); process.exit(1); }
const iw = x1 - x0 + 1, ih = y1 - y0 + 1;
if (iw > W || ih > H) { console.error(`encre ${iw}×${ih} trop grande pour ${W}×${H}`); process.exit(1); }

const out = new PNG({ width: W, height: H });
const dx = Math.round((W - 1) / 2 - (x0 + x1) / 2), dy = (H - 1) - y1;
for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) {
  const s = (y * src.width + x) * 4;
  if (src.data[s + 3] < 128) continue;
  const tx = x + dx, ty = y + dy;
  if (tx < 0 || tx >= W || ty < 0 || ty >= H) continue;
  const d = (ty * W + tx) * 4;
  out.data[d] = src.data[s]; out.data[d + 1] = src.data[s + 1]; out.data[d + 2] = src.data[s + 2]; out.data[d + 3] = 255;
}
const file = path.join('public/pixelart/agents/buildings', key + '.png');
fs.writeFileSync(file, PNG.sync.write(out));
console.log(`${key} ← ${rot} ${src.width}×${src.height}, encre ${iw}×${ih} (${Math.round(ih / H * 100)} % de la hauteur)`);
