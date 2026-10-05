// ============================================================================
// sceneLive.mjs — ce qui VIT dans les scènes peintes des bâtiments-moteur.
//
//   POURQUOI. Audit du 2026-10-04 (« tous les éléments censés être animés le
//   sont ? ») : des feux et des mécanismes étaient PEINTS dans des images fixes.
//   Les feux d'abord — le fil de la flamme éternelle du culte des ancêtres dès
//   l'âge du Marbre (Vesta, mausolée, mémorial, tours cosmiques), les braises de
//   la tour de guet de pierre, les lanternes des tours de guet cosmiques ; puis
//   les mécanismes — la roue de la grue romaine des grands travaux, les charges
//   des grues cosmiques, les drones, les anneaux et les cristaux en orbite des
//   tours de la fin. Seul un halo respirait, et seulement la nuit.
//
//   CE QUE FAIT LE SCRIPT, par image, sur son canvas EXACT. Chaque cible déclare
//   des ZONES ; une zone choisit des pixels (boîte, teintes ou teinte, anneau,
//   boîtes exclues) et leur dit comment vivre :
//     · fire     : la flamme peinte est GOMMÉE (repeinte par ses voisins : le mur,
//                  le fond de la niche, le vide au-dessus) puis redessinée en
//                  langues (le dessin des braseros des places), colorée sur
//                  public/pixelart/fire-ramp.json par profondeur ;
//     · EN PLACE (le dessin reste, seule sa lumière vit) :
//         monte    une crête claire qui MONTE dans une flamme stylisée ;
//         braise   des charbons qui s'avivent au hasard, jamais tous ensemble ;
//         lanterne un souffle lent dans le verre ;
//         reflet   un frisson dans un reflet ;
//         orbite   un éclat qui fait le TOUR d'un anneau (autour de `center`) :
//                  l'anneau tourne sans qu'un pixel bouge ;
//         roue     le même, au pas des rayons (`spokes`) : la roue tourne ;
//     · QUI BOUGE (la pièce est gommée du fond, puis reposée décalée) :
//         flotte   un drone, un cristal : il monte et descend (amp, ph) ;
//         treuil   une charge pendue : elle se hisse (dy = [min, max]) et son
//                  câble (`rope` = [x0, x1, yHaut, yBas]) s'allonge ou se replie ;
//                  `ropeBelow` : le câble pend SOUS la pièce (un drone qui porte).
//     · fumee    : le panache PEINT est gommé (vide : il est dans le ciel) ; des
//                  bouffées en pixels montent de la bouche (`from`), dérivent
//                  (`rise`, `drift`), grossissent (`r`) et s'effilochent en
//                  tramé — dans les teintes du panache d'origine ;
//     · filet    : un filet d'eau le long d'un chemin de pixels (`path`) : en
//                  continu, des éclats clairs y descendent ; en `goutte`, une
//                  goutte tombe (`cols` = [clair, moyen]).
//   Sortie « place » (`plaza: true`, mobilier des places : public/pixelart/iso/plaza) :
//   au format des fontaines — anim/<clé>.png = N images PLEINES (le jeu les pose À
//   LA PLACE du statique, isoPlaza.propAnim) et anim/zone/<clé>.png = ce qui bouge
//   (lu par la garde isoPlaza.test.js) ; le statique n'est pas touché.
//   Sortie : <clé>-live.png, bande HORIZONTALE de N images au canvas de l'image,
//   qui ne porte QUE ce qui bouge (transparent ailleurs), et <clé>-back.png quand
//   une pièce a été gommée. L'image d'origine n'est pas touchée : elle reste le
//   repli tant que les couches ne sont pas chargées (cityEngineSprites.LIVE_LAYERS,
//   tenu à la main : n, ms et fond y sont reportés — garde sceneLive.test.js).
//   Source lue dans git à SOURCE_REV : relancer ne repart jamais de sa sortie (sauf
//   `fromDisk`, une image plus jeune — elle n'est jamais réécrite par ce script).
//
//   Lancer :  node scripts/sceneLive.mjs [--dry] [--cle cult-vesta] [--masques]
//   Planche : .preview-shots/scenes-vivantes.png (origine | fond | images, ×4) ;
//   --masques : les pixels de chaque zone en magenta sur l'origine (2e colonne).
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { PNG } from 'pngjs';

const SOURCE_REV = 'af920cd1';
const DIR = 'public/pixelart/agents/buildings';
const SHEET = '.preview-shots/scenes-vivantes.png';
const DRY = process.argv.includes('--dry');
const MASKS = process.argv.includes('--masques');
const ONLY = (() => { const i = process.argv.indexOf('--cle'); return i > 0 ? process.argv[i + 1].split(',') : null; })();

const RAMP_HEX = JSON.parse(fs.readFileSync('public/pixelart/fire-ramp.json', 'utf8')).steps.map((s) => s.hex.toLowerCase());
const hexRgb = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const RAMP = RAMP_HEX.map(hexRgb);
// 0 braise-éteinte · 1 braise · 2 rouge-profond · 3 rouge-feu · 4 vermillon ·
// 5 orange-ardent · 6 or-de-cœur · 7 cœur-blanc
const GOLD = { hue: [28, 54], minS: 0.4, minV: 0.4 };
// Les flammes peintes des torches du chapiteau (plaisirs-feu) : orange, or, cœur pâle, pointe.
const TORCH = ['#f16522', '#f5b949', '#f1d8a2', '#803725'];

// ── Les cibles ──────────────────────────────────────────────────────────────
// box = [x0, y0, x1, y1] INCLUSIF en px de l'image ; colors = teintes exactes, ou
// hue = [min, max] (+ minS, minV), ou rien (tout ce qui est opaque) ; exclude =
// boîtes retirées ; annulus = [cx, cy, rx, ry, tol] (pixels près de l'ellipse) ;
// disk = [cx, cy, rx, ry, rmax] (pixels DANS l'ellipse, une roue).
// fire : hK/wK = la flamme redessinée par rapport à la zone gommée. n images × ms.
const TARGETS = {
  // ── FEUX ──
  // Âge du Marbre : le feu sacré, dans l'embrasure de la porte du temple rond.
  'cult-vesta': { n: 8, ms: 120, zones: [{ kind: 'fire', box: [66, 42, 72, 52], colors: RAMP_HEX }] },
  // Stade 2 : la torche sur son trépied, devant le mausolée (le « -grand » n'en a pas).
  'cult-mausoleum': { n: 8, ms: 120, zones: [{ kind: 'fire', box: [12, 44, 18, 52], colors: ['#fadc22', '#da8142', '#c04c21'], hK: 0.75, wK: 0.8 }] },
  // Stade 3 : la flamme éternelle dans sa niche, et son reflet dans le bassin.
  'cult-memorial': {
    n: 8, ms: 120, zones: [
      { kind: 'fire', box: [62, 35, 67, 39], colors: ['#a07f5b', '#af7e4a', '#ddb36c'] },
      { kind: 'reflet', box: [55, 50, 66, 58], colors: ['#af7e4a', '#ddb36c'] },
    ],
  },
  'cult-memorial-grand': {
    n: 8, ms: 120, zones: [
      { kind: 'fire', box: [100, 63, 108, 72], colors: ['#8e7057', '#e6ba6a', '#fafbf8', '#f3f3eb'] },
      { kind: 'reflet', box: [88, 98, 99, 110], colors: ['#8e7057', '#e6ba6a'] },
    ],
  },
  // Tours cosmiques du culte : flamme-esprit verte (7), flamme d'or (8).
  'cosmic-ancestral_cult-7': { n: 12, ms: 120, zones: [{ kind: 'monte', box: [58, 119, 72, 151], colors: ['#aae5ba', '#6ad1a1', '#5bab98', '#42958a', '#f9f8f2', '#87aca7'] }] },
  'cosmic-ancestral_cult-8': { n: 12, ms: 120, zones: [{ kind: 'monte', box: [56, 140, 70, 158], colors: ['#ecdbab', '#f3efe3', '#e6ddc6', '#fbdc71', '#fad251', '#e6c053', '#e0b03b'] }] },
  // Tour de guet de pierre : le lit de braises entre les créneaux.
  'watch-stone': { n: 8, ms: 120, zones: [{ kind: 'braise', box: [38, 25, 60, 31], colors: ['#a72e37', '#ac6953', '#7b5d3d', '#573234'] }] },
  // Tours de guet cosmiques : la lumière dans le verre de la lanterne ; au 8,
  // l'anneau et ses nacelles tournent autour d'elle.
  'cosmic-watch-7': { n: 12, ms: 120, zones: [{ kind: 'lanterne', box: [56, 76, 72, 87], hue: [118, 175], minS: 0.1, minV: 0.5 }] },
  'cosmic-watch-8': {
    n: 24, ms: 120, zones: [
      { kind: 'lanterne', box: [53, 58, 71, 92], hue: [30, 62], minS: 0.25, minV: 0.86 },
      { kind: 'orbite', box: [28, 84, 100, 114], exclude: [[52, 56, 74, 104]], annulus: [63.5, 99, 32, 11, 0.32], center: [63.5, 99] },
    ],
  },
  // ── MÉCANISMES ──
  // Âge du Marbre : la grue à roue des grands travaux — la roue tourne (8 rayons).
  // Exclus : le mât en A et la pierre pendue, devant la roue.
  'works-classical': {
    n: 16, ms: 140, zones: [{ kind: 'roue', box: [29, 13, 64, 42], disk: [46.5, 27.5, 16, 12.5, 1.08], exclude: [[42, 0, 52, 47], [41, 33, 57, 44], [28, 36, 41, 50]], center: [46.5, 27.5], radii: [16, 12.5], spokes: 8 }],
  },
  'works-classical-grand': {
    n: 16, ms: 140, zones: [{ kind: 'roue', box: [39, 23, 102, 77], disk: [70.5, 50, 29.5, 25, 1.08], exclude: [[60, 0, 80, 90], [60, 57, 87, 80], [40, 66, 62, 90]], center: [70.5, 50], radii: [29.5, 25], spokes: 8 }],
  },
  // Grues cosmiques des grands travaux : la charge se hisse, son câble se replie ;
  // les drones flottent.
  'cosmic-public_works-7': {
    n: 16, ms: 160, zones: [
      { kind: 'flotte', box: [31, 96, 39, 108], amp: 1.2, ph: 0 },
      { kind: 'treuil', box: [39, 89, 64, 120], rope: [49, 53, 77, 88], dy: [-3, 0] },
    ],
  },
  'cosmic-public_works-8': {
    n: 16, ms: 160, zones: [
      { kind: 'flotte', box: [56, 101, 70, 114], exclude: [[56, 109, 59, 131]], amp: 1.2, ph: 0 },
      { kind: 'flotte', box: [13, 138, 32, 152], amp: 1.2, ph: 2.1 },
      { kind: 'treuil', box: [39, 97, 60, 131], rope: [47, 51, 87, 96], dy: [-3, 0] },
    ],
  },
  'cosmic-public_works-9': {
    n: 16, ms: 160, zones: [
      { kind: 'treuil', box: [26, 74, 48, 87], rope: [34, 41, 88, 99], dy: [-1, 1], ropeBelow: true },
      { kind: 'treuil', box: [66, 61, 89, 76], rope: [74, 81, 77, 89], dy: [-1, 1], ropeBelow: true, ph: 2 },
      { kind: 'treuil', box: [82, 94, 104, 108], rope: [90, 95, 109, 112], dy: [-1, 1], ropeBelow: true, ph: 4 },
    ],
  },
  // Anneaux d'or de la fin : un éclat en fait le tour.
  'mint-cosmic-8': { n: 24, ms: 120, zones: [{ kind: 'orbite', box: [18, 86, 110, 153], ...GOLD, exclude: [[45, 80, 85, 160]], center: [65, 120] }] },
  'granary-cosmic-8': { n: 24, ms: 120, zones: [{ kind: 'orbite', box: [30, 84, 102, 118], ...GOLD, annulus: [66, 101, 31, 13, 0.3], exclude: [[50, 70, 82, 118]], center: [66, 101] }] },
  'cosmic-observatories-8': { n: 24, ms: 120, zones: [{ kind: 'orbite', box: [5, 128, 90, 162], ...GOLD, annulus: [47, 145, 37, 11, 0.3], exclude: [[80, 110, 127, 165]], center: [47, 145] }] },
  // Âges cosmiques, bande 9 : l'anneau blanc tourne, les cristaux flottent.
  'mint-cosmic-9': {
    n: 24, ms: 120, zones: [
      { kind: 'flotte', box: [20, 98, 33, 128], amp: 1.2, ph: 0 },
      { kind: 'flotte', box: [92, 97, 105, 125], amp: 1.2, ph: 2.1 },
      { kind: 'flotte', box: [96, 124, 110, 153], amp: 1.2, ph: 4.2 },
      { kind: 'orbite', box: [28, 114, 98, 148], annulus: [62.5, 131, 31.5, 13, 0.3], exclude: [[47, 95, 82, 139]], center: [62.5, 131] },
    ],
  },
  'cosmic-watch-9': {
    n: 24, ms: 120, zones: [
      { kind: 'flotte', box: [48, 60, 54, 70], amp: 1, ph: 0 },
      { kind: 'flotte', box: [78, 62, 85, 73], amp: 1, ph: 1.05 },
      { kind: 'flotte', box: [37, 70, 44, 81], amp: 1, ph: 2.1 },
      { kind: 'flotte', box: [84, 74, 91, 84], amp: 1, ph: 3.15 },
      { kind: 'flotte', box: [40, 81, 48, 93], amp: 1, ph: 4.2 },
      { kind: 'flotte', box: [77, 85, 84, 96], amp: 1, ph: 5.25 },
      { kind: 'orbite', box: [44, 69, 82, 86], annulus: [63, 77.5, 17, 6.5, 0.35], exclude: [[56, 50, 72, 100]], center: [63, 77.5] },
    ],
  },
  'cosmic-observatories-9': { n: 24, ms: 120, zones: [{ kind: 'orbite', box: [0, 75, 127, 140], annulus: [63.5, 110, 52, 28, 0.28], exclude: [[30, 97, 98, 150]], center: [63.5, 110] }] },
  // ── FUMÉE DE L'HÔTEL DES MONNAIES (stade 1 : la maison du monnayeur ; âge du
  //    Marbre : la Moneta) : le panache peint devient des bouffées qui montent. ──
  'mint-prop-house': { n: 20, ms: 150, zones: [{ kind: 'fumee', box: [29, 0, 50, 11], from: [34, 12], rise: 11, drift: 6, r: [1.3, 3.6] }] },
  'mint-prop-house-grand': { n: 20, ms: 150, zones: [{ kind: 'fumee', box: [58, 0, 92, 19], from: [66, 20], rise: 17, drift: 10, r: [2, 5.8] }] },
  'mint-moneta': { n: 20, ms: 150, zones: [{ kind: 'fumee', box: [70, 3, 97, 20], minV: 0.55, maxS: 0.3, from: [79, 21], rise: 17, drift: 10, r: [2, 6.2] }] },
  'mint-moneta-grand': { n: 20, ms: 150, zones: [{ kind: 'fumee', box: [115, 3, 160, 34], exclude: [[105, 28, 136, 60]], minV: 0.55, maxS: 0.3, from: [125, 28], rise: 24, drift: 16, r: [2.5, 9] }] },
  // ── PUITS ET POINTS D'EAU (mobilier des places, `well`) : l'eau vit. Le puits
  //    profond (médiéval, primitif) reste immobile : on n'y voit pas l'eau. ──
  'well-antique': {
    plaza: true, n: 8, ms: 140, zones: [
      { kind: 'filet', path: [[22, 11], [22, 12], [22, 13], [22, 14]], cols: ['#d9f0f7', '#8fc3d6'] },
      { kind: 'reflet', box: [9, 13, 27, 22], hue: [175, 215], minS: 0.12, minV: 0.3 },
    ],
  },
  'well-industrial': {
    plaza: true, n: 8, ms: 140, zones: [
      { kind: 'filet', mode: 'goutte', path: [[16, 20], [16, 21], [16, 22], [16, 23], [16, 24], [16, 25], [16, 26], [16, 27], [16, 28]], cols: ['#d9f0f7', '#8fc3d6'] },
    ],
  },
  'well-modern': {
    plaza: true, n: 8, ms: 140, zones: [
      { kind: 'filet', path: [[24, 8], [23, 7], [22, 7], [21, 8], [20, 9], [20, 10], [19, 11]], cols: ['#e6f8ff', '#9fd6ea'] },
      { kind: 'reflet', box: [14, 10, 30, 19], hue: [170, 215], minS: 0.2, minV: 0.3 },
    ],
  },
  'well-cosmic': {
    plaza: true, n: 8, ms: 140, zones: [
      { kind: 'reflet', box: [9, 30, 24, 39], hue: [170, 215], minS: 0.2, minV: 0.3, ph: 0.9 },
      { kind: 'lanterne', box: [22, 20, 25, 26], hue: [170, 200], minS: 0.2, minV: 0.6, ph: 1.6 },
    ],
  },
  // La grande fontaine de la place civique moderne, RÉGÉNÉRÉE le 2026-10-04 (Raph :
  // « pas dans l'angle qu'il faut ») : un vrai losange iso 2:1, re-pixelisé et recoloré. `fromDisk` : l'image
  // est plus jeune que SOURCE_REV. Un reflet monte les jets, l'eau du bassin frissonne.
  'fountain-forum-modern': {
    plaza: true, fromDisk: true, n: 8, ms: 240, zones: [
      // Re-pixelisée à 56 px et recolorée (« elle dénote beaucoup trop ») : jets et eau
      // sur la même gamme ; une crête claire y monte. La sphère est exclue.
      { kind: 'monte', box: [5, 15, 51, 36], exclude: [[24, 19, 33, 28]], colors: ['#376472', '#4d778b', '#6291b3', '#729fc5', '#8db6d7', '#adcce5', '#d4e6f2'] },
    ],
  },
  // ── MAISON DES PLAISIRS (habillages PixelLab, public/pixelart/places/ ; posés par
  //    plaisirsSkin.js dans le repère du lieu) ──
  // Âge du feu : les trois torches du chapiteau et le feu de camp devant l'entrée.
  'plaisirs-feu': {
    dir: 'public/pixelart/places', n: 8, ms: 120, zones: [
      { kind: 'fire', box: [85, 5, 92, 13], colors: TORCH },
      { kind: 'fire', box: [128, 37, 137, 47], colors: TORCH },
      { kind: 'fire', box: [111, 64, 118, 74], colors: TORCH },
      { kind: 'fire', box: [95, 75, 101, 82], colors: [...TORCH, '#f0e4d1'] },
    ],
  },
  // La Fonte : le ballon captif au sommet de la flèche monte et redescend, son
  // amarre (le haut de la flèche) s'allonge sous la nacelle.
  'plaisirs-fonte': {
    dir: 'public/pixelart/places', n: 16, ms: 200, zones: [
      { kind: 'treuil', box: [92, 0, 128, 45], rope: [108, 112, 46, 51], dy: [-2, 0], ropeBelow: true },
    ],
  },
};

function hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, mx ? d / mx : 0, mx / 255];
}
const keyOf = (d, i) => '#' + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
const lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
// Hash déterministe (aucun Math.random : relancer rend les mêmes PNG).
const hash = (a, b, c) => {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const inBox = (x, y, b) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];

function selectZone(src, z, claimed) {
  const { width: W, height: H, data } = src;
  const set = z.colors ? new Set(z.colors.map((c) => c.toLowerCase())) : null;
  const out = [];
  const [x0, y0, x1, y1] = z.box;
  for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y += 1) {
    for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x += 1) {
      const p = y * W + x, i = p * 4;
      if (data[i + 3] < 128 || claimed.has(p)) continue;
      if (z.exclude && z.exclude.some((b) => inBox(x, y, b))) continue;
      if (z.annulus) {
        const [cx, cy, rx, ry, tol] = z.annulus;
        const r = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry);
        if (Math.abs(r - 1) > tol) continue;
      }
      if (z.disk) {
        const [cx, cy, rx, ry, rmax] = z.disk;
        if (Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry) > rmax) continue;
      }
      if (set) { if (!set.has(keyOf(data, i))) continue; } else if (z.hue) {
        const [h, s, v] = hsv(data[i], data[i + 1], data[i + 2]);
        if (!(h >= z.hue[0] && h <= z.hue[1] && s >= (z.minS || 0) && v >= (z.minV || 0))) continue;
      } else if (z.minV != null || z.maxS != null) {
        const [, s, v] = hsv(data[i], data[i + 1], data[i + 2]);
        if (v < (z.minV || 0) || s > (z.maxS ?? 1)) continue;
      }
      out.push(p);
    }
  }
  for (const p of out) claimed.add(p);
  return out;
}

// GOMME : chaque pixel du masque prend la teinte de ses voisins connus, couche
// par couche depuis le bord (pelure d'oignon). Majorité de vide autour → vide
// (une pointe de flamme, une nacelle sur le ciel) ; sinon la teinte opaque la plus
// fréquente (le mur, le fond sombre de l'embrasure).
function erase(buf, W, H, mask) {
  const todo = new Set(mask);
  let guard = 0;
  while (todo.size && guard++ < 64) {
    const next = [];
    for (const p of todo) {
      const x = p % W, y = (p - x) / W;
      let empty = 0; const cols = new Map();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) { empty += 1; continue; }
        const q = ny * W + nx;
        if (todo.has(q)) continue;
        const i = q * 4;
        if (buf[i + 3] < 128) { empty += 1; continue; }
        const k = keyOf(buf, i);
        cols.set(k, (cols.get(k) || 0) + 1);
      }
      const known = empty + [...cols.values()].reduce((a, b) => a + b, 0);
      if (!known) continue;
      let best = null, bn = 0;
      for (const [k, n] of cols) if (n > bn) { bn = n; best = k; }
      next.push([p, empty > bn ? null : best]);
    }
    if (!next.length) break;
    for (const [p, k] of next) {
      const i = p * 4;
      if (k == null) { buf[i + 3] = 0; } else { const c = hexRgb(k); buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255; }
      todo.delete(p);
    }
  }
}

// Flamme de langues (cf. plazaBrazierAnim.mjs), à l'échelle de la flamme gommée.
function tongueFlame(W, H, geo, u) {
  const { cx, base, h, w } = geo;
  const tongues = h >= 7
    ? [{ dx: 0, h, w: w * 0.85, ph: 0 }, { dx: -w * 0.65, h: h * 0.6, w: w * 0.55, ph: 2.2 }, { dx: w * 0.65, h: h * 0.68, w: w * 0.55, ph: 4.1 }]
    : [{ dx: 0, h, w: w * 0.9, ph: 0 }, { dx: (w > 1.6 ? 0.6 : 0.3) * w, h: h * 0.62, w: w * 0.5, ph: 3.1 }];
  const m = new Uint8Array(W * H);
  const th = u * Math.PI * 2;
  for (const t of tongues) {
    const hh = t.h * (1 + 0.17 * Math.sin(th + t.ph) + 0.07 * Math.sin(2 * th + 1.7 * t.ph));
    const sway = Math.max(0.6, h * 0.12) * Math.sin(th + t.ph + 1.3);
    for (let y = Math.max(0, Math.floor(base - hh - 1)); y <= base; y += 1) {
      const k = (base - y) / hh;
      if (k < 0 || k > 1) continue;
      const xc = cx + t.dx + sway * k * k;
      const hw = t.w * Math.pow(1 - k, 0.75) + 0.2;
      for (let x = Math.max(0, Math.floor(xc - hw - 1)); x <= Math.min(W - 1, Math.ceil(xc + hw + 1)); x += 1) {
        if (Math.abs(x + 0.5 - xc) <= hw) m[y * W + x] = 1;
      }
    }
  }
  // Profondeur 4-voisins ; le pied sort du foyer, le voisin du dessous n'est jamais dehors.
  const d = new Uint8Array(W * H);
  for (let i = 0; i < m.length; i += 1) d[i] = m[i];
  for (let pass = 1; pass < 4; pass += 1) {
    const prev = d.slice();
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
      const i = y * W + x;
      if (prev[i] < pass) continue;
      const at = (xx, yy) => (yy > base ? pass : (xx < 0 || xx >= W || yy < 0) ? 0 : prev[yy * W + xx]);
      if (at(x - 1, y) >= pass && at(x + 1, y) >= pass && at(x, y - 1) >= pass && at(x, y + 1) >= pass) d[i] = pass + 1;
    }
  }
  let top = base;
  for (let i = 0; i < m.length; i += 1) if (m[i]) { top = Math.min(top, Math.floor(i / W)); }
  const span = Math.max(1, base - top);
  const px = [];
  for (let i = 0; i < m.length; i += 1) {
    if (!m[i]) continue;
    const y = Math.floor(i / W), x = i - y * W, k = (base - y) / span, dep = d[i];
    const core = Math.abs(x + 0.5 - cx) <= Math.max(0.6, w * 0.35);
    const c = dep <= 1 ? (k > 0.62 ? 2 : k > 0.3 ? 3 : 4) : dep === 2 ? (k > 0.55 ? 4 : 5) : dep === 3 ? (k > 0.4 ? 5 : 6) : (k > 0.3 ? 6 : core ? 7 : 6);
    // Petite flamme (≤ 2 px de demi-largeur) : son cœur n'atteint jamais la
    // profondeur 3 — on l'éclaire dans l'axe, sinon elle brûlerait toute rouge.
    const lit = w <= 2 && core && k < 0.55 ? Math.max(c, k < 0.25 ? 6 : 5) : c;
    px.push([i, RAMP[lit]]);
  }
  return px;
}

// Pixels EN PLACE : nouveau ton par image.
//   monte/lanterne/reflet/braise : un autre ton de la GAMME de la zone (ses
//   teintes triées par clarté) ;
//   orbite/roue : la même teinte, éclaircie ou assombrie d'un ou deux crans (une
//   gamme mêlée — or et nacelles blanches — ne se décale pas par rangs).
const shade = (c, k) => (k >= 0 ? c.map((v) => Math.round(v + (255 - v) * k)) : c.map((v) => Math.round(v * (1 + k))));
function inPlacePixels(src, z, idx, f, n) {
  const { width: W, data } = src;
  const th = (f / n) * Math.PI * 2 + (z.ph || 0);
  const out = [];
  const rgbAt = (p) => [data[p * 4], data[p * 4 + 1], data[p * 4 + 2]];
  if (z.kind === 'orbite' || z.kind === 'roue') {
    const [cx, cy] = z.center, [rx, ry] = z.radii || [1, 1];
    const STEP = [-0.22, 0, 0.22, 0.42];
    for (const p of idx) {
      const x = p % W, y = (p - x) / W;
      const phi = Math.atan2((y + 0.5 - cy) / ry, (x + 0.5 - cx) / rx);
      const s = z.kind === 'roue'
        ? Math.round(1.1 * Math.cos(z.spokes * phi - th))               // au pas des rayons
        : Math.round(0.6 + 1.5 * Math.cos(phi - th));                    // un éclat qui tourne
      out.push([p, shade(rgbAt(p), STEP[Math.max(0, Math.min(3, s + 1))])]);
    }
    return out;
  }
  const cols = [...new Set(idx.map((p) => keyOf(data, p * 4)))].map(hexRgb).sort((a, b) => lum(a) - lum(b));
  const rank = (c) => cols.findIndex((q) => q[0] === c[0] && q[1] === c[1] && q[2] === c[2]);
  if (z.kind === 'braise') {
    // La gamme d'origine prolongée par le rouge feu : un charbon s'avive puis retombe.
    const E = [...cols, RAMP[2], RAMP[3], RAMP[4]];
    for (const p of idx) {
      const x = p % W, y = (p - x) / W;
      const hh = hash(x, y, f), lift = hh < 0.18 ? 3 : hh < 0.4 ? 2 : hh < 0.62 ? 1 : 0;
      out.push([p, E[Math.min(E.length - 1, rank(rgbAt(p)) + lift)]]);
    }
    return out;
  }
  for (const p of idx) {
    const x = p % W, y = (p - x) / W;
    let s;
    if (z.kind === 'monte') s = Math.round(1.25 * Math.sin(th + y * 0.55 + x * 0.12));          // la crête monte
    else if (z.kind === 'lanterne') s = Math.round(1.3 * Math.sin(th) + (hash(x, y, f) < 0.15 ? 1 : 0));
    else s = Math.round(1.1 * Math.sin(th * 2 + x * 0.9 + y * 1.7));                             // reflet qui frissonne
    // Gamme trop courte (une eau d'une ou deux teintes) : le rang ne bouge rien, on
    // éclaircit ou on assombrit la teinte elle-même.
    out.push([p, cols.length < 3 ? shade(rgbAt(p), s > 0 ? 0.24 * s : 0.18 * s) : cols[Math.max(0, Math.min(cols.length - 1, rank(rgbAt(p)) + s))]]);
  }
  return out;
}

// Pièce qui BOUGE : ses pixels décalés de (0, d) ; le câble d'un treuil est
// redessiné, colonne par colonne, à sa nouvelle longueur, dans la teinte qu'il
// portait (la plus fréquente de la colonne).
function movedPixels(src, z, idx, ropeIdx, f, n) {
  const { width: W, height: H, data } = src;
  const th = (f / n) * Math.PI * 2 + (z.ph || 0);
  const d = z.kind === 'treuil'
    ? Math.round(z.dy[0] + (z.dy[1] - z.dy[0]) * (0.5 - 0.5 * Math.cos(th)))
    : Math.round((z.amp || 1) * Math.sin(th));
  const out = [];
  for (const p of idx) {
    const x = p % W, y = (p - x) / W, ny = y + d;
    if (ny < 0 || ny >= H) continue;
    out.push([ny * W + x, [data[p * 4], data[p * 4 + 1], data[p * 4 + 2]]]);
  }
  if (z.kind === 'treuil' && z.rope) {
    const [rx0, rx1, yTop, yBot] = z.rope;
    for (let x = rx0; x <= rx1; x += 1) {
      const counts = new Map();
      for (const p of ropeIdx) if (p % W === x) { const k = keyOf(data, p * 4); counts.set(k, (counts.get(k) || 0) + 1); }
      if (!counts.size) continue;
      const col = hexRgb([...counts].sort((a, b) => b[1] - a[1])[0][0]);
      // Câble AU-DESSUS (charge pendue) : du point d'attache à la charge déplacée.
      // Câble EN DESSOUS (drone porteur) : du drone déplacé à la charge immobile.
      const a = z.ropeBelow ? yTop + d : yTop, b = z.ropeBelow ? yBot : yBot + d;
      for (let y = Math.max(0, a); y <= Math.min(H - 1, b); y += 1) out.push([y * W + x, col]);
    }
  }
  return out;
}

// BOUFFÉES DE FUMÉE : k bouffées décalées d'un k-ième de cycle, la plus ancienne
// (la plus haute) d'abord, la plus jeune par-dessus. Elle monte vite puis ralentit
// pendant que le vent l'emporte (la volute du panache peint), grossit, et SE DÉFAIT
// passé 55 % de sa montée par une trame ordonnée 4×4 ACCROCHÉE à la bouffée (elle se
// dissout sans scintiller). Claire en haut à gauche, un cran plus sombre en bas à
// droite : la lumière de la carte.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function smokePixels(W, H, z, cols, f, n) {
  const out = [];
  const k = z.puffs || 5, [ex, ey] = z.from;
  const light = cols[cols.length - 1], mid = cols[Math.floor(cols.length * 0.6)], dark = cols[Math.floor(cols.length * 0.25)];
  const ts = [];
  for (let j = 0; j < k; j += 1) ts.push([((f / n) + j / k) % 1, j]);
  ts.sort((a, b) => b[0] - a[0]);
  for (const [t, j] of ts) {
    const cx = ex + z.drift * t * t + 0.5 * Math.sin((t * 1.5 + j * 0.7) * Math.PI);
    const cy = ey - z.rise * (1 - (1 - t) * (1 - t));
    const r = z.r[0] + (z.r[1] - z.r[0]) * Math.sqrt(t);
    const a = t < 0.55 ? 1 : Math.max(0, 1 - (t - 0.55) / 0.45);
    const rcx = Math.round(cx), rcy = Math.round(cy);
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y += 1) {
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x += 1) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        if (Math.hypot(dx, dy) > r) continue;
        if (BAYER[(((y - rcy) & 3) << 2) | ((x - rcx) & 3)] / 16 >= a) continue;
        out.push([y * W + x, dx + dy < -r * 0.3 ? light : dx + dy > r * 0.5 ? dark : mid]);
      }
    }
  }
  return out;
}
// FILET D'EAU le long de `path` : en continu, la teinte moyenne partout et des
// éclats clairs qui descendent (un pixel sur trois) ; en goutte, une seule goutte
// (tête claire, traîne moyenne) qui parcourt le chemin en un cycle.
function streamPixels(W, z, f, n) {
  const out = [];
  const [cl, cm] = z.cols.map(hexRgb), P = z.path, L = P.length;
  if (z.mode === 'goutte') {
    const i = Math.floor((f / n) * L);                 // une goutte sur le chemin à chaque image
    for (const [q, c] of [[i, cl], [i - 1, cm]]) if (q >= 0 && q < L) out.push([P[q][1] * W + P[q][0], c]);
    return out;
  }
  for (let i = 0; i < L; i += 1) out.push([P[i][1] * W + P[i][0], (((i - f) % 3) + 3) % 3 === 0 ? cl : cm]);
  return out;
}

// ── Production ──────────────────────────────────────────────────────────────
const sheetRows = [];
let maxW = 0;
for (const [cle, T] of Object.entries(TARGETS)) {
  if (ONLY && !ONLY.includes(cle)) continue;
  const dir = T.plaza ? 'public/pixelart/iso/plaza' : (T.dir || DIR);
  const file = `${dir}/${cle}.png`;
  const src = T.fromDisk ? PNG.sync.read(fs.readFileSync(file)) : PNG.sync.read(execSync(`git show ${SOURCE_REV}:${file}`, { maxBuffer: 1 << 26 }));
  const { width: W, height: H } = src;
  maxW = Math.max(maxW, W);
  const back = Buffer.from(src.data);
  const claimed = new Set();
  let erased = 0;
  // Les pièces qui bougent réclament leurs pixels d'abord (un drone collé à une
  // charge reste au drone), puis les feux, puis ce qui vit en place.
  const order = { flotte: 0, treuil: 1, fire: 2 };
  const zones = T.zones.map((z, i) => ({ z, i })).sort((a, b) => (order[a.z.kind] ?? 3) - (order[b.z.kind] ?? 3));
  const live = [];
  for (const { z } of zones) {
    const idx = z.kind === 'filet' ? [] : selectZone(src, z, claimed);
    if (z.kind === 'filet') { live.push({ z, idx: z.path.map(([x, y]) => y * W + x) }); continue; }
    if (!idx.length) throw new Error(`${cle} : zone ${z.kind} vide ${z.box}`);
    const e = { z, idx };
    if (z.kind === 'fire') {
      let x0 = W, x1 = -1, y0 = H, y1 = -1;
      for (const p of idx) { const x = p % W, y = (p - x) / W; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      e.geo = { cx: (x0 + x1 + 1) / 2, base: y1, h: (y1 - y0 + 1.2) * (z.hK || 1), w: Math.max(1, ((x1 - x0 + 1) / 2) * (z.wK || 1)) };
      erase(back, W, H, idx); erased += idx.length;
    } else if (z.kind === 'fumee') {
      e.cols = [...new Set(idx.map((p) => keyOf(src.data, p * 4)))].map(hexRgb).sort((a, b) => lum(a) - lum(b));
      for (const p of idx) back[p * 4 + 3] = 0;
      erased += idx.length;
    } else if (z.kind === 'flotte' || z.kind === 'treuil') {
      e.rope = z.rope ? selectZone(src, { box: [z.rope[0], z.rope[2], z.rope[1], z.rope[3]] }, claimed) : [];
      // Une pièce qui bouge pend dans le CIEL : sa place devient du vide (la gomme
      // par voisins y faisait remonter la teinte du toit d'en dessous).
      for (const p of [...idx, ...e.rope]) back[p * 4 + 3] = 0;
      erased += idx.length + e.rope.length;
    }
    live.push(e);
  }
  const strip = new PNG({ width: W * T.n, height: H });
  const frames = [];
  for (let f = 0; f < T.n; f += 1) {
    const fr = Buffer.alloc(W * H * 4);
    const put = ([p, c]) => { fr[p * 4] = c[0]; fr[p * 4 + 1] = c[1]; fr[p * 4 + 2] = c[2]; fr[p * 4 + 3] = 255; };
    for (const e of live) {
      if (e.z.kind === 'fire') tongueFlame(W, H, e.geo, f / T.n).forEach(put);
      else if (e.z.kind === 'fumee') smokePixels(W, H, e.z, e.cols, f, T.n).forEach(put);
      else if (e.z.kind === 'filet') streamPixels(W, e.z, f, T.n).forEach(put);
      else if (e.z.kind === 'flotte' || e.z.kind === 'treuil') movedPixels(src, e.z, e.idx, e.rope, f, T.n).forEach(put);
      else inPlacePixels(src, e.z, e.idx, f, T.n).forEach(put);
    }
    frames.push(fr);
    for (let y = 0; y < H; y += 1) fr.copy(strip.data, (y * W * T.n + f * W) * 4, y * W * 4, (y + 1) * W * 4);
  }
  console.log(`${cle} (${W}×${H}) : ${T.n} × ${T.ms} ms — ${live.map((e) => `${e.z.kind} ${e.idx.length}`).join(', ')}${erased ? ` ; gommé ${erased} px` : ''}`);
  // Planche : origine (ou masques), fond, puis fond + image (ce que le jeu compose).
  const comp = frames.map((fr) => { const c = Buffer.from(back); for (let i = 0; i < fr.length; i += 4) if (fr[i + 3]) fr.copy(c, i, i, i + 4); return c; });
  let first = src.data;
  if (MASKS) { first = Buffer.from(src.data); for (const e of live) for (const p of e.idx) { first[p * 4] = 255; first[p * 4 + 1] = 0; first[p * 4 + 2] = 255; } }
  sheetRows.push({ W, H, imgs: [first, back, ...comp.slice(0, 6)] });
  if (MASKS) { const m = new PNG({ width: W, height: H }); first.copy(m.data); fs.mkdirSync('.preview-shots', { recursive: true }); fs.writeFileSync(`.preview-shots/masque-${cle}.png`, PNG.sync.write(m)); }
  if (DRY) continue;
  if (T.plaza) {
    // Format des fontaines : images PLEINES (statique + ce qui vit) et la zone.
    const full = new PNG({ width: W * T.n, height: H }), zone = new PNG({ width: W, height: H });
    comp.forEach((c, fi) => { for (let y = 0; y < H; y += 1) c.copy(full.data, (y * W * T.n + fi * W) * 4, y * W * 4, (y + 1) * W * 4); });
    for (let p = 0; p < W * H; p += 1) {
      if (comp.some((c) => c.readUInt32BE(p * 4) !== src.data.readUInt32BE(p * 4))) { zone.data[p * 4] = 255; zone.data[p * 4 + 3] = 255; }
    }
    fs.writeFileSync(`${dir}/anim/${cle}.png`, PNG.sync.write(full));
    fs.writeFileSync(`${dir}/anim/zone/${cle}.png`, PNG.sync.write(zone));
    continue;
  }
  fs.writeFileSync(`${dir}/${cle}-live.png`, PNG.sync.write(strip));
  const fBack = `${dir}/${cle}-back.png`;
  if (erased) { const b = new PNG({ width: W, height: H }); back.copy(b.data); fs.writeFileSync(fBack, PNG.sync.write(b)); } else if (fs.existsSync(fBack)) fs.unlinkSync(fBack);
}

if (sheetRows.length) {
  const S = 4, PAD = 6, cols = 8;
  const cw = maxW * S + PAD, rowsH = sheetRows.map((r) => r.H * S + PAD);
  const sh = new PNG({ width: cols * cw, height: rowsH.reduce((a, b) => a + b, 0) });
  for (let i = 0; i < sh.data.length; i += 4) { sh.data[i] = 54; sh.data[i + 1] = 64; sh.data[i + 2] = 58; sh.data[i + 3] = 255; }
  let oy = 0;
  sheetRows.forEach((r, ri) => {
    r.imgs.forEach((d, c) => {
      for (let y = 0; y < r.H; y += 1) for (let x = 0; x < r.W; x += 1) {
        const s = (y * r.W + x) * 4;
        if (d[s + 3] < 16) continue;
        for (let yy = 0; yy < S; yy += 1) for (let xx = 0; xx < S; xx += 1) {
          const o = ((oy + y * S + yy) * sh.width + c * cw + x * S + xx) * 4;
          sh.data[o] = d[s]; sh.data[o + 1] = d[s + 1]; sh.data[o + 2] = d[s + 2]; sh.data[o + 3] = 255;
        }
      }
    });
    oy += rowsH[ri];
  });
  fs.mkdirSync(path.dirname(SHEET), { recursive: true });
  fs.writeFileSync(SHEET, PNG.sync.write(sh));
  console.log('planche :', SHEET);
}
