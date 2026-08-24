"use strict";
// ── LE TERRAIN — le champ de hauteur de la carte, et son ombrage ─────────────
//
// Né maquette (`mockHill.js`, 2026-08-24) sur le grief « tout est plat », promu en
// vraie feuille le jour même après le GO de Raph sur la v2 « monde cohérent ».
//
// LE MODÈLE. Une altitude par point du monde, DÉRIVÉE (mapSeed + plan) — jamais
// stockée, la save ne change pas :
//   · VALLÉE creusée par le fleuve : 0 au bord de l'eau, plateau à ~18 tuiles,
//     les DEUX rives montent — la ville grimpe depuis son port ;
//   · COLLINES en bruit de valeur 2 octaves semées par mapSeed — douces dans la
//     ville (cityK), pleines au-delà de la lisière urbaine ;
//   · SOCLES PLATS sous le bâti : chaque emprise de bâtiment est un replat (rect
//     continu + jupe de raccord), chaque PLACE et chaque PARVIS de merveille est
//     un groupe de cellules à hauteur unique.
//
// LES TROIS CONVENTIONS QUI TIENNENT LA COHÉRENCE (chacune a une raison) :
//   1. L'unité est U = T/4 et les niveaux sont des ENTIERS de U (« terrasses »).
//      Le zoom est quantifié au 1/8 : U·z = k px écran, toujours entier — toute
//      autre unité rouvre la couture inter-losanges (prouvé à l'écran, maquette).
//   2. Le niveau est PAR CELLULE (échantillon au centre) : tout ce qui se tient
//      dans une cellule — sol, arbre, passant — partage SON niveau. Un point à
//      coordonnées entières (coin partagé par 4 cellules) résout vers la cellule
//      SUD-EST (floor) : c'est la cellule que la boucle du sol dessine quand elle
//      projette son coin nord.
//   3. Les SOCLES se résolvent AVANT la cellule, en continu : l'ancre sud d'un
//      sprite tombe PILE sur le coin de son emprise — côté cellule ce point
//      appartient au voisin diagonal, côté rect (gonflé de PAD_GROW) il est
//      dedans. C'est ce qui garde un bâtiment collé à son replat.
//
// QUI CONSOMME. `terrainZ` est appelé par worldToScreen LUI-MÊME (l'axe wz) :
// tout ce qui se projette suit le terrain sans qu'aucun consommateur n'ait à y
// penser — la leçon du chantier clos (e44c512) : une altitude enfilée à la main
// dans chaque consommateur finit toujours par en oublier un. Le fleuve reste à
// z = 0 par CONSTRUCTION (le champ s'annule dans la bande riverPad), le pont
// COMPOSE par-dessus (bridgeLiftWorld s'additionne dans l'axe).
//
// Molette : __terrain(false) coupe tout, __terrain({ ... }) règle à chaud.
import { CM } from '../layout.js';

// amp est le MAÎTRE (0 = plat historique). Échelle validée à la capture le
// 2026-08-24 ; REMODELÉE le jour même (retour Raph : « ça fait un peu vague de
// colline ») — un bruit partout fait de la HOULE, pas des collines. Un vrai
// paysage concentre ses pentes :
//   · valley/bench/coteau : plaine alluviale PLATE sur `bench` tuiles, puis
//     MONTÉE franche sur `coteau` tuiles, puis plateau — la pente du bord de
//     fleuve vit dans le coteau, plus étalée partout ;
//   · hills/hillCut : les collines sont des MASSIFS DISCRETS — elles n'existent
//     qu'au-dessus du seuil `hillCut` du bruit large ; entre les massifs, la
//     plaine est VRAIMENT plate. Le détail fin ne module que DANS un massif.
// cityK = fraction des collines EN ville, big/det = tailles des octaves
// (tuiles), riverPad = bande à 0 le long de l'eau. Ombrage : k = contraste par
// unité de pente (COMPRIMÉ à ±cap — un coteau saturerait le soft-light),
// strength = alpha, texel = px écran par texel du buffer.
// Défauts accordés à la capture du 2026-08-24 (2e passe, après le retour
// « vague de colline ») : massifs plus couvrants (hillCut 0,52, big 20),
// coteau court et franc (8 U sur 4 tuiles), ombrage un cran plus present.
export const TERRAIN = {
  amp: 1, valley: 8, bench: 6, coteau: 4, hills: 9, hillCut: 0.52,
  cityK: 0.45, big: 20, det: 7, riverPad: 3,
  shade: 1, texel: 8, k: 1600, cap: 80, strength: 0.7,
};

// L'unité de relief (convention n° 1). Exportée : les contremarches du sol et
// les gardes la lisent — une valeur recopiée finirait par diverger.
export function reliefUnit() { return CM.TILE / 4; }

// Plafond du champ en px MONDE — sert aux marges de cull (une cellule sous le
// bord bas de l'écran, levée de terrainMax, peut encore être visible).
export function terrainMaxPx() {
  // 1,2 = le plafond du modelé de massif (0,8 + 0,4 · détail max).
  return TERRAIN.amp ? (TERRAIN.valley + TERRAIN.hills * 1.2) * TERRAIN.amp * reliefUnit() : 0;
}

// Fragment de clé de bake : vide à l'arrêt (aucune clé existante ne bouge), et il
// porte TOUT ce qui change le dessin — le piège d'invalidation a mordu 3× ce projet.
export function terrainKey() {
  if (!TERRAIN.amp) return '';
  return ':tr' + TERRAIN.amp + '_' + TERRAIN.valley + '_' + TERRAIN.bench
    + '_' + TERRAIN.coteau + '_' + TERRAIN.hills + '_' + TERRAIN.hillCut
    + '_' + TERRAIN.cityK + '_' + TERRAIN.big + '_' + TERRAIN.det + '_' + TERRAIN.riverPad;
}

// ── Bruit de valeur auto-porté (hérité du prototype legacy cityMapDrawTerrain).
// Auto-porté EXPRÈS : cette feuille est importée par projection.js — importer quoi
// que ce soit d'iso ici rouvrirait un risque de cycle. Hash entier sans allocation.
function trHash2(ix, iy, seed) {
  let h = (Math.imul(ix | 0, 73856093) ^ Math.imul(iy | 0, 19349663) ^ (seed | 0)) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15;
  return (h >>> 0) / 4294967295;
}
function trNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = trHash2(xi, yi, seed), b = trHash2(xi + 1, yi, seed);
  const c = trHash2(xi, yi + 1, seed), d = trHash2(xi + 1, yi + 1, seed);
  const ab = a + (b - a) * u, cd = c + (d - c) * u;
  return ab + (cd - ab) * v;                          // 0..1
}
const ss01 = (e0, e1, x) => {
  const t = Math.max(0, Math.min(1, (x - e0) / Math.max(1e-4, e1 - e0)));
  return t * t * (3 - 2 * t);
};

// ── SOCLES ────────────────────────────────────────────────────────────────────
// Bâtiments : rects CONTINUS (convention n° 3) indexés par blocs de 8 tuiles.
// Places et parvis : GROUPES de cellules (couverture exacte des formes en L) à
// hauteur unique, indexés par cellule. Hauteur d'un socle = terrain brut en son
// centre, échantillonnée PARESSEUSEMENT (les réglages peuvent changer avant
// qu'on le touche). Mémo sur le recompute du layout + l'aperçu de merveille
// (l'aperçu ajoute un parvis SANS recompute — même piège que la clé ':pv').
// ⚠ CLÉS NUMÉRIQUES PARTOUT dans le chemin chaud : terrainZ est appelé par CHAQUE
// projection (~100 000 fois par recuisson) — une clé de bloc concaténée en chaîne
// y coûtait plus que le bruit lui-même (mesuré : le batch des faces n'avait pas
// suffi, le résiduel était les allocations de chaînes). Bloc = bk·4096+bj, borné
// large (grille ≤ 512 blocs de 8). `gen` est la GÉNÉRATION entière : elle change
// quand les socles sont recuits (layout, aperçu, molette) — le cache de niveaux
// la compare en un test entier, sans recomposer la moindre chaîne.
const PAD_BLOCK = 8, PAD_SKIRT = 0.6, PAD_GROW = 0.05;
const _pads = { key: '', blocks: null, cells: null, gen: 0 };
const blockKey = (bx, by) => (bx + 2048) * 4096 + (by + 2048);
function padsFor(L) {
  const key = (CM.layoutRecomputeAt || 0) + ':' + (CM.previewWonder ? CM.previewWonder.id : '-');
  if (_pads.blocks && _pads.key === key) return _pads;
  _pads.gen += 1;
  const blocks = new Map();
  const cells = new Map();
  const cellPad = new Map();
  // 1) Bâtiments : un rect par emprise (les champs cultivés ÉPOUSENT le terrain).
  // `cellPad` = les cellules ENTIÈREMENT couvertes par un rect : l'immense
  // majorité des points fractionnaires (rubans de route, pieds d'agents) tombe
  // dedans et se résout en UN Map.get — la boucle des rects ne reste qu'aux
  // lisières (mesuré : elle coûtait +25 ms au poste routes de la recuisson).
  for (const t of (L.tiles || [])) {
    const idf = t.buildingId || t.variant || '';
    if (/field|farm|crop|orchard/i.test(idf)) continue;
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    const p = { x0: t.gx - PAD_GROW, y0: t.gy - PAD_GROW,
      x1: t.gx + sx + PAD_GROW, y1: t.gy + sy + PAD_GROW,
      cx: t.gx + sx / 2, cy: t.gy + sy / 2, h: 0, hDone: false };
    const bx0 = Math.floor((p.x0 - PAD_SKIRT) / PAD_BLOCK), bx1 = Math.floor((p.x1 + PAD_SKIRT) / PAD_BLOCK);
    const by0 = Math.floor((p.y0 - PAD_SKIRT) / PAD_BLOCK), by1 = Math.floor((p.y1 + PAD_SKIRT) / PAD_BLOCK);
    for (let by = by0; by <= by1; by += 1) for (let bx = bx0; bx <= bx1; bx += 1) {
      const k = blockKey(bx, by);
      let arr = blocks.get(k);
      if (!arr) { arr = []; blocks.set(k, arr); }
      arr.push(p);
    }
    for (let cy = 0; cy < sy; cy += 1) for (let cx2 = 0; cx2 < sx; cx2 += 1) {
      cellPad.set((t.gx + cx2) * 100000 + (t.gy + cy), p);
    }
  }
  // 2) Places : les cellules rank 'plaza' du roadMap, groupées par centre de
  // place le plus proche (L.plan.plazas) — une place = UN niveau.
  const plazas = (L.plan && Array.isArray(L.plan.plazas)) ? L.plan.plazas : [];
  const groups = [];
  const groupOfPlaza = new Map();
  if (L.roadMap) {
    for (const [k, cell] of L.roadMap) {
      if (!cell || cell.rank !== 'plaza') continue;
      const ci = k.indexOf(',');
      const gx = +k.slice(0, ci), gy = +k.slice(ci + 1);
      let pk = 'p0', best = Infinity;
      for (const p of plazas) {
        const d = (gx - p.gx) * (gx - p.gx) + (gy - p.gy) * (gy - p.gy);
        if (d < best) { best = d; pk = p.gx + ':' + p.gy; }
      }
      let g = groupOfPlaza.get(pk);
      if (!g) { g = { sx: 0, sy: 0, n: 0, h: 0, hDone: false }; groupOfPlaza.set(pk, g); groups.push(g); }
      g.sx += gx + 0.5; g.sy += gy + 0.5; g.n += 1;
      cells.set(gx * 100000 + gy, g);
    }
  }
  // 3) Parvis de merveille : le Set du layout, en UN groupe par composante non
  // requise — un seul niveau pour tout le parvis suffit (les parvis sont petits
  // et isolés les uns des autres).
  if (L.wonderGround && L.wonderGround.size) {
    const g = { sx: 0, sy: 0, n: 0, h: 0, hDone: false };
    for (const k of L.wonderGround) {
      const ci = k.indexOf(',');
      const gx = +k.slice(0, ci), gy = +k.slice(ci + 1);
      g.sx += gx + 0.5; g.sy += gy + 0.5; g.n += 1;
      cells.set(gx * 100000 + gy, g);
    }
    if (g.n) groups.push(g);
  }
  _pads.blocks = blocks; _pads.cells = cells; _pads.cellPad = cellPad; _pads.key = key;
  return _pads;
}

// TERRAIN BRUT en unités U au point (gx, gy) en TUILES — vallée + collines,
// AVANT socles et quantification. C'est lui qui donne la hauteur d'un socle.
function rawFieldU(gx, gy) {
  const L = CM.layout;
  // Layout incomplet (tests unitaires, transitoires de montage) : terrain plat.
  // Sans cœur de ville, la lisière n'est pas définissable — et un NaN ici se
  // propagerait à TOUTE projection.
  const ccx = L.plan && L.plan.core ? L.plan.core.x : L.cx;
  const ccy = L.plan && L.plan.core ? L.plan.core.y : L.cy;
  if (!Number.isFinite(ccx) || !Number.isFinite(ccy)) return 0;
  const seed = (L.mapSeed || 0) | 0;
  const ry = L.river && L.river.present && L.river.riverYAt;
  const dr = ry ? Math.abs(gy - ry(gx)) : 1e9;
  // VALLÉE EN COTEAU (remodelage anti-« houle ») : plaine alluviale PLATE sur
  // `bench` tuiles, puis montée FRANCHE sur `coteau` tuiles, puis plateau. La
  // pente du bord de fleuve est CONCENTRÉE dans le coteau — c'est lui qu'on
  // lit comme « la ville est au-dessus de sa rivière », au lieu d'une rampe
  // diffuse qui inclinait tout le paysage.
  const valley = TERRAIN.valley * ss01(TERRAIN.bench, TERRAIN.bench + TERRAIN.coteau, dr);
  // MASSIFS DISCRETS : le bruit large ne fait une colline qu'au-dessus du
  // seuil — entre les massifs, la plaine est VRAIMENT plate (le « vague de
  // colline » venait du bruit résiduel partout). Le détail fin ne vit que DANS
  // un massif (multiplié par sa masse) : il sculpte les flancs sans onduler la
  // plaine.
  const bigN = trNoise(gx / TERRAIN.big, gy / TERRAIN.big, seed);
  const mass = ss01(TERRAIN.hillCut, 0.95, bigN);
  let hills = 0;
  if (mass > 0) {
    const detN = trNoise(gx / TERRAIN.det, gy / TERRAIN.det, seed + 101);
    hills = TERRAIN.hills * mass * (0.8 + 0.4 * detN);
  }
  // Lisière du prototype legacy : la ville « apprivoise » le relief — les
  // collines pleines ne vivent qu'au-delà du rayon urbain, qui grandit avec
  // les ères. Le terrain proche s'adoucit donc au fil de la partie : assumé.
  const eraIndex = (L.counts && L.counts.eraIndex) || 0;
  const urbanTier = (L.counts && L.counts.urbanTier) || 0;
  const flatR = 6 + eraIndex * 3.8 + urbanTier * 7;
  const wildK = ss01(flatR, flatR + 8, Math.hypot(gx - ccx, gy - ccy));
  hills *= TERRAIN.cityK + (1 - TERRAIN.cityK) * wildK;
  // Rien sous le niveau de l'eau, et le bord de l'eau reste à 0 : tout
  // l'appareil du fleuve (quais, grève, vagues, pont) vit à z = 0.
  const h = Math.max(0, valley + hills) * ss01(TERRAIN.riverPad, TERRAIN.riverPad + 4, dr);
  return h * TERRAIN.amp;
}

// Champ LISSE en unités U (socles fondus, PAS quantifié) — la référence de
// l'ombrage : ombrer les terrasses rayerait le flanc, on ombre la forme douce.
function smoothFieldU(gx, gy) {
  const L = CM.layout;
  let h = rawFieldU(gx, gy);
  const P = padsFor(L);
  const arr = P.blocks.get(blockKey(Math.floor(gx / PAD_BLOCK), Math.floor(gy / PAD_BLOCK)));
  if (arr) {
    for (const p of arr) {
      const ddx = gx < p.x0 ? p.x0 - gx : gx > p.x1 ? gx - p.x1 : 0;
      const ddy = gy < p.y0 ? p.y0 - gy : gy > p.y1 ? gy - p.y1 : 0;
      const dOut = Math.hypot(ddx, ddy);
      if (dOut >= PAD_SKIRT) continue;
      if (!p.hDone) { p.h = rawFieldU(p.cx, p.cy); p.hDone = true; }
      const k = ss01(0, PAD_SKIRT, dOut);
      h = p.h + (h - p.h) * k;
      if (dOut === 0) return h;
    }
  }
  return h;
}

// NIVEAU D'UNE CELLULE, en ENTIERS de U (conventions n° 1 et 2). C'est LA valeur
// que le sol dessine et que les contremarches comparent.
//
// CACHE PAR LAYOUT : le niveau ne dépend ni du zoom ni de la caméra, et le
// balayage du sol relit chaque cellule jusqu'à 5 fois (elle-même + voisine des
// contremarches de 4 autres). Sans cache, le terrain coûtait +50 % de recuisson
// (mesuré : ~320 ms contre ~208 à zoom 0,5 sur 1 048 tuiles) — le bruit de
// valeur payé 40 000 fois. Vidé avec la mémo des socles (même clé de vie).
const _levels = new Map();
let _levelsGen = -1;
export function cellLevelU(gx, gy) {
  if (!TERRAIN.amp) return 0;
  const L = CM.layout;
  if (!L) return 0;
  const P = padsFor(L);
  if (_levelsGen !== P.gen) { _levels.clear(); _levelsGen = P.gen; }
  const ck = gx * 100000 + gy;
  const hit = _levels.get(ck);
  if (hit !== undefined) return hit;
  let h;
  const g = P.cells.get(ck);
  if (g) {
    if (!g.hDone) { g.h = Math.round(rawFieldU(g.sx / g.n, g.sy / g.n)); g.hDone = true; }
    h = g.h;
  } else {
    h = Math.round(smoothFieldU(gx + 0.5, gy + 0.5));
  }
  _levels.set(ck, h);
  return h;
}

// ALTITUDE en px MONDE au point (wx, wy) — ce que worldToScreen ajoute à l'axe.
// Socles d'abord (continu, convention n° 3), niveau de cellule sinon.
//
// CACHE DES COINS ENTIERS : le balayage du sol et ses contremarches interrogent
// les COINS de grille (~60 000 appels par recuisson, chaque coin partagé par 4
// cellules), et un coin en ville traverse la boucle des rects de son bloc (10-20
// socles). Un point à coordonnées entières de tuile est mémoïsé ; les points
// fractionnaires (pieds d'agents, quads de route) paient le chemin plein.
const _corners = new Map();
let _cornersGen = -1;
export function terrainZ(wx, wy) {
  if (!TERRAIN.amp) return 0;
  const L = CM.layout;
  if (!L) return 0;
  const T = CM.TILE, U = T / 4;
  const gx = wx / T, gy = wy / T;
  const P = padsFor(L);
  const igx = gx | 0, igy = gy | 0;
  const corner = gx === igx && gy === igy;
  let ck = 0;
  if (corner) {
    if (_cornersGen !== P.gen) { _corners.clear(); _cornersGen = P.gen; }
    ck = igx * 100000 + igy;
    const hit = _corners.get(ck);
    if (hit !== undefined) return hit;
  }
  let h;
  // Cellule ENTIÈREMENT sous une emprise : un seul Map.get, pas de boucle.
  let pad = P.cellPad.get(Math.floor(gx) * 100000 + Math.floor(gy)) || null;
  if (!pad) {
    const arr = P.blocks.get(blockKey(Math.floor(gx / PAD_BLOCK), Math.floor(gy / PAD_BLOCK)));
    if (arr) {
      for (const p of arr) {
        if (gx >= p.x0 && gx <= p.x1 && gy >= p.y0 && gy <= p.y1) { pad = p; break; }
      }
    }
  }
  if (pad) {
    if (!pad.hDone) { pad.h = rawFieldU(pad.cx, pad.cy); pad.hDone = true; }
    h = Math.round(pad.h) * U;
  } else {
    h = cellLevelU(Math.floor(gx), Math.floor(gy)) * U;
  }
  if (corner) _corners.set(ck, h);
  return h;
}

// ── OMBRAGE ÉCRAN (le hillshade du prototype legacy, recyclé) ────────────────
// Buffer basse résolution recalculé quand caméra/réglages bougent, blitté
// upscalé en soft-light PAR-DESSUS la scène vivante : le flanc éclairé prend
// aussi les bâtiments — c'est ce qui « vend » la pente (mesuré à la maquette :
// géométrie seule = fish-eye, géométrie + ombrage = relief).
// Lumière HAUT-GAUCHE, ombres BAS-DROITE (la règle du projet).
// ⚠ ACCORD : l'ombre ne doit jamais en dire PLUS que la géométrie (cityK bas +
// k haut = l'effet papier peint que le prototype legacy dénonçait) — les deux
// curseurs se règlent ENSEMBLE.
const _shade = { buf: null, ctx: null, W: 0, H: 0, key: '' };
export function drawTerrainShade() {
  if (!TERRAIN.amp || !TERRAIN.shade || !TERRAIN.strength) return;
  const ctx = CM.ctx;
  if (!ctx || !CM.layout) return;
  const z = CM.cam.zoom, T = CM.TILE, U = T / 4;
  const W = Math.max(2, Math.ceil(CM.cw / TERRAIN.texel));
  const H = Math.max(2, Math.ceil(CM.ch / TERRAIN.texel));
  const key = CM.cam.x.toFixed(1) + ':' + CM.cam.y.toFixed(1) + ':' + z.toFixed(3)
    + ':' + W + 'x' + H + terrainKey() + ':k' + TERRAIN.k + '_' + TERRAIN.cap + ':' + _pads.key;
  if (key !== _shade.key || !_shade.buf) {
    if (!_shade.buf || _shade.W !== W || _shade.H !== H) {
      _shade.buf = typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(W, H)
        : (() => { const el = document.createElement('canvas'); el.width = W; el.height = H; return el; })();
      _shade.buf.width = W; _shade.buf.height = H;
      _shade.ctx = _shade.buf.getContext('2d');
      _shade.W = W; _shade.H = H;
    }
    // Inverse RECOPIÉ de screenToWorld (l'importer ferait un cycle) + une
    // itération de point fixe : la projection soustrait terrainZ·z au y d'écran,
    // l'inverse du plan seul vise trop bas sur les hauteurs.
    const s2w = (sx, sy) => {
      const ax = (sx - CM.cw / 2) / z, b = 2 * (sy - CM.ch / 2) / z;
      return { x: (b + ax) / 2 + CM.cam.x, y: (b - ax) / 2 + CM.cam.y };
    };
    const img = _shade.ctx.createImageData(W, H);
    const data = img.data;
    const px = CM.cw / W, py = CM.ch / H;
    const d = 0.5;                                     // pas de la différence finie (tuiles)
    for (let ty = 0; ty < H; ty += 1) {
      for (let tx = 0; tx < W; tx += 1) {
        const sx = (tx + 0.5) * px, sy = (ty + 0.5) * py;
        let p = s2w(sx, sy);
        const z0 = smoothFieldU(p.x / T, p.y / T) * U;
        if (z0) p = s2w(sx, sy + z0 * z);
        const gx = p.x / T, gy = p.y / T;
        const g = (smoothFieldU(gx + d, gy) - smoothFieldU(gx - d, gy)
          + smoothFieldU(gx, gy + d) - smoothFieldU(gx, gy - d)) / (2 * d);
        const o = (ty * W + tx) * 4;
        if (g === 0) { data[o + 3] = 0; continue; }
        // g est en U par tuile ; U/T = ¼ le convertit en pente sans dimension.
        // COMPRIMÉ à ±cap : un coteau (1,2 U/tuile) saturerait le soft-light en
        // noir/blanc pur — on garde k pour les pentes douces, le mur pour les raides.
        let off = g * 0.25 * TERRAIN.k;
        if (off > TERRAIN.cap) off = TERRAIN.cap; else if (off < -TERRAIN.cap) off = -TERRAIN.cap;
        const grey = 128 + off;
        data[o] = data[o + 1] = data[o + 2] = grey;
        data[o + 3] = 255;
      }
    }
    _shade.ctx.putImageData(img, 0, 0);
    _shade.key = key;
  }
  const prevOp = ctx.globalCompositeOperation, prevSm = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = TERRAIN.strength;
  ctx.drawImage(_shade.buf, 0, 0, CM.cw, CM.ch);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = prevOp;
  ctx.imageSmoothingEnabled = prevSm;
}

if (typeof window !== 'undefined') {
  window.__terrain = (o) => {
    if (o === false) TERRAIN.amp = 0;
    else if (o === true) { if (!TERRAIN.amp) TERRAIN.amp = 1; }
    else if (o) Object.assign(TERRAIN, o);
    // Ceinture ET bretelles : la clé change (terrainKey), mais on invalide aussi à
    // la main — le sol, le cache de crans ET le quai (qui ne porte pas le fragment).
    CM._isoGroundBake = null; CM._quayBake = null; CM._tileBake = null;
    if (CM._groundZoomCache) CM._groundZoomCache.clear();
    _pads.key = '';   // les hauteurs de socle dépendent des réglages → re-échantillonner
    return { ...TERRAIN };
  };
}
