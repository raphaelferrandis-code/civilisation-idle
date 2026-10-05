// installVegetation.mjs — pose la FAMILLE D'ARBRES (docs/PLAN-VEGETATION.md, lot 1).
//
//   node scripts/installVegetation.mjs            écrit public/pixelart/iso/<nom>.png
//   node scripts/installVegetation.mjs --dry      mesure seulement
//   puis : node scripts/snowTrees.mjs             (versions d'hiver dérivées)
//
// SOURCES. Les générations PixelLab retenues (generate-with-style-v2, images de style =
// les arbres du jeu passés à la dose B, puis les premiers chênes retenus — une seule
// main) sont gardées BRUTES dans scripts/data/vegetation-raw/ : la pose se rejoue au
// bit près sans regénérer. Le choix (quelle image pour quel arbre) est dans
// scripts/data/vegetation-trees.json.
//
// LA POSE, image par image :
//  1. canevas carré de `px` (64 jeune, 96 adulte, 128 vieil arbre) : le GRAIN ne change
//     pas d'un arbre à l'autre — le moteur dessine un canevas de 64 aux 2/3 de celui de
//     96 (treeSpriteK, isoGroundProps.js). Aucune image n'est redimensionnée ;
//  2. le PIED (bas de l'encre, centre du tronc mesuré sur les 4 rangées du bas) est posé
//     à 0,92 du canevas et au milieu : c'est l'ancre de tous les arbres de la carte ;
//  3. la DOSE : un gamma sur la luminance amène la moyenne du FEUILLAGE (teinte 50-200°,
//     saturation > 0,12) sur la cible de l'essence, reflets gardés (DOSE_B) ;
//  4. 24 teintes au plus (même règle que scripts/quantize.cjs) — fait par ce script-ci.
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { toneOne, lum } from './vegetationDose.mjs';

const OUT = 'public/pixelart/iso';
const RAW = 'scripts/data/vegetation-raw';
const MANIFEST = JSON.parse(fs.readFileSync('scripts/data/vegetation-trees.json', 'utf8'));
const DRY = process.argv.includes('--dry');
const FOOT = 0.92;

// Réglage par ESSENCE : luminance moyenne visée du feuillage, saturation, teinte.
// feuillu = la dose B (86 sur les arbres d'avant) ; le bouleau, plus clair de nature,
// reste sous le pré (92) ; les conifères gardent la valeur du sapin d'avant.
// `bark` : saturation à part pour l'écorce (teinte < 45°) — le tronc saumon du pin
// sylvestre sortait plus vif que tout le reste de la forêt.
// `hue` ne tourne QUE le feuillage (masque) : les conifères générés tiraient au bleu
// canard, ramenés vers le vert ; tourner l'écorce aussi la rendait rose.
const FAMILY = {
  feuillu: { y: 84, sat: 1, hue: 0, hi: [0.5, 0.78, 0.85] },
  bouleau: { y: 92, sat: 0.85, hue: 10 },
  sapin: { y: 62, sat: 0.9, hue: -18 },
  pin: { y: 66, sat: 0.78, hue: -20, bark: 0.6 },
  buisson: { y: 80, sat: 1, hue: 0, hi: [0.5, 0.78, 0.85] },
  cypres: { y: 60, sat: 0.95, hue: 0 },          // arbres de ville (lot 6) : déjà vert franc
};

// Feuillage = teinte verte (50-200°) assez saturée (saturation HSV > 0,15). Le masque
// se prend sur l'image AVANT la dose et sert aux deux mesures : la dose déplace la
// teinte, un masque recalculé après ne compterait plus les mêmes pixels.
function hueSat(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d || mx < 16) return [0, 0];
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, d / mx];
}
const isLeaf = (r, g, b) => { const [h, s] = hueSat(r, g, b); return h >= 50 && h <= 200 && s > 0.15; };
function leafMask(png) {
  const m = new Uint8Array(png.width * png.height), d = png.data;
  for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] >= 128 && isLeaf(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]) ? 1 : 0;
  return m;
}
let MASK = null;

function leafMean(png, o, gamma) {
  let s = 0, n = 0;
  const d = png.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!MASK[i >> 2]) continue;
    const c = o ? toneOne(d[i], d[i + 1], d[i + 2], o, gamma) : [d[i], d[i + 1], d[i + 2]];
    s += lum(c[0], c[1], c[2]); n++;
  }
  return n ? s / n : 0;
}
function gammaLeaf(png, o) {
  let lo = 0.2, hi = 4;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (leafMean(png, o, m) > o.y) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

// Boîte d'encre et pied.
function inkBox(p) {
  let x0 = p.width, y0 = p.height, x1 = -1, y1 = -1;
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
    if (p.data[(y * p.width + x) * 4 + 3] < 128) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}
function footX(p, y1) {
  let s = 0, n = 0;
  for (let y = Math.max(0, y1 - 3); y <= y1; y++) for (let x = 0; x < p.width; x++) {
    if (p.data[(y * p.width + x) * 4 + 3] >= 128) { s += x; n++; }
  }
  return n ? s / n : p.width / 2;
}

// Quantification médiane (sans tramage), alpha binaire conservé.
function quantize(p, N = 24) {
  const px = [];
  for (let i = 0; i < p.data.length; i += 4) if (p.data[i + 3] >= 128) px.push([p.data[i], p.data[i + 1], p.data[i + 2]]);
  const uniq = new Set(px.map((c) => (c[0] << 16) | (c[1] << 8) | c[2]));
  if (uniq.size <= N) return p;
  let boxes = [px];
  while (boxes.length < N) {
    let bi = -1, br = -1, ch = 0;
    boxes.forEach((b, i) => {
      if (b.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let mn = 255, mx = 0; for (const v of b) { if (v[c] < mn) mn = v[c]; if (v[c] > mx) mx = v[c]; }
        if (mx - mn > br) { br = mx - mn; bi = i; ch = c; }
      }
    });
    if (bi < 0 || br <= 0) break;
    const b = boxes[bi].sort((u, v) => u[ch] - v[ch]), m = b.length >> 1;
    boxes.splice(bi, 1, b.slice(0, m), b.slice(m));
  }
  const pal = boxes.map((b) => [0, 1, 2].map((c) => Math.round(b.reduce((a, v) => a + v[c], 0) / b.length)));
  const out = new PNG({ width: p.width, height: p.height });
  p.data.copy(out.data);
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] < 128) { out.data[i] = out.data[i + 1] = out.data[i + 2] = out.data[i + 3] = 0; continue; }
    let best = 0, bd = 1e9;
    for (let k = 0; k < pal.length; k++) {
      const dr = out.data[i] - pal[k][0], dg = out.data[i + 1] - pal[k][1], db = out.data[i + 2] - pal[k][2];
      const dd = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
      if (dd < bd) { bd = dd; best = k; }
    }
    out.data[i] = pal[best][0]; out.data[i + 1] = pal[best][1]; out.data[i + 2] = pal[best][2]; out.data[i + 3] = 255;
  }
  return out;
}

for (const t of MANIFEST.trees) {
  const src = PNG.sync.read(fs.readFileSync(`${RAW}/${t.name}.png`));
  const bb = inkBox(src);
  // Canevas : `px` de l'essence, AGRANDI (par pas de 8) si l'encre n'y tient pas avec
  // le pied à 0,92 et au milieu — le moteur lit la taille réelle du PNG, le grain reste.
  const fxSrc = footX(src, bb.y1);
  const halfW = Math.max(fxSrc - bb.x0, bb.x1 - fxSrc) + 1, above = bb.y1 - bb.y0 + 1;
  let N = t.px;
  while (Math.round(N * FOOT) < above || N / 2 < halfW) N += 8;
  const out = new PNG({ width: N, height: N });
  const fy = Math.round(N * FOOT), fx = N / 2;
  const dx = Math.round(fx - fxSrc), dy = fy - bb.y1;
  let clipped = 0;
  for (let y = bb.y0; y <= bb.y1; y++) for (let x = bb.x0; x <= bb.x1; x++) {
    const q = (y * src.width + x) * 4;
    if (src.data[q + 3] < 128) continue;
    const X = x + dx, Y = y + dy;
    if (X < 0 || Y < 0 || X >= N || Y >= N) { clipped++; continue; }
    const d = (Y * N + X) * 4;
    out.data[d] = src.data[q]; out.data[d + 1] = src.data[q + 1]; out.data[d + 2] = src.data[q + 2]; out.data[d + 3] = 255;
  }
  const o = FAMILY[t.family];
  MASK = leafMask(out);
  const oBark = { ...o, hue: 0 };
  const before = leafMean(out);
  const g = gammaLeaf(out, o);
  const toned = new PNG({ width: N, height: N });
  out.data.copy(toned.data);
  for (let i = 0; i < toned.data.length; i += 4) {
    if (!toned.data[i + 3]) continue;
    let c = toneOne(toned.data[i], toned.data[i + 1], toned.data[i + 2], MASK[i >> 2] ? o : oBark, g);
    if (o.bark != null) {
      const [h, sat] = hueSat(toned.data[i], toned.data[i + 1], toned.data[i + 2]);
      if ((h < 45 || h > 340) && sat > 0.15) {
        const y = lum(c[0], c[1], c[2]);
        c = c.map((v) => Math.max(0, Math.min(255, Math.round(y + (v - y) * o.bark))));
      }
    }
    toned.data[i] = c[0]; toned.data[i + 1] = c[1]; toned.data[i + 2] = c[2];
  }
  const fin = quantize(toned, 24);
  console.log(t.name.padEnd(18), `${N}px${N !== t.px ? ' (agrandi)' : ''}`, `encre ${bb.x1 - bb.x0 + 1}×${bb.y1 - bb.y0 + 1}`, `feuillage ${before.toFixed(0)}→${leafMean(fin).toFixed(0)}`,
    clipped ? `⚠ ${clipped} px hors canevas` : '');
  if (!DRY) fs.writeFileSync(`${OUT}/${t.name}.png`, PNG.sync.write(fin));
}
