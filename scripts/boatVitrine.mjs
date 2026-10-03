// Vitrine de la flotte (docs/PLAN-BATEAUX.md) : une ligne par bande d'ère, ses
// bateaux côte à côte (marchands, chaland, pêcheur, passeur, service, embarcadère),
// tous au même cap de trois quarts, reflet compris, à l'échelle exacte de la carte
// multipliée par Z. Sert à juger d'un coup d'œil la variété et la cohérence.
//   node scripts/boatVitrine.mjs [Z]   → .preview-shots/bateaux/vitrine-eres.png
import { PNG } from 'pngjs';
import fs from 'node:fs';
import { bakeBoat, dirTheta } from '../src/game/map/iso/boatBake.js';
import { BOAT_MODELS, fleetFor } from '../src/game/map/iso/boatKits.js';
import { compositeCrew } from './boatCrewRaster.mjs';

const Z = +(process.argv[2] || 3);
const OUT = '.preview-shots/bateaux';
fs.mkdirSync(OUT, { recursive: true });
const ROLES = ['trade', 'trade', 'barge', 'fisher', 'ferry', 'service', 'landing'];
const rows = [];
for (let band = 0; band <= 9; band += 1) {
  const fl = fleetFor(band);
  if (!fl) continue;
  const cells = [];
  const used = { trade: 0 };
  for (const role of ROLES) {
    let id;
    if (role === 'landing') id = fl.landing;
    else if (role === 'trade') id = fl.trade[used.trade++];
    else id = fl[role] && fl[role][0];
    if (!id || !BOAT_MODELS[id]) { cells.push(null); continue; }
    const M = BOAT_MODELS[id];
    const th = role === 'landing' ? dirTheta(20) : dirTheta(0);
    cells.push({ ...bakeBoat(M, th, { variant: M.variant(band * 7 + 3), state: 'cruise', k: 1.2 }), M });
  }
  rows.push({ band, cells });
}
const colW = ROLES.map((_, c) => Math.max(...rows.map((r) => (r.cells[c] ? r.cells[c].img.w : 0))) * Z + 14 * Z);
const rowH = rows.map((r) => Math.ceil(Math.max(...r.cells.map((b) => (b ? Math.max(b.img.h, -b.img.oy + b.refl.h * 0.6) : 0))) * Z + 12 * Z));
const W = colW.reduce((a, b) => a + b, 0) + 20, H = rowH.reduce((a, b) => a + b, 0) + 20;
const out = new PNG({ width: W, height: H });
const WATER = [79, 124, 168], WATER2 = [72, 116, 160];
for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
  const o = (y * W + x) * 4;
  const c = (Math.floor(y / (H / rows.length)) % 2) ? WATER2 : WATER;
  out.data[o] = c[0]; out.data[o + 1] = c[1]; out.data[o + 2] = c[2]; out.data[o + 3] = 255;
}
function blit(R, x0, y0, alpha = 1) {
  for (let j = 0; j < R.h; j += 1) for (let i = 0; i < R.w; i += 1) {
    const s = (j * R.w + i) * 4;
    if (!R.data[s + 3]) continue;
    for (let dy = 0; dy < Z; dy += 1) for (let dx = 0; dx < Z; dx += 1) {
      const X = x0 + i * Z + dx, Y = y0 + j * Z + dy;
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const o = (Y * W + X) * 4;
      for (let c = 0; c < 3; c += 1) out.data[o + c] = out.data[o + c] * (1 - alpha) + R.data[s + c] * alpha;
    }
  }
}
let y = 10;
rows.forEach((r, ri) => {
  let x = 10;
  r.cells.forEach((b, c) => {
    if (b) {
      // Le point de flottaison au tiers bas de la case.
      const cx = x + Math.round(colW[c] / 2), cy = y + Math.round(rowH[ri] * 0.62);
      blit(b.refl, cx + b.refl.ox * Z, cy + b.refl.oy * Z, 0.4);
      blit(b.img, cx + b.img.ox * Z, cy + b.img.oy * Z);
      compositeCrew(out, b, b.M, r.band, cx, cy, Z);
    }
    x += colW[c];
  });
  y += rowH[ri];
});
fs.writeFileSync(`${OUT}/vitrine-eres.png`, PNG.sync.write(out));
console.log(`OK ${OUT}/vitrine-eres.png ${W}x${H}`);
