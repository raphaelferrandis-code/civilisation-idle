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
import { worldToScreen, visibleCellBounds, visibleDiamondBounds } from './projection.js';
import { paintFlameGlows } from '../flameGlow.js';
import { LIGHT_LAYER, paintLightLayer } from '../lightLayer.js';
import { quayWallTiles, quayWallTune } from '../quaysAndRiot.js';
import { quayLampList, stairFootY } from './isoQuay.js';
import { portLampList } from './portBerths.js';
import { isoArt } from './isoArt.js';
import { builtCells, builtNear, COUR, courOf } from './isoTissu.js';
import { isoRoadHalfW, ROAD_DETAIL, SIDEWALK_ISO } from './isoRoad.js';
import { WATER_FILL, riverRibbonPath } from './isoRiver.js';
import { plazaEraForBand, isoPlazaLamps } from './isoPlaza.js';
import { STREET_PROPS, computeStreetProps } from './isoStreetProps.js';
// Le TERRE-PLEIN planté est arrivé ici le 2026-08-23, en venant de drawIsoGround :
// sa config (MEDIAN_TUNE) vivait déjà dans ce module.
import { WINTER } from '../seasonMode.js';
import { SEASON_GRASS } from './isoGroundDetail.js';
import { GRASS, rgb } from './isoPalette.js';
import { vieHalo, vieK, vieTreeSway } from './isoVie.js';
import { drawSwaySprite } from './swaySprite.js';
import { drawSunShadow } from './isoSunShadow.js';
// Le mobilier de rue PAR ÈRE, dessiné par le code (2026-10-02) : réverbère et
// terre-plein. Les bandes 0-1 n'ont ni boulevard ni réverbère, donc pas de kit ; le
// mobilier d'avant (PNG, parterres) a été retiré le 2026-10-06 (audit, MORT-13).
import { streetKitFor, streetKitGlow, streetKitLampArt, streetKitPlantArt, wildShrubArt } from './streetKits.js';
import { chuteLightsOut } from './chuteState.js';
import { isAbandonedAt } from '../cityDecline.js';

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
// un CALIBRAGE SPRITE PAR SPRITE (position des ouvertures dans l'art, comme le
// kit le fait pour la tête des mâts), pas avec des fractions de
// boîte. Le plafond de dessin devra rester un TIRAGE RÉPARTI : couper « les N
// premières » de l'ordre du layout allume un quartier et laisse le voisin noir.
// ── LAMPADAIRES par ère (retour Raph : points lumineux ANCRÉS aux mâts) ──────
// Liste déterministe par layout : cellules-route TRAVERSANTES (pas carrefour,
// pas pont, pas place), 1 sur 3, côté de chaussée par RUE. band ≥ 2 : pas de
// lampadaires aux stades primitifs (cohérence demandée). Réverbère du KIT de
// l'ère (streetKits.js), posé au PEINTRE (drawIsoLive) ; la nuit, le halo se
// dessine À LA TÊTE de chaque mât.
let _isoLampCache = { at: -1, key: '', lamps: null };
export function isoLamps(L, band) {
  if (band < 2 || !L.roadMap) return [];
  // Les mâts de la PLACE viennent d'isoPlaza (computeIsoLamps saute les cellules
  // 'plaza' : la place était éclairée par son PNG). Même format → ils héritent
  // des sprites d'ère, des halos, du vacillement et du LOD sans une ligne de
  // plus ici. La clé de cache porte leur nombre : changer __plaza({mode}) ou une
  // recette doit rallumer ou éteindre la place sans recharger la page.
  const plazaLamps = isoPlazaLamps(L, band);
  // Les RÉVERBÈRES DES QUAIS (iso/isoQuay.js) : même format, même dessin par ère —
  // ils remplacent les points lumineux sans mât de l'ancien quai.
  const quayLamps = quayLampList(L, band);
  // Les réverbères des PORTS du XIXe (bassin du Vieux-Port, terminal de commerce —
  // iso/portBerths.js, docs/PLAN-PORTS.md) : même format, même dessin par ère.
  const portLamps = portLampList(L, band);
  const kit = streetKitFor(band);
  const key = CM.layoutRecomputeAt + ':' + plazaLamps.length + ':q' + quayLamps.length + ':p' + portLamps.length
    + ':k' + (kit ? kit.id : '-');
  if (_isoLampCache.key === key && _isoLampCache.lamps) return _isoLampCache.lamps;
  // ON N'ÉCLAIRE PAS LE VIDE. Même règle que le trottoir : une voie sans aucune
  // façade sur ses huit voisines n'est pas une rue, et un mât allumé au milieu
  // de rien est le signal le plus visible du défaut — de nuit, c'est même le
  // seul qu'on voie. Filtré ICI et pas dans `computeIsoLamps` : le corps pur
  // reste testable sans layout bâti.
  let street = computeIsoLamps(L, CM.TILE).filter((lp) => builtNear(L, lp.gx, lp.gy));
  // BOULEVARDS (ères à kit) : « une seule file au milieu » (Raph, 2026-10-02).
  // Chaque voie du boulevard choisissait son côté, et souvent les deux prenaient
  // la couture : les mâts zigzaguaient d'un bord du terre-plein à l'autre, et
  // 7 à 11 paires par ville se touchaient presque. Les voies bordant un terre-
  // plein n'ont plus de mâts à elles ; le terre-plein porte sa propre file, au
  // rythme de ses plantations (medianPlan).
  if (kit && kit.median) {
    const lanes = boulevardLanes(L);
    street = street.filter((lp) => !lanes.has(lp.gx + ',' + lp.gy));
    for (const sg of (L.terrePlein || [])) {
      for (const sl of medianPlan(L, sg, CM.TILE, kit)) {
        if (sl.kind !== 'lamp' || !sl.urban) continue;
        street.push({ wx: sl.wx, wy: sl.wy, gx: Math.floor(sl.wx / CM.TILE), gy: Math.floor(sl.wy / CM.TILE), d: sl.wx + sl.wy });
      }
    }
  }
  const lamps = street.concat(plazaLamps, quayLamps, portLamps);
  _isoLampCache = { at: CM.layoutRecomputeAt, key, lamps };
  return lamps;
}
// Cellules des deux voies de chaque boulevard planté (L.terrePlein), mémoïsées
// sur le plan.
function boulevardLanes(L) {
  if (L._bvLanes) return L._bvLanes;
  const s = new Set();
  for (const sg of (L.terrePlein || [])) {
    if (sg.axis === 'h') for (let x = sg.x0; x <= sg.x1; x += 1) { s.add(x + ',' + sg.y); s.add(x + ',' + (sg.y + 1)); }
    else for (let y = sg.y0; y <= sg.y1; y += 1) { s.add(sg.x + ',' + y); s.add((sg.x + 1) + ',' + y); }
  }
  L._bvLanes = s;
  return s;
}
// Corps PUR (exporté pour les tests) : positions + PROFONDEUR peintre de chaque mât.
// La clé d'un mât n'est PAS toujours wx+wy de son pied : côté 0.14 (bord nord/ouest
// de chaussée), le mât se dresse DEVANT la façade sud (route horizontale) ou est
// (route verticale) du bâtiment MITOYEN, mais son pied a une profondeur plus PETITE
// que le coin sud de l'empreinte — la clé des socles (cf. drawIsoLive) — donc le
// peintre l'AVALAIT (116 mâts sur 339 en ville band 4). On aligne sa clé juste
// devant ce bâtiment. Côté 0.86 le bâtiment mitoyen est au sud/est du mât → le mât
// est derrière lui, l'ordre naturel wx+wy est déjà le bon.
// (Un mât posé sur la COUTURE d'un terre-plein y était GLISSÉ entre les parterres —
//  lampSlideClear. Tous ces mâts tombent sur une voie de boulevard, que le kit
//  dépeuple juste après (isoLamps) : le glissement a été retiré avec les parterres,
//  le 2026-10-06.)
export function computeIsoLamps(L, T) {
  const lamps = [];
  const solid = isoSolidSouthCorners(L, T);
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
    const wx = (thH ? c.gx + 0.5 : c.gx + side) * T;
    const wy = (thH ? c.gy + side : c.gy + 0.5) * T;
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
  if (import.meta.env?.DEV && typeof window !== 'undefined') window.__streetPropsCount = props.length;
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
// L'art du réverbère de la bande : celui du KIT de l'ère (dessiné par le code,
// streetKits.js), null sans kit (bandes 0-1 : pas de mât). Seule porte d'entrée —
// le peintre, la lumière et les reflets lisent tous celle-ci. (Le repli PNG
// `lamp-<ère>.png` d'avant le kit a été retiré le 2026-10-06, audit MORT-13 ; ses
// PNG sont gardés comme source dans art/references-ab/.)
export function streetLampArt(band) {
  return streetKitLampArt(band);
}
// Boîte d'écran d'un réverbère pour une unité (T·zoom). Le kit sait sa taille et
// son pied (`_foot`, connus par construction) : un pixel d'art = un pixel d'écran
// au zoom 1 (artH), comme le sol et le pont.
export function lampBox(art, unit) {
  const m = art._foot, k = unit / CM.TILE;
  return { m, hpx: m.artH * k, wpx: m.artW * k };
}
// Pose des mâts. curb = recul du pied depuis le bord de cellule (fraction de
// tuile) : plante le mât dans le trottoir, hors chaussée. Molette : __lampTune({ curb }).
// step : espacement des mâts en cellules le long d'une rue. paths : un sentier
// s'éclaire-t-il ? (lot L6 de docs/PLAN-TISSU-URBAIN.md — voir computeIsoLamps.)
export const LAMP_TUNE = { curb: 0.05, step: 3, paths: false };
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__lampTune = (o) => {
    if (o) Object.assign(LAMP_TUNE, o);
    _isoLampCache = { at: -1, key: '', lamps: null };   // step/paths repeuplent la liste
    return { ...LAMP_TUNE };
  };
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
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__medianExt = (v) => { if (typeof v === 'number') MEDIAN_TUNE.ext = v; return MEDIAN_TUNE.ext; };
}
// (Les PARTERRES et buissons alternés d'avant le kit — BED_PALETTES, medianSlots —
//  ont été retirés le 2026-10-06 : toutes les bandes à boulevard ont un kit.)

// ── TERRE-PLEIN D'UNE ÈRE À KIT (streetKits.js) ──────────────────────────────
// Le plan : la suite du kit (`median.pattern`, un objet tous les `step` tuiles),
// centrée sur la couture, et pour chaque objet si la VILLE le borde — une des
// deux voies a une façade sur ses huit voisines (builtNear, la règle des mâts et
// du trottoir). Hors de la ville, rien : « une bande d'herbe simple » (Raph,
// 2026-10-02 ; 46 à 57 % des cases de terre-plein étaient en pleine forêt).
// Source UNIQUE des plantations (peintre), des mâts (isoLamps) et de la bordure
// (bake, medianUrbanRuns). Mémoïsé sur le plan, par segment et par kit.
export function medianPlan(L, seg, T, kit) {
  const memo = L._medianPlan || (L._medianPlan = new Map());
  const mk = kit.id + ':' + seg.axis + ':' + (seg.axis === 'h' ? seg.y + ':' + seg.x0 + ':' + seg.x1 : seg.x + ':' + seg.y0 + ':' + seg.y1);
  const hit = memo.get(mk);
  if (hit) return hit;
  const M = kit.median, ext = MEDIAN_TUNE.ext * T;
  const horiz = seg.axis === 'h';
  const a0 = (horiz ? seg.x0 : seg.y0) * T - ext;
  const len = ((horiz ? seg.x1 - seg.x0 : seg.y1 - seg.y0) + 1) * T + 2 * ext;
  const P = T * M.step, margin = T * 0.45;
  const n = Math.max(0, Math.floor((len - 2 * margin) / P) + 1);
  const t0 = (len - (n - 1) * P) / 2;                 // suite centrée sur le segment
  const urban = medianUrbanCells(L, seg);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const w = a0 + t0 + i * P;
    const wx = horiz ? w : (seg.x + 1) * T, wy = horiz ? (seg.y + 1) * T : w;
    const ci = Math.max(0, Math.min(urban.length - 1, Math.floor(w / T) - (horiz ? seg.x0 : seg.y0)));
    const kind = M.pattern[i % M.pattern.length];
    const h = cmHash('tpk:' + mk + ':' + i) >>> 0;
    // gx/gy : la phase du vent (vieTreeSway) se tire de la position.
    out.push({ kind, wx, wy, gx: wx / T, gy: wy / T, urban: urban[ci], h, draw: drawMedianPlantSelf });
  }
  memo.set(mk, out);
  return out;
}
// Par case de la couture : la ville la borde-t-elle ? Même règle que le TROTTOIR
// dessiné (isoStreetPropsFor) : une voie de sol urbain — pas retombée en herbe ou
// en friche (courOf) — avec une façade sur ses huit voisines. La façade seule ne
// suffisait pas : une caravane et son tas de bois au bord du boulevard, en pleine
// forêt, y posaient deux cyprès, une vasque et un mât entre deux bouts de bordure.
// Une tranche de moins de MEDIAN_TOWN_MIN cases ne compte pas non plus.
const MEDIAN_TOWN_MIN = 3;
export function medianUrbanCells(L, seg) {
  const courK = COUR.on && COUR.sidewalk && L.urbanSet ? courOf(L) : null;
  const street = (gx, gy) => (!courK || (courK.get(gx + ',' + gy) || 'urban') === 'urban') && builtNear(L, gx, gy);
  const out = [];
  if (seg.axis === 'h') for (let x = seg.x0; x <= seg.x1; x += 1) out.push(street(x, seg.y) || street(x, seg.y + 1));
  else for (let y = seg.y0; y <= seg.y1; y += 1) out.push(street(seg.x, y) || street(seg.x + 1, y));
  for (let i = 0; i < out.length; i += 1) {
    if (!out[i]) continue;
    let j = i;
    while (j + 1 < out.length && out[j + 1]) j += 1;
    if (j - i + 1 < MEDIAN_TOWN_MIN) for (let k = i; k <= j; k += 1) out[k] = false;
    i = j;
  }
  return out;
}
// Une plantation du terre-plein, au peintre (item 'vie' : l'acteur se dessine).
// Un pixel d'art = un pixel d'écran au zoom 1 ; ombre solaire au pied comme tout
// le reste ; le cyprès bouge au vent comme les arbres ; la plantation DÉCOUPE les
// halos qu'elle cache (calque de lumière).
function drawMedianPlantSelf(ctx, now) { drawMedianPlant(ctx, this, now); }
export function drawMedianPlant(ctx, sl, now) {
  const L = CM.layout;
  const band = (L && L.counts && L.counts.eraBand) | 0;
  const art = streetKitPlantArt(band, sl.kind, sl.h, CM.season | 0);
  if (art) drawKitSprite(ctx, art, sl, now, SWAYING.has(sl.kind));
}
// Ce qui plie au vent (le reste — bornes, vasques, bacs, colonnes — tient droit).
const SWAYING = new Set(['tree', 'shrub', 'frond']);
// Pose un objet de kit (streetKits.js) au pied (o.wx, o.wy) : au pixel d'appareil,
// ombre solaire, vent qui fait glisser le feuillage (vieTreeSway et swaySprite, comme
// les arbres), découpe des halos.
function drawKitSprite(ctx, art, o, now, sways) {
  const z = CM.cam.zoom, dpr = CM.dpr || 1;
  const p = worldToScreen(o.wx, o.wy);
  const f = art._foot, dw = art.w * z, dh = art.h * z;
  const dx = Math.round((p.x - dw * f.footXf) * dpr) / dpr, dy = Math.round((p.y - dh * f.footYf) * dpr) / dpr;
  drawSunShadow(ctx, art.img, dx, dy, dw, dh, 0, 0, 0, 0, f.footYf);
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  const sway = sways ? vieTreeSway(o, now, art.w, art.h, dh) : null;
  drawSwaySprite(ctx, art.img, art.w, art.h, dx, dy, dw, dh, sway, now, f.footYf);
  ctx.imageSmoothingEnabled = prev;
}
// BUISSONS DE L'ÎLE de la merveille (et tout buisson sauvage) : la même main que
// le terre-plein de la Pierre — un pixel d'art par pixel d'écran, ombre solaire,
// vent. Les images Cainos d'avant (28 à 72 px dessinés à la même taille) avaient
// chacune sa taille de pixel, et une ellipse sombre en guise d'ombre.
function drawWildShrubSelf(ctx, now) {
  const art = wildShrubArt(this.h, CM.season | 0, this.size);
  if (art) drawKitSprite(ctx, art, this, now, true);
}
export function wildShrubActor(wx, wy, h, size) {
  return { wx, wy, gx: wx / CM.TILE, gy: wy / CM.TILE, h, size, draw: drawWildShrubSelf };
}
// Bandes de la couture que la ville borde, en tranches [i0, i1] de cases.
function medianUrbanRuns(L, seg) {
  const u = medianUrbanCells(L, seg), runs = [];
  for (let i = 0; i < u.length; i += 1) {
    if (!u[i]) continue;
    let j = i;
    while (j + 1 < u.length && u[j + 1]) j += 1;
    runs.push([i, j]);
    i = j;
  }
  return { runs, n: u.length };
}
// ── FLAMMES & LUMIÈRES DES LAMPADAIRES (animées) ─────────────────────────────
// Chaque réverbère de kit porte sa lumière (`art.lig`, streetKits.js) : sources en
// FRACTION de son canvas (fx depuis la gauche, fy depuis le haut), hx/hy = tête
// « moyenne » (halo ambiant + flaque au sol), style = scintillement, day =
// visibilité DIURNE (une torche brûle de jour ; le gaz/électrique ne « s'allument »
// qu'à la nuit), col = teinte RGB.
// Réglage live : __lampLight({ on, gain }). gain multiplie toute l'intensité.
const LAMP_LIGHT = { on: true, gain: 1 };
if (import.meta.env?.DEV && typeof window !== 'undefined') {
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
  // PETITE VIE (2026-10-01) : les PETITES lueurs (luciole, cœur de flamme, ≤ 6 px
  // d'art) passent en halo au pixel (trois paliers, iso/isoVie.js) ; les grandes
  // nappes gardent le dégradé lisse ci-dessous (la trame y faisait du bruit).
  if (vieHalo(ctx, x, y, r, col, alpha)) return;
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
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__nightVeil = (o) => { if (o) Object.assign(NIGHT_VEIL, o); return { ...NIGHT_VEIL }; };
}
// (Une LUMIÈRE DE FIN D'APRÈS-MIDI — multiply chaud de jour, PLAN-MAQUETTE-VIVANTE
//  lot 4 — vivait ici, éteinte et jamais jugée ; retirée le 2026-10-06, audit MORT-13.)

/* ── REFLETS NOCTURNES DE LA VILLE SUR L'EAU ──────────────────────────────────
 * Les réverbères des quais se reflètent dans le fleuve, la nuit (cf.
 * drawLampWaterReflections ci-dessous). Posés APRÈS le voile de nuit, sur une eau
 * que ce voile vient d'assombrir : le contraste est maximal là où il le faut.
 *
 * ⚠ HISTOIRE (2026-10-01) : c'étaient des NAPPES lissées ancrées à la berge
 * urbaine et étirées vers le centre du fleuve (portage du `cityMapDrawCityReflections`
 * du peintre top-down), sous des lampes de quai qui n'étaient que des points sans
 * mât. Raph : « dans les reflets sur l'eau il reste les lumières des quais qui
 * dénotent ». Retirées avec l'ancien quai, après son OK sur la planche avant/après.
 *
 * ⚠ Ne pas confondre avec les « reflets sous la rive » du pixelRiver legacy,
 * ANNULÉS par Raph le 2026-07-02 : un lustrage permanent de la berge.
 * ------------------------------------------------------------------------- */
export const cityReflectionTune = { on: true, gain: 1 };
if (import.meta.env?.DEV && typeof window !== 'undefined') window.__cityReflect = cityReflectionTune;
function drawIsoCityReflections(ctx, now) {
  const RT = cityReflectionTune;
  if (!RT.on) return;
  const night = CM.nightF || 0;
  if (night < 0.2) return;                                   // effet strictement nocturne
  const L = CM.layout, rv = L && L.river;
  if (!rv || !rv.present || !rv.samples) return;
  const band = L.counts ? (L.counts.eraBand | 0) : 0;
  if (band <= 1) return;                                     // campement : pas de quai
  // L'Usure ne coupe pas les reflets (Raph, 2026-07-27) ; seul l'effondrement en
  // cours éteint la surface.
  if (CM.collapseAt) return;
  ctx.save();
  riverRibbonPath(ctx, rv.samples, CM.TILE);
  ctx.clip(WATER_FILL);                                      // les reflets restent SUR l'eau
  drawLampWaterReflections(ctx, now, L, band, night * (RT.gain != null ? RT.gain : 1));
  ctx.restore();
}

// ── LE REFLET D'UNE LAMPE DANS L'EAU, AU PIXEL (2026-10-01) ──────────────────
// Raph : « dans les reflets sur l'eau il reste les lumières des quais qui dénotent ».
// L'ancien reflet était une NAPPE lissée, couchée en travers du fleuve et étirée vers
// son milieu, sous des lampes qui n'existaient pas (les quais n'avaient que des points
// lumineux). Or une lumière se reflète TOUT DROIT vers le spectateur : son image est
// sous elle, à la même distance sous la surface que sa tête au-dessus — et la ride
// l'étire en une colonne de petits traits qui tremblent.
// Donc : pour chaque réverbère de quai ALLUMÉ dont l'eau est DEVANT (rive d'en face),
// une colonne de traits d'un pixel d'art de haut, 1 à 4 de large, qui part du pied du
// mur et dépasse un peu le point miroir de la tête ; plus vifs près du miroir, qui
// changent de largeur et s'éteignent par instants. Après le voile de nuit, et PEINTS
// (pas additifs) : en « lighter » sur l'eau bleue, l'ambre virait au gris-blanc.
// Couleur = celle de la flamme (K.lig.col), sans la tirer vers l'eau.
function drawLampWaterReflections(ctx, now, L, band, night) {
  const K = isoLampLightFrame(L);
  if (!K) return;
  const lamps = quayLampList(L, band);
  if (!lamps.length) return;
  const T = CM.TILE, z = CM.cam.zoom, k = vieK(), dpr = CM.dpr || 1;
  const drop = quayWallTiles(band) * quayWallTune.heightK * T * z;
  const t = now || 0;
  const h = (a, b, c) => {
    let n = (a | 0) * 374761393 + (b | 0) * 668265263 + (c | 0) * 982451653;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const snap = (v) => Math.round(v * dpr) / dpr;
  const col = K.lig.col;
  ctx.globalCompositeOperation = 'source-over';
  for (const lp of lamps) {
    if (!lp.wbel || !lampLit(lp, K)) continue;
    const p = worldToScreen(lp.wx, lp.wy);
    if (p.x < -40 || p.x > CM.cw + 40 || p.y < -80 || p.y > CM.ch + 200) continue;
    const boxL = p.x - K.wpx * K.m.footXf, boxT = p.y - K.hpx * K.m.footYf;
    const hx = boxL + K.lig.hx * K.wpx, hy = boxT + K.lig.hy * K.hpx;
    const e = worldToScreen(lp.ex, lp.ey);
    const waterY = e.y + drop;                           // la surface, au pied du mur
    const reflY = waterY + Math.max(4, waterY - hy);     // le miroir de la tête
    // Sous un escalier qui avance dans l'eau, le reflet part de son pied.
    const y0 = Math.max(waterY + 2 * k, stairFootY(hx, waterY) + k), y1 = reflY + 4 * k;
    const fl = lampFlicker(K.lig.style, t, lampPhase(lp));
    const span = Math.max(1, y1 - y0);
    let row = 0;
    for (let y = y0; y <= y1; y += k, row += 1) {
      const near = Math.max(0, 1 - Math.abs(y - reflY) / span);
      const cyc = Math.floor(t / 150 + row * 0.37 + (lp.s % 7));
      const r1 = h(lp.s, row, cyc), r2 = h(lp.s + 1, row, cyc);
      // Une ligne sur deux en moyenne, au hasard : des écarts irréguliers, pas une échelle.
      if (r2 < 0.5) continue;
      const w = 1 + Math.floor(r1 * (2 + 3 * near));     // 1 à 3, jusqu'à 5 au miroir
      const ox = Math.round((h(lp.s + 2, row, cyc) - 0.5) * 2) * k;
      const a = Math.min(0.9, night * K.gain * (0.3 + 0.6 * near) * (0.7 + 0.3 * r1) * fl);
      if (a < 0.03) continue;
      const x0 = Math.round(hx / k - w / 2) * k + ox;
      // Les bouts d'un trait large à demi-teinte : un trait de pixel, pas un pavé.
      ctx.fillStyle = `rgba(${col},${(w >= 3 ? a * 0.5 : a).toFixed(3)})`;
      ctx.fillRect(snap(x0), snap(y), snap(w * k), snap(k));
      if (w >= 3) {
        ctx.fillStyle = `rgba(${col},${(a * 0.5).toFixed(3)})`;
        ctx.fillRect(snap(x0 + k), snap(y), snap((w - 2) * k), snap(k));
      }
    }
  }
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
  if (!LAMP_LIGHT.on || CM.lodActive || !L || !L.roadMap || chuteLightsOut()) return null;
  const band = (L.counts && L.counts.eraBand) | 0;
  // Métriques du sprite pour placer les sources sur la tête (mêmes calculs que le
  // peintre). Un réverbère de kit porte sa propre lumière (sources en fraction
  // de son canvas, connues par construction). Sans kit (bandes 0-1), pas de mât.
  const art = streetLampArt(band);
  if (!art) return null;
  const lig = art.lig;
  const n = CM.nightF || 0;
  const vis = lig.day + (1 - lig.day) * n;            // visibilité diurne/nocturne de la source
  if (vis <= 0.02) return null;
  const unit = CM.TILE * CM.cam.zoom;
  const { m, hpx, wpx } = lampBox(art, unit);
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
// (Un quartier abandonné n'éclaire plus ses rues — la ville qui s'éteint, cityDecline.js.)
export const lampLit = (lp, K) => (K.stride <= 1 || ((cmHash('lmpcap:' + lp.gx + ':' + lp.gy) >>> 0) % K.stride) === 0)
  && !isAbandonedAt(Math.floor(lp.gx), Math.floor(lp.gy));

// Emprise ÉCRAN, généreuse, de la lumière d'un mât : nappe de tête, flaque au
// sol et cœurs réunis. Elle décide quels sprites paieront une découpe — la
// majorer coûte quelques découpes de plus, la minorer laisserait de la lumière
// traverser un mur.
// SERRÉE sur ce que paintLampGlow pose vraiment (audit du 2026-10-05, PERF-2) : le
// jour, les CŒURS SEULS (n ≤ 0,03 : ni nappe ni flaque) — l'emprise de nuit, deux
// tuiles de large, faisait payer découpes, effacement et blit à tout le voisinage
// d'une flamme de quelques pixels ; la nuit, cœurs + nappe de tête + flaque. Chaque
// pièce est prise à son rayon maximal (scintillement 1), plus le débord du halo au
// pixel (paliers arrondis au pixel d'art, ≤ 1,75 pixel d'art) et l'ondulation d'une
// flamme (±0,05 wpx en x, ±0,03 en y) : rien n'en sort. Molette tight: false =
// l'ancienne emprise généreuse.
export function lampGlowBox(p, K) {
  if (LIGHT_LAYER.tight !== false && K.lig.em) {
    const { lig, m, hpx, wpx, unit } = K;
    const boxL = p.x - wpx * m.footXf, boxT = p.y - hpx * m.footYf;
    const pad = 2 * vieK() + 2;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (cx, cy, rx, ry) => {
      if (cx - rx < x0) x0 = cx - rx;
      if (cx + rx > x1) x1 = cx + rx;
      if (cy - ry < y0) y0 = cy - ry;
      if (cy + ry > y1) y1 = cy + ry;
    };
    for (const e of lig.em) {
      const r = unit * e.r * 1.15 + pad + wpx * 0.06;
      add(boxL + e.fx * wpx, boxT + e.fy * hpx, r, r);
    }
    if (K.n > 0.03) {
      const rh = Math.max(4, unit * 0.78) * 1.1 + pad;              // nappe de tête
      add(boxL + lig.hx * wpx, boxT + lig.hy * hpx, rh, rh);
      const rp = Math.max(4, unit * 0.8);                           // flaque (ellipse 0,8 × 0,4)
      add(p.x, p.y, rp * 0.8 + pad, rp * 0.4 + pad);
    }
    if (x0 <= x1) return { x0, y0, x1, y1 };
  }
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
    // Flaque au sol : même halo au pixel, écrasé en ellipse couchée (0,8 × 0,4).
    if (!vieHalo(pctx, p.x, p.y, rp * 0.8, lig.col, 0.17 * n * fl * gain, 0.5)) {
      const g2 = pctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rp);
      g2.addColorStop(0, `rgba(${lig.col},${(0.17 * n * fl * gain).toFixed(3)})`);
      g2.addColorStop(1, `rgba(${lig.col},0)`);
      pctx.fillStyle = g2;
      pctx.beginPath();
      pctx.ellipse(p.x, p.y, rp * 0.8, rp * 0.4, 0, 0, Math.PI * 2);
      pctx.fill();
    }
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
// haut-gauche), bordure de l'ère. Les PLANTATIONS (relief) sont des items du
// peintre par-dessus, cf. drawIsoLive. La bande sprite 3-slice a été RETIRÉE
// (« rendu étiré, peu de relief », Raph 2026-08-03).
export function drawIsoMedians(ctx, tp, T, z) {
  if (tp && tp.length) {
    const wtp = T * 0.26;                        // demi-largeur monde de la capsule (< refuge agents ±0.34)
    const ext = MEDIAN_TUNE.ext * T;
    // ÈRE À KIT (streetKits.js) : gazon au ton du pré, bordure dans la matière de
    // l'ère et ombre de bordure là seulement où la ville borde la couture ; pas de
    // parterres cuits — les plantations sont des objets du peintre (medianPlan).
    const L = CM.layout;
    const kit = L && streetKitFor((L.counts && L.counts.eraBand) | 0);
    // La zone cuite (une tuile de sol, cf. medianView) : seuls les segments qui
    // la touchent se dessinent.
    const view = medianView(T, z);
    if (kit && kit.median) drawKitMedians(ctx, tp, T, z, L, kit, wtp, ext, view);
    // Sans kit : pas de boulevard (bandes 0-1), donc pas de terre-plein. Le gazon
    // moucheté à PARTERRES d'avant le kit a été retiré le 2026-10-06 (MORT-13).
  }
}

// Capsule du terre-plein tracée en MONDE (bouts = demi-cercles échantillonnés) :
// projetée par worldToScreen, elle s'écrase naturellement en rondelle iso au sol.
function medianCapsulePath(ctx, ax, ay, bx, by, w) {
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
}

// ── LA ZONE CUITE (PERF-12, audit du 05/10) ─────────────────────────────────
// Le sol se cuit par TUILES (solPyramide.cookTile pose CM.cam/cw/ch sur la tuile)
// et chaque tuile repassait TOUS les segments de la ville : à la Fonte, 3,7 ms et
// ~6 800 gravillons par tuile, dont un sur mille tombait dans le canvas — 250 ms
// de plus par recuisson d'écran. Dans le repère u = wx − wy, v = wx + wy, la zone
// est un RECTANGLE (visibleDiamondBounds) et la couture d'un segment une droite :
// sa traversée se lit en deux intersections d'intervalles, sans projeter un point.
// Marge : deux tuiles monde au zoom (capsule, ombre portée, liseré, bac de fleurs).
// Une marge trop large coûte un segment dessiné pour rien ; trop serrée, elle
// trouerait le terre-plein au bord de la tuile — le banc d'empreinte
// (medianCull.test.js) vérifie que tout ce qui touche le canvas reste identique.
// A/B : globalThis.__medianCull = false rejoue le dessin complet (dev et tests).
function medianView(T, z) {
  if (import.meta.env?.DEV && globalThis.__medianCull === false) return null;
  const m = 2 * T * z + 8;
  return visibleDiamondBounds(m, m);
}
// Intervalle [w0, w1] de la coordonnée d'AXE (wx d'un segment 'h', wy d'un 'v')
// où la couture c traverse la zone ; w0 > w1 = elle la manque.
function medianSpan(V, horiz, c) {
  if (!V) return [-Infinity, Infinity];
  return horiz
    ? [Math.max(V.u0 + c, V.v0 - c), Math.min(V.u1 + c, V.v1 - c)]
    : [Math.max(c - V.u1, V.v0 - c), Math.min(c - V.u0, V.v1 - c)];
}
// Le segment (capsule de A à B, demi-largeur w) touche-t-il la zone ? Rend
// l'intervalle visible le long de l'axe, ou null.
function medianSegSpan(V, seg, ax, ay, bx, by, w) {
  const horiz = seg.axis === 'h';
  const span = medianSpan(V, horiz, horiz ? ay : ax);
  return span[0] <= (horiz ? bx : by) + w && span[1] >= (horiz ? ax : ay) - w ? span : null;
}
// Le GAZON PixelLab en motif écrasé 2:1, ancré au monde (origine =
// worldToScreen(0,0)) : une répétition couvre une tuile. Un seul par appel —
// l'image, l'échelle et l'ancre ne dépendent pas du segment.
function medianLawnPattern(ctx, art, T, z) {
  const pat = ctx.createPattern(art.img, 'repeat');
  if (pat) {
    const s = (T * z) / (art.img.naturalWidth || 64);
    const o = worldToScreen(0, 0);
    if (pat.setTransform) pat.setTransform(new DOMMatrix([s, 0, 0, s * 0.5, o.x, o.y]));
  }
  return pat;
}

// Ton moyen de la texture `median-lawn` (mesuré à l'écran le 2026-10-02) : le
// multiply qui la ramène au ton du kit se calcule contre lui.
const LAWN_TEX_TONE = [121, 148, 82];
// Le terre-plein d'une ère à kit, au bake. Gazon : la texture d'avant (même grain,
// ancrée au monde), ramenée au ton du pré du kit par un multiply — le gazon était
// deux fois plus clair que le pré (« trait de surligneur »). La saison décale ce
// ton comme elle décale l'herbe. Tout ce qui est l'ŒUVRE de la ville — sable
// stabilisé (Fonte), bandes de tonte (Néon), grilles de fonte au pied des arbres,
// bordure de la matière de l'ère ou liseré lumineux (ères cosmiques), ombre de
// bordure — ne se pose que dans les tranches que la ville borde ; ailleurs,
// l'herbe nue.
function drawKitMedians(ctx, tp, T, z, L, kit, wtp, ext, view) {
  const M = kit.median;
  const band = (L.counts && L.counts.eraBand) | 0;
  const winter = CM.season === WINTER;
  const tone = M.lawn ? M.lawn.map((c, i) => c * (SEASON_GRASS[i] / GRASS[i])) : SEASON_GRASS;
  const mul = tone.map((c, i) => Math.max(0, Math.min(255, 255 * c / LAWN_TEX_TONE[i])));
  const lawnArt = isoArt(winter ? 'median-lawn-winter' : 'median-lawn');
  const curb = M.curbGlow ? streetKitGlow(band) : M.curb;
  const pu = Math.max(1, Math.round(z));                 // un pixel d'art
  let pat;                                               // motif du gazon : un par appel
  for (const seg of tp) {
    const horiz = seg.axis === 'h';
    let ax, ay, bx, by;
    if (horiz) { ax = seg.x0 * T - ext; ay = (seg.y + 1) * T; bx = (seg.x1 + 1) * T + ext; by = ay; }
    else { ax = (seg.x + 1) * T; ay = seg.y0 * T - ext; bx = ax; by = (seg.y1 + 1) * T + ext; }
    // Hors de la zone cuite : rien à dessiner (cf. medianView).
    const span = medianSegSpan(view, seg, ax, ay, bx, by, wtp);
    if (!span) continue;
    const { runs, n } = medianUrbanRuns(L, seg);
    const s0 = horiz ? seg.x0 : seg.y0, c = horiz ? (seg.y + 1) * T : (seg.x + 1) * T;
    // Quadrilatère monde [u0, u1] le long de l'axe × [−v, +v] en travers, projeté.
    const quad = (u0, u1, v) => {
      const pts = horiz ? [[u0, c - v], [u1, c - v], [u1, c + v], [u0, c + v]]
        : [[c - v, u0], [c + v, u0], [c + v, u1], [c - v, u1]];
      pts.forEach(([x, y], k) => { const q = worldToScreen(x, y); if (k) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
      ctx.closePath();
    };
    // Découpe des tranches bordées par la ville.
    const urbanClip = () => {
      ctx.beginPath();
      for (const [i0, i1] of runs) {
        quad((s0 + i0) * T - (i0 === 0 ? ext + wtp + 2 : 0), (s0 + i1 + 1) * T + (i1 === n - 1 ? ext + wtp + 2 : 0), T / 2);
      }
      ctx.clip();
    };
    if (runs.length && curb) {
      ctx.save();
      urbanClip();
      ctx.translate(z * 1.4, z * 1.0);
      medianCapsulePath(ctx, ax, ay, bx, by, wtp);
      ctx.fillStyle = 'rgba(18,24,12,0.22)';
      ctx.fill();
      ctx.restore();
    }
    medianCapsulePath(ctx, ax, ay, bx, by, wtp);
    ctx.fillStyle = winter ? 'rgb(224,232,236)' : rgb(tone, 1);
    ctx.fill();
    if (pat === undefined) pat = lawnArt.ready ? medianLawnPattern(ctx, lawnArt, T, z) : null;
    if (pat) {
      ctx.fillStyle = pat;
      ctx.fill();
      if (!winter) {
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = rgb(mul, 1);
        ctx.fill();
        ctx.restore();
      }
    }
    if (!runs.length) continue;
    const segKey = seg.axis + ':' + (horiz ? seg.y + ':' + seg.x0 : seg.x + ':' + seg.y0);
    ctx.save();
    urbanClip();
    medianCapsulePath(ctx, ax, ay, bx, by, wtp);
    ctx.clip();
    if (M.ground === 'gravel') {
      // SABLE STABILISÉ des boulevards du Second Empire, piqué de gravillons au
      // pixel d'art (deux tons, au hash du monde : rien ne nage au pan).
      const g = winter ? [222, 226, 228] : M.gravel;
      ctx.fillStyle = rgb(g, 1);
      ctx.fill();
      const gl = rgb(g.map((v) => Math.min(255, v + 18)), 1), gd = rgb(g.map((v) => v * 0.8), 1);
      const len = (horiz ? bx - ax : by - ay), u0 = horiz ? ax : ay;
      for (let t = 0; t <= len; t += T * 0.05) {
        // Seulement là où la couture traverse la zone (span, marge comprise) ; le
        // pas de t reste celui d'avant — la graine des gravillons en dépend.
        if (u0 + t < span[0]) continue;
        if (u0 + t > span[1]) break;
        for (let k = -4; k <= 4; k += 1) {
          const h = cmHash('tpg:' + segKey + ':' + Math.round(t * 10) + ':' + k);
          if ((h & 255) > (winter ? 40 : 120)) continue;
          const off = k * wtp * 0.22 + (((h >>> 9) % 64) / 64 - 0.5) * wtp * 0.2;
          const u = u0 + t + (((h >>> 16) % 64) / 64 - 0.5) * T * 0.05;
          const q = worldToScreen(horiz ? u : c + off, horiz ? c + off : u);
          ctx.fillStyle = (h & 1) ? gl : gd;
          ctx.fillRect(Math.round(q.x), Math.round(q.y), pu, pu);
        }
      }
    }
    if (M.stripes && !winter) {
      // BANDES DE TONTE : une sur deux un cran plus claire, en travers de l'axe.
      ctx.beginPath();
      const w = T * 0.25, from = (horiz ? ax : ay) - wtp, to = (horiz ? bx : by) + wtp;
      for (let u = from, i = 0; u < to; u += w, i += 1) if (i & 1) quad(u, u + w, wtp + 1);
      ctx.fillStyle = 'rgba(255,255,236,0.07)';
      ctx.fill();
    }
    if (M.grate) {
      // GRILLES DE FONTE au pied des arbres d'alignement : un carré de terre posé
      // en losange, cerclé de fonte. Au sol, donc au bake : rien ne passe devant.
      const gr = T * 0.13;
      for (const sl of medianPlan(L, seg, T, kit)) {
        if (!sl.urban || sl.kind !== 'tree') continue;
        ctx.beginPath();
        [[gr, 0], [0, gr], [-gr, 0], [0, -gr]].forEach(([dx, dy], k) => {
          const q = worldToScreen(sl.wx + dx, sl.wy + dy);
          if (k) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y);
        });
        ctx.closePath();
        ctx.fillStyle = winter ? 'rgb(206,212,214)' : 'rgb(92,74,54)';
        ctx.fill();
        ctx.strokeStyle = 'rgb(42,51,47)';
        ctx.lineWidth = Math.max(1, z * 0.9);
        ctx.stroke();
      }
    }
    ctx.restore();
    if (curb) {
      ctx.save();
      urbanClip();
      medianCapsulePath(ctx, ax, ay, bx, by, wtp);
      ctx.strokeStyle = curb;
      ctx.lineWidth = Math.max(1, z * 0.9);
      ctx.stroke();
      ctx.restore();
    }
  }
}
