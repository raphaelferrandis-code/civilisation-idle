"use strict";
// ── LA FORÊT CUITE DANS LE SOL (audit du 2026-10-05, PERF-3, choix (d) de Raph) ──
//
// En vue lointaine, la ceinture de forêt coûtait des milliers de poses par image
// (4 175 arbres sur 12 054 appels au dézoom d'une mégapole, comptés par l'audit) :
// chaque arbre, trié et posé un à un, pour un sprite de quelques pixels. Aux niveaux
// de la pyramide ≤ 0,5 (vent coupé, ombre et reflet éteints : rien ne bouge dans un
// arbre), ils sont CUITS dans les tuiles du sol (solPyramide.cookTile → bakeForestTile),
// et le peintre ne pose plus que ceux qu'il doit poser lui-même.
//
// IDENTIQUE AU REPOS, PAR CONSTRUCTION — trois garanties :
//   1. LA MÊME IMAGE AU MÊME PIXEL. L'arbre cuit est posé par la même formule que le
//      peintre (worldToScreen avec la caméra de la tuile), au plus proche voisin. La
//      tuile tombe à l'écran à un décalage ENTIER de pixels device depuis l'origine
//      arrondie une fois par frame (solPyramideFrame.screenOrigin, rendue déterministe
//      pour ça) ; le reste — la demi-largeur d'un canevas impair, celui de Raph fait
//      1 765 px — est la PHASE (phx, phy) que la cuisson ajoute à l'arbre. Les sprites
//      d'arbre n'ont que des alphas 0 ou 255 (mesuré sur les 104 fichiers) : un arbre
//      cuit ET reposé par le peintre donne exactement l'arbre posé seul. Une tuile un
//      peu en retard n'est donc jamais fausse : au pire l'arbre est posé deux fois.
//      ⚠ Reste l'arrondi FLOTTANT du plus proche voisin : la toile d'une tuile et l'écran
//      ne portent pas la même position en float32 (quelques centaines de px contre
//      quelques milliers) ; un échantillon qui tombe à 1e-4 px d'une frontière prend la
//      rangée ou la colonne voisine du sprite. Mesuré : 1 à 166 px sur 3 millions par
//      image, tous à une case source près dans un arbre cuit — le même arrondi fait déjà
//      changer ~900 px quand la caméra glisse de 4 px, peintre seul.
//   2. RIEN NE PASSE DESSUS ALORS QU'IL DEVRAIT PASSER DESSOUS. Un arbre cuit est
//      sous tout ce qui suit le sol ; le peintre ne le saute (fbTree) que si rien de ce
//      qu'il a déjà posé dans cette frame — tout ce qui précède l'arbre dans le tri —
//      ne recoupe l'arbre. Ce qui est posé est MARQUÉ (fbMark : une boîte prudente par
//      genre d'objet, sur une grille de 8 px) ; un arbre posé par le peintre l'est par
//      son MASQUE, sur une couverture d'un bit par pixel (une forêt dense se recouvre de
//      proche en proche : en boîtes, la contagion emportait deux arbres sur trois au
//      lieu d'un sur deux, mesuré sur la mégapole de l'audit). La lumière déposée sous
//      un arbre (calque occulté) le force aussi : lightWouldCut répond exactement comme
//      sa découpe. Ce qui précède le peintre est marqué en tête (coques du fleuve, halo
//      d'émeute, case survolée), et l'eau, posée au-dessus du sol en direct, exclut de
//      la cuisson les arbres qui la bordent (waterNear : fleuve, berges, prolongements).
//   3. LE REPOS SEULEMENT. Un niveau n'est cuit que si la caméra ne peut s'y poser qu'à
//      SA valeur (zoom au 1/8 : niveau = zoom) — le niveau plancher 0,25 d'une très
//      grande carte sert aussi le zoom 0,125 réduit de moitié, lissé : pas cuit (cf.
//      inactiveReason). En geste, l'arbre cuit s'étire avec sa tuile, comme le sol.
//
// MESURÉ (Chrome en rendu logiciel, 2 456 × 1 245, mégapoles de l'audit, image complète
// rastérisée) : vue de forêt au zoom 0,375, 52-57 → 33-35 ms ; bord de ville au zoom
// 0,5, 31 → 28 ms ; cœur de ville, inchangé (le verdict du repos, fbEnd, coupe la
// mécanique quand elle coûte plus qu'elle ne rapporte).
//
// Ce qui ne bouge pas : le tri (les arbres sautés y restent, leur pose seule tombe),
// l'ordre de deux arbres de même profondeur (celui de la liste de la forêt, rejoué par
// `o`), les arbres que le peintre écarte (places, terre-pleins, ponts, ruines).
//
//   __forestBake()              réglages + relevé de la dernière frame
//   __forestBake({ on: false }) A/B : tout redevient posé par le peintre
import { state } from '../../core/state.js';
import { CM, treeCanvasT } from '../layout.js';
import { ZOOM_QUANT } from './projection.js';
import { isoWildForestBlockAt, isoWildForestSig, WILD_BLOCK } from './isoWildForest.js';
import { TREE_SPRITES, TREE_DEAD_VARIANT, ISO_TREE_VARIANTS, cityTreeVariant, treeAliveVariant, treeSpriteK } from './isoGroundProps.js';
import { isoArt } from './isoArt.js';
import { seasonTree } from './isoGroundDetail.js';
import { TERRAIN } from './isoTerrain.js';
import { SUN_SHADOW } from './isoSunShadow.js';
import { REFLECT } from './isoReflect.js';
import { riverEndRays, nearRiverEndRay } from './riverEnds.js';
import { bridgeBlocks, bridgeGeoms, bridgeSegScreenBox } from './isoBridge.js';
import { isoPlazaBoxes } from './isoPlaza.js';
import { wonderSegScreenBox } from './isoWonder.js';
import { chuteRelicCells } from './isoChute.js';
import { CHUTE } from './chuteState.js';
import { WINTER } from '../seasonMode.js';
import { lightWouldCut } from '../lightLayer.js';
import { lampBox } from './isoStreet.js';

// maxZ : niveau le plus haut cuit. Marges de l'eau (en tuiles d'écran, Tz) : ce que
// le fleuve pose au-dessus du sol déborde de ses cellules — mur du quai vers l'eau,
// piles des ponts, remous. cell : pas de la grille des marques (px CSS). minShare :
// part de candidats dans la liste du peintre sous laquelle on ne saute rien — marquer
// ~8 000 objets coûte ~1 ms, plus que les quelques poses d'arbre épargnées (mesuré au
// cœur d'une mégapole, zoom 0,5 : 89 arbres sautés, +1,3 ms). juge : le verdict du
// repos (cf. fbEnd) — false pour toujours sauter (bancs d'A/B).
export const FOREST_BAKE = { on: true, maxZ: 0.5, waterH: 1, waterUp: 1, waterDown: 1, cell: 8, minShare: 0.05, juge: true };
export const forestBakeStats = { actif: false, raison: '', niveau: 0, cuits: 0, sautes: 0, vifs: 0, candidats: 0, juge: '',
  forces: { tuile: 0, marque: 0, arbre: 0, lumiere: 0, phase: 0 }, ajouts: 0, versions: 0, exclus: {} };

const ZOOM_MIN_LEVEL = 0.25;           // = solPyramide.ZOOM_MIN (le plancher des niveaux)

// ── Le dessin d'un arbre, tel que le peintre le choisit ─────────────────────
// La VARIANTE posée par isoLivePaint (et elle seule) : mémoïsée sur l'arbre comme
// avant (`_tv`, `_ta`). Partagée ici pour que la cuisson et le peintre ne puissent
// jamais choisir deux dessins différents.
export function treeTvNow(tr, band, deadOk) {
  let tv = tr._tv;
  if (tv === undefined) tv = tr._tv = tr.v || cityTreeVariant(tr.gx, tr.gy, band);
  // Hors hiver et hors ruines, la cellule du sapin mort reçoit une essence
  // vivante — tirée à part, et mémoïsée comme la variante.
  if (tv === TREE_DEAD_VARIANT && !deadOk) {
    if (tr._ta === undefined) tr._ta = treeAliveVariant(tr.gx, tr.gy);
    tv = tr._ta;
  } else if (tr.dead && deadOk) tv = TREE_DEAD_VARIANT;   // conifère de la forêt (isoWildForest)
  return tv;
}
export const treeDeadOk = () => (CM.season | 0) === WINTER || !!CM.frameRuined;

// Les arbres que le peintre ÉCARTE (places, terre-pleins) — la même règle que la
// collecte (isoLiveCollect), qui l'appelle aussi : un arbre écarté n'est jamais cuit.
// Pas d'arbre décoratif à moins de 1,5 cellule d'une place ni à moins d'une cellule
// d'un terre-plein (ils chevauchaient la fontaine et les haies).
export function treeBlockedIn(pbT, segsT, gx, gy) {
  for (const b of pbT) {
    if (gx >= b.gx0 - 1.5 && gx <= b.gx1 + 1.5 && gy >= b.gy0 - 1.5 && gy <= b.gy1 + 1.5) return true;
  }
  for (const sg of segsT) {
    if (sg.axis === 'v') {
      if (Math.abs(gx + 0.5 - (sg.x + 1)) < 1.0 && gy >= sg.y0 - 1 && gy <= sg.y1 + 1.5) return true;
    } else if (Math.abs(gy + 0.5 - (sg.y + 1)) < 1.0 && gx >= sg.x0 - 1 && gx <= sg.x1 + 1.5) return true;
  }
  return false;
}

// ── Géométrie pure (testée) ─────────────────────────────────────────────────
// La PHASE d'un canevas : ce que l'arrondi de l'origine de l'espace tuile retire à
// cw/2 (en px device). 0 pour une largeur device paire, −0,5 pour une impaire.
export function canvasPhase(cssSize, dpr) {
  const h = cssSize * (dpr || 1) / 2;
  return h - Math.round(h);
}
// Un losange (centre cx, cy ; demi-axes W, H) touche-t-il le rectangle [x0,x1]×[y0,y1] ?
export function diamondHitsRect(cx, cy, W, H, x0, y0, x1, y1) {
  const qx = cx < x0 ? x0 : cx > x1 ? x1 : cx, qy = cy < y0 ? y0 : cy > y1 ? y1 : cy;
  return Math.abs(qx - cx) / W + Math.abs(qy - cy) / H <= 1;
}
// Coin de la toile d'un arbre (pied fx, fy en px monde, côté hpx) dans la toile d'une
// tuile cuite à la caméra `cam` (côté `side`, px CSS) : worldToScreen, puis le décalage
// du peintre (x − hpx/2, y − 0,92·hpx), plus la phase du canevas d'écran (ox, oy).
export function treeTileXY(fx, fy, hpx, cam, side, z, ox, oy) {
  const dx = fx - cam.x, dy = fy - cam.y;
  return { x: (dx - dy) * z + side / 2 - hpx / 2 + ox, y: (dx + dy) * 0.5 * z + side / 2 - hpx * 0.92 + oy };
}
// Empreinte d'une tuile : indépendante de l'ordre (somme et xor des arbres), de sorte
// que deux énumérations du même contenu signent pareil.
export function forestSigOf(hashes, phx, phy) {
  if (!hashes.length) return 0;
  let s = 0, x = 0;
  for (const h of hashes) { s = (s + h) >>> 0; x = (x ^ Math.imul(h, 2654435761)) >>> 0; }
  return ((Math.imul(s ^ (x >>> 7), 2246822519) ^ Math.round(phx * 64) ^ (Math.round(phy * 64) << 9)) >>> 0) || 1;
}
const mix = (h, v) => Math.imul(h ^ (v | 0), 16777619) >>> 0;

// Encre d'une image (boîte des pixels opaques), mémoïsée par image.
const _inks = new WeakMap();
function inkOf(img) {
  let e = _inks.get(img);
  if (e !== undefined) return e;
  e = null;
  try {
    const w = img.naturalWidth || img.width | 0, h = img.naturalHeight || img.height | 0;
    if (w > 0 && h > 0 && typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, w, h).data;
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
        if (d[(y * w + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      if (x1 >= 0) e = { w, h, x0, y0, x1, y1 };
    }
  } catch { e = null; }
  _inks.set(img, e);
  return e;
}
// Identité d'image → petit entier (signature des tuiles).
const _imgIds = new WeakMap();
let _imgNext = 1;
function imgId(img) {
  let id = _imgIds.get(img);
  if (!id) { id = _imgNext++; _imgIds.set(img, id); }
  return id;
}

// ── Le niveau cuit (une « version » : tout ce dont dépend une tuile cuite) ──
function inactiveReason(L, z, dpr, G) {
  if (!FOREST_BAKE.on) return 'off';
  if (!L) return 'plan';
  if (z > FOREST_BAKE.maxZ + 1e-9) return 'zoom';
  // Ombre et reflet d'arbre : nuls sous leur minZoom (0,6) — le niveau doit y rester.
  if (z >= SUN_SHADOW.minZoom - 1e-9 || z >= REFLECT.minZoom - 1e-9) return 'ombre';
  if (!ZOOM_QUANT.on) return 'zoom continu';
  // Le niveau plancher sert aussi les zooms sous lui (0,125 d'une très grande carte),
  // réduit et lissé : l'arbre cuit n'y serait plus l'arbre posé.
  if (z <= ZOOM_MIN_LEVEL + 1e-9 && (CM.zoomFloor || ZOOM_MIN_LEVEL) < ZOOM_MIN_LEVEL - 1e-9) return 'plancher';
  if (CHUTE.act) return 'chute';
  if (TERRAIN.amp) return 'relief';
  if (Math.abs(G * dpr - Math.round(G * dpr)) > 1e-9) return 'dpr';
  if (import.meta.env?.DEV && typeof window !== 'undefined' && window.__wildThin != null && window.__wildThin < 1) return 'eclaircie';
  return '';
}

let _lv = null;
// Le contexte du niveau z, ou null (inactif). `geo` : { mb (boîte du plan au niveau,
// espace tuile), S, G, dpr, cw, ch } — fourni par solPyramideFrame.
export function forestBakeLevel(L, z, geo) {
  const dpr = geo.dpr || 1;
  const why = inactiveReason(L, z, dpr, geo.G);
  forestBakeStats.raison = why; forestBakeStats.niveau = z;
  if (why) { forestBakeStats.actif = false; return null; }
  const band = (L.counts && L.counts.eraBand) | 0, deadOk = treeDeadOk();
  const imgs = [];
  let ids = '';
  for (let tv = 1; tv <= ISO_TREE_VARIANTS; tv += 1) {
    const nm = TREE_SPRITES[tv].name, a = isoArt(nm);
    const im = a.ready ? (seasonTree(a, nm) || a.img) : null;
    imgs[tv] = im;
    ids += (im ? imgId(im) : 0) + ',';
  }
  const S = geo.S, mb = geo.mb;
  const txA = Math.floor(mb.x0 / S), txB = Math.ceil(mb.x1 / S) - 1, tyA = Math.floor(mb.y0 / S), tyB = Math.ceil(mb.y1 / S) - 1;
  const phx = canvasPhase(geo.cw, dpr), phy = canvasPhase(geo.ch, dpr);
  const fsig = isoWildForestSig(L);
  const refs = [L, chuteRelicCells(L), bridgeGeoms(), isoPlazaBoxes(L), L.terrePlein || null, L.river || null];
  const key = [z, band, deadOk ? 1 : 0, CM.season | 0, dpr, S, geo.G, phx, phy, txA, txB, tyA, tyB, fsig,
    FOREST_BAKE.waterH, FOREST_BAKE.waterUp, FOREST_BAKE.waterDown, ids].join('|');
  if (_lv && _lv.key === key && _lv.refs.every((r, i) => r === refs[i])) { forestBakeStats.actif = true; return _lv; }
  forestBakeStats.versions = (forestBakeStats.versions || 0) + 1; forestBakeStats.exclus = {};
  _lv = {
    key, refs, L, z, band, deadOk, dpr, S, G: geo.G, T: CM.TILE, imgs, phx, phy,
    rect: { x0: txA * S, x1: (txB + 1) * S, y0: tyA * S, y1: (tyB + 1) * S },
    relic: refs[1], pb: refs[3] || [], segs: refs[4] || [],
    water: null, rays: null,
    recs: new WeakMap(), geos: new WeakMap(), sigs: new Map(), masks: new Map(),
    hmax: 0,                          // plus grande hauteur d'arbre cuit au-dessus de son pied (espace tuile)
    // Bornes de la toile d'un arbre de forêt au niveau (fenêtre d'énumération).
    hpxMax: CM.TILE * z * treeCanvasT(1.3) * 1.34 + 2,
  };
  forestBakeStats.actif = true;
  return _lv;
}

// L'EAU, posée en direct au-dessus du sol : cellules de fleuve et de berge (grille
// typée sur leur boîte), prolongements du fleuve hors grille (riverEnds).
function waterGrid(lv) {
  if (lv.water) return lv.water;
  const L = lv.L, rv = L.river;
  const keys = [];
  if (rv && rv.present && rv.cells) for (const k of rv.cells) keys.push(k);
  if (rv && rv.banks) for (const k of rv.banks) keys.push(k);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const pts = new Int32Array(keys.length * 2);
  keys.forEach((k, i) => {
    const c = k.indexOf(','), gx = +k.slice(0, c), gy = +k.slice(c + 1);
    pts[i * 2] = gx; pts[i * 2 + 1] = gy;
    if (gx < x0) x0 = gx; if (gx > x1) x1 = gx; if (gy < y0) y0 = gy; if (gy > y1) y1 = gy;
  });
  const W = keys.length ? x1 - x0 + 1 : 0, H = keys.length ? y1 - y0 + 1 : 0;
  const g = new Uint8Array(Math.max(1, W * H));
  for (let i = 0; i < keys.length; i += 1) g[(pts[i * 2 + 1] - y0) * W + (pts[i * 2] - x0)] = 1;
  lv.rays = rv && rv.present && rv.cells && rv.samples ? riverEndRays(rv.samples) : [];
  lv.water = { g, x0, y0, W, H };
  return lv.water;
}
function waterAt(lv, gx, gy) {
  const w = waterGrid(lv);
  const x = gx - w.x0, y = gy - w.y0;
  if (x >= 0 && y >= 0 && x < w.W && y < w.H && w.g[y * w.W + x]) return true;
  // Même marge que les cellules d'eau et de berge du plan (isoWildForest, RIVER_END_BANK).
  return lv.rays.length > 0 && nearRiverEndRay(lv.rays, gx + 0.5, gy + 0.5, 1.4);
}
// Cellules (bornes entières) dont le point de pied peut tomber dans le rectangle
// d'espace tuile [x0,x1]×[y0,y1] au niveau z (inverse de la projection, ± une cellule).
function cellsOfRect(lv, x0, y0, x1, y1) {
  const Tz = lv.T * lv.z;
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
  for (const [X, Y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
    const a = X / Tz, b = Y / (0.5 * Tz);
    const wx = (b + a) / 2, wy = (b - a) / 2;
    if (wx < a0) a0 = wx; if (wx > a1) a1 = wx; if (wy < b0) b0 = wy; if (wy > b1) b1 = wy;
  }
  return { gx0: Math.floor(a0) - 2, gx1: Math.ceil(a1) + 1, gy0: Math.floor(b0) - 2, gy1: Math.ceil(b1) + 1 };
}
function waterNear(lv, r) {
  const Tz = lv.T * lv.z;
  const x0 = r.x0 - FOREST_BAKE.waterH * Tz, x1 = r.x1 + FOREST_BAKE.waterH * Tz;
  const y0 = r.y0 - FOREST_BAKE.waterDown * Tz, y1 = r.y1 + FOREST_BAKE.waterUp * Tz;
  const c = cellsOfRect(lv, x0, y0, x1, y1);
  for (let gy = c.gy0; gy <= c.gy1; gy += 1) {
    for (let gx = c.gx0; gx <= c.gx1; gx += 1) {
      if (!waterAt(lv, gx, gy)) continue;
      if (diamondHitsRect((gx - gy) * Tz, (gx + gy + 1) * Tz * 0.5, Tz, Tz * 0.5, x0, y0, x1, y1)) return true;
    }
  }
  return false;
}

// La GÉOMÉTRIE d'un arbre au niveau : toile, encre (boîte, ± un pixel), clé de tri.
function geomOf(lv, tr) {
  const tv = treeTvNow(tr, lv.band, lv.deadOk);
  const img = lv.imgs[tv];
  if (!img) return null;
  const ink = inkOf(img);
  if (!ink) return null;
  const T = lv.T, z = lv.z;
  const hpx = T * z * treeCanvasT(tr.r, tr.fixed) * treeSpriteK(tv);
  const fx = (tr.gx + 0.5 + (tr.jx || 0)) * T, fy = (tr.gy + 0.9 + (tr.jy || 0)) * T;
  const X = (fx - fy) * z, Y = (fx + fy) * 0.5 * z;          // espace tuile (relief nul)
  const cx = X - hpx / 2, cy = Y - hpx * 0.92;
  const pad = 1 / lv.dpr + 0.5, sw = ink.w, sh = ink.h;
  return {
    tr, tv, img, hpx, fx, fy, d: fx + fy, cx, cy, sw,
    x0: cx + (ink.x0 / sw) * hpx - pad, x1: cx + ((ink.x1 + 1) / sw) * hpx + pad,
    y0: cy + (ink.y0 / sh) * hpx - pad, y1: cy + ((ink.y1 + 1) / sh) * hpx + pad,
    foot: Y, mask: null, bake: false,
  };
}
// Un arbre de FORÊT : sa géométrie + peut-il être cuit ?
function recOf(lv, tr) {
  let r = lv.recs.get(tr);
  if (r !== undefined) return r;
  r = geomOf(lv, tr);
  if (r) {
    const T = lv.T, R = lv.rect;
    // Le premier motif qui l'écarte (relevé dans forestBakeStats.exclus).
    const why = !(r.hpx / r.sw < 0.75) ? 'vent'                    // jamais de vent (isoVie.vieTreeSway)
      : !(r.x0 >= R.x0 && r.x1 <= R.x1 && r.y0 >= R.y0 && r.y1 <= R.y1) ? 'horsPlan'   // dans les tuiles du plan
        : lv.relic && lv.relic.has(tr.gx + ',' + tr.gy) ? 'ruine'  // ruines : la forêt neuve n'y pousse pas
          : treeBlockedIn(lv.pb, lv.segs, tr.gx, tr.gy) ? 'place'
            : bridgeBlocks((tr.gx + 0.5 + (tr.jx || 0)) * T, (tr.gy + 0.5 + (tr.jy || 0)) * T, T * 0.45) ? 'pont'
              : waterNear(lv, r) ? 'eau' : '';
    r.bake = !why;
    if (why) { const ex = forestBakeStats.exclus || (forestBakeStats.exclus = {}); ex[why] = (ex[why] || 0) + 1; }
    if (r.bake) {
      const bx = Math.floor(tr.gx / WILD_BLOCK), by = Math.floor(tr.gy / WILD_BLOCK);
      // Rang dans la liste de la forêt (blocs en (by, bx), cellules en lignes) : l'ordre
      // du peintre entre deux arbres de même profondeur (tri stable).
      r.o = ((by + 65536) * 131072 + (bx + 65536)) * 1024 + (tr.gy - by * WILD_BLOCK) * WILD_BLOCK + (tr.gx - bx * WILD_BLOCK);
      r.h = mix(mix(mix(mix(mix(mix(2166136261, tr.gx), tr.gy), r.tv), imgId(r.img)), Math.round(r.hpx * 256)), Math.round((r.cx * 4096) % 1e9));
      if (r.foot - r.y0 > lv.hmax) lv.hmax = r.foot - r.y0;
    }
  }
  lv.recs.set(tr, r);
  return r;
}

// L'arbre de la forêt planté en (gx, gy), ou null (une cellule porte au plus un arbre).
function cellTree(L, gx, gy) {
  const bx = Math.floor(gx / WILD_BLOCK), by = Math.floor(gy / WILD_BLOCK);
  const arr = isoWildForestBlockAt(L, bx, by);
  if (!arr || !arr.length) return null;
  let ix = arr._cellIx;
  if (!ix) {
    ix = arr._cellIx = new Int16Array(WILD_BLOCK * WILD_BLOCK).fill(-1);
    for (let i = 0; i < arr.length; i += 1) {
      const t = arr[i];
      ix[(t.gy - by * WILD_BLOCK) * WILD_BLOCK + (t.gx - bx * WILD_BLOCK)] = i;
    }
  }
  const i = ix[(gy - by * WILD_BLOCK) * WILD_BLOCK + (gx - bx * WILD_BLOCK)];
  return i >= 0 ? arr[i] : null;
}

// Les arbres cuits dans la tuile (tx, ty) : toile entière (gouttière comprise), triés
// comme le peintre les poserait.
function tileTrees(lv, tx, ty) {
  const S = lv.S, G = lv.G, hm = lv.hpxMax;
  const rx0 = tx * S - G, ry0 = ty * S - G, rx1 = (tx + 1) * S + G, ry1 = (ty + 1) * S + G;
  // Un pied tombe au plus à une demi-toile de côté et à 0,92 toile sous le haut de sa boîte.
  const c = cellsOfRect(lv, rx0 - hm / 2, ry0 - hm * 0.1, rx1 + hm / 2, ry1 + hm);
  const out = [];
  for (let gy = c.gy0; gy <= c.gy1; gy += 1) {
    for (let gx = c.gx0; gx <= c.gx1; gx += 1) {
      const tr = cellTree(lv.L, gx, gy);
      if (!tr) continue;
      const r = recOf(lv, tr);
      if (!r || !r.bake) continue;
      if (r.x1 <= rx0 || r.x0 >= rx1 || r.y1 <= ry0 || r.y0 >= ry1) continue;
      out.push(r);
    }
  }
  out.sort((a, b) => a.d - b.d || a.o - b.o);
  return out;
}

// L'empreinte de forêt ATTENDUE d'une tuile du niveau (0 : aucun arbre cuit).
export function forestTileSig(lv, tx, ty) {
  const k = tx + ',' + ty;
  let s = lv.sigs.get(k);
  if (s !== undefined) return s;
  const list = tileTrees(lv, tx, ty);
  s = forestSigOf(list.map((r) => r.h), lv.phx, lv.phy);
  lv.sigs.set(k, s);
  return s;
}

// Cuit les arbres de la tuile dans son canevas (`ctx`, repère dpr), par-dessus le sol.
// `cam` = la caméra de cuisson de la tuile (solPyramide.camForTile), `side` = S + 2G.
// Même formule que le peintre (projection.worldToScreen, puis tdx = x − hpx/2,
// tdy = y − 0,92·hpx), plus la phase du canevas d'écran. Rend l'empreinte posée.
export function bakeForestTile(lv, ctx, tx, ty, cam, side) {
  const list = tileTrees(lv, tx, ty);
  const s = forestSigOf(list.map((r) => r.h), lv.phx, lv.phy);
  if (!list.length) return s;
  const z = lv.z, ox = lv.phx / lv.dpr, oy = lv.phy / lv.dpr;
  // État posé à neuf : la cuisson complète (après drawIsoGround) et l'ajout sur une
  // tuile déjà cuite (solPyramideFrame) doivent donner les mêmes octets.
  ctx.save();
  ctx.setTransform(lv.dpr, 0, 0, lv.dpr, 0, 0);
  ctx.imageSmoothingEnabled = false; ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  for (const r of list) {
    const p = treeTileXY(r.fx, r.fy, r.hpx, cam, side, z, ox, oy);
    ctx.drawImage(r.img, p.x, p.y, r.hpx, r.hpx);
  }
  ctx.restore();
  forestBakeStats.cuits += list.length;
  return s;
}

// ── La frame du peintre ─────────────────────────────────────────────────────
// Posé par solPyramideFrame à chaque frame : le niveau, l'étirement, les tuiles
// visibles dont la forêt est à jour, la caméra (pour vérifier que c'est bien CETTE
// frame que le peintre dessine).
let _ground = null;
export function forestBakeNoteGround(g) { _ground = g; }

// Masque d'un arbre (espace tuile, px CSS, dilaté de 2 px : prudent pour un raster
// device au plus proche voisin, à une phase près).
function maskOf(lv, r) {
  if (r.mask) return r.mask;
  const k = imgId(r.img) + ':' + Math.round(r.hpx * 64);
  let m = lv.masks.get(k);
  if (!m) {
    const D = 2, W = Math.ceil(r.hpx) + 2 * D + 1;
    const a = new Uint8Array(W * W);
    try {
      const c = document.createElement('canvas');
      c.width = W; c.height = W;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.imageSmoothingEnabled = false;
      g.drawImage(r.img, D, D, r.hpx, r.hpx);
      const d = g.getImageData(0, 0, W, W).data;
      for (let y = 0; y < W; y += 1) for (let x = 0; x < W; x += 1) {
        if (!d[(y * W + x) * 4 + 3]) continue;
        for (let v = Math.max(0, y - D); v <= Math.min(W - 1, y + D); v += 1) a.fill(1, v * W + Math.max(0, x - D), v * W + Math.min(W - 1, x + D) + 1);
      }
    } catch { a.fill(1); }
    // Les rangées en mots de 32 bits : poser ou tester un arbre sur la couverture de la
    // frame coûte quelques opérations par rangée, pas une par pixel.
    const nw = (W >> 5) + 1, bits = new Uint32Array(W * nw);
    for (let y = 0; y < W; y += 1) for (let x = 0; x < W; x += 1) if (a[y * W + x]) bits[y * nw + (x >> 5)] |= 1 << (x & 31);
    m = { W, D, a, nw, bits };
    lv.masks.set(k, m);
  }
  r.mask = m;
  return m;
}
// LA COUVERTURE des arbres posés par le peintre dans cette frame : un bit par pixel
// d'espace tuile (rangées de mots de 32 bits), sur la vue et une marge. covWalk(…, true)
// y verse le masque d'un arbre, covWalk(…, false) dit si celui d'un autre le recoupe —
// la contagion au masque, en quelques mots par rangée.
let _cov = null;
function covFor(fr) {
  const S = fr.S, v = fr.vis, M = 96;
  const x0 = v.tx0 * S - M, y0 = v.ty0 * S - M;
  const W = (v.tx1 - v.tx0 + 1) * S + 2 * M, H = (v.ty1 - v.ty0 + 1) * S + 2 * M;
  const nw = (Math.ceil(W) >> 5) + 2, n = nw * Math.ceil(H);
  if (!_cov || _cov.length < n) _cov = new Uint32Array(n); else _cov.fill(0, 0, n);
  return { x0, y0, nw, h: Math.ceil(H), w: Math.ceil(W), a: _cov };
}
function covWalk(fr, r, put) {
  const m = maskOf(fr.lv, r), c = fr.cov;
  const mx = Math.round(r.cx - m.D - c.x0), my = Math.round(r.cy - m.D - c.y0);
  if (mx < 0 || my < 0 || mx + m.W + 32 > c.nw * 32 || my + m.W > c.h) return put ? false : true;   // hors couverture : prudent
  const sh = mx & 31, w0 = mx >> 5;
  for (let y = 0; y < m.W; y += 1) {
    const rb = y * m.nw, rc = (my + y) * c.nw + w0;
    for (let k = 0; k < m.nw; k += 1) {
      const v = m.bits[rb + k];
      if (!v) continue;
      const lo = sh ? v << sh : v, hi = sh ? v >>> (32 - sh) : 0;
      if (put) { c.a[rc + k] |= lo; if (hi) c.a[rc + k + 1] |= hi; }
      else if ((c.a[rc + k] & lo) || (hi && (c.a[rc + k + 1] & hi))) return true;
    }
  }
  return false;
}

// Toutes les tuiles VISIBLES que l'arbre touche portent-elles la forêt à jour ?
function tilesFresh(fr, r) {
  const S = fr.S, v = fr.vis;
  for (let ty = Math.max(v.ty0, Math.floor(r.y0 / S)); ty <= Math.min(v.ty1, Math.floor(r.y1 / S)); ty += 1) {
    for (let tx = Math.max(v.tx0, Math.floor(r.x0 / S)); tx <= Math.min(v.tx1, Math.floor(r.x1 / S)); tx += 1) {
      if (!fr.fresh.has((tx + 32768) * 65536 + ty + 32768)) return false;
    }
  }
  return true;
}

// Ouvre la frame du peintre (null : rien de cuit sous cette frame, tout se pose).
// `items` : la liste triée du peintre. Les CANDIDATS (arbres cuits sur des tuiles à
// jour) y sont relevés d'avance : sans candidat, aucune frame — rien à marquer ; avec,
// une marque ne se pose que si elle peut toucher un candidat (cases de 64 px) et
// précède le dernier d'entre eux dans le tri. Le coût suit la forêt, pas la ville.
let _frameId = 0;
// LE JUGEMENT DU REPOS : au cœur d'une ville, les marques coûtent plus que les arbres
// sautés (la contagion en laisse beaucoup posés). La frame d'après, à la même caméra,
// sera la même : on garde le verdict de la dernière (sautés contre coût estimé, cf.
// fbEnd) et on ne repèse qu'au bout de REJUGE frames ou quand la vue change.
const REJUGE = 90;
let _gate = { key: NaN, on: true, until: 0 };
export function forestBakeFrame(T, z, now, items) {
  const g = _ground;
  forestBakeStats.sautes = 0; forestBakeStats.vifs = 0; forestBakeStats.candidats = 0;
  const f = forestBakeStats.forces; f.tuile = 0; f.marque = 0; f.arbre = 0; f.lumiere = 0; f.phase = 0;
  if (!g || !g.lv || g.zoom !== z || g.camX !== CM.cam.x || g.camY !== CM.cam.y || g.cw !== CM.cw || g.ch !== CM.ch) return null;
  // Au repos (s = 1), la caméra doit être sur la grille device : sinon l'origine des
  // tuiles retombe sur l'arrondi d'avant et la phase cuite ne vaut plus.
  if (g.s === 1 && !g.quant) { f.phase += 1; return null; }
  const cell = Math.max(2, FOREST_BAKE.cell | 0);
  const gw = Math.max(1, Math.ceil(CM.cw / cell)), gh = Math.max(1, Math.ceil(CM.ch / cell));
  const CC = 64, cgw = Math.max(1, Math.ceil(CM.cw / CC)), cgh = Math.max(1, Math.ceil(CM.ch / CC));
  const fr = {
    lv: g.lv, s: g.s, z, T, Tz: T * z, offX: g.offX, offY: g.offY, fresh: g.fresh, vis: g.vis, S: g.lv.S,
    cell, gw, gh, grid: new Uint8Array(gw * gh), hmax: g.lv.hmax * g.s + 2,
    CC, cgw, cgh, cand: new Uint8Array(cgw * cgh), dMax: -Infinity, id: ++_frameId,
    cov: null, now,
  };
  let n = 0, nt = 0;
  for (const it of items) {
    if (it.kind !== 'tree') continue;
    const r = fr.lv.recs.get(it.tr);
    if (!r || !r.bake) continue;
    if (!tilesFresh(fr, r)) { nt += 1; continue; }
    r.cand = fr.id; n += 1;
    if (r.d > fr.dMax) fr.dMax = r.d;
    const s = fr.s;
    const i0 = Math.max(0, Math.floor((r.x0 * s + fr.offX) / CC)), i1 = Math.min(cgw - 1, Math.floor((r.x1 * s + fr.offX) / CC));
    const j0 = Math.max(0, Math.floor((r.y0 * s + fr.offY) / CC)), j1 = Math.min(cgh - 1, Math.floor((r.y1 * s + fr.offY) / CC));
    for (let j = j0; j <= j1; j += 1) fr.cand.fill(1, j * cgw + i0, j * cgw + i1 + 1);
  }
  f.tuile = nt; forestBakeStats.candidats = n;
  if (!n || n < FOREST_BAKE.minShare * items.length) return null;
  // Même vue (caméra, zoom, version, candidats) qu'une frame jugée sans profit : rien.
  fr.key = ((CM.cam.x * 4096) ^ (CM.cam.y * 65536) ^ (z * 1e6) ^ n) + items.length * 1e-3;
  if (FOREST_BAKE.juge && _gate.key === fr.key && _gate.lv === fr.lv && !_gate.on && fr.id < _gate.until) { forestBakeStats.juge = 'sans-profit'; return null; }
  forestBakeStats.juge = '';
  fr.n = items.length;
  fr.cov = covFor(fr);
  // Ce qui précède le peintre, posé au-dessus du sol : marqué d'avance.
  // · les coques du fleuve posées par drawIsoShips (fumée et mâts au-dessus, sillage
  //   et halo autour) ;
  for (const sh of CM.ships || []) {
    const h = sh._hull;
    if (!h || h.at !== now) continue;
    markRect(fr, h.bx - 1.5 * fr.Tz, h.by - 3 * fr.Tz, h.bx + h.dw + 1.5 * fr.Tz, h.by + h.dh + fr.Tz);
  }
  // · le halo d'émeute (début de paintIsoItems, même rayon) ;
  if (CM.riotDraw) {
    const c = worldToScreenAt(fr, CM.riotDraw.cx, CM.riotDraw.cy);
    const R = Math.max(1, (1.6 + (state.instability || 0) * 1.4) * fr.Tz) + 2;
    markRect(fr, c.x - R, c.y - R / 2, c.x + R, c.y + R / 2);
  }
  // · la case survolée (drawIsoHoverCell, avant la collecte) : le losange de son emprise.
  const hv = CM.hover;
  if (hv && hv.cell) {
    const p = hv.cell.split(','), t = hv.tile;
    const sx = (t && (t.spanX || t.size)) || 1, sy = (t && (t.spanY || t.size)) || 1;
    const n = worldToScreenAt(fr, +p[0] * T, +p[1] * T), hw = fr.Tz, hh = fr.Tz * 0.5;
    markRect(fr, n.x - sy * hw - 2, n.y - 2, n.x + sx * hw + 2, n.y + (sx + sy) * hh + 2);
  }
  return fr;
}

function worldToScreenAt(fr, wx, wy) {
  return { x: (wx - wy) * fr.z + fr.offX, y: (wx + wy) * 0.5 * fr.z + fr.offY };
}
let _dbgIt = null;
// Le rectangle écran touche-t-il une case où vit un candidat ?
function candHit(fr, x0, y0, x1, y1) {
  const C = fr.CC;
  const i0 = Math.max(0, Math.floor(x0 / C)), i1 = Math.min(fr.cgw - 1, Math.floor(x1 / C));
  const j0 = Math.max(0, Math.floor(y0 / C)), j1 = Math.min(fr.cgh - 1, Math.floor(y1 / C));
  for (let j = j0; j <= j1; j += 1) for (let i = i0; i <= i1; i += 1) if (fr.cand[j * fr.cgw + i]) return true;
  return false;
}
function markRect(fr, x0, y0, x1, y1) {
  if (!candHit(fr, x0, y0, x1, y1)) return;
  if (import.meta.env?.DEV && Array.isArray(globalThis.__forestBakeMarks)) globalThis.__forestBakeMarks.push({ k: _dbgIt ? _dbgIt.kind + (_dbgIt.part ? ':' + _dbgIt.part : '') + '@' + _dbgIt.d : '', x0, y0, x1, y1 });
  const c = fr.cell;
  const i0 = Math.max(0, Math.floor(x0 / c)), i1 = Math.min(fr.gw - 1, Math.floor(x1 / c));
  const j0 = Math.max(0, Math.floor(y0 / c)), j1 = Math.min(fr.gh - 1, Math.floor(y1 / c));
  for (let j = j0; j <= j1; j += 1) fr.grid.fill(1, j * fr.gw + i0, j * fr.gw + i1 + 1);
}
function hasMark(fr, x0, y0, x1, y1) {
  const c = fr.cell;
  const i0 = Math.max(0, Math.floor(x0 / c)), i1 = Math.min(fr.gw - 1, Math.floor(x1 / c));
  const j0 = Math.max(0, Math.floor(y0 / c)), j1 = Math.min(fr.gh - 1, Math.floor(y1 / c));
  for (let j = j0; j <= j1; j += 1) for (let i = i0; i <= i1; i += 1) if (fr.grid[j * fr.gw + i]) return true;
  return false;
}
// La bande utile d'un objet posé : un arbre qui le suit dans le tri a son pied plus bas
// que la clé de l'objet, et sa boîte monte au plus de `hmax` — rien de ce qui est
// au-dessus de (clé − hmax) ne peut le recouvrir. Bas et côtés : ceux de l'objet.
function markBand(fr, d, x0, x1, yBottom, yTop = -Infinity) {
  const top = Math.max(yTop, d === -Infinity ? -Infinity : d * 0.5 * fr.z + fr.offY - fr.hmax);
  if (yBottom < top) return;
  markRect(fr, x0, top, x1, yBottom);
}
// Une emprise de cellules (gx, gy, spanX × spanY) : son losange, ± `padT` tuiles.
function markFoot(fr, gx, gy, sx, sy, d, padT) {
  const T = fr.T, n = worldToScreenAt(fr, gx * T, gy * T), hw = fr.Tz, hh = fr.Tz * 0.5, p = padT * fr.Tz + 1;
  markBand(fr, d, n.x - sy * hw - p, n.x + sx * hw + p, n.y + (sx + sy) * hh + p);
}
function markAround(fr, d, wx, wy, halfT, downT) {
  const p = worldToScreenAt(fr, wx, wy), h = halfT * fr.Tz + 1;
  markBand(fr, d, p.x - h, p.x + h, p.y + downT * fr.Tz + 1);
}

// Un arbre posé par le peintre : gardé pour la contagion (par son masque) — s'il peut
// toucher un candidat.
function noteLive(fr, tr) {
  const lv = fr.lv;
  let r = lv.recs.get(tr);
  if (!r) {
    r = lv.geos.get(tr);
    if (r === undefined) { r = geomOf(lv, tr); lv.geos.set(tr, r); }
  }
  forestBakeStats.vifs += 1;
  if (!r) {
    // Sans image (repli procédural) : une boîte large autour du pied.
    const fx = (tr.gx + 0.5 + (tr.jx || 0)) * fr.T, fy = (tr.gy + 0.9 + (tr.jy || 0)) * fr.T;
    markAround(fr, fx + fy, fx, fy, 2.5, 0.5);
    return;
  }
  const s = fr.s;
  if (!candHit(fr, r.x0 * s + fr.offX, r.y0 * s + fr.offY, r.x1 * s + fr.offX, r.y1 * s + fr.offY)) return;
  covWalk(fr, r, true);
}

// Sonde de mise au point (dev, globalThis.__forestBakeDebug = []) : chaque arbre jugé.
function noteDebug(fr, r, why) {
  const s = fr.s;
  if (import.meta.env?.DEV && Array.isArray(globalThis.__forestBakeDebug)) {
    globalThis.__forestBakeDebug.push({ vif: why, gx: r.tr.gx, gy: r.tr.gy, d: r.d,
      x0: r.x0 * s + fr.offX, y0: r.y0 * s + fr.offY, x1: r.x1 * s + fr.offX, y1: r.y1 * s + fr.offY,
      cx: r.cx * s + fr.offX, cy: r.cy * s + fr.offY, hpx: r.hpx * s, img: r.img });
  }
}

// L'arbre peut-il être SAUTÉ (déjà cuit dans le sol, et rien de posé ne le recouvre) ?
// Sinon il est noté comme posé : l'appelant le pose.
export function fbTree(fr, tr) {
  const lv = fr.lv, r = lv.recs.get(tr), f = forestBakeStats.forces;
  // Hors candidats (pas cuit, ou une tuile visible pas à jour, cf. forestBakeFrame) : posé.
  if (!r || r.cand !== fr.id) {
    noteLive(fr, tr);
    if (import.meta.env?.DEV && Array.isArray(globalThis.__forestBakeDebug)) {
      const q = r || lv.geos.get(tr);
      if (q) noteDebug(fr, q, !r ? 'horsForet' : r.bake ? 'tuile' : 'exclu');
    }
    return false;
  }
  let why = '';
  const s = fr.s;
  // 1. Rien de marqué sous sa boîte.
  if (hasMark(fr, r.x0 * s + fr.offX, r.y0 * s + fr.offY, r.x1 * s + fr.offX, r.y1 * s + fr.offY)) why = 'marque';
  // 2. Pas de lumière déposée qu'il aurait découpée (même garde que lightCutImage).
  if (!why) {
    const x = r.cx * s + fr.offX, y = r.cy * s + fr.offY, w = r.hpx * s;
    if (lightWouldCut(x, y, x + w, y + w)) why = 'lumiere';
  }
  // 3. Aucun arbre posé avant lui ne le recouvre (contagion, au masque).
  if (!why && covWalk(fr, r, false)) why = 'arbre';
  if (import.meta.env?.DEV && Array.isArray(globalThis.__forestBakeDebug)) noteDebug(fr, r, why || 'saute');
  if (why) { f[why] += 1; noteLive(fr, tr); return false; }
  forestBakeStats.sautes += 1;
  return true;
}

// Fin de la boucle du peintre : le verdict de la frame. Le profit d'un arbre sauté (une
// pose, son ombre et sa découpe : ~4 µs en rendu logiciel) contre le coût des marques
// (~0,25 µs par objet de la liste) et de l'examen d'un candidat (~1 µs).
export function fbEnd(fr) {
  const gain = forestBakeStats.sautes * 4, cost = fr.n * 0.25 + forestBakeStats.candidats;
  _gate = { key: fr.key, lv: fr.lv, on: gain > cost, until: fr.id + REJUGE };
}

// Un objet que le peintre va poser (avant lui dans le tri) : sa bande utile, marquée.
// Boîtes PRUDENTES par genre ; un genre inconnu marque tout l'écran (jamais faux :
// les arbres qui le suivent sont simplement posés).
export function fbMark(fr, it) {
  const T = fr.T, Tz = fr.Tz, d = it.d;
  if (d > fr.dMax) return;              // plus aucun candidat après lui dans le tri
  if (import.meta.env?.DEV) _dbgIt = it;
  switch (it.kind) {
    case 'tile': case 'smoke': case 'crisissmoke': case 'revealpin': {
      const t = it.t;
      const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
      // Le port riverain pose son ponton dans le fleuve ; une scène peut déborder son
      // losange ; la fumée dérive.
      const pad = t.buildingId === 'river_ports' ? 3 : it.kind === 'tile' ? 1 : 1.5;
      markFoot(fr, t.gx, t.gy, sx, sy, d, pad);
      return;
    }
    case 'critter': { const cr = it.cr; markAround(fr, d, (cr.gx + 0.5 + cr.jx) * T, (cr.gy + 0.5 + cr.jy) * T, 1, 0.5); return; }
    case 'vie': case 'elev': {
      const v = it.v;
      if (v && v.wx != null) markAround(fr, d, v.wx, v.wy, 2.5, 1.5);
      else markRect(fr, 0, 0, CM.cw, CM.ch);
      return;
    }
    case 'cit': case 'riot': markAround(fr, d, it.gwx, it.gwy, 1, 0.75); return;
    case 'veh': markAround(fr, d, it.gwx, it.gwy, 2.5, 1); return;
    case 'plazaProp': { const a = it.art; markAround(fr, d, a.wx, a.wy, 1.5, 0.75); return; }
    case 'campHearth': markAround(fr, d, it.wx, it.wy, 2.5, 2); return;
    case 'lamp': {
      const p = worldToScreenAt(fr, it.wx, it.wy), b = lampBox(it.art, Tz), h = Math.max(b.wpx, Tz) + 1;
      markBand(fr, d, p.x - h, p.x + h, p.y + 0.5 * Tz + 1);
      return;
    }
    case 'fence': {
      const st = it.art, p = worldToScreenAt(fr, it.wx, it.wy), k = Tz / st.cw;
      const x0 = st.right ? p.x : p.x - st.cw * k, y0 = p.y - st.panelH * k;
      markBand(fr, d, x0 - 1, x0 + st.cw * k + 1, y0 + st.ch * k + 1, y0 - 1);
      return;
    }
    case 'relic': markBand(fr, d, it.x - 1, it.x + it.r.w * fr.z + 1, it.y + it.r.h * fr.z + 1, it.y - 1); return;
    case 'plaisirs': {
      const b = CM._plaisirsBox, p = 1.5 * Tz;
      if (b) markBand(fr, d, b.dx - p, b.dx + b.dw + p, b.dy + b.dh + p, b.dy - p);
      return;
    }
    case 'wonderSeg': case 'bridgeSeg': {
      const b = it.kind === 'wonderSeg' ? wonderSegScreenBox(it) : bridgeSegScreenBox(it);
      if (b) markBand(fr, d, b.x0 - Tz, b.x1 + Tz, b.y1 + Tz, b.y0 - Tz);
      else markRect(fr, 0, 0, CM.cw, CM.ch);
      return;
    }
    case 'fleetShip': {
      const P = it.sh && it.sh._defer;
      if (P && P.wx != null) markAround(fr, d, P.wx, P.wy, 3, 1.5);
      else markRect(fr, 0, 0, CM.cw, CM.ch);
      return;
    }
    case 'porter': markAround(fr, d, it.q.x * T, it.q.y * T, 1, 0.75); return;
    case 'terroirTeam': { const q = it.team; if (q) markAround(fr, d, q.x * T, q.y * T, 2, 1); else markRect(fr, 0, 0, CM.cw, CM.ch); return; }
    case 'fleetScene': {
      const x = it.x != null ? it.x : it.P && it.P.x, y = it.y != null ? it.y : it.P && it.P.y;
      if (x != null) markAround(fr, d, x * T, y * T, 3, 2);
      else markRect(fr, 0, 0, CM.cw, CM.ch);
      return;
    }
    default: markRect(fr, 0, 0, CM.cw, CM.ch);
  }
}

if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__forestBake = (o) => {
    if (o && typeof o === 'object') Object.assign(FOREST_BAKE, o);
    else if (o === false) FOREST_BAKE.on = false;
    else if (o === true) FOREST_BAKE.on = true;
    return { ...FOREST_BAKE, stats: JSON.parse(JSON.stringify(forestBakeStats)) };
  };
}
