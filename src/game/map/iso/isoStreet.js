// LA RUE — ce qui s'y dresse, et ce qui l'éclaire.
//
// Extraite d'isoRenderer.js le 2026-08-23 (Q10). Un seul système, malgré les cinq
// bandeaux qu'il occupait dans le fichier :
//   · les LAMPADAIRES — pose par ère, métrique de pied, flamme et phase ;
//   · le MOBILIER de trottoir et les bacs des terre-pleins, qu'ils surplombent ;
//   · la NUIT — voile bleu, reflets de la ville sur l'eau, halos et flaques de
//     lumière composés dans la couche dédiée.
// Le troisième existe POUR les deux premiers : sans lampadaire, la nuit n'aurait
// rien à allumer.
//
// ⚠ EXTRACTION PURE — AUCUN PIXEL NE CHANGE. Couture mesurée avant la coupe :
// ZÉRO dépendance entrante, seize sortantes. Vérifiée ligne à ligne contre la
// version commitée.
//
// ⚠ IL A FALLU SORTIR LA VOIRIE D'ABORD. Ces six cents lignes ne tenaient au
// peintre que par `isoRoadHalfW`, `ROAD_DETAIL` et `SIDEWALK_ISO` — de la CONFIG,
// partie le même jour dans isoRoad.js. Cinquième fois qu'une feuille libère un gros
// bloc ; à ce stade ce n'est plus une coïncidence, c'est la méthode.
//
// ⚠ Ce module est le PENDANT d'isoRoad : là-bas la chaussée elle-même (largeurs,
// tons, trottoir), ici ce qui se dresse le long et la lumière qui tombe dessus.
import { CM, cmHash, ROAD_E, ROAD_N, ROAD_S, ROAD_W } from '../layout.js';
import { worldToScreen, visibleCellBounds } from './projection.js';
import { paintFlameGlows } from '../flameGlow.js';
import { paintLightLayer } from '../lightLayer.js';
import { ensureQuayGate } from '../quaysAndRiot.js';
import { isoArt } from './isoArt.js';
import { builtCells, builtNear, COUR, courOf } from './isoTissu.js';
import { isoRoadHalfW, ROAD_DETAIL, SIDEWALK_ISO } from './isoRoad.js';
import { WATER_FILL, riverRibbonPath } from './isoRiver.js';
import { plazaEraForBand, isoPlazaLamps } from './isoPlaza.js';
import { STREET_PROPS, computeStreetProps } from './isoStreetProps.js';
// Le TERRE-PLEIN planté est arrivé ici le 2026-08-23, en venant de drawIsoGround :
// sa config (MEDIAN_TUNE, BED_PALETTES, medianSlots) vivait déjà dans ce module.
import { WINTER } from '../seasonMode.js';
import { SEASON_GRASS } from './isoGroundDetail.js';
import { rgb } from './isoPalette.js';

// ── NUIT : voile bleu puis halos des lampadaires ────────────────────────────
// Lit CM.nightF (cycle jour/nuit du runtime, forcé par les captures). Lumières
// APRÈS le voile (même ordre que le legacy). Plafonné pour la perf.
//
// FENÊTRES ALLUMÉES DES HABITATIONS : tentées le 2026-07-22, RETIRÉES. Les
// bâtiments-moteur peignent leurs carreaux dans leurs propres sprites
// (cityEngineSprites, engineSprites) et le repli procédural legacy des maisons
// aussi (buildingShapes) ; en iso les habitations sont des PNG sans lumière, et
// poser les carreaux « au jugé » sur la boîte du sprite les place mal — les
// façades ne sont pas au même endroit d'une variante à l'autre. À reprendre avec
// un CALIBRAGE SPRITE PAR SPRITE (position des ouvertures dans l'art, comme
// lampFootMetrics le fait pour la tête des mâts), pas avec des fractions de
// boîte. Le plafond de dessin devra rester un TIRAGE RÉPARTI : couper « les N
// premières » de l'ordre du layout allume un quartier et laisse le voisin noir.
// ── LAMPADAIRES par ère (retour Raph : points lumineux ANCRÉS aux mâts) ──────
// Liste déterministe par layout : cellules-route TRAVERSANTES (pas carrefour,
// pas pont, pas place), 1 sur 3, côté de chaussée par RUE. band ≥ 2 : pas de
// lampadaires aux stades primitifs (cohérence demandée). Sprites
// /pixelart/iso/lamp-{antique|gas|electric|energy}.png, posés au PEINTRE
// (drawIsoLive) ; la nuit, le halo se dessine À LA TÊTE de chaque mât.
let _isoLampCache = { at: -1, key: '', lamps: null };
export function isoLamps(L, band) {
  if (band < 2 || !L.roadMap) return [];
  // Les mâts de la PLACE viennent d'isoPlaza (computeIsoLamps saute les cellules
  // 'plaza' : la place était éclairée par son PNG). Même format → ils héritent
  // des sprites d'ère, des halos, du vacillement et du LOD sans une ligne de
  // plus ici. La clé de cache porte leur nombre : changer __plaza({mode}) ou une
  // recette doit rallumer ou éteindre la place sans recharger la page.
  const plazaLamps = isoPlazaLamps(L, band);
  const key = CM.layoutRecomputeAt + ':' + plazaLamps.length;
  if (_isoLampCache.key === key && _isoLampCache.lamps) return _isoLampCache.lamps;
  // ON N'ÉCLAIRE PAS LE VIDE. Même règle que le trottoir : une voie sans aucune
  // façade sur ses huit voisines n'est pas une rue, et un mât allumé au milieu
  // de rien est le signal le plus visible du défaut — de nuit, c'est même le
  // seul qu'on voie. Filtré ICI et pas dans `computeIsoLamps` : le corps pur
  // reste testable sans layout bâti.
  const lamps = computeIsoLamps(L, CM.TILE)
    .filter((lp) => builtNear(L, lp.gx, lp.gy))
    .concat(plazaLamps);
  _isoLampCache = { at: CM.layoutRecomputeAt, key, lamps };
  return lamps;
}
// Corps PUR (exporté pour les tests) : positions + PROFONDEUR peintre de chaque mât.
// La clé d'un mât n'est PAS toujours wx+wy de son pied : côté 0.14 (bord nord/ouest
// de chaussée), le mât se dresse DEVANT la façade sud (route horizontale) ou est
// (route verticale) du bâtiment MITOYEN, mais son pied a une profondeur plus PETITE
// que le coin sud de l'empreinte — la clé des socles (cf. drawIsoLive) — donc le
// peintre l'AVALAIT (116 mâts sur 339 en ville band 4). On aligne sa clé juste
// devant ce bâtiment. Côté 0.86 le bâtiment mitoyen est au sud/est du mât → le mât
// est derrière lui, l'ordre naturel wx+wy est déjà le bon.
// Mât posé sur la COUTURE d'un terre-plein : il partage la bande avec les slots
// plantés (medianSlots). S'il tombe à moins d'une demi-tuile d'un bac/buisson,
// on le GLISSE le long de l'axe au MILIEU de l'intervalle libre le plus proche
// (à 0.625 T des deux slots voisins) — « les lampadaires dessus j'aime bien
// mais il ne faut pas que ça chevauche les plantes » (Raph 2026-08-03).
// `w` = coordonnée monde LE LONG de l'axe du segment (wx pour h, wy pour v).
function lampSlideClear(seg, T, w) {
  const ext = MEDIAN_TUNE.ext * T;
  const horiz = seg.axis === 'h';
  const a = (horiz ? seg.x0 : seg.y0) * T - ext;
  const len = ((horiz ? seg.x1 - seg.x0 : seg.y1 - seg.y0) + 1) * T + 2 * ext;
  const P = T * 1.25, margin = T * 0.62;
  const t = w - a;
  const nSlots = Math.floor((len - 2 * margin) / P) + 1;
  if (nSlots <= 0) return w;
  const i = Math.max(0, Math.min(nSlots - 1, Math.round((t - margin) / P)));
  const ts = margin + i * P;
  if (Math.abs(t - ts) >= T * 0.5) return w;    // assez loin du slot : rien à faire
  const cand = [];
  if (ts - P / 2 >= T * 0.25) cand.push(ts - P / 2);
  if (ts + P / 2 <= len - T * 0.25) cand.push(ts + P / 2);
  if (!cand.length) return w;
  cand.sort((u, v) => Math.abs(u - t) - Math.abs(v - t));
  return a + cand[0];
}
export function computeIsoLamps(L, T) {
  const lamps = [];
  const solid = isoSolidSouthCorners(L, T);
  // Index des coutures plantées par rangée/colonne, pour repérer en O(1) les
  // mâts qui se plantent SUR une bande de terre-plein.
  const tpH = new Map(), tpV = new Map();
  for (const sg of (L.terrePlein || [])) {
    if (sg.axis === 'h') { if (!tpH.has(sg.y)) tpH.set(sg.y, []); tpH.get(sg.y).push(sg); }
    else { if (!tpV.has(sg.x)) tpV.set(sg.x, []); tpV.get(sg.x).push(sg); }
  }
  for (const c of L.roadMap.values()) {
    if (c.roadSurface === 'bridge' || c.rank === 'plaza') continue;
    const mask = c.mask | 0;
    const thH = !!((mask & ROAD_E) && (mask & ROAD_W));
    const thV = !!((mask & ROAD_S) && (mask & ROAD_N));
    if (thH === thV) continue;                    // carrefour / impasse : pas de mât
    // LES SENTIERS NE S'ÉCLAIRENT PAS (lot L6). Un mât tous les 3 tronçons sur
    // CHAQUE voie, sentiers de desserte compris, revenait à poser une marque
    // régulière sur tout le maillage : le lampadaire soulignait la grille qu'on
    // cherche à effacer, et le rang `path` est de loin le plus nombreux du réseau
    // (147 sentiers contre 462 rues sur la ville de mesure). Une venelle non
    // éclairée est en plus la bonne lecture : on éclaire les rues, pas les
    // arrière-cours. Molette `__lampTune({paths:true})` pour rejouer l'ancien.
    if (!LAMP_TUNE.paths && c.rank === 'path') continue;
    const step = Math.max(1, LAMP_TUNE.step | 0);
    if (((c.gx + c.gy) % step) !== 0) continue;   // espacement le long de la rue
    // Côté de chaussée CONSTANT le long d'une même rue (hash par RUE, pas par
    // cellule) : les mâts forment une ligne continue au lieu de zigzaguer.
    // Le mât se plante DANS LE TROTTOIR (les 20% extérieurs de la cellule hors
    // chaussée : ROAD_BAND=0.30 → chaussée = 0.20..0.80) à CURB du bord de cellule.
    // 0.14/0.86 collait le socle au ras de la chaussée → il « dépassait sur la
    // route » (Raph) ; CURB petit recule le socle ET les bras au sec.
    const CURB = LAMP_TUNE.curb;
    const side = (cmHash(thH ? 'lmp:h:' + c.gy : 'lmp:v:' + c.gx) & 1) ? 1 - CURB : CURB;
    let wx = (thH ? c.gx + 0.5 : c.gx + side) * T;
    let wy = (thH ? c.gy + side : c.gy + 0.5) * T;
    // Ce côté de trottoir est-il la COUTURE d'un terre-plein ? (side ~1 → couture
    // au sud/est de la cellule = seg à c.gy/c.gx ; side ~0 → couture au nord/ouest
    // = seg à c.gy-1/c.gx-1.) Si oui, glisser le mât entre les plantes.
    if (thH) {
      const cy = side > 0.5 ? c.gy : c.gy - 1;
      for (const sg of (tpH.get(cy) || [])) {
        if (c.gx < sg.x0 || c.gx > sg.x1) continue;
        wx = lampSlideClear(sg, T, wx);
        break;
      }
    } else {
      const cx = side > 0.5 ? c.gx : c.gx - 1;
      for (const sg of (tpV.get(cx) || [])) {
        if (c.gy < sg.y0 || c.gy > sg.y1) continue;
        wy = lampSlideClear(sg, T, wy);
        break;
      }
    }
    let d = wx + wy;
    if (side < 0.5) {
      const bd = solid.get(thH ? c.gx + ':' + (c.gy - 1) : (c.gx - 1) + ':' + c.gy);
      if (bd != null && bd + 1 > d) d = bd + 1;   // +1 px monde : juste devant le socle
    }
    lamps.push({ wx, wy, gx: c.gx, gy: c.gy, d });
  }
  return lamps;
}
// ── MOBILIER DE TROTTOIR (bancs, bacs, corbeilles) ───────────────────────────
// La POSE vit dans isoStreetProps.js (corps pur, testable) ; ici on lui donne
// la géométrie de rue et on met le résultat en cache. Les callbacks sont la
// SEULE source de vérité — pas une copie des largeurs — donc régler
// __sidewalkIso({w}) ou la hiérarchie des rangs déplace le mobilier avec le
// trottoir, et un trottoir éteint n'a pas de mobilier orphelin.
let _streetPropCache = { key: '', props: null };
export const streetPropEra = (band) => plazaEraForBand(band);
export function isoStreetPropsFor(L, band) {
  if (!L || !L.roadMap) return [];
  const key = CM.layoutRecomputeAt + ':' + band + ':' + STREET_PROPS.rev
    + ':' + (SIDEWALK_ISO.on ? 1 : 0) + ':' + SIDEWALK_ISO.w + ':' + SIDEWALK_ISO.curb
    + ':' + (COUR.on ? 1 : 0) + ':' + LAMP_TUNE.step;
  if (_streetPropCache.key === key && _streetPropCache.props) return _streetPropCache.props;
  const T = CM.TILE;
  // Le trottoir DESSINÉ décide : même test que le bake (cellule urbaine dont le
  // sol n'est pas retombé en cour ou en friche), sans quoi on meublerait un
  // chemin de terre.
  const courK = COUR.on && COUR.sidewalk ? courOf(L) : null;
  const props = (SIDEWALK_ISO.on && band >= SIDEWALK_ISO.minBand)
    ? computeStreetProps(L, T, {
      band,
      innerOf: (rank) => isoRoadHalfW(rank) + ROAD_DETAIL.groove + SIDEWALK_ISO.curb,
      outerOf: (rank) => isoRoadHalfW(rank) + SIDEWALK_ISO.w,
      isSidewalk: (gx, gy) => {
        const k = gx + ',' + gy;
        if (!L.urbanSet || !L.urbanSet.has(k)) return false;
        if (courK && (courK.get(k) || 'urban') !== 'urban') return false;
        // Même règle que le trottoir lui-même : pas de façade, pas de mobilier.
        return builtNear(L, gx, gy);
      },
      lamps: isoLamps(L, band),
      solidSouth: isoSolidSouthCorners(L, T),
      isBuilt: (gx, gy) => builtCells(L).has(gx + ',' + gy),
    })
    : [];
  _streetPropCache = { key, props };
  // Diagnostic : le compte ET la liste (le compte seul ne dit pas OÙ, et
  // « il n'y en a pas assez » se tranche en regardant les positions).
  CM._streetProps = props;
  if (typeof window !== 'undefined') window.__streetPropsCount = props.length;
  return props;
}

// Coin SUD (clé peintre, px monde wx+wy) de chaque cellule couverte par un bâtiment
// DEBOUT. Les empreintes à plat (champs) trient au coin nord comme le sol → exclues.
// (Une exception « aqueduc » vivait ici — la conduite se rendait en TRANCHES, donc
//  coin sud LOCAL par colonne. Devenue un point d'eau 1×1, elle n'a plus de colonnes
//  et retombe sur le cas commun, où dCell vaut exactement dSouth.)
function isoSolidSouthCorners(L, T) {
  const m = new Map();
  for (const t of (L.tiles || [])) {
    const idf = t.buildingId || t.variant || '';
    if (/field|farm|crop|orchard/i.test(idf)) continue;
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    const dSouth = ((t.gx + sx) + (t.gy + sy)) * T;
    for (let ix = 0; ix < sx; ix += 1) {
      for (let iy = 0; iy < sy; iy += 1) m.set((t.gx + ix) + ':' + (t.gy + iy), dSouth);
    }
  }
  return m;
}
export const lampEraForBand = (band) => (band >= 7 ? 'energy' : band >= 6 ? 'electric' : band >= 4 ? 'gas' : 'antique');
// v3 = antique & gas refaits en VRAI 3/4 iso high top-down 64×128 (les v2 étaient
// vus DE FACE, retour Raph 2026-07-13) ; electric/energy v2 gardés (mâts ronds,
// invariants à l'angle). Cache-buster : ces PNG sont RÉÉCRITS sur disque → sans
// query, des navigateurs resservent l'ancien depuis le cache HTTP. Incrémenter
// à chaque réécriture.
export const LAMP_V = 3;
// Taille & pose des mâts (retour Raph : « trop gros, et n'ont pas de pieds ») :
// h = hauteur VISIBLE en tuiles, mesurée sur le CONTENU opaque du PNG (les 4
// sprites ont 4 à 13 % de marge → même taille apparente aux 4 ères) ; 1.15 les
// faisait culminer à hauteur de maison. Le PIED (centre de masse des dernières
// rangées opaques — le col de cygne electric penche : le pied est à 39 % du
// canvas, pas au centre) se plante PILE sur le point d'ancrage, à même le sol
// (l'ombre de contact elliptique a été essayée puis RETIRÉE, retour Raph).
// headF = hauteur de la tête lumineuse (halo). curb = recul du pied depuis le bord
// de cellule (fraction de tuile) : plante le mât dans le trottoir, hors chaussée.
// Molette : __lampTune({ h, headF, curb }).
// step : espacement des mâts en cellules le long d'une rue. paths : un sentier
// s'éclaire-t-il ? (lot L6 de docs/PLAN-TISSU-URBAIN.md — voir computeIsoLamps.)
export const LAMP_TUNE = { h: 0.8, headF: 0.8, curb: 0.05, step: 3, paths: false };
if (typeof window !== 'undefined') {
  window.__lampTune = (o) => {
    if (o) Object.assign(LAMP_TUNE, o);
    _isoLampCache = { at: -1, key: '', lamps: null };   // step/paths repeuplent la liste
    return { ...LAMP_TUNE };
  };
}
// Métriques de pied mémoïsées par sprite (fractions du canvas) — même idiome
// canvas-scan que isoTileBBox, plus le centre de masse des 4 rangées basses.
export function lampFootMetrics(e) {
  if (e._foot) return e._foot;
  const img = e.img, w = img && img.naturalWidth, h = img && img.naturalHeight;
  if (!w || !h) return null;
  let c;
  if (typeof OffscreenCanvas !== 'undefined') c = new OffscreenCanvas(w, h);
  else { c = document.createElement('canvas'); c.width = w; c.height = h; }
  c.width = w; c.height = h;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.imageSmoothingEnabled = false;
  cx.drawImage(img, 0, 0);
  let data = null;
  try { data = cx.getImageData(0, 0, w, h).data; } catch { /* canvas souillé : repli */ }
  let m = { footXf: 0.5, footYf: 0.97, usedHf: 0.92 };
  if (data) {
    let y0 = h, y1 = -1;
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
      if (data[(y * w + x) * 4 + 3] > 16) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (y1 >= 0) {
      let sx = 0, n = 0;
      for (let y = Math.max(y0, y1 - 3); y <= y1; y += 1) for (let x = 0; x < w; x += 1) {
        if (data[(y * w + x) * 4 + 3] > 16) { sx += x + 0.5; n += 1; }
      }
      m = { footXf: n ? sx / n / w : 0.5, footYf: (y1 + 1) / h, usedHf: (y1 - y0 + 1) / h };
    }
  }
  e._foot = m;
  return m;
}
// Terre-plein « comme la place » (2026-08-03, après rejet de la bande sprite
// 3-slice « étirée, peu de relief ») : le SOL est une capsule d'herbe bakée
// (voir drawIsoGround), les buissons du jeu se posent PAR-DESSUS au peintre.
// ext = ajustement des bouts (fraction de tuile MONDE de chaque côté). Depuis la
// capsule à bouts RONDS, l'arrondi (wtp 0.26) dépasse déjà du segment : l'ancien
// prolongement 0.32 hérité des bouts droits 3-slice envoyait la pointe à 0.58 T
// dans la cellule voisine — elle mordait trottoir et pavé (« pourquoi dépasse-t-il
// sur le sol ? », Raph). ext NÉGATIF = léger retrait : pointe à ~0.21 T, sur le
// trottoir de la transversale, jamais sur sa chaussée ni sur le sol.
export const MEDIAN_TUNE = { ext: -0.05 };
if (typeof window !== 'undefined') {
  window.__medianExt = (v) => { if (typeof v === 'number') MEDIAN_TUNE.ext = v; return MEDIAN_TUNE.ext; };
}
// Palettes de PARTERRES du terre-plein (réfs municipales de Raph 2026-08-03) :
// massifs à DOMINANTE (jaune/orange, rouge/rose, lavande, mix) + blanc d'accent,
// tirés par hash de slot — deux parterres voisins n'ont pas la même robe.
export const BED_PALETTES = [
  [[244, 216, 102], [232, 168, 72], [240, 242, 228]],   // jaune / orange
  [[224, 104, 96], [236, 152, 178], [240, 242, 228]],   // rouge / rose
  [[184, 148, 216], [150, 132, 220], [240, 242, 228]],  // lavande / violet
  [[244, 216, 102], [224, 104, 96], [184, 148, 216]],   // mix vif
];
// Slots décoratifs du terre-plein : PARTERRE (dessiné au bake) et BUISSON (item
// du peintre) alternés le long de la couture, période fixe. Les deux passes
// lisent CETTE liste — même géométrie, même hash, zéro chevauchement.
export function medianSlots(seg, T) {
  const ext = MEDIAN_TUNE.ext * T;
  let ax, ay, ux, uy, len;
  if (seg.axis === 'h') {
    ax = seg.x0 * T - ext; ay = (seg.y + 1) * T;
    ux = 1; uy = 0; len = (seg.x1 + 1) * T + ext - ax;
  } else {
    ax = (seg.x + 1) * T; ay = seg.y0 * T - ext;
    ux = 0; uy = 1; len = (seg.y1 + 1) * T + ext - ay;
  }
  const out = [];
  const P = T * 1.25, margin = T * 0.62;    // 1er slot passé l'arrondi du bout
  const key = seg.axis + ':' + (seg.axis === 'h' ? seg.y + ':' + seg.x0 : seg.x + ':' + seg.y0);
  for (let t = margin, i = 0; t <= len - margin; t += P, i += 1) {
    out.push({ kind: (i & 1) ? 'bush' : 'bed', wx: ax + ux * t, wy: ay + uy * t, h: cmHash('tps:' + key + ':' + i) });
  }
  return out;
}
if (typeof window !== 'undefined') window.__medianSlots = medianSlots;   // sonde dev
// ── FLAMMES & LUMIÈRES DES LAMPADAIRES (animées) ─────────────────────────────
// Chaque ère a sa/ses source(s) lumineuse(s), repérées en FRACTION du canvas du
// sprite (fx depuis la gauche du sprite dessiné, fy depuis le haut) — mesurées sur
// les pixels chauds des PNG. hx/hy = tête « moyenne » (halo ambiant + flaque au
// sol). style pilote le scintillement ; day = visibilité DIURNE (une torche brûle
// de jour ; le gaz/électrique ne « s'allument » qu'à la nuit). col = teinte RGB.
const LAMP_LIGHTS = {
  antique:  { style: 'fire',   col: '255,186,84',  day: 0.5,  hx: 0.49, hy: 0.13, em: [{ fx: 0.49, fy: 0.12, r: 0.30 }] },
  gas:      { style: 'gas',    col: '255,201,120', day: 0.12, hx: 0.48, hy: 0.20, em: [{ fx: 0.32, fy: 0.20, r: 0.20 }, { fx: 0.635, fy: 0.20, r: 0.20 }] },
  electric: { style: 'steady', col: '240,246,232', day: 0.14, hx: 0.64, hy: 0.19, em: [{ fx: 0.64, fy: 0.19, r: 0.24 }] },
  energy:   { style: 'pulse',  col: '150,230,255', day: 0.45, hx: 0.50, hy: 0.17, em: [{ fx: 0.50, fy: 0.17, r: 0.30 }] },
};
// Réglage live : __lampLight({ on, gain }). gain multiplie toute l'intensité.
const LAMP_LIGHT = { on: true, gain: 1 };
if (typeof window !== 'undefined') {
  window.__lampLight = (o) => { if (o) Object.assign(LAMP_LIGHT, o); return { ...LAMP_LIGHT }; };
}
// Scintillement ∈ [~0.4 .. 1], déterministe (now ms + phase par mât) : feu nerveux
// (somme de sinus déphasés), gaz plus calme, néon = respiration lente, électrique
// = quasi fixe (micro-tremble). Le déterminisme garde les captures reproductibles.
function lampFlicker(style, now, ph) {
  const t = now || 0;
  if (style === 'fire') {
    const a = 0.55 * Math.sin(t * 0.013 + ph) + 0.30 * Math.sin(t * 0.029 + ph * 1.7) + 0.15 * Math.sin(t * 0.047 + ph * 2.3);
    return 0.72 + 0.28 * a;
  }
  if (style === 'gas') {
    const a = 0.7 * Math.sin(t * 0.006 + ph) + 0.3 * Math.sin(t * 0.017 + ph * 1.4);
    return 0.86 + 0.14 * a;
  }
  if (style === 'pulse') return 0.7 + 0.3 * Math.sin(t * 0.0035 + ph);
  return 0.96 + 0.04 * Math.sin(t * 0.02 + ph);   // steady
}
const lampPhase = (lp) => ((lp.gx * 73 + lp.gy * 179) % 628) / 100;
// Glow radial additif (le contexte doit être en composite 'lighter').
//
// ⚠ GARDES ÉCRITES EN NÉGATIF, et ce n'est pas un tic de style : toute
// comparaison avec NaN est FAUSSE, donc `alpha <= 0.004 || r < 0.6` laissait
// passer un rayon NaN jusqu'à createRadialGradient, qui JETTE — frame perdue,
// carte figée. C'est arrivé pour une phase de scintillement calculée sur un
// gx/gy absent. Sous cette forme, NaN ressort ici.
//
// (Remplacer ce dégradé par un disque pré-cuit blité a été mesuré comme un gain
// NUL : 290 dégradés = 0,7 ms de jour, 1 001 = 1,7 ms de nuit, quand un blit
// coûte ~5 µs pièce. Ne pas y retourner — cf. le relevé du profileur de frame.)
export function addGlow(ctx, x, y, r, col, alpha) {
  if (!(alpha > 0.004) || !(r >= 0.6) || !Number.isFinite(x) || !Number.isFinite(y)) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${col},${alpha.toFixed(3)})`);
  g.addColorStop(1, `rgba(${col},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

// Molette DA du voile de nuit et des transitions : window.__nightVeil({ mulA: .5, … })
// pour ajuster en live. mulCol/mulA = teinte « heure bleue » (multiply), darkCol/darkA
// = voile sombre résiduel, duskCol/dawnCol/warmA = pics chauds de crépuscule/aube.
const NIGHT_VEIL = {
  mulCol: '96,124,224', mulA: 0.58,
  darkCol: '8,11,26', darkA: 0.30,
  duskCol: '255,120,50', dawnCol: '255,170,90', warmA: 0.22
};
if (typeof window !== 'undefined') {
  window.__nightVeil = (o) => { if (o) Object.assign(NIGHT_VEIL, o); return { ...NIGHT_VEIL }; };
}

/* ── REFLETS NOCTURNES DE LA VILLE SUR L'EAU ──────────────────────────────────
 * Portage iso de `cityMapDrawCityReflections` (feu renderWorld.js, supprimé avec
 * le peintre top-down), qui existait
 * depuis toujours mais n'était appelé QUE par le chemin legacy
 * (cityMapRuntime.js) — le rendu iso ne l'a jamais eu. Même grammaire que les
 * lanternes de pont (drawIsoBridgeNight) : nappes lumineuses ancrées à la berge
 * urbaine, étirées vers le centre du fleuve, qui scintillent en décalé.
 *
 * POURQUOI ÇA MARCHE LÀ OÙ LE GRAIN ÉCHOUE : c'est de la lumière ADDITIVE
 * (`lighter`) posée APRÈS le voile de nuit, sur une eau que ce même voile vient
 * d'assombrir. Le contraste est donc MAXIMAL exactement là où le moucheté se
 * faisait écraser. Un effet strictement nocturne n'a pas à lutter contre la nuit.
 *
 * ⚠ Ne pas confondre avec les « reflets sous la rive » du pixelRiver legacy,
 * ANNULÉS par Raph le 2026-07-02 : ceux-là étaient un lustrage permanent de la
 * berge, ceux-ci sont les lumières de la ville, la nuit seulement.
 *
 * Seule vraie adaptation : la PROJECTION. Le legacy calcule l'angle de la nappe
 * depuis la normale MONDE (`atan2(n.ny, n.nx)`), ce qui suppose que l'écran
 * conserve les angles — faux en iso. On projette donc DEUX points monde (ancrage
 * à la berge, pointe vers le centre) et on déduit angle et longueur À L'ÉCRAN.
 * ------------------------------------------------------------------------- */
// `bandMix` : part de la teinte du CORPS D'EAU dans le reflet (Raph, 2026-07-30 —
// « fais suivre les reflets au coloris »). ⚠ Correction d'une erreur que j'avais
// écrite : ces reflets ne sont PAS bleu-gris ardoise, ce sont les LAMPES DE QUAI
// de l'ère (chaud, cyan, vert néon…). Les repeindre entièrement à la couleur de
// l'eau effacerait cette lecture par ère. On les tire donc vers la teinte de
// l'eau sans les y noyer : un reflet sur de l'azur prend un cast bleu, ce qui est
// aussi ce que fait la vraie eau. 0 = lampe pure, 1 = eau pure.
export const cityReflectionTune = { on: true, gain: 1, stride: 2, reach: 1, bandMix: 0.35 };
if (typeof window !== 'undefined') window.__cityReflect = cityReflectionTune;
function drawIsoCityReflections(ctx, now) {
  const RT = cityReflectionTune;
  if (!RT.on) return;
  const night = CM.nightF || 0;
  if (night < 0.2) return;                                   // effet strictement nocturne
  const L = CM.layout, rv = L && L.river;
  if (!rv || !rv.present || !rv.samples) return;
  const band = L.counts ? (L.counts.eraBand | 0) : 0;
  if (band <= 1) return;                                     // campement : pas de ville riveraine
  // Reflets des bâtiments riverains : l'Usure ne les coupe plus non plus
  // (Raph, 2026-07-27). Seul l'effondrement en cours éteint la surface.
  if (CM.collapseAt) return;
  ensureQuayGate();
  const g = CM.quayGate;
  if (!g) return;
  const sm = rv.samples, n0 = sm.length, T = CM.TILE;
  const t = now || 0;
  // Teintes reprises telles quelles du legacy (accordées aux lampes de quai),
  // puis tirées vers la teinte de l'eau courante (cf. bandMix).
  const lamp = band <= 5 ? '255,210,140'
    : band === 6 ? '150,225,255'
      : band === 7 ? '90,240,180' : band === 8 ? '255,205,120' : '170,140,255';
  const glow = (() => {
    const w = CM.waterShore && CM.waterShore.wash;
    const k = Math.max(0, Math.min(1, RT.bandMix != null ? RT.bandMix : 0));
    if (!w || k <= 0) return lamp;
    const a = lamp.split(',').map(Number), b = w.split(',').map(Number);
    return a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',');
  })();
  const nAt = (i) => {
    const o = sm[Math.max(0, i - 1)], q = sm[Math.min(n0 - 1, i + 1)];
    let tx = q.x - o.x, ty = q.y - o.y; const tl = Math.hypot(tx, ty) || 1;
    return { nx: -ty / tl, ny: tx / tl };
  };
  ctx.save();
  riverRibbonPath(ctx, sm, T);
  ctx.clip(WATER_FILL);                                                // les nappes restent SUR l'eau
  ctx.globalCompositeOperation = 'lighter';
  const STRIDE = Math.max(1, RT.stride | 0);
  for (let si = 0; si < 2; si += 1) {
    const side = si ? -1 : 1, gate = si ? g.minus : g.plus;
    if (!gate) continue;
    for (let i = 0; i < n0; i += STRIDE) {
      if (!gate[i]) continue;                                // berge non urbaine : rien à refléter
      const s = sm[i], n = nAt(i);
      const shimmer = 0.45 + 0.55 * Math.sin(t / 1300 + i * 0.9 + si * 2.1);
      const a = night * (0.10 + 0.07 * (i % 3)) * Math.max(0, shimmer) * RT.gain;
      if (a < 0.012) continue;
      const reach = s.hw * (0.50 + 0.18 * Math.sin(t / 2000 + i * 0.5)) * RT.reach;
      const pB = worldToScreen((s.x + side * n.nx * s.hw) * T, (s.y + side * n.ny * s.hw) * T);
      const pT = worldToScreen((s.x + side * n.nx * (s.hw - reach)) * T, (s.y + side * n.ny * (s.hw - reach)) * T);
      const dx = pT.x - pB.x, dy = pT.y - pB.y;
      const RL = Math.max(3, Math.hypot(dx, dy));
      const cx = (pB.x + pT.x) / 2, cy = (pB.y + pT.y) / 2;
      if (cx < -RL || cx > CM.cw + RL || cy < -RL || cy > CM.ch + RL) continue;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.atan2(dy, dx));                        // angle ÉCRAN, pas monde
      ctx.scale(1, 0.42);                                    // fin le long de la rive
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, RL);
      grad.addColorStop(0, `rgba(${glow},${a.toFixed(3)})`);
      grad.addColorStop(1, `rgba(${glow},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(0, 0, RL, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
}

export function drawIsoNight(now) {
  const n = CM.nightF || 0;
  const ctx = CM.ctx, L = CM.layout;
  const V = NIGHT_VEIL;
  // Aube/crépuscule (porté du legacy cityMapDrawNight) : voile chaud qui pique à
  // mi-transition (n=0.5) — orange quand la nuit monte, or rosé quand elle se retire.
  const twilight = 4 * n * (1 - n);
  if (twilight > 0.25) {
    const col = CM.dayRising === false ? V.dawnCol : V.duskCol;
    ctx.fillStyle = `rgba(${col},${((twilight - 0.25) * V.warmA).toFixed(3)})`;
    ctx.fillRect(0, 0, CM.cw, CM.ch);
  }
  // Nuit « heure bleue » : une passe MULTIPLY teintée décale toute la scène vers
  // le bleu en préservant les contrastes (l'ancien voile plat écrasait les
  // couleurs), puis un voile sombre léger règle la luminosité. Les lumières se
  // dessinent PAR-DESSUS en additif ; la passe de lumière tourne AUSSI de jour
  // (flammes de torche, néon).
  if (n > 0.03) {
    const prevOp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgba(${V.mulCol},${(V.mulA * n).toFixed(2)})`;
    ctx.fillRect(0, 0, CM.cw, CM.ch);
    ctx.globalCompositeOperation = prevOp;
    ctx.fillStyle = `rgba(${V.darkCol},${(V.darkA * n).toFixed(2)})`;
    ctx.fillRect(0, 0, CM.cw, CM.ch);
  }
  // Reflets de la ville sur l'eau : APRÈS le voile (sinon le multiply les éteint),
  // avant les halos de lampadaires — même ordre additif que le legacy.
  drawIsoCityReflections(ctx, now);
  // Feux de la ville (scènes moteur, braseros des merveilles) : ils ont déposé
  // leur lumière pendant la passe des bâtiments, on la pose ici. AVANT le retour
  // anticipé ci-dessous : un feu brûle aussi de jour et hors LOD-lampes, et une
  // file jamais vidée traînerait d'une frame sur l'autre.
  paintFlameGlows(ctx);
  // Halos des lampadaires : DÉPOSÉS pendant la passe vivante, chacun à la
  // profondeur de son mât, puis posés ici par-dessus le voile — c'est ce
  // détour qui leur fait respecter le tri peintre (cf. lightLayer.js). Le
  // dessin direct ci-dessous n'est plus qu'un REPLI (calque indisponible ou
  // molette __lightOcclusion({on:false})) : il ignore l'occultation.
  if (paintLightLayer(ctx)) return;
  if (!L || CM.lodActive) return;                     // pas de sprites-lampes en LOD → pas de lumières
  const K = isoLampLightFrame(L);
  if (!K) return;
  const b = visibleCellBounds(0);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const lp of isoLamps(L, K.band)) {
    if (lp.gx < b.gx0 || lp.gx > b.gx1 || lp.gy < b.gy0 || lp.gy > b.gy1) continue;
    if (!lampLit(lp, K)) continue;
    paintLampGlow(ctx, lp, worldToScreen(lp.wx, lp.wy), K, now);
  }
  ctx.restore();
}

// Constantes d'éclairage des mâts pour LA frame (null = personne n'éclaire) :
// teinte de l'ère, métriques du sprite, visibilité jour/nuit. Extrait de la
// passe de nuit pour servir aux deux chemins — dépôt dans le calque (nominal)
// et dessin direct (repli).
export function isoLampLightFrame(L) {
  if (!LAMP_LIGHT.on || CM.lodActive || !L || !L.roadMap) return null;
  const band = (L.counts && L.counts.eraBand) | 0;
  const lig = LAMP_LIGHTS[lampEraForBand(band)] || LAMP_LIGHTS.antique;
  const n = CM.nightF || 0;
  const vis = lig.day + (1 - lig.day) * n;            // visibilité diurne/nocturne de la source
  if (vis <= 0.02) return null;
  // Métriques du sprite pour placer les sources sur la tête (mêmes calculs que le peintre).
  const art = isoArt('lamp-' + lampEraForBand(band) + '?v=' + LAMP_V);
  const m = (art.ready && lampFootMetrics(art)) || { footXf: 0.5, footYf: 0.97, usedHf: 0.92 };
  const unit = CM.TILE * CM.cam.zoom;
  const hpx = unit * LAMP_TUNE.h / (m.usedHf || 1);
  const wpx = art.ready ? hpx * ((art.img.naturalWidth || 1) / (art.img.naturalHeight || 1)) : hpx * 0.5;
  return { band, lig, m, hpx, wpx, vis, n, unit, gain: LAMP_LIGHT.gain, stride: isoLampStride(L, band) };
}

// Plafond de mâts éclairés par frame (garde-fou perf historique) — rendu
// RÉPARTI. Depuis que les halos se déposent dans le tri peintre, « éclairer les
// 320 premiers » n'a plus le même sens : le tri les prend du NORD au SUD, si
// bien que le plafond dessinait une frontière horizontale nette au milieu de la
// ville, moitié haute allumée, moitié basse éteinte (vu au dézoom d'une
// mégapole). On compte donc les mâts VISIBLES et on n'en éclaire qu'un sur k,
// tirés par hash de cellule : stable d'une frame à l'autre (pas de clignotement
// au pan) et réparti sur toute la vue.
const LAMP_LIGHT_CAP = 320;
function isoLampStride(L, band) {
  const b = visibleCellBounds(0);
  let nVis = 0;
  for (const lp of isoLamps(L, band)) {
    if (lp.gx < b.gx0 || lp.gx > b.gx1 || lp.gy < b.gy0 || lp.gy > b.gy1) continue;
    nVis += 1;
  }
  return Math.max(1, Math.ceil(nVis / LAMP_LIGHT_CAP));
}
export const lampLit = (lp, K) => K.stride <= 1 || ((cmHash('lmpcap:' + lp.gx + ':' + lp.gy) >>> 0) % K.stride) === 0;

// Emprise ÉCRAN, généreuse, de la lumière d'un mât : nappe de tête, flaque au
// sol et cœurs réunis. Elle décide quels sprites paieront une découpe — la
// majorer coûte quelques découpes de plus, la minorer laisserait de la lumière
// traverser un mur.
export function lampGlowBox(p, K) {
  const R = K.unit * 1.05;
  return { x0: p.x - K.wpx - R, y0: p.y - K.hpx * K.m.footYf - R, x1: p.x + K.wpx + R, y1: p.y + R * 0.6 };
}

// Peint le halo d'UN mât sur `pctx` (composite additif déjà posé).
export function paintLampGlow(pctx, lp, p, K, now) {
  const { lig, m, hpx, wpx, vis, n, unit, gain } = K;
  const boxL = p.x - wpx * m.footXf, boxT = p.y - hpx * m.footYf;
  const ph = lampPhase(lp);
  const fl = lampFlicker(lig.style, now, ph);
  // — NUIT : halo ambiant à la tête + flaque au sol (n uniquement), scintillés.
  if (n > 0.03) {
    const hx = boxL + lig.hx * wpx, hy = boxT + lig.hy * hpx;
    addGlow(pctx, hx, hy, Math.max(4, unit * 0.78) * (0.9 + 0.2 * fl), lig.col, Math.min(0.6, 0.5 * n) * fl * gain);
    const rp = Math.max(4, unit * 0.8);
    const g2 = pctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rp);
    g2.addColorStop(0, `rgba(${lig.col},${(0.17 * n * fl * gain).toFixed(3)})`);
    g2.addColorStop(1, `rgba(${lig.col},0)`);
    pctx.fillStyle = g2;
    pctx.beginPath();
    pctx.ellipse(p.x, p.y, rp * 0.8, rp * 0.4, 0, 0, Math.PI * 2);
    pctx.fill();
  }
  // — SOURCE VIVE (jour + nuit) : cœur lumineux scintillant sur chaque flamme/lanterne.
  for (const e of lig.em) {
    let ex = boxL + e.fx * wpx, ey = boxT + e.fy * hpx;
    if (lig.style === 'fire') {              // la flamme ondule : monte quand elle brille, oscille un peu
      ey -= wpx * 0.10 * (fl - 0.72);
      ex += wpx * 0.05 * Math.sin((now || 0) * 0.021 + ph);
    }
    const r = unit * e.r * (0.8 + 0.35 * fl);
    addGlow(pctx, ex, ey, r, lig.col, Math.min(0.85, 0.62 * vis * fl * gain));
  }
}

// ── TERRE-PLEIN PLANTÉ : la passe de BAKE, sortie de drawIsoGround le 2026-08-23 ──
// PREMIÈRE passe d'orchestrateur extraite, et la plus facile — mesurée comme telle
// avant de couper (cf. docs/CARTO-drawIsoGround.md) : elle ne lit QUE quatre variables
// de son englobante, `ctx`, `tp`, `T` et `z`. Elles deviennent des paramètres du
// MÊME NOM, si bien que le corps ci-dessous est repris SANS UNE LIGNE DE CHANGÉE.
// ⚠ Le PROFILEUR est resté chez l'appelant : chronométrer est de la coordination.
// Terre-plein PLANTÉ des boulevards 2-cellules (couture L.terrePlein), façon
// PLACE : le bake ne porte que le SOL — capsule d'herbe à bouts ronds (prolongée
// de MEDIAN_TUNE.ext dans les carrefours), ombre portée bas-droite (lumière
// haut-gauche), liseré de pierre, touffes et fleurs. Les BUISSONS (relief) sont
// des items du peintre par-dessus, cf. drawIsoLive. La bande sprite 3-slice a
// été RETIRÉE (« rendu étiré, peu de relief », Raph 2026-08-03).
export function drawIsoMedians(ctx, tp, T, z) {
  if (tp && tp.length) {
    const wtp = T * 0.26;                        // demi-largeur monde de la capsule (< refuge agents ±0.34)
    const ext = MEDIAN_TUNE.ext * T;
    // Trace la capsule en MONDE (bouts = demi-cercles échantillonnés) : projetée
    // par worldToScreen, elle s'écrase naturellement en rondelle iso au sol.
    const capsulePath = (ax, ay, bx, by, w) => {
      const dl = Math.hypot(bx - ax, by - ay) || 1;
      const ux = (bx - ax) / dl, uy = (by - ay) / dl, pxw = -uy, pyw = ux;
      ctx.beginPath();
      const N = 7;
      for (let i = 0; i <= N; i += 1) {          // bout A : +perp → −axe → −perp
        const th = Math.PI * (i / N);
        const q = worldToScreen(ax + (pxw * Math.cos(th) - ux * Math.sin(th)) * w, ay + (pyw * Math.cos(th) - uy * Math.sin(th)) * w);
        if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
      }
      for (let i = 0; i <= N; i += 1) {          // bout B : −perp → +axe → +perp
        const th = Math.PI * (i / N);
        const q = worldToScreen(bx + (-pxw * Math.cos(th) + ux * Math.sin(th)) * w, by + (-pyw * Math.cos(th) + uy * Math.sin(th)) * w);
        ctx.lineTo(q.x, q.y);
      }
      ctx.closePath();
    };
    for (const seg of tp) {
      let ax, ay, bx, by;
      if (seg.axis === 'h') { ax = seg.x0 * T - ext; ay = (seg.y + 1) * T; bx = (seg.x1 + 1) * T + ext; by = ay; }
      else { ax = (seg.x + 1) * T; ay = seg.y0 * T - ext; bx = ax; by = (seg.y1 + 1) * T + ext; }
      // Ombre portée : même capsule décalée bas-droite écran, SOUS le gazon.
      ctx.save();
      ctx.translate(z * 1.4, z * 1.0);
      capsulePath(ax, ay, bx, by, wtp);
      ctx.fillStyle = 'rgba(18,24,12,0.22)';
      ctx.fill();
      ctx.restore();
      capsulePath(ax, ay, bx, by, wtp);
      // Fond uni : REPLI tant que la texture décode, et bouche-trou sous ses
      // pixels de bord. En saison verte : herbe SAISONNIÈRE éclaircie d'un cran
      // (gazon municipal plus frais que le pré). En HIVER : blanc neige — la
      // ville entière est enneigée (tuiles d'herbe hiver), un gazon resté vert
      // jurait au milieu de la neige (retour Raph « l'hiver ne va pas du tout »).
      const winterTP = CM.season === WINTER;
      const lawn = winterTP
        ? [224, 232, 236]
        : [Math.min(255, SEASON_GRASS[0] + 6), Math.min(255, SEASON_GRASS[1] + 12), Math.max(0, SEASON_GRASS[2] - 2)];
      ctx.fillStyle = rgb(lawn, 1);
      ctx.fill();
      // GAZON PixelLab (`median-lawn[-winter]`, tuile vue du dessus — l'hiver est
      // une texture de NEIGE piquée de brins) posé en PATTERN écrasé 2:1 — la
      // perspective du sol iso, comme les tuiles losange — et ANCRÉ AU MONDE
      // (origine = worldToScreen(0,0)) : la texture ne « nage » pas au pan, une
      // répétition couvre une tuile. Même contrat que blitIsoTileKey (la saison
      // en place est gardée tant que la tuile de l'autre décode).
      const lawnArt = isoArt(winterTP ? 'median-lawn-winter' : 'median-lawn');
      let lawnTex = false;
      if (lawnArt.ready) {
        const pat = ctx.createPattern(lawnArt.img, 'repeat');
        if (pat) {
          const s = (T * z) / (lawnArt.img.naturalWidth || 64);
          const o = worldToScreen(0, 0);
          if (pat.setTransform) pat.setTransform(new DOMMatrix([s, 0, 0, s * 0.5, o.x, o.y]));
          capsulePath(ax, ay, bx, by, wtp);
          ctx.fillStyle = pat;
          ctx.fill();
          lawnTex = true;
        }
      }
      ctx.strokeStyle = 'rgba(198,188,154,0.95)'; // liseré pierre (margelle fine)
      ctx.lineWidth = Math.max(1, z * 0.9);
      ctx.stroke();
      const dl = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / dl, uy = (by - ay) / dl;
      const pxw = -uy, pyw = ux;
      const pu = Math.max(1, Math.round(T * z * 0.028));   // pixel d'art (cf. drawGrassDetail)
      const segKey = seg.axis + ':' + (seg.axis === 'h' ? seg.y + ':' + seg.x0 : seg.x + ':' + seg.y0);
      // MOUCHETIS de tonte : REPLI du gazon PixelLab (aplat + points 2 tons)
      // tant que la texture n'est pas décodée — elle porte son propre grain.
      if (!lawnTex) {
        const mowL = rgb([Math.min(255, lawn[0] + 15), Math.min(255, lawn[1] + 15), Math.min(255, lawn[2] + 10)], 1);
        const mowD = rgb([Math.max(0, lawn[0] - 13), Math.max(0, lawn[1] - 11), Math.max(0, lawn[2] - 8)], 1);
        for (let t = wtp * 0.5; t <= dl - wtp * 0.5; t += T * 0.115) {
          for (let kRow = -2; kRow <= 2; kRow += 1) {
            const h = cmHash('tpm:' + segKey + ':' + Math.round(t * 100) + ':' + kRow);
            if ((h & 255) / 255 > 0.52) continue;
            const off = kRow * wtp * 0.36 + (((h >>> 9) % 64) / 64 - 0.5) * wtp * 0.3;
            const jt = (((h >>> 16) % 64) / 64 - 0.5) * T * 0.09;
            const q = worldToScreen(ax + ux * (t + jt) + pxw * off, ay + uy * (t + jt) + pyw * off);
            ctx.fillStyle = (h & 1) ? mowL : mowD;
            ctx.fillRect(Math.round(q.x), Math.round(q.y), pu, pu);
          }
        }
      }
      // PARTERRES DE FLEURS (slots pairs, cf. medianSlots — les impairs portent
      // les buissons du peintre) : sprite PixelLab `flowerbed-1..4` (bac de
      // terre + fleurs denses, robe par hash — planche 1e1aedaa découpée par
      // scripts/sliceFlowerBeds.mjs) ; REPLI procédural (bordure + feuillage +
      // tapis de points) tant que le PNG décode — le bake se recuit tout seul
      // au décodage (invalidation douce d'isoArt).
      for (const sl of medianSlots(seg, T)) {
        if (sl.kind !== 'bed') continue;
        // HIVER : pas de bacs du tout — seuls les buissons enneigés rendent bien
        // (retour Raph ; les bacs de neige recolorés ont été retirés). Le peintre
        // pose alors un buisson sur CES slots aussi, la bande garde son rythme.
        if (winterTP) continue;
        const br = T * (0.18 + ((sl.h >>> 3) % 40) / 730);           // rayon 0.18-0.235 tuile
        const bedArt = isoArt('flowerbed-' + (1 + ((sl.h >>> 8) % 4)));
        if (bedArt.ready) {
          // Largeur écran EXACTE de l'ellipse du disque monde (2√2·c·br, c
          // mesuré par projection) ; le bac « pose » son ovale autour du centre.
          const qc = worldToScreen(sl.wx, sl.wy);
          const cbr = worldToScreen(sl.wx + br, sl.wy).x - qc.x;
          const dw = 2 * Math.SQRT2 * cbr * 1.12;                    // léger bonus : le PNG a sa marge
          const iw = bedArt.img.naturalWidth || 1, ih = bedArt.img.naturalHeight || 1;
          // Été et hiver partagent la MÊME géométrie 3/4 (les bacs d'hiver sont
          // les bacs d'été recolorés par scripts/recolorWinterBeds.mjs — fleurs
          // → paquets de neige à modelé conservé) : ratio naturel du PNG.
          const dh = dw * (ih / iw);
          const prevSm = ctx.imageSmoothingEnabled;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(bedArt.img, Math.round(qc.x - dw / 2), Math.round(qc.y + dw * 0.25 - dh), dw, dh);
          ctx.imageSmoothingEnabled = prevSm;
          continue;
        }
        const ring = (rr) => {
          ctx.beginPath();
          for (let i = 0; i <= 14; i += 1) {
            const th = (i / 14) * Math.PI * 2;
            const q = worldToScreen(sl.wx + Math.cos(th) * rr, sl.wy + Math.sin(th) * rr);
            if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
          }
          ctx.closePath();
        };
        ring(br);
        ctx.fillStyle = 'rgb(88,68,50)';                              // terre de plate-bande
        ctx.fill();
        ring(br * 0.84);
        ctx.fillStyle = 'rgb(58,84,44)';                              // feuillage du massif
        ctx.fill();
        const pal = BED_PALETTES[(sl.h >>> 8) % BED_PALETTES.length];
        const step = T * 0.048, rIn = br * 0.8;
        for (let dxw = -rIn; dxw <= rIn; dxw += step) {
          for (let dyw = -rIn; dyw <= rIn; dyw += step) {
            if (dxw * dxw + dyw * dyw > rIn * rIn) continue;
            const h4 = cmHash('tpb:' + segKey + ':' + Math.round(sl.wx + dxw) + ':' + Math.round(sl.wy + dyw));
            if ((h4 & 255) / 255 > 0.80) continue;                    // trouées de feuillage
            const jx = (((h4 >>> 8) % 32) / 32 - 0.5) * step, jy = (((h4 >>> 13) % 32) / 32 - 0.5) * step;
            const q = worldToScreen(sl.wx + dxw + jx, sl.wy + dyw + jy);
            // dominante ×2, accent ×1 → un massif « à robe », pas des confettis
            const ci = (h4 >>> 18) % 4;
            ctx.fillStyle = rgb(pal[ci === 3 ? 2 : ci >> 1], 1);
            const fs = ((h4 >>> 22) % 10) < 3 ? pu + 1 : pu;          // quelques grosses fleurs
            ctx.fillRect(Math.round(q.x - fs / 2), Math.round(q.y - fs / 2), fs, fs);
          }
        }
      }
    }
  }
}
