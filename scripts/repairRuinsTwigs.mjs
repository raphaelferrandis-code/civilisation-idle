// repairRuinsTwigs.mjs — recolle les bouts de rameaux de l'Arbre des Ruines.
//
// L'illustration PixelLab (public/pixelart/ruins-tree/memoire.png) dessine les
// rameaux fins en TIRETS : des fragments de bois séparés de leur branche par un
// ou deux pixels de ciel — « les bouts des branches sont coupés » (Raph). Ce
// script comble ces trous au pixel, dans la couleur du rameau :
//   - le FOND, ce sont les 4 tons du ciel (nuit + 3 nuances de nuages) et les 3
//     tons de la lune, relevés au pixel ; tout le reste au-dessus de l'horizon est
//     du bois — les gris-bleu des rameaux compris (le test « ciel » des veines,
//     plus large, les prenait pour du ciel et découpait les rameaux) ;
//   - seuls les fragments de BOIS (pas une goutte d'ambre, une feuille, une
//     braise, une étoile) de 40 px au plus, à 4 px au plus de l'arbre, sont
//     recollés, dans la couronne et les branches (pas les ruines de l'horizon) ;
//   - le trou n'est comblé que s'il ne traverse QUE du fond ;
//   - un fragment se recolle au morceau le plus proche EN DIRECTION de l'arbre
//     (les tirets d'un même rameau se rattachent en chaîne), par passes.
// Les fragments plus loin (étoiles, flocons de cendre) restent où ils sont.
//
//   node scripts/repairRuinsTwigs.mjs           → écrit l'image réparée
//   node scripts/repairRuinsTwigs.mjs --dry     → planche avant/après seulement
// Puis : node scripts/buildRuinsSap.mjs (les veines lisent le bois de l'image).
import fs from "node:fs";
import { PNG } from "pngjs";
import { lightClass } from "../src/components/views/ruinsTree/sapMaterials.js";

const IMG = "public/pixelart/ruins-tree/memoire.png";
const DRY = process.argv.includes("--dry");
const MAX_FRAG = 40, MAX_GAP = 4.5;
const TOP = 205; // en dessous : la ligne des ruines à l'horizon, on n'y touche pas
const BACKGROUND = new Set(["6,4,32", "14,16,46", "24,28,63", "33,47,80", "227,249,251", "194,225,236", "171,206,226"]);

const png = PNG.sync.read(fs.readFileSync(IMG));
const before = Buffer.from(png.data);
const W = png.width, G = TOP;
const rgb = (k) => [png.data[k * 4], png.data[k * 4 + 1], png.data[k * 4 + 2]];
const clsAt = (k) => { const [r, g, b] = rgb(k); return lightClass(r, g, b, k % W, (k / W) | 0); };
const isSky = (k) => BACKGROUND.has(rgb(k).join(","));
const isWood = (k) => !isSky(k);
const lum = (k) => { const [r, g, b] = rgb(k); return (r + g + b) / 3; };

function components() {
  const comp = new Int32Array(W * G).fill(-1);
  const list = [];
  for (let k = 0; k < W * G; k++) {
    if (comp[k] >= 0 || !isWood(k)) continue;
    const id = list.length, px = [k], stack = [k];
    comp[k] = id;
    while (stack.length) {
      const q = stack.pop(), x = q % W, y = (q / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= G) continue;
        const r = ny * W + nx;
        if (comp[r] < 0 && isWood(r)) { comp[r] = id; px.push(r); stack.push(r); }
      }
    }
    list.push(px);
  }
  return { comp, list };
}

// pixels intermédiaires d'un segment (Bresenham), extrémités exclues
function between(a, b) {
  let x0 = a % W, y0 = (a / W) | 0;
  const x1 = b % W, y1 = (b / W) | 0;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const out = [];
  for (;;) {
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
    if (x0 === x1 && y0 === y1) break;
    out.push(y0 * W + x0);
  }
  return out;
}

// Distance (en pas de 8-voisins) de chaque pixel à l'arbre : un fragment ne se
// recolle qu'à un morceau PLUS PROCHE de l'arbre que lui — les tirets d'un
// rameau se rattachent l'un à l'autre en remontant vers la branche, et rien ne
// relie entre eux des flocons de cendre perdus dans le ciel.
function distanceToMain(comp, main) {
  const D = new Int32Array(W * G).fill(1 << 20);
  const q = new Int32Array(W * G);
  let qe = 0;
  for (let k = 0; k < W * G; k++) if (comp[k] === main) { D[k] = 0; q[qe++] = k; }
  for (let h = 0; h < qe; h++) {
    const k = q[h], x = k % W, y = (k / W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= G) continue;
      const n = ny * W + nx;
      if (D[n] > D[k] + 1) { D[n] = D[k] + 1; q[qe++] = n; }
    }
  }
  return D;
}
const MAX_REACH = 25; // un fragment à plus de 25 px de l'arbre n'est pas un bout de rameau

let filled = 0, joined = 0;
for (let pass = 0; pass < 12; pass++) {
  const { comp, list } = components();
  const main = list.reduce((best, c, i) => (c.length > list[best].length ? i : best), 0);
  const D = distanceToMain(comp, main);
  let changed = false;
  for (let id = 0; id < list.length; id++) {
    const frag = list[id];
    if (id === main || frag.length > MAX_FRAG) continue;
    if (frag.filter((k) => clsAt(k)).length > frag.length / 2) continue; // ambre, feuille, braise : laissées libres
    if (frag.reduce((sum, k) => sum + lum(k), 0) / frag.length > 140) continue; // une étoile
    const dFrag = Math.min(...frag.map((k) => D[k]));
    if (dFrag > MAX_REACH) continue;
    // le pixel de bois le plus proche, hors du fragment et PLUS PRÈS de l'arbre
    let best = null;
    const R = Math.ceil(MAX_GAP);
    for (const a of frag) {
      const ax = a % W, ay = (a / W) | 0;
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const bx = ax + dx, by = ay + dy;
        if (bx < 0 || by < 0 || bx >= W || by >= G) continue;
        const b = by * W + bx;
        if (comp[b] < 0 || comp[b] === id || D[b] >= dFrag) continue;
        const d = Math.hypot(dx, dy);
        if (d <= MAX_GAP && (!best || d < best.d)) best = { a, b, d };
      }
    }
    if (!best) continue;
    const gap = between(best.a, best.b);
    if (!gap.length || !gap.every(isSky)) continue;
    const [r, g, b] = rgb(best.a);
    for (const k of gap) { png.data[k * 4] = r; png.data[k * 4 + 1] = g; png.data[k * 4 + 2] = b; png.data[k * 4 + 3] = 255; }
    filled += gap.length;
    joined++;
    changed = true;
  }
  if (!changed) break;
}
console.log(`${joined} fragments recollés, ${filled} px comblés`);

// planche avant / après (×4) des rameaux de droite et de gauche
const crops = [[440, 20, 220, 150], [70, 60, 200, 150]];
const K = 4, gapPx = 10;
const sheetW = crops.reduce((s, c) => s + c[2] * K + gapPx, 0);
const sheetH = Math.max(...crops.map((c) => c[3])) * K * 2 + gapPx;
const sheet = new PNG({ width: sheetW, height: sheetH });
sheet.data.fill(24);
let ox = 0;
for (const [x0, y0, w, h] of crops) {
  for (const [row, src] of [[0, before], [1, png.data]]) {
    for (let y = 0; y < h * K; y++) for (let x = 0; x < w * K; x++) {
      const i = ((y0 + Math.floor(y / K)) * W + x0 + Math.floor(x / K)) * 4;
      const j = ((row * (h * K + gapPx) + y) * sheetW + ox + x) * 4;
      for (let q = 0; q < 4; q++) sheet.data[j + q] = src[i + q];
    }
  }
  ox += w * K + gapPx;
}
fs.mkdirSync(".preview-shots", { recursive: true });
fs.writeFileSync(".preview-shots/rameaux-avant-apres.png", PNG.sync.write(sheet));
console.log("planche → .preview-shots/rameaux-avant-apres.png");
if (!DRY) { fs.writeFileSync(IMG, PNG.sync.write(png)); console.log(`→ ${IMG}`); }
