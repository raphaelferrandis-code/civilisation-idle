// Planche des bateaux DESSINÉS PAR LE CODE (docs/PLAN-BATEAUX.md) : une ligne par
// modèle × variante, 8 caps (un sur quatre des 32 cuits) au zoom choisi, sur une
// eau du jeu, reflet compris. Une bande au zoom 1 en bas : la vraie taille.
//   node scripts/boatPlanche.mjs [bande] [zoom]   → .preview-shots/bateaux/planche-b<bande>.png
import { PNG } from 'pngjs';
import fs from 'node:fs';
import { bakeBoat, dirTheta, BOAT_DIRS } from '../src/game/map/iso/boatBake.js';
import { BOAT_MODELS, fleetFor } from '../src/game/map/iso/boatKits.js';

const band = +(process.argv[2] || 4);
const Z = +(process.argv[3] || 3);
const OUT = '.preview-shots/bateaux';
fs.mkdirSync(OUT, { recursive: true });

const fleet = fleetFor(band);
const ids = [...new Set(Object.values(fleet).flat())].filter((id) => BOAT_MODELS[id]);
const rows = [];
for (const id of ids) {
  const M = BOAT_MODELS[id];
  // Graines choisies pour montrer l'éventail des variantes (coque, voile, cargaison).
  const SEEDS = { corbita: [1, 3, 4, 8], galere: [1, 3, 5], codicaria: [1, 2, 6, 8] };
  const BYROLE = { trade: [1, 3, 4], barge: [1, 2, 6], fisher: [3], ferry: [3, 8], landing: [1], service: [1, 3] };
  const seeds = SEEDS[id] || BYROLE[M.role] || [3, 8];
  for (const seed of seeds) rows.push({ M, seed, state: 'cruise' });
  if (M.role === 'fisher') rows.push({ M, seed: 3, state: 'anchor' });
  if (M.role === 'trade' && (id === fleet.trade[0])) rows.push({ M, seed: 1, state: 'dock' });
}
const COLS = 8;
const cell = (M) => Math.ceil(Math.max(M.len, 30) * 1.45 + 16) * Z;
const CW = Math.max(...rows.map((r) => cell(r.M)));
const rowH = (M) => Math.ceil((M.bounds[5] + M.len * 0.75 + 10) * Z);
const H = rows.reduce((s, r) => s + rowH(r.M), 0) + 140;
const W = CW * COLS;
const out = new PNG({ width: W, height: H });
const WATER = [79, 124, 168], WATER2 = [70, 113, 156];
for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
  const o = (y * W + x) * 4;
  const c = ((Math.floor(x / (16 * Z)) + Math.floor(y / (8 * Z))) % 2) ? WATER : WATER2;
  out.data[o] = c[0]; out.data[o + 1] = c[1]; out.data[o + 2] = c[2]; out.data[o + 3] = 255;
}
function blit(R, x0, y0, z, alpha = 1) {
  for (let j = 0; j < R.h; j += 1) for (let i = 0; i < R.w; i += 1) {
    const s = (j * R.w + i) * 4;
    if (!R.data[s + 3]) continue;
    for (let dy = 0; dy < z; dy += 1) for (let dx = 0; dx < z; dx += 1) {
      const X = x0 + i * z + dx, Y = y0 + j * z + dy;
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const o = (Y * W + X) * 4;
      for (let c = 0; c < 3; c += 1) out.data[o + c] = out.data[o + c] * (1 - alpha) + R.data[s + c] * alpha;
    }
  }
}
let y = 0;
let ms = 0, nb = 0;
for (const r of rows) {
  const hR = rowH(r.M);
  const variant = r.M.variant(r.seed);
  for (let col = 0; col < COLS; col += 1) {
    const k = (col * BOAT_DIRS) / COLS;
    const t0 = performance.now();
    const b = bakeBoat(r.M, dirTheta(k), { variant, state: r.state, k: 1.2 });
    ms += performance.now() - t0; nb += 1;
    const cx = col * CW + Math.round(CW / 2), cy = y + Math.round((r.M.bounds[5] + 4) * Z);
    blit(b.refl, cx + b.refl.ox * Z, cy + b.refl.oy * Z, Z, 0.42);
    blit(b.img, cx + b.img.ox * Z, cy + b.img.oy * Z, Z);
  }
  y += hR;
}
// Bande au zoom 1 : tous les modèles côte à côte, cap « écran horizontal ».
let x = 20;
for (const id of ids) {
  const M = BOAT_MODELS[id];
  for (const k of [4, 12]) {
    const b = bakeBoat(M, dirTheta(k), { variant: M.variant(1), state: 'cruise', k: 1.2 });
    blit(b.refl, x + b.refl.ox, y + 70 + b.refl.oy, 1, 0.42);
    blit(b.img, x + b.img.ox, y + 70 + b.img.oy, 1);
    x += M.len + 16;
  }
}
fs.writeFileSync(`${OUT}/planche-b${band}.png`, PNG.sync.write(out));
console.log(`OK ${OUT}/planche-b${band}.png ${W}x${H} — ${nb} cuissons, ${(ms / nb).toFixed(1)} ms/cuisson`);
