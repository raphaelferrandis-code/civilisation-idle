// ✔ LE `/* eslint-disable */` DE TÊTE A ÉTÉ RETIRÉ le 2026-08-23 (étape 6). Il
// couvrait le pipeline top-down ; une fois celui-ci parti, il ne restait qu'une
// seule erreur — un paramètre de `catch` inutilisé — corrigée du même coup.
// ⚠ CE N'EST PAS COSMÉTIQUE : le piège P24 constatait que le lint était AVEUGLE
// sur ce fichier, alors que le plan comptait dessus comme garde-fou de l'étape 4.
// La porte est rendue, et l'étape 7 (suppression du drapeau `CM.iso`) en profite.
// Ne pas remettre ce commentaire magique sans raison écrite.
import { state, collapseInProgress, setCollapseInProgress, renderCache, openView, buildingById } from '../core/state.js';
import { tr } from '../core/i18n.js';
import { D } from '../core/num.js';
import { pressureBreakdown, cityVitals, currentEraIndex } from '../core/mechanics.js';
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
  cmEngineHomeHidden,
  cmCheckWonders,
  cityCounts,
  cmIsWalkableRoad,
  cmClamp,
  cmHash,
  CM_ROLES,
  cmCitizenName,
  cmDeName,
  cmResidenceName,
  cmPick,
  WONDER_TIER_NAMES
} from './layout.js';
import { setResetCameraCenterHandler, setRoadDoors } from './cityMapBridge.js';
import { resolveShortcut, resolveCameraKey } from '../core/shortcuts.js';
import { dayNightMode } from './dayNightMode.js';
import { qualitySettings } from './qualityMode.js';
import { mapFrameMs, noteMapInput, noteMapCamera } from './energySaver.js';
import { makeVsyncEstimator } from './frameCadence.js';
import { CHUTE } from './iso/chuteState.js';
import { mountFpsProbe } from './fpsProbe.js';
import { ambianceK } from './ambianceMode.js';
import { weatherState, weatherMode } from './weatherMode.js';
import { firstGameGraceActive, makeGraceLatch } from './firstGameGrace.js';
import { currentSeason } from './seasonMode.js';
import { buildNecropolis } from './necropolis.js';
import { cityCrisisBand } from './procedural/cityPersonality.js';
import { preloadHouseSprites, houseSpriteHeightTiles, houseSpriteReachTilesIso } from './pixelHouses.js';
// CHANTIER ISO (Phase 1) : projection unique — obligatoire pour TOUT passage
// monde↔écran. Plus personne ne projette à la main — la règle d'or du chantier
// iso, désormais sans alternative : il n'y a plus qu'une projection.
import { worldToScreen, screenToWorld, screenDeltaToPan, wonderAnchor, ISO_X, ISO_Y, snapZoom } from './iso/projection.js';
import { annoncer } from '../audio/moments/annonces.js';
import { drawIsoWorld } from './iso/isoRenderer.js';
// `plaisirsHitTest` a rejoint isoPlaisirs.js le 2026-08-23, avec le sprite du
// monument dont il lit l'encre : c'est ce sprite qu'il interroge pour savoir si le
// clic tombe sur la maison. Le peintre n'avait aucune raison de le porter.
import { plaisirsHitTest } from './iso/isoPlaisirs.js';
import { plazaWalkAnchors } from './iso/isoPlaza.js';
import { fenceWalkBlock } from './iso/isoFence.js';
// Les faits divers (docs/PLAN-FAITS-DIVERS.md) : leurs scènes passent par la petite
// vie ; leur clic passe AVANT celui de la carte (bindFaitsDiversInput).
import { bindFaitsDiversInput } from './faitsDivers/index.js';
// `waterShoreTune` est parti dans isoPalette.js le 2026-08-23 : c'est un RÉGLAGE de
// teinte, pas du peintre. La molette `__waterShore` plus bas l'écrit par Object.assign
// — mutation d'objet, donc légale sur une liaison importée.
import { waterShoreTune } from './iso/isoPalette.js';
import { riverIslandObstacles, riverDodge, tradeStage, tradeSizeMul } from './iso/isoFleet.js';
import { boatSpecFor, boatFootprint } from './iso/boatKit.js';
import { fleetBerths, fleetPortMarks, projectOnRibbon } from './iso/boatBerths.js';
import { fleetFor, fleetRoles, BOAT_MODELS } from './iso/boatKits.js';
import { ferrySite, navWindow, ribbonLength, quayHiddenDepth, FERRY_TIP, shuttleSite, ribbonAt } from './riverFleet.js';
import { MAISON_LANDING_PX } from './iso/boatKitsPlaisirs.js';
import { visibleSide, stairPontoon, edgePontoon, pontoonFace, PONTOON_LEN } from './iso/boatLandings.js';
import { wantQuayStairs, ensureQuayGeo, quayWantedFoot } from './iso/isoQuay.js';

// Taille d'une coque pour la NAVIGATION (tuiles) : celle du kit de bateaux quand
// l'ère en a un (iso/boatKits.js), sinon l'échelle historique des sprites PixelLab.
function fleetServiceMode(sh) {
  const c = (CM.layout && CM.layout.counts) || {};
  const sp = boatSpecFor(sh, c.eraBand | 0);
  const M = sp && BOAT_MODELS[sp.id];
  return (M && M.service) || 'patrol';
}
function fleetHullSize(sh) {
  const c = (CM.layout && CM.layout.counts) || {};
  const band = c.eraBand | 0;
  const fp = boatFootprint(boatSpecFor(sh, band));
  if (fp) return fp;
  if (sh.kind === 'fisher') return { len: 0.9, beam: 0.32 };
  const len = 0.7 * tradeSizeMul(tradeStage(band, c.eraIndex | 0), band);
  return { len, beam: len * 0.3 };
}
import { fpBegin, fp, fpEnd } from './framePerf.js';
// Filet d'exception de la boucle et du plan (audit du 2026-10-05, BUG-32).
import { reportMapError, recoverMapFrame, LAYOUT_RETRY_MS } from './frameGuard.js';
import { endLightLayer } from './lightLayer.js';
import { solTrace, solRec, keyDiff } from './solTrace.js';
import { solInvalidate } from './iso/solInvalidate.js';
import { solPyramideAB } from './iso/solPyramide.js';
import { tissuMetrics, tissuReport } from './tissuMetrics.js';
// Ces imports sont VIVANTS (élagués à la mesure le 2026-08-23,
// docs/PLAN-SUPPRESSION-LEGACY.md) : `maskHit` sert au survol des bâtiments (cityMapHitTest),
// `cityMapCalmRioterAt` au clic d'apaisement, le trio du quai (`quayWallTune`,
// `quayWallTiles`, `ensureQuayGate`) au placement des pontons et des escaliers, et
// les fonctions d'agents.js au trafic et à la foule.
import { maskHit } from './iso/isoMask.js';
import { cityMapCalmRioterAt, quayWallTune, quayWallTiles, ensureQuayGate } from './quaysAndRiot.js';
import { getVehicleDensity, chooseRoadVehicleType, vehSkinFor, thoughtBubbleAnchor, citizenSpawnCell, citizenWorkNear, citizenSpriteName } from './agents.js';
import { makeFleetCtl, riverFleetBudget, updateRiverFleet } from './riverFleet.js';
import { pickAtScreen, describePick, citizenHoverTick, focusPick, releaseFocusCamera, focusCameraTarget, FOCUS_TUNE } from './citizenFocus.js';
import { cmVariantLabel, cmOfEn, CM_COLLECTIVE_HOMES } from './cityNaming.js';
import { parolesNoteBubble } from '../core/paroles.js';
import {
  buildIdentity, householdOf, householdSeedOf, householdSlot, householdHeadName, jobOfBuilding, jobWorks,
  SPRITE_PROFILE, SCHOOLS, APARTMENTS, JOBS,
} from './citizenIdentity.js';


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
// Grâce de la toute première partie (firstGameGrace.js) : un verrou pour le ciel,
// un pour le jour. Au niveau du MODULE et non de la boucle : démonter puis
// remonter la carte ne doit pas relâcher d'un coup une averse qu'on tenait.
const cmGraceSky = makeGraceLatch();
const cmGraceDay = makeGraceLatch();
function cmApplyQualitySettings() {
  const s = qualitySettings();
  cmRenderDprCap = s.dpr;
  cmFrameMs = 1000 / s.fps;
  cmCitizenMul = s.citizenMul;
  cmLodZoom = (s.lodZoom != null) ? s.lodZoom : 0.55;
  // Ombre du soleil et reflets dans l'eau (iso/isoSunShadow.js, iso/isoReflect.js).
  CM.fxOn = s.fx !== false;
  // Nappes du rideau de pluie, 4 ou 2 (iso/isoWeather.js, PERF-23).
  CM.rainVeils = s.rainVeils || 4;
}
cmApplyQualitySettings();

function cityMapResizeCanvas(canvas) {
  // Carte démontée (resetCityMapRuntime a nullifié ctx) : un forceFrame/resize
  // attardé crashait sur CM.ctx.setTransform (null). No-op propre.
  if (!CM.ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, cmRenderDprCap);
  const w = canvas.clientWidth || (canvas.parentElement && canvas.parentElement.clientWidth) || 600;
  const h = canvas.clientHeight || 320;
  const dprChanged = CM.dpr !== dpr;
  CM.dpr = dpr;
  CM.cw = w;
  CM.ch = h;
  const nw = Math.max(1, Math.round(w * dpr));
  const nh = Math.max(1, Math.round(h * dpr));
  // Réallouer un canvas — même à taille IDENTIQUE — l'efface : forceFrame()
  // (resize + frame) le ferait à CHAQUE appel. No-op si rien n'a changé.
  // Jusqu'au 2026-10-01, deux offscreen « avec marge de pan » (CM.staticCanvas,
  // CM.tileCanvas, écran + 2×256 px) se redimensionnaient ici aussi ; leur
  // dernier client, le quai cuit plein écran, est parti avec c8b042c. Ce qui
  // cuit encore — le sol en pyramide, les quais — tient ses propres tuiles
  // ancrées au monde, sans rapport avec la taille de l'écran.
  // ⚠ Même taille en px device ne veut pas dire même dpr (audit du 2026-10-05,
  // BUG-21) : au zoom du navigateur, la largeur CSS et le dpr varient en sens
  // inverse et le canvas garde souvent ses dimensions. La transformation, elle,
  // doit suivre le dpr — sinon toute la carte se peint à l'ancienne échelle.
  if (canvas.width === nw && canvas.height === nh) {
    if (dprChanged) CM.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return false;
  }
  canvas.width = nw;
  canvas.height = nh;
  CM.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Vrai = le canvas a été RÉALLOUÉ, donc vidé : l'appelant le repeint (BUG-90).
  return true;
}

// Foule du campement (bande 0) : marcheurs par tente, plafond, et cadence
// d'arrivée. Molette : `__campCrowd({ perHouse: 2 })` (dev).
const CAMP_CROWD = { perHouse: 1.4, cap: 40, spawnMs: 350 };
if (import.meta.env?.DEV && typeof window !== "undefined") {
  window.__campCrowd = (o) => { if (o) Object.assign(CAMP_CROWD, o); cmRecomputeCitizenTarget(); return { ...CAMP_CROWD, target: CM.citizenTarget }; };
}

// Part de la foule À L'INTÉRIEUR (lot 2 de PLAN-COMPORTEMENTS), cf. cmCitizenTargetFor.
const CROWD_INSIDE_K = 1.25;
// Cible de foule pour un layout donné et un multiplicateur de densité. Extrait
// pour être RÉ-APPLICABLE à chaud (changement de préréglage) sans le recompute
// O(N²) du plan — la formule DOIT rester alignée sur cityMapEnsureLayout.
function cmCitizenTargetFor(L, crowdMul) {
  if (!L || !L.counts) return 0;
  const eraFrac = Math.min(1, (L.counts.eraIndex || 0) / 22);
  let cap = Math.round((10 + Math.pow(eraFrac, 0.55) * 900) * crowdMul);
  const densityMul = (L.personality && L.personality.densityMul) || 1;
  let base = 2 + L.counts.houses / 3.5 + Math.pow(eraFrac, 1.65) * 540 + L.counts.megaDistricts * 10;
  // LE CAMPEMENT (bande 0, ères 0 à 4) : un plancher PAR TENTE. La formule
  // générale est pensée pour la ville, où l'ère porte la foule ; à l'ère 0 elle
  // donnait 4 marcheurs pour 7 tentes, puis 5 pour 27 tentes après onze minutes
  // de jeu (partie test du 2026-09-28) — un village mort, alors que le campement
  // est l'image de toute la première heure. Le plancher reste multiplié par la
  // densité (personnalité de la ville) et par crowdMul (Qualité du joueur,
  // abri sous l'averse) : il ne passe jamais par-dessus ces deux réglages.
  // `cap` borne le PLANCHER, pas la foule : au-delà, la formule générale reprend
  // la main (elle dépasse le plancher vers l'ère 4).
  if ((L.counts.eraBand | 0) === 0) {
    base = Math.max(base, Math.min((L.counts.houses || 0) * CAMP_CROWD.perHouse, CAMP_CROWD.cap));
    cap = Math.max(cap, Math.round(CAMP_CROWD.cap * crowdMul));
  }
  // ×1,25 : depuis le lot 2 de PLAN-COMPORTEMENTS, une partie de la foule est À
  // L'INTÉRIEUR (au travail, aux courses, chez soi) — elle compte dans la cible sans
  // être dans la rue. La majoration garde au jour une rue aussi garnie qu'avant.
  return Math.round(cmClamp(base * densityMul * crowdMul * CROWD_INSIDE_K, 2, cap * CROWD_INSIDE_K));
}

// Multiplicateur de densité effectif : la molette dev window.__citizenMul
// l'emporte sur le préréglage Qualité (débogage), sinon cmCitizenMul. La météo
// s'applique EN PLUS, par un facteur séparé : elle vide les rues sous l'averse
// sans jamais écraser le réglage Qualité du joueur (qui, lui, sert la machine)
// ni la molette de débogage.
function cmCrowdMul() {
  const base = (import.meta.env?.DEV && typeof window !== "undefined" && window.__citizenMul) || cmCitizenMul;
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
  if (!list) return;
  if (list.length <= want) {
    // L'AVERSE PASSÉE, on RESSORT (docs/PLAN-COMPORTEMENTS.md, lot 4) : ceux que la
    // pluie avait renvoyés chez eux et qui ne sont pas encore rentrés reprennent leur
    // journée — ils disparaissaient, remplacés par d'autres sortis des maisons.
    for (const p of list) {
      if (!p.leaving || p._vanish !== undefined || p.lead) continue;
      p.leaving = false; p.leaveCell = null; p.leaveT = 0; p._leaveRetry = false;
      p.goal = null; p._path = null;
    }
    return;
  }
  if (list.length > want * 4 + 60) { list.splice(want); return; }
  for (let i = want; i < list.length; i += 1) list[i].leaving = true;
}

// Rebranche le préréglage de qualité à chaud (appelé par l'UI des options) :
// ré-alloue le canvas si le dpr a changé, fait recuire le sol et ré-applique la
// densité. La boucle rAF (en pause tant que le dialogue d'options couvre la
// carte) repeindra proprement au prochain frame / à la fermeture du dialogue.
// ⚠ Sauf un canvas RÉALLOUÉ (dpr changé) : il est vide, et le fond translucide du
// dialogue laissait voir une carte vide jusqu'à sa fermeture (BUG-90). Celui-là
// est repeint tout de suite, vue inactive comprise (cf. repaintNow).
export function applyCityMapQuality() {
  cmApplyQualitySettings();
  const realloc = CM.canvas ? cityMapResizeCanvas(CM.canvas) : false;
  solInvalidate('all');
  cmRecomputeCitizenTarget();
  if (realloc && CM.repaintNow) CM.repaintNow(true);
}

// Monde↔écran : délégué à la projection unique (iso/projection.js).
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
  // Les maisons-MOTEUR pré-posées mais pas encore achetées sont INVISIBLES
  // (isoLiveCollect les saute) : les cadrer, c'était viser un camp fantôme. À
  // l'ouverture d'une partie, ~25 tentes cachées sur 32 tiraient la caméra loin
  // des 7 tentes réelles. Même seuil que le rendu au moment du recompute (aucun
  // achat depuis) : placed − 40, cf. le compteur engineHomeReveal de frame().
  const hiddenFrom = Math.max(0, (layout.engineHomePlaced || 0) - 40);
  const visible = (t) => !cmEngineHomeHidden(t, hiddenFrom);
  const b = cmTileBounds(tiles, visible);
  // Repli : tout est encore caché (impossible en pratique, les maisons
  // décoratives sont toujours là) → on cadre l'ensemble comme avant.
  return b || cmTileBounds(tiles, null);
}
function cmTileBounds(tiles, keep) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, n = 0;
  for (const t of tiles) {
    if (!t || typeof t.gx !== "number" || typeof t.gy !== "number") continue;
    if (keep && !keep(t)) continue;
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
  const perTile = T * 2 * ISO_X;   // mêmes tuiles = 2× la largeur (losange 2:1)
  const baseZoom = CM.cw / (targetTiles * perTile);

  // Cadre sur le CONTENU bâti réel plutôt que sur le seul cœur procédural : le
  // cœur (plan.core) est souvent au bord SUD du bâti, donc centrer dessus pousse
  // le village en haut d'un coin avec un large anneau d'herbe morte autour.
  const b = cityContentBounds(layout);
  // ⚠ Le test sur `b` RESTE : `cityContentBounds` peut rendre null (aucun contenu
  // bâti), et c'est le repli plus bas qui prend alors la main. Seul `CM.iso` a sauté.
  if (b) {
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
      // S11 : le zoom d'ouverture tombe sur un cran, sinon la première image de la
      // partie est déjà hors grille (et le sol y porte ses coutures).
      zoom: snapZoom(Math.max(0.35, Math.min(1.6, Math.max(baseZoom, fit)))),
    };
  }

  // Repli quand il n'y a AUCUN contenu bâti à cadrer : cœur du plan + zoom historique.
  return {
    x: (layout.plan?.core?.x ?? layout.gridN / 2) * T,
    y: (layout.plan?.core?.y ?? layout.gridN / 2) * T,
    zoom: snapZoom(Math.max(0.35, Math.min(1.6, baseZoom))),
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
if (import.meta.env?.DEV && typeof window !== 'undefined') {
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
  // La boîte monde projetée est un losange dont l'étendue écran vaut
  // (W+H)·ISO_X × (W+H)·ISO_Y. Plancher de zoom sur cette étendue ; le pan se
  // contente de garder le CENTRE caméra dans la boîte monde (clamp exact
  // bord-à-bord = intersection de losange, jamais jugé nécessaire).
  const extW = (boxW + boxH) * ISO_X, extH = (boxW + boxH) * ISO_Y;
  const zoomFloorIso = Math.min(3.2, Math.max(CM.cw / extW, CM.ch / extH));
  // S11 : les DEUX bornes tombent sur un cran, sinon le clamp repose la caméra
  // hors grille et le sol reprend ses coutures pile aux extrémités de la plage.
  // Le plancher est rabattu vers le HAUT (ceil) : au cran inférieur il laisserait
  // voir hors de la boîte de cadrage. Le plafond vers le bas, symétriquement.
  const loIso = snapZoom(zoomFloorIso, 1), hiIso = snapZoom(3.2, -1);
  // Le plancher RÉEL du zoom dépend de l'écran et de l'étendue du monde — le
  // 0.35 des entrées (wheel/pinch/clavier) n'est qu'un garde-fou : sur une
  // grande carte le clamp autorise plus bas. La pré-cuisson du sol
  // (isoGroundBake) doit viser le cran que le dézoom max ATTEINT vraiment,
  // sinon l'atterrissage n'a jamais sa photo exacte. Publié ici, chez son
  // écrivain ; lu là-bas.
  CM.zoomFloor = loIso;
  if (CM.cam.zoom < loIso) CM.cam.zoom = loIso;
  // A9 : borner AUSSI la cible de zoom, sinon le glissement la poursuit sous le
  // plancher pendant que le clamp remonte cam.zoom → tremblement, jamais posé.
  if (CM.zoomGoal != null) CM.zoomGoal = Math.max(loIso, Math.min(hiIso, CM.zoomGoal));
  CM.cam.x = Math.max(bx0, Math.min(bx1, CM.cam.x));
  CM.cam.y = Math.max(by0, Math.min(by1, CM.cam.y));
}

// A9 — Un pas d'amortissement de la caméra, appelé chaque frame avant le clamp.
// Jamais pendant une capture (frames déterministes) ni sans caméra prête.
function cmCameraGlide(dt) {
  if (!CM.cam || CM.capture) return;
  if (CM.zoomGoal == null) CM.zoomGoal = CM.cam.zoom;
  // Habitant SUIVI (fiche d'habitant, citizenFocus.js) : point monde à rejoindre
  // cette frame, ou null. Pendant le suivi, le zoom s'ancre sur LUI, pas sur le
  // curseur — sinon la molette l'écarte du centre et le suivi le ramène, en
  // tirant la caméra dans les deux sens à chaque cran.
  const follow = focusCameraTarget();
  // 1) Zoom qui glisse. Le point sous l'ancre (curseur au wheel, centre au clavier)
  //    est REPROJETÉ à chaque frame d'interpolation, sinon il dérive pendant le vol.
  if (Math.abs(CM.cam.zoom - CM.zoomGoal) > 1e-3) {
    const fs = follow && worldToScreen(follow.x, follow.y);
    const a = fs ? { mx: fs.x, my: fs.y } : (CM.zoomAnchor || { mx: CM.cw / 2, my: CM.ch / 2 });
    const before = screenToWorld(a.mx, a.my);
    CM.cam.zoom += (CM.zoomGoal - CM.cam.zoom) * camApproach(dt, CAM_FEEL.zoomRate);
    const after = screenToWorld(a.mx, a.my);
    CM.cam.x += before.x - after.x;
    CM.cam.y += before.y - after.y;
  } else {
    CM.cam.zoom = CM.zoomGoal;   // pose franche → cam immobile → recuisson du sol
  }
  // 2) Suivi d'habitant : la cible bouge à chaque frame, la caméra la rattrape
  //    avec son propre amortissement (FOCUS_TUNE.rate, plus doux que le
  //    recentrage : on accompagne un marcheur, on ne vole pas vers lui).
  //    Prioritaire sur tout, il éteint recentrage et inertie.
  if (follow) {
    const k = camApproach(dt, FOCUS_TUNE.rate);
    CM.cam.x += (follow.x - CM.cam.x) * k;
    CM.cam.y += (follow.y - CM.cam.y) * k;
    CM.camGoal = null;
    CM.panVel = null;
  } else if (CM.camGoal) {
    // Recentrage en vol amorti (touche C). Prioritaire, et il éteint l'inertie.
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
  releaseFocusCamera();                      // les flèches reprennent la caméra au suivi
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
  releaseFocusCamera();
  CM.camGoal = { x: t.x, y: t.y };
  CM.zoomGoal = t.zoom;
  CM.zoomAnchor = { mx: CM.cw / 2, my: CM.ch / 2 };
  CM.panVel = null;
}

function cityMapEnsureTooltip(mapRoot, tooltipElement = null) {
  CM.tooltip = tooltipElement || mapRoot?.querySelector(".city-map-tooltip") || null;
}

// Libellé d'un type d'habitation ou de district, dans la langue du joueur. La
// table { fr, en } vit dans cityNaming.js (CM_VARIANT_LABELS), testable sans
// monter la carte.
function cityMapVariantLabel(type, variant) {
  return tr(cmVariantLabel(type, variant));
}

// (Habitat COLLECTIF : CM_COLLECTIVE_HOMES, cityNaming.js — l'immeuble porte un nom
// de résidence, la fiche d'habitant y loge un foyer par appartement.)

// LE QUARTIER (docs/PLAN-LISIBILITE.md, Q) : une ville née avec ses quartiers nomme celui
// de la tuile survolée — un nom, jamais une phrase.
const CM_QUARTER_NAMES = {
  marchand: { fr: "Quartier marchand", en: "Merchant quarter" },
  pouvoir: { fr: "Quartier du forum", en: "Forum quarter" },
  savant: { fr: "Quartier savant", en: "Scholars' quarter" },
  faubourg: { fr: "Faubourgs", en: "Outskirts" },
};
function cityMapQuarterName(t) {
  const qa = CM.layout && CM.layout.quarterAt;
  const q = qa ? CM_QUARTER_NAMES[qa(t.gx, t.gy)] : null;
  return q ? tr(q) : null;
}

function cityMapDescribeTile(t) {
  const desc = cityMapDescribeTile0(t);
  const q = t.type === "engine" || t.type === "house" || t.type === "enginehome" ? cityMapQuarterName(t) : null;
  if (!q) return desc;
  return { ...desc, body: desc.body ? `${desc.body} · ${q}` : q };
}
function cityMapDescribeTile0(t) {
  if (t.type === "engine") {
    // Corps en langage d'atelier, pas en données brutes : « Édifice principal ·
    // niveau 12 · 2 annexes » remplace « Niveau total 12 | groupe 1/3 (4) -
    // complexe ». L'édifice nº 1 porte le niveau entier, les suivants sont des
    // annexes de niveau 1 (cf. cmEngineInstances).
    // Le TITRE est le nom de la boutique (buildingById, déjà dans la langue du
    // joueur par localizeData) : cityBuildings.js n'en garde plus de copie
    // française. `buildingName` ne sert plus qu'au port de commerce, nommé à part.
    const b = buildingById[t.buildingId];
    const title = t.buildingName ? tr(t.buildingName) : b ? tr(b.name) : cityMapVariantLabel(t.type, t.variant);
    const stage = t.tier >= 3 ? { fr: "quartier dense", en: "dense quarter" }
      : t.tier >= 2 ? { fr: "complexe", en: "complex" }
      : t.tier >= 1 ? { fr: "groupe de bâtiments", en: "building cluster" } : null;
    const stFr = stage ? ` · ${stage.fr}` : "", stEn = stage ? ` · ${stage.en}` : "";
    const annexes = (t.groupTotal || 1) - 1;
    const lvl = Math.floor(t.level || 1);
    const gLvl = Math.floor(t.groupLevel || 1);
    const body = annexes > 0
      ? (t.groupIndex === 1
        ? tr({
          fr: `Édifice principal · niveau ${lvl} · ${annexes} annexe${annexes > 1 ? "s" : ""}${stFr}`,
          en: `Main building · level ${lvl} · ${annexes} annex${annexes > 1 ? "es" : ""}${stEn}` })
        : tr({ fr: `Annexe de l'édifice principal · niveau ${gLvl}`, en: `Annex of the main building · level ${gLvl}` }))
      : tr({ fr: `Niveau ${lvl}${stFr}`, en: `Level ${lvl}${stEn}` });
    return { title, body };
  }
  const seed = cmHash(`${t.key}:${state.cycles || 0}`);
  const band = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraBand : 2;
  const label = cmVariantLabel(t.type, t.variant);
  if (t.type !== "house") return { title: tr(label) };
  // Nom ENTIER écrit dans chaque langue : « Cabane d'Oda » / « Oda's Hut »,
  // « Tour d'habitation des Tilleuls » / « Tilleuls Apartment Tower ». Les noms
  // propres (occupant, résidence) restent français dans les deux.
  if (CM_COLLECTIVE_HOMES.has(t.variant)) {
    const res = cmResidenceName(seed);
    return { title: tr({ fr: `${label.fr} ${res}`, en: `${cmOfEn(res)} ${label.en}` }) };
  }
  // L'occupant est la TÊTE DU FOYER qui vit là (citizenIdentity.js, même graine) :
  // sa femme, son mari, ses enfants qui passent dans la rue disent « Mariée à
  // Garin », « Fille d'Oda » de la personne dont la maison porte le nom.
  const who = householdHeadName(householdOf(seed, band)) || cmCitizenName(seed, band);
  return { title: tr({ fr: `${label.fr} ${cmDeName(who)}`, en: `${who}'s ${label.en}` }) };
}
// La fiche d'habitant (citizenFocus.js) nomme son logis et son atelier comme
// l'infobulle les nomme : même fonction, publiée sur CM pour éviter l'import
// circulaire (ce fichier importe déjà citizenFocus).
CM.describeTile = cityMapDescribeTile;

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
        // `kindId` = la catégorie STABLE, que lit la logique (curseur) : le
        // libellé `kind` suit la langue, on ne le compare jamais.
        return {
          title: tr({ fr: "Une émeute est en cours !", en: "A riot has broken out!" }),
          body: tr({
            fr: "Des habitants en colère défilent, torches et armes de fortune levées. Cliquez sur un émeutier pour l'apaiser.",
            en: "Angry inhabitants march by, torches and makeshift weapons raised. Click a rioter to calm them down." }),
          kind: tr({ fr: "Émeute", en: "Riot" }), kindId: "riot",
        };
      }
    }
  }
  // Passant, promeneur du quai, véhicule : sa SILHOUETTE dessinée (citizenFocus.js),
  // la même que vise le clic qui ouvre sa fiche (`pick`). L'ancien disque autour du
  // point monde (sans le décalage de trottoir) ratait la tête dès qu'on zoomait ;
  // il ne sert plus qu'au LOD, où les passants ne sont pas dessinés.
  if (!CM.lodActive) {
    const pk = pickAtScreen(sx, sy);
    if (pk) return { ...describePick(pk), pick: pk };
  } else {
    for (const p of CM.citizens) {
      const sp = cityMapScreenFromWorld(p.x, p.y);
      const dist = Math.hypot(sp.x - sx, sp.y - sy);
      if (dist < citizenRadius && dist < bestDist) {
        bestCitizen = p;
        bestDist = dist;
      }
    }
  }
  if (bestCitizen) {
    return {
      title: bestCitizen.name, body: tr(bestCitizen.role),
      kind: tr({ fr: "Habitant", en: "Inhabitant" }), kindId: "citizen", pick: { kind: "citizen", p: bestCitizen },
    };
  }
  // LA MAISON DES PLAISIRS, avant les merveilles et les bâtiments : elle est
  // seule au milieu du fleuve, rien ne la dispute, et elle monte très haut
  // au-dessus de tout ce qui est projeté derrière elle.
  // `plaisirs: true` est le drapeau que lit le rendu iso pour allumer son
  // liseré doré (drawSpriteOutline) : le monument est cliquable, il doit dire
  // qu'on le touche, comme une habitation ou un moteur.
  if (plaisirsHitTest(sx, sy)) {
    return {
      title: tr({ fr: "La Maison des Plaisirs", en: "The House of Pleasures" }),
      body: tr({
        fr: "On y joue, on y boit, on y perd son or. Cliquez pour entrer.",
        en: "Come to gamble, drink and lose your fortune. Click to enter." }),
      kind: tr({ fr: "Monument", en: "Monument" }), kindId: "monument",
      plaisirs: true,
    };
  }
  if (Array.isArray(state.wonders)) {
    // Nom, condition et jalon sont des unités { fr, en } (CM_WONDERS, layout.js) :
    // la phrase est écrite entière dans chaque langue.
    const wonderTip = (wi) => {
      const w = CM_WONDERS[wi];
      const tier = (state.wonderTiers && state.wonderTiers[w.id]) || 1;
      const rank = WONDER_TIER_NAMES[tier];
      const jalon = w.tiers && tier < w.tiers.length ? w.tierLabel(w.tiers[tier]) : null;
      const cond = w.unlockedBy || { fr: "", en: "" };
      return {
        title: tr({ fr: `${w.name.fr} (rang ${rank})`, en: `${w.name.en} (rank ${rank})` }),
        body: tr(jalon
          ? { fr: `${cond.fr} · prochain rang : ${jalon.fr}`, en: `${cond.en} · next rank: ${jalon.en}` }
          : { fr: `${cond.fr} · rang maximal`, en: `${cond.en} · highest rank` }),
        kind: tr({ fr: "Merveille", en: "Wonder" }), kindId: "wonder",
      };
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
      // ⚠ CE REPLI N'EST PAS MORT (P11). Son ancien commentaire disait « legacy
      // top-down » ; il TOURNE en réalité à chaque frame où aucune merveille n'est
      // dessinée — `CM._wonderBoxes` est remis à zéro par le peintre iso, donc la
      // branche du dessus ne prend pas. C'est aussi le seul consommateur de
      // `wonderAnchor` dans ce fichier. Repli sur le disque au sol, avec l'ancre
      // PARTAGÉE avec drawWonder : projeter à la main ici décalait la zone
      // survolable par rapport à la merveille dessinée.
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
  // ⚠⚠ TEST AU PIXEL, pas au rectangle (2026-08-23). Une boîte d'encre est un
  // rectangle autour d'une silhouette ISOMÉTRIQUE : ses coins sont vides. Viser un
  // coin vide désignait quand même le bâtiment — mesuré sur une grille de 15 480
  // points d'écran, **10,7 % répondaient autre chose** selon le test : soit un voisin,
  // soit un bâtiment là où il n'y a que du sol. Le masque vient de la passe fantôme
  // (Q11, iso/isoMask.js) et ne coûte rien : les sprites le portent déjà.
  // `maskHit` retombe sur le rectangle quand un sprite n'a pas encore été mesuré.
  const hb = CM._houseBoxes;
  if (hb) {
    for (let i = hb.length - 1; i >= 0; i -= 1) {
      const b = hb[i].b, t = hb[i].t;
      if (!maskHit(b, sx, sy)) continue;
      return { ...cityMapDescribeTile(t), ...cityMapTileKind(t), tile: t, cell: t.gx + "," + t.gy };
    }
  }
  const tile = CM.tileGrid?.get(gx + "," + gy);
  if (tile) {
    const info = cityMapDescribeTile(tile);
    return { ...info, ...cityMapTileKind(tile), tile, cell: tile.gx + "," + tile.gy };
  }
  if (CM.roadSet.has(`${gx},${gy}`)) {
    const road = CM.layout.roadMap && CM.layout.roadMap.get(gx + "," + gy);
    const plaza = !!(road && road.rank === "plaza");
    return {
      title: cmRoadName(gx, gy),
      kind: plaza ? tr({ fr: "Place", en: "Square" }) : tr({ fr: "Voie", en: "Road" }), kindId: plaza ? "plaza" : "road",
      cell: gx + "," + gy,
    };
  }
  return null;
}

// Catégorie affichée d'une tuile bâtie (dans la langue du joueur) et son
// identifiant stable `kindId`, le seul que la logique ait le droit de lire.
function cityMapTileKind(t) {
  return t.type === "house"
    ? { kind: tr({ fr: "Logement", en: "Home" }), kindId: "home" }
    : { kind: tr({ fr: "Bâtiment", en: "Building" }), kindId: "building" };
}

function cityMapShowTooltip(hit, sx, sy, { immediate = false } = {}) {
  if (!CM.tooltip) return;
  if (CM.tipTimer) { clearTimeout(CM.tipTimer); CM.tipTimer = null; }
  if (!hit) {
    CM.tooltip.classList.remove("visible");
    CM.hover = null;
    return;
  }
  CM.hover = hit;
  const kindEl = CM.tooltip.querySelector("[data-citymap-tooltip-kind]");
  const titleEl = CM.tooltip.querySelector("[data-citymap-tooltip-title]");
  const bodyEl = CM.tooltip.querySelector("[data-citymap-tooltip-body]");
  // tr() en dernier filet : les textes arrivent déjà résolus, mais une unité
  // { fr, en } oubliée s'afficherait « [object Object] ».
  const body = tr(hit.body);
  if (kindEl) kindEl.textContent = tr(hit.kind);
  if (titleEl) titleEl.textContent = tr(hit.title);
  if (bodyEl) {
    bodyEl.textContent = body;
    bodyEl.hidden = !body;
  }
  CM.tooltip.style.left = `${Math.min(CM.cw - 18, sx + 14)}px`;
  CM.tooltip.style.top = `${Math.max(12, sy - 8)}px`;
  // Délai d'apparition façon `title` natif : la bulle ne surgit que si la souris
  // SE POSE — chaque mouvement remet le compteur à zéro tant qu'elle n'est pas
  // visible. Une fois visible, elle suit le curseur sans re-délai jusqu'à sortir
  // sur du vide. Le liseré doré (CM.hover, lu par le rendu iso) reste instantané.
  // `immediate` = appui long tactile, qui porte déjà son propre délai de 500 ms.
  if (immediate || CM.tooltip.classList.contains("visible")) {
    CM.tooltip.classList.add("visible");
  } else {
    CM.tipTimer = setTimeout(() => {
      CM.tipTimer = null;
      if (CM.hover === hit) CM.tooltip.classList.add("visible");
    }, import.meta.env?.DEV && window.__tipDelay != null ? window.__tipDelay : 500);
  }
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
  // FAITS DIVERS : un clic sur l'un de leurs personnages ouvre sa réplique, avant
  // tout le reste (un passant qui le frôle ne doit pas voler le clic).
  bindFaitsDiversInput(canvas, mapRoot, signal);

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
    // S11 : un cran de molette = un cran de la grille. On arrondit DANS LE SENS du
    // geste : au plus proche, un pas de 1,12 depuis 0,375 retomberait sur 0,375 et
    // la molette serait morte en bas de plage.
    CM.zoomGoal = snapZoom(
      Math.max(0.35, Math.min(3.2, (CM.zoomGoal ?? CM.cam.zoom) * factor)),
      e.deltaY < 0 ? 1 : -1,
    );
    CM.zoomAnchor = { mx, my };
    CM.camGoal = null;   // le joueur reprend la main sur un recentrage en cours
  }, { passive: false, signal });

  canvas.addEventListener("mousemove", (e) => {
    if (CM.drag) {
      clearHover();
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    // Pointeur publié pour le SURVOL VIVANT des passants (citizenHoverTick) :
    // eux marchent, la souris peut rester immobile.
    CM._mouse = { x: mx, y: my };
    showHover(mx, my);
    // CURSEUR : `pointer` exactement là où un clic FAIT quelque chose, `grab`
    // partout ailleurs. La carte est une seule grande surface : sans ça, rien
    // ne distingue au doigt un décor d'un point d'entrée, et le joueur ne
    // découvre ce qui est cliquable qu'en cliquant au hasard.
    //
    // Deux des trois cibles se lisent sur le survol qu'on VIENT de calculer
    // (CM.hover), gratuitement.
    // ⚠ On n'appelle SURTOUT PAS cityMapCalmRioterAt ici : ce test APAISE
    // l'émeutier au passage (il le retire de la foule). Le survol suffit et ne
    // coûte rien de plus : son rayon (7·zoom) est INCLUS dans celui du clic
    // (10·zoom), donc « l'infobulle dit Émeute » implique « le clic apaise ».
    // ⚠ On lit `kindId` (stable), JAMAIS le libellé `kind` : il suit la langue,
    // et l'ancien `kind === "Émeute"` aurait éteint la main en anglais.
    //
    // Depuis la fiche d'habitant (2026-10-03), TOUT passant s'ouvre au clic :
    // son `pick` suffit. La bulle de pensée garde son propre test —
    // son rayon de clic est PLUS LARGE que la silhouette (on la vise au-dessus
    // de la tête). Il ne tourne que si les drapeaux gratuits ont échoué.
    const h = CM.hover;
    // `_cursorBase` = la main SANS compter les passants : citizenHoverTick la
    // reprend quand un passant entre ou sort de sous la souris immobile.
    const clickableOther = !!(h && (h.plaisirs || h.kindId === "riot"))
      || (!!callbacks.onCitizenThoughtClicked && !!cityMapHitTestCitizenWithThought(mx, my));
    CM._cursorBase = clickableOther ? "pointer" : "grab";
    CM.hoverPick = h && h.pick ? h.pick : null;
    canvas.style.cursor = clickableOther || CM.hoverPick ? "pointer" : "grab";
  }, { signal });
  canvas.addEventListener("mouseleave", () => {
    CM._mouse = null;
    CM.hoverPick = null;
    clearHover();
  }, { signal });

  canvas.addEventListener("mousedown", (e) => {
    CM.drag = { x: e.clientX, y: e.clientY, camx: CM.cam.x, camy: CM.cam.y, moved: 0 };
  }, { signal });

  window.addEventListener("mousemove", (e) => {
    if (!CM.drag) return;
    const dx = e.clientX - CM.drag.x;
    const dy = e.clientY - CM.drag.y;
    CM.drag.moved += Math.abs(dx) + Math.abs(dy);
    // Le joueur reprend la caméra : le suivi d'habitant s'arrête (la fiche reste).
    // Même seuil que le clic : en deçà de 6 px, c'était un clic, pas un pan.
    if (CM.drag.moved > 6) releaseFocusCamera();
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

  // ── TACTILE (P3) ─────────────────────────────────────────────────────────
  // Écouteurs POINTER filtrés sur `pointerType !== "mouse"`, POSÉS À CÔTÉ du
  // chemin souris au lieu de le remplacer. Le drag souris ci-dessus est réglé au
  // millimètre (seuil de 6px, inertie mesurée sur le dernier segment, curseur) :
  // le convertir en pointer events aurait mis tout ça en jeu pour un spike dont
  // la question est « le doigt marche-t-il ? », pas « peut-on réécrire la souris ? ».
  // Les deux chemins partagent le MÊME état (CM.drag, CM.panVel, CM.zoomGoal),
  // donc l'inertie, le zoom qui glisse et le recentrage marchent d'emblée.
  //
  // ⚠ Le canvas doit porter `touch-action: none` (map.css) : sans lui le
  // navigateur avale le geste pour faire défiler la page, et pointermove
  // s'interrompt au bout de quelques pixels.
  const touches = new Map();           // pointerId → dernière position écran
  let pinch = null;                    // { dist, zoom } au début du pincement
  let pressTimer = null;               // appui long → infobulle (remplace le survol)

  const cancelPress = () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };
  const localXY = (e) => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const twoTouches = () => {
    const [a, b] = [...touches.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  };

  canvas.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") return;
    // Capture : la suite du geste arrive même si le doigt sort du canvas — c'est
    // ce qui remplace les écouteurs `window` du chemin souris.
    try { canvas.setPointerCapture(e.pointerId); } catch { /* capture refusée : le geste reste borné au canvas */ }
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    clearHover();
    if (touches.size === 1) {
      CM.drag = { x: e.clientX, y: e.clientY, camx: CM.cam.x, camy: CM.cam.y, moved: 0 };
      CM.panVel = null;                // un nouveau doigt STOPPE l'inertie en cours
      const p = localXY(e);
      // L'appui long remplace le survol : au doigt il n'y a pas de « passer
      // dessus sans cliquer », et sans lui toute l'information des infobulles
      // de la carte devient inatteignable.
      pressTimer = setTimeout(() => { pressTimer = null; CM.drag = null; showHover(p.x, p.y, { immediate: true }); }, 500);
    } else if (touches.size === 2) {
      CM.drag = null;                  // deux doigts : ce n'est plus un pan
      cancelPress();
      pinch = { dist: twoTouches().dist, zoom: CM.zoomGoal ?? CM.cam.zoom };
    }
  }, { signal });

  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerType === "mouse" || !touches.has(e.pointerId)) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinch && touches.size >= 2) {
      const t = twoTouches();
      if (pinch.dist > 8) {
        const rect = canvas.getBoundingClientRect();
        // S11 : au plus proche (dir 0) — le pincement est un geste ABSOLU (rapport
        // des écartements depuis le début du geste), pas incrémental : arrondir dans
        // un sens le ferait cliqueter d'un cran par event de déplacement.
        CM.zoomGoal = snapZoom(Math.max(0.35, Math.min(3.2, pinch.zoom * (t.dist / pinch.dist))));
        // Ancre = le milieu des deux doigts : le point pincé reste sous eux.
        CM.zoomAnchor = { mx: t.cx - rect.left, my: t.cy - rect.top };
        CM.camGoal = null;
      }
      return;
    }
    if (!CM.drag) return;

    const dx = e.clientX - CM.drag.x;
    const dy = e.clientY - CM.drag.y;
    CM.drag.moved += Math.abs(dx) + Math.abs(dy);
    if (CM.drag.moved > 10) cancelPress();   // ça glisse : ce n'est plus un appui long
    if (CM.drag.moved > 6) releaseFocusCamera();
    const pd = screenDeltaToPan(dx, dy);
    CM.cam.x = CM.drag.camx - pd.x;
    CM.cam.y = CM.drag.camy - pd.y;
    const tv = (typeof performance !== "undefined" ? performance.now() : Date.now());
    if (CM.drag._lt) {
      const seg = screenDeltaToPan(e.clientX - CM.drag._lx, e.clientY - CM.drag._ly);
      const ms = Math.max(1, tv - CM.drag._lt);
      CM.drag._vx = (-seg.x / ms) * 1000;
      CM.drag._vy = (-seg.y / ms) * 1000;
    }
    CM.drag._lx = e.clientX; CM.drag._ly = e.clientY; CM.drag._lt = tv;
  }, { signal });

  const endTouch = (e) => {
    if (e.pointerType === "mouse" || !touches.has(e.pointerId)) return;
    touches.delete(e.pointerId);
    cancelPress();
    if (touches.size < 2) pinch = null;
    if (touches.size === 1) {
      // Un doigt reste après un pincement : il reprend le pan, et on repart de SA
      // position — sinon la carte saute de l'écart entre les deux doigts.
      const [p] = [...touches.values()];
      CM.drag = { x: p.x, y: p.y, camx: CM.cam.x, camy: CM.cam.y, moved: 0 };
      return;
    }
    if (touches.size === 0 && CM.drag) {
      // Même règle qu'à la souris : au-delà de 6px c'était un pan, donc le clic
      // de fin de geste ne doit pas être pris pour une sélection.
      if (CM.drag.moved > 6) CM.dragged = true;
      const tv = (typeof performance !== "undefined" ? performance.now() : Date.now());
      if (CM.drag._lt && tv - CM.drag._lt < 60 && CM.drag._vx != null) {
        const cap = 4200;
        CM.panVel = {
          x: Math.max(-cap, Math.min(cap, CM.drag._vx)),
          y: Math.max(-cap, Math.min(cap, CM.drag._vy)),
        };
        CM.camGoal = null;
      }
      CM.drag = null;
    }
  };
  canvas.addEventListener("pointerup", endTouch, { signal });
  canvas.addEventListener("pointercancel", endTouch, { signal });

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
      // La cité le sent : une idée de plus s’en va (paroles, « ce qu’on dit de toi »).
      parolesNoteBubble();
      callbacks.onCitizenThoughtClicked(hitCitizen, type);
      return;
    }
    // FICHE D'HABITANT : un clic sur un passant le désigne — sa fiche s'ouvre et
    // la caméra le suit (citizenFocus.js). Même test que l'infobulle : ce qui
    // affiche « Habitant » au survol est exactement ce qui s'ouvre au clic.
    // Et ce que l'anneau de SURVOL montre est ce qui s'ouvre : s'il est allumé
    // (passant arrivé sous la souris immobile), il l'emporte sur un bâtiment.
    // ⚠ AVANT la Maison des Plaisirs, comme dans l'infobulle (cityMapHitTest) :
    // la fille du balcon est peinte PAR-DESSUS la façade — viser elle ouvrait
    // l'onglet du monument au lieu de sa fiche.
    const hit = cityMapHitTest(mx, my);
    const target = (hit && hit.pick) || CM.hoverPick;
    if (target) {
      e.stopImmediatePropagation();
      e.preventDefault();
      focusPick(target);
      return;
    }
    // LA MAISON DES PLAISIRS : cliquer le monument ouvre son onglet. La carte
    // n'est que le POINT D'ENTRÉE — on y va, ça se joue dans le panneau.
    //
    // On teste la boîte RÉELLEMENT DESSINÉE à la dernière frame (publiée par le
    // renderer iso), jamais un disque au sol : la tour monte onze tuiles
    // au-dessus de son pied, et viser sa couronne tomberait à côté. Même leçon
    // que les merveilles, qui ont dû abandonner leur disque pour la même raison.
    //
    // MÊME test que l'infobulle, au pixel d'encre près (plaisirsHitTest) : ce
    // qui allume le liseré doré est exactement ce qui ouvre l'onglet.
    if (plaisirsHitTest(mx, my)) {
      e.stopImmediatePropagation();
      e.preventDefault();
      openView('plaisirs');
    }
  }, { capture: true, signal });

  // Sonde de fluidité (P3) : éteinte sauf `?fps=1`. Montée ici pour vivre et
  // mourir avec la carte (même AbortController), sans toucher la boucle de rendu.
  mountFpsProbe({ signal, quality: qualitySettings });

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
        CM.zoomGoal = snapZoom(
          Math.max(0.35, Math.min(3.2, (CM.zoomGoal ?? CM.cam.zoom) * f)),
          cam.zoom > 0 ? 1 : -1,     // S11 : un appui = un cran, cf. la molette
        );
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

  // ÉCONOMIE D'ÉNERGIE (energySaver.js, PERF-5) : toute entrée du joueur, n'importe
  // où dans la fenêtre — survol de la boutique compris —, rend le cap normal à la
  // frame suivante. Capture + passif : aucun écouteur ne peut l'avaler, aucun
  // geste n'est retardé. La carte qui monte part « regardée ».
  const markInput = () => noteMapInput(performance.now());
  markInput();
  for (const type of ["pointermove", "pointerdown", "keydown", "wheel", "focus"]) {
    window.addEventListener(type, markInput, { capture: true, passive: true, signal });
  }

  // L'AbortController retire les écouteurs, pas la minuterie de l'appui long :
  // démontée en plein appui, la carte voyait encore showHover tomber 500 ms plus
  // tard (audit 2026-10-05, BUG-91).
  return () => { controller.abort(); cancelPress(); };
}


// Cache engineSig entre frames — ne recalculer que si les bâtiments changent.
let _cachedEngineSigBuildVer = -1;
let _cachedEngineSig = "";
let _cachedEngineGroupSig = "";

// RECOMPUTE DIFFÉRÉ PENDANT LES GESTES DE CAMÉRA. Sur la machine de jeu, un
// recompute complet coûte 200-300 ms ; or sur une partie vivante il se
// déclenche EN PLEIN dézoom/pan (achats des automates → palier de bloc ou
// route — le throttle de 1500 ms autorisait donc un gel toutes les 1,5 s pendant le geste,
// mesuré p90 49,7 ms / max 214-306 ms chez Raph). Tant que la caméra bouge
// (< LAYOUT_GESTURE_STILL_MS d'immobilité), tout recompute attend l'accalmie
// — le bâtiment neuf apparaît une demi-seconde plus tard, à l'arrêt, au lieu
// de geler le geste. Plafond LAYOUT_DEFER_MAX_MS : un pan ininterrompu ne
// repousse pas la vérité de la carte indéfiniment. Suivi de mouvement
// AUTONOME (il ne dépend pas du peintre iso). (Sa molette
// d'A/B __layoutDefer est retirée : audit 2026-10-05, DEV-3.)
const LAYOUT_GESTURE_STILL_MS = 280;
// 10 s : mesuré sur la machine de jeu (deux relevés), un dézoom énergique tient
// facilement 6 s sans pause de 280 ms — le plafond forçait alors le recompute
// EN PLEIN geste (layout ~235 ms dans la pire frame, deux fois de suite). Les
// explorations réelles marquent une pause avant 10 s ; au-delà on assume le
// gel plutôt qu'une carte mensongère.
const LAYOUT_DEFER_MAX_MS = 10000;
// PALIERS DE BÂTIMENT GROUPÉS (PERF-18 de l'audit du 2026-10-05). Un palier
// (engineGroupSig) passait le throttle comme une ère : entre 12 et ~232 exemplaires,
// un palier tombe tous les ~6 achats d'un type, et une rafale d'automates enchaînait
// les recalculs de 200-300 ms. Ils attendent désormais LAYOUT_GROUP_MIN_MS depuis le
// recalcul précédent (un achat isolé reste immédiat) ; en attendant, les niveaux des
// tuiles moteur suivent chaque achat, comme entre deux paliers. Ère, cycle et
// merveille restent immédiats.
const LAYOUT_GROUP_MIN_MS = 2500;
let _lyLevelsSig = null;
// La décision du throttle, pure (layoutThrottle.test.js). `prev` : signatures du plan
// affiché { core, group, crisis, ilot } (null sans plan) ; `next` : celles de l'état.
// La bande de crise ne compte comme « cœur » que hors îlots : en mode îlots elle ne
// fait que replanter des arbres, elle attend son tour comme une route.
export function layoutRecomputeWait(prev, next, sinceMs) {
  if (!prev) return { wait: false, core: true, group: true };
  const core = next.core !== prev.core || (!prev.ilot && next.crisis !== prev.crisis);
  const group = next.group !== prev.group;
  return { wait: !core && sinceMs < (group ? LAYOUT_GROUP_MIN_MS : 1500), core, group };
}
let _lyCamX = NaN, _lyCamY = NaN, _lyCamZ = NaN;
let _lyCamMoveAt = -1e9;
let _lyDeferredAt = 0;

// ── GARDE D'ÉCHEC DU PLAN (audit du 2026-10-05, BUG-32) ──────────────────────
// La signature est posée AVANT computeCityLayout, et toutes les sorties
// anticipées exigent un CM.layout : si le TOUT PREMIER calcul levait, chaque
// frame le relançait — 130 à 560 ms par essai, toute l'interface tombait à
// quelques images par seconde. Sur exception : un message (limité, avec la pile),
// LAYOUT_RETRY_MS d'attente avant de retenter, et les signatures remises à null.
// Le plan affiché (l'ancien, ou aucun) ne correspond alors plus à rien : l'essai
// suivant est un recalcul COMPLET, jamais le raccourci « mêmes blocs », qui
// rafraîchirait un plan périmé comme s'il était le bon. Entre-temps la frame
// continue : l'ancienne ville reste vivante, ou la carte reste vide.
function cityMapEnsureLayout(now, deps) {
  if (now - (CM.layoutFailAt ?? -Infinity) < LAYOUT_RETRY_MS) return;
  try {
    cityMapEnsureLayoutInner(now, deps);
    CM.layoutFailAt = null;
  } catch (e) {
    CM.layoutFailAt = now;
    CM.layoutSig = null; CM.layoutStructSig = null; CM.layoutCoreSig = null;
    CM.layoutGroupSig = null; CM.layoutCrisisBand = null;
    reportMapError('plan de la ville', e);
  }
}

function cityMapEnsureLayoutInner(now, deps = {}) {
  const getVehicleDensity = deps.getVehicleDensity || function () { return 0; };
  const chooseRoadVehicleType = deps.chooseRoadVehicleType || function () { return "wagon"; };
  const vehSkinFor = deps.vehSkinFor || function () { return ""; };

  // engineSig : ne reconstruire que si les bâtiments ont changé (renderCache._buildingsVersion)
  if (renderCache._buildingsVersion !== _cachedEngineSigBuildVer) {
    _cachedEngineSig = CM_MAP_BUILDINGS.map((meta) => `${meta.id}:${Math.floor((state.buildings && state.buildings[meta.id]) || 0)}`).join("|");
    _cachedEngineGroupSig = cmEngineGroupSig(state);   // structure des blocs (paliers), pas les comptes bruts
    _cachedEngineSigBuildVer = renderCache._buildingsVersion;
  }
  // L'ÈRE — la seule chose que les signatures du plan lisaient dans cityCounts —
  // lue à chaque frame sur le Decimal (currentEraIndex, ce que rendait cc.eraIndex).
  // Le cache de cityCounts qu'elle remplace (audit du 2026-10-05, PERF-59) avait
  // pour clé floor(pop/500)|floor(infra/200)|floor(savoir/200)|cycles : changée à
  // chaque tick passé ~5e6 habitants (cityCounts recalculé à chaque frame, 2 à
  // 11 µs : le cache ne servait à rien), immobile sous 500 habitants (le passage au
  // Grand Feu, à 249, attendait un achat) et FIGÉE au-delà de 1e308 (toNum =
  // Infinity) : les ères transcendantes n'étaient plus vues avant un achat.
  // currentEraIndex : 0,5 à 2 µs jusqu'à l'ère 34, ~14 µs à l'ère 297.
  const eraIndex = currentEraIndex();
  const engineSig = _cachedEngineSig;
  const engineGroupSig = _cachedEngineGroupSig;

  // Bande de crise : 0 normal, 1 crise, 2 effondrement imminent — force une
  // régénération du layout quand l'état de la ville bascule (chaos procédural).
  // Seuils et hystérésis : cityCrisisBand (cityPersonality.js), source unique.
  const crisisBand = cityCrisisBand(state);
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
  // (Plus d'eraFrac dans les signatures : eraFrac = eraIndex/34, constant dans une
  // ère — il doublait l'ère sans jamais rien signaler de plus.)
  const sig = eraIndex + '|' + (state.cycles || 0) + '|' + crisisBand + '|' + wonderSig + '|' + roadCount + '|' + engineSig;
  if (sig === CM.layoutSig && CM.layout) return;
  // « 1 achat = 1 bâtiment » SANS le gel de ~240 ms : quand SEULS les comptes changent
  // (structure des blocs identique — cf. cmEngineGroupSig, stable entre paliers), on NE
  // recalcule PAS le layout (placement + connexion routière). On rafraîchit juste t.level
  // sur les tuiles moteur → la NAPPE (drawEngineSprawl) grandit d'UNE maison par achat,
  // gratuitement. (Sa molette d'A/B __stableSkip est retirée : audit 2026-10-05, DEV-3.)
  const structSig = eraIndex + '|' + (state.cycles || 0) + '|' + crisisBand + '|' + wonderSig + '|' + roadCount + '|' + engineGroupSig;
  const refreshLevels = () => {
    const b = state.buildings || {};
    for (const tt of CM.layout.tiles) if (tt.type === 'engine' && tt.buildingId) tt.level = Math.floor(b[tt.buildingId] || 0);
    _lyLevelsSig = engineSig;
  };
  if (CM.layout && structSig === CM.layoutStructSig) {
    refreshLevels();
    CM.layoutSig = sig;
    return;
  }
  // Changement STRUCTUREL (nouveau bloc / ère / merveille / route / prestige) → recompute
  // complet. IMMÉDIAT pour l'ère, le cycle, une merveille — et la bande de crise hors
  // îlots, où son chaos rebat le plan. Groupés (PERF-18) : routes ≤ 1/1500 ms, bande de
  // crise en mode îlots (elle n'y replante que des arbres) idem, paliers de bâtiment
  // ≤ 1/LAYOUT_GROUP_MIN_MS. Le plan final est le même, il arrive au plus tard au
  // recalcul suivant.
  const coreSig = eraIndex + '|' + (state.cycles || 0) + '|' + wonderSig;
  const th = layoutRecomputeWait(
    CM.layout ? { core: CM.layoutCoreSig, group: CM.layoutGroupSig, crisis: CM.layoutCrisisBand, ilot: !!CM.layout.ilotAir } : null,
    { core: coreSig, group: engineGroupSig, crisis: crisisBand }, now - CM.layoutRecomputeAt);
  const coreChanged = th.core;
  if (th.wait) {
    if (th.group && engineSig !== _lyLevelsSig) refreshLevels();   // la nappe suit chaque achat
    return;
  }
  // Geste de caméra en cours → recompute différé à l'accalmie (cf. bloc de
  // constantes plus haut). Jamais pendant une capture (déterminisme du harnais).
  const cam = CM.cam;
  // Caméra qui SUIT un habitant (fiche d'habitant) : elle glisse à chaque frame
  // sans que le joueur fasse un geste. Ce n'est pas un geste à protéger — le
  // compter comme tel repousserait chaque achat jusqu'au plafond de 10 s.
  const following = !!(CM.focus && CM.focus.cam) && !CM.drag && cam.zoom === CM.zoomGoal;
  if (cam.x !== _lyCamX || cam.y !== _lyCamY || cam.zoom !== _lyCamZ) {
    _lyCamX = cam.x; _lyCamY = cam.y; _lyCamZ = cam.zoom;
    if (!following) _lyCamMoveAt = now;
  }
  if (CM.layout && !CM.capture && now - _lyCamMoveAt < LAYOUT_GESTURE_STILL_MS) {
    if (!_lyDeferredAt) _lyDeferredAt = now;
    if (now - _lyDeferredAt < LAYOUT_DEFER_MAX_MS) return; // on retente à chaque frame
  }
  _lyDeferredAt = 0;
  // Trace (solTrace.js) : QUEL segment de la signature a déclenché ce recompute
  // — segments de `sig` : 0 ère, 1 cycles, 2 crise, 3 merveilles, 4 routes,
  // 5 moteurs — et combien il a coûté, phase par phase
  // (`__layoutProfile`). Mesuré chez Raph : 312-563 ms d'un coup, en plein geste.
  const trSig = solTrace.on ? { prev: CM.layoutSig, core: coreChanged, t0: performance.now() } : null;
  CM.layoutSig = sig;
  CM.layoutStructSig = structSig;
  CM.layoutCoreSig = coreSig;
  CM.layoutGroupSig = engineGroupSig;
  CM.layoutCrisisBand = crisisBand;
  CM.layoutRecomputeAt = now;
  _lyLevelsSig = null;   // plan neuf : la nappe en attente repart de ses niveaux à lui
  const L = computeCityLayout(state);
  if (trSig) {
    const lp = globalThis.__layoutProfileLast;
    const phases = {};
    if (lp) for (const k in lp) if (typeof lp[k] === 'number') phases[k] = Math.round(lp[k] * 10) / 10;
    solRec({ k: 'layout', ms: Math.round(performance.now() - trSig.t0), core: trSig.core,
      diff: keyDiff(trSig.prev, sig, '|'), tiles: Array.isArray(L.tiles) ? L.tiles.length : null, phases });
  }
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
    // Portes réelles (sur rue / total brut, murés compris) : affichage seul,
    // hors de l'état (cityMapBridge.setRoadDoors).
    setRoadDoors(rc
      ? { onRoad: rc.engineConnected | 0, total: Math.max(rc.engineConnected | 0, rc.engineAll | 0) }
      : null);
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
  // Les clés "wonder:*" sont gérées par la boucle de rendu (animation de levée à
  // la (ré)érection) et NON par cette comptabilité de naissance des tuiles : ne
  // pas les purger ici, sinon l'horodatage de naissance est effacé à chaque
  // recalcul (donc à chaque achat) et l'animation d'apparition rejoue.
  for (const k in CM.born) if (!seen[k] && !k.startsWith("wonder:")) delete CM.born[k];

  CM.layout = L;
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

  // Filtre : routes valides et jonctions de pont (ne sert plus qu'à repérer les
  // cellules-pont, ci-dessous).
  const validRoadSet = L.roadSet || new Set(L.roads.map((r) => `${r.gx},${r.gy}`));
  const roadList = L.roads.filter((r) => {
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
  // MOBILIER DES PLACES (docs/PLAN-COMPORTEMENTS.md, lot 1) : chaque case de place a
  // son POINT DE PASSAGE, hors de la base au sol des étals, bancs, margelles, pièce
  // maîtresse (plazaWalkAnchors, isoPlaza.js) ; une case PLEINE sort du réseau piéton.
  // Le blocage précédent recopiait la géométrie du décor de juillet (fontaine au centre,
  // drapeaux aux coins), supprimé depuis : les passants traversaient le kit iso.
  // `CM.plazaWalkOffset` est lu au pas par citizenChooseNext (décalage, en cellules).
  const plazaAnchors = plazaWalkAnchors(L, L.counts ? L.counts.eraBand : 0);
  CM.plazaWalkOffset = plazaAnchors ? plazaAnchors.offset : null;
  CM.walkRoadList = L.roads.filter((r) => cmIsWalkableRoad(L, r.gx, r.gy) && !(plazaAnchors && plazaAnchors.blocked.has(r.gx * 10000 + r.gy)));
  // La GRILLE DES SQUARES (audit 2026-10-05, BUG-62) : on y entre par ses portes.
  CM.fenceWalkBlock = fenceWalkBlock(L, L.counts ? L.counts.eraBand : 0);
  // Cellules de route appartenant aux places : cibles de flânerie des piétons.
  CM.plazaRoadCells = [];
  if (L.plan && Array.isArray(L.plan.plazas)) {
    for (const p of L.plan.plazas) {
      for (const r of CM.walkRoadList) {
        if (Math.abs(r.gx - p.gx) <= p.size && Math.abs(r.gy - p.gy) <= p.size) CM.plazaRoadCells.push(r);
      }
    }
  }
  // ── FOYER DU CAMPEMENT : on en fait le TOUR (retour Raph, 2026-10-03) ──────
  // Les sentiers du camp convergent SUR le feu (layout.js, CAMP_HEARTH) : en les
  // suivant, les habitants traversaient les flammes. La case du feu sort donc du
  // réseau piéton, et ses huit voisines y entrent — un anneau de terre battue,
  // gardé de tout bâti et de tout arbre par la pose (hearthClear). Comme un parvis :
  // on y entre depuis la chaussée (roadStepAllowed lit CM.hearthWalkSet).
  CM.hearthWalkSet = new Set();
  if (L.campHearth) {
    const h = L.campHearth, hk = h.gx * 10000 + h.gy;
    const rivC = (L.river && L.river.present && L.river.cells) || null;
    CM.walkRoadList = CM.walkRoadList.filter((r) => r.gx * 10000 + r.gy !== hk);
    const onList = new Set(CM.walkRoadList.map((r) => r.gx * 10000 + r.gy));
    for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) {
      if (!dx && !dy) continue;
      const gx = h.gx + dx, gy = h.gy + dy, k = gx * 10000 + gy;
      if (rivC && rivC.has(gx + "," + gy)) continue;
      CM.hearthWalkSet.add(k);
      if (!onList.has(k)) CM.walkRoadList.push({ gx, gy, rank: "path", hearthRing: true });
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
          // `t` : le bâtiment que borde la cellule — la fiche d'habitant nomme
          // ainsi son logis et son atelier (citizenFocus.js).
          if (CM.walkRoadSet.has(gx * 10000 + gy)) out.push({ gx, gy, t });
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
  const bridgeList = roadList.filter((r) => r.roadSurface === "bridge");
  // Spans de pont (composantes connexes) + repérage du pont HISTORIQUE (le plus
  // proche du cœur, cf. river.bridge). Seul lecteur : le modèle des ponts
  // (iso/isoBridge.js). Adjacence orthogonale sur l'ensemble des cellules-pont.
  CM.bridgeSpans = [];
  {
    const bmap = new Map();
    for (const r of bridgeList) bmap.set(r.gx + "," + r.gy, r);
    const seen = new Set();
    const ortho = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const start of bridgeList) {
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
  // Fiches Y-SORT « peintre » par cellule bâtie (clé gx*10000+gy, fiche PARTAGÉE par
  // empreinte) : x0/x1 = recouvrement colonne (px monde), baseY = ligne de contact au
  // sol (bas d'empreinte — l'ordre du peintre), topY = portée du sprite vers le nord.
  // Maisons/enginehome : hauteur RÉELLE du PNG (houseSpriteHeightTiles, défaut 2.2
  // tuiles tant que pas mesuré). Moteur/civic : clipOnly = ne PEUVENT PAS
  // occulter un agent (scènes basses type champs/marchés) — seulement le « rognage
  // de tête » côté nord.
  const binfo = new Map();
  const Tpx = CM.TILE;
  for (const t of L.tiles) {
    const bx = t.spanX || t.size || 1, by = t.spanY || t.size || 1;
    const isHouse = t.type === "house" || t.type === "enginehome";
    // ⚠ PORTÉE **ISO**, pas la hauteur top-down (S3 de PLAN-RENDU-VILLE) : le
    // seul consommateur vivant de `topY` est l'exclusion des éclaboussures de
    // pluie (isoWeather.splashPointOk), et la formule legacy sous-estimait la
    // portée d'un facteur ~3 — des ronds de pluie tombaient sur le bas des
    // façades. Repli sur l'ancienne valeur tant que le PNG n'est pas mesuré.
    const hTiles = isHouse
      ? (houseSpriteReachTilesIso(t.variant, bx, by) || houseSpriteHeightTiles(t.variant) || 2.2)
      : 1.15;
    const rec = {
      x0: t.gx * Tpx, x1: (t.gx + bx) * Tpx,
      baseY: (t.gy + by) * Tpx, topY: ((t.gy + by) - hTiles) * Tpx,
      clipOnly: !isHouse,
    };
    for (let ax = 0; ax < bx; ax += 1) for (let ay = 0; ay < by; ay += 1) binfo.set((t.gx + ax) * 10000 + (t.gy + ay), rec);
  }
  CM.buildingInfo = binfo;

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
  // La flotte est TENUE, plus rebâtie d'un bloc (cmSyncRoadFleet, BUG-56).
  cmSyncRoadFleet(L, wantVeh, { getVehicleDensity, chooseRoadVehicleType, vehSkinFor });

  // Trafic fluvial : l'EFFECTIF VOULU par métier (marchand / plaisancier /
  // pêcheur) — la vie de chaque bateau est pilotée par riverFleet.js, appelé une
  // fois par frame avant le peintre iso. Ici on ne fait plus que
  // publier la consigne ; la flotte n'est plus reconstruite en bloc (un pêcheur
  // en pose de 90 s n'y survivait pas).
  const hasRiver = !!(L.river && L.river.present);
  const portLvl = hasRiver ? Math.floor((state.buildings && state.buildings.river_ports) || 0) : 0;
  // Les métiers que l'ère sait DESSINER (kit de bateaux) : chaland et passeur n'existent
  // que là (docs/PLAN-BATEAUX.md).
  const kitFleet = L.counts ? fleetFor(L.counts.eraBand | 0) : null;
  CM.shipBudget = riverFleetBudget(state, L, kitFleet ? fleetRoles(L.counts.eraBand | 0) : null);

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
    // POSTES D'ACCOSTAGE (docs/PLAN-BATEAUX.md, lot 4) : le marchand vient se ranger
    // au ponton — bandes 5-9, au quai du terminal de commerce (BUG-17). Vides là où l'ère
    // n'a pas encore son kit de bateaux.
    CM.shipBerths = fleetBerths(L);
    // Les ports que le bac et la navette fuient : les postes des pontons, plus la
    // capitainerie et le terminal (sans ponton depuis BUG-17, ils restent des ports — cf.
    // fleetPortMarks ; le poste de quai du terminal n'y ajoute rien).
    CM.shipPortMarks = fleetPortMarks(L);
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
    // LA MAISON DES PLAISIRS. Même contrat que l'Aiguille, à deux différences :
    // elle n'est pas une merveille (aucun rang à atteindre, elle est là dès la
    // première ère), et sa place est publiée par le layout au lieu d'être
    // déduite d'un `wonderSlot`. `lat` vaut 0 : le lit a été évasé AUTOUR d'elle,
    // elle en occupe donc l'axe.
    //
    // Le rayon ne couvre que le PIED, pas l'envergure des plateaux : ceux-ci
    // surplombent l'eau, et un bateau passe dessous sans rien heurter.
    if (hasRiver && L.river.samples && L.river.plaisirs) {
      const sm = L.river.samples, len = sm.length, p = L.river.plaisirs;
      let bi = 0, bd = Infinity;
      for (let i = 0; i < len; i += 1) { const dd = (sm[i].x - p.x) ** 2 + (sm[i].y - p.y) ** 2; if (dd < bd) { bd = dd; bi = i; } }
      CM.riverObstacles.push({ t: bi / Math.max(1, len - 1), lat: 0, r: p.r || 2.6, id: "plaisirs" });
    }
    // L'ÎLE : un obstacle LONG et non un caillou. Le calcul vit avec `riverDodge`
    // (isoRenderer), qui consomme ces points — publier et éviter sont deux moitiés
    // d'un même contrat, et le piège du rayon nul se lit alors d'un seul coup d'œil.
    CM.riverIslandT = null;
    if (hasRiver && L.river.samples && L.river.islands && L.river.islands.length) {
      for (const o of riverIslandObstacles(L.river.islands, L.river.samples)) {
        CM.riverObstacles.push(o);
      }
      // POSITION DE L'ÎLE SUR LE RUBAN. Le pêcheur qui tourne autour n'a pas de
      // `t` à lui — sa position vit dans un angle. S'il perd son orbite (merveille
      // redevenue dormante), il faut bien qu'il reprenne la route quelque part :
      // sans cette valeur il repartirait de son `t` de NAISSANCE, c'est-à-dire du
      // bord de la carte, et se téléporterait à travers toute la ville avant de
      // s'ancrer. On lui garde donc l'endroit où il se trouve vraiment.
      const sm = L.river.samples, il = L.river.islands[0];
      let bi = 0, bd = Infinity;
      for (let i = 0; i < sm.length; i += 1) {
        const dd = (sm[i].x - il.x) ** 2 + (sm[i].y - il.y) ** 2;
        if (dd < bd) { bd = dd; bi = i; }
      }
      CM.riverIslandT = bi / Math.max(1, sm.length - 1);
    }
    // LE SITE DU PASSEUR : loin du pont et des pontons, près du cœur de la ville.
    // ⚠ EN DERNIER : il lit les passes des ponts (riverGates), les obstacles plantés
    // dans l'eau et l'île, tous calculés ci-dessus. Placé avant eux, il lisait les
    // passes du layout PRÉCÉDENT — vides au chargement : le bac s'installait au pied
    // du pont (retour Raph, 2026-10-03 : « pas logique que le passeur soit à côté
    // du pont »).
    CM.ferrySite = null;
    // Les volées que le bac et la navette demandent au quai (isoQuay.wantQuayStairs),
    // réunies : la géométrie du quai se refait à chaque nouvelle liste.
    const quayWant = [];
    wantQuayStairs(quayWant);
    if (hasRiver && kitFleet && kitFleet.ferry && L.river.samples) {
      const sm = L.river.samples;
      const win = navWindow(sm, { x0: 0, y0: 0, x1: L.gridN || 0, y1: L.gridN || 0 });
      const avoid = [
        ...CM.riverGates.map((g) => g.t),
        ...CM.shipPortMarks,
        ...CM.riverObstacles.map((o) => o.t),
      ];
      if (CM.riverIslandT != null) avoid.push(CM.riverIslandT);
      const c = L.cx != null ? projectOnRibbon(sm, L.cx, L.cy) : null;
      CM.ferrySite = ferrySite(sm, win, avoid, c ? c.t : null);
      if (CM.ferrySite) {
        CM.ferrySite.L = ribbonLength(sm);
        // OÙ LE BAC TOUCHE L'EAU, rive par rive ([−1, +1]) : au bout du tablier de
        // l'embarcadère, ou au PIED DU MUR de quai quand on voit sa face — le mur
        // pend sous le bord et cache une bande d'eau (retour Raph, 2026-10-03 :
        // « qu'il ne rentre pas dans le quai, il s'arrête avant »). L'embarcadère
        // allonge alors son tablier jusque-là (boatScenes). Pas de mur avant la
        // bande 2 (campement), ni là où le quai ne court pas (grève, port).
        // DEPUIS LE 2026-10-04 (Raph : « mets le ponton vraiment au pied de l'escalier, et
        // oui tu peux le faire pour le passeur aussi ») : sur la rive dont on voit le mur,
        // un escalier du quai et un ponton flottant à son pied — le bac traverse au droit de
        // ce ponton ; sur la rive au mur caché, le garde-corps s'ouvre et un ponton part du
        // bord (iso/boatLandings.js). Sans quai : l'embarcadère sur pieux d'avant.
        const FS = CM.ferrySite;
        const band = (L.counts && L.counts.eraBand) | 0;
        const wallT = band >= 2 && quayWallTune.on ? quayWallTiles(band) * (quayWallTune.heightK || 1) : 0;
        ensureQuayGate();
        const g = CM.quayGate, idx = (t) => Math.round(t * (sm.length - 1));
        const walledAt = (t, sd) => { const run = g && (sd > 0 ? g.drawPlus : g.drawMinus); return !!(run && run[idx(t)]); };
        FS.landings = {};
        const vis = visibleSide(sm, FS.t);
        if (wallT > 0 && vis && walledAt(FS.t, vis)) {
          quayWant.push({ id: 'passeur', i: idx(FS.t), side: vis });
          wantQuayStairs(quayWant);
          ensureQuayGeo(L);
          const foot = quayWantedFoot('passeur');
          const P = foot ? stairPontoon(sm, foot, vis, PONTOON_LEN.ferry) : null;
          const face = P ? pontoonFace(sm, P) : null;
          if (face && Math.sign(face.lat) === vis) {
            FS.t = face.t;
            FS.hw = ribbonAt(sm, face.t).hw;
            FS.landings[vis] = P;
          }
        }
        FS.reach = [-1, 1].map((side) => {
          if (FS.landings[side]) return Math.max(FERRY_TIP, FS.hw - Math.abs(pontoonFace(sm, FS.landings[side]).lat));
          const walled = walledAt(FS.t, side);
          const hid = walled ? quayHiddenDepth(sm, FS.t, side, wallT) : 0;
          if (wallT > 0 && walled && hid <= 0) {
            // Le garde-corps passe DEVANT lui (« la barrière doit passer devant le
            // ponton »), avec une OUVERTURE là où on le voit passer sous le bord (« il faut
            // garder une ouverture ») : on y descend par un escalier caché derrière le mur.
            FS.landings[side] = edgePontoon(sm, FS.t, side, wallT);
            const G = FS.landings[side];
            quayWant.push({ id: 'passeur' + side, i: idx(FS.t), side, gapOnly: true, x: G.gx, y: G.gy });
            return Math.max(FERRY_TIP, FS.hw - Math.abs(pontoonFace(sm, FS.landings[side]).lat));
          }
          return Math.max(FERRY_TIP, hid);
        });
        wantQuayStairs(quayWant);
      }
    }
    // LA NAVETTE DES PLAISIRS (boatKitsPlaisirs.js, riverFleet.shuttleStep) : ses deux
    // arrêts. À la Maison, au pied de l'escalier qui descend à l'eau, face au SUD
    // (+y), coque en travers ; en ville, son propre ponton, du même bord, entre le
    // cœur et la Maison. Après le passeur : elle fuit son site comme les autres passes.
    CM.shuttleSite = null;
    const plS = L.river && L.river.plaisirs;
    if (hasRiver && kitFleet && kitFleet.shuttle && plS && L.river.samples) {
      const sm = L.river.samples;
      const band = (L.counts && L.counts.eraBand) | 0;
      const fpS = boatFootprint({ id: kitFleet.shuttle[0] });
      const beam = fpS ? fpS.beam : 0.4;
      const dockY = plS.y + ((MAISON_LANDING_PX[band] || 90) + 1) / 32 + beam / 2;
      const pm = projectOnRibbon(sm, plS.x, dockY);
      const c = L.cx != null ? projectOnRibbon(sm, L.cx, L.cy) : null;
      const win = navWindow(sm, { x0: 0, y0: 0, x1: L.gridN || 0, y1: L.gridN || 0 });
      const avoid = [
        ...CM.riverGates.map((g) => g.t),
        ...CM.shipPortMarks,
        ...CM.riverObstacles.filter((o) => o.id !== 'plaisirs').map((o) => o.t),
      ];
      if (CM.ferrySite) avoid.push(CM.ferrySite.t);
      const site = pm && c ? shuttleSite(sm, win, avoid, c.t, pm.t) : null;
      if (site) {
        const wallT = band >= 2 && quayWallTune.on ? quayWallTiles(band) * (quayWallTune.heightK || 1) : 0;
        ensureQuayGate();
        const g = CM.quayGate, i = Math.round(site.t * (sm.length - 1));
        const walled = (sd) => { const run = g && (sd > 0 ? g.drawPlus : g.drawMinus); return !!(run && run[i]); };
        const r = ribbonAt(sm, site.t);
        let city = null;
        // UN ESCALIER DU QUAI ET UN PONTON À SON PIED (Raph, 2026-10-04 : « le ponton
        // depuis le quai ça fait bizarre, il faut enlever la rambarde à ce niveau-là et
        // faire un escalier »). Sur la rive dont on VOIT le mur : de l'autre, la volée se
        // cacherait derrière le bord de la promenade. Le quai pose la volée (isoQuay,
        // volée demandée, garde-corps ouvert) et publie son pied ; le ponton flotte là,
        // la navette s'amarre à son bout.
        const vis = visibleSide(sm, site.t);
        // Le ponton longe le mur depuis le palier d'en bas de la volée ; la navette s'amarre
        // bord à bord le long de son flanc côté large (pontoonFace).
        if (wallT > 0 && vis && walled(vis)) {
          quayWant.push({ id: 'navette', i, side: vis });
          wantQuayStairs(quayWant);
          ensureQuayGeo(L);
          const foot = quayWantedFoot('navette');
          const P = foot ? stairPontoon(sm, foot, vis, PONTOON_LEN.shuttle) : null;
          const face = P ? pontoonFace(sm, P) : null;
          if (face && Math.sign(face.lat) === vis) {
            const rb = ribbonAt(sm, face.t);
            city = { t: face.t, hw: rb.hw, side: vis, lat: face.lat - vis * (1 / 32 + beam / 2), th: Math.atan2(rb.ty, rb.tx), pontoon: P };
          }
        }
        if (!city) {
          // Repli, du bord de la Maison : sur une rive au mur caché, le garde-corps s'ouvre
          // et un ponton part du bord (la navette s'amarre le long de son bout) ; sans
          // quai, l'embarcadère sur pieux.
          const side = Math.sign(pm.lat) || 1;
          const hid = walled(side) ? quayHiddenDepth(sm, site.t, side, wallT) : 0;
          if (wallT > 0 && walled(side) && hid <= 0) {
            const E = edgePontoon(sm, site.t, side, wallT);
            quayWant.push({ id: 'navette', i, side, gapOnly: true, x: E.gx, y: E.gy });
            const face = pontoonFace(sm, E);
            city = { t: face.t, hw: site.hw, side, lat: face.lat - side * (1 / 32 + beam / 2), th: Math.atan2(r.ty, r.tx), pontoon: E };
          } else {
            const reach = Math.max(FERRY_TIP, hid);
            city = { t: site.t, hw: site.hw, side, reach, lat: side * Math.max(0.3, site.hw - reach - 1 / 32 - beam / 2), th: Math.atan2(r.ty, r.tx) };
          }
        }
        CM.shuttleSite = { city, maison: { t: pm.t, lat: pm.lat, th: 0 } };
      }
    }
    wantQuayStairs(quayWant);
  }
}

// ── FLOTTE DES RUES : TENUE, plus rebâtie d'un bloc (BUG-56, audit du 2026-10-05) ──
// Elle était reconstruite à neuf dès que l'effectif voulu ou le nombre de cases de
// route bougeait (un achat, la croissance — jusqu'à toutes les 1,5 s) : chaque
// véhicule à l'écran sautait d'un coup à sa case de départ, sans le fondu promis
// (`fade` n'était lu nulle part). À l'inverse, sans changement de signature, un
// véhicule dont la case avait disparu restait figé sur place. Désormais, comme les
// passants (cmRetireExcessCitizens) : ceux qui roulent GARDENT leur place —
// updateVehicles (agents.js) remet sur la route la plus proche celui dont la case a
// disparu —, on n'ajoute ou ne retire que l'écart avec l'effectif voulu, et le type
// (avec son skin, son allure, sa teinte) n'est re-tiré qu'au changement d'âge (la
// bande, qui porte les poids et les skins) ou à la ruine. Les nouveaux venus entrent
// en fondu (drawIsoVehicle).
// Chaque véhicule porte son NUMÉRO (`serial`, compteur monotone) : il fonde sa case
// d'apparition, sa graine et ses tirages. Une flotte vide repart de 0 — la première
// flotte d'un plan est celle d'avant, au véhicule près.
export function cmSyncRoadFleet(L, wantVeh, deps = {}) {
  const getVehicleDensity = deps.getVehicleDensity || function () { return 0; };
  const chooseRoadVehicleType = deps.chooseRoadVehicleType || function () { return "wagon"; };
  const vehSkinFor = deps.vehSkinFor || function () { return ""; };
  if (!CM.walkRoadList.length) { CM.vehicles = []; return; }
  const era = L.counts.eraIndex;
  // Le type, son skin, son allure et sa teinte : tirés au numéro `n`, au rang de la rue.
  const retype = (v, n, rank) => {
    const vehicleType = chooseRoadVehicleType(era, rank, n);
    v.type = vehicleType;
    // Une porteuse sur deux (docs/PLAN-COMPORTEMENTS.md, lot 3) : dessinée en
    // août (basket-woman-flat) mais jamais posée — `v.woman` n'était jamais vrai.
    v.woman = vehicleType === "basket" && ((n * 2654435761) >>> 0) % 2 === 1;
    // Modèle et teinte de CETTE voiture-là (flotte moderne). Sans ça une
    // avenue aligne vingt fois la même carrosserie ; c'est le seul endroit
    // où le tirage a lieu, le rendu ne fait que lire v.skin. La BANDE compte :
    // sous la bande 6 le pack ne sort pas et le skin revient vide.
    v.skin = vehSkinFor(vehicleType, n, L.counts.eraBand);
    v.speed = vehicleType === "drone" ? 58 + (n % 5) * 7 : vehicleType === "car" || vehicleType === "taxi" || vehicleType === "police" ? 34 + (n % 6) * 4 : vehicleType === "ambulance" ? 40 + (n % 4) * 4 : vehicleType === "bus" || vehicleType === "truck" ? 24 + (n % 4) * 3 : vehicleType === "van" ? 30 + (n % 5) * 3 : vehicleType === "basket" ? 11 + (n % 3) * 2 : vehicleType === "chariot" ? 24 + (n % 4) * 3 : vehicleType === "caravan" ? 16 + (n % 4) * 2 : 14 + (n % 4) * 2;
    v.col = vehicleType === "car" ? ["#9b4d38", "#c0a85d", "#6f8490", "#a8a092", "#5f6f7c", "#8f6544"][n % 6] : ["#8f6534", "#b08a4a", "#7b5b35", "#c0a46a", "#6f5636", "#9a7440"][n % 6];
  };
  const list = CM.vehicles;
  // Les voitures de l'AUTOROUTE qui roulent en ville (`v.hwy`, highwayTraffic.js) ne sont
  // pas de la flotte : effectif à part, elles ne se comptent ni ne partent ici. Rangées en
  // tête de liste, l'excédent de la flotte part toujours de la queue.
  let nHwy = 0;
  for (const v of list) if (v.hwy) nHwy += 1;
  if (nHwy) {
    const hw = list.filter((v) => v.hwy), own = list.filter((v) => !v.hwy);
    list.length = 0;
    list.push(...hw, ...own);
  }
  if (list.length === nHwy) CM.vehicleSerial = 0;
  // EN RUINE (Usure > 0,88 ou Rupture ≥ 1, le critère de getVehicleDensity) : plus un
  // seul véhicule (décision de Raph, audit du 2026-10-05, MORT-11). Le trafic y devenait
  // des « charrettes brisées » sans sprite iso : invisibles mais simulées — les pigeons
  // fuyaient et les piétons cédaient le passage devant rien. Celui qu'on suit reste (plus
  // bas), à sa monture.
  const ruined = (state.timeWear || 0) > 0.88 || (state.instability || 0) >= 1;
  if (ruined) wantVeh = 0;
  wantVeh += nHwy;
  // Nouvel âge : chacun garde sa place et son conducteur (seed), il change de monture.
  // Pas à chaque ère : dans un même âge le tirage ne change pas, seul le rang de la rue
  // où il roule changerait — une voiture deviendrait charrette sous les yeux du joueur.
  const typeKey = String(L.counts.eraBand | 0);
  if (CM.vehicleTypeKey !== typeKey) {
    CM.vehicleTypeKey = typeKey;
    for (const v of list) {
      if (v.serial == null) continue;   // pas un véhicule de la flotte (molette de dev)
      const road = L.roadMap && L.roadMap.get(v.gx + "," + v.gy);
      retype(v, v.serial, (road && road.rank) || "secondary");
    }
  }
  // Trop de monde : les derniers venus s'en vont. Celui qu'on SUIT (fiche d'habitant)
  // reste, passé en tête — même s'il ne doit plus en rester aucun.
  if (list.length > wantVeh) {
    const fv = CM.focus && CM.focus.kind === "vehicle" ? CM.focus.p : null;
    const fi = fv ? list.indexOf(fv) : -1;
    if (fi >= wantVeh) { list.splice(fi, 1); list.unshift(fv); }
    list.length = Math.max(wantVeh, fi >= 0 ? 1 : 0);
  }
  if (list.length >= wantVeh) return;
  // Pas assez : les nouveaux venus sur les grands axes d'abord (case tirée au numéro).
  const ranked = CM.walkRoadList.filter((r) => getVehicleDensity(era, r.rank || "secondary") > 0.08);
  const weighted = [];
  for (const r of (ranked.length ? ranked : CM.walkRoadList)) {
    if (r.rank === "plaza") continue; // les esplanades sont piétonnes
    const weight = r.rank === "main" ? 11 : r.rank === "avenue" ? 7 : r.rank === "secondary" ? 3 : 0;
    for (let w = 0; w < Math.max(1, weight); w += 1) weighted.push(r);
  }
  const pool = weighted.length ? weighted : CM.walkRoadList;
  while (list.length < wantVeh) {
    const n = CM.vehicleSerial || 0;
    CM.vehicleSerial = n + 1;
    const r = pool[(n * 53) % pool.length];
    const v = {
      gx: r.gx, gy: r.gy, x: (r.gx + 0.5) * CM.TILE, y: (r.gy + 0.5) * CM.TILE,
      tx: (r.gx + 0.5) * CM.TILE, ty: (r.gy + 0.5) * CM.TILE,
      fade: 0, // fondu d'apparition (updateVehicles le fait monter, drawIsoVehicle l'applique)
      dir: n % 2 ? 0 : 2, goal: null, pauseT: 0,
      // Plus de stationnement : les véhicules démarrent et restent en mouvement.
      parkT: 0,
      parkSide: n % 2 ? 1 : -1,
      serial: n,
      // Graine de la fiche d'habitant (citizenFocus.js) : conducteur, chargement.
      // Elle marque aussi « véhicule de la flotte » — seuls ceux-là sont cliquables.
      seed: cmHash(`${state.cycles || 0}:veh:${n}:${r.gx},${r.gy}`) >>> 0,
    };
    retype(v, n, r.rank || "secondary");
    list.push(v);
  }
}

// ⚠ Exportée pour les tests (flotteEtNumeros.test.js) : rien d'autre ne l'appelle
// hors de la boucle de frame.
export function spawnOneCitizen(L) {
  // NUMÉRO D'APPARITION MONOTONE (BUG-58, audit du 2026-10-05). C'était la longueur de
  // la liste : un passant qui s'en va en milieu de liste (le compagnon dont le meneur
  // rentre, la compaction d'updateCitizens) libérait un numéro encore porté par un
  // vivant plus loin — le suivant naissait son CLONE (même seuil, même nom, même tenue,
  // même âge). Le compteur ne repart de 0 que sur une liste vide : plus aucun vivant
  // avec qui entrer en collision, et la distribution reste celle d'avant.
  if (!CM.citizens.length) CM.citizenSerial = 0;
  const n = CM.citizenSerial || 0;
  CM.citizenSerial = n + 1;
  const band = L.counts.eraBand || 0;
  const cycles = state.cycles || 0;
  // Cellule d'APPARITION : le seuil d'un logement (citizenSpawnCell, agents.js) — plus
  // de piéton qui se matérialise au milieu de la chaussée. Tirage à part du seed
  // d'apparence, qui garde sa formule d'origine (cellule comprise).
  // LE FOYER (fiche d'habitant, 2026-10-07) : il naît chez lui, à une place libre de
  // sa famille (citizenIdentity.js). Le premier seuil tiré est celui d'avant ; s'il
  // n'y a pas de place pour lui (le mari déjà dans la rue, un vieux dessin chez un
  // jeune couple) ou si la maison n'est pas encore bâtie, on en tire jusqu'à
  // SPAWN_TRIES. Aucun ne va : il naît au premier, hébergé chez la tête du foyer.
  // ⚠ QUI il est se tire UNE fois, au premier seuil (type, dessin, graine) ; les
  // essais suivants ne changent que sa PORTE. Retirer la personne à chaque essai
  // écartait ceux qui trouvent rarement une place (le moine, sans famille ; le
  // garçon, qu'il faut une place de garçon) : la rue se remplissait de femmes.
  const r0 = citizenSpawnCell(cmHash(`${cycles}:${n}:seuil`));
  if (!r0) return;
  const seed = cmHash(`${cycles}:${n}:${r0.gx},${r0.gy}`);
  const who = citizenWho(seed, band);
  const taken = livingHouseholdSlots();
  const tries = who.celibate ? 1 : SPAWN_TRIES;
  let first = null, pick = null;
  for (let k = 0; k < tries && !(pick && pick.slot); k += 1) {
    const r = k ? citizenSpawnCell(cmHash(`${cycles}:${n}:seuil:${k}`)) : r0;
    if (!r) break;
    const cand = { r, ...householdAt(r, seed, who, cycles, taken) };
    if (!first) first = cand;
    if (!r.t) { pick = cand; break; }          // seuil sans maison connue : sa famille vit ailleurs
    if (r.t.type === "enginehome" && cmEngineHomeHidden(r.t)) continue;   // pas encore bâtie
    if (!pick || cand.slot) pick = cand;
  }
  pick = pick || first;
  const { r, household, slot } = pick;
  const { charType, skinVariant, sprite } = who;
  // Rôles définis par la config d'âge (huttes → tours), repli : CM_ROLES par bande.
  const roleList = (L.ageCfg && L.ageCfg.citizenRoles)
    || CM_ROLES[Math.min(L.counts.eraBand || 0, CM_ROLES.length - 1)];
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
  // Domicile & lieu de travail : ancres fixes tirées via le seed (stables dans le
  // temps). Repli null tant que la ville n'a ni logement ni atelier bordé de route →
  // le piéton garde alors la flânerie libre (cf. citizenChooseNext).
  const homeCells = CM.homeRoadCells, workCells = CM.workRoadCells;
  // Le domicile EST la cellule d'apparition : il sort de chez lui, et c'est là que le
  // soir le ramène (citizenChooseNext). Null tant que la ville n'a aucun logement
  // bordé de route — le spawn s'est alors rabattu sur la voirie.
  const home = homeCells && homeCells.length ? r : null;
  // Un travail PROCHE de chez soi (docs/PLAN-COMPORTEMENTS.md, lot 2), et qui va
  // avec ce qu'il est (fiche d'habitant, 2026-10-07) : l'enfant à l'école s'il y en a
  // une, le métier dessiné dans un bâtiment de son métier (le moine au culte des
  // ancêtres, le légionnaire aux Veilleurs), les autres où le tirage d'avant les met
  // — et c'est alors l'atelier qui leur donne leur métier (les Moulins, un meunier).
  const prof = SPRITE_PROFILE[sprite] || {};
  const child = charType === 2;
  let work = null;
  if (workCells && workCells.length) {
    work = child ? citizenWorkNear(r, seed, SCHOOLS)
      : prof.job ? citizenWorkNear(r, seed, jobWorks(prof.job))
        : citizenWorkNear(r, seed);
  }
  const workJob = !child && !prof.job && work && work.t ? jobOfBuilding(work.t.buildingId, band) : null;
  const identity = buildIdentity({
    seed, band, child, fem: who.fem, sprite, job: workJob, household, slot,
  });
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
    skin: SKINS[(seed >>> 3) % SKINS.length],
    hat,
    // Fiche d'habitant (citizenFocus.js) : QUI il est, tiré d'un seul tenant
    // (citizenIdentity.js) — nom, âge, métier, caractère et famille accordés à son
    // dessin et à son foyer. `name` et `fem` en sont la copie que lisent les bulles,
    // le journal et l'infobulle.
    seed,
    fem: identity.fem,
    name: identity.name,
    identity,
    role: cmPick(roleList, Math.floor(seed / 13))
  });
}

// Combien de seuils on essaie pour qu'un nouveau venu naisse à une place libre de son
// foyer (spawnOneCitizen). Le premier est celui d'avant la fiche.
const SPAWN_TRIES = 6;
// Les places tenues par un passant vivant (ou qui rentre s'effacer), par foyer :
// Map(graine du foyer → Set des places).
function livingHouseholdSlots() {
  const out = new Map();
  for (const q of CM.citizens) {
    const id = q.identity;
    if (q._dead || !id || id.household == null || !id.slot) continue;
    let s = out.get(id.household);
    if (!s) out.set(id.household, (s = new Set()));
    s.add(id.slot);
  }
  return out;
}
// QUI naît : son type, son dessin. Type d'habitant : 0 homme (42 %) / 1 femme (42 %)
// / 2 enfant (16 %), variante de dessin sur 12 (multiple de 1, 2, 3, 4 et 6 : chaque
// dessin d'une liste sort aussi souvent que les autres, PLAN-VIVANT). ⚠ `>>>` et non
// `>>` (2026-10-07) : la graine est un uint32, `>>` la relisait SIGNÉE, et une graine
// sur deux donnait un reste négatif — 71 % d'hommes au lieu de 42, et 45 % des
// passants retombés sur le dessin 0.
function citizenWho(seed, band) {
  const charType = ((seed >>> 6) % 100) < 42 ? 0 : ((seed >>> 6) % 100) < 84 ? 1 : 2;
  const fem = charType === 1 || (charType === 2 && ((seed >>> 17) & 1) === 1);
  const skinVariant = (seed >>> 13) % 12;
  const sprite = citizenSpriteName({ charType, skinVariant }, band);
  const prof = SPRITE_PROFILE[sprite] || {};
  const celibate = charType !== 2 && !!(prof.job && JOBS[prof.job] && JOBS[prof.job].celibate);
  return { charType, fem, skinVariant, sprite, child: charType === 2, band, celibate };
}
// Son foyer à ce seuil, et la place qu'il y prend : la maison du seuil (la même
// graine que son nom dans l'infobulle), un appartement d'immeuble, ou, sans logis,
// une famille qui vit ailleurs.
function householdAt(r, seed, who, cycles, taken) {
  const band = who.band;
  const t = r.t;
  let household = null, slot = null;
  if (t && (t.type === "house" || t.type === "enginehome")) {
    const key = t.key || `${t.gx},${t.gy}`;
    if (CM_COLLECTIVE_HOMES.has(t.variant)) {
      const a0 = (seed >>> 9) % APARTMENTS;
      for (let a = 0; a < APARTMENTS && !slot; a += 1) {
        const hh = householdOf(householdSeedOf(key, cycles, (a0 + a) % APARTMENTS), band);
        const s = householdSlot(hh, who, taken.get(hh.seed) || new Set());
        if (!household || s) { household = hh; slot = s; }
      }
    } else {
      household = householdOf(householdSeedOf(key, cycles), band);
      slot = householdSlot(household, who, taken.get(household.seed) || new Set());
    }
  } else {
    for (let j = 0; j < 8 && !slot; j += 1) {
      household = householdOf(cmHash(`${seed}:foyer:${j}`), band);
      slot = householdSlot(household, who, new Set());
    }
  }
  return { household, slot };
}

// SOUS-PAS DE SIMULATION (BUG-67, audit du 2026-10-05). Le pas reste plafonné à
// 1/30 s (au-delà, un passant ou un véhicule enjamberait sa case cible), mais une
// frame lente — rendu logiciel, ~16 images/s sans GPU — le joue en PLUSIEURS pas au
// lieu d'un seul : passants, véhicules et bateaux avançaient à la moitié du temps
// réel, et leurs horaires (rentrer au crépuscule) dérivaient du ciel, qui suit
// l'horloge murale. Au plus 3 pas (0,1 s) : au-delà (onglet revenu, gel), le
// ralenti est accepté. Tolérance de 10 % sur le pas unique : à 30 images/s, le bruit
// de l'horloge rAF (33,4 ms) ne double pas la simulation pour rien — il perd ce
// qu'il perdait avant, au plus 3 ms.
export function simStepsFor(sec) {
  const t = Math.max(0, Math.min(0.1, sec || 0));
  const steps = Math.max(1, Math.ceil(t * 30 - 0.1));
  return { steps, dt: Math.min(1 / 30, t / steps) };
}

function initCityMap(canvas, options = {}) {
  if (CM.inited) return;
  if (!canvas || typeof canvas.getContext !== "function") return;
  const mapRoot = options.mapRoot || canvas.parentElement;
  const isActive = options.isActive || function () { return true; };

  CM.inited = true;
  CM.canvas = canvas;
  CM.ctx = canvas.getContext("2d");
  if (!CM.ctx) { CM.inited = false; CM.canvas = null; return; } // G-30 : contexte 2D perdu → abandon propre (sinon tailles offscreen NaN)
  cityMapEnsureTooltip(mapRoot, options.tooltip);
  const resize = () => cityMapResizeCanvas(canvas);
  resize();
  // PAS D'INVALIDATION AU MONTAGE. `App.jsx` monte la vue Cité en
  // `{activeView === 'city' && <CityView/>}` : quitter l'onglet la DÉMONTE, y
  // revenir rappelle ici. Les cuissons (sol en pyramide, quais en tuiles) sont
  // tenues par leurs modules, survivent au démontage et se gardent par leur clé
  // de contenu ; les jeter ici coûtait ~1 s à 14 fps à chaque retour sur la
  // carte (mesuré sur le téléphone de Raph, 2026-07-28). Les deux offscreen
  // plein écran qui se réutilisaient ici sont partis le 2026-10-01.
  // Préchargement des sprites d'habitation dès le MONTAGE (avant le 1er paint / bake) : les
  // PNG démarrent tout de suite → pixelHouseReady vrai à la 1re apparition d'un bâtiment,
  // donc pas de repli procédural visible à l'achat. Band de la save = couvre une ouverture
  // directe en ère cosmique. Le recompute rappelle preloadHouseSprites avec la band courante.
  preloadHouseSprites(((cityCounts(state) || {}).eraBand) || 0);
  // RÉALLOUER LE CANVAS LE VIDE (audit 2026-10-05, BUG-90) : les rappels resize et
  // ResizeObserver tournent HORS de la chaîne rAF, et la frame suivante pouvait être
  // sautée par le throttle — la carte clignotait pendant un redimensionnement de
  // fenêtre, un flash vide à la maximisation. On la repeint dans la même image.
  // forceFrame et captureFrame gardent `resize` nu : ils peignent juste après.
  const onResize = () => { if (resize()) repaintNow(false); };
  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(onResize) : null;
  if (resizeObserver) resizeObserver.observe(canvas);
  window.addEventListener("resize", onResize);
  const cleanupInput = bindCityMapInput(canvas, mapRoot, {
    showHover: (sx, sy, opts) => cityMapShowTooltip(cityMapHitTest(sx, sy), sx, sy, opts),
    clearHover: () => cityMapShowTooltip(null),
    onCitizenThoughtClicked: options.onCitizenThoughtClicked
  });
  CM.cleanup = () => {
    cleanupInput();
    resizeObserver?.disconnect();
    window.removeEventListener("resize", onResize);
    cityMapShowTooltip(null);
    CM.repaintNow = null;
    // ÉTAT D'ENTRÉE remis à zéro (BUG-91) : seul `mouseleave` vidait le pointeur et
    // le passant survolé, et il ne vient pas quand on change d'onglet AU CLAVIER la
    // souris posée sur la carte. Au retour, un clic sans bouger retombait sur
    // `CM.hoverPick` (cf. le clic de bindCityMapInput) et ouvrait la fiche du
    // passant survolé avant le départ ; citizenHoverTick repartait d'un pointeur
    // périmé.
    CM._mouse = null;
    CM.hoverPick = null;
    CM._cursorBase = null;
  };
  const cityMapRuntimeDeps = { getVehicleDensity, chooseRoadVehicleType, vehSkinFor };

  // Cap de frame : cmFrameMs (variable de module) — piloté par le préréglage
  // Qualité (30 fps par défaut/allégé, 60 fps en palier haut). Lu à chaque frame,
  // relevé par l'économie d'énergie (fenêtre sans focus, joueur absent :
  // energySaver.js) sauf pendant la chute.
  let last = performance.now();
  // Vsync mesurée sur les rappels rAF (frameCadence.js, PERF-57) : la tolérance du
  // saut d'image en est la moitié, au plus 8 ms.
  const vsyncEst = makeVsyncEstimator();
  let lastRaf = 0;
  // ── Cycle jour/nuit ── phase ancrée sur l'horloge murale (Date.now) : la
  // position dans le cycle survit à l'actualisation et aux reloads dev, au lieu
  // de repartir en plein jour à chaque chargement. Courbe à PLATEAUX : le jour
  // est l'état de lecture normal, la nuit un événement court qui met les
  // lumières en valeur — plus de transition permanente façon sinus.
  const DAY_CYCLE_MS = 540000;                              // cycle complet : 9 min
  const DAY_END = 0.55, DUSK_END = 0.65, NIGHT_END = 0.90;  // jour 55 % / crépuscule 10 % / nuit 25 % / aube 10 %
  // Fenêtre d'émeutes : la fin de l'après-midi QUI DÉBORDE SUR LE CRÉPUSCULE.
  // 23 % du cycle, soit la dose de l'ancienne courbe sinus (23,4 %) recalée sur
  // les plateaux (arbitrage Raph 2026-07-20 : revenir à la dose d'origine).
  // 2026-10-04 (analyse du visuel de crise, Raph : oui) : la fenêtre s'arrêtait
  // PILE à DAY_END, là où le crépuscule commence — les torches des émeutiers (halo
  // dès nightF > 0,05) ne s'allumaient donc jamais. Décalée de 8 points, même dose :
  // ~40 s de torches dans le soir qui tombe, à chaque émeute.
  const RIOT_START = 0.40, RIOT_END = 0.63;                 // fenêtre = [0.40, 0.63)
  const smooth01 = (t) => t * t * (3 - 2 * t);
  function cmDayNightF(p) {
    if (p < DAY_END) return 0;
    if (p < DUSK_END) return smooth01((p - DAY_END) / (DUSK_END - DAY_END));
    if (p < NIGHT_END) return 1;
    return smooth01((1 - p) / (1 - NIGHT_END));
  }
  let lastCitizenSpawn = 0;
  // ── REPEINTE SYNCHRONE (audit du 2026-10-05, BUG-90) ────────────────────────
  // Une frame peinte TOUT DE SUITE, hors de la chaîne rAF : après une réallocation
  // du canvas (qui l'a vidé). Elle passe le throttle et ne ré-arme PAS la boucle —
  // sinon chaque redimensionnement ajouterait une chaîne rAF de plus. `always` la
  // peint même vue inactive : le dialogue d'Options couvre la carte (boucle en
  // pause) avec un fond translucide, et un changement de Qualité qui change le dpr
  // la laissait vide derrière lui jusqu'à sa fermeture.
  let syncPaint = 0;                 // 0 = frame de la boucle, 1 = synchrone, 2 = synchrone même inactive
  function repaintNow(always) {
    if (!CM.ctx || !CM.canvas) return;
    syncPaint = always ? 2 : 1;
    try { frame(performance.now()); } finally { syncPaint = 0; }
  }
  CM.repaintNow = repaintNow;
  // ── LA BOUCLE : seul le rAF se ré-arme (audit du 2026-10-05, PERF-58) ───────
  // frameBody se replanifiait lui-même, si bien que chaque appel synchrone
  // (forceFrame, captureFrame — donc chaque « Garder une image » de la
  // contemplation) lançait une SECONDE chaîne rAF, perpétuelle : un rappel de
  // plus par vsync jusqu'au démontage, et resetCityMapRuntime n'annulait que la
  // dernière (CM.raf ne garde qu'un id). Les appelants synchrones passent par
  // frame(), qui dessine sans replanifier.
  function loop(now) {
    // Carte démontée : ne PAS se replanifier (la boucle meurt proprement ;
    // initCityMap relance une boucle neuve au prochain montage).
    if (!CM.ctx || !CM.canvas) return;
    CM.raf = requestAnimationFrame(loop);   // AVANT de travailler : une exception ne tue pas la boucle
    if (lastRaf) vsyncEst.note(now - lastRaf);   // seuls les rappels rAF mesurent la vsync
    lastRaf = now;
    frame(now);
  }
  // ── FILET D'EXCEPTION DE LA BOUCLE (audit du 2026-10-05, BUG-32) ────────────
  // `loop` ré-arme son rAF AVANT de travailler : sans filet, une exception
  // dans une passe se rejouait à chaque image (console inondée, carte figée sur
  // une image partielle) et, tombée entre un save() et son restore(), laissait la
  // pile du contexte grossir d'une frame à l'autre. Ici : un message toutes les
  // 5 s au plus, avec la pile ; le contexte rendu à son état de base (cf.
  // frameGuard.js) ; la couche de lumière désarmée ; le relevé ouvert par fpBegin
  // refermé. La boucle continue, la frame suivante repart d'un contexte propre.
  // TOUS les appelants passent par ici : le rAF, forceFrame et captureFrame.
  function frame(now) {
    try {
      frameBody(now);
    } catch (e) {
      recoverMapFrame(e, CM.ctx, CM.dpr || 1);
      endLightLayer();
      fpEnd();
    }
  }
  function frameBody(now) {
    // Carte démontée (forceFrame/captureFrame tardifs) : rien à peindre. Le
    // rAF, lui, se replanifie dans loop() seulement.
    if (!CM.ctx || !CM.canvas) return;
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
    // Les 8 ms ne valent qu'à 60 Hz : la tolérance est une demi-vsync MESURÉE, au
    // plus 8 ms (frameCadence.js ; PERF-57, décision de Raph du 2026-10-05). À 144-
    // 240 Hz, 8 ms fixes laissaient « 60 » tourner à 72-82 i/s.
    // Économie d'énergie (energySaver.js, PERF-5) : le cap est RELEVÉ sans focus
    // ou joueur absent, jamais abaissé ; même tolérance (12 i/s = 5 vsyncs à 60 Hz).
    // La repeinte synchrone (canvas réalloué, donc vide) le court-circuite aussi.
    if (now - last < mapFrameMs(cmFrameMs, now, !!CHUTE.act) - vsyncEst.tolerance() && !CM.capture && !syncPaint) return;
    const dt = Math.min(1 / 30, (now - last) / 1000);
    // La simulation (passants, véhicules, émeute, bateaux) en sous-pas de ≤ 1/30 s
    // (simStepsFor, BUG-67) ; la capture garde son pas unique, déterministe.
    const sim = CM.capture ? { steps: 1, dt } : simStepsFor((now - last) / 1000);
    last = now;
    // Capture déterministe : rendre MÊME si la vue est « inactive » (modal de crise,
    // autre onglet) — sinon la capture renvoie un canvas périmé (gotcha harnais).
    // Même chose pour la repeinte forcée d'un changement de Qualité (syncPaint 2).
    const active = isActive() || !!CM.capture || syncPaint === 2;
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
      noteMapCamera(CM.cam, now);   // « caméra posée » de l'économie d'énergie
      citizenHoverTick(now);   // passant sous la souris, caméra posée pour cette frame
      cmCheckWonders(now);
      fp('camera-merveilles');

      // Arrivée progressive des citoyens : cadence selon l'ère et la population
      const target = CM.citizenTarget || 0;
      if (CM.layout && CM.walkRoadList.length && CM.citizens.length < target) {
        const eraIndex = CM.layout.counts ? (CM.layout.counts.eraIndex || 0) : 0;
        // Intervalle en ms : de 2400ms (ère 0) à 120ms (ère 20+), lié à l'ère.
        // Sauf au CAMPEMENT (bande 0) : à 2,4 s par habitant, le joueur qui ouvre
        // le jeu regardait un camp vide pendant une demi-minute. Il se peuple en
        // quelques secondes, toujours un par un et en fondu.
        const campBand = CM.layout.counts && (CM.layout.counts.eraBand | 0) === 0;
        const msPerCitizen = campBand ? CAMP_CROWD.spawnMs : Math.max(120, 2400 - eraIndex * 120);
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
      // Capture DÉTERMINISTE (harnais __cityShot) ou capture LIVE (« Garder une
      // image » de la contemplation, audit 2026-10-05 BUG-89) : la seconde promet
      // la scène À L'HEURE QU'IL EST — météo, ambiance, heure (brume) et émeute
      // comprises. Tout ce qui fige un cliché se garde donc par `detCapture`, et
      // seul ce qui force le RENDU (throttle, vue inactive, budgets) par CM.capture.
      const detCapture = !!CM.capture && !CM.capture.live;
      // En capture, la fenêtre est COUPÉE : un cliché est déterministe, l'heure
      // murale ne doit pas décider si une foule d'émeute y figure (captureFrame
      // isole aussi CM.rioters — la frame forcée purge la sim, cf. updateCrisis).
      CM.riotWindow = !detCapture && dayP >= RIOT_START && dayP < RIOT_END;
      // Grâce de la première partie : lue UNE fois par frame, partagée par le jour
      // et le ciel. Elle ne touche que l'AFFICHAGE en mode « auto » : un choix
      // explicite du joueur (Options : Nuit, Averse) gagne toujours, et la
      // fenêtre d'émeutes ci-dessus reste sur l'horloge murale (gameplay).
      const firstGrace = !detCapture && firstGameGraceActive(state);
      if (detCapture) {
        // Capture déterministe : plein jour (ou nuit forcée).
        CM.nightF = CM.capture.night; CM.dayRising = false;
        CM.dayP = null;
      } else if (dayNightMode !== 'auto') {
        CM.nightF = dayNightMode === 'night' ? 1 : 0;
        // Heure publiée pour la brume (iso/isoVie.js) : ciel figé = heure figée.
        CM.dayP = dayNightMode === 'night' ? 0.8 : null;
        CM.dayRising = false;
      } else {
        const realNightF = cmDayNightF(dayP);
        if (cmGraceDay(firstGrace, realNightF === 0)) {
          CM.nightF = 0; CM.dayRising = false;
          CM.dayP = null;
        } else {
          CM.nightF = realNightF;
          CM.dayP = dayP;
          CM.dayRising = dayP < DUSK_END;
        }
      }
      // Indice de santé de la cité (0 = agonie, 1 = prospérité) : la taille
      // pilote l'échelle, la santé pilote l'ambiance (palette, lumières).
      if (detCapture) { CM.healthF = CM.capture.health; } else {
        let healthT;
        try {
          const pr = pressureBreakdown();
          const vt = cityVitals();
          const prosper = Math.max(0, Math.min(1, 0.55 + vt.foodBonus * 1.6 + vt.goldBonus * 0.9 + vt.knowledgeBonus * 0.9));
          const strain = Math.max(0, Math.min(1, pr.total * 0.5 + (state.instability || 0) * 0.55 + (state.timeWear || 0) * 0.6));
          healthT = Math.max(0, Math.min(1, prosper * 0.45 + (1 - strain) * 0.55));
        } catch { healthT = CM.healthF; }
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
      // Vie de la carte : UN SEUL point de coupe pour tout ce qui bouge sans
      // porter d'information (particules, fontaines, et les couches à venir).
      // Distinct de la Qualité, qui elle touche la résolution et la densité.
      // En capture, ambiance PLEINE : un cliché ne doit pas dépendre d'une
      // préférence de confort (même raison que la fenêtre d'émeute ci-dessus).
      // Sauf le cliché LIVE : il montre la carte telle que le joueur l'a réglée.
      CM.ambianceK = detCapture ? 1 : ambianceK();
      // SAISON : un ENTIER, jamais de valeur continue (cf. seasonMode.js). Elle
      // entre dans la clé du bake du sol, donc chaque cran coûte une recuisson :
      // c'est la raison du cycle très lent, et de l'absence de fondu.
      // Les HABITATIONS sont peintes en direct (iso/isoLivePaint.js) et leur
      // variante neigeuse a sa propre entrée de cache (pixelHouses.js, « :w ») :
      // rien à rejeter à la main au cran.
      CM.season = currentSeason();
      // MÉTÉO : une seule source par frame, lue par toutes les couches (pluie,
      // assombrissement, densité de foule). En capture, temps dégagé : un cliché
      // est déterministe, l'horloge murale ne décide pas s'il y pleut (le cliché
      // LIVE, lui, garde l'averse qui tombe).
      {
        const CLEAR = { rainF: 0, windX: 0, gustF: 0 };
        const real = detCapture ? CLEAR : weatherState();
        // Grâce de la première partie : ciel tenu dégagé, relâché seulement quand
        // le ciel réel l'est déjà (jamais d'averse qui tombe d'un bloc).
        const w = (!detCapture && weatherMode === 'auto' && cmGraceSky(firstGrace, real.rainF === 0)) ? CLEAR : real;
        CM.rainF = w.rainF;
        CM.windX = w.windX;
        // RAFALE en cours (0..1) : densité, vitesse et inclinaison de l'averse,
        // et l'agitation de l'eau. Un seul signal de plus, lu par les mêmes
        // couches — rien de nouveau à faire vivre entre les frames.
        CM.gustF = w.gustF;
        // Sous l'averse, les rues se vident. On ne recale la foule que par
        // PALIERS (cmRecomputeCitizenTarget tronque la liste des piétons, donc
        // l'appeler à chaque frame hacherait la foule).
        // ⚠ JAMAIS en capture (BUG-89) : le ciel dégagé forcé du cliché basculait
        // le palier, la foule était recalée (les passants qui rentraient s'abriter
        // faisaient demi-tour), puis la frame suivante la recalait en sens inverse.
        const step = CM.rainF > 0.6 ? 2 : CM.rainF > 0.15 ? 1 : 0;
        if (!CM.capture && step !== CM._weatherStep) {
          CM._weatherStep = step;
          CM.weatherCrowdK = step === 2 ? 0.35 : step === 1 ? 0.7 : 1;
          cmRecomputeCitizenTarget();
        }
      }
      // Cache per-frame derived values — constant within a frame, avoids recompute par sprite/route
      // Les fenêtres « allumées » des sprites sont de VRAIES lumières :
      // alpha entièrement piloté par la nuit (0 en plein jour).
      // (CM.litWarm, l'ambre des fenêtres des scènes procédurales, est parti avec elles —
      // audit du 05/10, MORT-2 : plus personne ne le lisait.)
      const _n = CM.nightF;
      CM.litGold = `rgba(255,220,120,${(_n * 0.95).toFixed(2)})`;
      if (CM.layout && CM.layout.counts) {
        CM.frameRuined = (state.timeWear || 0) > 0.88 || (state.instability || 0) >= 1;
      }
      fp('ambiance-meteo-saison');
      // Detection d'effondrement (anim de destruction centre -> exterieur).
      if (typeof collapseInProgress !== "undefined" && collapseInProgress) { if (!CM.collapseAt) CM.collapseAt = now; }
      else { CM.collapseAt = 0; }
      // Révélation per-buy des maisons-MOTEUR : compteur = maisons du palier (engineHomes)
      // + achats depuis le dernier recompute (borné au LOOKAHEAD=44 du pool pré-placé).
      // Rafraîchi chaque frame (~29 additions) → « 1 achat = 1 bâtiment » qui apparaît,
      // SANS recompute du layout. Calculé AVANT le peintre : drawIsoLive masque
      // revealIdx >= compteur.
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
            if (_t.type === 'enginehome' && (_t.revealIdx || 0) === _last) {
              _t._revealPinAt = now;
              // Son de la maison qui sort de terre (audio/moments, lot 7 du paysage sonore) :
              // il ne joue qu'après un achat à la main ; sa place à l'écran fait le panoramique.
              const _s = worldToScreen((_t.gx + (_t.spanX || _t.size || 1) / 2) * CM.TILE, (_t.gy + (_t.spanY || _t.size || 1) / 2) * CM.TILE);
              annoncer('batiment', { sx: _s.x, cw: CM.cw, vu: _s.x >= 0 && _s.x <= CM.cw && _s.y >= 0 && _s.y <= CM.ch, bande: (CM.layout.counts.eraBand | 0) });
              break;
            }
          }
          CM._revealSeen = _rev;
        } else if (_rev < CM._revealSeen) {
          CM._revealSeen = _rev;
        }
      }
      fp('reveal-per-achat');
      // FLOTTE : un SEUL point de simulation, ici, en amont du peintre, qui ne fait
      // plus que dessiner. (Du temps des deux rendus, chacun avançait `t` de son côté
      // et ils avaient divergé en silence : escale à quai, seuil d'ère du vapeur.)
      if (!CM.fleetCtl) CM.fleetCtl = makeFleetCtl();
      const _noLife = !!(CM.capture && CM.capture.citizens === 'none');
      const _fleetBudget = _noLife ? { trade: 0, yacht: 0, fisher: 0 } : (CM.shipBudget || { trade: 0, yacht: 0, fisher: 0 });
      const _fleetEnv = {
          docks: CM.shipDocks || [],
          avoidT: CM.shipAvoidT || [],
          // L'île, si elle existe : c'est elle qui donne au pêcheur son circuit.
          // Passée PAR RÉFÉRENCE plutôt que recopiée dans le bateau — un pêcheur
          // qui garderait une copie de la géométrie tournerait autour d'une île
          // d'avant le dernier recalcul, donc à côté de la vraie.
          island: (CM.layout && CM.layout.river && CM.layout.river.islands
            && CM.layout.river.islands[0]) || null,
          islandT: CM.riverIslandT,
          // NAVIGATION (docs/PLAN-BATEAUX.md §5) : la voie et le cap vivent dans la
          // sim — géométrie du ruban, passes de pont, obstacles plantés dans l'eau,
          // et la taille RÉELLE de chaque coque (celle du kit quand l'ère en a un).
          samples: (CM.layout && CM.layout.river && CM.layout.river.present && CM.layout.river.samples) || null,
          gates: CM.riverGates || [],
          obstacles: CM.riverObstacles || [],
          dodge: riverDodge,
          sizeOf: fleetHullSize,
          berths: CM.shipBerths || [],
          ferry: CM.ferrySite || null,
          // La navette des Plaisirs : ses arrêts, et la nuit (elle sort surtout le soir).
          shuttle: CM.shuttleSite || null,
          night: CM.nightF || 0,
          // Métier d'un bateau de service : celui de son MODÈLE (patrouille, drague, pompiers).
          serviceMode: fleetServiceMode,
          // Fenêtre de navigation : la carte (le ruban la déborde de 200 tuiles).
          bounds: CM.layout ? { x0: 0, y0: 0, x1: CM.layout.gridN || 0, y1: CM.layout.gridN || 0 } : null,
        };
      for (let s = 0; s < sim.steps; s += 1) updateRiverFleet(CM.ships, CM.fleetCtl, _fleetBudget, sim.dt, _fleetEnv);
      fp('flotte');
      // LA CARTE N'A PLUS QU'UN CHEMIN DE RENDU. drawIsoWorld peint la frame
      // entière, simulation des agents incluse (iso/isoRenderer.js). Le pipeline
      // top-down qui vivait ici — 145 lignes derrière un `else` — a été retiré le
      // 2026-08-23 (étape 4 de docs/PLAN-SUPPRESSION-LEGACY.md).
      //
      // ⚠ LE GARDE EST AVANT L'APPEL, PAS APRÈS. `drawIsoWorld` renvoie false
      // quand CM.layout est nul, et c'est le bloc legacy qui rattrapait ce cas :
      // il peignait encore un fond (son `cityMapDrawGround` prenait `layout?.`,
      // le `?.` prouvant que le cas était prévu). Sans lui, on sort de la frame
      // proprement. Le retour de drawIsoWorld n'est donc plus consommé.
      // Sortir ici est sûr : `frame` a ré-armé son rAF bien plus haut, comme le
      // font déjà les deux replis d'entrée de la fonction.
      if (!CM.layout) { fpEnd(); return; }
      drawIsoWorld(sim.dt, now, sim.steps);
      fpEnd();
    }
  }
  // Premiere mise en page immediate puis boucle.
  if (CM.cw === 0) resize();
  // Hook de diagnostic : force une frame (utile quand rAF est gele en arriere-plan).
  // Une frame forcée vaut une entrée (energySaver.js) : la pane cachée n'a pas le
  // focus, l'économie d'énergie y refusait toute frame à moins de 75 ms de la
  // précédente — les boucles de harnais (+33 ms par appel) en perdaient deux sur trois.
  CM.forceFrame = () => { if (!CM.ctx || !CM.canvas) return false; resize(); noteMapInput(performance.now()); frame(performance.now()); return true; };
  // Capture DÉTERMINISTE d'une frame (vérif visuelle) : court-circuite le throttle,
  // force le plein jour (pas de voile nuit qui fausse les pixels) et une santé fixe,
  // fige le temps d'animation. N'altère PAS le rendu normal (tout est gardé par le
  // flag CM.capture, nul en fonctionnement). Renvoie un dataURL (PNG par défaut).
  // `opts.live` (« Garder une image » de la contemplation, BUG-89) : la scène À
  // L'HEURE QU'IL EST — ni ciel dégagé forcé, ni ambiance pleine, ni brume coupée,
  // ni émeute mise de côté (cf. `detCapture` dans la frame). Seul le rendu est forcé.
  CM.captureFrame = (opts = {}) => {
    if (!CM.canvas) return null;
    const live = !!opts.live;
    const saved = { night: CM.nightF, health: CM.healthF, last };
    // Émeutes : riotWindow=false en capture (déterminisme) fait PURGER la sim
    // par updateCrisis — on lui donne un tableau jetable et on remet la vraie
    // foule (et ses compteurs d'apaisement) après le cliché, sinon capturer
    // pendant une émeute la dissiperait pour de bon. En capture live la fenêtre
    // reste ouverte : la vraie foule est sur le cliché, rien à mettre de côté.
    const savedRiot = live ? null : {
      rioters: CM.rioters, goal: CM.riotGoal, goalAt: CM.riotGoalAt,
      calmed: CM.riotCalmed, calmDecayT: CM.riotCalmDecayT, draw: CM.riotDraw,
    };
    if (!live) CM.rioters = [];
    // `citizens` est mémorisé sur CM.capture : vider les pools ne suffisait pas,
    // la frame les regarnissait aussitôt (l'ancien code reconstruisait la flotte
    // dès que son effectif ne collait plus). Le budget doit être coupé À LA
    // SOURCE pour qu'un cliché « sans vie » ait vraiment un fleuve vide.
    CM.capture = { night: opts.night ?? 0, health: opts.health ?? 1, citizens: opts.citizens, live };
    // Cliché « sans vie » : les pools sont vidés le temps de la frame, puis
    // RENDUS — véhicules et navires ne se reconstruisent qu'au recalcul du plan,
    // un cliché de vérif les laissait disparus jusqu'au prochain achat (DEV-5).
    const savedLife = opts.citizens === 'none'
      ? { citizens: CM.citizens.slice(), vehicles: CM.vehicles.slice(), ships: CM.ships.slice() }
      : null;
    if (savedLife) { CM.citizens.length = 0; CM.vehicles.length = 0; CM.ships.length = 0; }
    last = -1e9; // by-passe le throttle pour forcer un vrai rendu
    resize();
    frame(opts.now ?? 0);
    CM.capture = null;
    // Rendus EN PLACE (isoChute compare l'identité de CM.vehicles), sauf un pool
    // que la frame a déjà regarni : un recalcul du plan pendant le cliché fait foi.
    if (savedLife) {
      for (const k of ['citizens', 'vehicles', 'ships']) {
        if (CM[k].length === 0) for (const x of savedLife[k]) CM[k].push(x);
      }
    }
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
    if (savedRiot) {
      CM.rioters = savedRiot.rioters; CM.riotGoal = savedRiot.goal; CM.riotGoalAt = savedRiot.goalAt;
      CM.riotCalmed = savedRiot.calmed; CM.riotCalmDecayT = savedRiot.calmDecayT; CM.riotDraw = savedRiot.draw;
    }
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
    // ── SONDE DE PLATITUDE (lot 0 de docs/PLAN-RELIEF.md) ─────────────────────
    // « Tout est plat » est un grief d'ŒIL. Avant de peindre un seul pixel de
    // relief, on le chiffre — ce projet a déjà vu la mesure réfuter l'œil (5
    // constats sur 39 dans PLAN-RENDU-VILLE §7).
    //
    // ⚠ LE CHANTIER DU RELIEF EST CLOS (cf. l'en-tête de PLAN-RELIEF.md) ; cette sonde
    // SURVIT EXPRÈS. C'est elle qui a chiffré « la campagne est plate, la ville ne l'est
    // pas », le constat qui désigne la suite — la hiérarchie de masse de
    // PLAN-RENDU-VILLE. Elle mesurera ce chantier-là comme elle a mesuré celui-ci.
    //
    // ⚠⚠ CE QU'ON MESURE, ET POURQUOI CE N'EST PAS L'ÉVIDENT. Une forêt est
    // PLEINE de variance : les feuilles, les troncs, le bruit de tuile. Mesurer
    // l'écart-type des pixels DANS un bloc la déclarerait donc très contrastée,
    // alors qu'elle est précisément ce qu'on trouve plat. Le relief est une
    // modulation à GRANDE ÉCHELLE : c'est l'écart-type des MOYENNES DE BLOCS qui
    // le dit. On rend les deux — `grandeEchelle` est la mesure qui compte,
    // `dansLeBloc` est le témoin qui montre qu'elles ne disent pas la même chose.
    //
    // Zones classées par PROJECTION INVERSE du centre du bloc (screenToWorld),
    // jamais par la couleur : on veut savoir ce qu'il y a là, pas ce qu'on voit.
    window.__flatProbe = (opts = {}) => {
      const B = opts.block || 64;
      const c = CM.canvas, W = c.width, H = c.height;
      if (!CM.layout || !W || !H) return { err: 'pas de layout' };
      // Sol en tuiles (lot 4) : la capture cuit tout le visible dans la frame,
      // synchrone — la garde « sol cuit au zoom courant » n'a plus d'objet.
      const L = CM.layout, T = CM.TILE;
      // Densité d'arbres par cellule : une case boisée, c'est ≥1 arbre dessus.
      const arbres = new Set();
      for (const tr of L.trees || []) arbres.add(tr.gx + ',' + tr.gy);
      const d = c.getContext('2d').getImageData(0, 0, W, H).data;
      const zones = {};
      const ajoute = (z, moy, dansBloc) => {
        const s = zones[z] || (zones[z] = { n: 0, sMoy: 0, sMoy2: 0, sDans: 0 });
        s.n += 1; s.sMoy += moy; s.sMoy2 += moy * moy; s.sDans += dansBloc;
      };
      for (let by = 0; by + B <= H; by += B) {
        for (let bx = 0; bx + B <= W; bx += B) {
          let sum = 0, sum2 = 0, n = 0;
          for (let y = by; y < by + B; y += 2) {
            for (let x = bx; x < bx + B; x += 2) {
              const o = (y * W + x) * 4;
              // Luminance perceptuelle (Rec. 601) — l'œil juge la clarté, pas le vert.
              const l = 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2];
              sum += l; sum2 += l * l; n += 1;
            }
          }
          if (!n) continue;
          const moy = sum / n;
          const dansBloc = Math.sqrt(Math.max(0, sum2 / n - moy * moy));
          // ⚠ CLASSER PAR LE SEUL CENTRE DU BLOC EST TROP GROSSIER : au dézoom un
          // bloc de 64 px couvre des dizaines de cellules, et une FORÊT est diffuse
          // — le centre tombait rarement sur un arbre, si bien qu'AUCUN bloc n'était
          // jamais classé « forêt ». On échantillonne donc 5×5 points et on vote.
          const votes = {};
          for (let sy = 0; sy < 5; sy += 1) {
            for (let sx = 0; sx < 5; sx += 1) {
              const w = screenToWorld(bx + ((sx + 0.5) / 5) * B, by + ((sy + 0.5) / 5) * B);
              const gx = Math.floor(w.x / T), gy = Math.floor(w.y / T), k = gx + ',' + gy;
              let z = 'plateau';
              if (gx < 0 || gy < 0 || gx >= L.gridN || gy >= L.gridN) z = 'hors-carte';
              else if (L.river && L.river.isWater && L.river.isWater(gx, gy)) z = 'eau';
              else if (L.river && L.river.isBank && L.river.isBank(gx, gy)) z = 'lisiere-eau';
              // ⚠ L'ARBRE PASSE AVANT LA VILLE : `urbanSet` est le disque urbain
              // ENTIER (56 % de la carte), donc il avalait toute la forêt intérieure.
              // Ce qu'on veut savoir, c'est ce qu'on VOIT à cet endroit.
              else if (arbres.has(k)) z = 'foret';
              else if (L.urbanSet && L.urbanSet.has(k)) z = 'ville';
              votes[z] = (votes[z] || 0) + 1;
            }
          }
          let z = 'plateau', best = -1;
          for (const [k2, v] of Object.entries(votes)) if (v > best) { best = v; z = k2; }
          // ⚠ OPTION `pur` : ne garder que les blocs UNANIMES. Sans elle, les blocs
          // « ville » d'une petite ville contiennent aussi sa lisière avec la
          // campagne — et cette frontière est franche, donc elle gonfle le contraste
          // et ferait croire que la petite ville est plus modulée qu'elle n'est.
          // C'est le biais à écarter avant de comparer deux tailles de ville.
          if (opts.pur && best < 25) continue;
          ajoute(z, moy, dansBloc);
        }
      }
      const out = {};
      for (const [z, s] of Object.entries(zones)) {
        const moy = s.sMoy / s.n;
        out[z] = {
          blocs: s.n,
          grandeEchelle: +Math.sqrt(Math.max(0, s.sMoy2 / s.n - moy * moy)).toFixed(1),
          dansLeBloc: +(s.sDans / s.n).toFixed(1),
          clarteMoyenne: +moy.toFixed(1),
        };
      }
      return { bloc: B, zoom: +CM.cam.zoom.toFixed(3), zones: out };
    };
    window.__state = state;
    window.__D = D;
    // L'INSTANCE CM de la page (pas d'import !) : le double-graphe HMR fait
    // qu'un `import('/src/game/map/layout.js')` depuis la console/outils peut
    // renvoyer une COPIE fraîche sans layout/forceFrame — piloter via __CM.
    window.__CM = CM;
    window.__cityRecompute = () => { CM.layout = null; CM.centered = false; solInvalidate('all'); };
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
    // (Le BANC DU BATCHER WebGL `__glBench` et le batcher lui-même, glPainter.js,
    //  ont été retirés le 2026-10-06 avec la greffe GL du peintre, dont le gain
    //  mesuré en jeu était nul — ×1,02 — audit MORT-12.)
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
    // ⚠ `__pixelTerrain` et `__pixelRoads` pilotaient le terrain et les routes du
    // rendu top-down : retirés le 2026-08-23 avec `drawPixelTerrain` (étape 6).
    // `__sidewalk` / `__sidewalkTune` les ont suivis le même jour (Q1) : elles
    // ÉCRIVAIENT dans `pixelSidewalkFlag`/`sidewalkTune` que plus personne ne
    // LISAIT, et invalidaient `CM._groundBake` — le bake du top-down, disparu avec
    // lui. Deux molettes sans effet depuis l'étape 6, et rien ne le signalait.
    // Bord de quai = berge maçonnée : réglage live. __quayWall({ on, full, heightK, light })
    // fusionne les clés. full=true → tout le long de l'eau ; false → berges urbaines.
    // Les tuiles du quai portent ces réglages dans leur clé. Ex. __quayWall({ heightK: 1.4 }).
    window.__quayWall = (o) => { if (o) Object.assign(quayWallTune, o); return { ...quayWallTune }; };
    // Densité de foule : multiplie cible ET plafond d'habitants (défaut 1). Force un refresh
    // du plan pour l'appliquer tout de suite. Baisser si ça rame. Ex. __crowd(1.5) / __crowd(0.6).
    window.__crowd = (m) => { window.__citizenMul = (m == null ? 1 : +m); CM.layout = null; CM.centered = false; return { citizenMul: window.__citizenMul, target: CM.citizenTarget }; };
    // ⚠ `__pixelTileset`, `__pixelWater` et `__waterRipples` sont partis le
    // 2026-08-23 (étape 6) avec le terrain top-down et `pixelRiver.js`.
    // Bas-fond clair des rives (iso) : réglage live. __waterShore({ on, w1,w2,w3, a1,a2,a3, c1,c2,c3 }).
    window.__waterShore = (o) => { if (o) Object.assign(waterShoreTune, o); return { ...waterShoreTune }; };
    // ⚠ `__pixelBridge` a longtemps échappé aux balayages sous garde explicite —
    // « celle-ci RESTE (P5), elle pilote encore un chemin ISO ». C'était vrai tant
    // que `__isoBridge3d(false)` rebranchait un tablier plat. Q2 tranchée le
    // 2026-08-23 (option B) : le pont 3D a gagné, l'A/B et son repli sont partis, et
    // `pixelBridgeFlag` n'avait plus qu'une écriture pour zéro lecture. Le callback
    // `setBridgeOnLoad` était déjà mort : plus personne ne l'importait.
    // Vérif états de déclin du fleuve : force le drapeau d'effondrement (l'usure se
    // force via window.__state.timeWear = 0.8). Remettre __collapse(false) après.
    window.__collapse = (on) => { setCollapseInProgress(!!on); solInvalidate('all'); };
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
        // Centrage autoritaire (A9, comme cityMapCenterCamera) : sans resynchroniser
        // les cibles amorties, cmCameraGlide ramenait aussitôt le zoom à l'ancienne
        // cible (DEV-5).
        CM.zoomGoal = CM.cam.zoom; CM.camGoal = null; CM.panVel = null;
        CM.centered = true;
      };
      center();
      return w.name.fr + " — rang " + WONDER_TIER_NAMES[t] + "  (rangs 1..5 ; __hideWonder() pour arrêter)";
    };
    window.__hideWonder = () => { CM.previewWonder = null; CM.centered = false; CM.layout = null; return "aperçu arrêté"; };
    // (`window.__CM`, l'accès direct au runtime pour la vérif visuelle, est posé plus
    //  haut dans ce même bloc : une seule assignation.)
    // Banc du lot 1 de PLAN-SOL-PYRAMIDE : sol en tuiles vs sol plein, couture mesurée.
    window.__solPyramideAB = (o) => solPyramideAB(o);
  }
  CM.raf = requestAnimationFrame(loop);
}


setResetCameraCenterHandler(() => { CM.centered = false; });

// HMR : la boucle rAF et ses closures capturent les fonctions de rendu à l'init —
// un hot-update laissait tourner l'ANCIEN code en silence. Le full-reload des
// modules carte est forcé CÔTÉ SERVEUR par mapFullReloadPlugin (vite.config.js) ;
// import.meta.hot.decline() serait un no-op dans Vite moderne.

export { CM, initCityMap };
