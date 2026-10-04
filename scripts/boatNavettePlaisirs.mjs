// Planche de la NAVETTE DES PLAISIRS (docs/PLAN-BATEAUX.md §8) : le bateau-lanterne
// de chaque âge, à quatre caps, équipage compris (hôtesse + passagers), sur l'eau du
// jeu, reflet compris. Une colonne « nuit » montre où s'allument les lanternes.
//   node scripts/boatNavettePlaisirs.mjs [Z]  → .preview-shots/bateaux/navette-plaisirs.png
import { PNG } from 'pngjs';
import fs from 'node:fs';
import { bakeBoat, dirTheta } from '../src/game/map/iso/boatBake.js';
import { BOAT_MODELS } from '../src/game/map/iso/boatKits.js';
import { shuttleModelFor } from '../src/game/map/iso/boatKitsPlaisirs.js';
import { compositeCrew } from './boatCrewRaster.mjs';

const Z = +(process.argv[2] || 3);
const OUT = '.preview-shots/bateaux';
fs.mkdirSync(OUT, { recursive: true });
const BANDS = [0, 2, 3, 4, 5, 6, 7, 8, 9];
const DIRS = [0, 4, 12, 20, 28];
const CW = 62 * Z, CH = 52 * Z;
const W = CW * (DIRS.length + 1), H = CH * BANDS.length;
const out = new PNG({ width: W, height: H });
for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
  const o = (y * W + x) * 4, night = x >= CW * DIRS.length;
  const c = night ? [22, 30, 52] : ((Math.floor(y / CH) % 2) ? [72, 116, 160] : [79, 124, 168]);
  out.data[o] = c[0]; out.data[o + 1] = c[1]; out.data[o + 2] = c[2]; out.data[o + 3] = 255;
}
function blit(R, x0, y0, a = 1, dim = 1) {
  for (let j = 0; j < R.h; j += 1) for (let i = 0; i < R.w; i += 1) {
    const s = (j * R.w + i) * 4;
    if (!R.data[s + 3]) continue;
    for (let dy = 0; dy < Z; dy += 1) for (let dx = 0; dx < Z; dx += 1) {
      const X = x0 + i * Z + dx, Y = y0 + j * Z + dy;
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const o = (Y * W + X) * 4;
      for (let c = 0; c < 3; c += 1) out.data[o + c] = out.data[o + c] * (1 - a) + R.data[s + c] * dim * a;
    }
  }
}
function glowDot(x, y, r, col) {
  for (let dy = -r; dy <= r; dy += 1) for (let dx = -r; dx <= r; dx += 1) {
    const d = Math.hypot(dx, dy) / r;
    if (d > 1) continue;
    const X = Math.round(x + dx), Y = Math.round(y + dy);
    if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
    const o = (Y * W + X) * 4, k = (1 - d) * (1 - d) * 0.8;
    for (let c = 0; c < 3; c += 1) out.data[o + c] = Math.min(255, out.data[o + c] + col[c] * k);
  }
}
BANDS.forEach((band, r) => {
  const id = shuttleModelFor(band), M = BOAT_MODELS[id];
  const states = ['cruise', 'cruise', 'return', 'unload', 'cruise'];
  DIRS.forEach((d, c) => {
    const b = bakeBoat(M, dirTheta(d), { variant: M.variant(3 + c), state: states[c], k: 1.2 });
    const cx = c * CW + CW / 2, cy = Math.round(r * CH + CH * 0.66);
    blit(b.refl, cx + b.refl.ox * Z, cy + b.refl.oy * Z, 0.4);
    blit(b.img, cx + b.img.ox * Z, cy + b.img.oy * Z);
    compositeCrew(out, b, M, band, cx, cy, Z);
  });
  // Nuit : la coque assombrie, les lanternes allumées.
  const b = bakeBoat(M, dirTheta(4), { variant: M.variant(4), state: 'cruise', k: 1.2 });
  const cx = DIRS.length * CW + CW / 2, cy = Math.round(r * CH + CH * 0.66);
  blit(b.img, cx + b.img.ox * Z, cy + b.img.oy * Z, 1, 0.35);
  for (const [k, a] of Object.entries(b.anchors)) if (k.startsWith('lamp')) glowDot(cx + a.X * Z, cy + a.Y * Z, 4 * Z, [255, 110, 70]);
});
fs.writeFileSync(`${OUT}/navette-plaisirs.png`, PNG.sync.write(out));
console.log(`OK ${OUT}/navette-plaisirs.png ${W}x${H}`);
