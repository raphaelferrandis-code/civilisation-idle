// ecartSol.mjs — écarte d'un sprite de maison les couleurs qui se CONFONDENT avec le sol
// peint de ses ères (garde isoBuildingGroundContrast, rayon 24).
//
// Chaque couleur du sprite à moins de `--min` (26 par défaut) d'un des sols donnés est
// remplacée par la couleur la plus proche de SA PROPRE palette qui reste à plus de `min`
// de tous ces sols. Le dessin ne bouge pas ; aucune couleur n'est inventée. C'est le geste
// déjà fait à la main pour `domus` et `insula2` (bande 4, 2026-10-01).
//
// `--darker` : ne choisir que des couleurs PLUS SOMBRES que l'original. Sur un sprite
// clair (la nacre des ères cosmiques), les gris qui touchent le sol sont les faces à
// l'OMBRE ; la plus proche serait souvent plus claire, ce qui aplatirait le volume.
// Usage : node scripts/ecartSol.mjs <png> "r,g,b;r,g,b" [--min=26] [--darker] [--dry]
import fs from 'node:fs';
import { PNG } from 'pngjs';

const [file, groundsArg, ...flags] = process.argv.slice(2);
if (!file || !groundsArg) { console.error('usage : <png> "r,g,b;r,g,b" [--min=26] [--dry]'); process.exit(1); }
const min = Number((flags.find((f) => f.startsWith('--min=')) || '--min=26').slice(6));
const dry = flags.includes('--dry');
const darker = flags.includes('--darker');
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const grounds = groundsArg.split(';').map((s) => s.split(',').map(Number));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const near = (c) => Math.min(...grounds.map((g) => dist(c, g)));

const p = PNG.sync.read(fs.readFileSync(file));
const count = new Map();
for (let i = 0; i < p.width * p.height; i += 1) {
  if (p.data[i * 4 + 3] < 128) continue;
  const k = (p.data[i * 4] << 16) | (p.data[i * 4 + 1] << 8) | p.data[i * 4 + 2];
  count.set(k, (count.get(k) || 0) + 1);
}
const rgbOf = (k) => [(k >> 16) & 255, (k >> 8) & 255, k & 255];
const safe = [...count.keys()].filter((k) => near(rgbOf(k)) >= min);
const map = new Map();
for (const k of count.keys()) {
  const c = rgbOf(k);
  if (near(c) >= min) continue;
  let best = null, bd = Infinity;
  const pool = darker ? safe.filter((s) => lum(rgbOf(s)) < lum(c)) : safe;
  for (const s of (pool.length ? pool : safe)) { const d = dist(c, rgbOf(s)); if (d < bd) { bd = d; best = s; } }
  if (best != null) map.set(k, best);
}
let ink = 0, moved = 0;
for (const v of count.values()) ink += v;
for (const [k, s] of map) {
  moved += count.get(k);
  const hex = (x) => '#' + x.toString(16).padStart(6, '0');
  console.log(`${hex(k)} (${(count.get(k) / ink * 100).toFixed(1)} %, à ${near(rgbOf(k)).toFixed(1)} du sol) → ${hex(s)} (à ${near(rgbOf(s)).toFixed(1)})`);
}
console.log(`${map.size} couleurs, ${(moved / ink * 100).toFixed(1)} % de l'encre${dry ? ' (dry)' : ''}`);
if (!dry && map.size) {
  for (let i = 0; i < p.width * p.height; i += 1) {
    if (p.data[i * 4 + 3] < 128) continue;
    const k = (p.data[i * 4] << 16) | (p.data[i * 4 + 1] << 8) | p.data[i * 4 + 2];
    const s = map.get(k);
    if (s == null) continue;
    p.data[i * 4] = (s >> 16) & 255; p.data[i * 4 + 1] = (s >> 8) & 255; p.data[i * 4 + 2] = s & 255;
  }
  fs.writeFileSync(file, PNG.sync.write(p));
}
