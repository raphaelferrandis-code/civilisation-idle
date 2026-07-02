// sewerWaterBand.mjs — bande animée du filet d'eau croupie de la station égouts.
//   L'animation PixelLab v3 a échoué 3/3 sur cet objet (2026-07-02) → la bande est
//   composée PROCÉDURALEMENT : une onde de brillance descend le long du filet
//   (direction bas-droite), en cyclant chaque pixel d'eau sur la rampe foliage de
//   la palette maître (+ écume boneWhite rare). Boucle exacte sur FRAMES frames.
//   Le masque « eau » est détecté sur le sprite RAW (verts vifs pré-remap, fenêtre
//   GATE), les couleurs sortent déjà remappées → AUCUN remap à refaire ensuite.
//
//   Lancer :  node scripts/sewerWaterBand.mjs
//   Entrées : le RAW PixelLab (— regénérable via create_map_object, cf.
//             docs/reprise-infra-pixel.md) passé en argv[2], sinon le remappé seul
//             sert aussi de source de masque (repli, moins précis).
//   Sortie  : public/pixelart/agents/buildings/sewers-water.png (7 frames de 96×80)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const BUILDINGS = path.join(ROOT, 'public', 'pixelart', 'agents', 'buildings');
const BASE = path.join(BUILDINGS, 'sewers-prop.png');
const OUT = path.join(BUILDINGS, 'sewers-water.png');
const RAW = process.argv[2] || null; // sprite pré-remap (masque plus fiable)

const FRAMES = 7;
// Fenêtre GATE : le filet sort de sous la grille et coule vers le bas-droite.
const GATE = { x0: 40, x1: 80, y0: 54, y1: 76 };
// Rampe foliage de la palette maître (ordre sombre → clair) + écume.
const RAMP = ['#243a22', '#3c5a2c', '#5c7d38', '#8aa24a'];
const FOAM = '#e9e4d6';

const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const RAMP_RGB = RAMP.map(rgb), FOAM_RGB = rgb(FOAM);

const base = PNG.sync.read(fs.readFileSync(BASE));
const maskSrc = RAW ? PNG.sync.read(fs.readFileSync(RAW)) : base;
if (maskSrc.width !== base.width || maskSrc.height !== base.height) {
  throw new Error('RAW et base n\'ont pas les mêmes dimensions');
}
const W = base.width, H = base.height;

// Masque eau : verts VIFS (le filet) dans la fenêtre — l'herbe alentour est plus
// terne (g-r ≤ ~30 sur le raw, rampe foliage sombre après remap).
const mask = [];
for (let y = GATE.y0; y <= GATE.y1; y += 1) {
  for (let x = GATE.x0; x <= GATE.x1; x += 1) {
    const i = (y * W + x) * 4;
    const r = maskSrc.data[i], g = maskSrc.data[i + 1], b = maskSrc.data[i + 2], a = maskSrc.data[i + 3];
    if (a > 20 && g > r + 40 && g > b + 90) mask.push({ x, y, i });
  }
}
if (mask.length < 30) throw new Error('Masque eau trop petit (' + mask.length + ' px) — vérifier GATE/seuils');

// Ton de base de chaque pixel d'eau = son index dans la rampe (au plus proche,
// sur le sprite REMAPPÉ — c'est lui qu'on anime).
const rampIndex = (r, g, b) => {
  let best = 0, bd = 1e9;
  for (let k = 0; k < RAMP_RGB.length; k += 1) {
    const [rr, rg, rb] = RAMP_RGB[k];
    const d = (r - rr) ** 2 + (g - rg) ** 2 + (b - rb) ** 2;
    if (d < bd) { bd = d; best = k; }
  }
  return best;
};

// Bande : FRAMES frames côte à côte, transparentes SAUF les pixels d'eau
// (blitAnim la superpose au prop statique). Onde de brillance qui AVANCE le
// long du flux (bas-droite) d'exactement 1 période sur FRAMES → boucle propre.
const out = new PNG({ width: W * FRAMES, height: H });
for (let f = 0; f < FRAMES; f += 1) {
  for (const { x, y, i } of mask) {
    const idx = rampIndex(base.data[i], base.data[i + 1], base.data[i + 2]);
    // Position le long du flux (unités ~pixel) ; l'onde parcourt WAVELEN px/période.
    const d = x * 0.55 + y * 0.83;
    const WAVELEN = 9;
    const ph = ((d / WAVELEN - f / FRAMES) % 1 + 1) % 1;
    let k = idx, foam = false;
    if (ph < 0.22) { k = Math.min(RAMP.length - 1, idx + 1); foam = ph < 0.06 && idx >= RAMP.length - 2; }
    else if (ph > 0.72) k = Math.max(0, idx - 1);
    const [r, g, b] = foam ? FOAM_RGB : RAMP_RGB[k];
    const o = (y * out.width + (f * W + x)) * 4;
    out.data[o] = r; out.data[o + 1] = g; out.data[o + 2] = b; out.data[o + 3] = 255;
  }
}
fs.writeFileSync(OUT, PNG.sync.write(out));
console.log('sewers-water.png : ' + FRAMES + ' frames ' + W + 'x' + H + ', ' + mask.length + ' px d\'eau animés');
