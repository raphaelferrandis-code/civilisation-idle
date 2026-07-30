/* ---------------------------------------------------------------------------
 * bakeWaterTiles.mjs — cuit la texture d'eau animée du fleuve iso.
 *
 * SOURCE : pack « 16x16 Water Tiles Animated Tile Set 1 » de Zro Dfects
 * (zrodfects.itch.io, gratuit/prix libre). Licence : usage commercial et
 * modification autorisés, crédit apprécié, REDISTRIBUTION DU PACK INTERDITE —
 * d'où ce script : le pack source reste HORS du dépôt, seul le dérivé remappé
 * est versionné. Passer le dossier décompressé via --src.
 *
 * Grille du pack (mesurée, pas supposée) : planche 208x407, tuiles 16x16 à
 * l'origine (16,16) avec un pas de 18 (2 px de gouttière) — 8 FRAMES en
 * colonnes, 21 COLORIS en lignes, plus une ligne de repères rouges en haut.
 *
 * REMAP : le pack est en bleu vif (5 teintes, de 24,47,68 à 189,231,255), le
 * fleuve du jeu est une ardoise désaturée (WATER = 74,98,109 dans
 * isoRenderer.js). On remappe les 5 teintes par RANG DE LUMINANCE sur une rampe
 * ardoise, choisie pour que la MOYENNE PONDÉRÉE par le nombre de pixels retombe
 * sur WATER : la texture apporte la structure sans déplacer le ton. Le script
 * vérifie cette moyenne et sort en erreur si elle dérive.
 * ------------------------------------------------------------------------- */
import { createRequire } from 'node:module';
const require = createRequire(new URL('../package.json', import.meta.url));
const { PNG } = require('pngjs');
import fs from 'node:fs';
import path from 'node:path';

const OX = 16, OY = 16, PITCH = 18, T = 16, FRAMES = 8;
const WATER = [74, 98, 109];        // isoRenderer.js — teinte du corps d'eau
const MEAN_TOL = 4;                 // dérive max tolérée par canal

// Rampe cible, du plus sombre au plus clair. Voir l'en-tête : ces valeurs ne
// sont pas au jugé, elles sont contraintes par le contrôle de moyenne ci-dessous.
const RAMP = [
  [44, 62, 72],      // creux
  [68, 92, 103],     // corps (≈60 % des pixels)
  [92, 119, 130],    // ride
  [122, 150, 160],   // crête
  [158, 184, 192],   // éclat
];

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const SRC = arg('src', null);
const SHEET = arg('sheet', 'Horizontal');
const ROW = Number(arg('row', 4));
const OUT = arg('out', path.join(process.cwd(), 'public/pixelart/water/river-tiles.png'));
// --native : on GARDE les couleurs du pack au lieu de les rabattre sur l'ardoise.
// Sert aux coloris pilotés par l'état de la partie (azur / turquoise / bleu
// d'hiver) : c'est justement leur teinte qui porte l'information, la ramener sur
// WATER la détruirait. Le contrôle de moyenne n'a alors plus d'objet.
const NATIVE = process.argv.includes('--native');

if (!SRC) {
  console.error('usage: node scripts/bakeWaterTiles.mjs --src <dossier du pack décompressé> [--sheet Horizontal|Swirly|Vertical] [--row 4]');
  process.exit(2);
}

function findSheet(dir, kind) {
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.name.toLowerCase().endsWith('.png') && e.name.toLowerCase().includes(kind.toLowerCase())) return p;
    }
  }
  return null;
}

const file = findSheet(SRC, SHEET);
if (!file) { console.error(`planche "${SHEET}" introuvable sous ${SRC}`); process.exit(2); }
const src = PNG.sync.read(fs.readFileSync(file));
const at = (p, x, y) => { const i = (y * p.width + x) * 4; return [p.data[i], p.data[i + 1], p.data[i + 2], p.data[i + 3]]; };
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

// 1. Palette source du coloris demandé, avec le nombre de pixels de chacune.
const counts = new Map();
for (let f = 0; f < FRAMES; f++) {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const c = at(src, OX + f * PITCH + x, OY + ROW * PITCH + y);
    if (c[3] < 250) { console.error(`pixel non opaque en frame ${f} (${x},${y}) — grille ou coloris faux`); process.exit(1); }
    const k = c.slice(0, 3).join(',');
    counts.set(k, (counts.get(k) || 0) + 1);
  }
}
const pal = [...counts.entries()].map(([k, n]) => ({ c: k.split(',').map(Number), n })).sort((a, b) => lum(a.c) - lum(b.c));
const CIBLE = NATIVE ? pal.map(p => p.c) : RAMP;
if (pal.length !== CIBLE.length) {
  console.error(`la source a ${pal.length} teintes, la rampe en a ${CIBLE.length} — grille ou coloris faux`);
  process.exit(1);
}

// 2. Contrôle de moyenne : la texture ne doit pas déplacer le ton du fleuve.
//    Sans objet en --native, où la teinte EST l'information (cf. en-tête).
const total = pal.reduce((s, p) => s + p.n, 0);
const mean = [0, 1, 2].map(i => Math.round(pal.reduce((s, p, j) => s + CIBLE[j][i] * p.n, 0) / total));
const drift = [0, 1, 2].map(i => Math.abs(mean[i] - WATER[i]));

console.log(`planche : ${path.basename(file)}  coloris ${ROW}  ${FRAMES} frames de ${T}x${T}${NATIVE ? '  [NATIF, sans remap]' : ''}`);
console.log(NATIVE ? 'palette conservée (par rang de luminance) :' : 'remap (par rang de luminance) :');
pal.forEach((p, i) => console.log(`  ${String(p.c.join(',')).padEnd(13)} x${String(p.n).padStart(4)} (${String(Math.round(100 * p.n / total)).padStart(2)}%)  ->  ${CIBLE[i].join(',')}`));
console.log(`moyenne pondérée obtenue ${mean.join(',')} contre WATER ${WATER.join(',')}  -> dérive ${drift.join('/')}`);
if (!NATIVE && Math.max(...drift) > MEAN_TOL) {
  console.error(`ABANDON : la rampe déplace le ton du fleuve de plus de ${MEAN_TOL} par canal.`);
  process.exit(1);
}

// 3. Cuisson : bande horizontale de 8 frames (128x16).
const out = new PNG({ width: T * FRAMES, height: T });
const key = new Map(pal.map((p, i) => [p.c.join(','), CIBLE[i]]));
for (let f = 0; f < FRAMES; f++) {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const c = at(src, OX + f * PITCH + x, OY + ROW * PITCH + y);
    const t = key.get(c.slice(0, 3).join(','));
    const i = (y * out.width + (f * T + x)) * 4;
    out.data[i] = t[0]; out.data[i + 1] = t[1]; out.data[i + 2] = t[2]; out.data[i + 3] = 255;
  }
}

// 4. Contrôle du raccord : la tuile doit se répéter sans couture visible.
//    Rapport = discontinuité au bord / discontinuité interne moyenne. ~1 = bon.
const px = (x, y) => { const i = (y * out.width + x) * 4; return [out.data[i], out.data[i + 1], out.data[i + 2]]; };
const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
let worst = 0;
for (let f = 0; f < FRAMES; f++) {
  const o = f * T;
  let wH = 0, iH = 0, wV = 0, iV = 0;
  for (let y = 0; y < T; y++) { wH += dist(px(o + T - 1, y), px(o, y)); for (let x = 1; x < T; x++) iH += dist(px(o + x - 1, y), px(o + x, y)); }
  for (let x = 0; x < T; x++) { wV += dist(px(o + x, T - 1), px(o + x, 0)); for (let y = 1; y < T; y++) iV += dist(px(o + x, y - 1), px(o + x, y)); }
  worst = Math.max(worst, (wH / T) / (iH / (T * (T - 1))), (wV / T) / (iV / (T * (T - 1))));
}
console.log(`raccord : pire rapport ${worst.toFixed(2)} (1 = aussi continu qu'à l'intérieur)`);
if (worst > 2.2) { console.error('ABANDON : la tuile n\'est pas seamless.'); process.exit(1); }

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, PNG.sync.write(out));
console.log(`écrit ${path.relative(process.cwd(), OUT)}  ${out.width}x${out.height}`);
