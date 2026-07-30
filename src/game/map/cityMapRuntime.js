/* eslint-disable */
import { state, collapseInProgress, setCollapseInProgress, renderCache } from '../core/state.js';
import { toNum, D } from '../core/num.js';
import { pressureBreakdown, cityVitals } from '../core/mechanics.js';
import {
  CM,
  CM_MAP_BUILDINGS,
  CM_WONDERS,
  cmWonderSlot,
  cmWonderActiveIds,
  cmWonderCoreR,
  cmForEachWonderCell,
  cmRoadName,
  computeCityLayout,
  cmEngineGroupSig,
  cmCheckWonders,
  cityCounts,
  cmIsWalkableRoad,
  cmClamp,
  cmHash,
  CM_ROLES,
  cmCitizenName,
  cmPick,
  WONDER_CLEAR_R,
  WONDER_TIER_NAMES
} from './layout.js';
import { setCityMapEngineTileMap, setResetCameraCenterHandler } from './cityMapBridge.js';
import { resolveShortcut, resolveCameraKey } from '../core/shortcuts.js';
import { dayNightMode } from './dayNightMode.js';
import { qualitySettings } from './qualityMode.js';
import { ambianceK } from './ambianceMode.js';
import { weatherState } from './weatherMode.js';
import { currentSeason } from './seasonMode.js';
import { buildNecropolis } from './necropolis.js';
import { preloadHouseSprites, houseSpriteHeightTiles, pixelHouseImages } from './pixelHouses.js';
import { glInit, glBegin, glQuad, glFlush, glFinish, glGetCanvas, glStats } from './glPainter.js';
// CHANTIER ISO (Phase 1) : projection unique — obligatoire pour TOUT passage
// monde↔écran (identité quand CM.iso est éteint → zéro changement legacy).
import { worldToScreen, screenToWorld, panDeltaToScreen, screenDeltaToPan, wonderAnchor, ISO_X, ISO_Y } from './iso/projection.js';
import { drawIsoWorld, waterShoreTune } from './iso/isoRenderer.js';
import { fpBegin, fp, fpEnd } from './framePerf.js';
import { tissuMetrics, tissuReport } from './tissuMetrics.js';
import {
  cityMapDrawGround,
  cityMapDrawTerrain,
  cityMapDrawRiver,
  cityMapDrawTrees,
  cityMapDrawUrbanMass,
  cityMapDrawNight,
  cityMapDrawStreetLights,
  cityMapDrawBridges,
  cityMapDrawBridgeLights,
  cityMapDrawPlazaSurface,
  cityMapDrawPlazas,
  cityMapDrawPlazaTallProps,
  cityMapDrawQuays,
  cityMapDrawCityReflections,
  cityMapDrawHealthTint,
  cityMapDrawCityLights,
  drawCrisis,
  cityMapDrawRoad,
  cityMapDrawRoadMarkings,
  cityMapCalmRioterAt,
  quayWallTune
} from './renderWorld.js';
import { drawTile, drawWonder } from './renderBuildings.js';
import { drawCitizens, drawGroundAgents, updateVehicles, drawShips, getVehicleDensity, chooseRoadVehicleType, drawVehicles, drawCitizenThoughts, thoughtBubbleAnchor, citizenSpawnCell } from './agents.js';
import { drawPixelTerrain, pixelTerrainFlag, pixelRoadsFlag, pixelSidewalkFlag, sidewalkTune, setPixelTileset } from './pixelTerrain.js';
import { drawPixelRiver, pixelWaterFlag, setPixelWater, waterRippleTune } from './pixelRiver.js';
import { drawPixelBridges, pixelBridgeFlag, setBridgeOnLoad } from './pixelBridge.js';
import { makeFleetCtl, riverFleetBudget, updateRiverFleet } from './riverFleet.js';


// ── Qualité de rendu (préréglage joueur, cf. qualityMode.js) ─────────────────
// Le préréglage (Auto / Élevée / Équilibrée / Performance) se résout en trois
// leviers lus par le runtime, publiés en variables de module :
//   - cmRenderDprCap : plafond de résolution. Sur écrans HiDPI (dpr 2/3), dessiner
//     à pleine densité multiplie par dpr² les pixels des 4 canvas et de chaque
//     remplissage plein écran — principale cause de lag GPU sur GPU intégrés.
//   - cmFrameMs      : cap de frame de la boucle rAF (30 ou 60 fps).
//   - cmCitizenMul   : densité d'habitants (multiplie cible ET plafond de foule).
// Recalculés au chargement du module puis à chaque changement de préréglage via
// applyCityMapQuality().
let cmRenderDprCap = 1.5;
let cmFrameMs = 1000 / 30;
let cmCitizenMul = 1;
let cmLodZoom = 0.55;       // seuil de zoom sous lequel la carte simplifie (0 = jamais)
let cmCrispGesture = false; // Élevée : recuire le sol net pendant le geste (zéro flou)
function cmApplyQualitySettings() {
  const s = qualitySettings();
  cmRenderDprCap = s.dpr;
  cmFrameMs = 1000 / s.fps;
  cmCitizenMul = s.citizenMul;
  cmLodZoom = (s.lodZoom != null) ? s.lodZoom : 0.55;
  cmCrispGesture = !!s.crispGesture;
}
cmApplyQualitySettings();

function cityMapResizeCanvas(canvas) {
  // Carte démontée (resetCityMapRuntime a nullifié ctx) : un forceFrame/resize
  // attardé crashait sur CM.ctx.setTransform (null). No-op propre.
  if (!CM.ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, cmRenderDprCap);
  const w = canvas.clientWidth || (canvas.parentElement && canvas.parentElement.clientWidth) || 600;
  const h = canvas.clientHeight || 320;
  CM.dpr = dpr;
  CM.cw = w;
  CM.ch = h;
  const nw = Math.max(1, Math.round(w * dpr));
  const nh = Math.max(1, Math.round(h * dpr));
  // MARGE DE PAN : les 3 offscreen (sol/décor/tuiles) sont bakés PLUS GRANDS que
  // l'écran (marge M de chaque côté). Pendant un drag, on blitte la couche déjà
  // bakée DÉCALÉE (translation) au lieu de re-baker à chaque pixel → drag fluide,
  // re-bake seulement quand le pan dépasse la marge. Molette window.__panMargin
  // (px logiques ; 0 = ancien comportement re-bake/pixel). Cf. cityMapBlitMargin.
  const M = Math.max(0, Math.round((typeof window !== "undefined" && window.__panMargin != null) ? window.__panMargin : 256));
  CM._bakeMargin = M;
  const onw = Math.max(1, Math.round((w + 2 * M) * dpr));
  const onh = Math.max(1, Math.round((h + 2 * M) * dpr));
  // Réallouer un canvas — même à taille IDENTIQUE — l'efface et invalidait tous
  // les caches offscreen : forceFrame() (resize + frame) rebakait donc arbres,
  // tuiles et sol à CHAQUE appel. No-op si rien n'a changé.
  const mainSame = canvas.width === nw && canvas.height === nh;
  const offSame = !CM.staticCanvas || (CM.staticCanvas.width === onw && CM.staticCanvas.height === onh);
  if (mainSame && offSame) return;
  if (!mainSame) {
    canvas.width = nw;
    canvas.height = nh;
    CM.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  // Offscreen dimensionnés AVEC la marge (onw/onh > écran). Invalide les bakes.
  if (CM.staticCanvas) {
    CM.staticCanvas.width = onw;
    CM.staticCanvas.height = onh;
    CM.sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    CM._staticBake = null;
  }
  if (CM.tileCanvas) {
    CM.tileCanvas.width = onw;
    CM.tileCanvas.height = onh;
    CM.tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    CM._tileBake = null;
  }
  if (CM.groundCanvas) {
    CM.groundCanvas.width = onw;
    CM.groundCanvas.height = onh;
    CM.gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Le sol ISO bake dans CE canvas sous _isoGroundBake : réallouer l'EFFACE,
    // donc les deux états tombent ensemble. Sinon le bake iso se croit valide et
    // on blitte un canvas vide jusqu'au prochain changement de clé (zoom) ou pan
    // au-delà de la marge — « pas de textures avant de bouger la caméra ».
    CM._groundBake = null; CM._isoGroundBake = null;
  }
  if (CM.quayCanvas) {
    CM.quayCanvas.width = onw;
    CM.quayCanvas.height = onh;
    CM.qctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    CM._quayBake = null;
  }
}

// Remet à null les états RÉELLEMENT relus par cityMapBakeMargin → re-bake à la
// frame suivante. À appeler dès que les canvases offscreen sont recréés/effacés
// ou qu'un flag change le contenu de toutes les couches.
// ⚠ Ne JAMAIS repasser par des clés parallèles (les anciens CM.staticCamKey /
// tileCamKey / groundCamKey étaient écrits partout et relus NULLE PART : chaque
// invalidation était un no-op silencieux).
function cmInvalidateBakes() {
  CM._staticBake = null;
  CM._tileBake = null;
  CM._groundBake = null;
  CM._isoGroundBake = null;   // le sol iso partage CM.groundCanvas
  CM._quayBake = null;
}

// Cible de foule pour un layout donné et un multiplicateur de densité. Extrait
// pour être RÉ-APPLICABLE à chaud (changement de préréglage) sans le recompute
// O(N²) du plan — la formule DOIT rester alignée sur cityMapEnsureLayout.
function cmCitizenTargetFor(L, crowdMul) {
  if (!L || !L.counts) return 0;
  const eraFrac = Math.min(1, (L.counts.eraIndex || 0) / 22);
  const cap = Math.round((10 + Math.pow(eraFrac, 0.55) * 900) * crowdMul);
  const densityMul = (L.personality && L.personality.densityMul) || 1;
  return Math.round(cmClamp((2 + L.counts.houses / 3.5 + Math.pow(eraFrac, 1.65) * 540 + L.counts.megaDistricts * 10) * densityMul * crowdMul, 2, cap));
}

// Multiplicateur de densité effectif : la molette dev window.__citizenMul
// l'emporte sur le préréglage Qualité (débogage), sinon cmCitizenMul. La météo
// s'applique EN PLUS, par un facteur séparé : elle vide les rues sous l'averse
// sans jamais écraser le réglage Qualité du joueur (qui, lui, sert la machine)
// ni la molette de débogage.
function cmCrowdMul() {
  const base = (typeof window !== "undefined" && window.__citizenMul) || cmCitizenMul;
  return base * (CM.weatherCrowdK ?? 1);
}

// Ré-applique la densité au vol (sans recompute du plan) : recale la cible depuis
// le layout courant et coupe l'excédent de piétons tout de suite.
function cmRecomputeCitizenTarget() {
  const L = CM.layout;
  if (!L || !L.counts) return;
  const want = cmCitizenTargetFor(L, cmCrowdMul());
  CM.citizenTarget = (CM.walkRoadList && CM.walkRoadList.length) ? want : 0;
  cmRetireExcessCitizens(CM.citizenTarget);
}

// Excédent de foule : on ne l'efface plus d'un coup là où il se trouve (« ils
// disparaissent au milieu de la rue », Raph 2026-07-29). Les habitants en trop sont
// marqués EN PARTANCE : ils gagnent le seuil le plus proche et s'y effacent
// (citizenChooseNext / updateCitizens), puis quittent la liste. Garde-fou : sur une
// chute VIOLENTE de la cible — préréglage de qualité au minimum, plan rebâti de zéro —
// on coupe quand même net, sinon le rendu paierait des centaines de piétons fantômes.
// Le seuil est large À DESSEIN : les paliers de PLUIE (70 % puis 35 % de la cible) sont
// exactement le cas où la sortie doit rester gracieuse, puisque c'est elle qui met la
// foule à l'abri en courant (cf. citizenSheltering, agents.js).
function cmRetireExcessCitizens(want) {
  const list = CM.citizens;
  if (!list || list.length <= want) return;
  if (list.length > want * 4 + 60) { list.splice(want); return; }
  for (let i = want; i < list.length; i += 1) list[i].leaving = true;
}

// Rebranche le préréglage de qualité à chaud (appelé par l'UI des options) :
// ré-alloue les canvas si le dpr a changé, invalide les bakes et ré-applique la
// densité. La boucle rAF (en pause tant que le dialogue d'options couvre la
// carte) repeindra proprement au prochain frame / à la fermeture du dialogue.
export function applyCityMapQuality() {
  cmApplyQualitySettings();
  if (CM.canvas) cityMapResizeCanvas(CM.canvas);
  cmInvalidateBakes();
  cmRecomputeCitizenTarget();
}

// ── BAKE AVEC MARGE (drag fluide) ────────────────────────────────────────────
// Bake une couche dans un offscreen PLUS GRAND que l'écran (marge M) : re-bake
// seulement si `otherKey` change (layout/zoom/nuit/…) OU si le pan a dépassé M.
// Entre-temps, `cityMapBlitMargin` translate le bake existant → aucun re-bake par
// pixel de pan (le vrai coupable du freeze au drag). drawFn peut renvoyer false
// (« pas encore stable » — tileset en chargement) → re-bake à la frame suivante.
function cityMapBakeMargin(canvas, offctx, stateName, otherKey, drawFn) {
  if (!canvas) return;
  const M = CM._bakeMargin || 0;
  const bm = CM[stateName];
  // Delta de pan PROJETÉ (iso : un pan monde reste une translation écran).
  const pd = bm ? panDeltaToScreen(CM.cam.x - bm.camX, CM.cam.y - bm.camY) : { x: Infinity, y: Infinity };
  const px = pd.x, py = pd.y;
  if (!bm || bm.other !== otherKey || !M || Math.abs(px) > M || Math.abs(py) > M) {
    const mainCtx = CM.ctx, cw = CM.cw, ch = CM.ch;
    CM.cw = cw + 2 * M; CM.ch = ch + 2 * M;   // viewport élargi → centre + culling couvrent la marge
    CM.ctx = offctx;
    offctx.setTransform(1, 0, 0, 1, 0, 0);
    offctx.clearRect(0, 0, canvas.width, canvas.height);
    offctx.setTransform(CM.dpr, 0, 0, CM.dpr, 0, 0);
    const st = drawFn();
    CM.ctx = mainCtx; CM.cw = cw; CM.ch = ch;
    CM[stateName] = { camX: CM.cam.x, camY: CM.cam.y, other: (st === false ? "__unstable__" : otherKey) };
  }
}
// Blit le bake, translaté du delta de pan depuis sa position de bake (-M pour cadrer
// la marge hors écran). Aligné au pixel quel que soit le pan tant qu'il reste < M.
function cityMapBlitMargin(canvas, stateName) {
  const b = CM[stateName]; if (!canvas || !b) return;
  const M = CM._bakeMargin || 0;
  const pd = panDeltaToScreen(b.camX - CM.cam.x, b.camY - CM.cam.y);
  // Position ARRONDIE au pixel device entier : un blit fractionnaire re-snappe
  // (lissage coupé) ou re-floute (lissage actif) différemment à chaque frame —
  // avec le défilement incrémental (ré-ancrages fréquents, delta qui oscille
  // près de zéro), ça se voyait comme un « frisson » du sol (retour Raph).
  // Au pixel entier, le sol est stable ; il avance par pas d'un pixel, la norme
  // du pixel-art.
  const dpr = CM.dpr || 1;
  const bx = Math.round(pd.x * dpr) / dpr, by = Math.round(pd.y * dpr) / dpr;
  CM.ctx.drawImage(canvas, bx - M, by - M, CM.cw + 2 * M, CM.ch + 2 * M);
}

// Monde↔écran : délégué à la projection unique (iso/projection.js). Identique au
// mapping historique quand CM.iso est éteint.
function cityMapWorldAtScreen(sx, sy) {
  return screenToWorld(sx, sy);
}

function cityMapScreenFromWorld(wx, wy) {
  return worldToScreen(wx, wy);
}

// Bornes (indices de tuiles inclusifs) du CONTENU bâti réel du plan (huttes,
// foyers, complexes) — empreinte comprise via spanX/spanY. Sert au cadrage de
// départ pour serrer la vue sur le village plutôt que sur un disque théorique.
function cityContentBounds(layout) {
  const tiles = layout && layout.tiles;
  if (!tiles || !tiles.length) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, n = 0;
  for (const t of tiles) {
    if (!t || typeof t.gx !== "number" || typeof t.gy !== "number") continue;
    const sx = t.spanX || 1, sy = t.spanY || 1;
    if (t.gx < minX) minX = t.gx;
    if (t.gx + sx - 1 > maxX) maxX = t.gx + sx - 1;
    if (t.gy < minY) minY = t.gy;
    if (t.gy + sy - 1 > maxY) maxY = t.gy + sy - 1;
    n += 1;
  }
  return n ? { minX, maxX, minY, maxY } : null;
}

// Cible de cadrage (centre + zoom) pour un layout, SANS toucher la caméra. Sert
// au centrage de départ et au recentrage amorti de A9 (touche C).
function cityMapCameraTarget(layout) {
  if (!layout) return null;
  const T = CM.TILE;
  // Zoom HISTORIQUE (recule avec la taille de ville : 22 tuiles → 36 en mégalopole).
  // Il sert désormais de PLANCHER : on ne dézoome jamais plus large que l'ancien
  // comportement (aucune régression sur les grandes villes), on peut seulement
  // resserrer sur un petit village. Iso : mêmes tuiles = 2× la largeur (losange 2:1).
  const targetTiles = 22 + Math.min(14, Math.max(0, (layout.gridN - 20) * 0.07));
  const perTile = T * (CM.iso ? 2 * ISO_X : 1);
  const baseZoom = CM.cw / (targetTiles * perTile);

  // Cadre sur le CONTENU bâti réel plutôt que sur le seul cœur procédural : le
  // cœur (plan.core) est souvent au bord SUD du bâti, donc centrer dessus pousse
  // le village en haut d'un coin avec un large anneau d'herbe morte autour.
  const b = cityContentBounds(layout);
  if (b && CM.iso) {
    // Fit-to-bounds iso : la bbox (Wt×Ht tuiles) se projette en un losange dont
    // l'étendue écran vaut (Wt+Ht)·ISO_X × (Wt+Ht)·ISO_Y. On zoome pour que ce
    // losange + une marge (anneau délibéré) remplisse le cadre, sans jamais
    // dézoomer sous le plancher historique (grandes villes intactes).
    const span = (b.maxX - b.minX) + (b.maxY - b.minY) + 3; // +3 tuiles de respiration
    const margin = 1.2;                                     // anneau délibéré autour du village
    const fit = Math.min(
      CM.cw / (span * ISO_X * T * margin),
      CM.ch / (span * ISO_Y * T * margin)
    );
    return {
      x: ((b.minX + b.maxX) / 2 + 0.5) * T,
      y: ((b.minY + b.maxY) / 2 + 0.5) * T,
      zoom: Math.max(0.35, Math.min(1.6, Math.max(baseZoom, fit))),
    };
  }

  // Repli (legacy top-down, ou aucun contenu) : cœur du plan + zoom historique.
  return {
    x: (layout.plan?.core?.x ?? layout.gridN / 2) * T,
    y: (layout.plan?.core?.y ?? layout.gridN / 2) * T,
    zoom: Math.max(0.35, Math.min(1.6, baseZoom)),
  };
}

function cityMapCenterCamera(layout) {
  const t = cityMapCameraTarget(layout);
  if (!t) return;
  CM.cam.x = t.x; CM.cam.y = t.y; CM.cam.zoom = t.zoom;
  // A9 : un centrage AUTORITAIRE (chargement, recompute, aperçu de merveille)
  // resynchronise les cibles amorties, sinon la caméra glisserait depuis un état
  // périmé à la première frame et un pan/zoom en cours survivrait au reset.
  CM.zoomGoal = t.zoom; CM.camGoal = null; CM.panVel = null;
}

// Borne la caméra sur la zone de contenu : fleuve (amont→aval) en X, grille
// jouable en Y. Empêche de paner ou de dézoomer au point de voir le bout net du
// ruban OU de dériver dans la nature infinie — le contenu remplit toujours le
// cadre. Marge en X pour garder le biseau du bout hors-champ ; léger anneau de
// nature en Y. (Pas de fleuve = boîte X repliée sur la grille.)
// A9 — « Une caméra qui a du poids ». Zoom molette qui GLISSE (cible `CM.zoomGoal`
// rattrapée par frame, point sous le curseur maintenu à CHAQUE frame), pan avec
// inertie courte (`CM.panVel`), recentrage en vol amorti (`CM.camGoal`, le même
// mécanisme que le vol de A4, reporté), et pilotage clavier (flèches, +/-, C).
// Amortissements COURTS : au-delà, la caméra devient molle et repousse le retour
// du sol net (recuisson coalescée sur `ISO_SETTLE_MS = 110 ms`). Molette :
// `__camFeel({ zoomRate, panDecay, camRate, panKey, wheelStep, keyZoom })`.
const CAM_FEEL = { zoomRate: 15, panDecay: 6.5, camRate: 9, panKey: 1100, wheelStep: 1.12, keyZoom: 1.06 };
if (typeof window !== 'undefined') {
  window.__camFeel = (o) => { if (o) Object.assign(CAM_FEEL, o); return { ...CAM_FEEL }; };
}

// Rattrapage amorti, indépendant du pas de temps : fraction du reste à couvrir
// cette frame pour un demi-temps ~ln2/rate. Bornée pour un gros dt (onglet revenu).
function camApproach(dt, rate) { return 1 - Math.exp(-Math.min(0.1, dt) * rate); }

function cmClampCamera() {
  const L = CM.layout;
  if (!L || !CM.cw || !CM.ch) return;
  const T = CM.TILE, N = L.gridN || 0;
  const sm = (L.river && L.river.present && L.river.samples && L.river.samples.length) ? L.river.samples : null;
  // Boîte de cadrage (px monde).
  const bx0 = (sm ? sm[0].x * T : 0) + (sm ? 3 * T : 0);
  const bx1 = (sm ? sm[sm.length - 1].x * T : N * T) - (sm ? 3 * T : 0);
  // Marge verticale ample : largement au-dessus de la hauteur d'un sprite de
  // bâtiment (les bâtiments montent au-dessus de leur tuile) -> aucun n'est rogné
  // en haut/bas, et on garde du mou pour ne pas se sentir coincé.
  const by0 = -0.5 * N * T;       // ~½ grille de nature au-dessus
  const by1 = (N + 0.5 * N) * T;  // ... et en dessous
  const boxW = bx1 - bx0, boxH = by1 - by0;
  if (boxW <= 0 || boxH <= 0) return;
  if (CM.iso) {
    // Iso (Phase 1) : la boîte monde projetée est un losange dont l'étendue écran
    // vaut (W+H)·ISO_X × (W+H)·ISO_Y. Plancher de zoom sur cette étendue ; le pan
    // se contente de garder le CENTRE caméra dans la boîte monde (clamp exact
    // bord-à-bord = intersection de losange, affiné en Phase 6 si besoin).
    const extW = (boxW + boxH) * ISO_X, extH = (boxW + boxH) * ISO_Y;
    const zoomFloorIso = Math.min(3.2, Math.max(CM.cw / extW, CM.ch / extH));
    if (CM.cam.zoom < zoomFloorIso) CM.cam.zoom = zoomFloorIso;
    // A9 : borner AUSSI la cible de zoom, sinon le glissement la poursuit sous le
    // plancher pendant que le clamp remonte cam.zoom → tremblement, jamais posé.
    if (CM.zoomGoal != null) CM.zoomGoal = Math.max(zoomFloorIso, Math.min(3.2, CM.zoomGoal));
    CM.cam.x = Math.max(bx0, Math.min(bx1, CM.cam.x));
    CM.cam.y = Math.max(by0, Math.min(by1, CM.cam.y));
    return;
  }
  // Plancher de zoom : la boîte contient toujours le viewport (axe contraignant
  // ajusté pile -> on prend le max des deux ajustements).
  const zoomFloor = Math.min(3.2, Math.max(CM.cw / boxW, CM.ch / boxH));
  if (CM.cam.zoom < zoomFloor) CM.cam.zoom = zoomFloor;
  if (CM.zoomGoal != null) CM.zoomGoal = Math.max(zoomFloor, Math.min(3.2, CM.zoomGoal)); // A9 : cible bornée comme cam.zoom
  // Pan : chaque bord d'écran reste dans la boîte (centré si l'écran dépasse la
  // boîte sur cet axe).
  const halfW = (CM.cw / 2) / CM.cam.zoom, halfH = (CM.ch / 2) / CM.cam.zoom;
  const loX = bx0 + halfW, hiX = bx1 - halfW;
  const loY = by0 + halfH, hiY = by1 - halfH;
  CM.cam.x = loX > hiX ? (bx0 + bx1) / 2 : Math.max(loX, Math.min(hiX, CM.cam.x));
  CM.cam.y = loY > hiY ? (by0 + by1) / 2 : Math.max(loY, Math.min(hiY, CM.cam.y));
}

// A9 — Un pas d'amortissement de la caméra, appelé chaque frame avant le clamp.
// Jamais pendant une capture (frames déterministes) ni sans caméra prête.
function cmCameraGlide(dt) {
  if (!CM.cam || CM.capture) return;
  if (CM.zoomGoal == null) CM.zoomGoal = CM.cam.zoom;
  // 1) Zoom qui glisse. Le point sous l'ancre (curseur au wheel, centre au clavier)
  //    est REPROJETÉ à chaque frame d'interpolation, sinon il dérive pendant le vol.
  if (Math.abs(CM.cam.zoom - CM.zoomGoal) > 1e-3) {
    const a = CM.zoomAnchor || { mx: CM.cw / 2, my: CM.ch / 2 };
    const before = screenToWorld(a.mx, a.my);
    CM.cam.zoom += (CM.zoomGoal - CM.cam.zoom) * camApproach(dt, CAM_FEEL.zoomRate);
    const after = screenToWorld(a.mx, a.my);
    CM.cam.x += before.x - after.x;
    CM.cam.y += before.y - after.y;
  } else {
    CM.cam.zoom = CM.zoomGoal;   // pose franche → cam immobile → recuisson du sol
  }
  // 2) Recentrage en vol amorti (touche C). Prioritaire, et il éteint l'inertie.
  if (CM.camGoal) {
    const k = camApproach(dt, CAM_FEEL.camRate);
    CM.cam.x += (CM.camGoal.x - CM.cam.x) * k;
    CM.cam.y += (CM.camGoal.y - CM.cam.y) * k;
    if (Math.hypot(CM.camGoal.x - CM.cam.x, CM.camGoal.y - CM.cam.y) < 1) {
      CM.cam.x = CM.camGoal.x; CM.cam.y = CM.camGoal.y; CM.camGoal = null;
    }
  } else if (CM.panVel && !CM.drag) {
    // 3) Inertie de pan : glisse et s'éteint vite (demi-vie ~ ln2 / panDecay).
    CM.cam.x += CM.panVel.x * dt;
    CM.cam.y += CM.panVel.y * dt;
    const decay = Math.exp(-Math.min(0.1, dt) * CAM_FEEL.panDecay);
    CM.panVel.x *= decay; CM.panVel.y *= decay;
    if (Math.hypot(CM.panVel.x, CM.panVel.y) < 2) CM.panVel = null;
  }
}

// A9 — Pan/zoom au clavier TENUS. Chaque frame, tant qu'une flèche est enfoncée,
// la vitesse de pan monte vers une cible (accélération → « poids »), et l'inertie
// de cmCameraGlide prend le relais au relâcher. +/- font glisser le zoom. Les
// touches enfoncées vivent dans CM._heldCamKeys, alimenté par bindCityMapInput —
// au plus près du wheel/drag, SANS saut par le pont (robuste au rechargement à
// chaud, qui pouvait laisser un handler de pont périmé).
function cmApplyHeldCamKeys(dt) {
  const h = CM._heldCamKeys;
  if (!h || h.size === 0 || !CM.cam) return;
  let sdx = 0, sdy = 0;
  if (h.has('ArrowLeft')) sdx -= 1;
  if (h.has('ArrowRight')) sdx += 1;
  if (h.has('ArrowUp')) sdy -= 1;
  if (h.has('ArrowDown')) sdy += 1;
  if (!sdx && !sdy) return;
  const dir = screenDeltaToPan(sdx, sdy);   // direction écran → monde (diagonale iso respectée)
  const len = Math.hypot(dir.x, dir.y) || 1;
  const spd = CAM_FEEL.panKey;
  const k = camApproach(dt, 12);            // montée progressive de la vitesse pendant l'appui
  CM.panVel = CM.panVel || { x: 0, y: 0 };
  CM.panVel.x += ((dir.x / len) * spd - CM.panVel.x) * k;
  CM.panVel.y += ((dir.y / len) * spd - CM.panVel.y) * k;
  CM.camGoal = null;
}

// A9 — Recentrage en vol amorti (touche C, id `recenter_map` de la table).
function cmRecenter() {
  if (!CM.cam || !CM.layout) return;
  const t = cityMapCameraTarget(CM.layout);
  if (!t) return;
  CM.camGoal = { x: t.x, y: t.y };
  CM.zoomGoal = t.zoom;
  CM.zoomAnchor = { mx: CM.cw / 2, my: CM.ch / 2 };
  CM.panVel = null;
}

function cityMapEnsureTooltip(mapRoot, tooltipElement = null) {
  CM.tooltip = tooltipElement || mapRoot?.querySelector(".city-map-tooltip") || null;
}

function cityMapVariantLabel(type, variant) {
  const labels = {
    tent: "Tente",
    hut: "Cabane",
    longhouse: "Longue maison",
    courtyard: "Maison a cour",
    townhouse: "Maison de ville",
    manor: "Manoir",
    stonehouse: "Maison de pierre",
    tenement: "Immeuble populaire",
    block: "Bloc residentiel",
    tower: "Tour d'habitation",
    megablock: "Grand ensemble",
    arcologyhome: "Logement d'arcologie",
    // Grands complexes (districts) conservés :
    market: "Marche",
    temple: "Temple",
    keep: "Donjon",
    forum: "Forum",
    palace: "Palais",
    station: "Station civique",
    spire: "Fleche administrative",
    archive: "Archives",
    observatory: "Observatoire",
    dense: "Quartier dense",
    arcology: "Arcologie",
    grid: "Quartier en grille"
  };
  if (labels[variant]) return labels[variant];
  if (type === "house") return "Logement";
  return "Batiment";
}

function cityMapDescribeTile(t) {
  if (t.type === "engine") {
    const density = t.tier >= 3 ? "quartier dense" : t.tier >= 2 ? "complexe" : t.tier >= 1 ? "groupe" : "unite";
    const spread = t.groupTotal > 1 ? ` | groupe ${t.groupIndex}/${t.groupTotal} (${t.groupLevel})` : "";
    return { title: t.buildingName || cityMapVariantLabel(t.type, t.variant), body: `Niveau total ${t.level || 1}${spread} - ${density}` };
  }
  const seed = cmHash(`${t.key}:${state.cycles || 0}`);
  const band = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraBand : 2;
  const title = t.type === "house"
    ? `${cityMapVariantLabel(t.type, t.variant)} de ${cmCitizenName(seed, band)}`
    : cityMapVariantLabel(t.type, t.variant);
  return { title };
}

function cityMapHitTest(sx, sy) {
  if (!CM.layout) return null;
  const world = cityMapWorldAtScreen(sx, sy);
  const gx = Math.floor(world.x / CM.TILE);
  const gy = Math.floor(world.y / CM.TILE);
  let bestCitizen = null;
  let bestDist = Infinity;
  const citizenRadius = Math.max(8, 7 * CM.cam.zoom);
  // Les émeutiers se déplacent en groupe : survoler l'un d'eux signale l'émeute.
  if (Array.isArray(CM.rioters) && CM.rioters.length) {
    for (const p of CM.rioters) {
      const sp = cityMapScreenFromWorld(p.x, p.y);
      if (Math.hypot(sp.x - sx, sp.y - sy) < citizenRadius) {
        return { title: "Une émeute est en cours !", body: "Des habitants en colère défilent, torches et armes de fortune levées. Cliquez sur un émeutier pour l'apaiser.", kind: "Émeute" };
      }
    }
  }
  for (const p of CM.citizens) {
    const sp = cityMapScreenFromWorld(p.x, p.y);
    const dist = Math.hypot(sp.x - sx, sp.y - sy);
    if (dist < citizenRadius && dist < bestDist) {
      bestCitizen = p;
      bestDist = dist;
    }
  }
  if (bestCitizen) {
    return { title: bestCitizen.name, body: bestCitizen.role, kind: "Habitant" };
  }
  if (Array.isArray(state.wonders)) {
    const wonderTip = (wi) => {
      const w = CM_WONDERS[wi];
      const tier = (state.wonderTiers && state.wonderTiers[w.id]) || 1;
      const next = w.tiers && tier < w.tiers.length ? ` · prochain rang : ${w.tierLabel(w.tiers[tier])}` : " · rang maximal";
      return { title: `${w.name} (rang ${WONDER_TIER_NAMES[tier]})`, body: `${w.unlockedBy || ""}${next}`, kind: "Merveille" };
    };
    // BOÎTES RÉELLEMENT DESSINÉES à la dernière frame (publiées par drawWonder),
    // parcourues à l'envers : la liste est en ordre du peintre, ce qui est DEVANT
    // gagne. Même geste que CM._houseBoxes juste en dessous, et pour la même
    // raison — viser le sol rate ce qui monte au-dessus.
    // ⚠ L'ancien test était un DISQUE de 2,5 tuiles autour de l'ancre, donc AU
    // SOL. L'Œil de la Singularité LÉVITE (drawWonder le monte de H·0,34, près de
    // 3 tuiles) : le disque et le sprite ne se recouvraient jamais et il n'a
    // jamais eu d'infobulle (Raph 2026-07-28). Les autres n'étaient survolables
    // que par leur pied.
    const wb = CM._wonderBoxes;
    if (wb && wb.length) {
      for (let i = wb.length - 1; i >= 0; i -= 1) {
        const b = wb[i];
        if (sx < b.dx || sx > b.dx + b.dw || sy < b.dy || sy > b.dy + b.dh) continue;
        return wonderTip(b.wi);
      }
    } else {
      // Repli (legacy top-down, ou 1re frame avant publication) : le disque au
      // sol d'avant. Ancre PARTAGÉE avec drawWonder — ce hit-test projetait
      // encore à la main, façon legacy, donc en iso la zone survolable ne
      // tombait plus sur la merveille dessinée.
      const activeWonders = cmWonderActiveIds(state);
      for (let wi = 0; wi < CM_WONDERS.length; wi += 1) {
        if (!activeWonders.has(CM_WONDERS[wi].id)) continue;
        const ws = wonderAnchor(wi, CM.layout.gridN, CM.layout.cx, CM.layout.cy);
        if (Math.hypot(ws.x - sx, ws.y - sy) < Math.max(32, CM.TILE * CM.cam.zoom * 2.5)) return wonderTip(wi);
      }
    }
  }
  // SILHOUETTE avant cellule de sol : un sprite d'habitation monte bien au-dessus
  // de son losange, donc viser son toit retombait sur la cellule SITUÉE DERRIÈRE
  // et l'infobulle décrivait un voisin. On teste d'abord les boîtes réellement
  // dessinées à la dernière frame (CM._houseBoxes, publiées par drawIsoLive), du
  // plus proche au plus lointain : la liste est en ordre du peintre, on la
  // parcourt donc à l'envers pour que ce qui est DEVANT gagne.
  const hb = CM._houseBoxes;
  if (hb) {
    for (let i = hb.length - 1; i >= 0; i -= 1) {
      const b = hb[i].b, t = hb[i].t;
      if (sx < b.dx || sx > b.dx + b.dw || sy < b.dy || sy > b.dy + b.dh) continue;
      return { ...cityMapDescribeTile(t), kind: t.type === "house" ? "Logement" : "Batiment", tile: t, cell: t.gx + "," + t.gy };
    }
  }
  const tile = CM.tileGrid?.get(gx + "," + gy);
  if (tile) {
    const info = cityMapDescribeTile(tile);
    return { ...info, kind: tile.type === "house" ? "Logement" : "Batiment", tile, cell: tile.gx + "," + tile.gy };
  }
  if (CM.roadSet.has(`${gx},${gy}`)) {
    const road = CM.layout.roadMap && CM.layout.roadMap.get(gx + "," + gy);
    return { title: cmRoadName(gx, gy), kind: road && road.rank === "plaza" ? "Place" : "Voie", cell: gx + "," + gy };
  }
  return null;
}

function cityMapShowTooltip(hit, sx, sy) {
  if (!CM.tooltip) return;
  if (!hit) {
    CM.tooltip.classList.remove("visible");
    CM.hover = null;
    return;
  }
  CM.hover = hit;
  const kindEl = CM.tooltip.querySelector("[data-citymap-tooltip-kind]");
  const titleEl = CM.tooltip.querySelector("[data-citymap-tooltip-title]");
  const bodyEl = CM.tooltip.querySelector("[data-citymap-tooltip-body]");
  if (kindEl) kindEl.textContent = hit.kind || "";
  if (titleEl) titleEl.textContent = hit.title || "";
  if (bodyEl) {
    bodyEl.textContent = hit.body || "";
    bodyEl.hidden = !hit.body;
  }
  CM.tooltip.style.left = `${Math.min(CM.cw - 18, sx + 14)}px`;
  CM.tooltip.style.top = `${Math.max(12, sy - 8)}px`;
  CM.tooltip.classList.add("visible");
}


function cityMapHitTestCitizenWithThought(sx, sy) {
  if (!CM.layout) return null;
  const z = CM.cam.zoom;
  let best = null;
  let bestDist = Infinity;
  const clickRadius = Math.max(16, 14 * z);
  for (const p of CM.citizens) {
    if (!p.thoughtType || p.thoughtTimer <= 0 || p._nightHidden) continue;
    // Position écran IDENTIQUE au rendu : pieds (projection partagée) pour le
    // corps, et ANCRE PARTAGÉE thoughtBubbleAnchor (au-dessus de la tête) pour
    // la bulle — même formule que drawCitizenThoughts, jamais désalignée.
    const spb = cityMapScreenFromWorld(p.x + (p.lox || 0), p.y + (p.loy || 0));
    const px = spb.x, py = spb.y;
    const distBody = Math.hypot(px - sx, py - sy);
    const a = thoughtBubbleAnchor(p);
    const distBubble = Math.hypot(a.x - sx, a.y - sy);
    const minDist = Math.min(distBody, distBubble);
    if (minDist < clickRadius && minDist < bestDist) {
      best = p;
      bestDist = minDist;
    }
  }
  return best;
}



function bindCityMapInput(canvas, mapRoot, callbacks = {}) {
  const showHover = callbacks.showHover || function () {};
  const clearHover = callbacks.clearHover || function () {};
  const controller = new AbortController();
  const { signal } = controller;

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    // A9 : le zoom GLISSE — on ne bouge pas cam.zoom ici, on déplace la CIBLE, que
    // frame() rattrape en gardant le point sous le curseur À CHAQUE frame. Le
    // pincement trackpad arrive aussi comme un wheel : couvert sans code en plus.
    // Pas accéléré (e.deltaY brut décuplé sur certaines souris) → cran constant.
    const step = CAM_FEEL.wheelStep;
    const factor = e.deltaY < 0 ? step : 1 / step;
    CM.zoomGoal = Math.max(0.35, Math.min(3.2, (CM.zoomGoal ?? CM.cam.zoom) * factor));
    CM.zoomAnchor = { mx, my };
    CM.camGoal = null;   // le joueur reprend la main sur un recentrage en cours
  }, { passive: false, signal });

  canvas.addEventListener("mousemove", (e) => {
    if (CM.drag) {
      clearHover();
      return;
    }
    const rect = canvas.getBoundingClientRect();
    showHover(e.clientX - rect.left, e.clientY - rect.top);
  }, { signal });
  canvas.addEventListener("mouseleave", clearHover, { signal });

  canvas.addEventListener("mousedown", (e) => {
    CM.drag = { x: e.clientX, y: e.clientY, camx: CM.cam.x, camy: CM.cam.y, moved: 0 };
  }, { signal });

  window.addEventListener("mousemove", (e) => {
    if (!CM.drag) return;
    const dx = e.clientX - CM.drag.x;
    const dy = e.clientY - CM.drag.y;
    CM.drag.moved += Math.abs(dx) + Math.abs(dy);
    // Delta écran → delta caméra via la projection (iso : la carte suit la souris
    // le long des diagonales, comme attendu).
    const pd = screenDeltaToPan(dx, dy);
    CM.cam.x = CM.drag.camx - pd.x;
    CM.cam.y = CM.drag.camy - pd.y;
    canvas.style.cursor = "grabbing";
    // A9 : vitesse instantanée (monde/s) pour l'inertie au relâcher — mesurée sur
    // le DERNIER segment, pas sur le total (le flick de fin ≠ la moyenne du drag).
    const tv = (typeof performance !== "undefined" ? performance.now() : Date.now());
    if (CM.drag._lt) {
      const seg = screenDeltaToPan(e.clientX - CM.drag._lx, e.clientY - CM.drag._ly);
      const ms = Math.max(1, tv - CM.drag._lt);
      CM.drag._vx = (-seg.x / ms) * 1000;   // la caméra bouge à l'INVERSE du delta souris
      CM.drag._vy = (-seg.y / ms) * 1000;
    }
    CM.drag._lx = e.clientX; CM.drag._ly = e.clientY; CM.drag._lt = tv;
  }, { signal });

  window.addEventListener("mouseup", () => {
    if (CM.drag) {
      if (CM.drag.moved > 6) CM.dragged = true;
      // A9 : inertie SEULEMENT si le geste était frais au relâcher — un drag posé
      // puis immobile ne doit pas repartir tout seul. Vitesse bornée (flick fort).
      const tv = (typeof performance !== "undefined" ? performance.now() : Date.now());
      if (CM.drag._lt && tv - CM.drag._lt < 60 && CM.drag._vx != null) {
        const cap = 4200; // monde/s
        CM.panVel = {
          x: Math.max(-cap, Math.min(cap, CM.drag._vx)),
          y: Math.max(-cap, Math.min(cap, CM.drag._vy)),
        };
        CM.camGoal = null;
      }
    }
    CM.drag = null;
    canvas.style.cursor = "grab";
  }, { signal });

  if (mapRoot) mapRoot.addEventListener("click", (e) => {
    if (CM.dragged) {
      e.stopImmediatePropagation();
      CM.dragged = false;
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    // Émeutiers : un clic apaise l'individu visé (prioritaire sur le reste).
    if (cityMapCalmRioterAt(mx, my)) {
      e.stopImmediatePropagation();
      e.preventDefault();
      return;
    }
    const hitCitizen = cityMapHitTestCitizenWithThought(mx, my);
    if (hitCitizen && callbacks.onCitizenThoughtClicked) {
      e.stopImmediatePropagation();
      e.preventDefault();
      const type = hitCitizen.thoughtType;
      hitCitizen.thoughtType = null;
      hitCitizen.thoughtTimer = 0;
      CM.globalBubbleCooldown = Math.random() * 90 + 90; // 1.5 - 3 minutes before next bubble
      callbacks.onCitizenThoughtClicked(hitCitizen, type);
    }
  }, { capture: true, signal });

  // A9 — CLAVIER CAMÉRA (flèches, +/-, recentrage C), au plus près du wheel/drag.
  // Écouté sur window mais MONTÉ AVEC LA CARTE (même AbortController) : sur une
  // autre vue, CityView est démontée, ces écouteurs disparaissent et les flèches
  // refont défiler la page. Modèle « tenu » : keydown mémorise, keyup oublie, et
  // cmApplyHeldCamKeys lit l'état chaque frame (pan continu, pas au coup par coup).
  CM._heldCamKeys = new Set();
  const heldKeys = CM._heldCamKeys;
  window.addEventListener("keydown", (e) => {
    const cam = resolveCameraKey(e);
    if (cam) {
      e.preventDefault();               // pas de défilement de page sous la carte
      if (cam.pan) {
        heldKeys.add(e.key);            // pan TENU : lu chaque frame → glissement continu
      } else if (cam.zoom) {
        // Zoom : un cran de CIBLE par appui (l'auto-répétition OS enchaîne les
        // crans quand la touche est tenue), cam.zoom glisse vers la cible. Pas
        // d'état « tenu » → aucune touche +/- ne peut rester coincée au relâcher.
        const f = cam.zoom > 0 ? CAM_FEEL.keyZoom : 1 / CAM_FEEL.keyZoom;
        CM.zoomGoal = Math.max(0.35, Math.min(3.2, (CM.zoomGoal ?? CM.cam.zoom) * f));
        CM.zoomAnchor = { mx: CM.cw / 2, my: CM.ch / 2 };
        CM.camGoal = null;
      }
      return;
    }
    if (e.repeat) return;               // recentrage : une seule fois par appui
    const hit = resolveShortcut(e);
    if (hit && hit.id === "recenter_map") { e.preventDefault(); cmRecenter(); }
  }, { signal });
  window.addEventListener("keyup", (e) => { heldKeys.delete(e.key); }, { signal });
  // Perte de focus (Alt-Tab, clic hors fenêtre) : le keyup peut manquer → on vide,
  // sinon une touche « restée enfoncée » ferait dériver la caméra sans fin.
  window.addEventListener("blur", () => heldKeys.clear(), { signal });

  return () => controller.abort();
}


// Cache engineSig et cityCounts entre frames — ne recalculer que si les bâtiments changent.
let _cachedEngineSigBuildVer = -1;
let _cachedEngineSig = "";
let _cachedEngineGroupSig = "";
let _cachedCityCounts = null;
let _cachedCityCountsPopKey = "";

// RECOMPUTE DIFFÉRÉ PENDANT LES GESTES DE CAMÉRA. Sur la machine de jeu, un
// recompute complet coûte 200-300 ms ; or sur une partie vivante il se
// déclenche EN PLEIN dézoom/pan (achats des automates → palier de bloc ou
// route, et la progression d'ère fait bouger eraFrac en continu — le throttle
// de 1500 ms autorisait donc un gel toutes les 1,5 s pendant le geste,
// mesuré p90 49,7 ms / max 214-306 ms chez Raph). Tant que la caméra bouge
// (< LAYOUT_GESTURE_STILL_MS d'immobilité), tout recompute attend l'accalmie
// — le bâtiment neuf apparaît une demi-seconde plus tard, à l'arrêt, au lieu
// de geler le geste. Plafond LAYOUT_DEFER_MAX_MS : un pan ininterrompu ne
// repousse pas la vérité de la carte indéfiniment. Suivi de mouvement
// AUTONOME (les deux pipelines passent ici, pas seulement l'iso).
// Molette d'A/B : window.__layoutDefer = false pour retrouver l'ancien
// comportement.
const LAYOUT_GESTURE_STILL_MS = 280;
// 10 s : mesuré sur la machine de jeu (deux relevés), un dézoom énergique tient
// facilement 6 s sans pause de 280 ms — le plafond forçait alors le recompute
// EN PLEIN geste (layout ~235 ms dans la pire frame, deux fois de suite). Les
// explorations réelles marquent une pause avant 10 s ; au-delà on assume le
// gel plutôt qu'une carte mensongère.
const LAYOUT_DEFER_MAX_MS = 10000;
let _lyCamX = NaN, _lyCamY = NaN, _lyCamZ = NaN;
let _lyCamMoveAt = -1e9;
let _lyDeferredAt = 0;

function cityMapEnsureLayout(now, deps = {}) {
  const getVehicleDensity = deps.getVehicleDensity || function () { return 0; };
  const chooseRoadVehicleType = deps.chooseRoadVehicleType || function () { return "wagon"; };

  // engineSig : ne reconstruire que si les bâtiments ont changé (renderCache._buildingsVersion)
  if (renderCache._buildingsVersion !== _cachedEngineSigBuildVer) {
    _cachedEngineSig = CM_MAP_BUILDINGS.map((meta) => `${meta.id}:${Math.floor((state.buildings && state.buildings[meta.id]) || 0)}`).join("|");
    _cachedEngineGroupSig = cmEngineGroupSig(state);   // structure des blocs (paliers), pas les comptes bruts
    _cachedEngineSigBuildVer = renderCache._buildingsVersion;
    _cachedCityCounts = null; // invalider aussi cityCounts
  }
  // cityCounts : ne recalculer que si population/infra/knowledge/cycles ont changé significativement
  const _popKey = Math.floor(toNum(state.population) / 500) + '|' + Math.floor(toNum(state.infrastructure) / 200) + '|' + Math.floor(toNum(state.knowledge) / 200) + '|' + (state.cycles || 0);
  if (!_cachedCityCounts || _popKey !== _cachedCityCountsPopKey) {
    _cachedCityCounts = cityCounts(state);
    _cachedCityCountsPopKey = _popKey;
  }
  const cc = _cachedCityCounts;
  const engineSig = _cachedEngineSig;
  const engineGroupSig = _cachedEngineGroupSig;

  // Bande de crise : 0 normal, 1 crise, 2 effondrement imminent — force une
  // régénération du layout quand l'état de la ville bascule (chaos procédural).
  const crisisBand = ((state.timeWear || 0) > 0.88 || (state.instability || 0) >= 1) ? 2
    : ((state.timeWear || 0) > 0.6 || (state.instability || 0) >= 0.6) ? 1 : 0;
  // Les merveilles réservent leur clairière au prochain calcul du plan : leur
  // érection doit donc invalider le layout, sinon elles s'affichent par-dessus
  // les bâtiments existants jusqu'à la régénération suivante.
  // Le COMPTE ne suffit plus : depuis que l'emprise suit le rang (cf.
  // cmWonderExtent), une montée de rang change le parvis, la réserve et le carve
  // des routes sans changer le nombre de merveilles érigées. Avec le seul compte,
  // le plan restait figé sur l'ancienne emprise et la place ne grandissait
  // jamais — le rang entre donc dans la signature, trié pour rester stable.
  const wonderSig = [...cmWonderActiveIds(state)].sort()
    .map((id) => id + ':' + (((state.wonderTiers && state.wonderTiers[id]) || 1) | 0)).join(',');
  // Routes achetées → budget de connexion du réseau (connectBuildingsToNetwork) : un
  // achat change la signature → recompute. Dans `sig` seulement (pas `coreSig`) → mis à
  // jour sur le chemin throttlé (≤1/1500ms), sûr même si une automation en achète en rafale.
  const roadCount = Math.floor((state.buildings && state.buildings.roads) || 0);
  const sig = cc.eraIndex + '|' + cc.eraFrac.toFixed(2) + '|' + (state.cycles || 0) + '|' + crisisBand + '|' + wonderSig + '|' + roadCount + '|' + engineSig;
  if (sig === CM.layoutSig && CM.layout) return;
  // « 1 achat = 1 bâtiment » SANS le gel de ~240 ms : quand SEULS les comptes changent
  // (structure des blocs identique — cf. cmEngineGroupSig, stable entre paliers), on NE
  // recalcule PAS le layout (placement + connexion routière). On rafraîchit juste t.level
  // sur les tuiles moteur → la NAPPE (drawEngineSprawl) grandit d'UNE maison par achat,
  // gratuitement. Débrayable : window.__stableSkip = false.
  const structSig = cc.eraIndex + '|' + cc.eraFrac.toFixed(2) + '|' + (state.cycles || 0) + '|' + crisisBand + '|' + wonderSig + '|' + roadCount + '|' + engineGroupSig;
  const skipStable = typeof window === 'undefined' || window.__stableSkip !== false;
  if (skipStable && CM.layout && structSig === CM.layoutStructSig) {
    const b = state.buildings || {};
    for (const tt of CM.layout.tiles) if (tt.type === 'engine' && tt.buildingId) tt.level = Math.floor(b[tt.buildingId] || 0);
    CM.layoutSig = sig;
    return;
  }
  // Changement STRUCTUREL (nouveau bloc / ère / merveille / route / prestige) → recompute
  // complet. Throttle : les changements de eraFrac SEULS sont limités à 1 recompute/1500ms.
  const coreSig = cc.eraIndex + '|' + (state.cycles || 0) + '|' + crisisBand + '|' + wonderSig + '|' + engineGroupSig;
  const coreChanged = coreSig !== CM.layoutCoreSig;
  if (CM.layout && !coreChanged && (now - CM.layoutRecomputeAt) < 1500) return;
  // Geste de caméra en cours → recompute différé à l'accalmie (cf. bloc de
  // constantes plus haut). Jamais pendant une capture (déterminisme du harnais).
  if (typeof window === 'undefined' || window.__layoutDefer !== false) {
    const cam = CM.cam;
    if (cam.x !== _lyCamX || cam.y !== _lyCamY || cam.zoom !== _lyCamZ) {
      _lyCamX = cam.x; _lyCamY = cam.y; _lyCamZ = cam.zoom; _lyCamMoveAt = now;
    }
    if (CM.layout && !CM.capture && now - _lyCamMoveAt < LAYOUT_GESTURE_STILL_MS) {
      if (!_lyDeferredAt) _lyDeferredAt = now;
      if (now - _lyDeferredAt < LAYOUT_DEFER_MAX_MS) return; // on retente à chaque frame
    }
    _lyDeferredAt = 0;
  }
  CM.layoutSig = sig;
  CM.layoutStructSig = structSig;
  CM.layoutCoreSig = coreSig;
  CM.layoutRecomputeAt = now;
  CM.tileDirtyUntil = now + 1200; // grace birth animations (engine tiles take 800ms)
  CM._tileBake = null;            // force re-bake tile canvas après fenêtre de naissance
  const L = computeCityLayout(state);
  // Préchargement des sprites d'habitation de la bande courante AVANT la fenêtre de
  // naissance / le bake : supprime le flash procédural (« ancien sprite ») à la 1re
  // apparition d'une variante lors d'un achat (cf. preloadHouseSprites).
  preloadHouseSprites(L.counts && L.counts.eraBand || 0);
  // Garde-fou COORDS : quand la grille grandit (terme engineHomes / achats), cx=floor(N/2)
  // bouge → toute la ville se TRANSLATE en coords monde (slots core-relatifs, la ville n'a
  // pas bougé vs son cœur). On recale la caméra du delta de cœur pour supprimer le saut.
  if (CM._prevCore && CM.centered) {
    CM.cam.x += (L.cx - CM._prevCore.x) * CM.TILE;
    CM.cam.y += (L.cy - CM._prevCore.y) * CM.TILE;
  }
  CM._prevCore = { x: L.cx, y: L.cy };
  // Ordre painter's (arrière → avant) : indispensable depuis que les habitations
  // pixel-art dépassent leur tuile vers le haut — une tour au premier plan doit
  // recouvrir ce qui est derrière. Tri par gy puis gx ; les consommateurs de
  // L.tiles (naissance, tileGrid, maxD2) sont indépendants de l'ordre.
  if (Array.isArray(L.tiles)) L.tiles.sort((a, b) => (a.gy - b.gy) || (a.gx - b.gx));
  // Couverture du réseau routier (bâtiments-moteur reliés / total) → cache lu par le sim
  // (roadNetworkMultiplier, +10% max). GÉOMÉTRIQUE → ne peut venir que de la carte ; persiste
  // dans state (dernière valeur si la carte n'est pas montée / hors-ligne).
  {
    const rc = L.roadCover;
    state.roadCoverage = (rc && rc.engineTotal > 0) ? rc.engineConnected / rc.engineTotal : 0;
    // Portes réelles (sur rue / total brut, murés compris) : affichage seul.
    state.roadDoors = rc
      ? { onRoad: rc.engineConnected | 0, total: Math.max(rc.engineConnected | 0, rc.engineAll | 0) }
      : null;
    // Chantiers de voirie : la carte fait foi sur le prochain chantier proposé
    // (nature, tuiles, cible) et sur les tronçons élargis appliqués — la
    // boutique (prix) et le sim (bonus) ne font que lire ces caches.
    const rw = L.roadWorksInfo;
    if (rw) {
      state.roadNext = rw.next || null;
      state.roadWidened = Math.max(0, rw.widened | 0);
    }
  }

  // Naissance des nouvelles tuiles (anim de construction 0.5s).
  const seen = {};
  for (const t of L.tiles) {
    seen[t.key] = true;
    if (!CM.born[t.key]) CM.born[t.key] = now;
  }
  for (const d of L.districts || []) {
    seen[d.key] = true;
    if (!CM.born[d.key]) CM.born[d.key] = now;
  }
  // Les clés "wonder:*" sont gérées par la boucle de rendu (animation de levée à
  // la (ré)érection) et NON par cette comptabilité de naissance des tuiles : ne
  // pas les purger ici, sinon l'horodatage de naissance est effacé à chaque
  // recalcul (donc à chaque achat) et l'animation d'apparition rejoue.
  for (const k in CM.born) if (!seen[k] && !k.startsWith("wonder:")) delete CM.born[k];

  CM.layout = L;
  setCityMapEngineTileMap(L.engineTileMap);
  CM.gridN = L.gridN;
  // Géométrie de la nécropole (cités mortes à l'ouest) — recalculée avec le layout
  // (mémoïsé par le throttle ci-dessus ; un effondrement change state.cycles → recompute).
  L.necropolis = buildNecropolis(state, L, CM.TILE);

  // Map précalculée pour le hitTest — O(1) au lieu de deux find() O(n) à chaque mousemove
  CM.tileGrid = new Map();
  for (const t of L.tiles) {
    const spanX = t.spanX || t.size || 1;
    const spanY = t.spanY || t.size || 1;
    for (let ax = 0; ax < spanX; ax += 1) {
      for (let ay = 0; ay < spanY; ay += 1) {
        const key = (t.gx + ax) + "," + (t.gy + ay);
        const existing = CM.tileGrid.get(key);
        if (!existing || t.type === "engine") CM.tileGrid.set(key, t);
      }
    }
  }

  // Filtre : on ne dessine que les routes valides et les jonctions de pont.
  const validRoadSet = L.roadSet || new Set(L.roads.map((r) => `${r.gx},${r.gy}`));
  CM.roadList = L.roads.filter((r) => {
    const k = r.gx + "," + r.gy;
    if (!validRoadSet.has(k)) return false;
    const inWater = L.river && L.river.cells && L.river.cells.has(k);
    if (inWater && r.roadSurface !== "bridge") return false;
    const onBank = L.river && L.river.banks && L.river.banks.has(k);
    if (onBank && r.roadSurface !== "bridge") {
      const adjBridge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const nr = L.roadMap && L.roadMap.get((r.gx + dx) + "," + (r.gy + dy));
        return nr && nr.roadSurface === "bridge";
      });
      if (!adjBridge) return false;
    }
    return true;
  });
  CM.roadSet = validRoadSet;
  // Cellules occupées par le MOBILIER de place (fontaine au centre + drapeaux/lampadaires
  // aux coins) → NON-marchables (sinon les piétons "marchent" dessus). Même géométrie que
  // cityMapDrawPlazas (renderWorld) : centre de dalle = (gx-half + size/2). On exclut ces
  // cellules de walkRoadList → tout l'aval (spawn, pas, flânerie) les évite automatiquement.
  //   • fountainCells : fontaine (centre, +0.34 au sud) — sert AUSSI au Y-SORT (occulteur, agents.js).
  //   • plazaPropCells : coins (drapeaux/lampadaires) — blocage SEUL (thème stable par seedH,
  //     répliqué à l'identique du rendu ; ⚠ garder synchro si cityMapDrawPlazas change).
  CM.fountainCells = new Set();
  CM.plazaPropCells = new Set();
  if (L.plan && Array.isArray(L.plan.plazas)) {
    const band = L.counts ? L.counts.eraBand : 0;
    const pid = L.personality ? L.personality.id : "";
    for (const p of L.plan.plazas) {
      if (!p.size || p.size < 2) continue;
      const half = Math.floor(p.size / 2);
      const cx = (p.gx - half) + p.size / 2, cy = (p.gy - half) + p.size / 2;
      // Fontaine (centre, décalée +0.34 au sud comme le sprite).
      const fwy = cy + 0.34, radX = 0.7, radY = 0.5;
      for (let gy = Math.floor(fwy - radY - 0.5); gy <= Math.ceil(fwy + radY + 0.5); gy += 1)
        for (let gx = Math.floor(cx - radX - 0.5); gx <= Math.ceil(cx + radX + 0.5); gx += 1)
          if (Math.abs((gx + 0.5) - cx) < radX && Math.abs((gy + 0.5) - fwy) < radY) CM.fountainCells.add(gx * 10000 + gy);
      // Coins (drapeaux/lampadaires) : band ≥ 2, thème + saut par coin stables (seedH).
      if (band >= 2) {
        const seedH = ((p.gx * 73856093) ^ (p.gy * 19349663)) >>> 0;
        const croll = ((Math.imul(seedH, 2654435761 + 97) >>> 0) % 1000) / 1000;
        const military = p.kind === "centrale" && pid === "militaire";
        const theme = military ? "flag" : croll < 0.34 ? "none" : croll < 0.67 ? "flag" : "lamp";
        if (theme !== "none") {
          const cd = (p.size / 2) * 0.66;
          let ci = 0;
          for (const [lx, ly] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            const skip = ((Math.imul(seedH, 2654435761 + 211 + ci * 17) >>> 0) % 1000) / 1000;
            ci += 1;
            if (skip < 0.16) continue;
            CM.plazaPropCells.add(Math.floor(cx + lx * cd) * 10000 + Math.floor(cy + ly * cd));
          }
        }
      }
    }
  }
  CM.walkRoadList = L.roads.filter((r) => { const k = r.gx * 10000 + r.gy; return cmIsWalkableRoad(L, r.gx, r.gy) && !CM.fountainCells.has(k) && !CM.plazaPropCells.has(k); });
  // Cellules de route appartenant aux places : cibles de flânerie des piétons.
  CM.plazaRoadCells = [];
  if (L.plan && Array.isArray(L.plan.plazas)) {
    for (const p of L.plan.plazas) {
      for (const r of CM.walkRoadList) {
        if (Math.abs(r.gx - p.gx) <= p.size && Math.abs(r.gy - p.gy) <= p.size) CM.plazaRoadCells.push(r);
      }
    }
  }
  // Clés numériques : évite les allocations string à chaque lookup dans les boucles agents
  CM.walkRoadSet = new Set(CM.walkRoadList.map((r) => r.gx * 10000 + r.gy));
  // ── Parvis des merveilles : réseau piéton + cibles d'attroupement ───────────
  // Les cellules du parvis (L.wonderGround) deviennent MARCHABLES, sauf le CŒUR
  // (socle du monument, rayon cmWonderCoreR) et l'eau. Un ANNEAU de 2 cellules
  // autour du socle sert de cible d'attroupement (wonderGatherCells, avec la
  // direction « face au monument » consommée à l'arrivée). Les véhicules ne sont
  // PAS concernés (leurs pas suivent les masks de route ; le parvis n'en a pas).
  CM.wonderWalkSet = new Set();
  CM.wonderGatherCells = [];
  if (L.wonderGround && L.wonderGround.size && Array.isArray(L.wonderSlots)) {
    const rivC = (L.river && L.river.present && L.river.cells) || null;
    for (let wi = 0; wi < CM_WONDERS.length; wi += 1) {
      const w = CM_WONDERS[wi];
      if (w.id === "era_mega") continue; // dans l'eau : pas de parvis
      const slot = L.wonderSlots[wi];
      // Le slot n'appartient au parvis que si la merveille est érigée dans CE plan.
      if (!slot || !L.wonderGround.has(slot.gx + "," + slot.gy)) continue;
      // Rang LU SUR LE PLAN (L.wonderTiers), pas relu dans `state` : c'est celui
      // qui a dimensionné wonderGround. Un cran d'écart et l'anneau piéton
      // tomberait hors du parvis réellement pavé.
      const tier = (L.wonderTiers && L.wonderTiers[w.id]) || 1;
      const coreR = cmWonderCoreR(w.id, tier);
      cmForEachWonderCell(slot, w.id, L.gridN, (gx, gy, k) => {
        if (!L.wonderGround.has(k)) return;
        if (rivC && rivC.has(k)) return;             // parvis rogné par le fleuve
        const dx = gx - slot.gx, dy = gy - slot.gy;
        const cheb = Math.max(Math.abs(dx), Math.abs(dy));
        if (cheb <= coreR) return;                   // socle : on n'y marche pas
        CM.wonderWalkSet.add(gx * 10000 + gy);
        if (cheb <= coreR + 2) {
          // Face au monument : axe dominant vers le slot (0=E 1=W 2=S 3=N).
          const face = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 0) : (dy > 0 ? 3 : 2);
          CM.wonderGatherCells.push({ gx, gy, face });
        }
      }, tier);
    }
    for (const k of CM.wonderWalkSet) CM.walkRoadSet.add(k);
  }
  // ── Ancres domicile / travail ──────────────────────────────────────────────
  // Cellules-route bordant les LOGEMENTS (toute tuile non-moteur) vs les LIEUX
  // D'ACTIVITÉ (bâtiments-moteur « engine »). Cibles des trajets journaliers des
  // habitants (cf. citizenChooseNext) : le jour vers le travail et les places, le
  // soir vers le domicile. Les doublons sont volontairement gardés → les cellules
  // très bordées (cœur résidentiel, parvis d'atelier) sortent plus souvent au tirage.
  CM.homeRoadCells = [];
  CM.workRoadCells = [];
  if (Array.isArray(L.tiles)) {
    const edgeRoads = (t, out) => {
      const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
      for (let ax = -1; ax <= sx; ax += 1) {
        for (let ay = -1; ay <= sy; ay += 1) {
          if (ax >= 0 && ax < sx && ay >= 0 && ay < sy) continue; // intérieur du bâti
          const gx = t.gx + ax, gy = t.gy + ay;
          if (CM.walkRoadSet.has(gx * 10000 + gy)) out.push({ gx, gy });
        }
      }
    };
    for (const t of L.tiles) edgeRoads(t, t.type === "engine" ? CM.workRoadCells : CM.homeRoadCells);
  }
  // SEUILS : union DÉDUPLIQUÉE des cellules-route bordant un bâtiment, logement ou
  // moteur. Deux usages, tous deux dans agents.js : les habitants NAISSENT sur un
  // seuil de logement et ne s'EFFACENT que sur un seuil quelconque (« ils popent et
  // disparaissent au milieu de la rue », Raph 2026-07-29). Dédupliqué ici, au
  // contraire des deux listes ci-dessus dont les doublons pondèrent le tirage.
  CM.buildingEdgeSet = new Set();
  CM.buildingEdgeList = [];
  for (const src of [CM.homeRoadCells, CM.workRoadCells]) {
    for (const c of src) {
      const k = c.gx * 10000 + c.gy;
      if (CM.buildingEdgeSet.has(k)) continue;
      CM.buildingEdgeSet.add(k);
      CM.buildingEdgeList.push(c);
    }
  }
  // Ponts précalculés : évite Array.filter à chaque frame dans cityMapDrawBridges
  CM.bridgeList = CM.roadList.filter((r) => r.roadSurface === "bridge");
  // Spans de pont (composantes connexes) + repérage du pont HISTORIQUE (le plus
  // proche du cœur, cf. river.bridge). Partagé par le rendu statique ET les
  // lampes nocturnes live. Adjacence orthogonale sur l'ensemble des cellules-pont.
  CM.bridgeSpans = [];
  CM.historicBridgeCells = new Set();
  {
    const bmap = new Map();
    for (const r of CM.bridgeList) bmap.set(r.gx + "," + r.gy, r);
    const seen = new Set();
    const ortho = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const start of CM.bridgeList) {
      const sk = start.gx + "," + start.gy;
      if (seen.has(sk)) continue;
      seen.add(sk);
      const stack = [start], cells = [], exits = [];
      while (stack.length) {
        const r = stack.pop(); cells.push(r);
        for (const [dx, dy] of ortho) {
          const nk = (r.gx + dx) + "," + (r.gy + dy);
          const nb = bmap.get(nk);
          if (nb) { if (!seen.has(nk)) { seen.add(nk); stack.push(nb); } }
          else { const nr = L.roadMap && L.roadMap.get(nk); if (nr) exits.push(nr); }
        }
      }
      let gx0 = Infinity, gx1 = -Infinity, gy0 = Infinity, gy1 = -Infinity;
      for (const c of cells) { if (c.gx < gx0) gx0 = c.gx; if (c.gx > gx1) gx1 = c.gx; if (c.gy < gy0) gy0 = c.gy; if (c.gy > gy1) gy1 = c.gy; }
      CM.bridgeSpans.push({ cells, exits, gx0, gx1, gy0, gy1, vertical: (gy1 - gy0) >= (gx1 - gx0), historic: false, cx: (gx0 + gx1) / 2 });
    }
    if (CM.bridgeSpans.length && L.river && L.river.bridge) {
      const bx = L.river.bridge.x;
      let best = CM.bridgeSpans[0], bd = Infinity;
      for (const sp of CM.bridgeSpans) { const d = Math.abs(sp.cx - bx); if (d < bd) { bd = d; best = sp; } }
      best.historic = true;
      for (const c of best.cells) CM.historicBridgeCells.add(c.gx + "," + c.gy);
    }
  }
  // Routes par rive (hors cellules-pont) : cibles pour biaiser le trafic vers la
  // rive opposée → traversées de pont fréquentes et visibles.
  CM.bankRoads = { n: [], s: [] };
  if (L.river && L.river.present && L.river.riverYAt) {
    const ry = L.river.riverYAt;
    for (const r of CM.walkRoadList) {
      if (L.river.cells && L.river.cells.has(r.gx + "," + r.gy)) continue;
      (r.gy < ry(r.gx) ? CM.bankRoads.n : CM.bankRoads.s).push(r);
    }
  }
  // Précalcul des seeds de route — évite la string `road:${gx}:${gy}:${era}` à chaque frame
  const _eraForSeed = L.counts ? L.counts.eraIndex : 0;
  for (const r of CM.roadList) {
    r._seed = cmHash(`road:${r.gx}:${r.gy}:${_eraForSeed}`);
  }

  // Cellules "ville" : la foret (infinie) ne pousse pas dessus.
  const occ = new Set(L.roadSet ? Array.from(L.roadSet) : L.roads.map((r) => `${r.gx},${r.gy}`));
  for (const t of L.tiles) {
    const span = t.size || 1;
    for (let ax = 0; ax < span; ax += 1) for (let ay = 0; ay < span; ay += 1) occ.add((t.gx + ax) + "," + (t.gy + ay));
  }
  for (const d of (L.districts || [])) {
    for (let ax = 0; ax < d.size; ax += 1) for (let ay = 0; ay < d.size; ay += 1) occ.add((d.gx + ax) + "," + (d.gy + ay));
  }
  const activeWonderOcc = cmWonderActiveIds(state);
  for (let wi = 0; wi < CM_WONDERS.length; wi += 1) {
    if (!activeWonderOcc.has(CM_WONDERS[wi].id)) continue;
    const slot = cmWonderSlot(wi, L.gridN, L.cx, L.cy);
    for (let dy = -WONDER_CLEAR_R; dy <= WONDER_CLEAR_R; dy += 1)
      for (let dx = -WONDER_CLEAR_R; dx <= WONDER_CLEAR_R; dx += 1)
        if (Math.hypot(dx, dy) <= WONDER_CLEAR_R) occ.add((slot.gx + dx) + "," + (slot.gy + dy));
  }
  if (L.river && L.river.cells) {
    for (const k of L.river.cells) occ.add(k);
    for (const k of L.river.banks) occ.add(k);
  }
  CM.occupied = occ;
  // Cellules occupées par un BÂTIMENT (tuiles + districts moteur) — sert au Y-SORT des
  // habitants/véhicules : un agent dont le voisin NORD est un bâtiment est « devant » lui
  // (dessiné en 2e passe pour ne pas être rogné). Recalculé au recompute (tuiles stables).
  const bcells = new Set();
  for (const t of L.tiles) {
    const bx = t.spanX || t.size || 1, by = t.spanY || t.size || 1;
    for (let ax = 0; ax < bx; ax += 1) for (let ay = 0; ay < by; ay += 1) bcells.add((t.gx + ax) + "," + (t.gy + ay));
  }
  for (const d of (L.districts || [])) {
    for (let ax = 0; ax < d.size; ax += 1) for (let ay = 0; ay < d.size; ay += 1) bcells.add((d.gx + ax) + "," + (d.gy + ay));
  }
  CM.buildingCells = bcells;
  // Fiches Y-SORT « peintre » par cellule bâtie (clé gx*10000+gy, fiche PARTAGÉE par
  // empreinte) : x0/x1 = recouvrement colonne (px monde), baseY = ligne de contact au
  // sol (bas d'empreinte — l'ordre du peintre), topY = portée du sprite vers le nord.
  // Maisons/enginehome : hauteur RÉELLE du PNG (houseSpriteHeightTiles, défaut 2.2
  // tuiles tant que pas mesuré). Moteur/civic/districts : clipOnly = ne PEUVENT PAS
  // occulter un agent (scènes basses type champs/marchés, et les tours de district
  // sont bakées SOUS les agents) — seulement le « rognage de tête » côté nord.
  const binfo = new Map();
  const Tpx = CM.TILE;
  for (const t of L.tiles) {
    const bx = t.spanX || t.size || 1, by = t.spanY || t.size || 1;
    const isHouse = t.type === "house" || t.type === "enginehome";
    const hTiles = isHouse ? (houseSpriteHeightTiles(t.variant) || 2.2) : 1.15;
    const rec = {
      x0: t.gx * Tpx, x1: (t.gx + bx) * Tpx,
      baseY: (t.gy + by) * Tpx, topY: ((t.gy + by) - hTiles) * Tpx,
      clipOnly: !isHouse,
    };
    for (let ax = 0; ax < bx; ax += 1) for (let ay = 0; ay < by; ay += 1) binfo.set((t.gx + ax) * 10000 + (t.gy + ay), rec);
  }
  for (const d of (L.districts || [])) {
    const rec = {
      x0: d.gx * Tpx, x1: (d.gx + d.size) * Tpx,
      baseY: (d.gy + d.size) * Tpx, topY: ((d.gy + d.size) - 1.15) * Tpx,
      clipOnly: true,
    };
    for (let ax = 0; ax < d.size; ax += 1) for (let ay = 0; ay < d.size; ay += 1) binfo.set((d.gx + ax) * 10000 + (d.gy + ay), rec);
  }
  CM.buildingInfo = binfo;
  CM.riverRow = -999;

  if (!CM.centered) {
    cityMapCenterCamera(L);
    CM.centered = true;
  }

  // Calcule la cible et supprime l'excédent — l'ajout progressif se fait dans la boucle frame.
  const lateCrowd = Math.max(0, (L.counts.eraIndex || 0) - 11);
  // Foule de fin de partie : ~10 piétons à l'ère 0, jusqu'à ~450 en mégalopole.
  // Ville plus GROUILLANTE en milieu/fin (Raphaël). Sûr côté moteur — le rendu CULL
  // déjà le hors-écran (drawCitizens, coût borné au visible) et l'update par agent est
  // O(1). Densité pilotée par le préréglage Qualité (cmCitizenMul) ou la molette dev
  // window.__citizenMul, qui l'emporte. Cible/plafond + personnalité de ville factorisés
  // dans cmCitizenTargetFor (ré-applicable à chaud lors d'un changement de préréglage).
  const want = cmCitizenTargetFor(L, cmCrowdMul());
  CM.citizenTarget = CM.walkRoadList.length ? want : 0;
  if (!CM.walkRoadList.length) {
    CM.citizens = [];       // plus une seule route marchable : rien où s'effacer, on vide
  } else {
    cmRetireExcessCitizens(want);
  }

  // Trafic evolutif : paniers -> charrettes -> chars/convois -> voitures -> drones.
  const trafficBase = getVehicleDensity(L.counts.eraIndex, "main") * Math.max(1, L.counts.eraIndex) * 2.45 + L.counts.houses / 38 + lateCrowd * lateCrowd * 1.05;
  const wantVeh = cmClamp(trafficBase, 0, L.counts.eraIndex >= 18 ? 80 : L.counts.eraIndex >= 14 ? 55 : L.counts.eraIndex >= 8 ? 35 : 15);
  const trafficSig = `${L.counts.eraIndex}:${wantVeh}:${L.roads.length}:${L.roads.map((r) => r.rank).join("").length}`;
  if (CM.vehicles.length !== wantVeh || CM.vehicleSig !== trafficSig || !CM.walkRoadList.length) {
    CM.vehicleSig = trafficSig;
    CM.vehicles = [];
    const ranked = CM.walkRoadList.filter((r) => getVehicleDensity(L.counts.eraIndex, r.rank || "secondary") > 0.08);
    const weighted = [];
    for (const r of (ranked.length ? ranked : CM.walkRoadList)) {
      if (r.rank === "plaza") continue; // les esplanades sont piétonnes
      const weight = r.rank === "main" ? 11 : r.rank === "avenue" ? 7 : r.rank === "secondary" ? 3 : 0;
      for (let w = 0; w < Math.max(1, weight); w += 1) weighted.push(r);
    }
    const pool = weighted.length ? weighted : CM.walkRoadList;
    for (let n = 0; n < wantVeh && pool.length; n += 1) {
      const r = pool[(n * 53) % pool.length];
      let vehicleType = chooseRoadVehicleType(L.counts.eraIndex, r.rank || "secondary", n);
      // Pas de tram sur les voies (véhicule rail) → retombe sur une voiture.
      if (vehicleType === "tram") vehicleType = "car";
      CM.vehicles.push({
        gx: r.gx, gy: r.gy, x: (r.gx + 0.5) * CM.TILE, y: (r.gy + 0.5) * CM.TILE,
        tx: (r.gx + 0.5) * CM.TILE, ty: (r.gy + 0.5) * CM.TILE,
        fade: 0, // la flotte est reconstruite à chaque recalcul du plan : fondu d'apparition
        dir: n % 2 ? 0 : 2, goal: null, pauseT: 0,
        // Plus de stationnement : les véhicules démarrent et restent en mouvement.
        parkT: 0,
        parkSide: n % 2 ? 1 : -1,
        type: vehicleType,
        speed: vehicleType === "drone" ? 58 + (n % 5) * 7 : vehicleType === "car" || vehicleType === "tram" ? 34 + (n % 6) * 4 : vehicleType === "basket" ? 11 + (n % 3) * 2 : vehicleType === "chariot" ? 24 + (n % 4) * 3 : vehicleType === "caravan" ? 16 + (n % 4) * 2 : 14 + (n % 4) * 2,
        col: vehicleType === "car" || vehicleType === "tram" ? ["#9b4d38", "#c0a85d", "#6f8490", "#a8a092", "#5f6f7c", "#8f6544"][n % 6] : ["#8f6534", "#b08a4a", "#7b5b35", "#c0a46a", "#6f5636", "#9a7440"][n % 6]
      });
    }
  }

  // Trafic fluvial : l'EFFECTIF VOULU par métier (marchand / plaisancier /
  // pêcheur) — la vie de chaque bateau est pilotée par riverFleet.js, appelé une
  // fois par frame en amont de la bascule iso/legacy. Ici on ne fait plus que
  // publier la consigne ; la flotte n'est plus reconstruite en bloc (un pêcheur
  // en pose de 90 s n'y survivait pas).
  const hasRiver = !!(L.river && L.river.present);
  const portLvl = hasRiver ? Math.floor((state.buildings && state.buildings.river_ports) || 0) : 0;
  CM.shipBudget = riverFleetBudget(state, L);

  // Quais d'escale : position sur le ruban de chaque PORT fluvial (pas les moulins),
  // mis en cache par layout. side = vers quelle berge le bateau dérive pour accoster
  // (normale en convention increasing-sample, identique à celle de drawShips).
  if (CM.shipDocksKey !== CM.layoutRecomputeAt) {
    CM.shipDocksKey = CM.layoutRecomputeAt;
    CM.shipDocks = [];
    if (hasRiver && portLvl > 0 && L.river.samples) {
      const sm = L.river.samples, len = sm.length;
      for (const tile of (L.tiles || [])) {
        if (tile.buildingId !== "river_ports") continue;
        const px = tile.gx + (tile.spanX || tile.size || 1) / 2;
        const py = tile.gy + (tile.spanY || tile.size || 1) / 2;
        let bi = 0, bd = Infinity;
        for (let i = 0; i < len; i += 1) { const dd = (sm[i].x - px) ** 2 + (sm[i].y - py) ** 2; if (dd < bd) { bd = dd; bi = i; } }
        const a = sm[Math.max(0, bi - 1)], b = sm[Math.min(len - 1, bi + 1)];
        let tx = b.x - a.x, ty = b.y - a.y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        const nx = -ty, ny = tx;
        const side = ((px - sm[bi].x) * nx + (py - sm[bi].y) * ny) >= 0 ? 1 : -1;
        CM.shipDocks.push({ t: bi / Math.max(1, len - 1), side });
      }
    }
    // Endroits où le PÊCHEUR ne jette pas l'ancre : les chenaux de port (on ne
    // pose pas sa ligne dans le trafic) et le droit des ponts (sa barque
    // disparaîtrait sous le tablier). Même unité que shipDocks : la position t
    // le long du ruban.
    // (Les ponts sont des CELLULES DE ROUTE `roadSurface === 'bridge'` dans
    // roadMap — il n'existe pas de liste de ponts dans le layout.)
    CM.shipAvoidT = CM.shipDocks.map((d) => d.t);
    CM.riverGates = [];
    if (hasRiver && L.river.samples && L.roadMap) {
      const sm = L.river.samples, len = sm.length;
      const seen = new Set();
      for (const c of L.roadMap.values()) {
        if (c.roadSurface !== "bridge") continue;
        let bi = 0, bd = Infinity;
        for (let i = 0; i < len; i += 1) { const dd = (sm[i].x - c.gx) ** 2 + (sm[i].y - c.gy) ** 2; if (dd < bd) { bd = dd; bi = i; } }
        if (seen.has(bi)) continue;          // un pont large couvre plusieurs cellules
        seen.add(bi);
        CM.shipAvoidT.push(bi / Math.max(1, len - 1));
        // PASSE NAVIGABLE : la travée du milieu du pont est ouverte (les palées
        // du chenal sautent, cf. isoBridge). Encore faut-il que les bateaux s'y
        // présentent — un cargo qui franchit le pont au ras de la berge passe
        // dans la pierre. On publie donc le droit du pont comme un point de
        // RECENTRAGE, et l'axe du fleuve est la passe.
        CM.riverGates.push({ t: bi / Math.max(1, len - 1) });
      }
    }
    // ── OBSTACLES PLANTÉS DANS L'EAU ────────────────────────────────────────
    // L'Aiguille Céleste est délibérément posée EN PLEIN FLEUVE (c'est un phare,
    // cf. cmWetWonderSlot) : les bateaux, qui suivent le ruban, lui rentraient
    // dedans. On publie sa position sur le ruban ET son décalage transversal —
    // c'est ce dernier qui dit de quel côté passer.
    //
    // Le test porte sur la GÉOMÉTRIE (la merveille est-elle dans l'eau ?) et non
    // sur son identité : toute future merveille aquatique sera contournée sans
    // qu'on ait à y penser, et une Aiguille qui finirait sur la berge cesserait
    // d'encombrer le chenal pour rien.
    CM.riverObstacles = [];
    if (hasRiver && L.river.samples && Array.isArray(L.wonderSlots)) {
      const sm = L.river.samples, len = sm.length;
      const actifs = cmWonderActiveIds(state);
      for (let idx = 0; idx < CM_WONDERS.length; idx += 1) {
        const w = CM_WONDERS[idx], slot = L.wonderSlots[idx];
        if (!w || !slot || !actifs.has(w.id)) continue;
        let bi = 0, bd = Infinity;
        for (let i = 0; i < len; i += 1) { const dd = (sm[i].x - slot.gx) ** 2 + (sm[i].y - slot.gy) ** 2; if (dd < bd) { bd = dd; bi = i; } }
        const s0 = sm[bi];
        const hw = s0.hw || 2;
        if (Math.sqrt(bd) > hw) continue;         // à sec : rien à contourner
        const a = sm[Math.max(0, bi - 1)], b = sm[Math.min(len - 1, bi + 1)];
        let tx = b.x - a.x, ty = b.y - a.y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        const nx = -ty, ny = tx;
        const lat = (slot.gx - s0.x) * nx + (slot.gy - s0.y) * ny;   // signé, en tuiles
        CM.riverObstacles.push({ t: bi / Math.max(1, len - 1), lat, r: 1.6, id: w.id });
      }
    }
  }
}

function spawnOneCitizen(L) {
  const n = CM.citizens.length;
  // Cellule d'APPARITION : le seuil d'un logement (citizenSpawnCell, agents.js) — plus
  // de piéton qui se matérialise au milieu de la chaussée. Tirage à part du seed
  // d'apparence, qui garde sa formule d'origine (cellule comprise) et donc sa
  // distribution : garde-robe, coiffe et type d'habitant ne bougent pas.
  const r = citizenSpawnCell(cmHash(`${state.cycles || 0}:${n}:seuil`));
  if (!r) return;
  const seed = cmHash(`${state.cycles || 0}:${n}:${r.gx},${r.gy}`);
  // Rôles définis par la config d'âge (huttes → tours), fallback legacy.
  const roleList = (L.ageCfg && L.ageCfg.citizenRoles)
    || CM_ROLES[Math.min(L.counts.eraBand || 0, CM_ROLES.length - 1)];
  const band = L.counts.eraBand || 0;
  // Garde-robe par ère : peaux/lin aux ères primitives, étoffes teintes ensuite.
  // Tons FONCÉS aux ères 0-1 : les teintes claires lisaient comme des points
  // blancs sur les routes sombres (bug "petits points" CE 0.2/0.3).
  const OUTFITS = band <= 1
    ? ["#6e5238", "#5d4630", "#7a5a3c", "#4e3c28", "#66503a", "#54422e"]
    : band <= 3
      ? ["#9a4d38", "#3f6a8a", "#7a8a3c", "#8a5d9a", "#b08a3a", "#5d7a6a"]
      : ["#7a4a68", "#3a6a9a", "#9a3a3a", "#4a8a6a", "#b0883a", "#5a5a8a"];
  const SKINS = ["#e8c8a0", "#d4a878", "#b88a58", "#8a5c38"];
  // Couvre-chefs : capuche sombre, paille, casque selon l'ère (1 sur 3 environ).
  const hatRoll = seed % 9;
  const hat = hatRoll === 0 ? (band <= 1 ? "#5d4226" : "#3c3228")
    : hatRoll === 1 ? (band >= 3 ? "#8a8a92" : "#c8a85a")
    : null;
  // Type d'habitant : 0 homme (42 %) / 1 femme (42 %) / 2 enfant (16 %). Tiré via le
  // seed (déterministe, plus de scintillement) et fixé DÈS le spawn — nécessaire pour
  // moduler la vitesse des enfants et garder l'identité stable dès la 1re frame.
  const cr = (seed >> 6) % 100;
  const charType = cr < 42 ? 0 : cr < 84 ? 1 : 2;
  // Variante de skin (diversité) : 0 = originale, 1 = métisse. Fixée au spawn ; si l'ère
  // n'a pas encore la variante 1, le rendu retombe sur la 0 (agentSpecFor + repli agents.js).
  const skinVariant = (seed >> 13) % 2;
  // Domicile & lieu de travail : ancres fixes tirées via le seed (stables dans le
  // temps). Repli null tant que la ville n'a ni logement ni atelier bordé de route →
  // le piéton garde alors la flânerie libre (cf. citizenChooseNext).
  const homeCells = CM.homeRoadCells, workCells = CM.workRoadCells;
  // Le domicile EST la cellule d'apparition : il sort de chez lui, et c'est là que le
  // soir le ramène (homeBias, citizenChooseNext). Null tant que la ville n'a aucun
  // logement bordé de route — le spawn s'est alors rabattu sur la voirie.
  const home = homeCells && homeCells.length ? r : null;
  const work = workCells && workCells.length ? workCells[(seed >> 8) % workCells.length] : null;
  CM.citizens.push({
    gx: r.gx, gy: r.gy,
    x: (r.gx + 0.5) * CM.TILE, y: (r.gy + 0.5) * CM.TILE,
    tx: (r.gx + 0.5) * CM.TILE, ty: (r.gy + 0.5) * CM.TILE,
    fade: 0, // fondu d'apparition — pas de "point" qui surgit
    dir: -1, goal: null, pauseT: (seed % 5) * 0.2, phase: (seed % 628) / 100,
    charType, skinVariant, home, work,
    // Allure de marche CALME — volontairement plus lente que les véhicules (qui,
    // eux, gardent leur vitesse, cf. CM.vehicles plus haut). La hausse avec la
    // densité urbaine est fortement tempérée pour que les piétons ne doublent plus
    // les charrettes en grande ville. Les enfants trottinent un peu moins vite (×0.85)
    // → les grappes familiales se lisent mieux à l'écran.
    speed: (9 + (n % 7) * 1.5 + L.counts.urbanTier * 0.6) * (charType === 2 ? 0.85 : 1),
    col: OUTFITS[seed % OUTFITS.length],
    skin: SKINS[(seed >> 3) % SKINS.length],
    hat,
    name: cmCitizenName(seed, L.counts.eraBand),
    role: cmPick(roleList, Math.floor(seed / 13))
  });
}

function initCityMap(canvas, options = {}) {
  if (CM.inited) return;
  if (!canvas || typeof canvas.getContext !== "function") return;
  const mapRoot = options.mapRoot || canvas.parentElement;
  const miniCanvas = options.minimap || null;
  const isActive = options.isActive || function () { return true; };

  CM.inited = true;
  CM.canvas = canvas;
  CM.ctx = canvas.getContext("2d");
  if (!CM.ctx) { CM.inited = false; CM.canvas = null; return; } // G-30 : contexte 2D perdu → abandon propre (sinon tailles offscreen NaN)
  CM.mini = miniCanvas;
  CM.mctx = CM.mini ? CM.mini.getContext("2d") : null;
  cityMapEnsureTooltip(mapRoot, options.tooltip);
  const resize = () => cityMapResizeCanvas(canvas);
  resize();
  // Canvases offscreen : sol/routes/arbres (static) + tuiles bâtiments (tile)
  {
    const _pw = Math.max(1, Math.round(CM.cw * CM.dpr));
    const _ph = Math.max(1, Math.round(CM.ch * CM.dpr));
    const _mkOC = (w, h) => typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(w, h)
      : (() => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; })();
    CM.staticCanvas = _mkOC(_pw, _ph);
    CM.sctx = CM.staticCanvas.getContext('2d');
    CM.tileCanvas = _mkOC(_pw, _ph);
    CM.tctx = CM.tileCanvas.getContext('2d');
    // Sol (procédural + pixel + relief) : statique à caméra fixe → baké ici,
    // blitté chaque frame (le sol pixel live coûtait ~7 ms/frame à lui seul).
    CM.groundCanvas = _mkOC(_pw, _ph);
    CM.gctx = CM.groundCanvas.getContext('2d');
    // QUAIS : même raison que le sol — géométrie statique (promenade le long du
    // ruban) qui pesait ~10 000 lineTo par frame en direct. Canvas SÉPARÉ du sol :
    // le quai se dessine APRÈS le fleuve live, il ne peut pas partager son bake.
    CM.quayCanvas = _mkOC(_pw, _ph);
    CM.qctx = CM.quayCanvas.getContext('2d');
    // G-29 : un contexte 2D offscreen null (perdu/épuisé) crasherait setTransform.
    if (!CM.sctx || !CM.tctx || !CM.gctx || !CM.qctx) { CM.inited = false; return; }
    CM.sctx.setTransform(CM.dpr, 0, 0, CM.dpr, 0, 0);
    CM.tctx.setTransform(CM.dpr, 0, 0, CM.dpr, 0, 0);
    CM.gctx.setTransform(CM.dpr, 0, 0, CM.dpr, 0, 0);
    CM.qctx.setTransform(CM.dpr, 0, 0, CM.dpr, 0, 0);
    // Les offscreen ci-dessus sont NEUFS (donc vides) mais CM est un singleton de
    // module qui survit au démontage : sans ça, les états de bake du montage
    // précédent restent « valides » → bake sauté → on blitte du vide jusqu'au
    // premier changement de clé (sortie/retour sur la vue Cité, StrictMode).
    cmInvalidateBakes();
    CM.tileDirtyUntil = 0;
  }
  // Préchargement des sprites d'habitation dès le MONTAGE (avant le 1er paint / bake) : les
  // PNG démarrent tout de suite → pixelHouseReady vrai à la 1re apparition d'un bâtiment,
  // donc pas de repli procédural visible à l'achat. Band de la save = couvre une ouverture
  // directe en ère cosmique. Le recompute rappelle preloadHouseSprites avec la band courante.
  preloadHouseSprites(((cityCounts(state) || {}).eraBand) || 0);
  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
  if (resizeObserver) resizeObserver.observe(canvas);
  window.addEventListener("resize", resize);
  const cleanupInput = bindCityMapInput(canvas, mapRoot, {
    showHover: (sx, sy) => cityMapShowTooltip(cityMapHitTest(sx, sy), sx, sy),
    clearHover: () => cityMapShowTooltip(null),
    onCitizenThoughtClicked: options.onCitizenThoughtClicked
  });
  CM.cleanup = () => {
    cleanupInput();
    resizeObserver?.disconnect();
    window.removeEventListener("resize", resize);
    cityMapShowTooltip(null);
  };
  const cityMapRuntimeDeps = { getVehicleDensity, chooseRoadVehicleType };

  // Cap de frame : cmFrameMs (variable de module) — piloté par le préréglage
  // Qualité (30 fps par défaut/allégé, 60 fps en palier haut). Lu à chaque frame.
  let last = performance.now();
  // ── Cycle jour/nuit ── phase ancrée sur l'horloge murale (Date.now) : la
  // position dans le cycle survit à l'actualisation et aux reloads dev, au lieu
  // de repartir en plein jour à chaque chargement. Courbe à PLATEAUX : le jour
  // est l'état de lecture normal, la nuit un événement court qui met les
  // lumières en valeur — plus de transition permanente façon sinus.
  const DAY_CYCLE_MS = 540000;                              // cycle complet : 9 min
  const DAY_END = 0.55, DUSK_END = 0.65, NIGHT_END = 0.90;  // jour 55 % / crépuscule 10 % / nuit 25 % / aube 10 %
  // Fenêtre d'émeutes : la FIN du plateau de jour — « l'après-midi ». 23 % du
  // cycle, soit la dose de l'ancienne courbe sinus (23,4 %) recalée sur les
  // plateaux (arbitrage Raph 2026-07-20 : revenir à la dose d'origine).
  const RIOT_START = 0.32;                                  // fenêtre = [0.32, DAY_END)
  const smooth01 = (t) => t * t * (3 - 2 * t);
  function cmDayNightF(p) {
    if (p < DAY_END) return 0;
    if (p < DUSK_END) return smooth01((p - DAY_END) / (DUSK_END - DAY_END));
    if (p < NIGHT_END) return 1;
    return smooth01((1 - p) / (1 - NIGHT_END));
  }
  let lastCitizenSpawn = 0;
  function frame(now) {
    // Carte démontée : ne PAS se replanifier (la boucle meurt proprement ;
    // initCityMap relance une boucle neuve au prochain montage).
    if (!CM.ctx || !CM.canvas) return;
    CM.raf = requestAnimationFrame(frame);
    // ⚠ TOLÉRANCE D'UNE DEMI-VSYNC (8 ms) — sans elle, le cap N fps sur un écran
    // à N Hz BOITE. Les timestamps rAF arrivent à ~16,67 ms ± un bruit d'horloge :
    // dès qu'un delta mesure 16,6 < cmFrameMs, la frame est sautée et la suivante
    // arrive à 33,3 ms. Mesuré (2026-07-28, palier Élevée, écran 60 Hz) : la carte
    // ne se mettait à jour que ~41 fois/s en rythme 1-2-1-2 (45 % des intervalles
    // = 2 vsync) — un boitement plus visible que du 30 fps régulier. Le bug était
    // MASQUÉ tant que le GPU saturait (frame ≥ 2 vsync de toute façon) ; la levée
    // de la falaise de l'eau l'a exposé. Avec la tolérance : cap 60 → chaque
    // vsync passe (60 réguliers) ; cap 30 → 16,7 ms reste refusé, 33,3 accepté
    // (30 réguliers, inchangé). La capture, elle, court-circuite le throttle.
    if (now - last < cmFrameMs - 8 && !CM.capture) return;
    const dt = Math.min(1 / 30, (now - last) / 1000); last = now;
    // Capture déterministe : rendre MÊME si la vue est « inactive » (modal de crise,
    // autre onglet) — sinon la capture renvoie un canvas périmé (gotcha harnais).
    const active = isActive() || !!CM.capture;
    if (active && CM.canvas && CM.cw > 0) {
      // Relevé de frame (cf. framePerf.js). Ouvert ICI et non dans le renderer :
      // le préambule ci-dessous coûtait 93 ms contre 32 ms pour tout le dessin.
      fpBegin();
      cityMapEnsureLayout(now, cityMapRuntimeDeps);
      fp('layout');
      // A9 — Clavier tenu (flèches/+/-) puis rattrapage amorti, AVANT le clamp
      // (qui reste le juge final du cadre) : zoom qui glisse, vol de recentrage,
      // inertie de pan.
      cmApplyHeldCamKeys(dt);
      cmCameraGlide(dt);
      cmClampCamera();
      cmCheckWonders(now);
      fp('camera-merveilles');

      // Arrivée progressive des citoyens : cadence selon l'ère et la population
      const target = CM.citizenTarget || 0;
      if (CM.layout && CM.walkRoadList.length && CM.citizens.length < target) {
        const eraIndex = CM.layout.counts ? (CM.layout.counts.eraIndex || 0) : 0;
        // Intervalle en ms : de 2400ms (ère 0) à 120ms (ère 20+), lié à l'ère.
        const msPerCitizen = Math.max(120, 2400 - eraIndex * 120);
        if (now - lastCitizenSpawn >= msPerCitizen) {
          lastCitizenSpawn = now;
          // Rattrapage par petits lots quand la ville est LOIN de sa cible → la foule
          // s'installe en ~30 s au lieu de plusieurs minutes (fondu → pas de pop brutal).
          const deficit = target - CM.citizens.length;
          const batch = deficit > 60 ? 4 : deficit > 20 ? 2 : 1;
          for (let b = 0; b < batch && CM.citizens.length < target; b += 1) spawnOneCitizen(CM.layout);
        }
      }
      // Cycle jour/nuit à plateaux (cf. cmDayNightF) + phase (montante =
      // crépuscule, descendante = aube).
      // Le joueur peut figer le cycle depuis les Options (Auto / Jour / Nuit) —
      // mais l'option ne force que l'AFFICHAGE : l'horloge simulée continue de
      // tourner pour le gameplay via CM.riotWindow, sinon figer le ciel
      // désactiverait les émeutes (bug trouvé en revue 2026-07-20).
      fp('foule-spawn');
      const dayP = (Date.now() / DAY_CYCLE_MS) % 1;
      // En capture, la fenêtre est COUPÉE : un cliché est déterministe, l'heure
      // murale ne doit pas décider si une foule d'émeute y figure (captureFrame
      // isole aussi CM.rioters — la frame forcée purge la sim, cf. updateCrisis).
      CM.riotWindow = !CM.capture && dayP >= RIOT_START && dayP < DAY_END;
      if (CM.capture) {
        // Capture déterministe : plein jour (ou nuit forcée).
        CM.nightF = CM.capture.night; CM.dayRising = false;
      } else if (dayNightMode !== 'auto') {
        CM.nightF = dayNightMode === 'night' ? 1 : 0;
        CM.dayRising = false;
      } else {
        CM.nightF = cmDayNightF(dayP);
        CM.dayRising = dayP < DUSK_END;
      }
      // Indice de santé de la cité (0 = agonie, 1 = prospérité) : la taille
      // pilote l'échelle, la santé pilote l'ambiance (palette, lumières).
      if (CM.capture) { CM.healthF = CM.capture.health; } else {
        let healthT;
        try {
          const pr = pressureBreakdown();
          const vt = cityVitals();
          const prosper = Math.max(0, Math.min(1, 0.55 + vt.foodBonus * 1.6 + vt.goldBonus * 0.9 + vt.knowledgeBonus * 0.9));
          const strain = Math.max(0, Math.min(1, pr.total * 0.5 + (state.instability || 0) * 0.55 + (state.timeWear || 0) * 0.6));
          healthT = Math.max(0, Math.min(1, prosper * 0.45 + (1 - strain) * 0.55));
        } catch (e) { healthT = CM.healthF; }
        // Lissage : la palette glisse au fil des secondes, elle ne saute pas.
        CM.healthF += (healthT - CM.healthF) * Math.min(1, dt * 0.8);
      }
      // pressureBreakdown() + cityVitals() tournent ICI, à chaque frame : deux
      // calculs d'ÉCONOMIE au service d'une teinte qui, elle, est lissée sur
      // plusieurs secondes. Suspect nº 1 du préambule — d'où son propre poste.
      fp('sante-economie');
      // LOD : sous ce zoom, les sprites individuels deviennent du bruit — on
      // bascule sur des masses de quartier + la couche de lumières. Seuil piloté
      // par le préréglage Qualité (cmLodZoom) : 0 en « Élevée » → jamais de LOD,
      // tout reste visible (sprites, lumières, animations) même en dézoom total.
      CM.lodActive = CM.cam.zoom < cmLodZoom;
      // « Élevée » : sol NET pendant le geste (pas de re-blit lissé) — lu par le
      // renderer iso dans sa chaîne de coalescence du sol baké.
      CM.crispGesture = cmCrispGesture;
      // Vie de la carte : UN SEUL point de coupe pour tout ce qui bouge sans
      // porter d'information (particules, fontaines, et les couches à venir).
      // Distinct de la Qualité, qui elle touche la résolution et la densité.
      // En capture, ambiance PLEINE : un cliché ne doit pas dépendre d'une
      // préférence de confort (même raison que la fenêtre d'émeute ci-dessus).
      CM.ambianceK = CM.capture ? 1 : ambianceK();
      // SAISON : un ENTIER, jamais de valeur continue (cf. seasonMode.js). Elle
      // entre dans la clé du bake du sol, donc chaque cran coûte une recuisson :
      // c'est la raison du cycle très lent, et de l'absence de fondu.
      CM.season = currentSeason();
      // MÉTÉO : une seule source par frame, lue par toutes les couches (pluie,
      // assombrissement, densité de foule). En capture, temps dégagé : un cliché
      // est déterministe, l'horloge murale ne décide pas s'il y pleut.
      {
        const w = CM.capture ? { rainF: 0, windX: 0, gustF: 0 } : weatherState();
        CM.rainF = w.rainF;
        CM.windX = w.windX;
        // RAFALE en cours (0..1) : densité, vitesse et inclinaison de l'averse,
        // et l'agitation de l'eau. Un seul signal de plus, lu par les mêmes
        // couches — rien de nouveau à faire vivre entre les frames.
        CM.gustF = w.gustF;
        // Sous l'averse, les rues se vident. On ne recale la foule que par
        // PALIERS (cmRecomputeCitizenTarget tronque la liste des piétons, donc
        // l'appeler à chaque frame hacherait la foule).
        const step = CM.rainF > 0.6 ? 2 : CM.rainF > 0.15 ? 1 : 0;
        if (step !== CM._weatherStep) {
          CM._weatherStep = step;
          CM.weatherCrowdK = step === 2 ? 0.35 : step === 1 ? 0.7 : 1;
          cmRecomputeCitizenTarget();
        }
      }
      // Cache per-frame derived values — constant within a frame, avoids recompute par sprite/route
      // Les fenêtres « allumées » des sprites sont de VRAIES lumières :
      // alpha entièrement piloté par la nuit (0 en plein jour).
      const _n = CM.nightF;
      CM.litWarm = `rgba(255,204,68,${(_n * 0.9).toFixed(2)})`;
      CM.litGold = `rgba(255,220,120,${(_n * 0.95).toFixed(2)})`;
      CM.cmLitColorStr = `rgba(255,${Math.round(204 + (1 - _n) * 28)},${Math.round(68 + (1 - _n) * 64)},${(_n * 0.94).toFixed(2)})`;
      if (CM.layout && CM.layout.counts) {
        CM.frameEraIndex = CM.layout.counts.eraIndex || 0;
        CM.frameRuined = (state.timeWear || 0) > 0.88 || (state.instability || 0) >= 1;
      }
      fp('ambiance-meteo-saison');
      // Detection d'effondrement (anim de destruction centre -> exterieur).
      if (typeof collapseInProgress !== "undefined" && collapseInProgress) { if (!CM.collapseAt) CM.collapseAt = now; }
      else { CM.collapseAt = 0; }
      // Révélation per-buy des maisons-MOTEUR : compteur = maisons du palier (engineHomes)
      // + achats depuis le dernier recompute (borné au LOOKAHEAD=44 du pool pré-placé).
      // Rafraîchi chaque frame (~29 additions) → « 1 achat = 1 bâtiment » qui apparaît,
      // SANS recompute du layout. Calculé AVANT la bascule iso/legacy : les DEUX rendus
      // masquent revealIdx >= compteur (drawTile en legacy, drawIsoLive en iso).
      if (CM.layout && CM.layout.counts) {
        let rawNow = 0; const _b = state.buildings || {};
        for (const meta of CM_MAP_BUILDINGS) rawNow += Math.floor(_b[meta.id] || 0);
        const placed = CM.layout.engineHomePlaced || 0;
        const grown = rawNow - (CM.layout.counts.engineHomesRaw || 0);   // achats depuis le recompute
        // On révèle les 40 DERNIÈRES maisons placées une par une (le reste apparaît au
        // recompute). placed-40 masqué au départ ; chaque achat en révèle une de plus.
        CM.engineHomeReveal = Math.max(0, Math.min(placed, placed - 40 + grown));
        // A4 — Chevron « nouveau bâtiment » : détecter la MONTÉE du compteur de
        // révélation (un achat vient de faire sortir une maison-moteur de terre)
        // et estampiller la tuile concernée ; le rendu iso pose un chevron doré
        // au-dessus, le temps de REVEAL_PIN_MS (drawIsoLive). Aucune caméra ici :
        // c'est la moitié « pastille seule » de la fiche, le vol amorti reste à A9.
        // Le premier passage et tout recompute du layout resynchronisent SANS
        // marquer (les revealIdx changent de référentiel) ; une chute du compteur
        // (effondrement, reset) ne marque pas ; un achat de masse ne marque QUE la
        // dernière tuile — une seule pastille, pas une rafale.
        const _rev = CM.engineHomeReveal;
        if (CM._revealLayoutAt !== CM.layoutRecomputeAt) {
          CM._revealLayoutAt = CM.layoutRecomputeAt;
          CM._revealSeen = _rev;
        } else if (CM._revealSeen === undefined) {
          CM._revealSeen = _rev;
        } else if (_rev > CM._revealSeen) {
          const _last = _rev - 1, _tiles = CM.layout.tiles || [];
          for (let i = 0; i < _tiles.length; i += 1) {
            const _t = _tiles[i];
            if (_t.type === 'enginehome' && (_t.revealIdx || 0) === _last) { _t._revealPinAt = now; break; }
          }
          CM._revealSeen = _rev;
        } else if (_rev < CM._revealSeen) {
          CM._revealSeen = _rev;
        }
      }
      fp('reveal-per-achat');
      // FLOTTE : un SEUL point de simulation, ici, en amont de la bascule
      // iso/legacy — les deux rendus ne font plus que dessiner. Avant, chacun
      // avançait `t` de son côté dans sa fonction de dessin, ce qui a laissé les
      // deux versions diverger en silence (l'escale à quai n'existait qu'en
      // legacy, et le seuil d'ère du vapeur n'était pas le même des deux côtés).
      if (!CM.fleetCtl) CM.fleetCtl = makeFleetCtl();
      const _noLife = !!(CM.capture && CM.capture.citizens === 'none');
      updateRiverFleet(CM.ships, CM.fleetCtl,
        _noLife ? { trade: 0, yacht: 0, fisher: 0 } : (CM.shipBudget || { trade: 0, yacht: 0, fisher: 0 }), dt, {
          docks: CM.shipDocks || [],
          avoidT: CM.shipAvoidT || [],
        });
      fp('flotte');
      // CHANTIER ISO (Phase 1) : rendu losange dédié (iso/isoRenderer.js) — quand le
      // flag est actif, il rend la frame entière (sim des agents incluse) et on SAUTE
      // tout le pipeline de dessin legacy ci-dessous, inchangé au flag près.
      if (CM.iso && drawIsoWorld(dt, now, { bakeMargin: cityMapBakeMargin, blitMargin: cityMapBlitMargin })) {
        // frame iso rendue — le bloc legacy garde son indentation historique.
      } else {
      // --- Couches statiques (rebake si layout/zoom/nuit change OU pan > marge) ---
      // NB: sol ET rivière ne sont PAS dans ce canvas — dessinés live pour l'ordre :
      // sol → rivière → (blit décor : arbres/routes/ponts/lumières).
      const _otherStatic = CM.cam.zoom.toFixed(2) + ':' + CM.layoutRecomputeAt + ':' + CM.nightF.toFixed(1) + ':' + CM.healthF.toFixed(1);
      cityMapBakeMargin(CM.staticCanvas, CM.sctx, '_staticBake', _otherStatic, () => {
        cityMapDrawTrees();
        cityMapDrawUrbanMass(CM.layout);
        cityMapDrawPlazaSurface();
        // Routes : pixel edge-Wang (dans drawPixelTerrain) si flag, sinon procédural.
        if (!(pixelTerrainFlag.on && pixelRoadsFlag.on)) {
          for (const r of CM.roadList) cityMapDrawRoad(r);
          cityMapDrawRoadMarkings();
        }
        if (!(pixelBridgeFlag.on && drawPixelBridges(CM, now))) cityMapDrawBridges();
        cityMapDrawStreetLights(now);
      });
      // Sol + rivière d'abord (sous le canvas statique), puis blit.
      // Le SOL (procédural + tuiles pixel + relief) est statique à caméra fixe :
      // baké dans un canvas offscreen et blitté chaque frame (en live, le sol
      // pixel coûtait ~7 ms/frame). La rivière et les couches animées restent
      // live PAR-DESSUS le blit — ordre inchangé.
      if (CM.groundCanvas) {
        const _otherGround = CM.cam.zoom.toFixed(2) + ':' + CM.layoutRecomputeAt + ':' + CM.healthF.toFixed(1) + ':'
          + (state.timeWear || 0).toFixed(2) + ':' + (CM.frameRuined ? 1 : 0) + ':' + (pixelTerrainFlag.on ? 1 : 0) + ':' + (pixelRoadsFlag.on ? 1 : 0)
          + ':' + (pixelSidewalkFlag.on ? 1 : 0);
        cityMapBakeMargin(CM.groundCanvas, CM.gctx, '_groundBake', _otherGround, () => {
          CM._groundBakeStable = true; // drawPixelTerrain le baisse si tileset de repli
          cityMapDrawGround(CM.layout);
          const _pg = pixelTerrainFlag.on && drawPixelTerrain(CM);
          if (!_pg) cityMapDrawTerrain();
          // Tilesets encore en chargement → renvoyer false = re-bake à la frame suivante.
          return (_pg || !pixelTerrainFlag.on) && CM._groundBakeStable;
        });
        cityMapBlitMargin(CM.groundCanvas, '_groundBake');
      } else {
        // Repli sans canvas offscreen : rendu live historique.
        cityMapDrawGround(CM.layout);
        // Prototype pixel-art : couche terrain en tuiles Wang (herbe + routes de
        // terre) par-dessus le sol procédural, derrière le flag pixelTerrainFlag.
        const _pixelGround = pixelTerrainFlag.on && drawPixelTerrain(CM);
        // Relief en trompe-l'œil (option B) : ombrage de pente sur le sol sauvage
        // + berges, SOUS le fleuve et la ville (qui restent plats).
        if (!_pixelGround) cityMapDrawTerrain();
      }
      // Prototype pixel-art : corps d'eau clippé au ruban (Approche A), derrière
      // le flag pixelWaterFlag. Renvoie false (layout/fleuve absent) -> fallback
      // sur le rendu vectoriel intact. Inséré à la place exacte de l'ancien appel
      // -> ordre de blit préservé (ponts/bateaux recouvrent l'eau gratuitement).
      if (!(pixelWaterFlag.on && drawPixelRiver(CM, now))) cityMapDrawRiver(now);
      // Quais : berge construite (pierre/béton/énergie) là où la ville borde l'eau,
      // SUR le bord du fleuve mais SOUS le blit statique (ponts/routes/bâtiments).
      cityMapDrawQuays(now);
      // Reflets nocturnes des bâtiments riverains sur l'eau (nappes lumineuses
      // clippées au ruban), sous les bateaux/blit statique.
      cityMapDrawCityReflections(now);
      // Bateaux SUR la couche eau : ils passent sous les ponts, routes et
      // bâtiments (le blit statique les recouvre aux croisements).
      drawShips();
      if (CM.staticCanvas) {
        cityMapBlitMargin(CM.staticCanvas, '_staticBake');
      } else {
        // sol + rivière déjà dessinés live au-dessus
        cityMapDrawTrees();
        cityMapDrawUrbanMass(CM.layout);
        cityMapDrawPlazaSurface();
        // Routes : tuiles pixel edge-Wang (dessinées dans drawPixelTerrain) si le flag
        // est actif ; sinon rendu procédural (voies doubles + marquages) PAR-DESSUS le sol.
        if (!(pixelTerrainFlag.on && pixelRoadsFlag.on)) {
          for (const r of CM.roadList) cityMapDrawRoad(r);
          cityMapDrawRoadMarkings();
        }
        if (!(pixelBridgeFlag.on && drawPixelBridges(CM, now))) cityMapDrawBridges();
        cityMapDrawStreetLights(now);
      }
      // --- Couches dynamiques (animees, chaque frame) ---
      // Agents AVANT les batiments -> charrettes/pietons/navires passent derriere.
      cityMapDrawPlazas(now);
      updateVehicles(dt);
      // En vue dézoomée (LOD), piétons et trafic au sol ne sont plus que du
      // bruit de 1-2px : on ne les dessine pas (ils continuent d'exister).
      // drawGroundAgents = MAJ citoyens + rendu SOL (piétons + véhicules) triés ENSEMBLE
      // par Y (1re passe : agents « derrière » un bâtiment).
      if (!CM.lodActive) {
        drawGroundAgents(dt, now);
      }
      // Props TALL des places (fontaines + drapeaux/lampadaires) dessinés ICI (entre les 2
      // passes d'habitants) → Y-SORT : au sud du prop = devant (2e passe), au nord = derrière
      // (déjà dessiné). Le mobilier bas (bancs/bacs) reste dans cityMapDrawPlazas (avant agents).
      cityMapDrawPlazaTallProps(now);
      const tw = state.timeWear || 0, maxD2 = CM.layout ? CM.layout.maxD2 : 1;
      // (CM.engineHomeReveal est calculé AVANT la bascule iso/legacy, cf. plus haut.)
      if (CM.layout) {
        if (now >= CM.tileDirtyUntil && CM.tileCanvas) {
          // Hors fenêtre de naissance : bake les tuiles statiques (marge = pan fluide),
          // engine toujours live. La clé inclut engineHomeReveal → re-bake quand une
          // maison-moteur est révélée (per-buy, ~5 ms, pas les 800 ms du recompute).
          const _otherTile = CM.layoutRecomputeAt + ':' + CM.cam.zoom.toFixed(2) + ':' + tw.toFixed(2) + ':' + (CM.frameRuined ? 1 : 0) + ':' + (CM.engineHomeReveal || 0);
          cityMapBakeMargin(CM.tileCanvas, CM.tctx, '_tileBake', _otherTile, () => {
            for (const t of CM.layout.tiles) if (t.type !== "engine") drawTile(t, now, tw, maxD2);
          });
          cityMapBlitMargin(CM.tileCanvas, '_tileBake');
          // Tuiles engine toujours dessinées live : leurs sprites ont des animations (feu, roues...).
          for (const t of CM.layout.tiles) if (t.type === "engine") drawTile(t, now, tw, maxD2);
        } else {
          // Pendant la fenêtre de naissance : tout live
          for (const t of CM.layout.tiles) drawTile(t, now, tw, maxD2);
        }
      }
      // Y-SORT — 2e passe : agents DEVANT un bâtiment (voisin nord bâti), dessinés PAR-DESSUS
      // le blit des bâtiments pour ne pas être rognés. dt=0 → aucune MAJ (déjà faite plus haut).
      // Piétons + véhicules « devant » toujours triés ENSEMBLE par Y (drawGroundAgents).
      if (!CM.lodActive) {
        drawGroundAgents(0, now, true);
      }
      // Santé : voile global (désaturation/brun en crise, vibrance en prospérité)
      // appliqué AVANT la nuit — les merveilles, dessinées après, y échappent.
      cityMapDrawHealthTint();
      // Nuit : assombrit la scene, les villes avancees se mettent a briller.
      cityMapDrawNight(now);
      // Tapis de lumières nocturnes : fenêtres, districts, phares (additif).
      cityMapDrawCityLights(now);
      // Lampes de pont (additif) : par-dessus le voile de nuit, comme les fenêtres.
      cityMapDrawBridgeLights(now);
      drawCrisis(dt, now);
      // Merveilles (trophees) par-dessus la nuit : elles restent eclatantes.
      // Seules les merveilles RÉÉRIGÉES ce cycle (cf. cmWonderActive) sont dessinées ;
      // une merveille en sommeil (cité pas encore assez grande) rejouera son
      // animation de levée quand l'ère atteindra son seuil — on (re)cale alors son
      // horodatage de naissance, et on l'efface quand elle redevient dormante.
      if (CM.layout && Array.isArray(state.wonders)) {
        const activeWonders = cmWonderActiveIds(state);
        const pv = CM.previewWonder; // aperçu dev (__showWonder) : force le rendu
        for (let wi = 0; wi < CM_WONDERS.length; wi += 1) {
          const w = CM_WONDERS[wi];
          if (activeWonders.has(w.id) || (pv && pv.id === w.id)) {
            if (!CM.born["wonder:" + w.id]) CM.born["wonder:" + w.id] = now;
            drawWonder(w, wi, now);
          } else if (CM.born["wonder:" + w.id]) {
            delete CM.born["wonder:" + w.id];
          }
        }
      }
      drawVehicles(now, "air"); // drones au-dessus
      if (!CM.lodActive) drawCitizenThoughts(now);
      } // fin du pipeline legacy (voir la bascule CM.iso en tête de bloc)
      fpEnd();
    }
  }
  // Premiere mise en page immediate puis boucle.
  if (CM.cw === 0) resize();
  // Hook de diagnostic : force une frame (utile quand rAF est gele en arriere-plan).
  CM.forceFrame = () => { if (!CM.ctx || !CM.canvas) return false; resize(); frame(performance.now()); return true; };
  // Capture DÉTERMINISTE d'une frame (vérif visuelle) : court-circuite le throttle,
  // force le plein jour (pas de voile nuit qui fausse les pixels) et une santé fixe,
  // fige le temps d'animation. N'altère PAS le rendu normal (tout est gardé par le
  // flag CM.capture, nul en fonctionnement). Renvoie un dataURL (PNG par défaut).
  CM.captureFrame = (opts = {}) => {
    if (!CM.canvas) return null;
    const saved = { night: CM.nightF, health: CM.healthF, last };
    // Émeutes : riotWindow=false en capture (déterminisme) fait PURGER la sim
    // par updateCrisis — on lui donne un tableau jetable et on remet la vraie
    // foule (et ses compteurs d'apaisement) après le cliché, sinon capturer
    // pendant une émeute la dissiperait pour de bon.
    const savedRiot = {
      rioters: CM.rioters, goal: CM.riotGoal, goalAt: CM.riotGoalAt,
      calmed: CM.riotCalmed, calmDecayT: CM.riotCalmDecayT, draw: CM.riotDraw,
    };
    CM.rioters = [];
    // `citizens` est mémorisé sur CM.capture : vider les pools ne suffisait pas,
    // la frame les regarnissait aussitôt (l'ancien code reconstruisait la flotte
    // dès que son effectif ne collait plus). Le budget doit être coupé À LA
    // SOURCE pour qu'un cliché « sans vie » ait vraiment un fleuve vide.
    CM.capture = { night: opts.night ?? 0, health: opts.health ?? 1, citizens: opts.citizens };
    if (opts.citizens === 'none') { CM.citizens.length = 0; CM.vehicles.length = 0; CM.ships.length = 0; }
    last = -1e9; // by-passe le throttle pour forcer un vrai rendu
    resize();
    frame(opts.now ?? 0);
    CM.capture = null;
    let out = CM.canvas;
    const scale = opts.scale || 1;
    if (scale !== 1) {
      out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(CM.canvas.width * scale));
      out.height = Math.max(1, Math.round(CM.canvas.height * scale));
      const g = out.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(CM.canvas, 0, 0, out.width, out.height);
    }
    const url = opts.jpeg ? out.toDataURL('image/jpeg', opts.quality || 0.82) : out.toDataURL('image/png');
    CM.nightF = saved.night; CM.healthF = saved.health; last = saved.last;
    CM.rioters = savedRiot.rioters; CM.riotGoal = savedRiot.goal; CM.riotGoalAt = savedRiot.goalAt;
    CM.riotCalmed = savedRiot.calmed; CM.riotCalmDecayT = savedRiot.calmDecayT; CM.riotDraw = savedRiot.draw;
    return url;
  };
  // Hook dev : capture puis POST au middleware Vite -> écrit .preview-shots/<name>.png.
  if (typeof window !== 'undefined' && import.meta && import.meta.env && import.meta.env.DEV) {
    window.__cityShot = async (opts = {}) => {
      const url = CM.captureFrame(opts);
      if (!url) return { err: 'no frame' };
      const blob = await (await fetch(url)).blob();
      const res = await fetch('/__shot?name=' + encodeURIComponent(opts.name || 'shot'), { method: 'POST', body: blob });
      return res.ok ? await res.json() : { err: 'post ' + res.status };
    };
    // Aides de vérif : accès à l'état + forçage d'un recalcul de carte. Permet de
    // monter une ville de démo (population/bâtiments) puis de capturer une frame.
    window.__state = state;
    window.__D = D;
    // L'INSTANCE CM de la page (pas d'import !) : le double-graphe HMR fait
    // qu'un `import('/src/game/map/layout.js')` depuis la console/outils peut
    // renvoyer une COPIE fraîche sans layout/forceFrame — piloter via __CM.
    window.__CM = CM;
    window.__cityRecompute = () => { CM.layout = null; CM.centered = false; cmInvalidateBakes(); };
    // TISSU URBAIN : part de voirie / bâti / vide, maille, taille des îlots.
    // C'est le tableau de bord du chantier « micmacs de routes »
    // (docs/PLAN-TISSU-URBAIN.md) : chaque lot se juge dessus AVANT de se juger
    // à l'œil. `__tissu()` imprime le rapport et rend les nombres bruts.
    window.__tissu = () => {
      if (!CM.layout) return { err: 'carte pas construite — ouvre la Cité' };
      const m = tissuMetrics(CM.layout);
      console.log(tissuReport(m));
      return m;
    };
    // BANC DU BATCHER WebGL (chantier rendu) : compare, sur les VRAIS sprites du
    // jeu et à l'échelle d'une frame de dézoom, le débit de Canvas 2D (un
    // `drawImage` par sprite) et celui du batcher (un seul appel de dessin).
    // C'est la mesure qui décide de la greffe — et elle doit se faire sur la
    // machine de JEU, la seule dont le GPU compte. Usage : await __glBench().
    window.__glBench = async (opts = {}) => {
      const N = opts.n || 3000;
      const passes = opts.passes || 12;
      if (!glInit()) return { erreur: 'WebGL2 indisponible sur ce poste' };
      // Sources RÉELLES : les habitations décodées de la bande courante.
      const srcs = [];
      for (const im of pixelHouseImages()) if (im && (im.naturalWidth || im.width)) srcs.push(im);
      if (!srcs.length) return { erreur: 'aucun sprite décodé — ouvre la carte puis relance' };
      const W = CM.cw || 1200, H = CM.ch || 600;
      const ctx = CM.ctx;
      // Positions tirées une fois : les deux chemins dessinent EXACTEMENT la
      // même chose, au même endroit, dans le même ordre.
      const items = [];
      for (let i = 0; i < N; i++) {
        const s = srcs[i % srcs.length];
        const sw = s.naturalWidth || s.width, sh = s.naturalHeight || s.height;
        const k = 0.5;
        items.push({ s, sw, sh, x: Math.round((cmHash('bx' + i) % 10000) / 10000 * W), y: Math.round((cmHash('by' + i) % 10000) / 10000 * H), w: Math.round(sw * k), h: Math.round(sh * k) });
      }
      // ⚠ SYNCHRONISATION OBLIGATOIRE. Les deux pipelines sont asynchrones :
      // sans forcer l'attente, on chronomètre le remplissage d'une file, pas le
      // travail du GPU (le piège « drawImage/s ne mesure rien quand le GPU
      // sature » de la reprise perf). `getImageData(1×1)` vide le pipeline 2D,
      // `glFinish` bloque jusqu'à la fin du GPU.
      const sync2d = () => ctx.getImageData(0, 0, 1, 1);
      // DÉBIT SOUTENU : `passes` répétitions enchaînées puis UNE synchronisation,
      // divisé par le nombre de passes. Synchroniser à chaque passe mesurerait
      // surtout l'attente du vsync (~16 ms), qui écraserait le signal.
      let refuses = 0, rendus = 0;
      const run2d = () => {
        const prev = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        for (const it of items) ctx.drawImage(it.s, 0, 0, it.sw, it.sh, it.x, it.y, it.w, it.h);
        ctx.imageSmoothingEnabled = prev;
      };
      const runGl = () => {
        glBegin(W, H, CM.dpr || 1);
        for (const it of items) if (!glQuad(it.s, 0, 0, it.sw, it.sh, it.x, it.y, it.w, it.h)) refuses++;
        rendus = glFlush();
        ctx.drawImage(glGetCanvas(), 0, 0, W, H);   // composition dans la frame
      };
      // Chauffe (compilation de shaders, upload d'atlas, caches du pilote).
      run2d(); runGl(); sync2d(); glFinish();
      let t0 = performance.now();
      for (let p = 0; p < passes; p++) run2d();
      sync2d();
      const m2d = +((performance.now() - t0) / passes).toFixed(2);
      refuses = 0;
      t0 = performance.now();
      for (let p = 0; p < passes; p++) runGl();
      glFinish(); sync2d();
      const mgl = +((performance.now() - t0) / passes).toFixed(2);
      window.__glBenchLast = { rendus, refuses: Math.round(refuses / passes) };
      return {
        sprites: N,
        canvas2D_ms: m2d,
        webgl_ms: mgl,
        gain: m2d > 0 ? '×' + (m2d / mgl).toFixed(1) + ' plus rapide' : 'n/a',
        rendusParLot: window.__glBenchLast,
        atlas: glStats(),
      };
    };
    // MONTAGE DE DÉMO EN UN APPEL (Phase 0 chantier iso) — concentre tous les gotchas
    // du harnais : fige tick+autosave (clearInterval), pompe l'état SANS déclencher la
    // crise (instability/timeWear remis à 0 avant ET après), recompute, fait tourner la
    // sim à la main (rAF gelé en pane cachée → forceFrame), re-clique le dialog de crise
    // s'il a surgi, et neutralise les fondus de naissance (CM.born → -1e6) pour que la
    // capture déterministe voie les bâtiments. Usage : await __demoCity({ pop:'1e23' }).
    window.__demoCity = async (opts = {}) => {
      for (let i = 1; i < 1e5; i += 1) clearInterval(i);
      const pop = opts.pop || '1e23';
      state.population = D(pop); state.knowledge = D(pop); state.infrastructure = D(pop);
      state.instability = 0; state.timeWear = 0;
      const minB = opts.buildings == null ? 40 : opts.buildings;
      if (state.buildings) for (const k of Object.keys(state.buildings)) state.buildings[k] = Math.max(state.buildings[k] || 0, minB);
      window.__cityRecompute();
      const frames = opts.frames == null ? 16 : opts.frames;
      for (let k = 0; k < frames; k += 1) { CM.forceFrame(); await new Promise((r) => setTimeout(r, 90)); }
      state.instability = 0; state.timeWear = 0;
      const dlgBtn = document.querySelector('dialog button'); if (dlgBtn) dlgBtn.click();
      if (CM.born) for (const k of Object.keys(CM.born)) CM.born[k] = -1e6;
      CM.forceFrame();
      return { layout: !!CM.layout, veh: CM.vehicles.length, cit: CM.citizens.length, era: CM.layout && CM.layout.counts ? CM.layout.counts.eraIndex : null };
    };
    window.__pixelTerrain = (on) => { pixelTerrainFlag.on = !!on; cmInvalidateBakes(); };
    window.__pixelRoads = (on) => { pixelRoadsFlag.on = !!on; cmInvalidateBakes(); };
    // Trottoir : on/off + réglage live. __sidewalkTune({ widthK, curbK, desat, lift, minBand })
    // fusionne les clés passées ; les deux rebakent le sol. Ex. __sidewalkTune({ widthK: 7 }).
    window.__sidewalk = (on) => { pixelSidewalkFlag.on = on !== false; CM._groundBake = null; };
    window.__sidewalkTune = (o) => { if (o) Object.assign(sidewalkTune, o); CM._groundBake = null; return { ...sidewalkTune }; };
    // Bord de quai = berge maçonnée : réglage live. __quayWall({ on, full, heightK, joints })
    // fusionne les clés. full=true → tout le long de l'eau ; false → berges urbaines.
    // Quai LIVE → pas de rebake. Ex. __quayWall({ full: false }) / __quayWall({ heightK: 1.4 }).
    window.__quayWall = (o) => { if (o) Object.assign(quayWallTune, o); return { ...quayWallTune }; };
    // Densité de foule : multiplie cible ET plafond d'habitants (défaut 1). Force un refresh
    // du plan pour l'appliquer tout de suite. Baisser si ça rame. Ex. __crowd(1.5) / __crowd(0.6).
    window.__crowd = (m) => { window.__citizenMul = (m == null ? 1 : +m); CM.layout = null; CM.centered = false; return { citizenMul: window.__citizenMul, target: CM.citizenTarget }; };
    window.__pixelTileset = (name) => { setPixelTileset(name); cmInvalidateBakes(); };
    window.__pixelWater = (on) => { setPixelWater(on); cmInvalidateBakes(); };
    // Vaguelettes animées de l'eau (façon TheoTown) : réglage live. Eau LIVE → pas de rebake.
    // __waterRipples({ on, lanes, freq, speed, thresh, alpha, color }). Ex. __waterRipples({ alpha: 0.5 }).
    window.__waterRipples = (o) => { if (o) Object.assign(waterRippleTune, o); return { ...waterRippleTune }; };
    // Bas-fond clair des rives (iso) : réglage live. __waterShore({ on, w1,w2,w3, a1,a2,a3, c1,c2,c3 }).
    window.__waterShore = (o) => { if (o) Object.assign(waterShoreTune, o); return { ...waterShoreTune }; };
    window.__pixelBridge = (on) => { pixelBridgeFlag.on = !!on; CM._staticBake = null; };
    // Le pont pixel est baké dans le canvas statique → invalider ce cache quand une
    // scène de pont finit de décoder (sinon le pont vectoriel de repli reste baké).
    setBridgeOnLoad(() => { CM._staticBake = null; });
    // Vérif états de déclin du fleuve : force le drapeau d'effondrement (l'usure se
    // force via window.__state.timeWear = 0.8). Remettre __collapse(false) après.
    window.__collapse = (on) => { setCollapseInProgress(!!on); cmInvalidateBakes(); };
    window.__cityBand = () => (CM.layout && CM.layout.counts) ? CM.layout.counts.eraBand : null;
    // Vérif véhicules : force le type de tous les véhicules présents (attelages, etc.).
    // __forceVehicles('chariot') | 'wagon' | 'caravan' ... ; __forceVehMix() = un de chaque.
    window.__forceVehicles = (type) => { for (const v of CM.vehicles) { v.type = type; v.fade = 1; } return CM.vehicles.length; };
    window.__forceVehMix = (types = ['chariot', 'wagon', 'caravan']) => { CM.vehicles.forEach((v, i) => { v.type = types[i % types.length]; v.fade = 1; }); return CM.vehicles.length; };
    // Aperçu des MERVEILLES à n'importe quel rang, sans toucher au save ni
    // attendre l'ère : __showWonder(id|index, rang 1..5) force le rendu de la
    // merveille (CM.previewWonder, runtime seulement) et centre la caméra.
    //   __showWonder("era_mega", 5)   __showWonder(2, 3)   __showWonder("arc", 4)
    //   __hideWonder()  pour arrêter.  ids : dynasty1 pop1m era_kingdom
    //   era_empire era_mega era_singularity.
    window.__showWonder = (id, tier = 5) => {
      const wi = typeof id === "number" ? id
        : CM_WONDERS.findIndex((w) => w.id === id || w.id.indexOf(id) === 0 || w.id.indexOf("_" + id) >= 0);
      if (wi < 0 || wi >= CM_WONDERS.length) return "inconnu. " + CM_WONDERS.map((w, i) => i + ":" + w.id).join("  ");
      const w = CM_WONDERS[wi];
      const t = Math.max(1, Math.min(5, tier | 0));
      CM.previewWonder = { id: w.id, tier: t };
      CM.born["wonder:" + w.id] = -1e6; // déjà érigée : pas d'animation de poussée
      // Le PLAN traite l'aperçu comme érigée (parvis, carve des routes, réserve —
      // cf. builtWonderIds dans layout.js) → recalcul immédiat pour un aperçu fidèle.
      CM.layout = null;
      const center = () => {
        if (!CM.layout || !CM.layout.wonderSlots) { requestAnimationFrame(center); return; }
        const slot = cmWonderSlot(wi, CM.layout.gridN, CM.layout.cx, CM.layout.cy);
        CM.cam.x = slot.gx * CM.TILE + CM.TILE / 2;
        CM.cam.y = slot.gy * CM.TILE - CM.TILE * 4;
        CM.cam.zoom = 1.3;
        CM.centered = true;
      };
      center();
      return w.name + " — rang " + WONDER_TIER_NAMES[t] + "  (rangs 1..5 ; __hideWonder() pour arrêter)";
    };
    window.__hideWonder = () => { CM.previewWonder = null; CM.centered = false; CM.layout = null; return "aperçu arrêté"; };
    // Accès direct au runtime carte (caméra, véhicules, layout) pour la vérif visuelle :
    // ex. centrer/zoomer sur un attelage avant __cityShot.
    window.__CM = CM;
  }
  CM.raf = requestAnimationFrame(frame);
}


setResetCameraCenterHandler(() => { CM.centered = false; });

// HMR : la boucle rAF et ses closures capturent les fonctions de rendu à l'init —
// un hot-update laissait tourner l'ANCIEN code en silence. Le full-reload des
// modules carte est forcé CÔTÉ SERVEUR par mapFullReloadPlugin (vite.config.js) ;
// import.meta.hot.decline() serait un no-op dans Vite moderne.

export { CM, initCityMap };
