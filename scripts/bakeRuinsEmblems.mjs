// bakeRuinsEmblems.mjs — repeint les emblèmes de l'Arbre des Ruines DANS LA
// MATIÈRE de leur branche, pour qu'ils appartiennent à l'illustration
// (public/pixelart/ruins-tree/memoire.png) au lieu d'y être collés.
//
// Pour chaque branche, une rampe de tons RELEVÉS sur l'arbre (sa matière et sa
// lumière) ; chaque pixel d'emblème prend le ton de cette rampe le plus proche
// en OKLab, la clarté passant avant la teinte (l'emblème garde son modelé, il
// change de matière). Liseré au pixel = le ton le plus sombre de la matière.
//
// Sortie : public/pixelart/ruins-tree/emblems.png — un atlas de cases de 36 px,
// une COLONNE par nœud (ordre de EMBLEM_ORDER, écrit dans emblemAtlas.js) et une
// LIGNE par état : 0 acquis, 1 à prendre (liseré d'or), 2 éteint (trop cher,
// exclu), 3 verrouillé (silhouette creusée). Les emblèmes ordinaires partent de
// leur variante @24 (affichés ×2 → grain proche de l'arbre à ×3), les couronnes
// de @32. Aperçu : `--sheet` écrit .preview-shots/emblems-sheet.png.
//
//   node scripts/bakeRuinsEmblems.mjs [--sheet]
import fs from "node:fs";
import { PNG } from "pngjs";
import oklabLib from "./lib/oklab.cjs";
import { NODE_ANCHORS, DOGMA_ANCHORS } from "../src/components/views/ruinsTree/anchors.js";

// Le jeu localise ses données au chargement : il lui faut un navigateur minimal.
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
try { Object.defineProperty(globalThis, "navigator", { value: { language: "fr-FR" }, configurable: true }); } catch { /* déjà défini */ }
const { PRESTIGE_TREE, PRESTIGE_DOGMAS } = await import("../src/game/data/upgrades.js");

const ART = "public/pixelart/ruins-tree/memoire.png";
const EMB = "public/pixelart/ui/ruins";
// Les emblèmes que le jeu ne sert plus un par un (maîtres 64 px, variantes @24, @32
// des nœuds ordinaires) sont rangés hors de public/ (audit 2026-10-05, ASSET-3) :
// l'arbre ne lit que l'atlas. Restent livrés les @32 des couronnes (registre).
const EMB_SRC = "art/emblemes-ruines";
const emblemFile = (id, size) => [EMB_SRC, EMB].map((d) => `${d}/node-${id}@${size}.png`).find((p) => fs.existsSync(p));
const OUT = "public/pixelart/ruins-tree/emblems.png";
const OUT_JS = "src/components/views/ruinsTree/emblemAtlas.js";
const CELL = 36;
const STATES = ["lit", "avail", "dim", "locked"];

// ── OKLab (scripts/lib/oklab.cjs : même calcul au bit près que l'ancienne copie) ──
const oklab = ([r, g, b]) => oklabLib.oklab(r, g, b);

// ── Palettes : une rampe par matière, en tons RELEVÉS sur l'arbre ──────────
// Un tri automatique (k-moyennes) mêlait la lave du tronc et les braises à
// toutes les branches : Sève et Cendre sortaient du même brun-orange. Les
// rampes sont donc choisies à la main parmi les tons de l'illustration (le
// script vérifie que chacun y figure) : sombre → clair, puis la lumière propre.
const art = PNG.sync.read(fs.readFileSync(ART));
const RAMPS = {
  // écorce d'argent, runes bleues
  knowledge: ["#040208", "#3b3437", "#5c5961", "#83a4c7", "#abcee2", "#3c74ca", "#51ccfb"],
  // bois brun vivant, feuillage, gouttes d'ambre
  prosperity: ["#201012", "#2f1917", "#492a24", "#58372c", "#638577", "#7c9824", "#ff980c", "#ffbc2e"],
  // bois calciné (charbon, gris de cendre), braises
  cycle_crise: ["#040208", "#140a0f", "#201012", "#3b3437", "#5c5961", "#a20e01", "#cd3d15", "#ff6a0a", "#ffbc2e"],
  // terre, pierre des cités enfouies, lave
  resilience: ["#140a0f", "#201012", "#492a24", "#661e16", "#404c55", "#5c5961", "#b98553", "#cd3d15", "#ff4c07", "#ff6a0a", "#ffbc2e"],
};
const inArt = new Set();
for (let k = 0; k < art.width * art.height; k++) inArt.add("#" + [0, 1, 2].map((q) => art.data[k * 4 + q].toString(16).padStart(2, "0")).join(""));
const PALETTES = {};
for (const [branch, hexes] of Object.entries(RAMPS)) {
  for (const hx of hexes) if (!inArt.has(hx)) throw new Error(`${hx} (${branch}) n'est pas un ton de ${ART}`);
  PALETTES[branch] = hexes
    .map((hx) => { const c = [1, 3, 5].map((o) => parseInt(hx.slice(o, o + 2), 16)); return { c, lab: oklab(c) }; })
    .sort((a, b) => a.lab[0] - b.lab[0]);
}

// ── Repeindre un emblème ────────────────────────────────────────────────────
function nearest(pal, lab, wL = 2.2) {
  let best = pal[0], bd = Infinity;
  for (const p of pal) { const d = wL * (lab[0] - p.lab[0]) ** 2 + (lab[1] - p.lab[1]) ** 2 + (lab[2] - p.lab[2]) ** 2; if (d < bd) { bd = d; best = p; } }
  return best;
}
const chroma = (p) => Math.hypot(p.lab[1], p.lab[2]);
const rimOf = (pal) => pal.find((p) => p.lab[0] > pal[1].lab[0] + 0.12 && chroma(p) < 0.06) || pal[3] || pal[2];
function repaint(src, pal, state) {
  const w = src.width, h = src.height;
  const op = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src.data[(y * w + x) * 4 + 3] > 110;
  // clarté de l'emblème ramenée à l'étendue de la palette (le modelé survit)
  let lo = 1, hi = 0;
  for (let k = 0; k < w * h; k++) if (src.data[k * 4 + 3] > 110) { const L = oklab([src.data[k * 4], src.data[k * 4 + 1], src.data[k * 4 + 2]])[0]; lo = Math.min(lo, L); hi = Math.max(hi, L); }
  const pLo = pal[1].lab[0], pHi = pal[pal.length - 1].lab[0];
  const out = new PNG({ width: w, height: h });
  const darkest = pal[0].c;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (!op(x, y)) continue;
    const lab = oklab([src.data[i], src.data[i + 1], src.data[i + 2]]);
    lab[0] = pLo + ((lab[0] - lo) / Math.max(1e-3, hi - lo)) * (pHi - pLo);
    let c;
    if (state === "locked") {
      // silhouette gravée : un ton d'ombre plein (le liseré, plus clair, est posé plus bas)
      c = pal[1].c;
    } else {
      if (state === "dim") { lab[0] -= 0.12; lab[1] *= 0.55; lab[2] *= 0.55; }
      c = nearest(pal, lab).c;
    }
    out.data.set([c[0], c[1], c[2], 255], i);
  }
  // liseré au pixel (4-voisins) : le ton le plus sombre de la matière, l'or pour
  // un nœud à prendre, et pour un bourgeon verrouillé le ton NEUTRE clair de la
  // matière (jamais sa lumière) — sans lui, la gravure disparaissait sur le bois sombre
  const ring = state === "avail" ? [244, 214, 140] : state === "locked" ? rimOf(pal).c : darkest;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (op(x, y)) continue;
    if (op(x + 1, y) || op(x - 1, y) || op(x, y + 1) || op(x, y - 1)) out.data.set([ring[0], ring[1], ring[2], 255], (y * w + x) * 4);
  }
  return out;
}

// ── Atlas ───────────────────────────────────────────────────────────────────
const BRANCH = {};
for (const n of PRESTIGE_TREE) BRANCH[n.id] = n.branch;
for (const d of PRESTIGE_DOGMAS) BRANCH[d.id] = d.branch;
const CAP = new Set(PRESTIGE_TREE.filter((n) => n.capstone).map((n) => n.id));
const ORDER = [...Object.keys(NODE_ANCHORS), ...Object.keys(DOGMA_ANCHORS)];
const atlas = new PNG({ width: ORDER.length * CELL, height: STATES.length * CELL });
ORDER.forEach((id, col) => {
  const size = CAP.has(id) ? 32 : 24;
  const src = PNG.sync.read(fs.readFileSync(emblemFile(id, size)));
  // la case fait 36 : l'emblème (24, ou 32 pour une couronne) + 1 px de liseré y tient
  const padded = new PNG({ width: size + 2, height: size + 2 });
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4, j = ((y + 1) * (size + 2) + x + 1) * 4;
    for (let q = 0; q < 4; q++) padded.data[j + q] = src.data[i + q];
  }
  STATES.forEach((state, row) => {
    const img = repaint(padded, PALETTES[BRANCH[id]], state);
    const off = Math.floor((CELL - img.width) / 2);
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
      const tx = col * CELL + off + x, ty = row * CELL + off + y;
      if (tx < col * CELL || ty < row * CELL || tx >= (col + 1) * CELL || ty >= (row + 1) * CELL) continue;
      const i = (y * img.width + x) * 4, j = (ty * atlas.width + tx) * 4;
      if (img.data[i + 3]) for (let q = 0; q < 4; q++) atlas.data[j + q] = img.data[i + q];
    }
  });
});
fs.writeFileSync(OUT, PNG.sync.write(atlas));
fs.writeFileSync(OUT_JS, `"use strict";

// ⚠ FICHIER GÉNÉRÉ par scripts/bakeRuinsEmblems.mjs — ne pas éditer à la main.
// Atlas des emblèmes de l'Arbre des Ruines repeints dans la matière de leur
// branche (${OUT.replace("public", "")}) : une colonne par nœud, une ligne par état,
// cases de ${CELL} px.
export const EMBLEM_ATLAS = {
  src: "${OUT.replace("public", "")}",
  cell: ${CELL},
  states: ${JSON.stringify(STATES)},
  order: ${JSON.stringify(ORDER)},
};
`);
console.log(`atlas ${atlas.width}×${atlas.height} → ${OUT} ; ${OUT_JS}`);
for (const [b, p] of Object.entries(PALETTES)) console.log(b.padEnd(12), p.map((x) => "#" + x.c.map((v) => v.toString(16).padStart(2, "0")).join("")).join(" "));

if (process.argv.includes("--sheet")) {
  // planche : par branche, l'original @24 puis les 4 états, ×4
  const K = 4, ids = ORDER;
  const sheet = new PNG({ width: (5 * CELL + 8) * K, height: ids.length * CELL * K });
  sheet.data.fill(0);
  for (let p = 0; p < sheet.data.length; p += 4) { sheet.data[p] = 14; sheet.data[p + 1] = 18; sheet.data[p + 2] = 36; sheet.data[p + 3] = 255; }
  ids.forEach((id, r) => {
    const size = CAP.has(id) ? 32 : 24;
    const src = PNG.sync.read(fs.readFileSync(emblemFile(id, size)));
    const blit = (img, sx, sy, sw, sh, dx, dy) => {
      for (let y = 0; y < sh * K; y++) for (let x = 0; x < sw * K; x++) {
        const i = ((sy + Math.floor(y / K)) * img.width + sx + Math.floor(x / K)) * 4;
        if (!img.data[i + 3]) continue;
        const j = ((dy + y) * sheet.width + dx + x) * 4;
        for (let q = 0; q < 3; q++) sheet.data[j + q] = img.data[i + q];
      }
    };
    blit(src, 0, 0, size, size, 4 * K, r * CELL * K + 4 * K);
    const col = ORDER.indexOf(id);
    STATES.forEach((_, s) => blit(atlas, col * CELL, s * CELL, CELL, CELL, (CELL + 8 + s * CELL) * K, r * CELL * K));
  });
  fs.mkdirSync(".preview-shots", { recursive: true });
  fs.writeFileSync(".preview-shots/emblems-sheet.png", PNG.sync.write(sheet));
  console.log("planche → .preview-shots/emblems-sheet.png");
}
