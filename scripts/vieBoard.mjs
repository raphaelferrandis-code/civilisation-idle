// Planche de contrôle de la PETITE VIE (src/game/map/iso/vieArt.js).
// Chaque dessin est posé deux fois : agrandi ×K pour lire les pixels, et à
// taille réelle (×1 et ×2, les deux zooms de jeu courants) sur un fond d'eau ou
// de pavé tiré du jeu — c'est à cette taille-là qu'il doit se lire.
// Usage : node scripts/vieBoard.mjs [sortie.png]
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { VIE_ART, FISH_SHADOW, decodeRows, ringPixels, mistStrand } from '../src/game/map/iso/vieArt.js';

const OUT = process.argv[2] || '.preview-shots/vie-board.png';
const K = 8;
const WATER = [58, 110, 138], PAVE = [176, 166, 146], GRASS = [104, 138, 70];
const W = 1500, H = 1180;
const img = new PNG({ width: W, height: H });
const put = (x, y, c, a = 255) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4, k = a / 255;
  img.data[i] = Math.round(img.data[i] * (1 - k) + c[0] * k);
  img.data[i + 1] = Math.round(img.data[i + 1] * (1 - k) + c[1] * k);
  img.data[i + 2] = Math.round(img.data[i + 2] * (1 - k) + c[2] * k);
  img.data[i + 3] = 255;
};
const rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, c); };
rect(0, 0, W, H, [34, 34, 38]);
// Un sprite décodé posé à l'échelle s (entière), alpha global a.
const blit = (sp, x, y, s, a = 1) => {
  for (let j = 0; j < sp.h; j++) for (let i = 0; i < sp.w; i++) {
    const q = (j * sp.w + i) * 4;
    if (!sp.data[q + 3]) continue;
    for (let v = 0; v < s; v++) for (let u = 0; u < s; u++) put(x + i * s + u, y + j * s + v, [sp.data[q], sp.data[q + 1], sp.data[q + 2]], sp.data[q + 3] * a);
  }
};

let cx = 16, cy = 16, rowH = 0;
const cell = (w, h) => {
  if (cx + w > W - 16) { cx = 16; cy += rowH + 16; rowH = 0; }
  const at = [cx, cy];
  cx += w + 16; rowH = Math.max(rowH, h);
  return at;
};
// Une planche : chaque image ×K sur fond, puis ×1 et ×2 sur le même fond.
const WATERY = new Set(['duckM', 'duckF', 'duckling', 'swan', 'fishUp', 'fishTop', 'fishDown', 'leaf', 'dragonfly']);
for (const [name, def] of Object.entries(VIE_ART)) {
  const bg = WATERY.has(name) ? WATER : /heron|pigeon|gull/.test(name) ? PAVE : GRASS;
  for (const flip of [false, true]) {
    for (const fr of def.frames) {
      const sp = decodeRows(fr, { flip });
      const bw = sp.w * K + 8 + sp.w * 3 + 24, bh = Math.max(sp.h * K, 20) + 8;
      const [x, y] = cell(bw, bh);
      rect(x, y, bw, bh, bg);
      blit(sp, x + 4, y + 4, K);
      blit(sp, x + sp.w * K + 12, y + 4, 1);
      blit(sp, x + sp.w * K + 12, y + 10 + sp.h, 2);
    }
  }
}
// Ombres de poissons : les quatre caps (miroirs), deux poses, sur l'eau à 34 %.
cx = 16; cy += rowH + 24; rowH = 0;
for (const [flip, flipY] of [[false, false], [true, false], [false, true], [true, true]]) {
  for (const fr of [...FISH_SHADOW.small, ...FISH_SHADOW.big]) {
    const sp = decodeRows(fr, { flip, flipY });
    const bw = sp.w * K + 40, bh = sp.h * K + 8;
    const [x, y] = cell(bw, bh);
    rect(x, y, bw, bh, WATER);
    blit(sp, x + 4, y + 4, K, 0.34);
    blit(sp, x + sp.w * K + 12, y + 4, 1, 0.34);
    blit(sp, x + sp.w * K + 12, y + 14, 2, 0.34);
  }
}
// Anneaux : rayons 1 à 7.
cx = 16; cy += rowH + 24; rowH = 0;
{
  const [x, y] = cell(900, 90);
  rect(x, y, 900, 90, WATER);
  for (let r = 1; r <= 7; r++) {
    for (const [px, py] of ringPixels(r)) {
      for (let v = 0; v < 4; v++) for (let u = 0; u < 4; u++) put(x + 20 + (r - 1) * 110 + 30 + px * 4 + u, y + 45 + py * 4 + v, [214, 232, 240], 200);
      put(x + 20 + (r - 1) * 110 + 80 + px, y + 45 + py, [214, 232, 240], 200);
    }
  }
}
// Brume : quatre filets à l'angle d'un fleuve iso (2:1), densités 0,3 → 1.
cx = 16; cy += rowH + 24; rowH = 0;
{
  const bw = W - 32, bh = 300;
  const [x, y] = cell(bw, bh);
  rect(x, y, bw, bh, WATER);
  const dens = [0.3, 0.55, 0.8, 1];
  dens.forEach((d, i) => {
    const m = mistStrand(11 + i, 2, 1, 70 + i * 12, d);
    const sp = { w: m.w, h: m.h, data: m.data };
    blit(sp, x + 20 + i * 180, y + 20, 1);
    blit(sp, x + 20 + i * 180, y + 110, 2);
  });
  // Les mêmes, dans l'autre sens du fleuve (2:-1).
  dens.forEach((d, i) => {
    const m = mistStrand(31 + i, 2, -1, 80, d);
    blit({ w: m.w, h: m.h, data: m.data }, x + 760 + i * 170, y + 60, 2);
  });
}
fs.writeFileSync(OUT, PNG.sync.write(img));
console.log('planche →', OUT);
