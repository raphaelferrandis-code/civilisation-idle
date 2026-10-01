// fetchHouseSkin.mjs — range un objet PixelLab en skin d'habitation des ères cosmiques
// (« <variante>-cosmic-<bande> », public/pixelart/houses/).
//
// Les maisons sont dessinées à l'échelle de leur ENCRE (spriteScale.houseScaleK : unité
// de tuile / HOUSE_UNIT, plafonnée à la largeur du lot), jamais à celle du canevas : on
// garde donc l'encre telle que générée, à 1:1 (une tour de 300 px ne tient pas au
// double dans les 256 px de PixelLab), recadrée avec une marge de 2 px.
//
// `--half` : le geste des maisons en nacre (tour-jardin, maison-dôme, grappe de capsules,
// 2026-10-01) — la rotation ENTIÈRE est réduite ×0,5 (moyenne 2×2 en alpha prémultiplié,
// alpha seuillé), sans recadrage : leurs skins d'ère gardent ainsi le cadre de leur
// dessin de base (64, 80 ou 96 px de côté) et le même grain.
// Usage : node scripts/fetchHouseSkin.mjs <objectId> <clé> [rotation=south-west] [--half]
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const args = process.argv.slice(2);
const [id, key, rotPos] = args.filter((a) => !a.startsWith('--'));
const half = args.includes('--half');
const rotArg = args.find((a) => a.startsWith('--rot='));
const rot = rotArg ? rotArg.slice(6) : (rotPos || 'south-west');
if (!id || !key) { console.error('usage : <objectId> <clé> [rotation] [--half]'); process.exit(1); }
const BASE = 'https://backblaze.pixellab.ai/file/pixellab-characters/objects/f1f2e80b-b12d-4940-a5a9-e76f8558b9e0';
const res = await fetch(`${BASE}/${id}/rotations/${rot}.png`);
if (!res.ok) { console.error('échec', res.status); process.exit(1); }
const src = PNG.sync.read(Buffer.from(await res.arrayBuffer()));

// ⚠ Pas de process.exit() après le fetch : sous Windows, sortir à ce moment fait planter
// Node (assertion libuv « UV_HANDLE_CLOSING ») — le fichier est écrit, mais le code de
// sortie casse la chaîne de commandes qui suit.
function halve() {
  const W = src.width >> 1, H = src.height >> 1;
  const out = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let dy = 0; dy < 2; dy += 1) for (let dx = 0; dx < 2; dx += 1) {
      const i = ((y * 2 + dy) * src.width + x * 2 + dx) * 4, al = src.data[i + 3] / 255;
      r += src.data[i] * al; g += src.data[i + 1] * al; b += src.data[i + 2] * al; a += al;
    }
    const o = (y * W + x) * 4;
    if (a > 0) { out.data[o] = Math.round(r / a); out.data[o + 1] = Math.round(g / a); out.data[o + 2] = Math.round(b / a); }
    // Seuil sur la SOMME des quatre alphas (≥ 0,5 : un demi-pixel opaque suffit) — celui
    // qui a produit les sprites livrés ; un seuil à la moyenne rognerait les contours fins.
    out.data[o + 3] = a >= 0.5 ? 255 : 0;
  }
  return { out, msg: `${src.width}×${src.height} → ${W}×${H}` };
}

function cropInk() {
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
  return { out, msg: `encre ${w - 2 * M}×${h - 2 * M}` };
}

const { out, msg } = half ? halve() : cropInk();
fs.writeFileSync(path.join('public/pixelart/houses', key + '.png'), PNG.sync.write(out));
console.log(`${key} ← ${rot}, ${msg}`);
