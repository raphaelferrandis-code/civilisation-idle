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
import { seasonGrass, seasonWild, seasonTip, seasonFlowerMul, seasonCanopyTint, WINTER } from '../seasonMode.js';
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
import { paintFlameGlows } from '../flameGlow.js';
// Outil de calibrage des feux de position : n'expose que window.__navCalib et
// ne fait rien tant qu'on ne l'appelle pas (aucun coût en jeu). Il ne nous
// importe RIEN en retour (cycle ES = zone morte) : on lui pousse sa config.
// Vie de surface de l'eau. Même contrat que navCalib : il ne nous importe rien
// en retour (cycle ES = zone morte), on lui pousse ce dont il a besoin.
import { drawIsoRiverLife } from './isoRiverLife.js';
import {
  LIGHT_LAYER, beginLightLayer, endLightLayer,
  lightCtx, lightCut, lightCutImage, paintLightLayer,
} from '../lightLayer.js';
import { cityMapDrawQuays, updateCrisis, ensureQuayGate, quayWallTune } from '../quaysAndRiot.js';
import { drawPixelBridges } from '../pixelBridge.js';
import { drawCritterIso } from '../critters.js';
import { drawIsoBridgeUnder, drawIsoBridgeNight, pushIsoBridgeItems, drawIsoBridgeSeg, bridgeBlocks, isoBridge3dFlag } from './isoBridge.js';
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
import { WONDER_GROUND, wonderGroundSet } from './isoWonderGround.js';
import { GL_RUN_MIN, WILD_THIN_UNIT, isoWildForest } from './isoWildForest.js';
import { _frac, _rnd } from './isoMath.js';
// Socle partagé, extrait le 2026-08-23 : les chemins du repère monde et le cache
// d'art. Deux feuilles du graphe — elles débloquent le pont, le champ et le port.
import { diamondPath, fillWorldQuad, pathWorldQuad } from './isoQuad.js';
import { isoArt } from './isoArt.js';
// Le tissu urbain (bâti / cour / friche), extrait le 2026-08-23. C'est un MODÈLE :
// tissuMetrics le lit aussi, et n'a plus à traverser le peintre pour ça.
import { builtCells, builtNear, COUR, DIRT_TONE, courOf } from './isoTissu.js';
// Les clôtures et leur bande de panneaux, extraites le 2026-08-23.
import { fenceStrip, isoFencesFor } from './isoFence.js';
// La voirie (tons, largeurs, tuiles, voile d'ère, trottoir), extraite le 2026-08-23.
// Que de la config : une feuille du graphe, que tout le monde peut lire.
import {
  roadTone, ROAD_BAND, ISO_ROAD_HALFW, isoRoadHalfW,
  ROAD_MATS, ROAD_DETAIL, ROAD_VEIL, roadVeilFor, SIDEWALK_ISO,
} from './isoRoad.js';
// Le port fluvial (flotte legacy sur le ruban, quai, ponton), extrait le 2026-08-23.
import { drawIsoShips, portMooring, drawIsoPortBoat, drawIsoRiverside } from './isoPort.js';
// Matière du sol : tuiles PixelLab et grève, extraites le 2026-08-23. Le peintre
// (blitIsoTileKey, le sol, le trottoir) est resté ici ; seul le CATALOGUE est parti.
import { ISO_TILE_KEYS, isoWinterTile, beachTone, isoVariantKey, isoTileCache, isoTileBBox, groundTileTune, isoFaceVeiled, ensureIsoTileKey, plazaEraTileKey, BEACH } from './isoGroundTiles.js';
// Palette plate du sol, extraite le 2026-08-23. Feuille du graphe : elle n'importe
// rien, donc tout peut la lire. ⚠ L'état de SAISON est resté ici (plus bas) — il est
// réassigné chaque frame, et une liaison importée est en lecture seule.
import { GRASS, GRASS_WILD, PLAZA, PLAZA_ERA_TONE, rgb, HOVER_GOLD } from './isoPalette.js';
// La météo qui tombe (pluie, éclats, neige), extraite le 2026-08-23. Elle emporte
// les teintes de flocon, qui traînaient dans la section « liseré d'herbe ».
import { drawIsoRain } from './isoWeather.js';
// Le fleuve, extrait le 2026-08-23 : le ruban d'eau vivant et tout ce qui bat sa
// berge. Trois symboles suffisent au peintre — il peint, et il sait découper sur
// l'eau.
import { WATER_FILL, riverRibbonPath, drawIsoRiver } from './isoRiver.js';
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
  isoPlazaBox, isoPlazaBoxes, plazaEraForBand, isoPlazaItems, isoPlazaLamps,
  isoPlazaKitOn, isoPlazaSceneOn, isoPlazaSceneCoversGround,
  drawIsoPlazaProp, drawIsoPlazaGrid,
  // personHT : les POINTS D'EAU se cotent au même étalon que le mobilier de
  // place — la hauteur d'un habitant. Cf. § POINTS D'EAU.
  personHT,
} from './isoPlaza.js';
// MOBILIER DE TROTTOIR : la POSE vit là-bas (corps pur, testable), le dessin
// reste celui du kit des places. Cf. § MOBILIER DE TROTTOIR plus bas.
import { STREET_PROPS, computeStreetProps } from './isoStreetProps.js';

// PALETTE DE SAISON, résolue une fois par frame depuis CM.season. Ces variables
// remplacent GRASS / GRASS_WILD / GD_TIP partout où le SOL est peint : le sol
// étant baké, elles ne sont relues qu'à la recuisson, et la saison figure dans
// la clé du bake. Les constantes ci-dessus restent la référence d'été.
let SEASON_GRASS = GRASS, SEASON_WILD = GRASS_WILD, SEASON_TIP = null, SEASON_FLOWER_MUL = 1;
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
// Blit une tuile de sol sur la cellule dont le coin NORD projeté est (nx, ny).
// ⚠ FACE SEULE, MASQUÉE AU LOSANGE (e.face, cf. isoTileFace) : l'épaisseur du
// « thin tile » ne se contente pas de déborder sous la pointe sud, ses faces
// latérales pendent sous les arêtes SO/SE, donc DANS le rectangle 2:1 — le seul
// recadrage rectangulaire (1er correctif) laissait un liseré clair + un liseré
// sombre sur chaque cellule = quadrillage sur tout le sol.
// Un sol plat doit être une SURFACE continue, pas un empilement de dalles.
// Repli (pixels illisibles) : recadrage rectangulaire historique depuis e.img.
// Renvoie false si pas prête (l'appelant garde l'aplat).
function blitIsoTileKey(ctx, key, nx, ny, hw, mirror = false, h = 0, veil = null) {
  // HIVER : bascule vers la tuile enneigée si elle existe ET est décodée —
  // sinon on garde l'été pour cette recuisson (le décodage la rappellera).
  // (La GRÈVE n'en a pas, sauf `__beach.snow` — cf. ISO_TILE_WINTER_BEACH.)
  const wKey = CM.season === WINTER ? isoWinterTile(key) : null;
  if (wKey) {
    const we = ensureIsoTileKey(isoVariantKey(wKey, h));
    if (we && we.ready) key = wKey;
  }
  const e = ensureIsoTileKey(isoVariantKey(key, h));
  if (!e || !e.ready) return false;
  const bb = e.bbox;
  const faceH = Math.max(1, Math.round(bb.w / 2));   // face iso 2:1 du contenu
  const k = (hw * 2) / bb.w;
  // DÉBORD EN PERSPECTIVE (e.over, herbe) : les `ov` lignes au-dessus du losange
  // sont blittées AU-DESSUS du coin nord (dy remonte d'autant) — le bake balaie
  // nord→sud, elles recouvrent donc le voisin du nord, sol urbain compris :
  // « au sud du sol, l'herbe passe devant ». Borné par bb.h : une variante sans
  // brins hauts ne doit pas étirer son losange.
  const ov = (!e.face && e.over) ? Math.max(0, Math.min(e.over, bb.h - faceH)) : 0;
  const srcH = faceH + ov;
  // S7 — LE BLIT 1:1, QUAND LA GRILLE LE PERMET (docs/PLAN-RENDU-VILLE.md).
  //
  // Le `+1 px` historique est un anti-couture : à zoom fractionnaire le pas de
  // grille (hw en x, hh = hw/2 en y) ne tombe pas sur l'entier, deux losanges
  // voisins chacun arrondi laissent un liseré transparent, et on le recouvre en
  // débordant d'un pixel sur le voisin. Le prix était lourd et invisible : la
  // destination faisait 65×33 pour une source de 64×32 à z = 1, donc le nearest
  // DUPLIQUAIT une colonne et une rangée d'art sur CHAQUE cellule du sol. Tout le
  // reste du fichier promet un blit « pixel pour pixel » (cf. § tuiles natives) ;
  // ici il ne l'était nulle part.
  //
  // Depuis S11 le zoom est quantifié au 1/8, donc hw = 32z et hh = 16z sont
  // ENTIERS et les losanges se joignent exactement : plus de couture à couvrir.
  // On ne s'y fie pas pour autant — la molette `__zoomQuant(0)` rend le zoom
  // continu, et cam.zoom traverse des valeurs fractionnaires PENDANT le
  // glissement (une recuisson nette peut y tomber si le budget de geste
  // l'autorise). Le test porte donc sur la GÉOMÉTRIE COURANTE, pas sur un
  // réglage : `hw` entier et pair ⟺ hw et hh entiers ⟺ grille exacte. Le +1
  // revient tout seul dès qu'elle ne l'est plus.
  // ⚠ Le test porte sur les DEUX dimensions réellement demandées, pas seulement
  // sur hw : une tuile d'herbe à débord (`ov`) a srcH = faceH + ov, et sa hauteur
  // de destination reste fractionnaire à bas zoom même quand la grille est exacte
  // (hw = 4, ov = 3 → dh = 4,375). Elle retombe alors sur le +1, ce qui est le bon
  // choix : à k < 1 on sous-échantillonne de toute façon.
  const dwx = bb.w * k, dhx = srcH * k;
  const whole = (v) => Math.abs(v - Math.round(v)) < 1e-9;
  // `groundTileTune.exact = false` (molette `__groundTile({exact:false})`) rejoue le
  // +1 inconditionnel : c'est l'A/B du lot, et le seul moyen de revoir en une
  // seconde le pixel dupliqué que ce chemin supprime.
  const exact = groundTileTune.exact
    && Number.isInteger(hw) && hw % 2 === 0 && whole(dwx) && whole(dhx);
  const dw = exact ? Math.round(dwx) : Math.ceil(dwx) + 1;
  const dh = exact ? Math.round(dhx) : Math.ceil(dhx) + 1;
  const dy = Math.round(ny - ov * k);
  // Source : la face masquée (répétée rep×rep, cf. groundTileTune) si elle a pu
  // être construite, sinon la tuile brute. La face répétée fait la MÊME taille
  // que la simple (bb.w × faceH) — le blit ci-dessous ne change pas d'un iota.
  const face = isoFaceVeiled(e, veil);
  const src = face || e.img;
  const sx = face ? 0 : bb.x0, sy = face ? 0 : bb.y0;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  if (mirror) {
    // Miroir horizontal 1 cellule sur ~2 (hash) : casse la répétition du motif
    // sans 2e asset — légitime pour une FACE de sol (pas d'ombrage directionnel fort).
    ctx.save();
    ctx.translate(Math.round(nx - hw) + dw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(src, sx, sy, bb.w, srcH, 0, 0, dw, dh);
    ctx.restore();
  } else {
    ctx.drawImage(src, sx, sy, bb.w, srcH, Math.round(nx - hw), dy, dw, dh);
  }
  ctx.imageSmoothingEnabled = prev;
  return true;
}

// ── SOL (baké : ~10-30 ms une fois par zoom/marge, blitté ensuite) ────────────
// Les cellules-route ne remplissent PLUS tout leur losange (1er jet : rue aussi
// large qu'un îlot → grille illisible). Comme en legacy : fond de TROTTOIR (ton
// urbain) + RUBAN de chaussée plus étroit le long des connexions (masque E/O/S/N).
// ── Détail d'herbe : tapis VIVANT (touffes de brins + speckle + fleurs éparses)
// posé DANS le bake du sol, par-dessus la tuile d'herbe (design réfs pixel-art
// validé par Raph 2026-07-12 : brins en V + pâquerettes ; réfs = DESIGN, pas
// couleur). Dispersion en ESPACE-MONDE (hash par cellule UNIQUE → aucune
// répétition de grille) et STRICTEMENT dans notre palette : verts + 2 accents
// clairs RARES (fleurs blanc cassé / cœur jaune). Densité « moyenne ». Réglable
// live : __grassDetail(false) éteint, __grassDetail(1.6) densifie, __grassDetail()
// lit l'état. N'affecte QUE l'herbe (kind==='grass') — sol urbain/champs/place intacts.
// tileAlpha : opacité de la tuile d'herbe PixelLab. La tuile brute est un carpet
// feuillu DENSE (loin des réfs « base verte propre + motifs épars ») → on la
// blende faiblement sur l'aplat GRASS pour une base CALME, et ce sont nos
// touffes/fleurs qui portent le design. mult : densité globale des motifs.
// DA Raph 2026-07-12 (itérée) : base verte UNIE (tileAlpha 0 → pas de tuile qui
// « tile », + aplat herbe forcé v=1 → pas de maillage par cellule) sur laquelle on
// pose des FLEURS assez présentes + des TOUFFES de brins MODÉRÉES (revenues à la
// demande, mais dosées pour ne PAS re-carpetter : « trop de pixels » = l'écueil).
// speckle & wildShade (plaques de prairie) restent des knobs, à 0 par défaut.
// meadow : PRÉS — plaques lentes de nuance par bruit LISSÉ (smoothNoise, aucune
// couture de cellule ni de bloc, contrairement à la variance par cellule qui
// dessinait un maillage) ; foncé = herbe grasse, clair = herbe sèche. Dosé bas.
// tileAlpha 0 → 1 (Raph 2026-07-28) : la tuile d'herbe regénérée (4 variantes
// brutes, patchwork voulu) est DESSINÉE — l'ancien 0 datait de la tuile unique
// qui tapissait ; « branche ce que j'ai mis en image ».
// clumpScale (Raph 2026-07-28 : « les grosses touffes dénotent trop ») : les
// touffes Cainos passaient à l'échelle pleine du pixel d'art (~une demi-cellule
// à côté de brins de 2 px) — réduites, pas supprimées ; 0 touffe = clumpP: 0.
const GRASS_DETAIL = { on: true, tileAlpha: 1, flowerP: 0.22, tuftP: 0.45, speckleP: 0, wildShade: 0, meadow: 0.16, clumpP: 0.09, clumpScale: 0.55 };
// Sous-couche des tuiles d'herbe À CREUX (noFill, cf. fetchGroundTiles) : les
// trous entre brins doivent lire comme l'OMBRE sous l'herbe, pas comme le fond
// olive du bake (plus clair que les brins → relief inversé, points clairs).
// = ton moyen mesuré du lot (l'aperçu validé par Raph posait exactement ça).
// La version HIVER suit la tuile enneigée (ton mesuré par fetchGroundTiles).
// ⛔ IL Y AVAIT ICI DEUX MESURES DE DISTANCE AU BORD DE L'ÎLE, en tuiles, pour
// décider CELLULE PAR CELLULE si elle appartenait au rivage. Les deux sont
// retirées avec l'approche : le contour d'île est désormais TRACÉ le long de son
// ellipse (drawIsoIslandShore). Elles étaient justes — la seconde fermait
// effectivement l'anneau, et un test le prouvait — mais aucune règle par cellule
// ne peut donner une largeur RÉGULIÈRE sur un objet de 4,8 tuiles de large, et
// c'était la demande. Leurs tests partent avec elles : garder des gardes sur du
// code que plus rien n'appelle, c'est de la décoration.
const GRASS_TILE_UNDER = [42, 85, 39];
const GRASS_TILE_UNDER_WINTER = [126, 143, 137];   // ton mesuré du lot hiver (fetchGroundTiles)
const GD_BLADE = [66, 100, 46];      // brin foncé
const GD_TIP = [156, 180, 96];       // pointe claire du brin (référence = été)
// Décor de sol découpé du pack Cainos (scripts/sliceCainosPlants.mjs), rabattu
// sur la rampe foliage. Les CAILLOUX du même pack ont été dispersés ici puis
// RETIRÉS (Raph, 2026-07-22) — d'abord les pierres plates (« en tuile » dans
// l'herbe), puis les blocs ronds. Ne pas re-proposer de semer des pierres.
const GD_TUFTS = 15;                 // deco/tuft-1..15

// Résout la palette de saison. Appelée en tête de frame : trois lectures de
// table, aucun calcul de couleur — l'interpolation libre est explicitement
// exclue (cf. seasonMode.js), il n'y a donc rien à mélanger.
// Feuillage teinté par saison, cuit à la demande et gardé en cache par
// (sprite, saison). Renvoie null en été (sprite d'origine, coût nul) ou tant
// que l'image n'est pas décodée.
//
// ⚠ L'HIVER NE PASSE PLUS PAR LA TEINTE. Elle vaut rgba(178,186,190,0.34) en
// multiply, soit 10 % de valeur en moins : un feuillu lime restait un feuillu
// lime, posé sur un sol enneigé (Raph, 2026-07-31 : « il faut faire les arbres
// enneigés »). La neige est maintenant CUITE dans un sprite `-winter` dérivé du
// sprite d'été (scripts/snowTrees.mjs) — même doctrine que le sol d'hiver, et
// même repli : tant que le PNG n'est pas décodé (ou absent, cf. le .exe hors
// ligne), on retombe sur la teinte, jamais sur du vide.
const _seasonTrees = new Map();
function seasonTree(art, name) {
  const s = CM.season | 0;
  if (s === WINTER) {
    const wa = isoArt(name + '-winter');
    if (wa.ready && wa.img) return wa.img;
  }
  const tint = seasonCanopyTint(s);
  if (!tint || !art.ready || !art.img) return null;
  const key = name + ':' + s;
  const hit = _seasonTrees.get(key);
  if (hit) return hit;
  const w = art.img.naturalWidth || art.img.width;
  const h = art.img.naturalHeight || art.img.height;
  if (!w || !h) return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(art.img, 0, 0);
  // multiply teinte le feuillage sans toucher aux valeurs ; source-atop garde
  // la silhouette (sans lui, le rectangle entier serait peint).
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = tint;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(art.img, 0, 0);
  _seasonTrees.set(key, c);
  return c;
}

function refreshSeasonPalette() {
  const s = CM.season | 0;
  SEASON_GRASS = seasonGrass(s);
  SEASON_WILD = seasonWild(s);
  SEASON_TIP = seasonTip(s);
  SEASON_FLOWER_MUL = seasonFlowerMul(s);
}
const GD_SPECK_L = [138, 164, 96];   // speckle vert clair
const GD_SPECK_Y = [198, 208, 126];  // speckle jaune pâle
// Palette de fleurs [pétale, cœur] : pâquerette blanche dominante + accents jaune
// (bouton d'or), rose, rouge/coquelicot, violet, bleuet. Poids par RÉPÉTITION
// (blanc/jaune plus fréquents que les vives) → un pré fleuri, pas des confettis.
const GD_FLOWERS = [
  [[240, 242, 228], [234, 206, 96]],   // blanc (pâquerette)
  [[240, 242, 228], [234, 206, 96]],
  [[240, 242, 228], [234, 206, 96]],
  [[244, 216, 102], [220, 168, 60]],   // jaune (bouton d'or)
  [[244, 216, 102], [220, 168, 60]],
  [[236, 152, 178], [234, 206, 96]],   // rose
  [[224, 104, 96], [234, 206, 96]],    // rouge (coquelicot)
  [[184, 148, 216], [234, 206, 96]],   // violet
  [[150, 176, 226], [234, 206, 96]],   // bleuet
];
// ⚠ NE PAS « batcher » ces rects par couleur : essayé et MESURÉ le 2026-07-17 →
// aucun gain (154 ms vs 158 ms sur ~30 000 rects). fillRect est un chemin rapide
// de Skia (aucun path construit) — contrairement aux diamondPath des voiles, que
// le remisage par palier fait gagner pour de bon (194 → 102 ms). Le vrai coût
// résiduel ici est la CHAÎNE de style reconstruite par rect, pas l'appel de dessin.
function drawGrassDetail(ctx, gx, gy, px, py, hw, hh) {
  const pu = Math.max(1, Math.round(hw * 0.055));    // « pixel » d'art (suit le zoom)
  // Sous-point (fx,fy)∈cellule → écran depuis le coin nord (projection linéaire :
  // Δx world → (hw,hh), Δy world → (−hw,hh)).
  const rect = (sx, sy, w, h, col, a) => {
    ctx.fillStyle = a < 1 ? `rgba(${col[0]},${col[1]},${col[2]},${a})` : `rgb(${col[0]},${col[1]},${col[2]})`;
    ctx.fillRect(sx, sy, w, h);
  };
  const h1 = cmHash('gd:' + gx + ':' + gy);
  const h2 = cmHash('gd2:' + gx + ':' + gy);
  // Speckle (knob speckleP, défaut 0) : 1 point clair/jaune pâle.
  if (GRASS_DETAIL.speckleP > 0 && (h1 & 255) / 255 < GRASS_DETAIL.speckleP) {
    const fx = 0.2 + ((h1 >> 8) & 63) / 63 * 0.6;
    const fy = 0.2 + ((h1 >> 14) & 63) / 63 * 0.6;
    const sx = Math.round(px + (fx - fy) * hw), sy = Math.round(py + (fx + fy) * hh);
    rect(sx, sy, pu, pu, (h1 & 1) ? GD_SPECK_Y : GD_SPECK_L, 0.5);
  }
  // Touffe de brins (knob tuftP, défaut 0) : 2-3 brins verticaux, corps foncé + pointe.
  if (GRASS_DETAIL.tuftP > 0 && (h2 & 255) / 255 < GRASS_DETAIL.tuftP) {
    const fx = 0.28 + ((h2 >> 8) & 31) / 31 * 0.44;
    const fy = 0.30 + ((h2 >> 13) & 31) / 31 * 0.42;
    const bx = Math.round(px + (fx - fy) * hw), by = Math.round(py + (fx + fy) * hh);
    const nB = 2 + ((h2 >> 18) & 1);                 // 2 ou 3 brins
    const bh = Math.max(2 * pu, Math.round(hw * 0.13));
    for (let i = 0; i < nB; i += 1) {
      const bxi = bx + Math.round((i - (nB - 1) / 2) * (pu + 1));
      const jh = bh - ((h2 >> (i * 3)) & 1) * pu;    // hauteur légèrement variée
      rect(bxi, by - jh, pu, jh, GD_BLADE, 1);       // corps du brin
      rect(bxi, by - jh, pu, pu, SEASON_TIP || GD_TIP, 1);   // pointe claire
    }
  }
  // Fleur ÉPARSE (flowerP, le SEUL motif par défaut) : pâquerette = 4 pétales blanc
  // cassé + cœur jaune. « De temps en temps » sur un fond uni.
  // La saison module la densité : rien ne fleurit en hiver, le printemps déborde.
  if ((cmHash('gf:' + gx + ':' + gy) & 1023) / 1023 < GRASS_DETAIL.flowerP * SEASON_FLOWER_MUL) {
    const fl = GD_FLOWERS[cmHash('fc:' + gx + ':' + gy) % GD_FLOWERS.length];
    const petal = fl[0], core = fl[1];
    const fx = 0.3 + ((h1 >> 20) & 15) / 15 * 0.4;
    const fy = 0.3 + ((h2 >> 20) & 15) / 15 * 0.4;
    const cx = Math.round(px + (fx - fy) * hw), cy = Math.round(py + (fx + fy) * hh);
    rect(cx - pu, cy, pu, pu, petal, 1); rect(cx + pu, cy, pu, pu, petal, 1);
    rect(cx, cy - pu, pu, pu, petal, 1); rect(cx, cy + pu, pu, pu, petal, 1);
    rect(cx, cy, pu, pu, core, 1);
  }
  // ── TOUFFES et PIERRES (sprites, pack Cainos) ──────────────────────────────
  // Posés à l'échelle du PIXEL D'ART (pu) et pas à une taille en px : c'est ce
  // qui les met à la même résolution apparente que les brins et les pâquerettes
  // tracés juste au-dessus. Dessiné au pixel près, sans lissage — sinon un
  // sprite de 15 px étalé sur 30 devient flou. Ancrés par le BAS-CENTRE (une
  // pierre pose son assise au point, elle ne flotte pas autour).
  // Ils vivent dans le BAKE du sol : coût nul par frame, et ils sont sautés
  // d'office par le bake allégé (pan) comme les autres détails d'herbe.
  const deco = (art, fx, fy, scale = 1) => {
    if (!art.ready || !art.img) return;
    const iw = art.img.naturalWidth || art.img.width || 0;
    const ih = art.img.naturalHeight || art.img.height || 0;
    if (!iw || !ih) return;
    const w = Math.max(1, Math.round(iw * pu * scale)), hgt = Math.max(1, Math.round(ih * pu * scale));
    const sx = Math.round(px + (fx - fy) * hw), sy = Math.round(py + (fx + fy) * hh);
    ctx.drawImage(art.img, sx - (w >> 1), sy - hgt, w, hgt);
  };
  // Touffe d'herbe haute. Densité SÉPARÉE des brins procéduraux (tuftP) : une
  // touffe dessinée fait ~une demi-cellule, à la densité des brins elle
  // re-carpetterait le sol — l'écueil déjà tranché avec Raph le 2026-07-12.
  const h3 = cmHash('gc:' + gx + ':' + gy);
  if (GRASS_DETAIL.clumpP > 0 && (h3 & 1023) / 1023 < GRASS_DETAIL.clumpP) {
    const fx = 0.24 + ((h3 >> 10) & 31) / 31 * 0.52;
    const fy = 0.24 + ((h3 >> 16) & 31) / 31 * 0.52;
    deco(isoArt('deco/tuft-' + (1 + (h3 % GD_TUFTS))), fx, fy, GRASS_DETAIL.clumpScale);
  }
}
if (typeof window !== 'undefined') {
  // Molette de réglage : rebake le sol immédiatement.
  // __grassDetail(false) éteint ; (nombre) = fréquence des fleurs ; ({tileAlpha,
  // flowerP,tuftP,speckleP,wildShade,clumpP}) = réglage fin. Ex. réactiver les
  // brins : __grassDetail({ tuftP: 0.25 }) ; couper les touffes dessinées :
  // __grassDetail({ clumpP: 0 }).
  window.__grassDetail = (arg) => {
    if (arg === false) GRASS_DETAIL.on = false;
    else if (typeof arg === 'number') { GRASS_DETAIL.on = true; GRASS_DETAIL.flowerP = arg; }
    else if (arg && typeof arg === 'object') { GRASS_DETAIL.on = true; Object.assign(GRASS_DETAIL, arg); }
    else GRASS_DETAIL.on = true;
    CM._isoGroundBake = null;
    return { ...GRASS_DETAIL };
  };
}
// ── Bruit de valeur LISSÉ (interp. bilinéaire de hashs de grille, easing cubique)
// en espace cellule : grandes plaques douces SANS couture (ni maillage par cellule
// ni bord de bloc — les deux écueils déjà rencontrés). 0..1, stable par seed.
// Sert au voile de nuance des sols urbains et aux prés de l'herbe (meadow).
function smoothNoise(gx, gy, scale, salt) {
  const x = gx / scale, y = gy / scale;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const h = (i, j) => (cmHash(salt + ':' + i + ':' + j) % 1000) / 1000;
  return (h(x0, y0) * (1 - sx) + h(x0 + 1, y0) * sx) * (1 - sy)
    + (h(x0, y0 + 1) * (1 - sx) + h(x0 + 1, y0 + 1) * sx) * sy;
}

// ── LISIÈRE QUI DIVAGUE (jonction herbe↔ville, RENDU SEUL) ───────────────────
// Cinq tentatives ont échoué sur cette jonction, et toutes DÉCORAIENT la couture
// en ajoutant un élément SOMBRE le long de la ligne : langues crantées à pointe
// sombre ('teeth' → « ça lit comme des tas »), ourlet sombre continu ('hem' →
// « ça n'a rien changé »), bords rongés + gravillons (ROAD_DETAIL.edgeFringe →
// « ça salissait la route »), contour d'un pack de tuiles Wang (→ traînée grise).
// Ce qui a SURVÉCU est d'une autre famille : dégradé de valeur doux (épaulement,
// gorge, ourlet) ou objet posé à cheval (touffes, fleurs).
//
// Le défaut jamais traité n'est pas la décoration : c'est que la frontière est
// une DROITE. urbanSet est un bloc, donc son bord projette une diagonale au
// cordeau, et décorer une droite ne la rend pas naturelle. Ici on ne décore
// rien : on fait SERPENTER la frontière elle-même, en retournant la matière de
// quelques cellules frontalières — une morsure d'herbe dans le pavé, une langue
// de pavé dans l'herbe. Zéro couleur nouvelle, zéro élément sombre, zéro
// primitive en plus : ce sont les deux aplats existants, sur un bord qui n'est
// plus tiré à la règle. Les touffes et les fleurs de la frange suivent
// automatiquement (grassAt lit kindAt) et ont enfin un bord organique à souligner.
//
// ⚠ RENDU SEUL : urbanSet n'est PAS touché. Le placement des bâtiments, les
// routes et le plan continuent de lire l'emprise logique — une cellule rendue en
// herbe reste constructible côté jeu, et surtout aucune maison ne peut se
// retrouver posée sur l'herbe (cf. le garde d'occupation ci-dessous).
//
// Le bruit est LISSÉ sur ~3 cellules (smoothNoise) et UNIQUE pour les deux sens :
// là où il est haut la ville avance, là où il est bas l'herbe mord. La frontière
// ondule donc de façon cohérente au lieu de moucheter au hasard.
// p : part des cellules frontalières retournées de chaque côté.
// Réglage live : __frontier(false) / ({ p, scale, solo }).
const FRONTIER = { on: true, p: 0.3, scale: 3.2, solo: false };
if (typeof window !== 'undefined') {
  window.__frontier = (arg) => {
    if (arg === false) FRONTIER.on = false;
    else if (arg && typeof arg === 'object') { FRONTIER.on = true; Object.assign(FRONTIER, arg); }
    else FRONTIER.on = true;
    CM._isoGroundBake = null;
    return { ...FRONTIER };
  };
}
// Cellules PORTEUSES d'une emprise bâtie, tous types confondus (L.tiles = la
// source du rendu des bâtiments). Sert de garde : on ne rend jamais en herbe une
// cellule qui porte quelque chose. Cuit une fois par layout — le cache meurt avec
// lui puisqu'un recalcul reconstruit l'objet.
/* ── FRONT DE RUE : le bâtiment cesse de flotter au milieu de son lot (lot L3) ─
 * docs/PLAN-TISSU-URBAIN.md. Un bâtiment est ancré au coin SUD de son emprise et
 * dessiné centré dessus : il flotte au milieu de sa cellule, entouré de sol sur
 * ses quatre côtés. Il n'y a donc aucun MUR DE RUE, et c'est lui qui fait qu'une
 * ville se lit comme une ville : une rue est un couloir entre deux façades, pas
 * une clairière entre deux objets.
 *
 * On pousse donc chaque bâtiment vers LA rue qu'il dessert. Cette face est déjà
 * calculée ailleurs — la passe des allées de seuil la cherche pour poser son
 * trait de la porte à la chaussée — mais elle y était enfouie dans la boucle de
 * dessin. On l'extrait ici : le sprite et son seuil DOIVENT désigner la même
 * façade, sinon le trait sortirait d'un mur aveugle.
 *
 * Priorité S puis E puis O puis N : la porte des sprites regarde la caméra, donc
 * à choisir on ouvre sur la rue que le joueur voit. Ni pont (le seuil plongerait
 * dans l'eau) ni place (déjà dallée). Mémoïsé sur la tuile — les tuiles sont
 * reconstruites à chaque recompute, le cache se périme donc tout seul.
 * ------------------------------------------------------------------------- */
// push 0.14 → 0.19 (Raph, 2026-07-30, sur planche des trois doses). 0,19 n'est pas
// un chiffre rond : c'est TOUTE la place disponible devant une rue ordinaire
// (0,5 − demi-chaussée 0,25 − gap 0,06). Au-delà, le rabotage rendrait la même
// valeur et monter le réglage ne ferait plus rien. Devant une avenue ou un
// boulevard il rabote à 0,11 et 0,08, automatiquement.
export const FRONT = { on: true, push: 0.19, gap: 0.06 };
const FRONT_DIRS = [[0, 1], [1, 0], [-1, 0], [0, -1]];   // S, E, O, N
export function isoBuildingFront(t, roadMap) {
  if (t._front !== undefined) return t._front;
  let out = null;
  if (roadMap) {
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    for (const [dx, dy] of FRONT_DIRS) {
      const hits = [];
      for (let ax = 0; ax < sx; ax += 1) {
        for (let ay = 0; ay < sy; ay += 1) {
          const hx = t.gx + ax, hy = t.gy + ay;
          const rc = roadMap.get((hx + dx) + ',' + (hy + dy));
          if (!rc || rc.roadSurface === 'bridge' || rc.rank === 'plaza') continue;
          hits.push([hx, hy, rc]);
        }
      }
      if (!hits.length) continue;
      // Le MILIEU de la façade : une halle de trois cellules a sa porte centrée,
      // pas collée au coin.
      const [hx, hy, rc] = hits[hits.length >> 1];
      out = { dx, dy, hx, hy, rank: rc.rank };
      break;
    }
  }
  t._front = out;
  return out;
}
// Décalage du sprite vers sa façade, en fraction de tuile.
// ⚠ Le poussé est BORNÉ par la largeur de la chaussée d'en face : l'ancre du
// sprite est son point le plus au sud, et la chaussée d'une cellule voisine
// commence à `0,5 − demi-largeur` de son centre. Un poussé fixe qui va bien
// contre une rue (demi-largeur 0,25) plante le bâtiment DANS un boulevard
// (0,36). La borne se calcule, elle ne se règle pas à l'œil.
export function isoFrontOffset(t, roadMap, cfg = FRONT) {
  if (!cfg.on || !cfg.push) return null;
  const f = isoBuildingFront(t, roadMap);
  if (!f) return null;
  const room = 0.5 - isoRoadHalfW(f.rank) - cfg.gap;
  const push = Math.max(0, Math.min(cfg.push, room));
  if (push <= 0) return null;
  return { ox: f.dx * push, oy: f.dy * push };
}
if (typeof window !== 'undefined') {
  // Molette front de rue : __front(false) recentre les bâtiments comme avant ;
  // __front({push,gap}) règle le poussé (push = fraction de tuile vers la rue,
  // gap = marge minimale gardée jusqu'à la chaussée).
  window.__front = (arg) => {
    if (arg === false) FRONT.on = false;
    else if (arg && typeof arg === 'object') { FRONT.on = true; Object.assign(FRONT, arg); }
    else FRONT.on = true;
    if (CM.layout && CM.layout.tiles) for (const t of CM.layout.tiles) delete t._front;
    CM._isoGroundBake = null;   // les allées de seuil vivent dans le bake
    return { ...FRONT };
  };
}
// Cette cellule frontalière rend-elle la matière de l'AUTRE côté ? Pure et
// exportée : c'est ici que vit le garde qui empêche une maison de se retrouver
// plantée dans l'herbe, et un garde non testé ne protège rien.
// `urbanLogical` lit le LAYOUT (jamais kindAt, qui appelle ceci — l'inverse
// bouclerait) ; `built` = cellules porteuses d'une emprise (cf. builtCells).
export function frontierFlip(gx, gy, isUrban, urbanLogical, built, cfg = FRONTIER) {
  // LE RENDU ET L'EMPRISE DOIVENT CONCORDER. Des cellules sont peintes en sol de
  // ville SANS appartenir à urbanSet : le « quai-lite » pave toute berge qui
  // touche le tissu urbain. Sans ce garde, elles arrivaient ici avec isUrban=true
  // alors qu'urbanLogical répond false ; le test de bord ci-dessous ne pouvait
  // donc jamais les retenir, et le bruit les rendait en herbe — autrement dit il
  // EFFAÇAIT LES QUAIS (régression signalée par Raph). On ne perturbe que les
  // cellules dont la matière rendue vient bien de l'emprise logique.
  if (urbanLogical(gx, gy) !== isUrban) return false;
  // Seules les cellules DE BORD bougent : à l'intérieur des deux matières, rien
  // ne doit changer (sinon on moucheterait la ville et la plaine de taches).
  if (urbanLogical(gx + 1, gy) === isUrban && urbanLogical(gx - 1, gy) === isUrban
    && urbanLogical(gx, gy + 1) === isUrban && urbanLogical(gx, gy - 1) === isUrban) return false;
  // GARDE : une cellule qui porte un bâtiment garde son sol de ville.
  if (isUrban && built.has(gx + ',' + gy)) return false;
  const past = (x, y) => {
    const n = smoothNoise(x, y, cfg.scale, 'front');
    return isUrban ? n < cfg.p : n > 1 - cfg.p;
  };
  if (!past(gx, gy)) return false;
  // Pas de LOSANGE ISOLÉ : un seul retournement au milieu de l'autre matière se
  // lit comme une tache géométrique (l'écueil de toute valeur « par cellule »).
  // On exige qu'un voisin bascule aussi → les retournements viennent par paquets
  // et le bord ondule au lieu de moucheter. Le bruit étant lissé sur ~3 cellules
  // c'est presque toujours vrai : ça ne coupe que les cas isolés.
  if (cfg.solo) return true;
  return past(gx + 1, gy) || past(gx - 1, gy) || past(gx, gy + 1) || past(gx, gy - 1);
}

// ── FRANGE D'HERBE (jonction herbe↔sol) ──────────────────────────────────────
// L'escalier de losanges FRANC entre l'herbe et le sol urbain était la couture la
// plus dure de la carte. Le long de chaque arête partagée herbe/sol, l'herbe MORD
// désormais sur le sol : langues crantées profondes de 1..3 « pixels » d'art
// (pas pu suivant le zoom, comme le tapis d'herbe), pointe assombrie (ourlet
// d'ombre du gazon), trouées pour respirer, et quelques touffes debout à cheval
// sur la lisière. Haché par cellule+arête → stable au rebake, aucun motif répété.
// Ne s'applique QU'AUX sols urbain/terre (les dallages formels — place, parvis —
// gardent leur bord franc voulu) et pas vers l'eau (le fleuve couvre en live).
// Réglage live : __grassFringe(false) / ({depth,gapP,tuftP,flowerP,dark}).
// mode 'none' depuis le 2026-07-20 : la lisière herbe↔sol est un bord FRANC —
// seuls restent les touffes debout et les fleurs (accents validés). Historique
// des retours Raph, ne pas re-proposer sans demande : langues crantées 'teeth'
// (pointes sombres lisaient en « tas »), puis ourlet continu 'hem' (« ça n'a
// rien changé, enlève-le »). Les deux restent en knob — mais `dark` a été mis à
// 0 en même temps : le look 'teeth' HISTORIQUE se rejoue avec
// __grassFringe({mode:'teeth', dark:1}) (sans dark:1, pointes sans ourlet
// d'ombre = un rendu qui n'a jamais existé) ; 'hem' : __grassFringe({mode:'hem'}).
// mode 'wander' (2026-07-22) : on ne DÉCORE plus la couture, on DÉPLACE le bord.
// Les quatre décorations tentées ('teeth', 'hem', edgeFringe, contour d'un pack
// de tuiles) ont toutes été refusées, et toutes ajoutaient un élément SOMBRE le
// long de la ligne. Ici, aucun pixel nouveau : le long de l'arête, le bord est
// repoussé d'un côté ou de l'autre, et on repeint simplement avec la teinte du
// voisin. Là où le décalage est positif l'herbe avance dans le pavé, là où il
// est négatif le pavé avance dans l'herbe. Zéro couleur ajoutée, zéro ombre.
// Le décalage vient d'un bruit LISSÉ échantillonné en coordonnées MONDE (jamais
// par cellule ni par pas) : il est donc continu d'une cellule à l'autre, sinon
// chaque coin de losange rouvrirait une discontinuité — et c'est précisément la
// grille qu'on cherche à faire disparaître.
// wander = amplitude du décalage en « pixels d'art » ; wanderF = finesse (plus
// haut = ondulation plus serrée). Réglé pour onduler à ~1/5 de cellule, l'échelle
// à laquelle le pack trouvé beau ondulait — et non à la cellule entière.
// (Retombée de touffes côté sol ESSAYÉE puis ANNULÉE le 2026-07-28 — « non, ce
// n'est pas ce que j'ai demandé » : Raph voulait la PERSPECTIVE des tuiles
// d'herbe (leur débord de brins passe DEVANT le sol au nord, cf. le blit à
// débord d'ensureIsoTileKey/blitIsoTileKey), pas des brins ajoutés par la
// frange.)
const GRASS_FRINGE = { on: true, mode: 'wander', depth: 1, gapP: 0.14, tuftP: 0.10, flowerP: 0.08, dark: 0, wander: 2.6, wanderF: 12 };
const GF_MID = [102, 126, 72];    // herbe légèrement ombrée (varie le corps des langues)
const GF_DARK = [76, 100, 54];    // pointe sombre : l'ourlet d'ombre de la lisière
function drawGrassFringeEdge(ctx, f, pu, soilTone) {
  const dxE = f.bx - f.ax, dyE = f.by - f.ay;
  const len = Math.hypot(dxE, dyE);
  const steps = Math.max(3, Math.round(len / pu));
  const rect = (x, y, col) => { ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`; ctx.fillRect(x, y, pu, pu); };
  const mode = GRASS_FRINGE.mode;
  if (mode === 'wander' && soilTone) {
    // BORD DÉPLACÉ (cf. l'en-tête du bloc). Densité ×2 comme 'hem' : sur une
    // diagonale 2:1, un pas par pu laisserait l'escalier à jour entre les carrés.
    const D = GRASS_FRINGE.wander * pu;
    const F = GRASS_FRINGE.wanderF;
    const n2 = Math.max(4, Math.ceil(len / pu) * 2);
    for (let i = 0; i < n2; i += 1) {
      const t = (i + 0.5) / n2;
      // Position MONDE du pas (en cellules) → le bruit est continu de cellule en
      // cellule, donc le bord ondule sans se rompre aux coins des losanges.
      const wx = f.wx0 + (f.wx1 - f.wx0) * t, wy = f.wy0 + (f.wy1 - f.wy0) * t;
      const d = (smoothNoise(wx * F, wy * F, 2.5, 'wan') - 0.5) * 2 * D;
      const ex = f.ax + dxE * t, ey = f.ay + dyE * t;
      const n = Math.round(Math.abs(d) / pu);
      // d > 0 : l'herbe mord dans le sol (sens rentrant) ; d < 0 : l'inverse.
      const sgn = d > 0 ? 1 : -1;
      const col = d > 0 ? SEASON_GRASS : soilTone;
      for (let j = 0; j < n; j += 1) {
        const s = (j + 0.5) * pu * sgn;
        rect(Math.round(ex + f.inx * s - pu / 2), Math.round(ey + f.iny * s - pu / 2), col);
      }
      // (Le LISERÉ DE NEIGE d'hiver qui vivait ici a été SUPPRIMÉ le 2026-07-28 —
      // il clignotait au pan avec le défilement incrémental, cf. le bloc NEIGE
      // D'HIVER plus haut. La neige vient des tuiles ISO_TILE_WINTER.)
    }
  }
  if (mode === 'hem') {
    // TRAIT CONTINU : rangée de pixels d'art SANS trouée qui longe l'arête, à
    // cheval côté sol — pas-de-vis en carrés opaques (pas de stroke anti-aliasé,
    // la lisière reste crispe). Densité ×2 pour un escalier plein sur les
    // diagonales 2:1.
    const n2 = Math.ceil(len / pu) * 2;
    for (let i = 0; i < n2; i += 1) {
      const t = (i + 0.5) / n2;
      rect(Math.round(f.ax + dxE * t + f.inx * 0.5 * pu - pu / 2),
        Math.round(f.ay + dyE * t + f.iny * 0.5 * pu - pu / 2), GF_DARK);
    }
  }
  for (let i = 0; i < steps; i += 1) {
    const h = cmHash(f.seed + ':' + i);
    if ((h & 255) / 255 < GRASS_FRINGE.gapP) continue;         // trouée : la lisière respire
    const t = (i + 0.5) / steps;
    const ex = f.ax + dxE * t, ey = f.ay + dyE * t;
    if (mode === 'teeth') {
      const d = Math.max(1, Math.round((1 + ((h >>> 8) % 3)) * GRASS_FRINGE.depth));
      for (let j = 0; j < d; j += 1) {
        const bx = Math.round(ex + f.inx * (j + 0.5) * pu - pu / 2);
        const by = Math.round(ey + f.iny * (j + 0.5) * pu - pu / 2);
        const col = (j === d - 1 && GRASS_FRINGE.dark) ? GF_DARK
          : (((h >> (10 + j)) & 3) === 0 ? GF_MID : SEASON_GRASS);
        rect(bx, by, col);
      }
    }
    // Touffe debout occasionnelle, à cheval sur la lisière : brins sombres à
    // pointe claire (mêmes tons que le tapis d'herbe → aucun accent nouveau).
    if ((h % 997) / 997 < GRASS_FRINGE.tuftP) {
      const nB = 2 + ((h >> 16) & 1);
      const bh = 2 * pu + ((h >> 17) & 1) * pu;
      for (let k = 0; k < nB; k += 1) {
        const bxi = Math.round(ex + (k - (nB - 1) / 2) * (pu + 1));
        const jh = bh - ((h >> (18 + k)) & 1) * pu;
        ctx.fillStyle = `rgb(${GD_BLADE[0]},${GD_BLADE[1]},${GD_BLADE[2]})`;
        ctx.fillRect(bxi, Math.round(ey - jh), pu, jh);   // corps du brin
        rect(bxi, Math.round(ey - jh), SEASON_TIP || GD_TIP);   // pointe claire
      }
    }
  }
  // FLEURS DE LISIÈRE (retour Raph 2026-07-16 : « rajoute des petites fleurs ») :
  // pâquerettes & accents de la palette du tapis (GD_FLOWERS, blanc/jaune
  // dominants), posés à cheval sur la lisière, surtout côté herbe — une
  // guirlande discrète qui souligne le bord. 2e boucle : dessinées APRÈS les
  // langues pour qu'un pas voisin ne rogne pas leurs pétales.
  const fringeFlowerP = GRASS_FRINGE.flowerP * SEASON_FLOWER_MUL;
  if (fringeFlowerP > 0) {
    for (let i = 0; i < steps; i += 1) {
      const hf = cmHash(f.seed + ':fl:' + i);
      if ((hf & 1023) / 1023 >= fringeFlowerP) continue;
      const t = (i + 0.5) / steps;
      const off = (((hf >> 10) & 3) - 2) * pu;          // −2pu (herbe) .. +1pu (langue)
      const cx = Math.round(f.ax + dxE * t + f.inx * off);
      const cy = Math.round(f.ay + dyE * t + f.iny * off);
      const fl = GD_FLOWERS[(hf >>> 12) % GD_FLOWERS.length];   // ⚠ >>> : un >> signé rendait l'index négatif
      rect(cx - pu, cy, fl[0]); rect(cx + pu, cy, fl[0]);
      rect(cx, cy - pu, fl[0]); rect(cx, cy + pu, fl[0]);
      rect(cx, cy, fl[1]);
    }
  }
}
if (typeof window !== 'undefined') {
  // Frange d'herbe : __grassFringe(false) éteint ; ({depth,gapP,tuftP,flowerP,dark})
  // réglage fin ; sans argument = rallume. Rebake immédiat.
  window.__grassFringe = (arg) => {
    if (arg === false) GRASS_FRINGE.on = false;
    else if (arg && typeof arg === 'object') { GRASS_FRINGE.on = true; Object.assign(GRASS_FRINGE, arg); }
    else GRASS_FRINGE.on = true;
    CM._isoGroundBake = null;
    return { ...GRASS_FRINGE };
  };
}

// ── Sol urbain : MATIÈRE par âge (terre → pavé → dalles → béton → tech) ───────
// DA Raph 2026-07-12 : sol urbain « différent à chaque ère », CALME MAIS LISIBLE.
// Procédural (pas de tuile → pas de tiling comme l'herbe), posé dans le bake, dans
// NOTRE palette. mat.tone = aplat de base ; le MOTIF (cailloux / joints de pavés /
// joints de dalles / dilatation béton / coutures tech) est tracé PAR-DESSUS, à
// FAIBLE contraste. Les joints suivent les arêtes du losange (= axes monde) → un
// pavage iso naturel, sans concurrencer les bâtiments. 10 âges (ageVisualConfig).
// tile = tuile PixelLab par matière (/pixelart/iso/<tile>.png) ; si le PNG manque,
// repli sur le motif procédural (drawUrbanDetail). type/joint/seam = params du repli.
const URBAN_MATS = [
  // Tons 0-1 = ton moyen MESURÉ de ground-earth (lot 606 dé-liseré, imprimé par
  // fetchGroundTiles) : l'aplat de repli doit rester dans la famille de la tuile
  // qui le recouvre, sinon le sol « saute » quand le PNG décode.
  { tone: [187, 135, 82], type: 'earth', grav: 0, tile: 'ground-earth' },               // 0 primitif — terre battue
  { tone: [187, 135, 82], type: 'earth', grav: 1, tile: 'ground-earth' },               // 1 agricole — terre + graviers
  { tone: [170, 156, 130], type: 'cobble', joint: 0.16, tile: 'ground-cobble' },        // 2 bourg — pavés irréguliers
  { tone: [158, 152, 138], type: 'cobble', joint: 0.18, tile: 'ground-cobble' },        // 3 fortifié — pavé de pierre
  { tone: [188, 178, 150], type: 'flagstone', joint: 0.16, tile: 'ground-flagstone' },  // 4 impérial — grandes dalles
  { tone: [192, 186, 168], type: 'flagstone', joint: 0.14, tile: 'ground-flagstone' },  // 5 monumental — pierre claire
  { tone: [162, 160, 154], type: 'concrete', joint: 0.12, tile: 'ground-concrete' },    // 6 mégalopole — béton
  { tone: [94, 100, 116], type: 'tech', seam: [116, 196, 208], tile: 'ground-tech' },   // 7 noosphère — dalles tech
  { tone: [86, 94, 116], type: 'tech', seam: [130, 210, 220], tile: 'ground-tech' },    // 8 stellaire
  { tone: [80, 90, 118], type: 'tech', seam: [150, 224, 232], tile: 'ground-tech' },    // 9 démiurge
];
// tileA/tileJit : DOSAGE de la tuile de matière « terre » — alpha = tileA +
// bruit LISSÉ × tileJit. Historique des retours Raph : tuile PLEINE = tapis
// criard (2026-07-12), alpha haché PAR CELLULE = damier de losanges, plaques
// par bruit lissé = « tas de terre » épars, et même en dose constante à 0.6
// les mottes lisaient encore comme des tas/« pavés de jonction » (2026-07-20).
// VERDICT FINAL 2026-07-20 : le grief était la FORCE de la trame, pas sa
// répartition → dose CONSTANTE ET FAIBLE (0.12 = simple grain qui vit, zéro
// motte lisible ; validé par captures jour/nuit). tileJit reste un knob.
// noiseAmp : VOILE DE NUANCE par bruit lissé — essayé à 0.3, coupé le
// 2026-07-16 (retour Raph : « retire les plaques grises sur le sol ») ; knob.
// tileA 0.12 → 1 (Raph 2026-07-28) : le 0.12 dosait l'ANCIENNE tuile de terre
// unique (historique ci-dessus, conservé) ; les 4 variantes brutes regénérées
// s'affichent pleines, comme les autres matières.
const URBAN_DETAIL = { on: true, mult: 1, band: null, tiles: true, tileA: 1, tileJit: 0, noiseAmp: 0 };   // band≠null = force ère (preview) ; tiles=false → procédural
// S2 — DOSE PAR MATIÈRE (docs/PLAN-RENDU-VILLE.md). `tileA` ne s'appliquait qu'à la
// TERRE BATTUE : partout ailleurs la tuile partait à alpha 1, sans qu'aucun réglage
// ne puisse la calmer. Or le grain mesuré des matières de sol est très inégal —
// écart moyen de luminance entre pixels VOISINS, sur les PNG livrés :
//
//   ground-cobble 18,4   ·   iso-grass 16,7   ·   ground-flagstone 6,4
//   iso-dirt 5,8   ·   ground-concrete 4,6   ·   ground-earth 4,4   ·   ground-tech 2,8
//
// Le pavé est 4 à 6 fois plus bruyant que toutes les autres pierres, et c'est la
// matière des bandes 2 et 3 — celles de la capture « brouillon » de Raph.
//
// ⚠ SEUL LE PAVÉ EST DOSÉ, et c'est un ARBITRAGE de Raph (2026-08-05), pas un
// réglage libre : il avait lui-même monté `tileA` de 0,12 à 1 le 2026-07-28 pour que
// les variantes régénérées « s'affichent pleines ». La planche des trois doses
// (`.preview-shots/s2-planche-pave.png`, 1 / 0,6 / 0,35) a tranché sur **0,6** :
// le pavé garde sa matière et cesse de grésiller.
//
//   grain moyen de la frame (écart-type local 8×8) : 40,0 → 36,9 (médiane 38,5 → 33,7)
//   18,0 % des pixels changent, caméra identique — et le masque de différence
//   montre les silhouettes de bâtiments noires au pixel près : SEUL le sol bouge.
//
// ⚠ Doser ne laisse aucun trou parce que l'aplat de ton est peint DESSOUS : pour
// `urban`, `texAlpha` vaut 0, donc la branche de repli peint le losange plein avant
// la tuile. Si ce 0 disparaissait, la dose montrerait le fond du canvas — c'est
// pour ça que la garde le vérifie dans le SOURCE.
//
// Les autres matières restent à 1 : leur grain mesuré est 4 à 6 fois plus bas
// (flagstone 6,4 · concrete 4,6 · earth 4,4 · tech 2,8 contre 18,4 pour le pavé).
// Molette : `__groundMat({ tileAType: { cobble: 1 } })` rejoue l'ancien.
export const URBAN_TILE_A = { earth: null, cobble: 0.6, flagstone: 1, concrete: 1, tech: 1 };
// `null` = suit `tileA` (la terre battue garde son réglage historique partagé).
const urbanTileAlpha = (type) => {
  const v = URBAN_TILE_A[type];
  return v == null ? URBAN_DETAIL.tileA : v;
};
function urbanMatFor(band) {
  const b = URBAN_DETAIL.band != null ? URBAN_DETAIL.band : band;
  return URBAN_MATS[Math.max(0, Math.min(URBAN_MATS.length - 1, b | 0))];
}
function drawUrbanDetail(ctx, gx, gy, px, py, hw, hh, mat) {
  const k = URBAN_DETAIL.mult, t = mat.tone;
  const shade = (f) => `rgb(${Math.max(0, Math.min(255, Math.round(t[0] * f)))},${Math.max(0, Math.min(255, Math.round(t[1] * f)))},${Math.max(0, Math.min(255, Math.round(t[2] * f)))})`;
  const N = [px, py], E = [px + hw, py + hh], W = [px - hw, py + hh];
  const seg = (a, b, style, lw) => { ctx.strokeStyle = style; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); };
  if (mat.type === 'earth') {
    // cailloux/poussière : quelques points sombres+clairs (gravier ×1 en agricole).
    const pu = Math.max(1, Math.round(hw * 0.05));
    for (let i = 0, n = mat.grav ? 3 : 2; i < n; i += 1) {
      const h = cmHash('ud:' + gx + ':' + gy + ':' + i);
      const fx = 0.2 + ((h >> 3) & 63) / 63 * 0.6, fy = 0.2 + ((h >> 9) & 63) / 63 * 0.6;
      const sx = Math.round(px + (fx - fy) * hw), sy = Math.round(py + (fx + fy) * hh);
      ctx.fillStyle = (h & 1) ? shade(0.86) : shade(1.08);
      ctx.fillRect(sx, sy, pu, pu);
    }
    return;
  }
  // Joints : 2 arêtes du HAUT / cellule → chaque joint interne tracé 1× (l'arête sud
  // d'une cellule = l'arête nord de sa voisine, tracée par celle-ci). Fins & doux.
  const lw = Math.max(1, hw * 0.03);
  if (mat.type === 'cobble') {
    const jl = shade(1 - mat.joint * k);
    seg(N, E, jl, lw); seg(N, W, jl, lw);
    seg([px + 0.5 * hw, py + 0.5 * hh], [px - 0.5 * hw, py + 1.5 * hh], jl, lw);   // médiane monde X (2×2 pavés)
    seg([px - 0.5 * hw, py + 0.5 * hh], [px + 0.5 * hw, py + 1.5 * hh], jl, lw);   // médiane monde Y
    return;
  }
  if (mat.type === 'flagstone') {
    const jl = shade(1 - mat.joint * k);
    seg(N, E, jl, lw); seg(N, W, jl, lw);                                          // 1 dalle par tuile
    return;
  }
  if (mat.type === 'concrete') {
    const jl = shade(1 - mat.joint * k);
    if ((((gx % 3) + 3) % 3) === 0) seg(N, W, jl, lw);                             // joints de dilatation ~1/3
    if ((((gy % 3) + 3) % 3) === 0) seg(N, E, jl, lw);
    if ((cmHash('uc:' + gx + ':' + gy) % 7) === 0) {                              // tache faible éparse
      ctx.fillStyle = 'rgba(40,40,46,0.10)';
      ctx.beginPath(); ctx.ellipse(px, py + hh, hw * 0.42, hh * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    }
    return;
  }
  if (mat.type === 'tech') {
    const s = mat.seam, a = (0.22 * k).toFixed(2), lw2 = Math.max(1, hw * 0.025);
    seg(N, E, `rgba(${s[0]},${s[1]},${s[2]},${a})`, lw2);                          // coutures lumineuses
    seg(N, W, `rgba(${s[0]},${s[1]},${s[2]},${a})`, lw2);
    return;
  }
}
if (typeof window !== 'undefined') {
  // Molette sol urbain : __groundMat(false) off ; (nombre)=intensité ; ({band:3})
  // force une ère pour l'aperçu ; ({mult,band,tileA,tileJit,noiseAmp}) réglage fin
  // (tileA/tileJit = dose de la trame terre par cellule ; noiseAmp = voile de
  // nuance en plaques lissées). Rebake immédiat.
  window.__groundMat = (arg) => {
    if (arg === false) URBAN_DETAIL.on = false;
    else if (typeof arg === 'number') { URBAN_DETAIL.on = true; URBAN_DETAIL.mult = arg; }
    else if (arg && typeof arg === 'object') {
      URBAN_DETAIL.on = true;
      // S2 : `tileAType` va dans SA table, pas dans URBAN_DETAIL — sinon la clé
      // resterait inerte et la molette mentirait en silence.
      const { tileAType, ...rest } = arg;
      if (tileAType && typeof tileAType === 'object') Object.assign(URBAN_TILE_A, tileAType);
      Object.assign(URBAN_DETAIL, rest);
    } else URBAN_DETAIL.on = true;
    CM._isoGroundBake = null;
    return { ...URBAN_DETAIL, tileAType: { ...URBAN_TILE_A } };
  };
}
// Couple de surfaces d'une ère, tel que le sol le PEINT (aucun forçage d'aperçu).
// Exporté pour la garde de contraste : elle lit les PNG que ces clés désignent —
// recopier les clés dans le test reviendrait à le comparer à lui-même.
export function isoEraSurface(band) {
  const b = Math.max(0, Math.min(URBAN_MATS.length - 1, band | 0));
  return {
    ground: URBAN_MATS[b].tile,
    road: ROAD_MATS[Math.max(0, Math.min(ROAD_MATS.length - 1, b))].tile,
    veil: ROAD_VEIL[Math.max(0, Math.min(ROAD_VEIL.length - 1, b))],
  };
}
// ── FRANGE DE CHAUSSÉE : même grammaire que la lisière d'herbe, entre la dalle
// et son épaulement — l'épaulement MORD sur le bord du ruban par petits blocs
// (1..2 pu, deux tons), et la matière de la route s'égrène en GRAVILLONS épars
// sur l'épaulement. Le bord parfaitement géométrique faisait « route tamponnée » ;
// cranté, il fait chemin qui vit avec son sol. Intensité PAR ÈRE (roadFringeK) :
// terre battue très effrangée → pavé/dalle un peu → asphalte à peine → tech NETTE
// (une voie high-tech aux bords rongés ne se lit pas). Bake seulement, hash par
// arête+pas (stable, continu de cellule en cellule — rien « par cellule »).
function roadFringeK(band) {
  return band >= 7 ? 0 : band >= 6 ? 0.5 : band >= 2 ? 0.75 : 1;
}
function drawRoadEdgeFringe(ctx, seg, pu, biteCol, biteCol2, spillCol, k) {
  const dxE = seg.bx - seg.ax, dyE = seg.by - seg.ay;
  const len = Math.hypot(dxE, dyE);
  if (len < pu * 2) return;
  const steps = Math.max(2, Math.round(len / pu));
  for (let i = 0; i < steps; i += 1) {
    const h = cmHash(seg.seed + ':' + i);
    const t = (i + 0.5) / steps;
    const ex = seg.ax + dxE * t, ey = seg.ay + dyE * t;
    // Morsure de l'épaulement sur la dalle (vers l'INTÉRIEUR du ruban).
    if ((h & 255) / 255 < 0.6 * k) {
      const d = 1 + ((h >>> 8) % 2);
      for (let j = 0; j < d; j += 1) {
        ctx.fillStyle = ((h >>> (10 + j)) & 1) ? biteCol : biteCol2;
        ctx.fillRect(Math.round(ex - seg.ox * (j + 0.5) * pu - pu / 2), Math.round(ey - seg.oy * (j + 0.5) * pu - pu / 2), pu, pu);
      }
    }
    // Gravillons égrenés vers l'EXTÉRIEUR (sur l'épaulement, un peu au-delà).
    if (((h >>> 16) & 255) / 255 < 0.3 * k) {
      const dOut = 1 + ((h >>> 24) & 1);
      ctx.fillStyle = spillCol;
      ctx.fillRect(Math.round(ex + seg.ox * (dOut + 0.2) * pu - pu / 2), Math.round(ey + seg.oy * (dOut + 0.2) * pu - pu / 2), pu, pu);
    }
  }
}
function roadMatFor(band) {
  const b = ROAD_DETAIL.band != null ? ROAD_DETAIL.band : band;
  return ROAD_MATS[Math.max(0, Math.min(ROAD_MATS.length - 1, b | 0))];
}
if (typeof window !== 'undefined') {
  // Molette chaussée : __roadMat(false) off ; ({tiles,band,shoulderMix,shoulderV,
  // groove,grooveA,feather,featherA,edgeFringe,veilK}) réglage fin (shoulder* =
  // teinte de l'épaulement ; groove* = gorge d'ombre au contact de la dalle ;
  // feather* = ourlet de fondu épaulement→sol ; edgeFringe = crantage rejeté, 0 ;
  // veilK = dose du voile de lecture, 0 rend la rue à sa tuile nue). Rebake immédiat.
  window.__roadMat = (arg) => {
    if (arg === false) ROAD_DETAIL.on = false;
    else if (arg && typeof arg === 'object') { ROAD_DETAIL.on = true; Object.assign(ROAD_DETAIL, arg); }
    else ROAD_DETAIL.on = true;
    syncIsoStreetGeom();   // la gorge participe à la géométrie publiée aux agents
    isoTileCache.forEach((e) => { e.veiled = null; });   // veilK repeint les faces voilées
    CM._isoGroundBake = null;
    return { ...ROAD_DETAIL };
  };
}
// GÉOMÉTRIE DE RUE publiée aux AGENTS (agents.js ne peut pas importer ce module :
// import inverse). Les piétons et véhicules marchent/roulent sur la géométrie que
// le renderer DESSINE — une seule source de vérité, resynchronisée quand une
// molette change la rue. En tuiles (fractions) :
//   isoVehLane      — centre de voie = demi-chaussée / 2 (conduite à droite) ;
//   isoPedEdge      — milieu de la bande de trottoir (ères à trottoir) ;
//   isoPedEdgeLow   — ligne d'accotement (ères de terre, avant les trottoirs) ;
//   isoPedSpread    — demi-étalement PERSONNEL des piétons dans la bande ;
//   isoSidewalkMinBand — première ère à trottoir.
function syncIsoStreetGeom() {
  const bandW = SIDEWALK_ISO.w - ROAD_DETAIL.groove - SIDEWALK_ISO.curb;   // largeur visible de la bande
  CM.isoVehLane = ROAD_BAND / 2;
  CM.isoPedEdge = ROAD_BAND + ROAD_DETAIL.groove + SIDEWALK_ISO.curb + bandW / 2;
  CM.isoPedEdgeLow = ROAD_BAND + 0.09;
  CM.isoPedSpread = Math.max(0, bandW * 0.3);
  CM.isoSidewalkMinBand = SIDEWALK_ISO.minBand;
  // Variantes PAR RANG (hiérarchie des largeurs) : les agents regardent d'abord
  // le rang de LEUR cellule, et retombent sur les scalaires ci-dessus (rang
  // inconnu, hors-route, saves d'avant la hiérarchie).
  CM.isoVehLaneByRank = {};
  CM.isoPedEdgeByRank = {};
  CM.isoPedEdgeLowByRank = {};
  for (const rk of Object.keys(ISO_ROAD_HALFW)) {
    const w = ISO_ROAD_HALFW[rk];
    CM.isoVehLaneByRank[rk] = w / 2;
    CM.isoPedEdgeByRank[rk] = w + ROAD_DETAIL.groove + SIDEWALK_ISO.curb + bandW / 2;
    CM.isoPedEdgeLowByRank[rk] = w + 0.09;
  }
}
syncIsoStreetGeom();
if (typeof window !== 'undefined') {
  window.__sidewalkIso = (arg) => {
    if (arg === false) SIDEWALK_ISO.on = false;
    else if (arg && typeof arg === 'object') { SIDEWALK_ISO.on = true; Object.assign(SIDEWALK_ISO, arg); }
    else SIDEWALK_ISO.on = true;
    syncIsoStreetGeom();
    CM._isoGroundBake = null;
    return { ...SIDEWALK_ISO };
  };
}

// ── PARVIS DES MERVEILLES : sol dédié de l'emprise (L.wonderGround) ───────────
// Demande Raph 2026-07-13 : la grande zone réservée d'une merveille (dès le
// rang I) doit se LIRE comme une PLACE, pas comme du sol urbain ordinaire — et
// le monument trône en son CENTRE (emprise carrée, cf. cmWonderExtent).
// Base = TUILE `iso-wonder` (MOSAÏQUE ocre et blanche, 4 variantes égalisées)
// posée à plat sur l'aplat de repli. Sur tout le POURTOUR, marche d'ombre +
// MARGELLE claire (arêtes dont le voisin n'est pas du parvis).
// Réglage live : __wonderGround({ tone, pave, joint, rim, tileAlpha }) / (false).
//
// ⚠ TROIS MOTIFS AU PAS DE LA CELLULE RETIRÉS le 2026-07-24 (retour Raph :
// « l'effet carré des plaques au sol »). Le parvis cumulait un damier ±5 % par
// cellule, un joint le long de deux arêtes de CHAQUE losange, et la tuile
// iso-plaza (quatre grandes dalles dessinées) reblittée par cellule avec un
// miroir un coup sur deux. Trois périodes égales à celle de la grille : l'œil
// ne lisait pas un dallage mais des plaques, parce qu'une cellule vaut un LOT
// DE MAISON et qu'un pavé de cette taille n'existe pas.
//
// LA TUILE EST RALLUMÉE le 2026-07-28 (tileAlpha 0 → 1, Raph : « je veux une
// génération pixel lab »), et le grief ci-dessus est traité, pas contourné :
//   • ce n'étaient pas LES tuiles qui plaquaient, c'était CELLE-LÀ — iso-plaza
//     dessinait quatre grandes dalles avec leur liseré, un objet de la taille
//     d'une cellule, donc une période égale à la grille ;
//   • la mosaïque est une texture de TESSELLES (période ~1/16 de cellule) ;
//   • ses 4 variantes sont ÉGALISÉES par canal au fetch (écart de luminance
//     ramené de 8,9 à 0,0) : ce qui change d'une cellule à l'autre est le
//     dessin seul, jamais la valeur — la règle du fichier, à la lettre ;
//   • et ce qui reste de période cellulaire se lit comme un PANNEAU de mosaïque,
//     ce dont un sol d'apparat antique est fait. Vérifié au pan 7×7 avant de
//     câbler (scripts/tilePan.mjs) : c'est LE test du parvis, seul sol du jeu à
//     couvrir un carré plein. Les trois autres matières du lot y ont échoué —
//     le détail des quatre verdicts est dans scripts/fetchGroundTiles.mjs.
//
// `pave`/`joint` : le DALLAGE PROCÉDURAL (drawWonderPaving) est coupé par défaut
// depuis que l'art porte ses propres joints — deux appareillages superposés
// faisaient une trame double. Le tracé reste, `joint` le rallume.
// DALLAGE : joints d'un appareillage posé dans le repère MONDE, au pas TILE/pave,
// À JOINTS DÉCALÉS (une rangée sur deux glisse d'une demi-dalle). Le décalage est
// ce qui compte : sans lui les joints de bout se réalignent en maille croisée et
// on retombe sur un quadrillage, juste plus fin.
//
// Tout tient DANS le losange de la cellule (les indices de dalle sont absolus,
// `pave` divise la cellule) : pas de clip, coût borné à pave + pave² segments par
// cellule, et le motif ne glisse pas d'un pan à l'autre. Les rangs `dk` et les
// joints `dj` s'arrêtent à div-1 : l'arête SO et l'arête SE appartiennent à la
// cellule suivante, qui trace les siens — chaque joint interne est tracé une fois
// et les lignes se raboutent d'une cellule à l'autre.
export function drawWonderPaving(ctx, gx, gy, px, py, hw, hh) {
  const div = WONDER_GROUND.pave | 0;
  if (div < 1 || !(WONDER_GROUND.joint > 0)) return;
  // Trop loin : sous ~5 px la dalle, la trame vire au gris sale — on rend
  // l'aplat nu, comme le bake allégé rend le sol sans ses détails fins.
  if ((hw * 2) / div < 5) return;
  const ex = hw / div, ey = hh / div;        // pas d'UNE dalle en x monde, projeté
  const sx = (dj, dk) => px + (dj - dk) * ex;
  const sy = (dj, dk) => py + (dj + dk) * ey;
  ctx.beginPath();
  for (let dk = 0; dk < div; dk += 1) {
    // RANG : joint long, continu d'une cellule à la suivante.
    ctx.moveTo(sx(0, dk), sy(0, dk));
    ctx.lineTo(sx(div, dk), sy(div, dk));
    // JOINTS DE BOUT du rang, décalés d'une demi-dalle un rang sur deux. L'indice
    // ABSOLU du rang décide (gy * div + dk), sinon le décalage se remettrait à
    // zéro à chaque cellule et redessinerait la grille qu'on retire.
    const off = ((gy * div + dk) & 1) ? 0.5 : 0;
    for (let dj = 0; dj < div; dj += 1) {
      const a = dj + off;
      ctx.moveTo(sx(a, dk), sy(a, dk));
      ctx.lineTo(sx(a, dk + 1), sy(a, dk + 1));
    }
  }
  ctx.strokeStyle = rgb(WONDER_GROUND.tone, 1 - WONDER_GROUND.joint);
  ctx.lineWidth = Math.max(1, Math.round((hw * 2) / div * 0.045));
  ctx.stroke();
}
function drawWonderGroundDetail(ctx, gx, gy, px, py, hw, hh, wg) {
  const shade = (f) => rgb(WONDER_GROUND.tone, f);
  const N = [px, py], E = [px + hw, py + hh], S = [px, py + hh * 2], W = [px - hw, py + hh];
  const seg = (a, b, style, lw) => { ctx.strokeStyle = style; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); };
  // Pourtour : marche d'ombre (nu extérieur) + margelle claire en retrait. Traits
  // RENTRÉS vers le centre pour survivre au liseré anti-couture des cellules
  // voisines (dessinées après : elles recouvrent l'arête partagée).
  const cx = px, cy = py + hh;
  const inset = (p, k) => [p[0] + (cx - p[0]) * k, p[1] + (cy - p[1]) * k];
  const edges = [
    [gx, gy - 1, N, E], [gx + 1, gy, E, S],   // NE / SE écran
    [gx, gy + 1, S, W], [gx - 1, gy, W, N],   // SO / NO écran
  ];
  for (const [nx, ny, a, b] of edges) {
    if (wg.has(nx + ',' + ny)) continue;
    seg(inset(a, 0.05), inset(b, 0.05), 'rgba(34,30,20,0.25)', Math.max(1, hw * 0.05));
    seg(inset(a, 0.16), inset(b, 0.16), shade(WONDER_GROUND.rim), Math.max(1, hw * 0.09));
  }
}
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
  for (let gy = b.gy0; gy <= b.gy1; gy += 1) {
    for (let gx = b.gx0; gx <= b.gx1; gx += 1) {
      const p = worldToScreen(gx * T, gy * T);   // coin NORD du losange
      if (cullOn && (p.x < -cullPadX || p.x > CM.cw + cullPadX
        || p.y < -cullPadY || p.y > CM.ch + cullPadY)) continue;
      // Recuisson en BANDE (tranche horizontale ou bande verticale du
      // défilement) : seules les cellules de la bande travaillent — le clip
      // garantit les pixels, ce test évite le calcul.
      if (ISO_GROUND_SLICE.on) {
        if (ISO_GROUND_SLICE.yOn && (p.y < ISO_GROUND_SLICE.y0 - ISO_GROUND_SLICE.padTop
          || p.y > ISO_GROUND_SLICE.y1 + ISO_GROUND_SLICE.padBot)) continue;
        if (ISO_GROUND_SLICE.xOn && (p.x < ISO_GROUND_SLICE.x0 - ISO_GROUND_SLICE.padX
          || p.x > ISO_GROUND_SLICE.x1 + ISO_GROUND_SLICE.padX)) continue;
      }
      if (PR) PR.n += 1;
      const key = gx + ',' + gy;
      const isRoad = L.roadSet.has(key);
      const cell = isRoad && roadMap ? roadMap.get(key) : null;
      const isPlaza = !!(cell && cell.rank === 'plaza');       // ⚠ piège places-dans-roadSet
      const isBridge = !!(cell && cell.roadSurface === 'bridge');
      const isWater = !!(riverCells && riverCells.has(key));
      const kind = kindAt(gx, gy);
      const tone = kind === 'plaza' ? (PLAZA_ERA_TONE[plazaEra] || PLAZA) : kind === 'wonder' ? WONDER_GROUND.tone
        : kind === 'grass' ? SEASON_GRASS : kind === 'dirt' ? DIRT_TONE
          : kind === 'shingle' ? beachTone('shingle')
            : kind === 'sand' ? beachTone('sand') : urb;
      // UN hash par cellule pour les deux tirages : le miroir (bit 3) et la
      // variante de tuile (bits 5-6, cf. isoVariantKey). Deux cmHash séparés ne
      // coûteraient rien de plus qu'ils ne rapporteraient — mêmes bits, même
      // grille — et ce bake balaie jusqu'à ~9 000 cellules d'herbe.
      const cellH = cmHash(key);
      const mir = ((cellH >>> 3) & 1) === 1;
      // Dosage par matière : l'URBAIN reste un aplat CALME avec un simple GRAIN de
      // texture (alpha faible) — la tuile pleine tapissait la ville d'un motif
      // fissuré qui concurrençait les bâtiments (v2 refusée à la capture). Herbe
      // et place gardent leur tuile pleine (elles portent bien le détail).
      // Urbain : plus de tuile générique (0) — la MATIÈRE par ère (drawUrbanDetail)
      // porte tout le détail. dirt garde son grain, place/parvis/reste leur tuile
      // pleine. Parvis : tileAlpha 1 depuis qu'il a SA matière (iso-wonder) au
      // lieu d'emprunter iso-plaza — cf. WONDER_GROUND pour le pourquoi du retour.
      // dirt 0.5 → 1 (Raph 2026-07-28, même décision que l'herbe) : la tuile de
      // terre regénérée se montre pleine, le voile date de l'ancienne tuile unique.
      const texAlpha = kind === 'urban' ? 0
        : kind === 'wonder' ? WONDER_GROUND.tileAlpha
          : kind === 'grass' ? GRASS_DETAIL.tileAlpha : 1;
      const tile = (kind && !HARD) ? ensureIsoTileKey(keyOfKind(kind)) : null;
      const tileReady = !!(tile && tile.ready);
      if (kind !== 'grass' && (!tileReady || texAlpha < 1)) {
        const tF = PR && performance.now();
        // Aplat STRICTEMENT UNI (v=1) pour TOUS les sols : le jitter par cellule,
        // même ±3 %, ressortait en damier de losanges (« il reste des plaques »,
        // Raph 2026-07-16 — même écueil que l'herbe jadis : toute variation par
        // CELLULE montre la grille). La vie vient de motifs CONTINUS (trame de
        // cailloux à densité lissée, frange, fleurs), jamais d'un ton par cellule.
        // PLUS D'EXCEPTION : le parvis portait un damier 2 teintes indexé sur
        // (gx+gy)&1 — un dallage VOULU, mais dessiné au pas de la cellule, donc
        // exactement la faute que le reste du paragraphe interdit. Retiré le
        // 2026-07-24 ; le dallage se lit maintenant aux joints de drawWonderPaving.
        ctx.fillStyle = rgb(tone, 1);
        diamondPath(ctx, p.x, p.y, hw, hh);
        ctx.fill();
        // Anti-couture : fin liseré de la même couleur par-dessus les bords partagés.
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 1;
        ctx.stroke();
        // (Usure éparse RETIRÉE le 2026-07-16 — les ellipses sombres, quasi
        // invisibles sous la trame pleine, ressortaient en « plaques grises »
        // depuis que la trame terre est dosée. Retour Raph : les retirer.)
        if (PR) PR.flat += performance.now() - tF;
      }
      // `texAlpha > 0` : à 0 le blit ne peindrait rien mais coûterait plein pot.
      // Le MIROIR était refusé au parvis tant qu'il empruntait iso-plaza : le flip
      // un coup sur deux cassait NET au bord de cellule, parce que le motif était
      // un objet centré (quatre grandes dalles) dont le miroir déplaçait le
      // liseré. Rendu à sa propre matière — une texture continue de petits
      // carreaux, cf. WONDER_GROUND — le parvis reprend le miroir comme toutes
      // les autres : c'est lui qui casse la répétition des 3 variantes.
      if (tileReady && texAlpha > 0) {
        const tT = PR && performance.now();
        // Herbe : aplat d'OMBRE sous la tuile — ses creux (noFill) doivent lire
        // sombre, pas laisser voir le fond olive du bake. Uniforme (aucune
        // valeur par cellule), même geste anti-couture que l'aplat urbain.
        if (kind === 'grass') {
          ctx.fillStyle = rgb(CM.season === WINTER ? GRASS_TILE_UNDER_WINTER : GRASS_TILE_UNDER, 1);
          diamondPath(ctx, p.x, p.y, hw, hh);
          ctx.fill();
          ctx.strokeStyle = ctx.fillStyle;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        if (texAlpha < 1) ctx.globalAlpha = texAlpha;
        blitIsoTileKey(ctx, keyOfKind(kind), p.x, p.y, hw, mir, cellH);
        if (texAlpha < 1) ctx.globalAlpha = 1;
        if (PR) PR.tiles += performance.now() - tT;
      }
      // Herbe : variation de prairie + tapis vivant (touffes/speckle/fleurs) PAR-DESSUS
      // la base. La variation est INDÉPENDANTE de la grille (fini la couture dure
      // in-grid↔sauvage révélée en calmant la tuile) : plaques douces via un hash de
      // bloc ~4 cellules, biaisé clair (nz²) → alpha faible, pas de bord franc.
      if (kind === 'grass' && !HARD) {
        const tG = PR && performance.now();
        // PRÉS (meadow) : plaques lentes foncé/clair par bruit LISSÉ — aucune
        // couture (ni maillage par cellule ni bord de bloc). Foncé = herbe
        // grasse, clair = herbe sèche. __grassDetail({ meadow: 0 }) pour couper.
        // Les deux voiles ne sont PAS peints ici : un fill de losange par cellule
        // d'herbe (jusqu'à 2 × ~9 000) pesait 57 % de la recuisson. On les REMISE
        // par PALIER D'ALPHA (cf. veilBuckets) → une poignée de fills d'union en
        // fin de passe, même rendu (losanges disjoints, alpha quantifié au 1/256
        // — sous le seuil perceptible sur un voile à alpha ≤ 0,1).
        if (GRASS_DETAIL.meadow > 0) {
          const nzm = smoothNoise(gx, gy, 6, 'mead2') - 0.5;
          const am = Math.abs(nzm) * GRASS_DETAIL.meadow;
          // Seuil sur `am` pour les DEUX (le clair sortait déjà à am*0.8) : gate inchangé.
          if (am > 0.012) veilPush(nzm < 0 ? 0 : 1, nzm < 0 ? am : am * 0.8, p.x, p.y);
        }
        if (GRASS_DETAIL.wildShade > 0) {
          const nz = (cmHash('mead:' + (gx >> 2) + ':' + (gy >> 2)) % 100) / 100;
          const a = GRASS_DETAIL.wildShade * nz * nz;
          if (a > 0.015) veilPush(2, a, p.x, p.y);
        }
        // Le tapis vivant (touffes/speckle/fleurs) reste réservé au bake PLEIN :
        // c'est le poste cher de l'herbe — le light garde prés et ombrage.
        if (GRASS_DETAIL.on && !LOD) grassCells.push(gx, gy, p.x, p.y);   // fleurs après les voiles
        if (PR) PR.grass += performance.now() - tG;
      }
      // Sol urbain : tuile PixelLab de l'ère (par-dessus l'aplat, miroir anti-répétition)
      // si le PNG est prêt ; sinon repli sur le motif procédural (joints/cailloux).
      // TERRE BATTUE : la tuile posée PLEINE sur chaque cellule tapissait la ville
      // d'une trame de cailloux répétée — on la DOSE en alpha (tileA), CONSTANT
      // par défaut (retour Raph 2026-07-20 : « continu et pas haché » — les
      // plaques par bruit lissé lisaient comme des tas de terre épars).
      if (kind === 'urban' && URBAN_DETAIL.on && !HARD) {
        let drew = false;
        if (URBAN_DETAIL.tiles && mat.tile) {
          // S2 : la dose vaut pour TOUTES les matières, plus seulement la terre.
          // À 1 (défaut de tous les types sauf terre) on repasse à l'identique
          // par le chemin d'origine — aucun globalAlpha posé, aucun coût.
          const ta = urbanTileAlpha(mat.type);
          const jit = mat.type === 'earth' && URBAN_DETAIL.tileJit
            ? smoothNoise(gx, gy, 4, 'peb') * URBAN_DETAIL.tileJit : 0;
          if (ta < 1 || jit) {
            // tileJit reste un knob : s'il est ≠ 0, la modulation repasse par le
            // bruit LISSÉ (voisines quasi égales → jamais de damier par cellule).
            ctx.globalAlpha = Math.min(1, ta + jit);
            drew = blitIsoTileKey(ctx, mat.tile, p.x, p.y, hw, mir, cellH);
            ctx.globalAlpha = 1;
          } else {
            drew = blitIsoTileKey(ctx, mat.tile, p.x, p.y, hw, mir, cellH);
          }
        }
        if (!drew) drawUrbanDetail(ctx, gx, gy, p.x, p.y, hw, hh, mat);
      }
      // VOILE DE NUANCE (sols urbain/terre) : plaques lentes foncé/clair par
      // bruit lissé, PAR-DESSUS aplat ET trame (sous une tuile opaque il serait
      // invisible) — la grande nappe de terre n'est plus un aplat monotone.
      // __groundMat({ noiseAmp: 0 }) pour couper.
      if ((kind === 'urban' || kind === 'dirt') && URBAN_DETAIL.noiseAmp > 0 && !HARD) {
        const nzv = smoothNoise(gx, gy, 5, 'veil') - 0.5;
        const av = Math.abs(nzv) * URBAN_DETAIL.noiseAmp;
        if (av > 0.012) {
          ctx.fillStyle = nzv < 0 ? `rgba(52,40,26,${av.toFixed(3)})` : `rgba(255,240,212,${(av * 0.85).toFixed(3)})`;
          diamondPath(ctx, p.x, p.y, hw, hh);
          ctx.fill();
        }
      }
      // Parvis : dallage + margelle DIFFÉRÉS après le fond, même raison que la
      // frange d'herbe — les deux mordent sur des arêtes partagées, et la cellule
      // voisine peinte plus tard repasse son liseré anti-couture dessus. Tracés
      // dans la boucle, la moitié des joints internes survivait selon l'ordre de
      // balayage (une lacune qui se lit comme un défaut de dallage).
      if (kind === 'wonder') wonderCells.push(gx, gy, p.x, p.y);
      // Frange d'herbe : mémorise chaque arête sol↔herbe de cette cellule — la
      // frange se dessine APRÈS le fond (elle mord sur des voisins déjà peints,
      // quel que soit l'ordre de balayage). Sols urbain/terre seulement : les
      // dallages formels (place, parvis) gardent leur bord franc voulu.
      if (GRASS_FRINGE.on && !LOD && (kind === 'urban' || kind === 'dirt')) {
        const inL = 1 / Math.hypot(hw, hh);          // vecteur rentrant normalisé (±hw,±hh)
        const ixn = hw * inL, iyn = hh * inL;
        // wx0/wy0→wx1/wy1 : les deux bouts de l'arête en coordonnées MONDE (en
        // cellules). Le mode 'wander' échantillonne son bruit là-dessus, jamais
        // sur la cellule ni sur l'indice du pas : c'est ce qui rend le bord
        // continu d'un losange au suivant au lieu de casser à chaque coin.
        if (grassAt(gx, gy - 1)) fringes.push({ ax: p.x, ay: p.y, bx: p.x + hw, by: p.y + hh, inx: -ixn, iny: iyn, seed: 'gfr:n:' + key, wx0: gx, wy0: gy, wx1: gx + 1, wy1: gy });
        if (grassAt(gx + 1, gy)) fringes.push({ ax: p.x + hw, ay: p.y + hh, bx: p.x, by: p.y + hh * 2, inx: -ixn, iny: -iyn, seed: 'gfr:e:' + key, wx0: gx + 1, wy0: gy, wx1: gx + 1, wy1: gy + 1 });
        if (grassAt(gx, gy + 1)) fringes.push({ ax: p.x - hw, ay: p.y + hh, bx: p.x, by: p.y + hh * 2, inx: ixn, iny: -iyn, seed: 'gfr:s:' + key, wx0: gx, wy0: gy + 1, wx1: gx + 1, wy1: gy + 1 });
        if (grassAt(gx - 1, gy)) fringes.push({ ax: p.x, ay: p.y, bx: p.x - hw, by: p.y + hh, inx: ixn, iny: iyn, seed: 'gfr:w:' + key, wx0: gx, wy0: gy, wx1: gx, wy1: gy + 1 });
      }
      // Les cellules-PONT ne reçoivent ni fond ni ruban ici : leur tablier est
      // dessiné APRÈS le fleuve (drawIsoBridges), au-dessus de l'eau. Le PARVIS
      // non plus : ses routes sont carvées par le plan — le garde ne couvre que la
      // frame transitoire entre __showWonder et le recalcul du layout.
      if (isRoad && !isPlaza && !isBridge && !isWater && !(wg && wg.has(key))) roads.push({ gx, gy, cell });
    }
  }
  if (PR) PR.cells = performance.now() - tLoop;
  // PARVIS : tout le dallage, PUIS toute la margelle. L'ordre compte — la margelle
  // encadre le parvis et doit rester au-dessus des joints, comme avant.
  if (wonderCells.length) {
    for (let i = 0; i < wonderCells.length; i += 4) {
      drawWonderPaving(ctx, wonderCells[i], wonderCells[i + 1], wonderCells[i + 2], wonderCells[i + 3], hw, hh);
    }
    for (let i = 0; i < wonderCells.length; i += 4) {
      drawWonderGroundDetail(ctx, wonderCells[i], wonderCells[i + 1], wonderCells[i + 2], wonderCells[i + 3], hw, hh, wg);
    }
  }
  // Voiles d'herbe puis FLEURS : même ordre qu'avant (voile sous fleur), mais en
  // fills d'union groupés. Les motifs de drawGrassDetail tiennent dans leur
  // cellule → « tous les voiles puis toutes les fleurs » == l'entrelacé par cellule.
  const tV = PR && performance.now();
  flushVeils();
  // Les touffes de drawGrassDetail sont des SPRITES agrandis au pixel d'art :
  // lissage coupé une fois pour toute la passe (le poser par cellule coûterait
  // des centaines d'écritures de propriété pour le même résultat).
  const prevGDS = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  for (let i = 0; i < grassCells.length; i += 4) {
    drawGrassDetail(ctx, grassCells[i], grassCells[i + 1], grassCells[i + 2], grassCells[i + 3], hw, hh);
  }
  ctx.imageSmoothingEnabled = prevGDS;
  if (PR) PR.grass += performance.now() - tV;
  // FRANGE D'HERBE : après le fond (les langues mordent sur des cellules déjà
  // peintes), AVANT les rubans de chaussée (la route recouvre ce qui la borde).
  if (fringes.length) {
    const tFr = PR && performance.now();
    const puF = Math.max(1, Math.round(hw * 0.055));
    // urb = teinte du sol de l'ère : le mode 'wander' repeint avec elle quand le
    // bord se déplace vers l'herbe (aucune couleur nouvelle n'est introduite).
    for (const f of fringes) drawGrassFringeEdge(ctx, f, puF, urb);
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
  // Terre-plein PLANTÉ des boulevards 2-cellules (couture L.terrePlein), façon
  // PLACE : le bake ne porte que le SOL — capsule d'herbe à bouts ronds (prolongée
  // de MEDIAN_TUNE.ext dans les carrefours), ombre portée bas-droite (lumière
  // haut-gauche), liseré de pierre, touffes et fleurs. Les BUISSONS (relief) sont
  // des items du peintre par-dessus, cf. drawIsoLive. La bande sprite 3-slice a
  // été RETIRÉE (« rendu étiré, peu de relief », Raph 2026-08-03).
  const tMd = PR && performance.now();
  const tp = L.terrePlein;
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
  if (PR) {
    PR.median = performance.now() - tMd;
    PR.total = performance.now() - PR.t0;
    delete PR.t0;
    globalThis.__isoGroundProfileLast = PR;
  }
  ctx.restore();
  return true;
}

// ── POINTS D'EAU (ex-aqueducs) ──────────────────────────────────────────────
// 🚫 L'AQUEDUC-STRUCTURE A ÉTÉ RETIRÉ le 2026-08-05, ART COMPRIS. Vivait ici un
// rendu 3-slice (start → mid ×N → end, posé par cisaillement sur l'axe long,
// une tranche par tuile pour le tri peintre) alimenté par 4 stades de PNG.
// Motif : la conduite longeait la berge et puisait dans le fleuve d'à côté
// (« ça n'est pas logique »), et son art avait déjà été refusé 5 fois. Le pavé
// qui fait foi est celui de cmWaterPointCount, dans layout.js — le lire avant
// toute tentative de résurrection.
//
// Le bâtiment se lit désormais en POINTS D'EAU semés dans la ville, et on ne
// dessine RIEN ici : chacun devient un item `plazaProp`, donc c'est le KIT DES
// PLACES qui s'en charge (même art, même ancrage sur l'ENCRE mesurée, même
// ombre douce, même découpe des halos). Un item par point → chacun trie à SA
// profondeur, sans le moindre cas particulier dans le peintre.
//
// L'objet est un PUITS et non une fontaine : la fontaine est la pièce maîtresse
// de la place, la banaliser en la semant partout lui ferait perdre son rang. En
// attendant l'art dédié, LEGACY_PROP fait retomber le puits sur la fontaine du
// kit top-down (cf. isoPlaza.js), era-correcte dans les 5 ères.
//
// Ère : même échelle que les places, PLUS un cran primitif — les places
// n'existent qu'à partir du band 2, mais les aqueducs s'achètent dès le début.
const waterPointEra = (band) => (band >= 7 ? 'cosmic' : band >= 6 ? 'modern'
  : band >= 5 ? 'industrial' : band >= 4 ? 'medieval' : band >= 2 ? 'antique' : 'primitive');
// Hauteur en `p` = MULTIPLES DE LA HAUTEUR D'UN HABITANT, exactement comme le
// mobilier des places — et surtout PAS en tuiles. C'est la règle du kit : ancré
// sur autre chose, un prop ne suit plus quand l'échelle des habitants bouge, et
// la ville se met à enfler à vue d'œil. Repère : l'habitant ≈ 1,70 m, donc 1.15
// ≈ 1,95 m — un puits couvert dont la margelle arrive à la taille.
// 📏 TOUJOURS SOUS LA FONTAINE DE PLACE, qui va de 1.25 à 2.60 p. C'est ce qui
//    garde la hiérarchie : la fontaine est la pièce maîtresse du forum, le puits
//    est un point d'eau de quartier. Les rapprocher les banaliserait tous les deux.
// ⚠ `p` cote l'ENCRE ENTIÈRE du sprite, pas l'objet qu'on a en tête. Le puits
// primitif porte un CHEVALET : son encre monte bien plus haut que sa margelle, et
// le coter comme une margelle l'écraserait au ras du sol. La règle qui a servi ici,
// et la seule à réappliquer si l'art change : `p` = hauteur RÉELLE de l'objet en
// mètres ÷ 1,70. Chaque valeur ci-dessous vient de la silhouette effectivement
// livrée, pas d'une intention.
// 🚫 La suite n'est PAS croissante, et c'est voulu : ce ne sont pas six états d'un
//    même objet qui grandirait, mais six objets différents. Une borne à boire
//    moderne EST plus basse qu'un chevalet de puits médiéval. (C'est la fontaine de
//    place, elle, qui doit croître strictement — cf. RECIPES dans isoPlaza.)
const WATER_POINT_P = {
  primitive: 1.15,    // chevalet : deux montants + traverse       ≈ 1,95 m
  antique: 0.68,      // bassin de rue + pilier à bec              ≈ 1,15 m
  medieval: 0.85,     // margelle + treuil sur montants courts     ≈ 1,45 m
  industrial: 0.94,   // colonne de pompe en fonte sur son socle   ≈ 1,60 m
  modern: 0.62,       // borne à boire, hauteur de taille          ≈ 1,05 m
  cosmic: 0.76,       // monolithe + vasque basse                  ≈ 1,30 m
};
// Pose un art iso « AU SOL » : le CONTENU opaque est mis à targetW px de large
// et le COIN BAS de son losange de base tombe un quart sous (px, py) = centre
// du losange visé. Corrige les décalages « ancienne dalle qui dépasse » (Raph) :
// on cale la GÉOMÉTRIE MESURÉE du PNG, pas le canvas brut.
function drawIsoGroundedArt(ctx, e, px, py, targetW) {
  if (!e.bbox) {
    const bpx = isoTileBBox(e.img);
    const w = e.img.naturalWidth || 1, h = e.img.naturalHeight || 1;
    e.bbox = bpx ? { x0f: bpx.x0 / w, y0f: bpx.y0 / h, wf: bpx.w / w, hf: bpx.h / h } : { x0f: 0, y0f: 0, wf: 1, hf: 1 };
  }
  const bb = e.bbox;
  const imgW = e.img.naturalWidth || 1, imgH = e.img.naturalHeight || 1;
  // ⚠ canvases NON carrés depuis la normalisation (normalizeIsoScenes) :
  // la hauteur suit l'ASPECT NATUREL, plus jamais boxH = boxW.
  const boxW = targetW / (bb.wf || 1), boxH = boxW * (imgH / imgW);
  const cxf = bb.x0f + bb.wf / 2, cbf = bb.y0f + bb.hf;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  const dx = px - boxW * cxf, dy = py + targetW / 4 - boxH * cbf;
  ctx.drawImage(e.img, dx, dy, boxW, boxH);
  ctx.imageSmoothingEnabled = prev;
  lightCutImage(e.img, dx, dy, boxW, boxH);   // masque les halos déposés derrière (lightLayer.js)
  // Géométrie du draw (px écran) : permet de re-projeter un OVERLAY calé sur
  // les pixels source (eau de fontaine animée des places).
  return { x: dx, y: dy, w: boxW, h: boxH };
}
// Arbres pixel iso : tree-1..tree-N (feuillus + conifères, choisis par hash).
// (Des feuillus du pack Cainos ont été essayés en variantes 5-7 le 2026-07-22 puis
// RETIRÉS — « je n'aime pas les arbres », Raph. Ne pas re-proposer.)
const ISO_TREE_VARIANTS = 4;
// Buissons DÉDIÉS bush-1..N (pack Cainos, cf. scripts/sliceCainosPlants.mjs),
// rangés du plus petit au plus grand. Avant, un « buisson » de terre-plein était
// un feuillu rapetissé — donc un tronc d'arbre miniature. Repli sur tree-N si le
// PNG manque (cf. les sprites absents du .exe hors ligne : un art absent ne doit
// rien effacer).
const ISO_BUSH_VARIANTS = 6;
// Végétation de l'île (cf. son bloc dans drawIsoLive). `rMin/rMax` sont des rayons
// NORMALISÉS de l'ellipse : le tiers central est laissé à la merveille.
// Molette : window.__islandDeco.
export const ISLAND_DECO = { on: true, count: 9, rMin: 0.5, rMax: 0.88, size: 0.3 };
if (typeof window !== 'undefined') window.__islandDeco = ISLAND_DECO;


// ── PLACE ───────────────────────────────────────────────────────────────────
// `isoPlazaBox` (composante connexe de la dalle) et `plazaEraForBand` ont
// DÉMÉNAGÉ dans isoPlaza.js : la place composée et l'ancienne scène doivent
// lire la MÊME emprise et la MÊME ère, une copie ici les ferait diverger.
// Ce qui reste ci-dessous ne sert qu'au mode 'scene' (__plaza({mode:'scene'})),
// gardé comme référence d'A/B : la scène par ère validée le 2026-07-12
// (fontaine monumentale + parterres + bancs, UNE image posée sur la dalle).
// ── FONTAINE ANIMÉE : l'eau de la scène de place, bakée en strip 8 frames
// (/pixelart/iso/anim/plaza-fountain-<ère>.png, scripts/fetchFountainAnims.mjs)
// et blittée PAR-DESSUS la scène à l'emplacement exact du crop source. Hors
// eau, chaque frame est VERROUILLÉE sur les pixels de la scène → zéro couture,
// zéro wobble ; le repli (strip absent) est simplement la scène statique.
// Rects en px de la scène SOURCE — miroir exact de FOUNTAIN du script.
// FA_V : version de cache des strips (à incrémenter à chaque réécriture des
// PNG, le cache HTTP ressert sinon l'ancienne version — leçon aqueducs).
const FA_V = 2;
const FOUNTAIN_ANIM = {
  antique: { x: 100, y: 4, w: 108, h: 116 },
  medieval: { x: 110, y: 8, w: 126, h: 128 },
  industrial: { x: 108, y: 26, w: 116, h: 104 },
  modern: { x: 116, y: 26, w: 124, h: 100 },
  cosmic: { x: 92, y: 0, w: 110, h: 128 },
};
// Molette : __fountainAnim({ on, ms }) — ms = durée d'une frame.
// 240 ms (≈4 fps, cycle 1.5-2 s) : à 120 les ondulations « allaient trop
// vite » (retour Raph) ; l'eau de fontaine doit rester paisible.
const FOUNTAIN_TUNE = { on: true, ms: 240 };
if (typeof window !== 'undefined') {
  window.__fountainAnim = (o) => { if (o) Object.assign(FOUNTAIN_TUNE, o); return { ...FOUNTAIN_TUNE }; };
}



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
function isoLamps(L, band) {
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
const streetPropEra = (band) => plazaEraForBand(band);
function isoStreetPropsFor(L, band) {
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
const lampEraForBand = (band) => (band >= 7 ? 'energy' : band >= 6 ? 'electric' : band >= 4 ? 'gas' : 'antique');
// v3 = antique & gas refaits en VRAI 3/4 iso high top-down 64×128 (les v2 étaient
// vus DE FACE, retour Raph 2026-07-13) ; electric/energy v2 gardés (mâts ronds,
// invariants à l'angle). Cache-buster : ces PNG sont RÉÉCRITS sur disque → sans
// query, des navigateurs resservent l'ancien depuis le cache HTTP. Incrémenter
// à chaque réécriture.
const LAMP_V = 3;
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
const LAMP_TUNE = { h: 0.8, headF: 0.8, curb: 0.05, step: 3, paths: false };
if (typeof window !== 'undefined') {
  window.__lampTune = (o) => {
    if (o) Object.assign(LAMP_TUNE, o);
    _isoLampCache = { at: -1, key: '', lamps: null };   // step/paths repeuplent la liste
    return { ...LAMP_TUNE };
  };
}
// Métriques de pied mémoïsées par sprite (fractions du canvas) — même idiome
// canvas-scan que isoTileBBox, plus le centre de masse des 4 rangées basses.
function lampFootMetrics(e) {
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
const MEDIAN_TUNE = { ext: -0.05 };
if (typeof window !== 'undefined') {
  window.__medianExt = (v) => { if (typeof v === 'number') MEDIAN_TUNE.ext = v; return MEDIAN_TUNE.ext; };
}
// Palettes de PARTERRES du terre-plein (réfs municipales de Raph 2026-08-03) :
// massifs à DOMINANTE (jaune/orange, rouge/rose, lavande, mix) + blanc d'accent,
// tirés par hash de slot — deux parterres voisins n'ont pas la même robe.
const BED_PALETTES = [
  [[244, 216, 102], [232, 168, 72], [240, 242, 228]],   // jaune / orange
  [[224, 104, 96], [236, 152, 178], [240, 242, 228]],   // rouge / rose
  [[184, 148, 216], [150, 132, 220], [240, 242, 228]],  // lavande / violet
  [[244, 216, 102], [224, 104, 96], [184, 148, 216]],   // mix vif
];
// Slots décoratifs du terre-plein : PARTERRE (dessiné au bake) et BUISSON (item
// du peintre) alternés le long de la couture, période fixe. Les deux passes
// lisent CETTE liste — même géométrie, même hash, zéro chevauchement.
function medianSlots(seg, T) {
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
function addGlow(ctx, x, y, r, col, alpha) {
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

function drawIsoNight(now) {
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
function isoLampLightFrame(L) {
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
const lampLit = (lp, K) => K.stride <= 1 || ((cmHash('lmpcap:' + lp.gx + ':' + lp.gy) >>> 0) % K.stride) === 0;

// Emprise ÉCRAN, généreuse, de la lumière d'un mât : nappe de tête, flaque au
// sol et cœurs réunis. Elle décide quels sprites paieront une découpe — la
// majorer coûte quelques découpes de plus, la minorer laisserait de la lumière
// traverser un mur.
function lampGlowBox(p, K) {
  const R = K.unit * 1.05;
  return { x0: p.x - K.wpx - R, y0: p.y - K.hpx * K.m.footYf - R, x1: p.x + K.wpx + R, y1: p.y + R * 0.6 };
}

// Peint le halo d'UN mât sur `pctx` (composite additif déjà posé).
function paintLampGlow(pctx, lp, p, K, now) {
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

// ── PARTICULES D'AMBIANCE (feuilles / lucioles / motes d'énergie) ────────────
// Champ PROCÉDURAL SANS ÉTAT : chaque particule a une position = fonction PURE de
// (now, graine) → aucun tableau qui gonfle, bouclage sans couture, et captures
// REPRODUCTIBLES (même now → même image). Ancré sur la végétation (arbres déco +
// forêt sauvage). Par ère : feuilles qui tombent (jour) + lucioles (nuit) ; à
// l'ère cosmique (band ≥ 7) elles cèdent la place à des MOTES d'énergie montantes.
const AMBIENT = { on: true, leaves: 1, sparks: 1 };
if (typeof window !== 'undefined') {
  window.__ambient = (o) => { if (o) Object.assign(AMBIENT, o); return { ...AMBIENT }; };
}
// Palette de feuilles mortes (ambre/or/rouille + deux verts qui traînent).
const LEAF_COLS = ['196,120,45', '214,158,58', '170,86,38', '150,120,50', '120,150,60'];
// Ancres de végétation visibles (base monde + rayon + graine), plafonnées. Mémoïsé
// par (layout, bornes) : ne se reconstruit qu'au changement de cadrage/plan.
function isoVegAnchors(L, b) {
  const cache = CM._vegAnchors;
  const sig = (CM.layoutRecomputeAt || 0) + ':' + (L.gridN | 0) + ':' + (L.mapSeed || 0)
    + ':' + b.gx0 + ':' + b.gy0 + ':' + b.gx1 + ':' + b.gy1;
  if (cache && cache.sig === sig) return cache.list;
  const T = CM.TILE, list = [];
  const push = (gx, gy, jx, jy, r) => {
    if (gx < b.gx0 || gx > b.gx1 || gy < b.gy0 || gy > b.gy1) return;
    if (list.length >= 260) return;                 // garde-fou perf
    list.push({ wx: (gx + 0.5 + jx) * T, wy: (gy + 0.9 + jy) * T, r: r || 0.7, s: (cmHash('veg:' + gx + ':' + gy) >>> 0) });
  };
  for (const tr of (L.trees || [])) push(tr.gx, tr.gy, 0, 0, tr.r);
  for (const wt of isoVegForestSample(L, b)) push(wt.gx, wt.gy, wt.jx || 0, wt.jy || 0, wt.r);
  CM._vegAnchors = { sig, list };
  return list;
}
// Sous-échantillon de la forêt (1 arbre sur 2) : assez d'ancres pour la vie, sans
// noyer l'écran ni le coût (la forêt peut compter des centaines d'arbres).
function isoVegForestSample(L, b) {
  const full = isoWildForest(L, b);
  if (full.length <= 130) return full;
  const out = [];
  for (let i = 0; i < full.length; i += 2) out.push(full[i]);
  return out;
}

function drawIsoAmbient(now) {
  const L = CM.layout;
  if (!L || CM.lodActive || !AMBIENT.on) return;    // pas de particules en vue d'ensemble
  // Vie de la carte (option joueur) : on retire des ANCRES entières, on ne rend
  // pas toutes les particules translucides — une pluie de fantômes est plus
  // fatigante que moins de feuilles, et le contraste de l'image reste intact.
  const ambK = CM.ambianceK ?? 1;
  if (ambK <= 0) return;
  const thin = (a) => ambK >= 1 || (a.s % 1000) / 1000 < ambK;
  const ctx = CM.ctx, T = CM.TILE, z = CM.cam.zoom;
  const band = (L.counts && L.counts.eraBand) | 0;
  const n = CM.nightF || 0;
  const cosmic = band >= 7;
  const b = visibleCellBounds(T * z);
  const anchors = isoVegAnchors(L, b);
  if (!anchors.length) return;
  const t = now || 0;
  const fleck = Math.max(1, Math.round(T * z * 0.05));   // taille d'une feuille (px écran)

  // ── FEUILLES (ères pré-cosmiques, surtout de JOUR) : chute + tangage, fondu aux
  //    deux bouts (naît sous la canopée, disparaît au sol → pas de pop).
  if (!cosmic && AMBIENT.leaves > 0) {
    // BUDGET DE MOUVEMENT : l'œil ne suit que quelques choses à la fois. Quand
    // une nuée traverse, elle prend la vedette et les feuilles s'effacent un peu,
    // sinon les deux couches se concurrencent et l'image devient agitée.
    const leafK = CM._birdsOn ? 0.55 : 1;
    const dayDim = (1 - 0.65 * n) * leafK;               // s'effacent la nuit
    if (dayDim > 0.05) {
      const prevAA = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
      for (const a of anchors) {
        if ((a.s % 2) !== 0) continue;                   // ~1 arbre sur 2 perd des feuilles
        if (!thin(a)) continue;
        const p = worldToScreen(a.wx, a.wy);
        const th = T * z * treeCanvasT(a.r);             // hauteur du sprite d'arbre (suit l'ère)
        const topY = p.y - th * 0.78, canW = th * 0.42, fall = th * 1.25;   // tombe JUSQU'AU SOL
        for (let i = 0; i < 2; i += 1) {
          const sd = _rnd(a.s, i), sd2 = _rnd(a.s, i + 9);
          const ph = _frac(t / (3800 + sd * 3200) + sd);
          const fade = Math.sin(ph * Math.PI);
          if (fade < 0.06) continue;
          const ly = topY + ph * fall;
          // dérive latérale NETTE (s'éloigne du tronc en tombant) + léger tangage :
          // la feuille quitte la canopée et se lit sur le sol, pas noyée dans le feuillage.
          const drift = (sd2 < 0.5 ? -1 : 1) * ph * canW * 0.9;
          const lx = p.x + (sd - 0.5) * canW * 0.5 + drift + Math.sin(ph * Math.PI * 3 + sd2 * 6.28) * canW * 0.32;
          ctx.fillStyle = `rgba(${LEAF_COLS[(a.s + i) % LEAF_COLS.length]},${(fade * dayDim * AMBIENT.leaves * 0.9).toFixed(3)})`;
          const tumble = _frac(ph * 5) < 0.5;             // bascule 1×2 / 2×1 → chute qui vrille
          ctx.fillRect(Math.round(lx - fleck / 2), Math.round(ly - fleck / 2),
            tumble ? fleck : Math.max(1, Math.round(fleck * 0.6)),
            tumble ? Math.max(1, Math.round(fleck * 0.6)) : fleck);
        }
      }
      ctx.imageSmoothingEnabled = prevAA;
    }
  }

  // ── LUCIOLES (nuit, ères pré-cosmiques) & MOTES D'ÉNERGIE (cosmique, jour+nuit) :
  //    glows additifs. Lucioles = errance en Lissajous + clignotement ; motes = montée.
  const sparksNight = !cosmic && n > 0.18;
  if ((cosmic || sparksNight) && AMBIENT.sparks > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const a of anchors) {
      if (!thin(a)) continue;
      const p = worldToScreen(a.wx, a.wy);
      const th = T * z * treeCanvasT(a.r);
      if (cosmic) {
        if ((a.s % 3) !== 0) continue;                   // ~1/3 des ancres
        for (let i = 0; i < 2; i += 1) {
          const sd = _rnd(a.s, i + 5), sd2 = _rnd(a.s, i + 21);
          const ph = _frac(t / (5000 + sd * 4000) + sd);
          const fade = Math.sin(ph * Math.PI);
          if (fade < 0.05) continue;
          const my = (p.y - th * 0.1) - ph * th * 1.1;   // monte
          const mx = p.x + (sd - 0.5) * th * 0.4 + Math.sin(ph * Math.PI * 2 + sd2 * 6.28) * th * 0.15;
          const col = (a.s + i) & 1 ? '150,230,255' : '200,160,255';   // cyan / magenta
          addGlow(ctx, mx, my, Math.max(2, T * z * 0.09) * (0.8 + 0.4 * fade), col, Math.min(0.7, fade * AMBIENT.sparks * 0.7));
          ctx.fillStyle = `rgba(235,250,255,${(fade * AMBIENT.sparks * 0.85).toFixed(3)})`;
          ctx.fillRect(Math.round(mx), Math.round(my), 1, 1);
        }
      } else {
        if ((a.s % 3) !== 1) continue;                   // ~1/3 des ancres
        const hoverY = p.y - th * 0.4, rx = th * 0.32, ry = th * 0.24;
        for (let i = 0; i < 2; i += 1) {
          const sd = _rnd(a.s, i + 3), sd2 = _rnd(a.s, i + 17);
          const fx = p.x + Math.sin(t * (0.0007 + sd * 0.0006) + sd * 6.28) * rx;
          const fy = hoverY + Math.cos(t * (0.0009 + sd2 * 0.0006) + sd2 * 6.28) * ry;
          // clignotement DOUX (jamais tout à fait éteint) → une nuée qui scintille
          // en permanence, plus lisible qu'un allumage franc trop épars.
          const bl = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * (0.003 + sd * 0.003) + sd2 * 6.28));
          const a2 = bl * n * AMBIENT.sparks;
          if (a2 < 0.03) continue;
          addGlow(ctx, fx, fy, Math.max(3, T * z * 0.14), '190,235,130', Math.min(0.75, a2 * 0.72));
          ctx.fillStyle = `rgba(228,255,180,${(a2 * 0.9).toFixed(3)})`;
          ctx.fillRect(Math.round(fx), Math.round(fy), fleck > 2 ? 2 : 1, fleck > 2 ? 2 : 1);
        }
      }
    }
    ctx.restore();
  }
}

// ── PONT : tablier par ère au-dessus de l'eau (cellules roadSurface 'bridge') ─
// Matière par bande, calquée sur les 5 stades du pont pixel legacy
// (bois → pierre → fer → béton/énergie). Le tablier d'une voie s'étend jusqu'au
// bord mitoyen quand la voie JUMELLE est aussi un pont (double-voie dès band 2)
// → un seul tablier continu, garde-corps seulement sur les bords EXTÉRIEURS.
let _isoBridgeCache = { at: -1, cells: null };
function isoBridgeCells(L) {
  if (_isoBridgeCache.at === CM.layoutRecomputeAt && _isoBridgeCache.cells) return _isoBridgeCache.cells;
  const cells = [];
  for (const c of L.roadMap.values()) if (c.roadSurface === 'bridge') cells.push(c);
  _isoBridgeCache = { at: CM.layoutRecomputeAt, cells };
  return cells;
}
function bridgeTone(band) {
  return band >= 7 ? [104, 110, 128]
    : band >= 5 ? [92, 88, 86]
      : band >= 3 ? [132, 126, 112]
        : [126, 96, 58];
}
// Rejoue un rendu ÉCRAN LEGACY en iso : P_iso = A ∘ P_legacy, avec A l'affine
// écran autour du centre, de colonnes (ISO_X, ISO_Y) et (−ISO_X, ISO_Y). Tout
// art PLAT dessiné par le pipeline legacy (tablier de pont, terre-plein planté)
// se projette ainsi EXACTEMENT sur le plan du sol en losange — zéro re-art.
// ⚠ Réservé à l'art « à plat » : un décor avec verticalité bakée se coucherait.
function withLegacyToIso(ctx, fn) {
  ctx.save();
  ctx.translate(CM.cw / 2, CM.ch / 2);
  ctx.transform(ISO_X, ISO_Y, -ISO_X, ISO_Y, 0, 0);
  ctx.translate(-CM.cw / 2, -CM.ch / 2);
  const out = fn();
  ctx.restore();
  return out;
}

// Polygone MONDE (px) projeté puis rempli — quads non alignés aux axes
// (rampes d'accès des ponts, etc.).
function fillWorldPoly(ctx, pts) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i += 1) {
    const q = worldToScreen(pts[i][0], pts[i][1]);
    if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
  }
  ctx.closePath();
  ctx.fill();
}

// RAMPES D'ACCÈS (retour Raph : « la jonction pont/routes n'est pas fluide »).
// À chaque bout de travée, un trapèze en matière de CHAUSSÉE qui s'évase de la
// largeur du ruban de route vers la largeur du tablier — l'asphalte « monte »
// sur le pont et couvre la couture dure de la culée. Bordure sombre dessous,
// même grammaire que les rubans de rue. Dessiné APRÈS le tablier (pixel ou
// procédural), AVANT la passe vivante (les véhicules roulent dessus).
function drawBridgeAprons(ctx, band, T) {
  return;   // EMBOUTS RETIRÉS (Raph) : plus de rampe de raccord au début/sortie des ponts.
  /* eslint-disable no-unreachable -- corps CONSERVÉ pour référence (rampes retirées) ; réactivable si les embouts reviennent */
  const spans = CM.bridgeSpans;
  if (!spans || !spans.length) return;
  const road = roadTone(band);
  const wr = T * (ROAD_BAND + 0.05);           // demi-largeur du ruban (avec bordure)
  const deck = bridgeTone(band);
  // Rampe AFFINÉE (retour Raph « trop brute ») : DÉGRADÉ de matière
  // chaussée→tablier le long de l'axe (fini l'aplat qui tranchait), gabarit
  // réduit, fines bordures sombres sur les flancs (grammaire des rubans).
  const drawApron = (outer, inner, cOutL, cOutR, cInL, cInR) => {
    const p0 = worldToScreen(outer[0], outer[1]);   // milieu du bord côté route
    const p1 = worldToScreen(inner[0], inner[1]);   // milieu du bord côté tablier
    const gr = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
    gr.addColorStop(0, rgb(road, 0.95));
    gr.addColorStop(1, rgb(deck, 0.95));
    ctx.fillStyle = gr;
    fillWorldPoly(ctx, [cOutL, cInL, cInR, cOutR]);
    // bordures des flancs (liseré sombre fin)
    ctx.strokeStyle = 'rgba(20,20,24,0.4)';
    ctx.lineWidth = 1;
    const qa = worldToScreen(cOutL[0], cOutL[1]), qb = worldToScreen(cInL[0], cInL[1]);
    const qc = worldToScreen(cOutR[0], cOutR[1]), qd = worldToScreen(cInR[0], cInR[1]);
    ctx.beginPath(); ctx.moveTo(qa.x, qa.y); ctx.lineTo(qb.x, qb.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(qc.x, qc.y); ctx.lineTo(qd.x, qd.y); ctx.stroke();
  };
  // ⚠ Le tablier PIXEL s'étend jusqu'aux routes d'atterrissage (drawSpan
  // prolonge ses bornes aux exits) : la rampe se cale sur ces bornes
  // ÉTENDUES, sinon elle coupe le tablier en biais (vu à la capture).
  for (const sp of spans) {
    if (!sp.exits || !sp.exits.length) continue;
    if (!sp.vertical) {
      const cy = (sp.gy0 + (sp.gy1 - sp.gy0 + 1) / 2) * T;
      const wd = ((sp.gy1 - sp.gy0 + 1) / 2) * T * 0.5;    // demi-largeur de CHAUSSÉE du tablier
      const xs = sp.exits.map((r) => r.gx);
      const ex0 = Math.min(sp.gx0, ...xs), ex1 = Math.max(sp.gx1, ...xs) + 1;
      if (ex0 < sp.gx0) {
        const xo = (ex0 - 0.4) * T, xi = (ex0 + 0.6) * T;
        drawApron([xo, cy], [xi, cy], [xo, cy - wr], [xo, cy + wr], [xi, cy - wd], [xi, cy + wd]);
      }
      if (ex1 > sp.gx1 + 1) {
        const xo = (ex1 + 0.4) * T, xi = (ex1 - 0.6) * T;
        drawApron([xo, cy], [xi, cy], [xo, cy - wr], [xo, cy + wr], [xi, cy - wd], [xi, cy + wd]);
      }
    } else {
      const cx = (sp.gx0 + (sp.gx1 - sp.gx0 + 1) / 2) * T;
      const wd = ((sp.gx1 - sp.gx0 + 1) / 2) * T * 0.5;
      const ys = sp.exits.map((r) => r.gy);
      const ey0 = Math.min(sp.gy0, ...ys), ey1 = Math.max(sp.gy1, ...ys) + 1;
      if (ey0 < sp.gy0) {
        const yo = (ey0 - 0.4) * T, yi = (ey0 + 0.6) * T;
        drawApron([cx, yo], [cx, yi], [cx - wr, yo], [cx + wr, yo], [cx - wd, yi], [cx + wd, yi]);
      }
      if (ey1 > sp.gy1 + 1) {
        const yo = (ey1 + 0.4) * T, yi = (ey1 - 0.6) * T;
        drawApron([cx, yo], [cx, yi], [cx - wr, yo], [cx + wr, yo], [cx - wd, yi], [cx + wd, yi]);
      }
    }
  }
  /* eslint-enable no-unreachable */
}

function drawIsoBridges(now) {
  const L = CM.layout;
  const cells = isoBridgeCells(L);
  if (!cells.length) return;
  // PONT « 3/4 top-down » (chantier relancé 2026-07-16) : tablier dans le plan
  // du sol + verticalité ÉCRAN (face d'épaisseur, piles, parapets) — cf.
  // isoBridge.js. L'ombre se dessine AVANT les bateaux (drawIsoBridgeUnder,
  // cf. drawIsoWorld) ; TOUT LE RESTE (platelage compris) vit au tri peintre
  // (kind 'bridgeSeg') — plus rien à dessiner ici. A/B : __isoBridge3d(false)
  // rebranche les anciens chemins ci-dessous.
  if (isoBridge3dFlag.on) return;
  const T = CM.TILE, ctx = CM.ctx;
  const bandA = (L.counts && L.counts.eraBand) | 0;
  // PONTS (ancien chemin) : TABLIER PLAT PROJETÉ + rampes (décision Raph
  // 2026-07-12 : les sprites de pont complet, même normalisés en angle, gardent
  // leur PERSPECTIVE interne — re-tournés ils paraissent tordus ; « annule et
  // remet comme avant »). Les sprites bridge-full-* restent sur disque, débranchés.
  if (withLegacyToIso(ctx, () => drawPixelBridges(CM, now))) {
    drawBridgeAprons(ctx, bandA, T);
    return;
  }
  const band = (L.counts && L.counts.eraBand) | 0;
  const tone = bridgeTone(band);
  const isB = (x, y) => { const c = L.roadMap.get(x + ',' + y); return !!(c && c.roadSurface === 'bridge'); };
  const wD = 0.44, wR = 0.07;   // demi-largeur tablier / épaisseur garde-corps (fraction tuile)
  for (const b of cells) {
    const throughH = !!((b.mask & ROAD_E) && (b.mask & ROAD_W));
    const cx = (b.gx + 0.5) * T, cy = (b.gy + 0.5) * T;
    const v = 0.96 + ((cmHash('br:' + b.gx + ',' + b.gy) % 100) / 100) * 0.07;
    ctx.fillStyle = rgb(tone, v);
    if (throughH) {
      // voie jumelle au nord/sud → tablier étendu jusqu'à la couture, rail sauté.
      const twinN = isB(b.gx, b.gy - 1), twinS = isB(b.gx, b.gy + 1);
      const y0 = twinN ? b.gy * T : cy - T * wD, y1 = twinS ? (b.gy + 1) * T : cy + T * wD;
      fillWorldQuad(ctx, b.gx * T, y0, (b.gx + 1) * T, y1);
      ctx.fillStyle = rgb(tone, 0.55);
      if (!twinN) fillWorldQuad(ctx, b.gx * T, y0, (b.gx + 1) * T, y0 + T * wR);
      if (!twinS) fillWorldQuad(ctx, b.gx * T, y1 - T * wR, (b.gx + 1) * T, y1);
    } else {
      const twinW = isB(b.gx - 1, b.gy), twinE = isB(b.gx + 1, b.gy);
      const x0 = twinW ? b.gx * T : cx - T * wD, x1 = twinE ? (b.gx + 1) * T : cx + T * wD;
      fillWorldQuad(ctx, x0, b.gy * T, x1, (b.gy + 1) * T);
      ctx.fillStyle = rgb(tone, 0.55);
      if (!twinW) fillWorldQuad(ctx, x0, b.gy * T, x0 + T * wR, (b.gy + 1) * T);
      if (!twinE) fillWorldQuad(ctx, x1 - T * wR, b.gy * T, x1, (b.gy + 1) * T);
    }
  }
  drawBridgeAprons(ctx, band, T);
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

// ── CHAMP iso « façon TheoTown » : patchwork de parcelles cultivées ──────────
// Refonte du champ plat (retour Raph « améliore mes champs », réf TheoTown).
// L'emprise (losange) est PAVÉE de parcelles distinctes, séparées par des allées
// de terre : chacune tire une CULTURE (verts variés / blé doré / jachère brune)
// groupée en clusters 2×2 → parcelles voisines identiques (pas de damier bruité),
// puis porte des SILLONS iso-alignés (rangs diagonaux à l'écran) en corduroy —
// crête claire côté nord-ouest (lumière haut-gauche), vallée sombre côté sud-est.
// Palette + stades calqués sur la scène legacy (cityEngineSprites irrigated_fields)
// → DA cohérente ; 4 stades d'ère (rustique → hydroponie). 100 % espace-monde
// (parallélogrammes projetés) : aucune dépendance sprite, se pose même sur berge.
const FIELD_PAL = [
  { crop: [[74, 110, 42], [60, 94, 34], [90, 114, 50], [106, 122, 48]], ripe: [[154, 134, 54], [138, 122, 48]], fallow: [[106, 79, 44], [92, 69, 38]], fRoll: 4, rRoll: 2 },
  { crop: [[74, 124, 40], [60, 104, 32], [90, 138, 48], [111, 154, 56]], ripe: [[185, 162, 58], [200, 176, 72]], fallow: [[106, 79, 44]], fRoll: 2, rRoll: 3 },
  { crop: [[90, 138, 58], [74, 128, 48], [111, 154, 56], [127, 170, 66]], ripe: [[200, 176, 72], [212, 188, 82], [185, 162, 58]], fallow: [[106, 84, 48]], fRoll: 1, rRoll: 4 },
  { crop: [[63, 154, 85], [70, 168, 95], [82, 176, 106], [74, 168, 96]], ripe: [[127, 184, 74], [111, 176, 64]], fallow: [[58, 106, 82]], fRoll: 1, rRoll: 2 },
];
// Contraste des sillons par nature de parcelle : la jachère nue montre un fort
// corduroy labouré ; la culture verte, de fins rangs (plants) ; le blé mûr, des
// ondulations discrètes. liteW/darkW = largeur (fraction de période) de la crête
// éclairée puis de la vallée sombre ; sp = pas des rangs (tuiles).
const FIELD_FURROW = {
  fallow: { liteW: 0.34, lite: 1.16, darkW: 0.46, dark: 0.60, sp: 0.24 },
  crop: { liteW: 0.16, lite: 1.13, darkW: 0.30, dark: 0.80, sp: 0.26 },
  ripe: { liteW: 0.16, lite: 1.09, darkW: 0.20, dark: 0.86, sp: 0.30 },
};
function drawIsoField(ctx, t, spanX, spanY, band, eraIdx) {
  const T = CM.TILE, gx = t.gx, gy = t.gy;
  const stage = eraIdx < 10 ? 0 : eraIdx < 20 ? 1 : eraIdx < 30 ? 2 : 3;
  const PAL = FIELD_PAL[stage];
  const dirt = stage === 3 ? [98, 108, 116] : [118, 94, 60];   // béton clair / terre battue (allées)
  // Fond d'allées : losange d'emprise en terre — visible dans les marges entre parcelles.
  const q = (x0, y0, x1, y1) => fillWorldQuad(ctx, x0 * T, y0 * T, x1 * T, y1 * T);
  ctx.fillStyle = rgb(dirt, 0.92);
  q(gx, gy, gx + spanX, gy + spanY);
  // Grille de parcelles (~2 tuiles/parcelle, bornée pour le coût de rendu).
  const pcx = Math.max(1, Math.min(5, Math.round(spanX / 2)));
  const pcy = Math.max(1, Math.min(4, Math.round(spanY / 2)));
  const pwx = spanX / pcx, pwy = spanY / pcy;
  const marg = Math.min(0.11, pwx * 0.09, pwy * 0.09);         // allée de terre entre parcelles
  const fhash = (a, b) => ((Math.imul((a + 1) | 0, 73856093) ^ Math.imul((b + 1) | 0, 19349663) ^ Math.imul(stage + 1, 83492791)) >>> 0);
  for (let ri = 0; ri < pcy; ri++) {
    for (let ci = 0; ci < pcx; ci++) {
      const cl = fhash(ci >> 1, ri >> 1);         // cluster 2×2 → parcelles voisines identiques
      const cell = fhash(ci, ri);
      const roll = cl % 12;
      let base, kind;
      if (roll < PAL.fRoll) { base = PAL.fallow[cell % PAL.fallow.length]; kind = 'fallow'; }
      else if (roll < PAL.fRoll + PAL.rRoll) { base = PAL.ripe[(cell >> 2) % PAL.ripe.length]; kind = 'ripe'; }
      else { base = PAL.crop[(cell >> 2) % PAL.crop.length]; kind = 'crop'; }
      const jit = 0.93 + ((cell % 100) / 100) * 0.13;          // léger vibrato de teinte parcelle à parcelle
      const x0 = gx + ci * pwx + marg, x1 = gx + (ci + 1) * pwx - marg;
      const y0 = gy + ri * pwy + marg, y1 = gy + (ri + 1) * pwy - marg;
      ctx.fillStyle = rgb(base, jit);
      q(x0, y0, x1, y1);                                        // corps de parcelle
      // Sillons iso-alignés : sens (le long de X ou de Y) décidé par le cluster.
      const alongY = ((cl >> 4) & 1) === 1;                     // true → rangs à x constant
      const lo = alongY ? x0 : y0, hi = alongY ? x1 : y1;
      const fp = FIELD_FURROW[kind];
      const rows = Math.max(2, Math.round((hi - lo) / fp.sp));
      const period = (hi - lo) / rows;
      for (let k = 0; k < rows; k++) {
        const a = lo + k * period;                             // crête (NO, éclairée) puis vallée (SE, sombre)
        const lb = a + period * fp.liteW, db = Math.min(hi, lb + period * fp.darkW);
        if (alongY) {
          ctx.fillStyle = rgb(base, fp.lite); q(a, y0, lb, y1);
          ctx.fillStyle = rgb(base, fp.dark); q(lb, y0, db, y1);
        } else {
          ctx.fillStyle = rgb(base, fp.lite); q(x0, a, x1, lb);
          ctx.fillStyle = rgb(base, fp.dark); q(x0, lb, x1, db);
        }
      }
      // Relief de planche surélevée : liséré éclairé sur les 2 arêtes HAUTES (nord —
      // lumière haut-gauche) et ombre sur les 2 arêtes BASSES (sud) → chaque parcelle
      // se détache de l'allée et « bombe » légèrement.
      const lip = Math.min(0.05, (x1 - x0) * 0.12, (y1 - y0) * 0.12);
      ctx.fillStyle = rgb(base, 1.28); q(x0, y0, x1, y0 + lip); q(x0, y0, x0 + lip, y1);
      ctx.fillStyle = rgb(base, 0.52); q(x0, y1 - lip, x1, y1); q(x1 - lip, y0, x1, y1);
    }
  }
}

// ── FUMÉE DE CHEMINÉE (habitations) ─────────────────────────────────────────
// Les bâtiments-moteur fument déjà, mais depuis l'INTÉRIEUR de leurs sprites
// (cityEngineSprites, posés par drawIsoEngineScene) : leur fumée est donc déjà
// triée à la profondeur du bâtiment. Les habitations, elles, sont des PNG sans
// cheminée animée. On leur ajoute un item 'smoke' DANS le tri peintre, à la
// profondeur du bâtiment plus un epsilon : ainsi la colonne passe derrière le
// bâtiment situé au nord au lieu d'être collée en surcouche plein écran, ce qui
// détruirait l'illusion de profondeur que tout le reste du rendu paie cher.
// La fumée d'habitation LEGACY (buildingShapes/renderBuildings) est gardée par
// !usePixelHouse et n'est jamais atteinte en iso : ne pas passer par là.
// Molette : __smoke({ on, share, puffs, rise }).
const SMOKE_TUNE = { on: true, share: 7, puffs: 4, rise: 1 };
if (typeof window !== 'undefined') {
  window.__smoke = (o) => { if (o) Object.assign(SMOKE_TUNE, o); return { ...SMOKE_TUNE }; };
}

// Une cheminée ne fume que quand la scène le justifie : à la tombée du jour, la
// nuit, ou sous l'averse (il fait froid et humide). En plein midi dégagé, une
// ville entière qui fume est du bruit.
function smokeSeason() {
  const n = CM.nightF || 0, r = CM.rainF || 0;
  const k = Math.max(n > 0.2 ? (n - 0.2) / 0.5 : 0, r > 0.3 ? (r - 0.3) / 0.5 : 0);
  return Math.min(1, k);
}

function drawIsoSmoke(box, s, now, k) {
  if (!box) return;
  const ctx = CM.ctx, T = CM.TILE, z = CM.cam.zoom;
  // Source JUSTE AU-DESSUS du faîte, près de l'axe du sprite. On ne sait pas où
  // est la cheminée dans l'art (ce calibrage par variante reste à faire, cf. la
  // note des fenêtres allumées) : en partant au-dessus du toit plutôt que dessus,
  // la colonne se lit comme « de la fumée au-dessus de cette maison » et non
  // comme une bouffée qui sort du mauvais endroit.
  const ox = box.dx + box.dw * (0.42 + _rnd(s, 11) * 0.16);
  const oy = box.dy - T * z * 0.06;
  const rise = T * z * 1.5 * SMOKE_TUNE.rise;
  const wind = (CM.windX || 0) * 0.6 + 0.12;      // dérive par défaut quand il n'y a pas de vent
  const n = Math.max(1, Math.round(SMOKE_TUNE.puffs));
  const prevAA = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  for (let i = 0; i < n; i += 1) {
    const sd = _rnd(s, i + 20);
    const ph = _frac((now || 0) / (2600 + sd * 1800) + sd);
    // Naît dense et net, s'élargit et s'efface en montant : une bouffée qui
    // garderait sa taille lirait comme un sprite qui glisse.
    // Décroissance LINÉAIRE et non quadratique : au carré, la bouffée perdait
    // les trois quarts de son opacité sur le premier quart de sa montée et ne
    // se voyait plus du tout sur fond de nuit.
    const fade = (1 - ph) * 0.8 * k;
    if (fade < 0.02) continue;
    // Une bouffée naît à ~1/8 de tuile et triple en montant. Trop petite, elle
    // se confond avec le grain du sprite ; c'est l'écueil dans lequel sont
    // tombées les fenêtres allumées avant d'être retirées.
    const px = Math.max(2, Math.round(T * z * (0.12 + ph * 0.24)));
    const x = ox + wind * rise * ph + Math.sin(ph * 4 + sd * 6.28) * T * z * 0.06;
    const y = oy - ph * rise;
    ctx.fillStyle = `rgba(206,206,200,${fade.toFixed(3)})`;
    ctx.fillRect(Math.round(x - px / 2), Math.round(y - px / 2), px, px);
  }
  ctx.imageSmoothingEnabled = prevAA;
}

// ── CHEVRON « NOUVEAU BÂTIMENT » (A4) ────────────────────────────────────────
// Quand un achat fait sortir une maison-moteur de terre, le runtime estampille la
// tuile (t._revealPinAt, cf. cityMapRuntime). Ici on pose un chevron doré discret
// au-dessus, item du tri peintre à la profondeur du bâtiment (comme la fumée), le
// temps de REVEAL_PIN_MS. AUCUN recadrage caméra : c'est la moitié « pastille
// seule » de la fiche, le vol amorti reste à A9. Vectoriel comme les halos.
const REVEAL_PIN_MS = 1200;
function drawIsoRevealPin(box, born, now) {
  if (!box) return;
  const age = (now || 0) - born;
  if (age < 0 || age >= REVEAL_PIN_MS) return;
  // Fondu : montée rapide (~130 ms), plateau, chute douce (~360 ms).
  const a = Math.max(0, Math.min(1, Math.min(age / 130, (REVEAL_PIN_MS - age) / 360)));
  if (a <= 0.02) return;
  const ctx = CM.ctx;
  // Taille indexée sur la largeur RÉELLE du sprite (suit le zoom), bornée pour
  // rester discrète et ne pas écraser une petite maison au dézoom.
  const w = Math.max(4, Math.min(11, box.dw * 0.30));   // demi-largeur du chevron
  const h = w * 1.15;                                    // hauteur (pointe vers le bas)
  const bob = Math.sin(age / 130) * (w * 0.18);          // léger flottement
  const cx = Math.round(box.dx + box.dw / 2);
  const topY = Math.round(box.dy - h - w * 0.5 + bob);   // planant au-dessus du toit
  ctx.save();
  ctx.globalAlpha = a;
  // Chevron plein pointant vers le bas (repère « ici ») + liseré sombre pour le
  // détacher des toits clairs.
  ctx.beginPath();
  ctx.moveTo(cx - w, topY);
  ctx.lineTo(cx + w, topY);
  ctx.lineTo(cx, topY + h);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,206,84,0.96)';
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, w * 0.16);
  ctx.strokeStyle = 'rgba(70,46,8,0.85)';
  ctx.stroke();
  ctx.restore();
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
