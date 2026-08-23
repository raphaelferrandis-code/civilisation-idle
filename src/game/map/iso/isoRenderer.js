"use strict";
// ── CHANTIER ISO — Phase 1 : renderer du JALON go/no-go ─────────────────────
// Rendu isométrique : LE rendu de la carte depuis que le pipeline top-down a été
// retiré (étapes 4 à 7, 2026-08-23). Il était né séparé de renderWorld — leçon
// greybox : ne pas infecter l'ancien de demi-conversions. Il réutilise LE MÊME layout et les
// helpers de sprites existants — il ne re-calcule rien côté jeu.
//
// Périmètre Phase 1 (voulu MINCE, on juge le SOL et la LISIBILITÉ) :
//   - sol en losanges flat-shaded (herbe/urbain/place/eau) + routes par matière d'ère ;
//   - habitations posées TELLES QUELLES (sprites actuels, ancrés au coin sud) ;
//   - tuiles moteur/civiques = SOCLE teinté (scènes → Phase 3) ;
//   - arbres = sapin minimal ; habitants = sprites actuels (4 dirs cardinales,
//     re-générés en diagonales en Phase 4) ; véhicules mis à jour mais PAS dessinés ;
//   - PAS de nuit/santé/LOD/lumières/ponts/quais/merveilles ici (Phases 3-5).
// Tuiles PixelLab iso : APRÈS le go (le jalon protège le budget d'art).
// `cmCellNoise` est parti avec la forêt sauvage, `cmWonderSlot` et
// `cmForEachWonderCell` avec le parvis (2026-08-23).
import { CM, cmHash, ROAD_E, ROAD_N, ROAD_S, ROAD_W, CM_WONDERS, cmWonderActiveIds, treeBandMul, treeCanvasT } from '../layout.js';
import { fp } from '../framePerf.js';
import { state } from '../../core/state.js';
import { worldToScreen, visibleCellBounds, visibleDiamondBounds, depthOf, panDeltaToScreen, screenDeltaToPan, wonderFootWorld, ISO_X, ISO_Y } from './projection.js';
import { drawPixelHouse, drawPixelHouseOutline, pixelHouseBox, pixelHouseReady } from '../pixelHouses.js';
import { WINTER } from '../seasonMode.js';
// Repointé sur la SOURCE le 2026-08-23 (étape 6) : `buildingShapes.js` ne faisait
// que ré-exporter ce symbole depuis engineSprites, et il est supprimé. Précédent
// identique : engineSceneCache.js importe déjà d'engineSprites directement.
import { drawWonder } from '../renderBuildings.js';

// LA MAISON DES PLAISIRS. Un monument permanent posé en pleine eau, au large :
// il n'a ni rang ni condition, donc rien à voir avec le cache des merveilles
// (indexé id+rang). Un seul fichier, un seul chargement.
// PPT PROPRE, et non celui des merveilles (34). Le sprite a été recadré au ras de
// son encre — la moitié du canevas d'origine était vide —, si bien qu'à 34 il
// n'aurait plus fait que 4,8 tuiles de large contre 6,6 avant recadrage.
// 25 lui rend exactement sa présence : 207 px à l'écran, 6,5 tuiles.
// ⚠ Ce nombre va AVEC les dimensions du PNG : redécouper le sprite sans reprendre
// le PPT le ferait grandir ou rétrécir en silence.
const PLAISIRS_PPT = 25;
let plaisirsArt = null;
function plaisirsSprite() {
  if (!plaisirsArt) {
    plaisirsArt = { img: new Image(), ready: false };
    plaisirsArt.img.onload = () => { plaisirsArt.ready = true; };
    plaisirsArt.img.src = '/pixelart/wonders/plaisirs-t3.png';
  }
  return plaisirsArt.ready ? plaisirsArt : null;
}

// MASQUE D'ENCRE de la tour. Le survol et le clic doivent tomber sur le
// BÂTIMENT, pas sur son rectangle : le sprite est une pagode à plateaux et son
// encre n'occupe que x ∈ [0,17 ; 0,89] et y ∈ [0,25 ; 0,94] du PNG (mesuré) —
// un quart de la hauteur au-dessus de la flèche est vide, et ce vide-là est
// posé sur le FLEUVE. Au rectangle, viser l'eau à trois tuiles du pied
// allumait le monument et ouvrait l'onglet.
// Lu UNE fois, à la taille naturelle du PNG (224×376), soit 84 ko de masque.
// `undefined` = pas encore tenté, `null` = illisible (canvas souillé), on
// retombe alors sur la boîte.
let plaisirsMask;
function plaisirsInk() {
  if (plaisirsMask !== undefined) return plaisirsMask;
  const art = plaisirsSprite();
  // Sprite pas encore chargé : on ne MÉMORISE PAS cet échec, il se corrigera
  // tout seul à la frame où l'image arrive.
  if (!art || typeof document === 'undefined') return null;
  const w = art.img.naturalWidth | 0, h = art.img.naturalHeight | 0;
  if (!w || !h) return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.drawImage(art.img, 0, 0);
  let d;
  try { d = cx.getImageData(0, 0, w, h).data; } catch { plaisirsMask = null; return null; }
  const a = new Uint8Array(w * h);
  for (let i = 0, n = w * h; i < n; i += 1) a[i] = d[i * 4 + 3] > 24 ? 1 : 0;
  plaisirsMask = { w, h, a };
  return plaisirsMask;
}

// SURVOL ET CLIC DE LA MAISON DES PLAISIRS : UN SEUL test, partagé par
// l'infobulle et par le clic (cityMapRuntime). Deux tests séparés finiraient
// par diverger, et on aurait un liseré qui s'allume là où le clic n'ouvre rien.
// Part de la boîte RÉELLEMENT DESSINÉE à la dernière frame, puis descend au
// pixel du masque.
export function plaisirsHitTest(sx, sy) {
  const b = CM._plaisirsBox;
  if (!b) return false;
  if (sx < b.dx || sx > b.dx + b.dw || sy < b.dy || sy > b.dy + b.dh) return false;
  const m = plaisirsInk();
  if (!m) return true;                       // pas de masque : la boîte fait office
  // Tolérance d'UN pixel source autour du point visé : garde-corps, lanternes et
  // haubans ne font qu'un ou deux pixels de large, un test strict les rendrait
  // invisibles à la souris alors qu'ils portent la silhouette.
  const u = Math.min(m.w - 1, ((sx - b.dx) / b.dw) * m.w | 0);
  const v = Math.min(m.h - 1, ((sy - b.dy) / b.dh) * m.h | 0);
  for (let dv = -1; dv <= 1; dv += 1) {
    const y = Math.min(m.h - 1, Math.max(0, v + dv));
    for (let du = -1; du <= 1; du += 1) {
      const x = Math.min(m.w - 1, Math.max(0, u + du));
      if (m.a[y * m.w + x]) return true;
    }
  }
  return false;
}
// (engineStage n'était importé QUE pour choisir le stade de l'aqueduc-conduite,
//  retiré le 2026-08-05. Les points d'eau ont leur propre échelle d'ère, alignée
//  sur celle des places — cf. waterPointEra.)
import { glInit, glBegin, glQuad, glFlush, glGetCanvas } from '../glPainter.js';
// Outil de calibrage des feux de position : n'expose que window.__navCalib et
// ne fait rien tant qu'on ne l'appelle pas (aucun coût en jeu). Il ne nous
// importe RIEN en retour (cycle ES = zone morte) : on lui pousse sa config.
// Vie de surface de l'eau. Même contrat que navCalib : il ne nous importe rien
// en retour (cycle ES = zone morte), on lui pousse ce dont il a besoin.
import { drawIsoRiverLife } from './isoRiverLife.js';
import {
  LIGHT_LAYER, beginLightLayer, endLightLayer,
  lightCtx, lightCut, lightCutImage,
} from '../lightLayer.js';
import { cityMapDrawQuays, updateCrisis, ensureQuayGate, quayWallTune } from '../quaysAndRiot.js';
import { drawCritterIso } from '../critters.js';
import { drawIsoBridgeUnder, drawIsoBridgeNight, pushIsoBridgeItems, drawIsoBridgeSeg, bridgeBlocks, drawIsoBridges } from './isoBridge.js';
// LA FLOTTE, CÔTÉ RENDU — extraite d'ici le 2026-08-23 (Q10) : pose de coque,
// stade de commerce, feux de navigation, passe de nuit, évitement d'obstacles.
// Sa couture avait ZÉRO dépendance retour vers ce fichier, d'où l'extraction.
import { drawIsoShipNight } from './isoFleet.js';
// Passe AÉRIENNE (oiseaux, drones) et outils numériques partagés — extraits le
// 2026-08-23. `_frac`/`_rnd` vivent à part pour qu'aucun module extrait n'ait à
// importer depuis isoRenderer (cycle → TDZ).
import { drawIsoBirds, drawIsoDrones } from './isoSky.js';
// Parvis des merveilles (ensemble de cellules) et forêt sauvage — extraits le
// 2026-08-23. Le parvis vit à part parce que DEUX passes le lisent : le sol y pose
// son dallage, la forêt refuse d'y planter.
import { WONDER_GROUND, wonderGroundSet, drawWonderGroundAll } from './isoWonderGround.js';
import { GL_RUN_MIN, WILD_THIN_UNIT, isoWildForest } from './isoWildForest.js';
// Socle partagé, extrait le 2026-08-23 : les chemins du repère monde et le cache
// d'art. Deux feuilles du graphe — elles débloquent le pont, le champ et le port.
import { diamondPath, fillWorldQuad, pathWorldQuad } from './isoQuad.js';
import { isoArt } from './isoArt.js';
// Le tissu urbain (bâti / cour / friche), extrait le 2026-08-23. C'est un MODÈLE :
// tissuMetrics le lit aussi, et n'a plus à traverser le peintre pour ça.
import { builtCells, builtNear, COUR, courOf } from './isoTissu.js';
// Les clôtures et leur bande de panneaux, extraites le 2026-08-23.
import { fenceStrip, isoFencesFor } from './isoFence.js';
// La voirie (tons, largeurs, tuiles, voile d'ère, trottoir), extraite le 2026-08-23.
// Que de la config : une feuille du graphe, que tout le monde peut lire.
import {
  roadTone, isoRoadHalfW,
  ROAD_DETAIL, roadVeilFor, SIDEWALK_ISO,
} from './isoRoad.js';
// La rue : lampadaires, mobilier, terre-pleins, et la nuit qui les allume.
// Extraite le 2026-08-23. Pendant d'isoRoad — là-bas la chaussée, ici ses bords.
import {
  isoLamps, streetPropEra, isoStreetPropsFor, lampEraForBand,
  LAMP_V, LAMP_TUNE, lampFootMetrics, medianSlots, drawIsoMedians,
  drawIsoNight, isoLampLightFrame, lampLit, lampGlowBox, paintLampGlow,
} from './isoStreet.js';
// Les matières du sol (herbe, lisière, frange, sol urbain, front de rue), extraites
// le 2026-08-23. ⚠ L'état de SAISON vit là-bas avec son écrivain : ici on ne fait
// que le LIRE — une liaison ESM est vivante, la valeur suit.
import {
  SEASON_GRASS, SEASON_WILD, refreshSeasonPalette,
  seasonTree, smoothNoise,
  FRONTIER, isoBuildingFront, isoFrontOffset, frontierFlip,
  urbanMatFor, roadFringeK, drawRoadEdgeFringe, roadMatFor,
  drawGrassDetailAll, drawGrassFringeAll,
} from './isoGroundDetail.js';
// L'ambiance (particules, fumée, chevron) et le champ, extraits le 2026-08-23.
import { drawIsoAmbient, SMOKE_TUNE, smokeSeason, drawIsoSmoke, REVEAL_PIN_MS, drawIsoRevealPin } from './isoAmbient.js';
import { drawIsoField } from './isoField.js';
// Le BALAYAGE DE CELLULES, sorti de drawIsoGround le 2026-08-23. Trois objets en
// paramètre parce qu'il lisait 27 variables : contexte de cuisson, résolveurs, tampons.
import { sweepIsoGroundCells } from './isoGroundCells.js';
// Objets posés au sol (points d'eau, art au sol, décor d'île), extraits le 2026-08-23.
import { waterPointEra, WATER_POINT_P, drawIsoGroundedArt, ISO_TREE_VARIANTS, ISO_BUSH_VARIANTS, ISLAND_DECO } from './isoGroundProps.js';
// Le port fluvial (flotte legacy sur le ruban, quai, ponton), extrait le 2026-08-23.
import { drawIsoShips, portMooring, drawIsoPortBoat, drawIsoRiverside } from './isoPort.js';
// Matière du sol : tuiles PixelLab et grève, extraites le 2026-08-23. Le peintre
// (blitIsoTileKey, le sol, le trottoir) est resté ici ; seul le CATALOGUE est parti.
import { ISO_TILE_KEYS, ensureIsoTileKey, plazaEraTileKey, BEACH, blitIsoTileKey } from './isoGroundTiles.js';
// Palette plate du sol, extraite le 2026-08-23. Feuille du graphe : elle n'importe
// rien, donc tout peut la lire. ⚠ L'état de SAISON est resté ici (plus bas) — il est
// réassigné chaque frame, et une liaison importée est en lecture seule.
import { rgb, HOVER_GOLD } from './isoPalette.js';
// La météo qui tombe (pluie, éclats, neige), extraite le 2026-08-23. Elle emporte
// les teintes de flocon, qui traînaient dans la section « liseré d'herbe ».
import { drawIsoRain } from './isoWeather.js';
// Le fleuve, extrait le 2026-08-23 : le ruban d'eau vivant et tout ce qui bat sa
// berge. Trois symboles suffisent au peintre — il peint, et il sait découper sur
// l'eau.
import { drawIsoRiver } from './isoRiver.js';
// Les unités mobiles (véhicules, émeutiers, objets portés) et leur profondeur au
// tri, extraites le 2026-08-23.
import { drawIsoVehicle, drawIsoRioter, drawIsoCitizenItem, GHOST_TUNE, isoUnitDepth, isoUnitDepthEx } from './isoUnits.js';
// Scènes moteur et liserés de sprite, extraits le 2026-08-23.
import { isoEngineScenesFlag, drawSpriteOutline, drawIsoEngineScene } from './isoEngineScene.js';
// AURA DE LA MAISON DES PLAISIRS. Module à part (le renderer pèse déjà 11 000
// lignes) et sans import retour : il ne connaît que CM, la projection et les
// deux couches de lumière — donc aucun cycle ES avec nous.
import { drawPlaisirsRing, drawPlaisirsSky, queuePlaisirsGlow } from './isoPlaisirs.js';
import {
  updateCitizens, updateVehicles, drawCitizenThoughts,
  vehicleLaneOffset, VEH_SIZES,
  // le lot bateaux est parti avec isoPort.js, les drones avec isoSky.js
  AGENT_SCALE, VEH_SCALE,                         // le reste du lot est parti avec isoUnits.js
} from '../agents.js';
// PLACE COMPOSÉE : tout le modèle (rôles des cellules, recettes par ère, tailles
// en tuiles, molette __plaza) vit dans isoPlaza.js. Ici on ne fait que pousser
// ses items dans le tri peintre. Cf. docs/PLACES-ISO-COMPOSEES.md.
import {
  isoPlazaBox, isoPlazaBoxes, plazaEraForBand, isoPlazaItems,
  isoPlazaKitOn, isoPlazaSceneOn, isoPlazaSceneCoversGround,
  drawIsoPlazaProp, drawIsoPlazaGrid,
  // personHT : les POINTS D'EAU se cotent au même étalon que le mobilier de
  // place — la hauteur d'un habitant. Cf. § POINTS D'EAU.
  personHT,
  // La FONTAINE de la scène de place est rentrée ici le 2026-08-23 : elle décrivait
  // déjà une scène de ce module.
  FA_V, FOUNTAIN_ANIM, FOUNTAIN_TUNE,
} from './isoPlaza.js';
// MOBILIER DE TROTTOIR : la POSE vit là-bas (corps pur, testable), le dessin
// reste celui du kit des places. Cf. § MOBILIER DE TROTTOIR plus bas.
import { STREET_PROPS } from './isoStreetProps.js';

// PALETTE DE SAISON, résolue une fois par frame depuis CM.season. Ces variables
// remplacent GRASS / GRASS_WILD / GD_TIP partout où le SOL est peint : le sol
// étant baké, elles ne sont relues qu'à la recuisson, et la saison figure dans
// la clé du bake. Les constantes ci-dessus restent la référence d'été.
// ── LE TROTTOIR EST PEINT EN PIXELS, JAMAIS AU VECTEUR ──────────────────────
// (Raph 2026-08-05 : « je ne veux plus de tracé au vecteur ».)
//
// LE PROBLÈME, dans les termes exacts où il se pose. Le sol est fait de TUILES
// blittées à `k = T·z/32` : un pixel d'art y occupe z pixels de canvas. Les
// couches du trottoir, elles, étaient des `fill()` de quads projetés — donc
// rastérisées à la résolution du CANVAS, avec un bord antialiasé d'UN pixel. À
// zoom 3, la bande était bordée d'un trait trois fois plus fin que le plus petit
// détail de l'art qui l'entoure. C'est ça, « lisse et pas pixel » : pas une
// affaire de couleur, une affaire de RÉSOLUTION.
//
// LA PARADE. On peint toute la passe trottoir dans un calque à l'échelle de
// l'ART (zoom 1 : une cellule y fait 64×32 px, la taille native d'une tuile),
// puis on agrandit ce calque ×z en NEAREST. Chaque pixel tracé devient un bloc
// de z pixels, exactement comme un pixel de tuile — bords en marches, aucun
// demi-ton. Bénéfice second : la matière du trottoir y est blittée à 1:1 exact
// (k = 64/64), donc sans rééchantillonnage du tout.
//
// L'ALIGNEMENT EST EXACT, et c'est ce qui rend la manœuvre sûre : dans le calque
// `sx = (u − u_cam) + wArt/2`, et on le repose en `ox + sx·z` avec
// `ox = cw/2 − wArt·z/2`, ce qui redonne `(u − u_cam)·z + cw/2` — la projection
// du bake, au bit près. Aucun décalage à compenser, aucune dérive au défilement.
//
// COÛT MESURÉ, en alternant pixel/vecteur d'une recuisson à l'autre (le seul
// A/B honnête ici, cf. les pièges de mesure du projet), bake de 346 cellules à
// zoom 3,24 : passe trottoir **0,7 ms en pixels contre 0,4 ms au vecteur**, sur
// ~10 ms de bake total — et le bake ne tourne qu'à la recuisson, pas par frame.
// Le calque fait cw/z × ch/z, soit ~1/z² de surface à rastériser : ce qu'on perd
// à composer, on le regagne à peindre.
let _walkLayer = null;
function walkLayerBegin(z) {
  const wArt = Math.ceil(CM.cw / z) + 2, hArt = Math.ceil(CM.ch / z) + 2;
  if (!_walkLayer || _walkLayer.w !== wArt || _walkLayer.h !== hArt) {
    const c = (typeof OffscreenCanvas !== 'undefined')
      ? new OffscreenCanvas(wArt, hArt) : document.createElement('canvas');
    c.width = wArt; c.height = hArt;
    const cx = c.getContext('2d');
    if (!cx) return null;
    _walkLayer = { c, ctx: cx, w: wArt, h: hArt };
  }
  const lay = _walkLayer;
  lay.ctx.setTransform(1, 0, 0, 1, 0, 0);
  lay.ctx.clearRect(0, 0, lay.w, lay.h);
  // Bascule du repère de projection : worldToScreen lit CM.cam.zoom et CM.cw/ch.
  lay.saved = { zoom: CM.cam.zoom, cw: CM.cw, ch: CM.ch };
  CM.cam.zoom = 1; CM.cw = lay.w; CM.ch = lay.h;
  return lay;
}
function walkLayerEnd(lay, ctx, z) {
  const s = lay.saved;
  CM.cam.zoom = s.zoom; CM.cw = s.cw; CM.ch = s.ch;
  const ox = s.cw / 2 - (lay.w * z) / 2, oy = s.ch / 2 - (lay.h * z) / 2;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(lay.c, 0, 0, lay.w, lay.h, ox, oy, lay.w * z, lay.h * z);
  ctx.imageSmoothingEnabled = prev;
}
// (Une MATIÈRE DE TROTTOIR a vécu ici — table de tons par bande et résolution
//  de tuile dédiée, avec son art `walk-stone` / `walk-granite`. Retirée le
//  2026-08-05 en même temps que la bande : le sol de ville EST le trottoir, il
//  n'a donc pas de matière propre. Cf. le § LA MARCHE, ET RIEN QUE LA MARCHE,
//  dans la passe route.)

// ── SOL (baké : ~10-30 ms une fois par zoom/marge, blitté ensuite) ────────────
// Les cellules-route ne remplissent PLUS tout leur losange (1er jet : rue aussi
// large qu'un îlot → grille illisible). Comme en legacy : fond de TROTTOIR (ton
// urbain) + RUBAN de chaussée plus étroit le long des connexions (masque E/O/S/N).
// BAKE ALLÉGÉ (posé par drawIsoWorld le temps d'un geste) : on garde ce qui porte
// la LECTURE de la carte (aplats de sol, rubans de chaussée, marquages) et on saute
// les détails fins — touffes/fleurs/prés, frange d'herbe, textures de tuiles, trame
// de matière urbaine + voile, joints de trottoir, frange de chaussée. ~4× moins
// cher (ils pèsent ~75 % de la recuisson) → un pan hors marge tient en ~1 frame au
// lieu de figer. Le bake plein reprend la main dès l'arrêt (~160 ms).
// DEUX niveaux d'allégé (2026-07-27, retour Raph « sol tout blanc quand la
// caméra bouge ») :
//   - HARD (l'historique) : ni textures ni voiles ni détails — l'aplat. Réservé
//     aux machines où même le light ne tient pas le budget.
//   - LIGHT : garde les TEXTURES de tuiles (urbain/routes/terre) et les VOILES
//     de nuance/prés — ce qui tue l'aplat — et ne sacrifie que les détails fins
//     par cellule (touffes/fleurs, frange d'herbe, joints de trottoir, flancs
//     de chaussée), mesurés comme le vrai gros du coût (herbe 25 ms + frange
//     22,5 ms sur 108 ms à zoom 0,35).
const ISO_GROUND_LOD = { on: false, light: false };
function drawIsoGround() {
  const L = CM.layout, ctx = CM.ctx, T = CM.TILE, z = CM.cam.zoom;
  const LOD = ISO_GROUND_LOD.on;
  // HARD = l'allégé historique ; en light, les gates marqués !HARD restent actifs.
  const HARD = LOD && !ISO_GROUND_LOD.light;
  const hw = T * z * ISO_X;            // demi-largeur du losange
  const hh = T * z * ISO_Y;            // demi-hauteur
  const b = visibleCellBounds(hw * 2);
  // Profileur opt-in (globalThis.__isoGroundProfile = true) — même idiome que
  // __layoutProfile : coût nul éteint, phases en ms dans __isoGroundProfileLast.
  const PR = globalThis.__isoGroundProfile
    ? { n: 0, flat: 0, tiles: 0, grass: 0, cells: 0, fringe: 0, roads: 0, median: 0, total: 0, t0: performance.now() }
    : null;
  const band = (L.counts && L.counts.eraBand) | 0;
  const mat = urbanMatFor(band), urb = mat.tone;
  const road = roadTone(ROAD_DETAIL.band != null ? ROAD_DETAIL.band : band);   // honore le forçage d'aperçu
  const riverCells = (L.river && L.river.present && L.river.cells) || null;
  const roadMap = L.roadMap;
  const roads = [];                    // cellules-route de la passe (rubans après le fond)
  const fringes = [];                  // arêtes herbe↔sol de la passe (frange après le fond)
  const wonderCells = [];              // (gx, gy, px, py) du parvis — dallage + margelle après le fond
  const wg = WONDER_GROUND.on ? wonderGroundSet(L) : null;   // parvis des merveilles
  // Résolution du TYPE de sol par cellule, MÉMOÏSÉE : le même verdict sert au
  // fond ET aux tests de voisinage de la frange d'herbe (aucune divergence
  // possible). kind = tuile PixelLab ; le ton d'aplat s'en déduit. L'EAU n'est
  // pas peinte ici : le fleuve est un RUBAN LIVE lissé par-dessus le bake
  // (drawIsoRiver) — le sol sous l'eau reste de l'herbe (berges douces).
  // Quand la SCÈNE de place de l'ère est décodée, la dalle claire disparaît
  // (la scène porte son propre dallage — l'ancienne dalle dépassait autour,
  // retour Raph) : les cellules plaza redeviennent du sol urbain calme.
  // En place COMPOSÉE (mode par défaut) il n'y a plus d'image qui porte le
  // dallage : la dalle de sol redevient l'esplanade, et le mobilier se pose
  // dessus. D'où le test sur le MODE, pas seulement sur le décodage du PNG.
  const plazaEra = plazaEraForBand(band);
  const plazaSceneReady = !!(plazaEra && isoPlazaSceneCoversGround(band) && isoArt('plaza-' + plazaEra).ready);
  // Résolu UNE FOIS par recuisson : l'ère est celle de la bande, elle ne change
  // pas d'une cellule à l'autre. Résoudre par cellule ferait 4 lectures de cache
  // sur chaque cellule de place pour un verdict identique.
  const plazaKey = plazaEraTileKey(plazaEra);
  const keyOfKind = (k) => (k === 'plaza' ? plazaKey : ISO_TILE_KEYS[k]);
  // ⚠ MESURÉ, NE PAS « OPTIMISER » : cette Map est reconstruite à chaque
  // recuisson, donc à chaque cran de zoom, alors que le verdict de kindAt ne
  // dépend NI du zoom NI de la caméra (seulement du layout, du décodage du sprite
  // de place, de l'aperçu de merveille et des molettes __wonderGround/__frontier).
  // La mettre en cache sur l'objet layout — même geste que builtCells(L) juste
  // au-dessus — a été implémenté puis RETIRÉ le 2026-07-24 : cache vérifié
  // effectivement réutilisé (même objet, 27 252 cellules, signature stable sur 4
  // recuissons) et le temps n'a PAS bougé (2326 / 2116 / 1650 / 1971 ms). A/B
  // alterné dans les deux sens : 2029 contre 2066 ms.
  // Le coût de cette boucle est la RASTÉRISATION des losanges (aplat + liseré
  // anti-couture par cellule), pas la classification. Même conclusion que pour les
  // quais : sur cette carte, ce qui coûte est toujours le tracé, jamais le JS.
  const kinds = new Map();
  // ── Décision de la LISIÈRE QUI DIVAGUE, déclarée AVANT kindAt qui l'appelle.
  // (Un const déclaré après son appelant marche tant que l'appel est différé,
  // mais c'est le motif exact qui a déjà produit un TDZ en production ici : on
  // ne le rejoue pas.) Ne lit QUE le layout, jamais kindAt — kindAt l'appelle,
  // l'inverse bouclerait.
  const urbanLogical = (gx, gy) => !!(L.urbanSet && L.urbanSet.has(gx + ',' + gy));
  const built = builtCells(L);
  const courK = courOf(L);      // quartier / cour / friche par cellule (cf. COUR)
  const frontierFlips = (gx, gy, isUrban) => frontierFlip(gx, gy, isUrban, urbanLogical, built);
  // ── PLAGE DES BERGES DU FLEUVE (Raph, 2026-07-30 : « il faut générer une
  // plage ») ──────────────────────────────────────────────────────────────────
  // Elle va là où la maçonnerie du quai s'arrête : l'emprise du port (que
  // `ensureQuayGate` coupe exprès), les passages trop étroits pour un mur, les deux
  // extrémités du fleuve. Le pourtour des ÎLES, lui, est TRACÉ (drawIsoIslandShore)
  // et non baké : voir son en-tête, la grille est trop grossière à cette taille.
  //
  // ⚠ POURQUOI UNE MATIÈRE BAKÉE PAR CELLULE SUR LES BERGES. Ce projet a déjà
  // rejeté trois fois une nappe lisse posée sur du pixel art (le grain d'eau, les
  // vaguelettes, les filets de courant) : sur une large étendue, une plage doit
  // être de la MATIÈRE avec du grain, pas un aplat. Le prix est que la cellule est
  // alignée sur la grille, donc le bord EXTÉRIEUR de la plage est en escalier.
  // Ça passe ici, contrairement à la jonction herbe↔ville (7 refus) : le bord
  // INTÉRIEUR, au ras de l'eau, est recouvert par le ruban du fleuve — l'escalier
  // ne touche jamais la ligne d'eau — et un bord sable↔herbe dentelé se lit comme
  // un rivage irrégulier, là où un escalier eau↔terre se lit comme un bug.
  // ⚠ Le gate doit être FRAIS ici : le sol est baké AVANT le fleuve dans la frame,
  // donc personne ne l'a encore calculé au premier passage. Idempotent et caché
  // par layout, l'appel ne coûte rien les fois suivantes.
  ensureQuayGate();
  const beachIsles = (L.river && L.river.islands) || null;
  // ÎLES : toute cellule que l'ellipse touche. Les 4 coins et le centre sont
  // testés, donc les cellules du bord entrent aussi — l'île est pleine, sans trou.
  const beachIslandAt = (gx, gy) => {
    if (!BEACH.on || !beachIsles || !beachIsles.length) return false;
    for (const il of beachIsles) {
      const rx = Math.max(0.001, il.rx), ry = Math.max(0.001, il.ry);
      for (const [px, py] of [[gx, gy], [gx + 1, gy], [gx, gy + 1], [gx + 1, gy + 1], [gx + 0.5, gy + 0.5]]) {
        const dx = px - il.x, dy = py - il.y;
        const al = dx * il.tx + dy * il.ty, cr = -dx * il.ty + dy * il.tx;
        if (Math.hypot(al / rx, cr / ry) <= 1) return true;
      }
    }
    return false;
  };
  const beachBanks = (L.river && L.river.banks) || null;
  // ⚠ LE PORT EST EXEMPTÉ DE L'EXCLUSION DES CELLULES BÂTIES. Retour Raph : « il y
  // a une bande de gazon au port qui coupe la plage en 2 ». Mesuré : sur les 72
  // cellules de berge concernées, 4 étaient écartées comme bâties — et les 4
  // appartiennent au port. Son emprise (4×5) mord la berge en plein milieu de la
  // grève et y laissait l'herbe. Or un port de rivière est un PONTON posé sur le
  // rivage : du sable dessous est juste, et son sprite recouvre les cellules de
  // toute façon. Les autres bâtiments gardent l'exclusion — pas de sable sous une
  // maison — et les ROUTES aussi (une rampe vers le quai reste une rampe).
  const beachPortCells = new Set();
  for (const t of (L.tiles || [])) {
    if (t.buildingId !== 'river_ports') continue;
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    for (let ax = 0; ax < sx; ax += 1) for (let ay = 0; ay < sy; ay += 1) beachPortCells.add((t.gx + ax) + ',' + (t.gy + ay));
  }
  const beachPts = (CM.quayGate && CM.quayGate.gapPts) || null;
  // BERGES : une cellule de `river.banks` — donc qui TOUCHE l'eau par construction,
  // impossible de dériver vers l'intérieur des terres — et proche d'un point où le
  // quai ne trace pas (cf. gapPts dans renderWorld pour les deux formes ratées qui
  // ont mené à celle-ci). Le rayon fait de la coupe de 4 samples du port une
  // grève d'une douzaine de tuiles, assez pour se lire, et fond la plage dans la
  // maçonnerie au lieu de l'arrêter net contre elle.
  const beachBankAt = (gx, gy, key) => {
    if (!BEACH.on || !beachBanks || !beachPts || !beachPts.length) return false;
    if (!beachBanks.has(key)) return false;
    const cx = gx + 0.5, cy = gy + 0.5, r2 = BEACH.bankR * BEACH.bankR;
    for (const p of beachPts) {
      const dx = cx - p.x, dy = cy - p.y;
      if (dx * dx + dy * dy <= r2) return true;
    }
    return false;
  };
  // ÎLES : anneau extérieur de l'ellipse, en coordonnées de l'île (`tx,ty` = le sens
  // du courant). Test ANALYTIQUE, donc exact quelle que soit l'orientation — aucun
  // jeu de cellules à maintenir pour l'île.
  //
  // ⚠ TESTÉ AVANT LE SOL DE VILLE, et c'est indispensable : les cellules de l'île
  // sont dans `urbanSet` (c'est l'emprise de la merveille qui l'a fait naître), donc
  // la branche « sol de ville » les prenait toutes et la plage ne sortait JAMAIS.
  // Mesuré sur l'Aiguille : 60 cellules urbaines sur les 89 de l'ellipse, 0 berge
  // classée. Le parvis d'une merveille (kind 'wonder') garde en revanche la
  // priorité, et les routes aussi — un pont qui traverse l'île reste un pont.
  // ⚠⚠ ON TESTE LA CELLULE ENTIÈRE, PAS SON CENTRE — et sans tirage au sort.
  // Retour Raph : « le contour n'est pas bien fait, on veut un joli contour
  // identique ». La v1 testait le seul centre de la cellule et faisait divaguer la
  // largeur au hasard : sur un fuseau de 4,8 tuiles de large, la grille est trop
  // grossière pour ça et le rivage sortait en POINTILLÉ — des bouts de sable
  // séparés par des bouts d'herbe. Le hasard qui donne une jolie lisière sur une
  // grande étendue (cf. FRONTIER) casse un anneau étroit.
  //
  // On échantillonne donc les 4 coins ET le centre, on garde la distance MINIMALE,
  // et un point hors de l'ellipse compte pour 0 : toute cellule que le bord
  // TRAVERSE entre dans l'anneau. L'anneau est alors FERMÉ par construction —
  // aucune cellule frontière ne peut être sautée — et d'épaisseur régulière.
  const kindAt = (gx, gy) => {
    const key = gx + ',' + gy;
    const hit = kinds.get(key);
    if (hit !== undefined) return hit;
    let k;
    const isRoad = L.roadSet.has(key);
    const cell = isRoad && roadMap ? roadMap.get(key) : null;
    const isWater = !!(riverCells && riverCells.has(key));
    if (cell && cell.rank === 'plaza') k = plazaSceneReady ? 'urban' : 'plaza';   // ⚠ piège places-dans-roadSet
    // Parvis de merveille : l'emprise réservée porte son dallage propre (l'eau
    // garde la priorité — le ruban du fleuve passe dessus, berges douces).
    else if (!isWater && wg && wg.has(key)) k = 'wonder';
    // ── L'ÎLE EST ENTIÈREMENT EN SABLE ────────────────────────────────────────
    // Demande de Raph (2026-07-30, après l'anneau) : « fais toute l'île en sable ».
    // Toute cellule que l'ellipse touche, pas seulement son pourtour — le test
    // porte sur les 4 coins et le centre, donc les cellules du bord entrent aussi
    // et il ne reste aucun trou. Le contour TRACÉ (drawIsoIslandShore) garde son
    // rôle : lui seul suit la courbe au pixel et lisse l'escalier des cellules
    // sur la ligne d'eau. Priorité AVANT le sol de ville, sans quoi l'emprise de
    // la merveille reprendrait l'île (mesuré : 60 cellules urbaines sur 89).
    else if (!isWater && !isRoad && (!built.has(key) || beachPortCells.has(key))
      && beachIslandAt(gx, gy)) k = BEACH.mat;
    // ── PLAGE SUR LES BERGES DU FLEUVE, AVANT LE SOL DE VILLE ─────────────────
    // ⚠ Cette priorité est le cœur du correctif, et elle a coûté deux essais.
    // Les cellules concernées sont presque toutes dans `urbanSet` : celles de
    // l'ÎLE parce que c'est l'emprise de la merveille qui l'a fait naître (mesuré
    // 60 sur 89), celles du PORT parce que le port et son tissu sont de la ville
    // (mesuré 13 des 59 cellules du trou de quai). Testée après « sol de ville »,
    // la plage ne sortait donc JAMAIS là où Raph la demandait — seulement aux
    // extrémités du fleuve, hors carte. Ce qui garde la priorité : le parvis d'une
    // merveille, les ROUTES (un pont qui traverse l'île reste un pont) et toute
    // cellule BÂTIE — sauf le PORT lui-même, cf. beachPortCells : son emprise
    // mordait la grève en plein milieu et y laissait une bande d'herbe.
    else if (!isWater && !isRoad && (!built.has(key) || beachPortCells.has(key))
      && beachBankAt(gx, gy, key)) k = BEACH.mat;
    // Routes HORS tissu urbain : fond d'HERBE depuis le 2026-07-20 (retour Raph :
    // le fond de cellule 'dirt' — aplat terre + tuile de mottes — dépassait du
    // ruban en « pavé de terre » cranté à la jonction herbe↔sol). Le chemin se
    // lit par sa dalle + ourlet/épaulement CONTINUS ; le kind 'dirt' n'est plus
    // produit mais sa plomberie (texAlpha/fringe) reste, knob de retour facile.
    else if (!isWater && L.urbanSet && L.urbanSet.has(key)) {
      // Sol de ville : pavé près du bâti, cour de terre plus loin, friche au-delà
      // (cf. COUR — c'est ici que la moitié vide de la ville cesse d'être minérale).
      k = courK.get(key) || 'urban';
    } else if (!isWater && riverCells && L.river.banks && L.river.banks.has(key) && L.urbanSet
      && (L.urbanSet.has((gx + 1) + ',' + gy) || L.urbanSet.has((gx - 1) + ',' + gy)
        || L.urbanSet.has(gx + ',' + (gy + 1)) || L.urbanSet.has(gx + ',' + (gy - 1)))) {
      // QUAI-LITE : une berge qui touche le tissu urbain se pave (berge bâtie) —
      // esquisse des quais legacy ; le vrai quai par ère viendra avec l'art Phase 5.
      k = 'urban';
    } else k = 'grass';   // teinte UNIFORME (couture in-grid/sauvage retirée)
    // LISIÈRE QUI DIVAGUE : la frontière ville↔campagne serpente au lieu de
    // suivre l'emprise au cordeau (cf. FRONTIER). Retour de matière SEULEMENT :
    // ni route, ni eau, ni dallage formel, et jamais une cellule bâtie.
    // Depuis le lot COUR, la limite ville↔campagne n'est plus `urban`↔`grass`
    // mais `dirt`↔`grass` : la friche s'intercale. Faire divaguer l'ANCIENNE
    // couture ne ferait plus rien (les deux matières ne se touchent presque
    // jamais) — c'est le bord de la cour qui doit serpenter, et une cellule
    // reprise à l'herbe revient en TERRE, pas en pavé.
    if (FRONTIER.on && !isRoad && !isWater && (k === 'urban' || k === 'dirt' || k === 'grass')) {
      const cityish = k !== 'grass';
      if (frontierFlips(gx, gy, cityish)) k = cityish ? 'grass' : (COUR.on ? 'dirt' : 'urban');
    }
    // Diagnostic opt-in (globalThis.__beachStats = true) : combien de cellules de
    // chaque matière le bake a classées. Éteint, coût nul (un test de drapeau).
    if (globalThis.__beachStats) {
      const s = globalThis.__beachStatsLast || (globalThis.__beachStatsLast = {});
      s[k] = (s[k] || 0) + 1;
    }
    kinds.set(key, k);
    return k;
  };
  // Voisin d'herbe « frangeable » : de l'herbe FERME — pas une cellule d'eau
  // (peinte herbe mais recouverte en live par le ruban du fleuve : une frange
  // là-dessous ressortirait sur les quais).
  const grassAt = (gx, gy) => kindAt(gx, gy) === 'grass' && !(riverCells && riverCells.has(gx + ',' + gy));
  // VOILES D'HERBE REMISÉS PAR PALIER D'ALPHA. Les deux voiles (prés clair/foncé,
  // ombre sauvage) faisaient un fill de losange PAR cellule d'herbe : jusqu'à 2 ×
  // ~9 000 fills = 57 % de la recuisson (mesuré). On accumule les losanges par
  // (famille, alpha quantifié au 1/256) et on les vide en fills d'UNION par
  // paquets → une poignée de fills. Losanges DISJOINTS → l'union nonzero rend
  // identique (aucun double-alpha), et le pas d'alpha 1/256 est sous le seuil
  // perceptible sur un voile à alpha ≤ 0,1.
  const VEIL_COL = [[24, 38, 16], [214, 226, 150], [26, 36, 18]];
  const veil = [new Map(), new Map(), new Map()];
  const grassCells = [];               // (gx, gy, px, py) à plat — fleurs différées
  const veilPush = (fam, a, px, py) => {
    const q = Math.min(255, Math.max(1, Math.round(a * 255)));
    const m = veil[fam];
    const arr = m.get(q);
    if (arr) arr.push(px, py); else m.set(q, [px, py]);
  };
  const flushVeils = () => {
    for (let f = 0; f < 3; f += 1) {
      const c = VEIL_COL[f];
      for (const [q, arr] of veil[f]) {
        ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${(q / 255).toFixed(3)})`;
        let n = 0;
        ctx.beginPath();
        for (let i = 0; i < arr.length; i += 2) {
          diamondPath(ctx, arr[i], arr[i + 1], hw, hh);
          n += 1;
          if (n >= 256) { ctx.fill(); ctx.beginPath(); n = 0; }   // bbox locale (cf. joints)
        }
        if (n) ctx.fill();
      }
    }
  };
  ctx.save();
  ctx.lineJoin = 'round';
  // FOND D'HERBE UNIQUE : l'herbe (l'écrasante majorité des cellules — toute la
  // plaine hors ville) n'est plus remplie losange par losange mais en UN fillRect
  // sous tout le viewport (les bornes b projettent toujours un sur-ensemble de
  // l'écran, cf. visibleCellBounds). Les cellules d'herbe sautent leur aplat
  // par cellule ; un fond continu n'a par construction AUCUNE couture entre
  // cellules d'herbe, et les sols urbains repeignent par-dessus (leur liseré
  // anti-couture inchangé). L'eau reste peinte herbe (berges douces, cf. kindAt).
  ctx.fillStyle = rgb(SEASON_GRASS, 1);
  ctx.fillRect(0, 0, CM.cw, CM.ch);
  const tLoop = PR && performance.now();
  // ── CULL ÉCRAN PAR CELLULE ────────────────────────────────────────────────
  // visibleCellBounds rend un RECTANGLE de grille (gx0..gx1, gy0..gy1) : la boîte
  // englobante des 4 coins d'écran projetés en monde. Or en isométrique, un écran
  // rectangulaire se projette en LOSANGE — la boîte englobante d'un losange fait
  // le double de son aire. Compté directement : 49 à 51 % des cellules parcourues
  // sont ENTIÈREMENT hors écran, à tous les zooms (2 006 visibles sur 3 969 à
  // zoom 1 ; 12 124 sur 24 649 à zoom 0,4). La moitié de la recuisson — le poste
  // le plus cher de la carte — était dépensée à classer, remplir et border des
  // losanges que personne ne peut voir.
  // Le test est un rejet précoce, avant kindAt et tout tracé.
  // ⚠ Marge d'une cellule pleine : le losange pend SOUS son coin nord (2*hh) et
  // les tuiles/touffes débordent un peu. Trop serré, on raboterait le bord.
  // A/B : globalThis.__isoCellCull = false rejoue le balayage complet.
  const cullPadX = hw * 2, cullPadY = hh * 4;
  const cullOn = globalThis.__isoCellCull !== false;
  sweepIsoGroundCells(
    { ctx, T, hw, hh, LOD, HARD, b, cullOn, cullPadX, cullPadY, ISO_GROUND_SLICE,
      L, roadMap, riverCells, urb, mat, plazaEra, wg, PR },
    { kindAt, grassAt, keyOfKind },
    { fringes, roads, wonderCells, grassCells, veilPush },
  );
  if (PR) PR.cells = performance.now() - tLoop;
  // PARVIS : tout le dallage, PUIS toute la margelle. L'ordre compte — la margelle
  // encadre le parvis et doit rester au-dessus des joints, comme avant.
  drawWonderGroundAll(ctx, wonderCells, hw, hh, wg);
  // Voiles d'herbe puis FLEURS : même ordre qu'avant (voile sous fleur), mais en
  // fills d'union groupés. Les motifs de drawGrassDetail tiennent dans leur
  // cellule → « tous les voiles puis toutes les fleurs » == l'entrelacé par cellule.
  const tV = PR && performance.now();
  flushVeils();
  drawGrassDetailAll(ctx, grassCells, hw, hh);
  if (PR) PR.grass += performance.now() - tV;
  // FRANGE D'HERBE : après le fond (les langues mordent sur des cellules déjà
  // peintes), AVANT les rubans de chaussée (la route recouvre ce qui la borde).
  if (fringes.length) {
    const tFr = PR && performance.now();
    drawGrassFringeAll(ctx, fringes, hw, urb);
    if (PR) PR.fringe = performance.now() - tFr;
  }
  // Rubans de chaussée par-dessus le fond : pavé central + un bras vers chaque
  // connexion (rectangles MONDE projetés → parallélogrammes écran continus).
  const tRd = PR && performance.now();
  const rmat = roadMatFor(band);
  const rVeil = roadVeilFor(ROAD_DETAIL.band != null ? ROAD_DETAIL.band : band);   // voile de lecture (forçage d'aperçu honoré)
  // Constantes de la passe route : teinte d'ÉPAULEMENT (mélange sol↔route un peu
  // assombri — la rue s'assoit dans le sol au lieu d'avoir l'air tamponnée),
  // tons de la FRANGE de chaussée (morsures = épaulement en 2 valeurs,
  // gravillons = matière de la route) et intensité par ère (forçage d'aperçu honoré).
  const shm = ROAD_DETAIL.shoulderMix, shv = ROAD_DETAIL.shoulderV;
  const shTone = [0, 1, 2].map((i) => Math.round((urb[i] * (1 - shm) + road[i] * shm) * shv));
  const shCol = `rgb(${shTone[0]},${shTone[1]},${shTone[2]})`;
  const shCol2 = `rgb(${Math.round(shTone[0] * 0.9)},${Math.round(shTone[1] * 0.9)},${Math.round(shTone[2] * 0.9)})`;
  const spillCol = rgb(road, 1);
  const rfK = ROAD_DETAIL.on ? ROAD_DETAIL.edgeFringe * roadFringeK(ROAD_DETAIL.band != null ? ROAD_DETAIL.band : band) : 0;
  const puR = Math.max(1, Math.round(hw * 0.055));
  const cbR = T * 0.05;
  // COULOIRS FUSIONNÉS : même union que les 5 quads par cellule (pavé + bras
  // selon le masque) mais en bandes MAXIMALES par ligne/colonne — beaucoup moins
  // de sous-chemins, et chaque passe-union (ourlet, épaulement, joint, trottoir,
  // bordure, gorge) rasterise d'autant plus vite (le par-cellule re-projetait
  // ~5 quads × cellule × passe et dominait la recuisson du sol des mégapoles).
  // Un couloir s'étend tant que les cellules sont contiguës ET mutuellement
  // connectées (E↔W / S↔N) ; chaque bout s'arrête au bord de cellule si le bras
  // existe (masque), au bord du pavé sinon — la géométrie des quads à
  // l'identique, donc les couches en alpha ne marquent toujours aucune couture.
  // Les couloirs verticaux de longueur 1 sans bras N/S sont sautés : leur pavé
  // est déjà couvert par le couloir horizontal de la cellule.
  // `md` = masque de TRACÉ, posé plus bas quand une rue à trottoir refuse de
  // tendre un bras à une venelle (cf. « le trottoir passe devant l'entrée des
  // venelles »). Null partout ailleurs → le masque logique de la cellule.
  const maskOf = (r2) => (r2.md != null ? r2.md : (r2.cell ? (r2.cell.mask | 0) : 0));
  // Demi-largeur de chaussée de la cellule (hiérarchie par rang). Un couloir se
  // BRISE au changement de largeur : chaque run est homogène et porte sa `w` —
  // le sentier reste étroit jusqu'au seuil où la voie s'élargit (marche nette,
  // comme une route qui change de gabarit).
  const wOf = (r2) => isoRoadHalfW(r2.cell && r2.cell.rank);
  const buildRoadRuns = (list) => {
    const rows = new Map(), cols = new Map();
    for (const r2 of list) {
      const a = rows.get(r2.gy); if (a) a.push(r2); else rows.set(r2.gy, [r2]);
      const c = cols.get(r2.gx); if (c) c.push(r2); else cols.set(r2.gx, [r2]);
    }
    const h = [], v = [];
    for (const [gy, a] of rows) {
      a.sort((p2, q2) => p2.gx - q2.gx);
      for (let i = 0; i < a.length;) {
        let j = i;
        while (j + 1 < a.length && a[j + 1].gx === a[j].gx + 1
          && (maskOf(a[j]) & ROAD_E) && (maskOf(a[j + 1]) & ROAD_W)
          && wOf(a[j + 1]) === wOf(a[j])) j += 1;
        h.push({ gy, g0: a[i].gx, g1: a[j].gx, s0: !!(maskOf(a[i]) & ROAD_W), s1: !!(maskOf(a[j]) & ROAD_E), w: wOf(a[i]) });
        i = j + 1;
      }
    }
    for (const [gx, c] of cols) {
      c.sort((p2, q2) => p2.gy - q2.gy);
      for (let i = 0; i < c.length;) {
        let j = i;
        while (j + 1 < c.length && c[j + 1].gy === c[j].gy + 1
          && (maskOf(c[j]) & ROAD_S) && (maskOf(c[j + 1]) & ROAD_N)
          && wOf(c[j + 1]) === wOf(c[j])) j += 1;
        const n = !!(maskOf(c[i]) & ROAD_N), s = !!(maskOf(c[j]) & ROAD_S);
        if (j > i || n || s) v.push({ gx, g0: c[i].gy, g1: c[j].gy, s0: n, s1: s, w: wOf(c[i]) });
        i = j + 1;
      }
    }
    return { h, v };
  };
  // Trace les couloirs en sous-chemins du chemin courant. `extra` = sur-largeur
  // de la passe (épaulement, trottoir, gorge…) AJOUTÉE à la demi-chaussée du run.
  // `c` : contexte de destination — la passe TROTTOIR peint dans un calque à la
  // résolution de l'art, pas dans le bake (cf. § LE TROTTOIR EST PEINT EN PIXELS).
  const addRunQuads = (runs, extra, c = ctx) => {
    for (const s of runs.h) {
      const W = T * s.w + extra;
      const cy2 = (s.gy + 0.5) * T;
      pathWorldQuad(c, s.s0 ? s.g0 * T : (s.g0 + 0.5) * T - W, cy2 - W,
        s.s1 ? (s.g1 + 1) * T : (s.g1 + 0.5) * T + W, cy2 + W);
    }
    for (const s of runs.v) {
      const W = T * s.w + extra;
      const cx2 = (s.gx + 0.5) * T;
      pathWorldQuad(c, cx2 - W, s.s0 ? s.g0 * T : (s.g0 + 0.5) * T - W,
        cx2 + W, s.s1 ? (s.g1 + 1) * T : (s.g1 + 0.5) * T + W);
    }
  };
  // ROUTE EN CREUX (jonction route↔sol) : couches concentriques autour de la
  // dalle, chacune en passe-union. Deux habillages selon le tronçon :
  //   - CAMPAGNE / premières ères (shRoads) : OURLET en fondu → ÉPAULEMENT plein
  //     (le liseré validé) — la terre se dissout dans le sol.
  //   - VILLE dès l'ère bourg (swRoads, band ≥ SIDEWALK_ISO.minBand et cellule
  //     urbaine) : VRAI TROTTOIR construit — joint sombre au raccord du sol →
  //     bande de dalles claires → joints transversaux → BORDURE claire.
  // Dans les deux cas la GORGE sombre au contact de la dalle vient en dernier
  // (route en creux / caniveau). La dalle garde son bord NET (crantage v4
  // rejeté : une route se lit par son bord net). Tout est continu, rien par cellule.
  const bandRoads = ROAD_DETAIL.band != null ? ROAD_DETAIL.band : band;
  const swOn = SIDEWALK_ISO.on && bandRoads >= SIDEWALK_ISO.minBand;
  const swRoads = [], shRoads = [];
  for (const r2 of roads) {
    // Les SENTIERS (rang path) n'ont JAMAIS de trottoir construit : une venelle
    // se lit rustique (ourlet + épaulement), même en plein cœur urbain — le
    // trottoir commence à la vraie rue (Raph 2026-07-28).
    const isPathRank = !!(r2.cell && r2.cell.rank === 'path');
    // …et le trottoir s'arrête où la ville s'arrête. Le test portait sur
    // `urbanSet`, un RAYON dérivé des compteurs : une rue traversant des
    // hectares que la ville n'a jamais bâtis y gagnait quand même ses dalles de
    // centre-ville. On demande maintenant au sol : si la cellule est peinte en
    // cour ou en friche (cf. COUR), la rue reprend son ourlet de campagne.
    const inCity = COUR.on && COUR.sidewalk
      ? kindAt(r2.gx, r2.gy) === 'urban'
      : !!(L.urbanSet && L.urbanSet.has(r2.gx + ',' + r2.gy));
    r2.md = null;                        // masque de TRACÉ (cf. juste après)
    // …et il faut QUELQU'UN à desservir. Raph 2026-08-05 : « on peut pas juste
    // faire en sorte que des rues ne soient pas au milieu de nulle part ? ».
    // Mesuré : 11 à 12 % des cellules-route n'ont AUCUN bâtiment sur leurs huit
    // voisines — des voies qui traversent des terrains jamais bâtis. Elles ne
    // peuvent pas être SUPPRIMÉES : elles portent la connexité (un émondage aux
    // points d'articulation n'en a libéré que 7 sur 1901, mesuré). Mais rien ne
    // les oblige à RESSEMBLER à des rues : sans façade, pas de trottoir — donc
    // pas de marche, pas de bordure, pas de mobilier. Elles reprennent l'ourlet
    // de campagne et redeviennent ce qu'elles sont : des voies de passage.
    // ⚠ Le test porte sur les 8 voisines, diagonales comprises : une maison en
    // biais d'un carrefour le borde tout autant, et s'en tenir aux 4 orthogonales
    // dénuderait les cellules d'angle en plein quartier bâti.
    if (swOn && !isPathRank && inCity && builtNear(L, r2.gx, r2.gy)) swRoads.push(r2);
    else shRoads.push(r2);
  }
  // ── LE TROTTOIR PASSE DEVANT L'ENTRÉE DES VENELLES ──────────────────────────
  // Une venelle (rang `path`) n'a pas de trottoir. Là où elle débouchait sur une
  // rue qui en a un, la rue tendait son BRAS de chaussée jusqu'au bord de
  // cellule : le bras traversait la bande claire et la coupait NET. C'est la
  // cause dominante des « bouts de trottoir orphelins » qui s'arrêtent au milieu
  // du pavé — mesuré sur une ville band 3 de 1408 cellules-route : 88 débouchés
  // de venelle contre 11 sorties de ville, soit 16 % des 538 rues à trottoir.
  //
  // En ville, un trottoir ne s'interrompt pas pour une ruelle : il PASSE DEVANT,
  // et c'est la ruelle qui vient buter dessus. On retire donc ce bras du seul
  // TRACÉ (masque `md`) : la connexité LOGIQUE du réseau ne bouge pas d'un iota
  // — `cell.mask` reste intact, les agents continuent d'emprunter la venelle, et
  // la venelle garde son propre bras jusqu'à son bord de cellule, qui vient
  // toucher le bord extérieur du trottoir.
  //
  // GARDE : on ne retire jamais le DERNIER bras (`md` doit rester non nul), sans
  // quoi une rue qui ne dessert que des venelles deviendrait une plaque de
  // trottoir carrée posée dans le pavé, sans chaussée.
  // Molette : __sidewalkIso({ alleyThrough: false }) rejoue l'ancien tracé.
  if (SIDEWALK_ISO.alleyThrough !== false) {
    const isAlley = (x, y) => { const c = roadMap && roadMap.get(x + ',' + y); return !!(c && c.rank === 'path'); };
    for (const r2 of swRoads) {
      const m0 = r2.cell ? (r2.cell.mask | 0) : 0;
      let md = m0;
      if ((md & ROAD_E) && isAlley(r2.gx + 1, r2.gy)) md &= ~ROAD_E;
      if ((md & ROAD_W) && isAlley(r2.gx - 1, r2.gy)) md &= ~ROAD_W;
      if ((md & ROAD_S) && isAlley(r2.gx, r2.gy + 1)) md &= ~ROAD_S;
      if ((md & ROAD_N) && isAlley(r2.gx, r2.gy - 1)) md &= ~ROAD_N;
      r2.md = md !== 0 ? md : m0;
    }
  }
  // Couloirs construits UNE fois par liste, rejoués à chaque passe (les largeurs
  // varient, la topologie non). Union sh ∪ sw = union `roads` : un tronçon qui
  // change de liste au bord urbain aboute ses bras au bord de cellule partagé.
  const shRuns = buildRoadRuns(shRoads), swRuns = buildRoadRuns(swRoads);
  // ── TOUTE LA VOIRIE EST PEINTE EN PIXELS, PLUS UN TRAIT AU VECTEUR ─────────
  // (Raph 2026-08-05, après le trottoir : « oui je veux bien » pour le reste.)
  // Ourlet, épaulement, trottoir, caniveau, rubans de chaussée, frange et allées
  // de seuil passent dans le CALQUE à l'échelle de l'art (cf. § LE TROTTOIR EST
  // PEINT EN PIXELS). Ce sont les mêmes tracés, à la même géométrie : seule la
  // résolution de rastérisation change — et avec elle le bord, qui cesse d'être
  // trois fois plus fin que le pixel de l'art voisin.
  // ⚠ LE CULL DE TRANCHE SE FAIT AVANT LA BASCULE. `ISO_GROUND_SLICE` borne des
  // px écran DU BAKE ; sous le calque, worldToScreen répond dans un autre repère
  // et le test deviendrait faux en silence (cellules peintes hors tranche, ou
  // tranche vide). On fige donc ici la liste des cellules à peindre.
  const roadsVis = [];
  for (const r of roads) {
    if (ISO_GROUND_SLICE.on) {
      const pr = worldToScreen(r.gx * T, r.gy * T);
      if (ISO_GROUND_SLICE.yOn && (pr.y < ISO_GROUND_SLICE.y0 - ISO_GROUND_SLICE.padTop
        || pr.y > ISO_GROUND_SLICE.y1 + ISO_GROUND_SLICE.padBot)) continue;
      if (ISO_GROUND_SLICE.xOn && (pr.x < ISO_GROUND_SLICE.x0 - ISO_GROUND_SLICE.padX
        || pr.x > ISO_GROUND_SLICE.x1 + ISO_GROUND_SLICE.padX)) continue;
    }
    roadsVis.push(r);
  }
  const lay = (ROAD_DETAIL.pixel !== false && roads.length) ? walkLayerBegin(z) : null;
  const sctx = lay ? lay.ctx : ctx;
  const shw = lay ? T * ISO_X : hw;   // demi-largeur du losange DANS le repère de dessin
  const tU1 = PR && performance.now();
  if (shRoads.length) {
    if (ROAD_DETAIL.feather > 0 && ROAD_DETAIL.featherA > 0) {
      sctx.beginPath();
      addRunQuads(shRuns, cbR + T * ROAD_DETAIL.feather, sctx);
      sctx.globalAlpha = ROAD_DETAIL.featherA;
      sctx.fillStyle = shCol;
      sctx.fill();
      sctx.globalAlpha = 1;
    }
    sctx.beginPath();
    addRunQuads(shRuns, cbR, sctx);
    sctx.fillStyle = shCol;
    sctx.fill();
  }
  if (PR) PR.roadsShoulder = performance.now() - tU1;
  const tU2 = PR && performance.now();
  if (swRoads.length) {
    // ── LA MARCHE, ET RIEN QUE LA MARCHE ─────────────────────────────────────
    // Raph 2026-08-05, et c'est la remise à plat qui manquait : « techniquement
    // il n'y a pas de sol mais trottoir et maison, donc pas de sens que le
    // trottoir ait une apparence différente du sol. Il faut effectivement la
    // marche mais après bam, du sol ».
    //
    // Autrement dit : LE SOL DE VILLE *EST* LE TROTTOIR. Ce qui borde une rue
    // n'est pas une bande rapportée, c'est le sol de la ville qui court jusqu'au
    // caniveau — et la seule chose qui les sépare est la MARCHE. Tout ce que la
    // bande portait est donc parti : son aplat, sa matière dédiée (walk-*), son
    // appareillage, son joint de rive. Ce qui reste tient en deux traits d'un
    // pixel d'art, CÔTÉ RUE uniquement :
    //   • NEZ DE BORDURE — arête claire à la limite caniveau ↔ sol, le dessus
    //     de la marche qui prend la lumière ;
    //   • OMBRE PORTÉE — un pixel sombre juste sous ce nez, du seul côté qui
    //     fait face à la caméra : c'est elle qui creuse. Sans elle, l'arête
    //     claire flotte.
    // Côté sol, plus rien : pas de liseré, pas de bord. Bam, du sol.
    //
    // ⚠ La géométrie de rue (SIDEWALK_ISO.w) RESTE : elle ne peint plus rien,
    // mais elle publie toujours aux agents où marchent les piétons et où se
    // pose le mobilier — le long de la rue, sur le sol.
    // Réglage : __sidewalkIso({ stepA, stepLight, stepShade }) ; stepA 0 = plat.
    //
    // TRAIT D'UN PIXEL D'ART, EN ESCALIER 2:1 — la pente exacte de la projection
    // d'un axe monde. Tracé en quad, un trait d'un pixel de large ressort PÂLE :
    // l'antialiasing étale son alpha sur deux pixels et il n'en reste rien. Ici,
    // des `fillRect` entiers, donc un alpha exact et la granularité de l'art.
    // `dy` décale vers le bas (une ombre se pose SOUS l'arête qu'elle creuse) ;
    // le dédoublonnage évite qu'une marche repeinte double son alpha.
    // ⚠⚠ LA MARCHE S'INTERROMPT AUX CROISEMENTS (Raph 2026-08-05 : « attention,
    // ça crée des rues FERMÉES au milieu du sol »). Un bord de run est tracé sur
    // toute sa longueur — donc il passait AU-DESSUS des chaussées
    // perpendiculaires. Les marches se rejoignaient d'un run à l'autre et
    // refermaient un quadrillage continu sur le sol : des cadres, au lieu de
    // rues. Au droit d'une chaussée, le trottoir cède le passage — c'est le
    // passage piéton — et la marche reprend de l'autre côté.
    const roadByKey = new Map();
    for (const r2 of roads) roadByKey.set(r2.gx + ',' + r2.gy, r2);
    const onRoadway = (wx, wy) => {
      const gx = Math.floor(wx / T), gy = Math.floor(wy / T);
      const r2 = roadByKey.get(gx + ',' + gy);
      if (!r2) return false;
      const wb = T * wOf(r2) + T * ROAD_DETAIL.groove;   // chaussée + son caniveau
      const dx = wx - (gx + 0.5) * T, dy2 = wy - (gy + 0.5) * T;
      const ax2 = Math.abs(dx), ay2 = Math.abs(dy2);
      if (ax2 <= wb && ay2 <= wb) return true;           // pavé central
      const m = maskOf(r2);                              // bras RÉELLEMENT tracés
      if (ay2 <= wb && dx > wb && (m & ROAD_E)) return true;
      if (ay2 <= wb && dx < -wb && (m & ROAD_W)) return true;
      if (ax2 <= wb && dy2 > wb && (m & ROAD_S)) return true;
      if (ax2 <= wb && dy2 < -wb && (m & ROAD_N)) return true;
      return false;
    };
    let lastPx = -1e9, lastPy = -1e9;
    const pixelLine = (ax, ay, bx, by, dy = 0) => {
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 2));
      for (let i = 0; i <= n; i += 1) {
        const t = i / n;
        const wx = ax + (bx - ax) * t, wy = ay + (by - ay) * t;
        if (onRoadway(wx, wy)) { lastPx = -1e9; lastPy = -1e9; continue; }
        const p = worldToScreen(wx, wy);
        const px = Math.round(p.x) - 1, py = Math.round(p.y) + dy;
        if (px === lastPx && py === lastPy) continue;
        sctx.fillRect(px, py, 2, 1);
        lastPx = px; lastPy = py;
      }
      lastPx = -1e9; lastPy = -1e9;
    };
    // Les deux bords d'un run, en coordonnées monde — `off` = distance à l'axe,
    // en fraction de tuile ; `side` +1 = le bord qui fait face à la caméra.
    const runEdges = (runs, off, draw) => {
      for (const s of runs.h) {
        const W = T * s.w + T * off;
        const cy2 = (s.gy + 0.5) * T;
        const x0 = s.s0 ? s.g0 * T : (s.g0 + 0.5) * T - W;
        const x1 = s.s1 ? (s.g1 + 1) * T : (s.g1 + 0.5) * T + W;
        draw(x0, cy2 - W, x1, cy2 - W, -1);
        draw(x0, cy2 + W, x1, cy2 + W, 1);
      }
      for (const s of runs.v) {
        const W = T * s.w + T * off;
        const cx2 = (s.gx + 0.5) * T;
        const y0 = s.s0 ? s.g0 * T : (s.g0 + 0.5) * T - W;
        const y1 = s.s1 ? (s.g1 + 1) * T : (s.g1 + 0.5) * T + W;
        draw(cx2 - W, y0, cx2 - W, y1, -1);
        draw(cx2 + W, y0, cx2 + W, y1, 1);
      }
    };
    if (ROAD_DETAIL.groove > 0 && ROAD_DETAIL.grooveA > 0) {
      sctx.beginPath();
      addRunQuads(swRuns, T * ROAD_DETAIL.groove, sctx);
      sctx.fillStyle = `rgba(40,30,18,${ROAD_DETAIL.grooveA})`;
      sctx.fill();
    }
    // ⚠⚠ LA MARCHE N'A QU'UNE FACE, ET LA PERSPECTIVE DIT LAQUELLE (Raph
    // 2026-08-05 : « on doit respecter la perspective »). La v1 posait le même
    // trait sur les DEUX bords d'une chaussée — nez clair et ombre de part et
    // d'autre — ce qui est géométriquement impossible : la bordure « montait »
    // des deux côtés à la fois.
    //
    // En 3/4, on voit les faces tournées vers +x et +y (celles qui regardent le
    // bas de l'écran). Pour une rue est-ouest, le trottoir NORD présente à la
    // chaussée une face orientée +y : elle est VUE, il faut en dessiner la
    // tranche. Le trottoir SUD, lui, est entre la caméra et la rue ; sa face
    // regarde −y, donc elle est CACHÉE — il n'y a rien à y peindre. Idem sur
    // l'autre axe : trottoir OUEST vu, trottoir EST caché. C'est toujours le
    // bord `side < 0` de `runEdges`.
    //
    // La tranche descend DANS la chaussée (vers le bas de l'écran) : le sol
    // reste à plat, c'est elle seule qui raconte le dénivelé.
    if (!LOD && SIDEWALK_ISO.stepA > 0) {
      const inner = ROAD_DETAIL.groove + SIDEWALK_ISO.curb;   // arête haute de la marche
      const hStep = Math.max(1, SIDEWALK_ISO.stepH | 0);
      sctx.fillStyle = `rgba(${SIDEWALK_ISO.stepShade.join(',')},${SIDEWALK_ISO.stepA})`;
      runEdges(swRuns, inner, (ax, ay, bx, by, side) => {
        if (side >= 0) return;                       // face cachée : on ne peint rien
        for (let d = 1; d <= hStep; d += 1) pixelLine(ax, ay, bx, by, d);
      });
      sctx.fillStyle = `rgba(${SIDEWALK_ISO.stepLight.join(',')},${SIDEWALK_ISO.stepA})`;
      runEdges(swRuns, inner, (ax, ay, bx, by, side) => {
        if (side < 0) pixelLine(ax, ay, bx, by);     // nez éclairé, au sommet de la tranche
      });
    }
  }
  if (PR) PR.roadsSidewalk = performance.now() - tU2;
  const tU3 = PR && performance.now();
  if (shRoads.length && ROAD_DETAIL.groove > 0 && ROAD_DETAIL.grooveA > 0) {
    sctx.beginPath();
    addRunQuads(shRuns, T * ROAD_DETAIL.groove, sctx);
    sctx.fillStyle = `rgba(40,30,18,${ROAD_DETAIL.grooveA})`;
    sctx.fill();
  }
  if (PR) PR.roadsGroove = performance.now() - tU3;
  for (const r of roadsVis) {
    const cx = (r.gx + 0.5) * T, cy = (r.gy + 0.5) * T;
    const wb = T * wOf(r);          // demi-chaussée de LA cellule (hiérarchie par rang)
    const mask = maskOf(r);         // masque de TRACÉ (bras vers venelle retiré)
    // Ton de dalle en variation LISSÉE le long du tracé (le hash par cellule
    // rayait le ruban de bandes — même règle que les sols : rien par cellule).
    const v = 0.97 + smoothNoise(r.gx, r.gy, 4, 'rb') * 0.06;
    // Ruban de chaussée = pavé central + un bras vers chaque connexion (tracé CHEMIN).
    sctx.beginPath();
    pathWorldQuad(sctx, cx - wb, cy - wb, cx + wb, cy + wb);                       // pavé central
    if (mask & ROAD_E) pathWorldQuad(sctx, cx + wb, cy - wb, (r.gx + 1) * T, cy + wb);
    if (mask & ROAD_W) pathWorldQuad(sctx, r.gx * T, cy - wb, cx - wb, cy + wb);
    if (mask & ROAD_S) pathWorldQuad(sctx, cx - wb, cy + wb, cx + wb, (r.gy + 1) * T);
    if (mask & ROAD_N) pathWorldQuad(sctx, cx - wb, r.gy * T, cx + wb, cy - wb);
    const rTile = (ROAD_DETAIL.on && ROAD_DETAIL.tiles && rmat.tile && !HARD) ? ensureIsoTileKey(rmat.tile) : null;
    if (rTile && rTile.ready) {
      sctx.save(); sctx.clip();
      const rp = worldToScreen(r.gx * T, r.gy * T);
      const rH = cmHash('rr:' + r.gx + ',' + r.gy);
      const rmir = ((rH >>> 3) & 1) === 1;
      blitIsoTileKey(sctx, rmat.tile, rp.x, rp.y, shw, rmir, rH, rVeil);
      sctx.restore();
    } else {
      // DALLE LISSE : surface PLEINE de chaussée, teinte par ère (roadTone, qui
      // porte DÉJÀ le voile de lecture). Lisse et propre (pas de texture qui
      // transparaît) — la « dalle lisse » demandée par Raph.
      sctx.fillStyle = rgb(road, v);
      sctx.fill();
    }
    // MARQUAGE : UNIQUEMENT le pointillé BLANC d'axe, au milieu des segments droits
    // (Raph : « tirets blancs juste au milieu, pas besoin sur les côtés »').
    // …et plus « toutes ères » : le marquage routier n'existe qu'à partir de
    // l'asphalte (band ≥ 6) — des tirets d'autoroute sur un sentier de terre
    // étaient précisément « cette route à toutes les ères » (Raph 2026-07-28).
    const markBand = ROAD_DETAIL.band != null ? ROAD_DETAIL.band : band;
    const throughH = !!((mask & ROAD_E) && (mask & ROAD_W)), throughV = !!((mask & ROAD_S) && (mask & ROAD_N));
    if (markBand >= 6 && throughH !== throughV) {   // segment droit à un seul axe
      sctx.fillStyle = 'rgba(246,245,240,0.9)';
      const dl = T / 5, dg = T / 7, dw2 = T * 0.03;   // tiret, trou, demi-largeur
      for (let o = dg / 2; o + dl <= T; o += dl + dg) {
        if (throughH) fillWorldQuad(sctx, r.gx * T + o, cy - dw2, r.gx * T + o + dl, cy + dw2);
        else fillWorldQuad(sctx, cx - dw2, r.gy * T + o, cx + dw2, r.gy * T + o + dl);
      }
    }
    // FRANGE DE CHAUSSÉE : crante chaque bord EXPOSÉ du ruban (flancs des bras +
    // caps du pavé sans connexion — les impasses s'effritent au bout). Un flanc
    // qui fait face à une voie JUMELLE non connectée (boulevard 2-cellules) est
    // SAUTÉ : le terre-plein porte cette couture. Arêtes en MONDE → projetées,
    // normale sortante (ox,oy) monde → écran via (±hw,±hh).
    if (rfK > 0 && !LOD) {
      const x0w = r.gx * T, y0w = r.gy * T, x1w = (r.gx + 1) * T, y1w = (r.gy + 1) * T;
      const roadN2 = L.roadSet.has(r.gx + ',' + (r.gy - 1)), roadS2 = L.roadSet.has(r.gx + ',' + (r.gy + 1));
      const roadE2 = L.roadSet.has((r.gx + 1) + ',' + r.gy), roadW2 = L.roadSet.has((r.gx - 1) + ',' + r.gy);
      const segs = [];
      if (mask & ROAD_E) {
        if (!roadN2 || (mask & ROAD_N)) segs.push([cx + wb, cy - wb, x1w, cy - wb, 0, -1, 'en']);
        if (!roadS2 || (mask & ROAD_S)) segs.push([cx + wb, cy + wb, x1w, cy + wb, 0, 1, 'es']);
      } else segs.push([cx + wb, cy - wb, cx + wb, cy + wb, 1, 0, 'ec']);
      if (mask & ROAD_W) {
        if (!roadN2 || (mask & ROAD_N)) segs.push([x0w, cy - wb, cx - wb, cy - wb, 0, -1, 'wn']);
        if (!roadS2 || (mask & ROAD_S)) segs.push([x0w, cy + wb, cx - wb, cy + wb, 0, 1, 'ws']);
      } else segs.push([cx - wb, cy - wb, cx - wb, cy + wb, -1, 0, 'wc']);
      if (mask & ROAD_S) {
        if (!roadE2 || (mask & ROAD_E)) segs.push([cx + wb, cy + wb, cx + wb, y1w, 1, 0, 'se']);
        if (!roadW2 || (mask & ROAD_W)) segs.push([cx - wb, cy + wb, cx - wb, y1w, -1, 0, 'sw']);
      } else segs.push([cx - wb, cy + wb, cx + wb, cy + wb, 0, 1, 'sc']);
      if (mask & ROAD_N) {
        if (!roadE2 || (mask & ROAD_E)) segs.push([cx + wb, y0w, cx + wb, cy - wb, 1, 0, 'ne']);
        if (!roadW2 || (mask & ROAD_W)) segs.push([cx - wb, y0w, cx - wb, cy - wb, -1, 0, 'nw']);
      } else segs.push([cx - wb, cy - wb, cx + wb, cy - wb, 0, -1, 'nc']);
      for (const s of segs) {
        const A = worldToScreen(s[0], s[1]), B = worldToScreen(s[2], s[3]);
        let nx2 = (s[4] - s[5]) * shw, ny2 = (s[4] + s[5]) * (shw * ISO_Y / ISO_X);
        const nl2 = Math.hypot(nx2, ny2) || 1;
        nx2 /= nl2; ny2 /= nl2;
        // `puR` est l'unité de pixel des effets : dans le calque, elle vaut déjà
        // le pixel d'art (hw = T), donc les gravillons sortent au bon calibre.
        drawRoadEdgeFringe(sctx, {
          ax: A.x, ay: A.y, bx: B.x, by: B.y, ox: nx2, oy: ny2,
          seed: 'rf:' + r.gx + ',' + r.gy + ':' + s[6],
        }, lay ? Math.max(1, Math.round(shw * 0.055)) : puR, shCol, shCol2, spillCol, rfK);
      }
    }
  }
  if (PR) PR.roads = performance.now() - tRd;
  // ── ALLÉES DE SEUIL : « un léger trait gris de la porte à la route » ────────
  // (Raph 2026-07-28). Chaque HABITATION (house/enginehome) adjacente au réseau
  // reçoit une fine bande de sa façade au bord de la chaussée voisine — priorité
  // aux faces écran (S puis E, puis O/N) : la porte des sprites regarde la
  // caméra. Couleur d'ÉPAULEMENT (déjà calée sol↔route par ère), légèrement
  // translucide → un seuil discret, pas une route. Le départ rentre SOUS la
  // façade (tuck, recouvert par le sprite) pour ne jamais flotter. Statique →
  // bake ; sautée en LOD (illisible au dézoom). Quads batchés par paquets
  // (même idiome que les joints de trottoir : bbox locale, pas de double-alpha).
  const tAl = PR && performance.now();
  if (ROAD_DETAIL.on && !LOD && L.tiles && roadMap) {
    const aw = T * 0.055;                     // demi-largeur du trait
    const tuck = T * 0.16;                    // rentré sous la façade
    sctx.globalAlpha = 0.8;
    sctx.fillStyle = shCol;
    sctx.beginPath();
    let alN = 0;
    const allee = (x0, y0, x1, y1) => {
      pathWorldQuad(sctx, x0, y0, x1, y1);
      alN += 1;
      if (alN >= 256) { sctx.fill(); sctx.beginPath(); alN = 0; }
    };
    for (const t2 of L.tiles) {
      const isEng = t2.type === 'engine';
      if (!isEng && t2.type !== 'house' && t2.type !== 'enginehome') continue;
      // Les CHAMPS n'ont pas de seuil : une parcelle se laboure, elle n'a pas
      // de porte (Raph 2026-07-28) — seuls moteurs exclus des allées.
      if (isEng && t2.buildingId === 'irrigated_fields') continue;
      // La façade est résolue par isoBuildingFront (partagée avec le poussé du
      // sprite, cf. FRONT) : le seuil et le bâtiment DOIVENT désigner le même
      // côté, sinon le trait sortirait d'un mur aveugle.
      const f2 = isoBuildingFront(t2, roadMap);
      if (f2) {
        const { dx, dy, hx, hy, rank } = f2;
        const rx = hx + dx, ry = hy + dy;
        const rw = isoRoadHalfW(rank);
        if (dy === 1) allee((hx + 0.5) * T - aw, (hy + 1) * T - tuck, (hx + 0.5) * T + aw, (ry + 0.5 - rw) * T);
        else if (dy === -1) allee((hx + 0.5) * T - aw, (ry + 0.5 + rw) * T, (hx + 0.5) * T + aw, hy * T + tuck);
        else if (dx === 1) allee((hx + 1) * T - tuck, (hy + 0.5) * T - aw, (rx + 0.5 - rw) * T, (hy + 0.5) * T + aw);
        else allee((rx + 0.5 + rw) * T, (hy + 0.5) * T - aw, hx * T + tuck, (hy + 0.5) * T + aw);
      }
    }
    if (alN) sctx.fill();
    sctx.globalAlpha = 1;
  }
  // Le calque de voirie est reposé ICI, à la fin de tout ce qui la compose :
  // agrandi ×z en NEAREST, il rend des bords en marches de la même taille que
  // les pixels des tuiles voisines. Après lui viennent le terre-plein et le
  // reste, qui gardent leur tracé propre.
  if (lay) walkLayerEnd(lay, ctx, z);
  if (PR) PR.allees = performance.now() - tAl;
  // Terre-plein PLANTÉ des boulevards 2-cellules : la passe est partie dans
  // isoStreet.js le 2026-08-23, avec sa config (elle y vivait déjà). Le chronomètre
  // reste ici — mesurer l'ordre des passes est le travail de cet orchestrateur.
  const tMd = PR && performance.now();
  drawIsoMedians(ctx, L.terrePlein, T, z);
  if (PR) {
    PR.median = performance.now() - tMd;
    PR.total = performance.now() - PR.t0;
    delete PR.t0;
    globalThis.__isoGroundProfileLast = PR;
  }
  ctx.restore();
  return true;
}

// ── Drawables triés au peintre (profondeur = wx + wy) ────────────────────────
function drawTreeIso(ctx, sx, sy, h) {
  // Sapin minimal Phase 1 : tronc + 2 étages de feuillage, ombre portée SE.
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath(); ctx.ellipse(sx + h * 0.16, sy, h * 0.30, h * 0.11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5d4630';
  ctx.fillRect(sx - h * 0.045, sy - h * 0.22, h * 0.09, h * 0.22);
  ctx.fillStyle = '#3f5a35';
  ctx.beginPath(); ctx.moveTo(sx, sy - h); ctx.lineTo(sx + h * 0.34, sy - h * 0.36); ctx.lineTo(sx - h * 0.34, sy - h * 0.36); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#4a6a3e';
  ctx.beginPath(); ctx.moveTo(sx, sy - h * 0.72); ctx.lineTo(sx + h * 0.42, sy - h * 0.16); ctx.lineTo(sx - h * 0.42, sy - h * 0.16); ctx.closePath(); ctx.fill();
}

// ── SURVOL ──────────────────────────────────────────────────────────────────
// CM.hover (posé par cityMapShowTooltip) porte enfin la tuile et la cellule
// visées : il était écrit deux fois et relu nulle part. On s'en sert pour
// répondre à « qu'est-ce que l'infobulle est en train de décrire ? », par un
// liseré sur la silhouette et un trait sur le losange au sol.
const HOUSE_BOX_CAP = 4000;            // garde-fou mémoire, jamais atteint en jeu
const HOVER_CELL = 'rgba(232,198,110,0.7)';

function drawIsoHoverCell(ctx, hw, hh) {
  const h = CM.hover;
  if (!h || !h.cell) return;
  const c = h.cell.split(',');
  const gx = +c[0], gy = +c[1];
  // ⚠ L'EMPREINTE ENTIÈRE, pas une cellule. `cell` porte le coin NORD du lot ;
  // un bâtiment de 2×2 ou 3×2 voyait donc son losange tracé sur la seule case
  // d'origine, celle qui est la PLUS ÉLOIGNÉE à l'écran — on croyait voir « la
  // case derrière le bâtiment s'allumer », alors que c'était bien la sienne,
  // mais réduite à son coin nord. Les habitations tiennent sur une case, d'où
  // un défaut invisible sur elles et criant sur les moteurs.
  const t = h.tile;
  const spanX = (t && (t.spanX || t.size)) || 1;
  const spanY = (t && (t.spanY || t.size)) || 1;
  const T = CM.TILE;
  const n = worldToScreen(gx * T, gy * T);                     // coin nord
  const e = { x: n.x + spanX * hw, y: n.y + spanX * hh };      // est
  const s = { x: n.x + (spanX - spanY) * hw, y: n.y + (spanX + spanY) * hh };
  const w = { x: n.x - spanY * hw, y: n.y + spanY * hh };      // ouest
  ctx.save();
  ctx.strokeStyle = HOVER_CELL;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(n.x, n.y);
  ctx.lineTo(e.x, e.y);
  ctx.lineTo(s.x, s.y);
  ctx.lineTo(w.x, w.y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

// Pool et vue des items du peintre (cf. commentaire dans drawIsoLive) —
// persistants au module : capacité conservée d'une frame à l'autre.
const ISO_ITEM_POOL = [];
const ISO_ITEM_VIEW = [];

function drawIsoLive(now) {
  const L = CM.layout, ctx = CM.ctx, T = CM.TILE, z = CM.cam.zoom;
  const hw = T * z * ISO_X, hh = T * z * ISO_Y;
  const b = visibleCellBounds(hw * 2);
  // CULL EN LOSANGE, complément de la boîte b : l'écran iso est un losange dont
  // b prend la boîte englobante — ~44 % des tuiles retenues étaient hors écran
  // mais triées ET dessinées quand même (PERF-CARTE-REPRISE §6). Marge basse
  // généreuse (10·hh) : un sprite se dresse depuis sa base, une base sous le
  // bord bas peut encore montrer sa tour. Molette __isoCullOff = 1 pour couper
  // (vérification par paire de captures, recette REPRISE).
  const dv = (typeof window !== 'undefined' && window.__isoCullOff)
    ? null : visibleDiamondBounds(hw * 2, hw * 2 + hh * 10);
  const dvVis = (wx0, wy0, wx1, wy1) => !dv
    || !(wx1 - wy0 < dv.u0 || wx0 - wy1 > dv.u1 || wx1 + wy1 < dv.v0 || wx0 + wy0 > dv.v1);
  // Boîtes des habitations pour le survol (cf. drawIsoWorld). null en LOD.
  const houseBoxes = CM._houseBoxes;
  // Marqueur de cellule AVANT le peintre : il est au sol, donc tout ce qui est
  // debout doit pouvoir passer devant.
  drawIsoHoverCell(ctx, hw, hh);
  // Intensité des fumées de cheminée pour CETTE frame (0 = personne ne fume) :
  // calculée une fois, elle décide aussi si l'on paie la collecte des items.
  const smokeK = SMOKE_TUNE.on ? smokeSeason() * (CM.ambianceK ?? 1) : 0;
  const band = (L.counts && L.counts.eraBand) | 0;
  const eraIdx = (L.counts && L.counts.eraIndex) | 0;
  // POOL D'ITEMS : la collecte fabriquait 3-4 000 littéraux d'objet par frame,
  // jetés au tri suivant — sur la machine de jeu, le ramasse-miettes passait à
  // la caisse d'un coup (pics vif-collecte à 26-39 ms contre 6 de moyenne).
  // Les objets du pool sont RÉUTILISÉS d'une frame à l'autre (forme unique →
  // hidden class stable) ; seule la vue `items` est repartie de zéro. Les refs
  // de la frame précédente restent dans les objets non réutilisés : sans effet
  // (chaque kind relit ses propres champs, posés au push). Les items de pont
  // (pushIsoBridgeItems) restent des littéraux — 30-150 par frame, négligeable.
  const items = ISO_ITEM_VIEW;
  items.length = 0;
  let itemN = 0;
  const pushItem = () => {
    let it = ISO_ITEM_POOL[itemN];
    if (!it) {
      it = ISO_ITEM_POOL[itemN] = {
        d: 0, kind: '', t: null, tr: null, p: null, v: null, w: null, wi: 0,
        moor: null, art: null, eraKey: '', axis: '', wx: 0, wy: 0, gx: 0, gy: 0,
        px: 0, py: 0, x0: 0, x1: 0, y0: 0, y1: 0, r: 0, i: 0, n: 0, pieces: null,
      };
    }
    itemN += 1;
    items.push(it);
    return it;
  };
  // Bâtiments (tuiles du layout) : maisons = sprite existant ; le reste = socle.
  for (const t of L.tiles) {
    // Révélation per-achat (parité legacy drawTile) : une maison-moteur du pool
    // pré-placé pas encore achetée reste MASQUÉE → « 1 achat = 1 bâtiment qui
    // apparaît » vaut aussi en iso (la ville n'est plus en avance sur les achats).
    if (t.type === 'enginehome' && (t.revealIdx || 0) >= (CM.engineHomeReveal || 0)) continue;
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    const idf = t.buildingId || t.variant || '';
    // POINT D'EAU (ex-aqueducs) : une cellule, un prop du KIT DES PLACES. On ne
    // pousse qu'un item `plazaProp` — tout le dessin (art d'ère, ancrage sur
    // l'encre, ombre, découpe des halos) est celui des places. Cf. § POINTS
    // D'EAU plus haut ; l'ancienne conduite 3-slice a été retirée avec son art.
    // Cull sur la SEULE cellule : une 1×1 n'a pas le problème d'emprise qui
    // faisait disparaître les champs d'un bloc.
    if (/aqueduct/i.test(idf)) {
      if (t.gx < b.gx0 || t.gx > b.gx1 || t.gy < b.gy0 || t.gy > b.gy1) continue;
      if (!dvVis(t.gx * T, t.gy * T, (t.gx + 1) * T, (t.gy + 1) * T)) continue;
      const wEra = waterPointEra(band);
      const wx = (t.gx + 0.5) * T, wy = (t.gy + 0.5) * T;
      const it = pushItem();
      it.d = depthOf(wx, wy); it.kind = 'plazaProp'; it.eraKey = wEra;
      // `p` résolu ICI et pas à l'import : personHT() suit la molette d'échelle
      // des habitants, et une valeur figée au chargement ne la verrait jamais.
      // noShadow : PAS d'ellipse sombre au pied (refus Raph 2026-08-05, même
      // refus que sous un bâtiment). Le puits pose sa propre ombre portée dans
      // son sprite, lumière en haut à gauche — la doubler d'une flaque noire
      // marquait le contact au lieu de le régler.
      it.art = { prop: 'well', variant: null, wx, wy, noShadow: true,
        hT: personHT() * (WATER_POINT_P[wEra] || 1) };
      continue;
    }
    // Recouvrement d'EMPRISE (et non la seule cellule d'origine, dont la sortie
    // d'écran faisait disparaître d'un bloc un champ 10×6 encore aux 3/4 visible
    // — G.44 de l'audit), puis test exact contre le losange.
    if (t.gx + sx < b.gx0 || t.gx > b.gx1 || t.gy + sy < b.gy0 || t.gy > b.gy1) continue;
    if (!dvVis(t.gx * T, t.gy * T, (t.gx + sx) * T, (t.gy + sy) * T)) continue;
    // Empreintes À PLAT (champ) = SOL : elles ne se dressent pas → rien
    // ne doit passer DERRIÈRE elles. Profondeur au coin NORD (min wx+wy) et non au
    // coin sud : ainsi tout objet qui les chevauche (arbre/bâtiment/véhicule/piéton,
    // dont le pied a forcément une profondeur ≥ ce coin nord) se trie APRÈS → au-dessus.
    // Un socle (bâtiment volumétrique) garde son ancre au coin SUD (tri par les pieds).
    const flat = /field|farm|crop|orchard/i.test(idf);
    // FRONT DE RUE : le poussé décale l'ancre du sprite, donc il DOIT décaler sa
    // clé de tri du même geste — sinon un bâtiment avancé de 0,14 tuile vers la
    // rue se dessine devant son voisin mais se trie derrière lui. Une parcelle à
    // plat ne bouge pas (elle n'a pas de porte, cf. les allées de seuil).
    const fo = flat ? null : isoFrontOffset(t, L.roadMap);
    const d = flat ? depthOf(t.gx * T, t.gy * T)
      : depthOf((t.gx + sx + (fo ? fo.ox : 0)) * T, (t.gy + sy + (fo ? fo.oy : 0)) * T);
    { const it = pushItem(); it.d = d; it.kind = 'tile'; it.t = t; }
    // FUMÉE : item SÉPARÉ, juste derrière son bâtiment dans l'ordre du peintre —
    // elle doit passer sous le voisin situé au nord, pas par-dessus tout.
    if (smokeK > 0 && (t.type === 'house' || t.type === 'enginehome') && pixelHouseReady(t)) {
      if (t._smokeS === undefined) t._smokeS = cmHash('smk:' + t.gx + ':' + t.gy) >>> 0;
      if (t._smokeS % SMOKE_TUNE.share === 0) { const it = pushItem(); it.d = d + 0.001; it.kind = 'smoke'; it.t = t; }
    }
    // CHEVRON « nouveau bâtiment » (A4) : item SÉPARÉ juste au-dessus du sien
    // (profondeur > fumée), le temps de REVEAL_PIN_MS après l'achat. Coupé par le
    // cran « Vie de la carte » comme la fumée ; pixelHouseReady garantit une boîte.
    if (t._revealPinAt && (CM.ambianceK ?? 1) > 0 && now - t._revealPinAt < REVEAL_PIN_MS && pixelHouseReady(t)) {
      items.push({ d: d + 0.002, kind: 'revealpin', t });
    }
    // BATEAU AMARRÉ du port : item SÉPARÉ trié à SA position — dessiné dans la
    // scène riveraine il héritait de la profondeur de l'EMPRISE du bâtiment et
    // passait PAR-DESSUS la travée du pont voisin (retour Raph, band 7).
    // portMooring écarte de plus le mouillage de l'emprise des ponts. Même
    // test « mouillé » que le rendu de la scène (cas riverain du switch).
    if (t.buildingId === 'river_ports' && t.type === 'engine' && isoEngineScenesFlag.on
      && L.river && L.river.present && L.river.cells) {
      let wet = false;
      for (let ax = 0; ax < sx && !wet; ax += 1) for (let ay = 0; ay < sy && !wet; ay += 1) {
        const k = (t.gx + ax) + ',' + (t.gy + ay);
        if (L.river.cells.has(k) || (L.river.banks && L.river.banks.has(k))) wet = true;
      }
      if (wet) {
        const moor = portMooring(t, sx, T, band, eraIdx, L.river);
        if (moor) {
          const hb = T * 0.30 * moor.effSize;   // contact visuel (même geste que les véhicules)
          items.push({ d: isoUnitDepth(moor.mx * T + hb, moor.my * T + hb), kind: 'portBoat', moor });
        }
      }
    }
  }
  // Arbres (décor) — assez près de la ville seulement (le bake du sol couvre le
  // reste). AÉRATION (retour Raph « tout est trop collé ») : pas d'arbre décoratif
  // à moins de 1.5 cellule de la place ni à moins de 1 cellule d'un terre-plein
  // (ils chevauchaient la fontaine et les haies).
  // ⚠ TOUTES les places, pas seulement la centrale : les places de quartier ont
  // droit au même dégagement, sinon un arbre du décor vient chevaucher leur
  // mobilier.
  const pbT = isoPlazaBoxes(L);
  const segsT = L.terrePlein || [];
  const treeBlocked = (gx, gy) => {
    for (const b of pbT) {
      if (gx >= b.gx0 - 1.5 && gx <= b.gx1 + 1.5 && gy >= b.gy0 - 1.5 && gy <= b.gy1 + 1.5) return true;
    }
    for (const sg of segsT) {
      if (sg.axis === 'v') {
        if (Math.abs(gx + 0.5 - (sg.x + 1)) < 1.0 && gy >= sg.y0 - 1 && gy <= sg.y1 + 1.5) return true;
      } else if (Math.abs(gy + 0.5 - (sg.y + 1)) < 1.0 && gx >= sg.x0 - 1 && gx <= sg.x1 + 1.5) return true;
    }
    return false;
  };
  // Emprise des PONTS (étendue « jusqu'au sec ») : aucun arbre/rocher dessus —
  // un rocher du décor mordait la culée au débouché (vu par Raph à la capture).
  for (const tr of (L.trees || [])) {
    if (tr.gx < b.gx0 || tr.gx > b.gx1 || tr.gy < b.gy0 || tr.gy > b.gy1) continue;
    if (!dvVis(tr.gx * T, tr.gy * T, (tr.gx + 1) * T, (tr.gy + 1) * T)) continue;
    if (treeBlocked(tr.gx, tr.gy)) continue;
    if (bridgeBlocks((tr.gx + 0.5) * T, (tr.gy + 0.5) * T, T * 0.45)) continue;
    { const it = pushItem(); it.d = depthOf((tr.gx + 0.5) * T, (tr.gy + 0.9) * T); it.kind = 'tree'; it.tr = tr; }
  }
  // Bétail et animaux de rue : un item PAR BÊTE, à sa profondeur — un troupeau
  // trié en bloc verrait ses moutons de devant passer derrière ceux du fond.
  for (const cr of (L.critters || [])) {
    if (cr.gx < b.gx0 || cr.gx > b.gx1 || cr.gy < b.gy0 || cr.gy > b.gy1) continue;
    if (!dvVis(cr.gx * T, cr.gy * T, (cr.gx + 1) * T, (cr.gy + 1) * T)) continue;
    { const it = pushItem(); it.d = depthOf((cr.gx + 0.5 + cr.jx) * T, (cr.gy + 0.5 + cr.jy) * T); it.kind = 'critter'; it.cr = cr; }
  }
  // Forêt sauvage (ceinture autour de la ville, hors sol urbain) — cf. isoWildForest.
  // Culling aux bornes visibles ; le jitter (jx/jy) casse l'alignement sur la grille.
  // ÉCLAIRCIE AU DÉZOOM (opt-in, comparaison visuelle en cours) : sous
  // WILD_THIN_UNIT px de tuile, les arbres de la ceinture se chevauchent
  // largement et l'œil ne distingue plus les individus. En sauter une part
  // (choix STABLE par cellule, donc pas de scintillement au pan) libère le
  // premier poste de la frame. Réglage : window.__wildThin = fraction gardée
  // (1 = tout, 0.5 = un sur deux).
  const wildKeep = (typeof window !== 'undefined' && window.__wildThin != null) ? window.__wildThin : 1;
  const wildThinOn = wildKeep < 1 && T * z < WILD_THIN_UNIT;
  for (const wt of isoWildForest(L, b)) {
    if (wt.gx < b.gx0 || wt.gx > b.gx1 || wt.gy < b.gy0 || wt.gy > b.gy1) continue;
    if (!dvVis(wt.gx * T, wt.gy * T, (wt.gx + 1) * T, (wt.gy + 1) * T)) continue;
    if (wildThinOn) {
      // Rang STABLE par arbre (mémoïsé) : le même arbre est gardé ou écarté
      // d'une frame à l'autre — un tirage par frame ferait clignoter la forêt.
      let rk = wt._rk;
      if (rk === undefined) rk = wt._rk = (cmHash('wk:' + wt.gx + ':' + wt.gy) % 1000) / 1000;
      if (rk >= wildKeep) continue;
    }
    if (treeBlocked(wt.gx, wt.gy)) continue;
    if (bridgeBlocks((wt.gx + 0.5 + wt.jx) * T, (wt.gy + 0.5 + wt.jy) * T, T * 0.45)) continue;
    { const it = pushItem(); it.d = depthOf((wt.gx + 0.5 + wt.jx) * T, (wt.gy + 0.9 + wt.jy) * T); it.kind = 'tree'; it.tr = wt; }
  }
  // PLACE. Deux modes, arbitrés par __plaza({mode}) :
  //   'kit'   (défaut) — place COMPOSÉE : un item PAR PROP, chacun trié à SA
  //           profondeur. C'est ce qui permet à un passant de croiser un banc
  //           (la scène unique n'avait qu'une profondeur pour toute la place)
  //           ET aux props de garder leur taille quand la place s'agrandit.
  //   'scene' — l'ancienne image unique, gardée comme référence d'A/B.
  {
    const pb = isoPlazaBox(L);
    const pKey = plazaEraForBand(band);
    if (pb && pKey) {
      if (isoPlazaKitOn(band)) {
        // Culling par une boîte d'UNE cellule autour du pied : un prop monte
        // au-dessus de son point d'ancrage, un test sur le point seul le ferait
        // disparaître au ras du bord haut de l'écran.
        isoPlazaItems(L, band, pushItem, (wx, wy) => dvVis(wx - T, wy - T, wx + T, wy + T));
      } else if (isoPlazaSceneOn(band)) {
        const pArt = isoArt('plaza-' + pKey);
        if (pArt.ready) {
          const cxw = ((pb.gx0 + pb.gx1 + 1) / 2) * T, cyw = ((pb.gy0 + pb.gy1 + 1) / 2) * T;
          items.push({
            d: depthOf(cxw, cyw), kind: 'plazaScene', wx: cxw, wy: cyw,
            px: pb.gx1 - pb.gx0 + 1, py: pb.gy1 - pb.gy0 + 1, art: pArt, eraKey: pKey,
          });
        }
      }
    }
  }
  // MOBILIER DE TROTTOIR (bancs, bacs, corbeilles) : mêmes items `plazaProp` que
  // la place, donc même art et même tri — seule la POSE est à nous (isoStreetProps).
  // Sauté en LOD : au dézoom un banc fait moins d'un pixel, et ils sont nombreux.
  CM._streetPropsDrawn = 0;   // remis à zéro même quand la passe est sautée (un compteur qui garde son dernier chiffre ment)
  if (!CM.lodActive && STREET_PROPS.on) {
    const sp = isoStreetPropsFor(L, band);
    let nSp = 0;
    // Sous ~2 px de haut, un banc n'est plus qu'un point : on ne le pousse même
    // pas dans le tri. Sans ce seuil, une mégapole en vue large empilait des
    // centaines d'items (mesuré 334) que drawIsoPlazaProp jetait un à un.
    const minH = 2 / (T * CM.cam.zoom);
    for (const rec of sp) {
      if (rec.hT < minH) continue;
      if (!dvVis(rec.wx - T, rec.wy - T, rec.wx + T, rec.wy + T)) continue;
      const it = pushItem();
      it.d = rec.d; it.kind = 'plazaProp'; it.art = rec; it.eraKey = streetPropEra(band);
      nSp += 1;
    }
    CM._streetPropsDrawn = nSp;
  }
  // CLÔTURES : même art, même tri et même seuil que le mobilier ci-dessus (elles
  // sortent du même kit de place). Sautées en LOD pour la même raison — au dézoom un
  // panneau fait moins d'un pixel, et ils sont quelques centaines.
  CM._fencesDrawn = 0;
  if (!CM.lodActive) {
    const fen = isoFencesFor(L, band);
    let nF = 0;
    const minHF = 2 / (T * CM.cam.zoom);
    const fEra = plazaEraForBand(band);
    for (const rec of fen) {
      if (rec.hT < minHF) continue;
      if (!dvVis(rec.wx - T, rec.wy - T, rec.wx + T * 2, rec.wy + T * 2)) continue;
      // La bande est cuite à la demande : tant que le PNG n'est pas décodé, on ne
      // pousse rien (et on ne met rien en cache) — le panneau apparaîtra au décodage.
      const strip = fenceStrip(rec.side, fEra, rec.per);
      if (!strip) continue;
      const it = pushItem();
      it.d = rec.d; it.kind = 'fence'; it.art = strip; it.wx = rec.wx; it.wy = rec.wy;
      it.hT = rec.hT;
      nF += 1;
    }
    CM._fencesDrawn = nF;
  }
  // MERVEILLES au TRI PEINTRE : profondeur = pied du monument (ancre drawWonder),
  // comme la scène de place — les badauds ATTROUPÉS au sud du socle passent
  // DEVANT, ceux au nord disparaissent derrière. Remplace l'ancien dessin « après
  // tout » (drawIsoWonders) qui recouvrait la foule du premier plan. La nuit
  // tombe APRÈS la passe vivante : l'éclairage des merveilles ne change pas.
  // Même comptabilité de naissance que le legacy (érection animée, sommeil).
  if (Array.isArray(state.wonders)) {
    const activeW = cmWonderActiveIds(state);
    const pvW = CM.previewWonder;   // aperçu dev (__showWonder) : force le rendu
    for (let wi = 0; wi < CM_WONDERS.length; wi += 1) {
      const w = CM_WONDERS[wi];
      if (activeW.has(w.id) || (pvW && pvW.id === w.id)) {
        if (!CM.born['wonder:' + w.id]) CM.born['wonder:' + w.id] = now;
        // Profondeur au POINT D'APPUI du sprite (wonderFootWorld), la MÊME
        // source que son ancre de dessin : c'est ce point qui décide qui passe
        // devant. Trié sur un autre, le monument recouvre les badauds de
        // l'anneau d'attroupement, qui sont pourtant visiblement devant lui.
        const foot = wonderFootWorld(wi, L.gridN, L.cx, L.cy);
        items.push({ d: depthOf(foot.x, foot.y), kind: 'wonder', w, wi });
      } else if (CM.born['wonder:' + w.id]) {
        delete CM.born['wonder:' + w.id];
      }
    }
  }
  // LA MAISON DES PLAISIRS, au tri peintre comme les merveilles : sa profondeur
  // est son PIED, pas son centre — sinon la tour, haute de 11 tuiles, passerait
  // devant des bateaux qui naviguent pourtant en aval d'elle.
  {
    const pl = L.river && L.river.plaisirs;
    if (pl && plaisirsSprite()) items.push({ d: depthOf(pl.x * T, pl.y * T), kind: 'plaisirs', pl });
    // Rien à peindre cette frame (pas de fleuve, donc pas de monument) : on
    // PÉRIME la boîte. Sans ça elle survivait à un effondrement qui redessine
    // une ville sans fleuve, et un carré d'écran restait cliquable dans le vide.
    else CM._plaisirsBox = null;
  }
  // LAMPADAIRES : mâts de l'ère le long des routes (liste déterministe
  // isoLamps), posés au peintre ; leurs halos de nuit se dessinent dans
  // drawIsoNight à la MÊME position (points lumineux ancrés, retour Raph).
  if (!CM.lodActive) {
    const lampArt = isoArt('lamp-' + lampEraForBand(band) + '?v=' + LAMP_V);
    if (lampArt.ready) {
      for (const lp of isoLamps(L, band)) {
        if (lp.gx < b.gx0 || lp.gx > b.gx1 || lp.gy < b.gy0 || lp.gy > b.gy1) continue;
        if (!dvVis(lp.wx, lp.wy, lp.wx, lp.wy)) continue;
        // lp.d = clé précalculée (computeIsoLamps) : pied wx+wy, REMONTÉE devant le
        // bâtiment mitoyen quand le mât longe sa façade sud/est (sinon avalé).
        // gx/gy suivent le mât jusqu'ici : c'est d'eux que sort la PHASE de
        // scintillement de son halo, déposé dans la foulée du sprite.
        { const it = pushItem(); it.d = lp.d; it.kind = 'lamp'; it.wx = lp.wx; it.wy = lp.wy; it.gx = lp.gx; it.gy = lp.gy; it.art = lampArt; }
      }
    }
  }
  // TERRE-PLEIN façon PLACE (2026-08-03) : le sol (gazon moucheté + PARTERRES
  // de fleurs) est dans le BAKE ; ici on ne pose que les BUISSONS par-dessus —
  // les slots IMPAIRS de medianSlots (les pairs portent les parterres), petits
  // (r 0.14-0.21, réfs municipales de Raph), légèrement décalés de l'axe, avec
  // ombre d'ancrage au pied (shadow) — fini les buissons « qui volent ».
  if (!CM.lodActive) {
    for (const sg of (L.terrePlein || [])) {
      if (sg.axis === 'v') {
        if (sg.x + 1 < b.gx0 - 1 || sg.x + 1 > b.gx1 + 1) continue;
        if (sg.y1 < b.gy0 - 2 || sg.y0 > b.gy1 + 2) continue;
      } else {
        if (sg.y + 1 < b.gy0 - 1 || sg.y + 1 > b.gy1 + 1) continue;
        if (sg.x1 < b.gx0 - 2 || sg.x0 > b.gx1 + 2) continue;
      }
      // En HIVER, les slots à BAC portent aussi un buisson : les bacs sont
      // retirés du bake (seuls les buissons enneigés rendent bien, retour Raph)
      // et la bande garde son rythme plein — un buisson par ~1.25 tuile.
      const winterBush = CM.season === WINTER;
      for (const sl of medianSlots(sg, T)) {
        if (sl.kind !== 'bush' && !winterBush) continue;
        const po = (((sl.h >>> 5) % 100) / 100 - 0.5) * T * 0.12;   // écart léger à l'axe
        const wx = sg.axis === 'v' ? sl.wx + po : sl.wx;
        const wy = sg.axis === 'v' ? sl.wy : sl.wy + po;
        const jj = ((sl.h >>> 12) % 100) / 100;
        items.push({ d: depthOf(wx, wy), kind: 'bush', wx, wy, r: 0.14 + jj * 0.07, v: 1 + ((sl.h >>> 9) % ISO_BUSH_VARIANTS), shadow: true });
      }
    }
  }
  // ── L'ÎLE QUE PERSONNE N'ENTRETIENT ─────────────────────────────────────────
  // Demande de Raph (2026-07-30), en même temps que le sillage : « peut-être du
  // décor dessus, petit caillou ou autre chose qu'on ait déjà ». Les CAILLOUX
  // n'existent plus : le mode `rocks` a été retiré de sliceCainosPlants avec ses
  // PNG, après deux refus (pierres plates « en tuile » dans l'herbe, puis blocs
  // ronds). On prend donc ce qui reste et qui dit la bonne chose : des BUISSONS.
  //
  // Et ils disent précisément la bonne : l'île est le socle d'une merveille où
  // l'on ne débarque jamais (Raph : « je veux que ça reste une île inaccessible »).
  // De la végétation qui repousse sur le sable, c'est le seul décor qui raconte
  // qu'aucune main ne passe là — un banc, une barrière ou un sentier diraient
  // l'inverse. Aucun sur le tiers central : la merveille y est posée.
  //
  // Placement par HASH de la position de l'île, donc stable d'une frame à l'autre
  // et d'une session à l'autre — un décor qui se retire au hasard chaque recompute
  // scintillerait à chaque recalcul de plan.
  if (!CM.lodActive && ISLAND_DECO.on) {
    for (const il of ((L.river && L.river.islands) || [])) {
      for (let k = 0; k < ISLAND_DECO.count; k += 1) {
        const h = cmHash('ideco:' + Math.round(il.x * 4) + ':' + Math.round(il.y * 4) + ':' + k) >>> 0;
        const a = ((h % 1000) / 1000) * Math.PI * 2;
        // Rayon normalisé tenu vers le BORD : au centre il y a la merveille, et
        // c'est de toute façon le pourtour d'une île de rivière qui se végétalise.
        const rr = ISLAND_DECO.rMin + (((h >>> 10) % 1000) / 1000) * (ISLAND_DECO.rMax - ISLAND_DECO.rMin);
        const al = Math.cos(a) * il.rx * rr, cr = Math.sin(a) * il.ry * rr;
        const wx = (il.x + al * il.tx - cr * il.ty) * T;
        const wy = (il.y + al * il.ty + cr * il.tx) * T;
        const gx = wx / T, gy = wy / T;
        if (gx < b.gx0 - 2 || gx > b.gx1 + 2 || gy < b.gy0 - 2 || gy > b.gy1 + 2) continue;
        items.push({
          d: depthOf(wx, wy), kind: 'bush', wx, wy,
          r: ISLAND_DECO.size * (0.8 + ((h >>> 20) % 100) / 250),
          v: 1 + ((h >>> 27) % ISO_BUSH_VARIANTS),
        });
      }
    }
  }
  // PONTS : platelage + verticalité, segments PAR CELLULE au tri peintre —
  // le platelage au coin nord (tout ce qui le chevauche passe dessus), les
  // parapets devant les jambes des traverseurs, le tout derrière/devant les
  // bâtiments voisins selon la profondeur. Seule l'ombre reste en passe
  // globale (drawIsoBridgeUnder, avant les bateaux). Cf. isoBridge.js.
  pushIsoBridgeItems(items, b);
  // Habitants : clé aux PIEDS, remontée devant les murs mitoyens (isoUnitDepth).
  if (!CM.lodActive) {
    for (const p of CM.citizens) {
      if (p._nightHidden) continue;
      const pwx = p.x + (p.lox || 0), pwy = p.y + (p.loy || 0);
      // Cull écran ABSENT jusqu'ici en iso (le legacy l'avait) : jusqu'à 450
      // piétons hors champ payaient tri + drawImage à chaque frame.
      if (!dvVis(pwx, pwy, pwx, pwy)) continue;
      { const dx = isoUnitDepthEx(pwx, pwy); const it = pushItem(); it.d = dx.d; it.ghost = dx.hidden; it.kind = 'cit'; it.p = p; }
    }
    // Véhicules : mêmes règles (drones = passe aérienne, plus tard). La
    // carrosserie est dessinée CENTRÉE sur l'ancre (drawIsoVehicle) : son
    // contact sol VISUEL tombe ~0.30·hauteur plus bas à l'écran → le point de
    // TRI est déplacé à ce contact (+h monde sur chaque axe = +0.60·taille·T
    // de profondeur), sinon un piéton derrière la carrosserie se dessinait
    // par-dessus (z-fight sur ~0.4 tuile, ~0.8 pour le tram).
    for (const v of CM.vehicles) {
      if (v.type === 'drone') continue;
      const lo = vehicleLaneOffset(v, T);
      if (!dvVis(v.x + lo.x, v.y + lo.y, v.x + lo.x, v.y + lo.y)) continue;
      const h = T * 0.30 * (VEH_SIZES[v.type] || 0) * VEH_SCALE;
      { const dx = isoUnitDepthEx(v.x + lo.x + h, v.y + lo.y + h); const it = pushItem(); it.d = dx.d; it.ghost = dx.hidden; it.kind = 'veh'; it.v = v; }
    }
  }
  // ÉMEUTE : émeutiers dans le TRI PEINTRE (clé pieds + offsets de file, comme
  // les habitants) — poussés MÊME au LOD (le signal de crise doit rester
  // visible, parité legacy). La sim tourne dans drawIsoWorld (updateCrisis).
  if (CM.riotDraw) {
    for (const p of CM.riotDraw.pts) {
      const laneX = (p.dir === 2 || p.dir === 3) ? (p.lane || 0) : 0;
      const laneY = (p.dir === 0 || p.dir === 1) ? (p.lane || 0) : 0;
      { const dx = isoUnitDepthEx(p.x + laneX, p.y + laneY); items.push({ d: dx.d, ghost: dx.hidden, kind: 'riot', p }); }
    }
  }
  fp('vif-collecte');
  items.sort((a, bb) => a.d - bb.d);
  fp('vif-tri');
  // DIAGNOSTIC DE GREFFE (opt-in, coût nul éteint) : composition du lot et
  // surtout nombre d'ALTERNANCES entre items « quad pur » (batchables en GL) et
  // items procéduraux. C'est ce chiffre qui décide de l'architecture du batcher :
  // une alternance = un vidage de lot, donc une composition plein écran.
  if (globalThis.__isoItemStats) {
    const st = { total: items.length, kinds: {}, alternances: 0, quads: 0, proc: 0 };
    let prevQuad = null;
    for (const it of items) {
      st.kinds[it.kind] = (st.kinds[it.kind] || 0) + 1;
      // « Quad pur » : un seul drawImage, sans géométrie vectorielle (cf. la
      // cartographie). Les scènes moteur en deviennent quand le cache est actif.
      const q = it.kind === 'cit' || it.kind === 'tree' || it.kind === 'bush' || it.kind === 'lamp'
        || (it.kind === 'tile' && it.t && (it.t.type === 'house' || it.t.type === 'enginehome'));
      if (q) st.quads += 1; else st.proc += 1;
      if (prevQuad !== null && q !== prevQuad) st.alternances += 1;
      prevQuad = q;
    }
    // Distribution des SÉRIES de quads consécutives : c'est elle qui décide si
    // une composition par série est jouable (peu de séries longues) ou non
    // (poussière de séries courtes).
    const runs = [];
    let cur = 0;
    for (const it of items) {
      const q = it.kind === 'cit' || it.kind === 'tree' || it.kind === 'bush' || it.kind === 'lamp'
        || (it.kind === 'tile' && it.t && (it.t.type === 'house' || it.t.type === 'enginehome'));
      if (q) cur += 1;
      else { if (cur) runs.push(cur); cur = 0; }
    }
    if (cur) runs.push(cur);
    runs.sort((a, b) => b - a);
    st.series = { nombre: runs.length, plusLongues: runs.slice(0, 6), medianeTaille: runs.length ? runs[runs.length >> 1] : 0 };
    st.couvertureTop8 = runs.slice(0, 8).reduce((a, b) => a + b, 0);
    globalThis.__isoItemStatsLast = st;
  }
  // ── GREFFE WebGL DES LONGUES SÉRIES ─────────────────────────────────────────
  // L'ordre du peintre entrelace sprites et procédural : composer à chaque
  // alternance serait ruineux (572 alternances mesurées au dézoom). Mais la
  // distribution est très inégale — au dézoom, DEUX séries (les ceintures
  // forestières nord et sud) portent à elles seules 2 975 des 5 401 sprites.
  // On ne bascule donc en GL que les séries LONGUES : elles partent en un seul
  // appel de dessin, et leur composition tombe à SA PLACE dans la file, donc
  // l'ordre du peintre est rigoureusement conservé. Tout le reste garde le
  // chemin Canvas 2D, inchangé.
  // ⚠ OPT-IN (window.__glPainter = true) — VERDICT MESURÉ du 28/07, poste de dev :
  //  • gain nul (×1,02, dans le bruit) : au dézoom les arbres sont MINUSCULES,
  //    leur `drawImage` coûte déjà presque rien, et la composition du lot mange
  //    ce qu'on économise. Le banc __glBench dit pourtant ×12,7 à 12 000
  //    sprites : le batcher est bon, c'est la MATIÈRE qui manque ici — le vrai
  //    poids de `vif-peinture` est le dessin VECTORIEL (scènes, ponts, champs),
  //    pas les sprites (cf. cartographie : « les blits ne coûtent rien »).
  //  • écart de rééchantillonnage : 3,7 % des pixels (plancher de bruit 0,6 %),
  //    invisible à l'œil mais réel — GL et Canvas 2D ne choisissent pas les
  //    mêmes texels quand un sprite est redimensionné.
  // La bascule redeviendra intéressante quand le procédural sera devenu des
  // sprites (cache de scènes actif, ponts et champs cuits) : la matière sera là.
  // À re-mesurer sur la machine de JEU, dont le GPU sature sur le NOMBRE
  // d'appels — le profil qui, lui, favorise le batcher.
  const profParts = !!globalThis.__isoProfParts;   // pesée fine, cf. plus haut
  // SPRITES D'ARBRE RÉSOLUS UNE FOIS PAR FRAME (et non par arbre). Mesuré à
  // dézoom : les arbres pesaient 12,7 ms sur 34, soit le premier poste de la
  // frame — et l'essentiel n'était pas le blit mais ce qui l'entoure, refait
  // pour CHACUN des 4 648 arbres : un hash de chaîne pour la variante, une
  // recherche de sprite par concaténation, une résolution de teinte
  // saisonnière. Or tout cela ne dépend que de la VARIANTE (4 en tout) : on le
  // résout une fois par frame, et chaque arbre n'a plus qu'à lire son entrée.
  const treeMemo = typeof window === 'undefined' || window.__treeMemo !== false;
  const treeImgs = [];
  for (let tv = 1; tv <= ISO_TREE_VARIANTS; tv += 1) {
    const a = isoArt('tree-' + tv);
    treeImgs[tv] = a.ready ? (seasonTree(a, 'tree-' + tv) || a.img) : null;
  }
  const glWanted = (typeof window !== 'undefined' && window.__glPainter === true) && items.length >= GL_RUN_MIN * 2;
  const glOn = glWanted && glInit();
  let glPending = 0, glRuns = 0, glSprites = 0;
  if (glOn) {
    for (const it of items) it._gl = 0;
    let start = -1;
    for (let i = 0; i <= items.length; i += 1) {
      const it = i < items.length ? items[i] : null;
      // Seuls les kinds à sprite ENTIER et sans géométrie vectorielle sont
      // éligibles : un arbre/buisson = un blit, rien d'autre.
      const q = !!it && (it.kind === 'tree' || it.kind === 'bush');
      if (q) { if (start < 0) start = i; continue; }
      if (start >= 0 && i - start >= GL_RUN_MIN) { for (let k = start; k < i; k += 1) items[k]._gl = 1; glRuns += 1; }
      start = -1;
    }
    if (glRuns) glBegin(CM.cw, CM.ch, CM.dpr || 1);
  }
  // Emprise écran du lot courant : composer PLEIN ÉCRAN coûterait plus cher que
  // les sprites économisés (une ceinture forestière, ce sont des milliers de
  // sprites minuscules — 1,3 Mpx au total — contre 1,5 Mpx par composition
  // plein cadre). On ne recopie donc que le rectangle réellement couvert.
  let gbx0 = 1e9, gby0 = 1e9, gbx1 = -1e9, gby1 = -1e9;
  const glCompose = () => {
    if (!glPending) return;
    glSprites += glFlush();
    const dpr = CM.dpr || 1;
    const x0 = Math.max(0, Math.floor(gbx0)), y0 = Math.max(0, Math.floor(gby0));
    const x1 = Math.min(CM.cw, Math.ceil(gbx1)), y1 = Math.min(CM.ch, Math.ceil(gby1));
    if (x1 > x0 && y1 > y0) {
      const prevS = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(glGetCanvas(),
        Math.round(x0 * dpr), Math.round(y0 * dpr), Math.round((x1 - x0) * dpr), Math.round((y1 - y0) * dpr),
        x0, y0, x1 - x0, y1 - y0);
      ctx.imageSmoothingEnabled = prevS;
    }
    glPending = 0;
    gbx0 = 1e9; gby0 = 1e9; gbx1 = -1e9; gby1 = -1e9;
    glBegin(CM.cw, CM.ch, CM.dpr || 1);   // repart d'un cadre vierge
  };
  // HALO d'émeute : nappe rouge pulsée AU SOL, sous toute la scène vivante (le
  // cercle écran du legacy devient une ellipse iso 2:1). Mêmes rayon et alphas.
  if (CM.riotDraw) {
    const c = worldToScreen(CM.riotDraw.cx, CM.riotDraw.cy);
    const pulse = 0.5 + 0.5 * Math.sin(now / 320);
    const R = Math.max(1, (1.6 + (state.instability || 0) * 1.4) * T * z);
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(1, 0.5);                               // disque couché au sol (losange 2:1)
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    g.addColorStop(0, `rgba(200,40,30,${(0.16 + 0.12 * pulse).toFixed(2)})`);
    g.addColorStop(1, 'rgba(200,40,30,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  const prevSmooth = ctx.imageSmoothingEnabled;
  // COUCHE DE LUMIÈRE : armée pour toute la durée du peintre. Les lampes y
  // déposent leur halo à leur place dans le tri, les sprites peints ensuite y
  // découpent leur silhouette. Désarmée juste après la boucle — rien de ce qui
  // suit (oiseaux, drones, voile) n'a de profondeur à faire valoir. Sous une
  // tuile de LIGHT_LAYER.minUnit pixels on y renonce (halos minuscules, découpes
  // innombrables) et la passe de nuit repeint les halos en direct, comme avant.
  const lampK = beginLightLayer(T * z >= LIGHT_LAYER.minUnit) ? isoLampLightFrame(L) : null;
  for (const it of items) {
    // Un item NON basculé doit être peint APRÈS le lot en cours : on compose
    // d'abord, sinon la série GL passerait par-dessus lui.
    if (glPending && !it._gl) glCompose();
    if (it.kind === 'tile') {
      const t = it.t;
      const spanX = t.spanX || t.size || 1, spanY = t.spanY || t.size || 1;
      // Ancre = coin SUD de l'empreinte (point monde (gx+spanX, gy+spanY)),
      // DÉCALÉE vers la façade sur rue (cf. FRONT) : sans ça le bâtiment flotte
      // au milieu de son lot et la rue n'a pas de mur. Le même décalage est
      // appliqué à la clé de tri, plus haut — les deux ne se séparent jamais.
      const fOff = /field|farm|crop|orchard/i.test(t.buildingId || t.variant || '')
        ? null : isoFrontOffset(t, L.roadMap);
      const anchor = worldToScreen((t.gx + spanX + (fOff ? fOff.ox : 0)) * T,
        (t.gy + spanY + (fOff ? fOff.oy : 0)) * T);
      const isHouse = t.type === 'house' || t.type === 'enginehome';
      // Bâtiment RIVERAIN (port : l'empreinte mord la berge/l'eau) : scène iso
      // DÉDIÉE (drawIsoRiverside — bâtiment sur berge, ponton vers le ruban,
      // bateau amarré). Ni scène-boîte legacy ni socle : la boîte legacy
      // embarque son eau en repère carré (bassin flottant, vu à la capture).
      // Les CHAMPS ont un rendu À PLAT dédié (parcelle à sillons, plus bas) et
      // DOIVENT s'afficher même si leur emprise mord la berge : on les exclut du
      // cull « mouillé », sinon ils disparaissaient (branchement iso oublié).
      // Seuls les moteurs « en bloc » sont culés au-dessus de l'eau (le port part
      // en scène riveraine). (Les aqueducs étaient ici aussi, pour la même raison
      // — leur prise d'eau se posait EXPRÈS au bord. Les points d'eau qui les
      //  remplacent ne touchent plus l'eau et n'ont plus rien à y faire.)
      const idFlat = t.buildingId || t.variant || '';
      const isFlatFootprint = /field|farm|crop|orchard/i.test(idFlat);
      if (t.type === 'engine' && !isFlatFootprint) {
        const rc = (L.river && L.river.present && L.river.cells) || null;
        if (rc) {
          let wet = false;
          for (let ax = 0; ax < spanX && !wet; ax += 1) for (let ay = 0; ay < spanY && !wet; ay += 1) {
            if (rc.has((t.gx + ax) + ',' + (t.gy + ay)) || (L.river.banks && L.river.banks.has((t.gx + ax) + ',' + (t.gy + ay)))) wet = true;
          }
          if (wet) {
            if (t.buildingId === 'river_ports' && isoEngineScenesFlag.on) {
              drawIsoRiverside(ctx, t, spanX, spanY, T, z, now, band, eraIdx);
            }
            continue;
          }
        }
      }
      const wpx = (spanX + spanY) * T * z * ISO_X * 0.78;  // largeur allouée au sprite (~78 % du losange)
      let engineBox;   // boîte rendue par la scène moteur, publiée pour le survol
      if (isHouse && pixelHouseReady(t)) {
        if (profParts) fp('vif-peinture');
        const hpx = wpx;                                    // seul y+h compte (ancre pieds)
        const hx = anchor.x - wpx / 2, hy = anchor.y - hpx - hh * 0.5;
        // SURVOL : le liseré se dessine AVANT le sprite (blob élargi puis sprite
        // par-dessus), sinon il mange la silhouette au lieu de la cerner.
        if (CM.hover && CM.hover.tile === t) drawPixelHouseOutline(t, hx, hy, wpx, hpx, HOVER_GOLD);
        const box = drawPixelHouse(t, hx, hy, wpx, hpx);
        // Mémorise la boîte réellement dessinée : c'est le seul endroit qui la
        // connaisse. Consommée par le hit-test à la silhouette (cityMapHitTest),
        // qui tourne à la souris, donc sur les boîtes de la dernière frame.
        // Ordre de la liste = ordre du peintre (loin → près) : le hit-test la
        // parcourt à l'envers pour toucher d'abord ce qui est devant.
        if (box && houseBoxes && houseBoxes.length < HOUSE_BOX_CAP) houseBoxes.push({ b: box, t });
        if (profParts) fp('vif-maisons');
      } else if (t.type === 'engine' && isoEngineScenesFlag.on && (engineBox = drawIsoEngineScene(ctx, t, anchor, spanX, spanY, T, z, hh, now))) {
        // Scène moteur legacy posée sur le losange (Phase 3-lite) — cf. helper.
        // ⚠ ON PUBLIE SA BOÎTE, exactement comme les habitations juste au-dessus.
        // Sans ça, un moteur haut (école, temple) n'existait pas pour le
        // hit-test : viser son toit retombait sur la cellule projetée dessous,
        // celle SITUÉE DERRIÈRE, et c'est elle que le losange de survol
        // illuminait — alors que l'infobulle, elle, tombait juste par le repli
        // sur la grille. Symptôme signalé par Raph, capture à l'appui.
        if (houseBoxes && houseBoxes.length < HOUSE_BOX_CAP) houseBoxes.push({ b: engineBox, t });
      } else {
        const id2 = t.buildingId || t.variant || '';
        const n = worldToScreen(t.gx * T, t.gy * T);
        const e = { x: n.x + spanX * hw, y: n.y + spanX * hh };
        const s = { x: n.x + (spanX - spanY) * hw, y: n.y + (spanX + spanY) * hh };
        const w = { x: n.x - spanY * hw, y: n.y + spanY * hh };
        if (/field|farm|crop|orchard/i.test(id2)) {
          // CHAMPS : patchwork de parcelles cultivées façon TheoTown (cf. drawIsoField) —
          // la scène legacy (peinture carrée du sol) ne se pose pas sur le losange.
          if (profParts) fp('vif-peinture');
          drawIsoField(ctx, t, spanX, spanY, band, eraIdx);
          if (profParts) fp('vif-champs');
          continue;
        }
        // (Un repli « canal plat » de l'aqueduc vivait ici : une bande beige et
        //  un filet d'eau bleu le long de l'axe long de l'emprise, dessinés tant
        //  que les pièces 3-slice n'étaient pas décodées. Retiré avec le reste de
        //  la conduite — un point d'eau n'atteint plus jamais ce chemin, il part
        //  en `plazaProp` bien avant, et son repli à lui est le gabarit du kit.)
        // Socle : BLOC iso extrudé (empreinte + 2 murs + toit plat) — repli des
        // scènes en quarantaine / molette __isoEngineScenes(false).
        const c = t.type === 'engine' ? [172, 152, 112] : [150, 142, 120];
        const v = 0.96 + ((cmHash(t.gx + ':' + t.gy) % 100) / 100) * 0.08;
        // Extrusion discrète, plafonnée : les grandes empreintes moteur ne doivent pas
        // écraser les habitations au jalon (leurs scènes arrivent en Phase 3).
        const hgt = hh * 1.1;
        // mur ouest (ombré) puis mur est (plus sombre — lumière haut-gauche), puis toit.
        ctx.fillStyle = rgb(c, 0.78 * v);
        ctx.beginPath(); ctx.moveTo(w.x, w.y); ctx.lineTo(s.x, s.y); ctx.lineTo(s.x, s.y - hgt); ctx.lineTo(w.x, w.y - hgt); ctx.closePath(); ctx.fill();
        ctx.fillStyle = rgb(c, 0.6 * v);
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(s.x, s.y); ctx.lineTo(s.x, s.y - hgt); ctx.lineTo(e.x, e.y - hgt); ctx.closePath(); ctx.fill();
        ctx.fillStyle = rgb(c, v);
        ctx.beginPath(); ctx.moveTo(n.x, n.y - hgt); ctx.lineTo(e.x, e.y - hgt); ctx.lineTo(s.x, s.y - hgt); ctx.lineTo(w.x, w.y - hgt); ctx.closePath(); ctx.fill();
        // Le bloc de repli masque lui aussi les halos déposés derrière lui : sa
        // silhouette est le PRISME (losange du toit + deux murs), tracé d'un trait.
        lightCut(w.x, n.y - hgt, e.x, s.y, (lc) => {
          lc.beginPath();
          lc.moveTo(n.x, n.y - hgt); lc.lineTo(e.x, e.y - hgt); lc.lineTo(e.x, e.y);
          lc.lineTo(s.x, s.y); lc.lineTo(w.x, w.y); lc.lineTo(w.x, w.y - hgt);
          lc.closePath(); lc.fill();
        });
      }
    } else if (it.kind === 'tree') {
      if (profParts) fp('vif-peinture');
      // ARBRES PIXEL (retour Raph : les sapins-triangles « pas faits
      // correctement du tout ») : sprite PixelLab /pixelart/iso/tree-N.png,
      // variante stable par hash de cellule ; repli = triangle procédural.
      const tr = it.tr;
      const p = worldToScreen((tr.gx + 0.5 + (tr.jx || 0)) * T, (tr.gy + 0.9 + (tr.jy || 0)) * T);
      // Variante mémoïsée SUR L'ARBRE : elle ne dépend que de sa cellule, et
      // les objets d'arbre sont persistants (layout, et cache par blocs pour la
      // forêt sauvage) — le hash de chaîne ne se paie donc qu'une fois par arbre
      // et par vie de cache, au lieu d'une fois par arbre et par frame.
      let tv = tr._tv;
      if (tv === undefined || !treeMemo) tv = tr._tv = 1 + (cmHash('tree:' + tr.gx + ':' + tr.gy) % ISO_TREE_VARIANTS);
      // __treeMemo = false : rejoue la résolution par arbre (A/B de la mesure).
      const tImg0 = treeMemo ? treeImgs[tv] : (() => { const a = isoArt('tree-' + tv); return a.ready ? (seasonTree(a, 'tree-' + tv) || a.img) : null; })();
      if (tImg0) {
        const hpx = T * z * treeCanvasT(tr.r, tr.fixed);
        // Feuillage TEINTÉ par la saison : la teinte est cuite une fois par
        // (variante, saison) dans un canvas hors écran, et l'image résolue nous
        // vient de treeImgs (une fois par frame, cf. plus haut).
        const tImg = tImg0;
        const tdx = p.x - hpx / 2, tdy = p.y - hpx * 0.92;
        // Série basculée : le sprite part au batcher (un seul appel de dessin
        // pour toute la série). Refus du batcher (atlas plein, source pas
        // décodée) → chemin 2D, sprite par sprite, comme avant.
        let batched = false;
        if (it._gl) {
          const sw = tImg.naturalWidth || tImg.width | 0, sh = tImg.naturalHeight || tImg.height | 0;
          batched = glQuad(tImg, 0, 0, sw, sh, tdx, tdy, hpx, hpx);
          if (batched) {
            glPending += 1;
            if (tdx < gbx0) gbx0 = tdx; if (tdy < gby0) gby0 = tdy;
            if (tdx + hpx > gbx1) gbx1 = tdx + hpx; if (tdy + hpx > gby1) gby1 = tdy + hpx;
          }
        }
        if (!batched) {
          const prevTS = ctx.imageSmoothingEnabled;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(tImg, tdx, tdy, hpx, hpx);
          ctx.imageSmoothingEnabled = prevTS;
        }
        // L'occultation du calque de lumière vit dans un AUTRE canvas : elle
        // reste identique quel que soit le pipeline du sprite.
        lightCutImage(tImg, tdx, tdy, hpx, hpx);
      } else {
        drawTreeIso(ctx, p.x, p.y, T * z * (tr.r || 0.7) * 1.3 * treeBandMul(tr.fixed));
      }
      if (profParts) fp('vif-arbres');
    } else if (it.kind === 'critter') {
      const cr = it.cr;
      const p = worldToScreen((cr.gx + 0.5 + cr.jx) * T, (cr.gy + 0.5 + cr.jy) * T);
      drawCritterIso(ctx, p.x, p.y, T * z, cr, AGENT_SCALE);
    } else if (it.kind === 'plazaProp') {
      // PLACE COMPOSÉE : un prop, à sa taille en TUILES (jamais en fraction de
      // la place). Tout le calcul est dans isoPlaza.js.
      drawIsoPlazaProp(ctx, it.art, it.eraKey, now);
    } else if (it.kind === 'plazaGrid') {
      drawIsoPlazaGrid(ctx, it.art);     // overlay de travail (__plaza({grid|ruler}))
    } else if (it.kind === 'plazaScene') {
      // Losange de CONTENU mesuré calé pile sur l'emprise de la dalle (le
      // canvas brut décalait la scène — retour Raph).
      const p = worldToScreen(it.wx, it.wy);
      const g = drawIsoGroundedArt(ctx, it.art, p.x, p.y, (it.px + it.py) * T * z * ISO_X * 0.98);
      // EAU DE LA FONTAINE : frame courante du strip re-projetée sur la scène
      // (rect source → géométrie du draw) ; hors eau le strip est identique à
      // la scène (pixels verrouillés) donc l'overlay est invisible à l'arrêt.
      const fa = FOUNTAIN_ANIM[it.eraKey];
      // L'eau de fontaine survit au cran « sobre » : c'est une animation lente,
      // locale et attendue. Seul « aucune » l'arrête, avec le reste.
      if (fa && FOUNTAIN_TUNE.on && g && (CM.ambianceK ?? 1) > 0) {
        const fArt = isoArt('anim/plaza-fountain-' + it.eraKey + '?v=' + FA_V);
        if (fArt.ready) {
          const iw = it.art.img.naturalWidth || 1, ih = it.art.img.naturalHeight || 1;
          const nf = Math.max(1, Math.round((fArt.img.naturalWidth || fa.w) / fa.w));
          const f = Math.floor((now || 0) / FOUNTAIN_TUNE.ms) % nf;
          const prevFS = ctx.imageSmoothingEnabled;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(fArt.img, f * fa.w, 0, fa.w, fa.h,
            g.x + fa.x * (g.w / iw), g.y + fa.y * (g.h / ih), fa.w * (g.w / iw), fa.h * (g.h / ih));
          ctx.imageSmoothingEnabled = prevFS;
        }
      }
    } else if (it.kind === 'smoke') {
      const t = it.t;
      const spanX = t.spanX || t.size || 1, spanY = t.spanY || t.size || 1;
      const anchor = worldToScreen((t.gx + spanX) * T, (t.gy + spanY) * T);
      const wpx = (spanX + spanY) * T * z * ISO_X * 0.78;
      // MÊME appel de géométrie que le dessin du sprite : la source de la fumée
      // se recale donc automatiquement sur tout changement de cadrage du sprite.
      drawIsoSmoke(pixelHouseBox(t, anchor.x - wpx / 2, anchor.y - wpx - hh * 0.5, wpx, wpx), t._smokeS, now, smokeK);
    } else if (it.kind === 'revealpin') {
      const t = it.t;
      const spanX = t.spanX || t.size || 1, spanY = t.spanY || t.size || 1;
      const anchor = worldToScreen((t.gx + spanX) * T, (t.gy + spanY) * T);
      const wpx = (spanX + spanY) * T * z * ISO_X * 0.78;
      // MÊME géométrie que le sprite (cf. fumée) → le chevron suit tout recadrage.
      drawIsoRevealPin(pixelHouseBox(t, anchor.x - wpx / 2, anchor.y - wpx - hh * 0.5, wpx, wpx), t._revealPinAt, now);
    } else if (it.kind === 'wonder') {
      // MERVEILLE au tri peintre : drawWonder gère ancre/cull/érection lui-même.
      drawWonder(it.w, it.wi, now);
    } else if (it.kind === 'plaisirs') {
      const art = plaisirsSprite();
      if (art) {
        const p = worldToScreen(it.pl.x * T, it.pl.y * T);
        const nw = art.img.naturalWidth || 1, nh = art.img.naturalHeight || 1;
        // Hauteur = celle du sprite convertie en tuiles au PPT des merveilles,
        // largeur au ratio du PNG : un blit carré l'écraserait.
        const hpx = T * z * (nh / PLAISIRS_PPT);
        const wpx = hpx * (nw / nh);
        // Boîte RÉELLEMENT dessinée, publiée pour le hit-test du clic
        // (cityMapRuntime) ET pour l'aura (isoPlaisirs). Publiée ICI et pas
        // recalculée là-bas : deux projections séparées finissent toujours par
        // diverger, et la zone cliquable se retrouverait à côté de la tour.
        // Posée AVANT le blit : l'aura s'y ancre et doit passer avant lui.
        const box = { dx: p.x - wpx / 2, dy: p.y - hpx, dw: wpx, dh: hpx };
        CM._plaisirsBox = box;
        // AURA, à la profondeur du monument : le cerne de lumière sur l'eau puis
        // les foyers de la tour. Déposés dans la couche de lumière, donc
        // découpés par tout ce que le peintre dessine ensuite — à commencer par
        // le sprite lui-même, trois lignes plus bas.
        drawPlaisirsRing(it.pl, now);
        queuePlaisirsGlow(box, now);
        const prevPS = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        // Ancré sur le PIED (bas, centré) : le fût plonge dans l'eau au point
        // exact qui a servi à évaser le lit.
        // LISERÉ DE SURVOL, comme les habitations et les moteurs : le monument
        // est CLIQUABLE, il doit donc dire qu'on le touche. Posé juste avant le
        // sprite, à la même géométrie, il ne dépasse que d'un pixel.
        if (CM.hover && CM.hover.plaisirs) {
          drawSpriteOutline(art.img, box.dx, box.dy, wpx, hpx, HOVER_GOLD);
        }
        ctx.drawImage(art.img, box.dx, box.dy, wpx, hpx);
        ctx.imageSmoothingEnabled = prevPS;
        // La tour DÉCOUPE l'aura qu'elle vient de poser : sans ça le cerne
        // additif blanchirait son pied et les foyers lui traverseraient la
        // façade. Même geste que les scènes moteur (drawIsoGroundedArt).
        lightCutImage(art.img, box.dx, box.dy, wpx, hpx);
      }
    } else if (it.kind === 'lamp') {
      const p = worldToScreen(it.wx, it.wy);
      const m = lampFootMetrics(it.art) || { footXf: 0.5, footYf: 0.97, usedHf: 0.92 };
      // hauteur cible = CONTENU visible (LAMP_TUNE.h tuiles), pas le canvas.
      const hpx = T * z * LAMP_TUNE.h / (m.usedHf || 1);
      // Largeur au RATIO du PNG (les v3 sont 64×128 : un blit carré les étirerait ×2).
      const wpx = hpx * ((it.art.img.naturalWidth || 1) / (it.art.img.naturalHeight || 1));
      const prevLS = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(it.art.img, p.x - wpx * m.footXf, p.y - hpx * m.footYf, wpx, hpx);
      ctx.imageSmoothingEnabled = prevLS;
      // HALO DÉPOSÉ ICI, à la profondeur du mât : tout ce que le peintre dessine
      // après lui (donc devant) viendra le découper. Sans ce dépôt en place, le
      // halo se peignait à plat en fin de frame et traversait les façades.
      if (lampK && lampLit(it, lampK)) {
        const bx = lampGlowBox(p, lampK);
        const lc = lightCtx(bx.x0, bx.y0, bx.x1, bx.y1);
        if (lc) paintLampGlow(lc, it, p, lampK, now);
      }
    } else if (it.kind === 'fence') {
      // BANDE DE CLÔTURE (lot L9). `it.wx/wy` est le coin de DÉPART de l'arête, et la
      // bande a été composée pour couvrir exactement une arête de cellule.
      //
      // L'échelle se déduit de la couverture voulue, pas d'un réglage : les `per`
      // panneaux doivent couvrir l'écart écran d'UNE cellule sur l'axe, soit
      // T·ISO_X·z. Le reste (hauteur) suit le ratio du canevas — jamais un blit carré,
      // qui écraserait la bande.
      const st = it.art;
      const p = worldToScreen(it.wx, it.wy);
      const s = (T * ISO_X * z) / st.cw;
      // Le PREMIER panneau doit poser son pied sur le coin de départ : sa base est à
      // `panelH` du haut de la bande. Pour un côté e/w le premier panneau est à
      // DROITE du canevas, donc l'ancre horizontale change avec le sens d'avance.
      const x0 = st.right ? p.x : p.x - st.cw * s;
      const y0 = p.y - st.panelH * s;
      const prevFS = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(st.canvas, Math.round(x0), Math.round(y0),
        Math.round(st.cw * s), Math.round(st.ch * s));
      ctx.imageSmoothingEnabled = prevFS;
    } else if (it.kind === 'bush') {
      // Buisson de terre-plein : feuillu réutilisé petit, pied sur la couture.
      const p = worldToScreen(it.wx, it.wy);
      // Buisson DÉDIÉ (bush-N) ; repli sur le feuillu rapetissé d'avant si le
      // PNG manque. Teinté par la saison comme les arbres — sinon le terre-plein
      // restait vert d'été au milieu d'une avenue en automne.
      // La clé de saison suit l'art RÉELLEMENT dessiné : sur les premières
      // frames le buisson n'est pas encore décodé et on tombe sur l'arbre —
      // une clé fixe aurait figé cet arbre teinté dans le cache pour de bon.
      let bArt = isoArt('bush-' + it.v), bKey = 'bush-' + it.v;
      if (!bArt.ready) { const fv = 1 + (it.v % 2); bArt = isoArt('tree-' + fv); bKey = 'tree-' + fv; }
      if (bArt.ready) {
        const hpx = T * z * treeCanvasT(it.r);
        // Ombre d'ancrage au pied (terre-plein) : sans elle le buisson « vole »
        // au-dessus du gazon (retour Raph 2026-08-03) — l'île garde son rendu nu.
        if (it.shadow) {
          ctx.fillStyle = 'rgba(28,40,22,0.38)';
          ctx.beginPath();
          ctx.ellipse(p.x, p.y + hpx * 0.01, hpx * 0.30, hpx * 0.115, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        const prevBS = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        const bImg = seasonTree(bArt, bKey) || bArt.img;
        ctx.drawImage(bImg, p.x - hpx / 2, p.y - hpx * 0.92, hpx, hpx);
        ctx.imageSmoothingEnabled = prevBS;
        lightCutImage(bImg, p.x - hpx / 2, p.y - hpx * 0.92, hpx, hpx);
      }
    } else if (it.kind === 'bridgeSeg') {
      // Jalons de pesée (opt-in) : ces deux postes sont les candidats à la
      // cuisson en texture — il faut leur coût RÉEL avant d'y consacrer une
      // séance. Coût nul profileur éteint.
      if (profParts) fp('vif-peinture');
      drawIsoBridgeSeg(ctx, it, now);
      if (profParts) fp('vif-ponts');
    } else if (it.kind === 'portBoat') {
      drawIsoPortBoat(ctx, it.moor, now, z, T);
    } else if (it.kind === 'veh') {
      drawIsoVehicle(ctx, it.v, now, z);
    } else if (it.kind === 'riot') {
      drawIsoRioter(ctx, it.p, now, z);
    } else {
      drawIsoCitizenItem(ctx, it.p, now, z);
    }
  }
  glCompose();                     // dernière série éventuelle
  if (glOn) {
    globalThis.__glPainterLast = { series: glRuns, sprites: glSprites };
  }
  // ── SILHOUETTES FANTÔMES ────────────────────────────────────────────────────
  // La vie urbaine disparaissait derrière le bâti haut (correct en 3/4, mais on ne
  // voyait plus vivre la ville — Raph 2026-08-03, « à tous les âges »). Toute unité
  // marquée `ghost` par isoUnitDepthEx (un occulteur franc au sud la recouvre) est
  // REDESSINÉE par-dessus le peintre en transparence : on la devine à travers la
  // façade. AVANT endLightLayer pour qu'elle vive sous la même lumière que la scène.
  // Molette : __ghost({ on, alpha }) — alpha 0 = coupé.
  if (GHOST_TUNE.on && GHOST_TUNE.alpha > 0 && !CM.lodActive) {
    const prevGA = ctx.globalAlpha;
    ctx.globalAlpha = GHOST_TUNE.alpha;
    for (const it of items) {
      if (!it.ghost) continue;
      if (it.kind === 'cit') drawIsoCitizenItem(ctx, it.p, now, z);
      else if (it.kind === 'veh') drawIsoVehicle(ctx, it.v, now, z);
      else if (it.kind === 'riot') drawIsoRioter(ctx, it.p, now, z);
    }
    ctx.globalAlpha = prevGA;
  }
  endLightLayer();
  ctx.imageSmoothingEnabled = prevSmooth;
  fp('vif-peinture');
  // Anneaux d'apaisement (clic sur un émeutier) : anneaux AU SOL projetés en
  // ellipse iso — mêmes minuterie et teinte que le legacy (drawCrisis).
  if (CM.calmPoofs && CM.calmPoofs.length) {
    for (let i = CM.calmPoofs.length - 1; i >= 0; i -= 1) {
      const e = CM.calmPoofs[i];
      const k = (now - e.t) / 700;
      if (k >= 1) { CM.calmPoofs.splice(i, 1); continue; }
      const c = worldToScreen(e.x, e.y);
      const r = (4 + k * 14) * Math.max(0.6, z);
      ctx.strokeStyle = `rgba(150,230,170,${(0.8 * (1 - k)).toFixed(2)})`;
      ctx.lineWidth = Math.max(1, 2 * z * (1 - k));
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(1, 0.5);                             // anneau couché au sol (losange 2:1)
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }
}

// Délai d'immobilité caméra (ms) avant la recuisson du sol NET après un geste.
// Court = le net revient vite (moins de flou transitoire ressenti au zoom/pan) ;
// trop court rendrait la recuisson plus fréquente entre deux à-coups. 110 ms est
// un compromis net/fluide. Ancienne valeur : 160 ms.
const ISO_SETTLE_MS = 110;
// SECOND palier d'accalmie : délai avant le sol PLEIN (le bake cher). Entre
// ISO_SETTLE_MS et celui-ci, on pose le bake ALLÉGÉ — sol présent et aligné,
// sans touffes ni franges ni textures, ~4× moins cher (cf. la branche de pan).
//
// Pourquoi deux paliers : un dézoom à la molette n'est pas UN geste, c'est une
// SUITE de gestes courts séparés de 200–400 ms. Avec le seul seuil de 110 ms,
// chaque cran retombait au repos et payait une recuisson PLEINE. Mesuré au
// profileur sur 13 s de dézoom (fenêtre 2005×1369) : drawIsoGround 1 197 ms et
// cityMapBakeMargin 1 223 ms, pendant que le thread principal n'était occupé
// qu'à 35 % — c'est le GPU qui saturait, noyé sous les blits par cellule.
// 400 ms couvre l'intervalle entre deux crans : on ne paie plus le sol plein
// qu'une fois, quand le joueur a réellement fini de dézoomer.
const ISO_CRISP_SETTLE_MS = 400;
// Coalescence des invalidations DOUCES (sprite décodé en retard, bm.soft) :
// au chargement d'une mégapole, ~10-20 PNG décodent étalés sur autant de
// frames, et chacun déclenchait une recuisson PLEINE immédiate (caméra
// immobile → settled). Mesuré le 2026-07-27 : 110-190 ms PAR FRAME, 1,6 s de
// gel cumulé pour 12 décodages. Le contenu du bake existant reste VALABLE
// (c'est la définition du soft) : on le re-blitte et on ne recuit qu'une fois
// par fenêtre — la cascade devient au pire 2-3 recuissons.
const ISO_SOFT_BAKE_MIN_MS = 250;
// Budget de l'allégé LIGHT en plein pan : au-delà, on retombe sur l'aplat HARD.
// ~4-5 images à 60 fps — le pan hors marge n'arrive qu'aux franchissements de
// marge, pas à chaque frame, donc l'à-coup reste rare et court.
const ISO_LIGHT_BUDGET_MS = 70;

// ── SOL PLEIN EN TRANCHES (2026-07-27, relevé machine de jeu : la recuisson
// pleine au repos coûtait 110 ms d'un coup — pire frame du joueur une fois le
// gel de layout corrigé). À l'accalmie longue, le plein ne remplace plus le
// light en une frame : il l'écrase BANDE PAR BANDE sur N frames (~coût/N
// chacune). Même caméra, même clé, même géométrie → chaque bande recouvre
// exactement sa part du light, l'œil voit le détail « se poser » en un
// balayage d'une poignée de frames. Les bandes se recouvrent de 2 px vers le
// bas : la bande suivante repeint les lignes de bord où l'antialiasing du clip
// aurait mélangé light et plein (aucune couture). Abandon automatique si la
// caméra, le zoom ou la clé changent en cours de route (le light reste
// affiché, la tranche repart de zéro au prochain repos). La capture (__cityShot)
// garde sa recuisson immédiate — déterminisme du harnais.
// Molettes : __solSlices (nombre de bandes, 0 = désactivé → plein immédiat).
// Budget-cible par bande : le nombre de bandes s'AUTO-CALIBRE sur le coût réel
// de la dernière recuisson pleine (même philosophie que crispAffordable) —
// 110 ms mesurés → 3 bandes, une mégapole à 300 ms → 8.
const SOL_SLICE_BUDGET_MS = 40;
// Bornes de bande génériques : yOn (tranches horizontales — recuisson au repos,
// bande basse/haute du défilement) et xOn (bandes verticales du défilement).
const ISO_GROUND_SLICE = { on: false, yOn: true, y0: 0, y1: 0, padTop: 0, padBot: 0, xOn: false, x0: 0, x1: 0, padX: 0 };
// Cuit UNE bande du canvas de sol (bornes logiques xr/yr, null = tout l'axe)
// au niveau demandé (false = plein, 'light', true = hard) — partagé par les
// tranches du repos et les bandes exposées du défilement. Clip débordant de
// 2 px de chaque côté : la rangée frontière est repeinte à l'identique (même
// grille de rastérisation), l'antialiasing du bord de clip tombe sur des
// pixels identiques — pas de couture.
function bakeGroundStrip(level, xr, yr) {
  const gc = CM.groundCanvas, gctx = CM.gctx, dpr = CM.dpr || 1;
  const M = CM._bakeMargin || 0;
  const mainCtx = CM.ctx, cw0 = CM.cw, ch0 = CM.ch;
  CM.cw = cw0 + 2 * M; CM.ch = ch0 + 2 * M;
  CM.ctx = gctx;
  ISO_GROUND_LOD.on = level !== false;
  ISO_GROUND_LOD.light = level === 'light';
  const hh2 = CM.TILE * CM.cam.zoom * ISO_Y;
  const hw2 = CM.TILE * CM.cam.zoom * ISO_X;
  ISO_GROUND_SLICE.on = true;
  ISO_GROUND_SLICE.yOn = !!yr;
  ISO_GROUND_SLICE.xOn = !!xr;
  if (yr) {
    ISO_GROUND_SLICE.y0 = yr[0]; ISO_GROUND_SLICE.y1 = yr[1];
    ISO_GROUND_SLICE.padTop = hh2 * 5; ISO_GROUND_SLICE.padBot = hh2 * 2;
  }
  if (xr) {
    ISO_GROUND_SLICE.x0 = xr[0]; ISO_GROUND_SLICE.x1 = xr[1];
    ISO_GROUND_SLICE.padX = hw2 * 3;
  }
  gctx.save();
  gctx.setTransform(1, 0, 0, 1, 0, 0);
  gctx.beginPath();
  const rx0 = xr ? Math.floor((xr[0] - 2) * dpr) : 0;
  const rx1 = xr ? Math.ceil((xr[1] + 2) * dpr) : gc.width;
  const ry0 = yr ? Math.floor((yr[0] - 2) * dpr) : 0;
  const ry1 = yr ? Math.ceil((yr[1] + 2) * dpr) : gc.height;
  gctx.rect(rx0, ry0, rx1 - rx0, ry1 - ry0);
  gctx.clip();
  gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  try {
    drawIsoGround();
  } finally {
    gctx.restore();
    ISO_GROUND_SLICE.on = false; ISO_GROUND_SLICE.xOn = false; ISO_GROUND_SLICE.yOn = true;
    ISO_GROUND_LOD.on = false; ISO_GROUND_LOD.light = false;
    CM.ctx = mainCtx; CM.cw = cw0; CM.ch = ch0;
  }
}

// ── DÉFILEMENT INCRÉMENTAL AU PAN. Un franchissement de marge recuisait TOUT
// le canvas (49-84 ms sur la machine de jeu, en allégé qui plus est). Ici :
// auto-copie du canvas décalée d'un nombre ENTIER de pixels device (mode
// 'copy' : ce qui sort disparaît, ce qui entre devient transparent), ré-ancrage
// EXACT de la caméra du bake via screenDeltaToPan (l'inverse de la projection —
// aucune dérive, même après cent franchissements), puis recuisson des SEULES
// bandes exposées, au MÊME niveau de détail que le contenu existant. Le décalage
// entier préserve la grille de rastérisation : bandes et contenu défilé
// s'alignent au pixel près, par construction. Conséquence joueur : le pan reste
// à PLEINE qualité sur toutes les machines — plus de bascule light/aplat.
// Molette : __solScroll = false → l'ancienne recuisson complète.
// Pas de défilement fin : seuil de delta (px logiques) avant de faire glisser
// le canvas — assez grand pour amortir le coût fixe d'une bande, assez petit
// pour que la bande reste minuscule.
const SOL_SCROLL_STEP = 64;
function scrollGroundOnPan(bm, pd, helpers) {
  if (typeof window !== 'undefined' && window.__solScroll === false) return false;
  if (CM.capture) return false;
  const gc = CM.groundCanvas, gctx = CM.gctx, dpr = CM.dpr || 1;
  if (!gc || !gctx) return false;
  // Sécurité : le zoom doit être EXACTEMENT celui du bake (même grille).
  if (bm.zoomB != null && bm.zoomB !== CM.cam.zoom) return false;
  const sdx = Math.round(pd.x * dpr), sdy = Math.round(pd.y * dpr);
  // Fling géant : deux bandes quasi pleines coûteraient plus qu'une recuisson.
  if (Math.abs(sdx) > gc.width * 0.45 || Math.abs(sdy) > gc.height * 0.45) return false;
  // 1) Auto-défilement (blit sur soi, pixels entiers, net).
  gctx.save();
  gctx.setTransform(1, 0, 0, 1, 0, 0);
  gctx.imageSmoothingEnabled = false;
  gctx.globalCompositeOperation = 'copy';
  gctx.drawImage(gc, -sdx, -sdy);
  gctx.globalCompositeOperation = 'source-over';
  gctx.restore();
  // 2) Ré-ancrage exact : le monde équivalent du décalage entier copié.
  const dwp = screenDeltaToPan(sdx / dpr, sdy / dpr);
  bm.camX += dwp.x; bm.camY += dwp.y;
  // 3) Bandes exposées, au niveau du contenu en place (un lod reste un lod —
  //    les tranches du repos l'upgraderont, comme avant). ⚠ Dessinées sous la
  //    caméra de l'ANCRE, pas la caméra courante : le canvas vit sur la grille
  //    de son ancre (± un demi-pixel de la caméra réelle) — dessiner les bandes
  //    sous la caméra courante les décalait de ce résidu sous-pixel, et le
  //    mélange de phases miroitait pendant le drag (« frisson », retour Raph).
  const o = String(bm.other || '');
  const level = o.endsWith(':lodl') ? 'light' : o.endsWith(':lod') ? true : false;
  const W = gc.width / dpr, H = gc.height / dpr;
  const camRX = CM.cam.x, camRY = CM.cam.y;
  CM.cam.x = bm.camX; CM.cam.y = bm.camY;
  try {
    if (sdy !== 0) {
      const h = Math.abs(sdy) / dpr;
      bakeGroundStrip(level, null, sdy > 0 ? [H - h, H] : [0, h]);
    }
    if (sdx !== 0) {
      const w = Math.abs(sdx) / dpr;
      bakeGroundStrip(level, sdx > 0 ? [W - w, W] : [0, w], null);
    }
  } finally {
    CM.cam.x = camRX; CM.cam.y = camRY;
  }
  helpers.blitMargin(CM.groundCanvas, '_isoGroundBake');
  return true;
}

let _solSlice = null; // { key, i, n, camX, camY, zoom, ms }
function runGroundSliceStep(key, nowMs, helpers) {
  const M = CM._bakeMargin || 0;
  const N = Math.max(2, Math.min(8,
    (typeof window !== 'undefined' && window.__solSlices)
    || Math.ceil((CM._isoGroundBakeMs || 120) / SOL_SLICE_BUDGET_MS)));
  if (!_solSlice || _solSlice.key !== key || _solSlice.camX !== CM.cam.x
    || _solSlice.camY !== CM.cam.y || _solSlice.zoom !== CM.cam.zoom || _solSlice.n !== N) {
    _solSlice = { key, i: 0, n: N, camX: CM.cam.x, camY: CM.cam.y, zoom: CM.cam.zoom, ms: 0 };
  }
  const t0 = performance.now();
  const fullH = CM.ch + 2 * M;
  const y0 = fullH * _solSlice.i / N;
  const y1 = fullH * (_solSlice.i + 1) / N;
  // Toute la mécanique (gonflage, clip débordant anti-couture, culls) vit dans
  // bakeGroundStrip, partagée avec les bandes du défilement incrémental.
  bakeGroundStrip(false, null, [y0, y1]);
  _solSlice.ms += performance.now() - t0;
  _solSlice.i += 1;
  if (_solSlice.i >= _solSlice.n) {
    CM._isoGroundBake = { camX: _solSlice.camX, camY: _solSlice.camY, other: key };
    CM._isoGroundBake.zoomB = CM.cam.zoom;
    CM._isoGroundBakeMs = _solSlice.ms; // coût plein RÉEL (pilote crispAffordable)
    CM._isoSoftBakeAt = nowMs;
    _solSlice = null;
  }
  helpers.blitMargin(CM.groundCanvas, '_isoGroundBake');
}
// Budget d'une recuisson de sol EN PLEIN GESTE. Au-delà, on préfère le re-blit
// compensé (flou bref) : une image nette qui coûte un tiers de seconde n'est plus
// de la netteté, c'est un gel. 45 ms ≈ trois images à 60 fps — assez pour laisser
// le geste net sur les petites villes, assez bas pour ne jamais figer les grandes.
const ISO_CRISP_BUDGET_MS = 45;

// ── CACHE DU SOL PAR CRAN DE ZOOM ────────────────────────────────────────────
// Demande Raph 2026-07-28 : « le jeu oublie dès qu'on fait un zoom dézoom et
// doit recharger ». Chaque bake PLEIN est photographié, indexé par sa clé
// complète — qui contient le zoom : la molette retombant toujours sur les mêmes
// crans (×1,12 par cran, cf. CAM_FEEL.wheelStep), revenir à un zoom déjà visité
// redevient un HIT exact, sans re-échelle donc sans flou. Restaurer coûte UNE
// copie de canvas (~2-4 ms) au lieu de la remontée aplat → light → tranches →
// plein (~0,5-1 s ressentie). Pré-cuire le monde entier à toutes les échelles ne
// tiendrait pas en mémoire (l'empreinte du seul plancher de zoom se compte en
// dizaines de Mpx) ; ici : N bakes écran+marge (~9 Mo pièce), éviction LRU.
// Invalidation : la clé porte layout/saison/band/preview, et le snapshot purge
// les entrées du layout mort. La capture ignore le cache (déterminisme).
// A/B : globalThis.__groundZoomCache = false.
// Diagnostic : globalThis.__groundZoomCacheStats = { restores, snapshots } —
// lisible en prod (le harnais de mesure n'a pas accès aux hooks dev).
// 8 photos : le cran courant + le plancher + ~5 jalons intermédiaires de la
// pré-cuisson, avec une place de battement (~75 Mo au pire — palier Élevée).
const GROUND_ZOOM_CACHE_MAX = 8;
// `missBase` : un restore a échoué faute d'entrée de la MÊME BASE (la base a
// changé sous le cache — recompute de layout, saison…) ; `purges` : entrées de
// base morte retirées au snapshot. Ensemble ils disent si le cache MEURT plus
// vite qu'il ne sert — le doute que le banc à sim GELÉE ne peut pas lever.
const gzcStats = { restores: 0, snapshots: 0, missBase: 0, purges: 0, prebakes: 0 };
if (typeof globalThis !== 'undefined') globalThis.__groundZoomCacheStats = gzcStats;
// Identité de CONTENU du sol — ce que drawIsoGround consomme réellement.
// La clé du bake vivant porte `layoutRecomputeAt`, un TIMESTAMP : en sim
// VIVANTE il tourne toutes les ~10 s (croissance, automation) et tuait le
// cache alors que le sol n'avait pas bougé d'un pixel (mesuré : 3 purges et
// 1 missBase en 8 s d'idle — retour Raph « ça se recalcule encore en zoom
// dézoom », le banc à sim gelée ne pouvait pas le voir). Le CACHE indexe donc
// par les tailles des ensembles qui dessinent le sol + la graine du monde.
// Deux plans différents à comptes STRICTEMENT égaux partageraient une photo —
// tracés dérivés du seed et des comptes, cas théorique ; et le bake VIVANT se
// recuit de toute façon au recompute : une photo périmée ne survivrait que
// jusqu'au premier repos sur son cran, qui la re-photographie.
// Mémoïsée par RÉFÉRENCE de layout : un calcul par recompute, zéro par frame.
// ── PRÉ-CUISSON EN FOND (v2 du cache — demande Raph : « un chargement au
// début puis plus rien ») : au repos long, une fois l'écran servi, on cuit
// silencieusement les crans de zoom que le joueur ATTEINDRA — le plancher
// d'abord (le dézoom max est le geste réflexe), puis un jalon tous les DEUX
// crans jusqu'au zoom courant (l'approché à ± ½ cran comble les impairs).
// Chaque cran se cuit PAR TRANCHES de ~8 ms sur les frames de repos (même
// mécanique que le sol plein en tranches) vers un canvas tiers : jamais de
// gel, le 60 fps du repos est préservé. Cuire à un AUTRE zoom que l'écran =
// poser CM.cam.zoom le temps d'une tranche (restauré en finally) — la caméra
// ne bouge pas (restful exigé, pré-bake ANNULÉ si elle bouge en cours).
// La photo du plancher est ancrée à la caméra courante : le clamp du vrai
// dézoom recentrera peut-être ailleurs — le défilement incrémental recuira
// alors les seules bandes exposées, et le premier repos re-photographie.
// Diagnostic : __groundZoomCacheStats.prebakes.
let gzcPre = null;   // { base, z, canvas, pctx, i, n, W, H, camX, camY, z0 }
function gzcPrebakeStrip(canvas, pctx, z2, yr) {
  const dpr = CM.dpr || 1;
  const M = CM._bakeMargin || 0;
  const mainCtx = CM.ctx, cw0 = CM.cw, ch0 = CM.ch, z0 = CM.cam.zoom;
  CM.cw = cw0 + 2 * M; CM.ch = ch0 + 2 * M;
  CM.ctx = pctx;
  CM.cam.zoom = z2;
  const hh2 = CM.TILE * z2 * ISO_Y;
  ISO_GROUND_SLICE.on = true;
  ISO_GROUND_SLICE.yOn = true; ISO_GROUND_SLICE.xOn = false;
  ISO_GROUND_SLICE.y0 = yr[0]; ISO_GROUND_SLICE.y1 = yr[1];
  ISO_GROUND_SLICE.padTop = hh2 * 5; ISO_GROUND_SLICE.padBot = hh2 * 2;
  pctx.save();
  pctx.setTransform(1, 0, 0, 1, 0, 0);
  pctx.beginPath();
  const ry0 = Math.floor((yr[0] - 2) * dpr), ry1 = Math.ceil((yr[1] + 2) * dpr);
  pctx.rect(0, ry0, canvas.width, ry1 - ry0);
  pctx.clip();
  pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  try {
    drawIsoGround();
  } finally {
    pctx.restore();
    ISO_GROUND_SLICE.on = false; ISO_GROUND_SLICE.xOn = false; ISO_GROUND_SLICE.yOn = true;
    CM.cam.zoom = z0;
    CM.ctx = mainCtx; CM.cw = cw0; CM.ch = ch0;
  }
}

let gzcSigL = null, gzcSig = '';
function groundContentSig(L) {
  if (L === gzcSigL) return gzcSig;
  gzcSigL = L;
  const n = (x) => (x ? ((x.size != null ? x.size : x.length) | 0) : 0);
  gzcSig = (L.gridN | 0) + '.' + (L.mapSeed | 0)
    + '.' + n(L.roadSet) + '.' + n(L.urbanSet) + '.' + n(L.roadMap)
    + '.' + n(L.meadow) + '.' + n(L.wonderGround)
    + '.' + (L.river && L.river.present ? n(L.river.cells) : 0);
  return gzcSig;
}

// Point d'entrée : rend la frame iso. Renvoie false si layout absent (repli legacy).
// helpers = { bakeMargin, blitMargin } (les caches offscreen du runtime, déjà
// compatibles iso : le pan est projeté dans cityMapBakeMargin/BlitMargin).
// Le renderer JALONNE la frame (fp) mais n'en est pas propriétaire : le relevé
// est ouvert et clos par cityMapRuntime.frame(), qui englobe aussi le préambule.
// Cf. framePerf.js pour le pourquoi.
export function drawIsoWorld(dt, now, helpers) {
  const L = CM.layout;
  if (!L) return false;
  // ── CAMÉRA DE RENDU QUANTIFIÉE AU PIXEL DEVICE ────────────────────────────
  // La physique du geste vit sur une caméra CONTINUE, mais chaque couche
  // dessinée à des positions fractionnaires snappe à sa façon (le sol au blit,
  // chaque sprite à son drawImage) : les phases relatives dérivaient d'une
  // frame à l'autre — « l'image frissonne » au drag/dézoom (retour Raph, encore
  // présent après l'unification du sol seul). Remède canonique du pixel-art :
  // le RENDU entier se fait sous une caméra snappée pour que la projection
  // tombe sur la grille device — toutes les couches partagent LA même grille,
  // le monde avance par pas d'un pixel franc, aucune phase relative ne bouge.
  // (u,v) = axes écran de la projection iso ; l'inverse est exact.
  const camRX = CM.cam.x, camRY = CM.cam.y;
  {
    const z = CM.cam.zoom, dpr = CM.dpr || 1;
    const ku = ISO_X * z * dpr, kv = ISO_Y * z * dpr;
    const u = Math.round((camRX - camRY) * ku) / ku;
    const v = Math.round((camRX + camRY) * kv) / kv;
    CM.cam.x = (u + v) / 2;
    CM.cam.y = (v - u) / 2;
  }
  try {
    return drawIsoWorldInner(dt, now, helpers);
  } finally {
    CM.cam.x = camRX; CM.cam.y = camRY;
  }
}

function drawIsoWorldInner(dt, now, helpers) {
  const L = CM.layout;
  // Boîtes écran des habitations réellement dessinées, collectées par la passe
  // vivante (drawIsoLive) et consommées par le SURVOL : hit-test à la silhouette
  // puis liseré. Remise à zéro ICI, en tête de frame : c'est le seul point qui
  // garantit qu'aucune boîte d'une frame précédente (caméra bougée depuis) ne
  // survit. null en LOD, où l'on ne dessine plus de sprite individuel.
  CM._houseBoxes = CM.lodActive ? null : [];
  // Idem pour les MERVEILLES (publiées par drawWonder) : leur survol se faisait
  // sur un disque au sol, qui rate une merveille qui lève — l'Œil flotte.
  // Jamais null, même en LOD : une merveille reste dessinée sprite par sprite.
  CM._wonderBoxes = [];
  refreshSeasonPalette();
  // Sim : mêmes mises à jour que le pipeline legacy (les agents vivent).
  updateCitizens(dt);
  updateVehicles(dt);
  updateCrisis(dt, now);   // émeute : même sim que le legacy ; rendu via le peintre (drawIsoLive)
  fp('sim-agents');
  // Fond hors-monde (nature sombre) puis sol baké.
  const ctx = CM.ctx;
  ctx.fillStyle = rgb(SEASON_WILD, 0.9);
  ctx.fillRect(0, 0, CM.cw, CM.ch);
  if (CM.groundCanvas && helpers) {
    // Le masque du quai entre dans la clé (cf. ':qg') et la plage le consomme dans
    // le bake : il doit être résolu AVANT de composer la clé, pas au moment où le
    // fleuve se dessine, bien plus loin dans la frame.
    ensureQuayGate();
    // ':pv…' : l'aperçu __showWonder ajoute son parvis au sol → rebake à l'aller-retour.
    // La SAISON entre dans la clé : elle change l'herbe, les brins et les fleurs,
    // qui sont bakés. Elle ne bouge que par crans très espacés (cf. seasonMode),
    // donc elle ne peut pas déclencher de recuisson en rafale.
    // `keyBase` = la clé SANS le zoom : l'identité de CONTENU. Le cache de crans
    // s'en sert pour reconnaître « même monde, autre échelle » (restore approché).
    const keyPre = 'iso:' + CM.layoutRecomputeAt + ':';
    const keySuf = ':' + ((L.counts && L.counts.eraBand) | 0)
      + ':s' + (CM.season | 0)
      // ⚠ LA PLAGE EST DANS LE SOL BAKÉ (kind 'shingle') : sa géométrie dépend du
      // masque effectif du quai, donc de `quayGate.key` (layout + mode `full`) et
      // de la molette __beach. Sans ces crans, basculer `full` ou couper la plage
      // laissait les galets gelés dans le bake — le piège d'invalidation déjà
      // rencontré trois fois sur ce projet.
      + ':bch' + (BEACH.on ? BEACH.mat + BEACH.islandW + '_' + BEACH.bankR : 'off')
      + ':qg' + ((CM.quayGate && CM.quayGate.key) || '-')
      + (CM.previewWonder ? ':pv' + CM.previewWonder.id : '');
    const key = keyPre + CM.cam.zoom.toFixed(3) + keySuf;
    // Base du CACHE DE CRANS : identité de contenu (signature du sol), PAS le
    // timestamp de recompute — cf. groundContentSig pour le pourquoi.
    const cacheBase = 'isoC:' + groundContentSig(L) + keySuf;
    // RECUISSON COALESCÉE : recuire le sol coûte des centaines de ms sur une
    // mégapole — on ne le fait JAMAIS pendant un geste. Tant que la clé bouge
    // (zoom en cours) ou que le pan déborde la marge, on re-blitte le bake
    // EXISTANT compensé (échelle zoom/z_bake + delta de pan) : flou bref type
    // carte web, zéro gel. La recuisson (sol NET) arrive dès que la caméra est
    // immobile depuis ISO_SETTLE_MS (ou en capture, déterministe) — délai court
    // pour que le net revienne vite après un zoom/pan, sans recuire en plein geste.
    // `soft` = invalidation DOUCE (sprite décodé en retard) : contenu encore
    // valable → coalescée ici ; `null` reste l'invalidation DURE (canvas
    // effacé/recréé : rien à re-blitter) → recuisson immédiate.
    // ── CACHE DE CRANS : RESTAURATION, EXACTE OU APPROCHÉE ────────────────────
    // EXACTE (même clé, zoom compris) : on repose la photo dans le canvas de
    // travail et la cascade n'y voit qu'un bake valide (sameContent) — blit
    // direct, zéro recuisson. C'est l'atterrissage instantané d'un zoom déjà
    // visité.
    // APPROCHÉE : pendant le GESTE, le zoom GLISSE (cmCameraGlide) par des
    // valeurs intermédiaires qu'aucune clé exacte ne re-matchera jamais — la
    // première version du cache n'avait donc AUCUN hit en geste (mesuré :
    // 1 restore sur tout un aller-retour). On sert alors le cran caché le plus
    // PROCHE en échelle (≤ ½ cran de molette, soit ±5,8 %) comme SOURCE du
    // re-blit compensé : il reste un blit compensé (other garde la clé d'origine
    // de la photo, la cascade compense zoom/zoomB), mais depuis une image du bon
    // voisinage au lieu du bake de départ du geste — quasi net au lieu de flou
    // croissant. Un bake courant déjà plus proche (ou aussi proche) est gardé.
    if (!CM.capture && globalThis.__groundZoomCache !== false) {
      const cur = CM._isoGroundBake;
      if (!(cur && !cur.soft && cur.other === key)) {
        const gc = CM._groundZoomCache;
        if (gc && gc.size) {
          let best = null, bestD = Infinity;
          for (const e of gc.values()) {
            if (e.base !== cacheBase || !e.canvas) continue;
            if (e.canvas.width !== CM.groundCanvas.width || e.canvas.height !== CM.groundCanvas.height) continue;
            const d = Math.abs(Math.log(e.z / CM.cam.zoom));
            if (d < bestD) { bestD = d; best = e; }
          }
          if (!best) gzcStats.missBase += 1;
          // ½ cran de molette (cf. CAM_FEEL.wheelStep = 1,12).
          const HALF_STEP = Math.log(1.12) / 2;
          // Une photo est « exacte » au grain de la clé vivante (zoom à 3
          // décimales) : sous ±0,05 % l'écart d'échelle est sous le pixel.
          const exact = !!best && Math.abs(best.z - CM.cam.zoom) < CM.cam.zoom * 5e-4;
          // Distance d'échelle du bake courant — un lod/soft ne compte pas
          // (une photo PLEINE, même approchée, vaut mieux qu'un allégé exact).
          const curLod = !!cur && (!!cur.soft || !cur.other || cur.other.endsWith(':lod') || cur.other.endsWith(':lodl'));
          const curD = (cur && !curLod && cur.zoomB != null) ? Math.abs(Math.log(cur.zoomB / CM.cam.zoom)) : Infinity;
          // Déjà installé ? (exact : la clé vivante ; approché : le marqueur et
          // SON échelle) — sinon on recopierait la photo à chaque frame.
          const installed = !!cur && (exact
            ? cur.other === key
            : (cur.other === '__zoomcache__' && best && Math.abs((cur.zoomB || 0) - best.z) < 1e-9));
          if (best && bestD <= HALF_STEP && !installed && (exact || bestD < curD - 1e-9)) {
            gc.delete(best.key); gc.set(best.key, best);   // rafraîchit le rang LRU
            const g = CM.gctx;
            g.setTransform(1, 0, 0, 1, 0, 0);
            g.clearRect(0, 0, CM.groundCanvas.width, CM.groundCanvas.height);
            g.drawImage(best.canvas, 0, 0);
            g.setTransform(CM.dpr, 0, 0, CM.dpr, 0, 0);
            // EXACTE → la photo prend la clé VIVANTE COURANTE (pas celle de sa
            // naissance : le timestamp a pu tourner depuis) → sameContent →
            // blit direct. APPROCHÉE → marqueur jamais égal à une clé vivante :
            // la cascade choisit le re-blit compensé depuis cette photo.
            CM._isoGroundBake = exact
              ? { camX: best.camX, camY: best.camY, other: key, zoomB: CM.cam.zoom }
              : { camX: best.camX, camY: best.camY, other: '__zoomcache__', zoomB: best.z };
            gzcStats.restores += 1;
          }
        }
      }
    }
    const bm = CM._isoGroundBake;
    const M = CM._bakeMargin || 0;
    const pd = bm ? panDeltaToScreen(CM.cam.x - bm.camX, CM.cam.y - bm.camY) : null;
    const nowMs = performance.now();
    // ACCALMIE SUR LE MOUVEMENT RÉEL de la caméra — surtout PAS sur la clé : un
    // DRAG ne change pas la clé (zoom et layout fixes), donc une accalmie « clé
    // stable » se croyait au repos en plein geste et recuisait en boucle (retour
    // Raph : « ça rame au drag »).
    if (CM.cam.x !== CM._igX || CM.cam.y !== CM._igY || CM.cam.zoom !== CM._igZ) {
      CM._igX = CM.cam.x; CM._igY = CM.cam.y; CM._igZ = CM.cam.zoom; CM._igMoveAt = nowMs;
    }
    const stillMs = nowMs - (CM._igMoveAt || 0);
    const settled = CM.capture || stillMs > ISO_SETTLE_MS;
    // `restful` = accalmie LONGUE (cf. ISO_CRISP_SETTLE_MS) : elle seule autorise
    // le sol plein. `settled` ne donne plus que le sol allégé.
    const restful = CM.capture || stillMs > ISO_CRISP_SETTLE_MS;
    // Les suffixes ':lod' (allégé HARD) et ':lodl' (allégé LIGHT, textures et
    // voiles gardés) marquent un bake posé pendant un geste : même contenu de
    // base, détails en moins → à remplacer par un bake plein au repos.
    const baseOf = (k) => (k && k.endsWith(':lodl') ? k.slice(0, -5)
      : k && k.endsWith(':lod') ? k.slice(0, -4) : k);
    const sameContent = !!bm && !bm.soft && baseOf(bm.other) === key;
    const inMargin = !!bm && !!M && Math.abs(pd.x) <= M && Math.abs(pd.y) <= M;
    const isLod = !!bm && !!bm.other && (bm.other.endsWith(':lod') || bm.other.endsWith(':lodl'));
    // `level` : false = PLEIN, 'light' = allégé textures/voiles gardés, true =
    // allégé HARD (l'aplat historique, repli des machines lentes).
    const bake = (level) => {
      // Une invalidation douce ne change pas la clé : forcer le mismatch pour que
      // bakeMargin recuise vraiment (sinon le soft collerait pour toujours).
      if (bm && bm.soft) bm.other = '__soft__';
      ISO_GROUND_LOD.on = level !== false;
      ISO_GROUND_LOD.light = level === 'light';
      const t0 = performance.now();
      helpers.bakeMargin(CM.groundCanvas, CM.gctx, '_isoGroundBake',
        key + (level === 'light' ? ':lodl' : level ? ':lod' : ''), drawIsoGround);
      ISO_GROUND_LOD.on = false;
      ISO_GROUND_LOD.light = false;
      // Toute recuisson réelle ouvre la fenêtre de coalescence des softs : un
      // décodage qui arrive 50 ms après un bake frais attendra la fin de fenêtre.
      CM._isoSoftBakeAt = nowMs;
      if (CM._isoGroundBake !== bm) {
        CM._isoGroundBake.zoomB = CM.cam.zoom;  // ancre du stale-blit
        // Coûts RÉELS mesurés : le plein décide du « sol net en plein geste »
        // (crispAffordable), le light décide si le pan hors marge peut se payer
        // les textures (lightAffordable) — auto-calibrants tous les deux.
        const dt = performance.now() - t0;
        if (level === false) { CM._isoGroundBakeMs = dt; CM._isoGroundBakeMsZ = CM.cam.zoom; }
        else if (level === 'light') { CM._isoGroundLightMs = dt; CM._isoGroundLightMsZ = CM.cam.zoom; }
      }
      helpers.blitMargin(CM.groundCanvas, '_isoGroundBake');
    };
    // ── « Sol net pendant le geste » : désormais CONDITIONNÉ AU COÛT MESURÉ ────
    // Le palier « Élevée » recuisait le sol NET à chaque cran de zoom. Arbitrage
    // tenable quand une recuisson coûtait quelques dizaines de ms ; intenable
    // depuis que les villes ont grossi — mesuré sur une ville de 2 058 tuiles :
    // 140 ms à zoom 1, 640 ms à 0,5, **962 ms à 0,35**. Or la clé change à CHAQUE
    // frame d'un geste : on payait donc ~1 s par image, et le dézoom se figeait
    // (signalé par Raph : « le dézoom fait laguer à mort »).
    //
    // Le préréglage ne peut pas trancher seul : il est choisi d'après le nombre de
    // cœurs (16 cœurs → « Élevée » d'office), pas d'après la taille de la ville. On
    // mesure donc la dernière recuisson réelle et on n'insiste que si elle tient
    // dans le budget. Sinon on retombe sur le re-blit compensé — flou bref type
    // carte web, déjà implémenté plus bas — et le sol NET revient dès l'arrêt.
    // Auto-calibrant : la 1re recuisson chère est payée une fois, puis évitée.
    // Molette : window.__crispBudgetMs.
    const crispBudget = (typeof window !== 'undefined' && window.__crispBudgetMs) || ISO_CRISP_BUDGET_MS;
    // PRÉDICTIF, pas seulement rétrospectif (2026-07-28) : la dernière mesure
    // date souvent du zoom de JEU, où le bake est bon marché — au début de chaque
    // geste de DÉZOOM, le budget autorisait donc 2-3 recuissons pleines dont le
    // coût grimpe avec l'aire visible (gels « sol » de 25→68 ms relevés au
    // profil de geste) avant d'apprendre. Or ce coût est ∝ cellules visibles,
    // donc ∝ 1/zoom² : on extrapole la mesure au zoom courant et on coupe AVANT
    // de payer le premier gel. Au zoom de jeu l'estimation vaut la mesure
    // (rapport ≈ 1) : le sol net du palier Élevée y reste entier.
    const crispZ = CM._isoGroundBakeMsZ || CM.cam.zoom;
    const crispEstMs = (CM._isoGroundBakeMs || 0) * Math.max(1, (crispZ / CM.cam.zoom) ** 2);
    const crispAffordable = crispEstMs <= crispBudget;
    // Même prédiction pour le bake ALLÉGÉ : lui n'était budgeté que sur le pan
    // hors marge, alors qu'un GESTE DE MOLETTE réel l'atteint par une autre
    // porte — les crans s'espacent de plus d'ISO_SETTLE_MS (110 ms < cadence
    // humaine), donc chaque cran est « accalmie courte » → bake('light') SANS
    // garde-fou. Au dézoom d'une mégapole ce light coûte ~100 ms : un gel PAR
    // CRAN de molette (profil de geste 2026-07-28 : gels « sol » de 98-134 ms).
    // Sur-budget → aplat HARD transitoire (10-20 ms), textures au repos long —
    // le même arbitrage que le pan hors marge fait depuis toujours.
    const lightZ = CM._isoGroundLightMsZ || CM.cam.zoom;
    const lightEstMs = (CM._isoGroundLightMs || 0) * Math.max(1, (lightZ / CM.cam.zoom) ** 2);
    const lightBudget = (typeof window !== 'undefined' && window.__lightBudgetMs) || ISO_LIGHT_BUDGET_MS;
    if (CM.crispGesture && crispAffordable && !settled && bm && !sameContent) {
      // MAXIMALE : zoom/dézoom en cours → au lieu du re-blit LISSÉ (flou), on
      // recuit le sol NET à l'échelle exacte de la frame (la clé change à chaque
      // cran de zoom, donc on rebake de toute façon : on le fait proprement).
      // Zéro flou ; le geste peut être moins fluide sur très grande ville — c'est
      // l'arbitrage assumé de ce palier. Le pan pur (clé stable) garde son blit
      // translaté fluide via les branches ci-dessous.
      bake(false);
    } else if (sameContent && inMargin && !(restful && isLod)) {
      // `restful` et non `settled` : tant que le joueur enchaîne les crans, on
      // GARDE le bake allégé au lieu de le remplacer par un plein à chaque pause.
      // DÉFILEMENT FIN : sans attendre le franchissement de marge (delta accumulé
      // de 250+ px → bande de ~20 % du canvas → à-coup de 25-50 ms), le canvas
      // glisse dès SOL_SCROLL_STEP px de delta — bandes minuscules (~6 % du
      // canvas), coût lissé en ~5-10 ms tous les quelques frames de drag.
      if (!CM.capture && (Math.abs(pd.x) >= SOL_SCROLL_STEP || Math.abs(pd.y) >= SOL_SCROLL_STEP)
        && scrollGroundOnPan(bm, pd, helpers)) {
        // scrollGroundOnPan a ré-ancré et bliité.
      } else {
        helpers.blitMargin(CM.groundCanvas, '_isoGroundBake');   // rien à faire
      }
    } else if (settled
      // RAFALE DE DÉCODAGES (cascade au chargement) : quand la SEULE raison
      // d'arriver ici est une invalidation douce (clé inchangée, dans la marge),
      // le bake existant est encore valable — on le re-blitte tel quel et on
      // coalesce la recuisson (au plus une par ISO_SOFT_BAKE_MIN_MS, fenêtre
      // rouverte par toute recuisson réelle). La capture reste déterministe :
      // elle recuit toujours tout de suite.
      && (CM.capture || !(bm && bm.soft && baseOf(bm.other) === key && inMargin
           && nowMs - (CM._isoSoftBakeAt || 0) < ISO_SOFT_BAKE_MIN_MS))) {
      // Repos → sol plein, tous les détails.
      //
      // ⚠ TENTÉ PUIS REJETÉ (2026-07-24) : recuire en ALLÉGÉ sous un seuil de zoom,
      // au motif que touffes et franges y passent sous le pixel. Gain réel mesuré
      // −35 % à zoom 0,5 (1 015 → 662 ms) et −42 % à 0,4 (1 345 → 782). Mais la
      // comparaison À L'ŒIL est sans appel : le pavage perd sa texture et devient un
      // APLAT uniforme, marquages compris, et cela se voit dès 0,5 comme à 0,35.
      // On paierait une perte de matière visible pour une saccade qui resterait de
      // ~0,8 s. Le vrai correctif est d'accélérer la boucle par cellule (607 ms des
      // 1 018 à zoom 0,4), pas de retirer du dessin.
      //
      // Ce qui suit ne rouvre PAS ce débat : l'allégé n'est ici que TRANSITOIRE,
      // le temps que le joueur finisse d'enchaîner ses crans (≤ ISO_CRISP_SETTLE_MS),
      // exactement comme la branche de pan hors marge juste dessous. Le sol plein
      // revient dès l'arrêt réel — on ne perd pas de matière, on la retarde.
      // L'accalmie COURTE pose désormais le LIGHT (textures/voiles gardés) : le
      // « sol tout blanc » entre deux crans était le premier reproche visuel.
      if (!restful) {
        bake(lightEstMs <= lightBudget ? 'light' : true);
      } else if (bm && isLod && !CM.capture && baseOf(bm.other) === key && inMargin
        && (typeof window === 'undefined' || window.__solSlices !== 0)) {
        // Repos long avec un LIGHT de la même clé à l'écran : le plein arrive
        // EN TRANCHES (cf. runGroundSliceStep) au lieu d'un gel d'une frame.
        runGroundSliceStep(key, nowMs, helpers);
      } else {
        bake(false);
      }
    } else if (sameContent && !inMargin) {
      // PAN hors marge, même zoom : DÉFILEMENT INCRÉMENTAL — auto-copie du
      // canvas décalée au pixel entier + recuisson des seules bandes exposées,
      // au niveau de détail du contenu en place (pleine qualité conservée sur
      // toutes les machines). Repli sur l'ancienne recuisson complète allégée
      // (light si abordable, sinon aplat — molette __lightBudgetMs) pour les
      // flings géants, la capture ou un zoom intra-cran désaligné.
      if (!scrollGroundOnPan(bm, pd, helpers)) {
        bake(lightEstMs <= lightBudget ? 'light' : true);
      }
    } else if (bm && bm.zoomB != null) {
      // ZOOM en cours : re-blit du bake existant compensé (échelle zoom/z_bake +
      // delta de pan) — flou bref type carte web, zéro gel, net ~160 ms après.
      const s = CM.cam.zoom / bm.zoomB;
      const cx = CM.cw / 2, cy = CM.ch / 2;
      const prev = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = true;   // transitoire : lissé vieillit mieux que crénelé
      ctx.drawImage(CM.groundCanvas,
        cx - s * (cx + M) - pd.x, cy - s * (cy + M) - pd.y,
        (CM.cw + 2 * M) * s, (CM.ch + 2 * M) * s);
      ctx.imageSmoothingEnabled = prev;
    } else {
      // Rien à réutiliser (1er bake, canvas effacé) — light lui aussi sous budget.
      bake(restful ? false : (lightEstMs <= lightBudget ? 'light' : true));
    }
    // ── CACHE DE CRANS : SNAPSHOT ─────────────────────────────────────────────
    // Un bake PLEIN vient d'être posé (recuisson, tranches, ou déjà en place) :
    // on le photographie pour son cran. AU REPOS SEULEMENT (`settled`) : pendant
    // un geste au zoom de jeu, le crisp pose un plein par frame de GLIDE — des
    // zooms intermédiaires quelconques qui photographiés pourrissaient le LRU
    // (mesuré : 17 photos dont 14 de crans jamais revisitables). Re-photographie
    // seulement si l'ancre a dérivé de plus d'une demi-marge (les pans au même
    // zoom rafraîchissent la photo, les frames immobiles ne coûtent qu'une
    // comparaison).
    if (!CM.capture && settled && globalThis.__groundZoomCache !== false) {
      const b2 = CM._isoGroundBake;
      if (b2 && !b2.soft && b2.other === key) {
        const gc = CM._groundZoomCache || (CM._groundZoomCache = new Map());
        // La photo vit sous SA clé de cache (contenu + zoom), détachée du
        // timestamp de la clé vivante : elle survit aux recomputes muets.
        const cacheKey = cacheBase + '@' + CM.cam.zoom.toFixed(3);
        let e = gc.get(cacheKey);
        let moved = true;
        if (e) {
          const dse = panDeltaToScreen(b2.camX - e.camX, b2.camY - e.camY);
          moved = Math.abs(dse.x) > M / 2 || Math.abs(dse.y) > M / 2;
        }
        if (moved) {
          const W = CM.groundCanvas.width, H = CM.groundCanvas.height;
          if (e) gc.delete(cacheKey);
          else e = { canvas: null, camX: 0, camY: 0, zoomB: CM.cam.zoom, key: cacheKey, base: cacheBase, z: CM.cam.zoom };
          gc.set(cacheKey, e);
          if (!e.canvas || e.canvas.width !== W || e.canvas.height !== H) {
            if (typeof OffscreenCanvas !== 'undefined') e.canvas = new OffscreenCanvas(W, H);
            else { e.canvas = document.createElement('canvas'); e.canvas.width = W; e.canvas.height = H; }
          }
          const ec = e.canvas.getContext('2d');
          if (ec) {
            ec.setTransform(1, 0, 0, 1, 0, 0);
            ec.clearRect(0, 0, W, H);
            ec.drawImage(CM.groundCanvas, 0, 0);
            e.camX = b2.camX; e.camY = b2.camY;
            e.zoomB = (b2.zoomB != null) ? b2.zoomB : CM.cam.zoom;
            e.key = cacheKey; e.base = cacheBase; e.z = CM.cam.zoom;
            gzcStats.snapshots += 1;
            // Purge : les photos d'un AUTRE contenu de sol (signature ou saison
            // différentes) ne serviront plus — rendre la mémoire tout de suite.
            // Puis éviction LRU.
            for (const [k0, e0] of [...gc.entries()]) if (e0.base !== cacheBase) { gc.delete(k0); gzcStats.purges += 1; }
            while (gc.size > GROUND_ZOOM_CACHE_MAX) gc.delete(gc.keys().next().value);
          } else {
            gc.delete(cacheKey);   // contexte refusé : pas d'entrée fantôme
          }
        }
      }
    }
    // ── CACHE DE CRANS : PRÉ-CUISSON EN FOND ──────────────────────────────────
    // (cf. gzcPrebakeStrip) — une tranche par frame de repos LONG, écran déjà
    // servi en plein ; jamais pendant un aperçu de merveille (sol transitoire)
    // ni pendant les tranches écran (_solSlice) — un seul chantier à la fois.
    // HYSTÉRÉSIS DE CONTENU : en pleine croissance, la signature du sol change
    // réellement toutes les quelques secondes — sans garde-fou la pré-cuisson
    // tournait en tapis roulant (mesuré : 18 pré-cuissons, 14 purgées aussitôt
    // sur 20 s de sim vivante). On attend que le CONTENU soit stable ≥ 3 s.
    if (CM._gzcSigSeen !== cacheBase) { CM._gzcSigSeen = cacheBase; CM._gzcSigAt = nowMs; }
    if (!CM.capture && restful && !CM.previewWonder && _solSlice === null
      && nowMs - (CM._gzcSigAt || 0) > 3000
      && globalThis.__groundZoomCache !== false) {
      const bNow = CM._isoGroundBake;
      if (bNow && !bNow.soft && bNow.other === key) {
        // Annulé si le monde, l'écran ou la caméra ont bougé depuis l'amorce :
        // des tranches cuites sous deux caméras ne se raccordent pas.
        if (gzcPre && (gzcPre.base !== cacheBase || gzcPre.W !== CM.groundCanvas.width
          || gzcPre.H !== CM.groundCanvas.height || gzcPre.camX !== CM.cam.x
          || gzcPre.camY !== CM.cam.y || gzcPre.z0 !== CM.cam.zoom)) gzcPre = null;
        if (!gzcPre) {
          // Prochaine cible : le plancher, puis un jalon tous les DEUX crans
          // sous le zoom courant — la suite que la molette suivra réellement,
          // les crans impairs étant servis par le restore approché (± ½ cran).
          const targets = [0.35];
          for (let zt = CM.cam.zoom / (1.12 * 1.12); zt > 0.35 * 1.06; zt /= (1.12 * 1.12)) targets.push(zt);
          const gcm = CM._groundZoomCache;
          let pick = null;
          for (const t of targets) {
            let has = false;
            if (gcm) {
              for (const e of gcm.values()) {
                if (e.base === cacheBase && Math.abs(Math.log(e.z / t)) < Math.log(1.12) / 4) { has = true; break; }
              }
            }
            if (!has) { pick = t; break; }
          }
          if (pick != null) {
            const W = CM.groundCanvas.width, H = CM.groundCanvas.height;
            let cnv;
            if (typeof OffscreenCanvas !== 'undefined') cnv = new OffscreenCanvas(W, H);
            else { cnv = document.createElement('canvas'); cnv.width = W; cnv.height = H; }
            const pctx = cnv.getContext('2d');
            if (pctx) {
              // Tranches de ~8 ms : coût du cran extrapolé de la dernière
              // recuisson pleine mesurée (∝ 1/zoom², comme crispEstMs).
              const est = (CM._isoGroundBakeMs || 60)
                * Math.max(1, ((CM._isoGroundBakeMsZ || CM.cam.zoom) / pick) ** 2);
              gzcPre = {
                base: cacheBase, z: pick, canvas: cnv, pctx, i: 0,
                n: Math.max(3, Math.min(120, Math.ceil(est / 8))),
                W, H, camX: CM.cam.x, camY: CM.cam.y, z0: CM.cam.zoom,
              };
            }
          }
        }
        if (gzcPre) {
          const fullH = CM.ch + 2 * M;
          gzcPrebakeStrip(gzcPre.canvas, gzcPre.pctx, gzcPre.z,
            [fullH * gzcPre.i / gzcPre.n, fullH * (gzcPre.i + 1) / gzcPre.n]);
          gzcPre.i += 1;
          if (gzcPre.i >= gzcPre.n) {
            const gcm2 = CM._groundZoomCache || (CM._groundZoomCache = new Map());
            const kC = cacheBase + '@' + gzcPre.z.toFixed(3);
            gcm2.delete(kC);
            gcm2.set(kC, {
              canvas: gzcPre.canvas, camX: gzcPre.camX, camY: gzcPre.camY,
              zoomB: gzcPre.z, key: kC, base: cacheBase, z: gzcPre.z,
            });
            gzcStats.prebakes = (gzcStats.prebakes || 0) + 1;
            while (gcm2.size > GROUND_ZOOM_CACHE_MAX) gcm2.delete(gcm2.keys().next().value);
            gzcPre = null;
          }
        }
      }
    }
  } else {
    drawIsoGround();
  }
  fp('sol');
  // Fleuve LIVE (animé) par-dessus le sol baké → QUAIS par ère (promenade le
  // long du ruban, partagés avec le legacy : cityMapDrawQuays projette via le
  // module iso) → SOUS-STRUCTURE des ponts (ombre sur l'eau + piles) → bateaux
  // SUR l'eau (devant les piles quand ils sont au sud, sous le tablier sinon)
  // → tabliers de pont → scène vivante → drones (passe aérienne) → nuit.
  // Terre-plein : le gazon du bake porte le SOL ; le RELIEF vient de buissons
  // DEBOUT plantés dans la passe vivante (drawIsoLive) — la projection à plat
  // de l'art legacy « couchait » les plantes bakées (retour Raph).
  drawIsoRiver(now);
  // Vie de SURFACE (iso/isoRiverLife.js) : ronds de pluie, feuilles à la dérive,
  // bouées et nasses, saut de poisson. Ici et pas plus tard : sur l'eau, sous
  // les coques — la pluie crible le fleuve, pas les bateaux.
  drawIsoRiverLife(now);
  fp('fleuve');
  // QUAIS BAKÉS. Recensé en direct : ~10 000 lineTo, 1 000 traits et 390 arcs par
  // frame — 90 % de tout le travail de chemins de la carte, pour une promenade
  // qui ne bouge jamais. Même traitement que le sol, qui coûtait ~7 ms/frame avant
  // d'être baké et en coûte 0,1 depuis.
  //
  // La clé porte TOUT ce qui change le tracé. La nuit y est QUANTIFIÉE au dixième :
  // le point de lampe bascule de couleur à 0,25 et `cmDayNightF` est une fonction
  // à plateaux, donc cela ne coûte que quelques recuissons par cycle jour/nuit.
  // Les lueurs (additives) restent EN DIRECT, cf. le mode dans cityMapDrawQuays.
  // A/B : globalThis.__quayBake = false rejoue le tracé en direct (référence).
  if (CM.quayCanvas && helpers && globalThis.__quayBake !== false) {
    const qk = 'q:' + CM.layoutRecomputeAt + ':' + CM.cam.zoom.toFixed(3)
      + ':b' + ((L.counts && L.counts.eraBand) | 0)
      + ':n' + (CM.nightF || 0).toFixed(1)
      + ':l' + (CM.lodActive ? 1 : 0)
      + ':w' + ((state.timeWear || 0) > 0.7 ? 1 : 0)
      + ':c' + (CM.collapseAt ? 1 : 0)
      // ⚠ LE CORPS D'EAU FAIT PARTIE DU TRACÉ DEPUIS 2026-07-30 : le bas-fond au
      // pied du mur prend la teinte du coloris courant (CM.waterShore.quay). Sans
      // cette clé, le quai garde le bas-fond du coloris PRÉCÉDENT jusqu'à ce qu'un
      // autre facteur invalide le bake — c'est-à-dire, en pratique, très longtemps.
      // Le fondu du fleuve, lui, n'entre PAS dans la clé : il recuirait le quai à
      // chaque frame de la transition. Le bas-fond bascule donc d'un coup, sur un
      // trait de 1 à 5 px, pendant que la nappe fond — invisible à l'usage.
      + ':e' + (CM.waterShore ? (CM.waterShore.quay[0] + CM.waterShore.quay[1]) : '-')
      // La molette __quayWall change le tracé à chaud → elle doit casser la clé.
      + ':t' + (quayWallTune.on ? 1 : 0) + (quayWallTune.full ? 1 : 0)
      + (quayWallTune.joints ? 1 : 0) + quayWallTune.heightK + '_' + quayWallTune.light;
    helpers.bakeMargin(CM.quayCanvas, CM.qctx, '_quayBake', qk, () => cityMapDrawQuays(now, 'base'));
    helpers.blitMargin(CM.quayCanvas, '_quayBake');
    cityMapDrawQuays(now, 'glow');
  } else {
    cityMapDrawQuays(now);
  }
  fp('quais');
  drawIsoBridgeUnder(now);
  fp('ponts-dessous');
  drawIsoShips(now);
  fp('bateaux');
  drawIsoBridges(now);
  fp('ponts');
  drawIsoLive(now);      // (les merveilles y sont des items du tri peintre)
  fp('scene-vivante');
  drawIsoBirds(now);     // nuée : passe aérienne, avant les drones
  drawIsoDrones(now);
  fp('ciel');
  drawIsoNight(now);
  drawIsoBridgeNight(now);   // lanternes de pont : halos + reflets dans l'eau, par-dessus le voile
  drawPlaisirsSky(now);      // faisceaux + lanternes volantes : du CIEL, donc après tout le reste
  drawIsoShipNight(now);     // feux de position rouge/vert — même raison : le voile les mangeait
  fp('nuit');
  drawIsoRain(now);      // averse — après la nuit : la pluie passe DEVANT les halos
  drawIsoAmbient(now);   // feuilles / lucioles / motes — par-dessus le voile de nuit
  fp('meteo-ambiance');
  // Bulles de pensée (cartouches pixel cliquables) : tout en haut, comme le
  // legacy — la fonction est PARTAGÉE (projection worldToScreen dans agents.js).
  if (!CM.lodActive) drawCitizenThoughts(now);
  fp('bulles');
  return true;
}
