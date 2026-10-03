// buildRuinsSap.mjs — trace, une fois pour toutes, les VEINES de sève de l'Arbre
// des Ruines dans l'illustration (public/pixelart/ruins-tree/memoire.png) et
// les écrit dans src/components/views/ruinsTree/sapPaths.js.
//
// Une veine va du parent (le cœur de braise ou le nœud aîné, cf. SAP_CHAINS /
// DOGMA_PARENT dans anchors.js) jusqu'au nœud, AU PIXEL ET DANS LE BOIS :
// plus court chemin pondéré par l'épaisseur du bois (la veine suit l'axe des
// branches) ; dans le bois ÉPAIS (tronc) un bruit la fait serpenter comme une
// fissure de lave — une ligne droite s'y lirait comme un lien dessiné.
// Le jeu ne reçoit que les chemins : le halo, le corps du faisceau et les
// lumières à rallumer se déduisent de l'image au chargement (sapRenderer.js).
//
// À relancer après toute retouche d'une ancre, d'une chaîne ou de l'image :
//   node scripts/buildRuinsSap.mjs
import fs from "node:fs";
import { PNG } from "pngjs";
import { SAP_ART, lightClass, walkClass } from "../src/components/views/ruinsTree/sapMaterials.js";
import { NODE_ANCHORS, DOGMA_ANCHORS, HUB_ANCHOR, TREE_ART, sapParentMap } from "../src/components/views/ruinsTree/anchors.js";

const IMG = `public${TREE_ART.src}`;
const OUT = "src/components/views/ruinsTree/sapPaths.js";

const png = PNG.sync.read(fs.readFileSync(IMG));
const W = png.width, H = png.height;
if (W !== SAP_ART.w || H !== SAP_ART.h) throw new Error(`${IMG} : ${W}×${H} au lieu de ${SAP_ART.w}×${SAP_ART.h}`);

// ── Bois / sol / vide ───────────────────────────────────────────────────────
const walk = new Uint8Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * 4, r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
  walk[y * W + x] = walkClass(r, g, b, x, y, lightClass(r, g, b, x, y));
}

// Épaisseur locale du bois = distance (4-voisins) au pixel non-bois le plus proche.
const D = new Float32Array(W * H).fill(1e9);
const queue = new Int32Array(W * H);
let qe = 0;
for (let k = 0; k < W * H; k++) if (walk[k] !== 1) { D[k] = 0; queue[qe++] = k; }
for (let h = 0; h < qe; h++) {
  const k = queue[h], x = k % W, y = (k / W) | 0;
  for (const n of [x > 0 ? k - 1 : -1, x < W - 1 ? k + 1 : -1, y > 0 ? k - W : -1, y < H - 1 ? k + W : -1]) {
    if (n >= 0 && D[n] > D[k] + 1) { D[n] = D[k] + 1; queue[qe++] = n; }
  }
}

// Bruit de valeur (2 octaves), déterministe.
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
const vnoise = (x, y, s) => {
  const gx = Math.floor(x / s), gy = Math.floor(y / s), fx = x / s - gx, fy = y / s - gy;
  const a = hash(gx, gy), b = hash(gx + 1, gy), c = hash(gx, gy + 1), d = hash(gx + 1, gy + 1);
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
const N = new Float32Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) N[y * W + x] = 0.65 * vnoise(x, y, 7) + 0.35 * vnoise(x + 91, y + 37, 3);

const THICK_NOISE = 14;
const cost = (k) => {
  if (walk[k] === 0) return 60;                       // ciel : franchissable très cher (brindilles décousues)
  if (walk[k] === 2) return 2 + 14 * N[k] ** 2;       // terre
  return 1 + 5 / (1 + D[k]) + (D[k] > 2.5 ? THICK_NOISE * N[k] ** 2 : 0);
};

function snap(x, y) {
  let best = null, bs = -1;
  for (let r = 0; r <= 6 && !best; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const k = ny * W + nx; if (walk[k] !== 1) continue;
    const s = D[k] - Math.hypot(dx, dy) * 0.6; if (s > bs) { bs = s; best = [nx, ny]; }
  }
  return best || [x, y];
}

const STEPS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.41], [1, -1, 1.41], [-1, 1, 1.41], [-1, -1, 1.41]];
function route(a, b) {
  const [sx, sy] = snap(a[0], a[1]), [tx, ty] = snap(b[0], b[1]);
  const S = sy * W + sx, T = ty * W + tx;
  const g = new Float64Array(W * H).fill(Infinity), prev = new Int32Array(W * H).fill(-1);
  const heap = [[0, S]]; g[S] = 0;
  const push = (it) => { heap.push(it); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) {
    const [d, k] = pop(); if (d > g[k]) continue; if (k === T) break;
    const x = k % W, y = (k / W) | 0;
    for (const [dx, dy, m] of STEPS) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx; const nd = d + cost(n) * m;
      if (nd < g[n]) { g[n] = nd; prev[n] = k; push([nd, n]); }
    }
  }
  const pts = [];
  for (let k = T; k !== -1; k = prev[k]) pts.push([k % W, (k / W) | 0]);
  return pts.reverse();
}

// ── Les veines ──────────────────────────────────────────────────────────────
const pos = { hub: [HUB_ANCHOR.x, HUB_ANCHOR.y] };
for (const [id, a] of Object.entries({ ...NODE_ANCHORS, ...DOGMA_ANCHORS })) pos[id] = [a.x, a.y];
const parent = sapParentMap();
const lines = [];
let total = 0;
for (const id of Object.keys(pos)) {
  if (id === "hub") continue;
  const p = parent[id];
  if (!p || !pos[p]) throw new Error(`Pas de parent de sève pour « ${id} » (SAP_CHAINS / DOGMA_PARENT)`);
  // le ciel ne garde jamais de sève : on ne retient que le bois et la terre
  const pts = route(pos[p], pos[id]).filter(([x, y]) => walk[y * W + x] !== 0);
  total += pts.length;
  lines.push(`  ${id}: ["${p}", [${pts.flat().join(",")}]],`);
}

fs.writeFileSync(OUT, `"use strict";

// ⚠ FICHIER GÉNÉRÉ par scripts/buildRuinsSap.mjs — ne pas éditer à la main.
// Veines de sève de l'Arbre des Ruines : pour chaque nœud, [parent, [x0,y0, x1,y1, …]]
// en pixels source de ${TREE_ART.src} (${W}×${H}), du parent vers le nœud.
export const SAP_PATHS = {
${lines.join("\n")}
};
`);
console.log(`${lines.length} veines, ${total} px → ${OUT}`);
