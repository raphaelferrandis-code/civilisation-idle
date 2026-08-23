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
import { CM} from '../layout.js';
import { fp } from '../framePerf.js';
import { state } from '../../core/state.js';
import { worldToScreen, visibleCellBounds, visibleDiamondBounds,  ISO_X, ISO_Y } from './projection.js';
// Repointé sur la SOURCE le 2026-08-23 (étape 6) : `buildingShapes.js` ne faisait
// que ré-exporter ce symbole depuis engineSprites, et il est supprimé. Précédent
// identique : engineSceneCache.js importe déjà d'engineSprites directement.

// (engineStage n'était importé QUE pour choisir le stade de l'aqueduc-conduite,
//  retiré le 2026-08-05. Les points d'eau ont leur propre échelle d'ère, alignée
//  sur celle des places — cf. waterPointEra.)
// Outil de calibrage des feux de position : n'expose que window.__navCalib et
// ne fait rien tant qu'on ne l'appelle pas (aucun coût en jeu). Il ne nous
// importe RIEN en retour (cycle ES = zone morte) : on lui pousse sa config.
// Vie de surface de l'eau. Même contrat que navCalib : il ne nous importe rien
// en retour (cycle ES = zone morte), on lui pousse ce dont il a besoin.
import { drawIsoRiverLife } from './isoRiverLife.js';
import { cityMapDrawQuays, updateCrisis, quayWallTune } from '../quaysAndRiot.js';
import { drawIsoBridgeUnder, drawIsoBridgeNight,    drawIsoBridges } from './isoBridge.js';
// LA FLOTTE, CÔTÉ RENDU — extraite d'ici le 2026-08-23 (Q10) : pose de coque,
// stade de commerce, feux de navigation, passe de nuit, évitement d'obstacles.
// Sa couture avait ZÉRO dépendance retour vers ce fichier, d'où l'extraction.
import { drawIsoShipNight } from './isoFleet.js';
// Passe AÉRIENNE (oiseaux, drones) et outils numériques partagés — extraits le
// 2026-08-23. `_frac`/`_rnd` vivent à part pour qu'aucun module extrait n'ait à
// importer depuis isoRenderer (cycle → TDZ).
import { drawIsoBirds, drawIsoDrones } from './isoSky.js';
// Socle partagé, extrait le 2026-08-23 : les chemins du repère monde et le cache
// d'art. Deux feuilles du graphe — elles débloquent le pont, le champ et le port.
// Le tissu urbain (bâti / cour / friche), extrait le 2026-08-23. C'est un MODÈLE :
// tissuMetrics le lit aussi, et n'a plus à traverser le peintre pour ça.
// Les clôtures et leur bande de panneaux, extraites le 2026-08-23.
// La voirie (tons, largeurs, tuiles, voile d'ère, trottoir), extraite le 2026-08-23.
// Que de la config : une feuille du graphe, que tout le monde peut lire.
// La rue : lampadaires, mobilier, terre-pleins, et la nuit qui les allume.
// Extraite le 2026-08-23. Pendant d'isoRoad — là-bas la chaussée, ici ses bords.
import { drawIsoNight } from './isoStreet.js';
// Les matières du sol (herbe, lisière, frange, sol urbain, front de rue), extraites
// le 2026-08-23. ⚠ L'état de SAISON vit là-bas avec son écrivain : ici on ne fait
// que le LIRE — une liaison ESM est vivante, la valeur suit.
import { SEASON_WILD, refreshSeasonPalette } from './isoGroundDetail.js';
// L'ambiance (particules, fumée, chevron) et le champ, extraits le 2026-08-23.
import { drawIsoAmbient, SMOKE_TUNE, smokeSeason} from './isoAmbient.js';
// LA CUISSON DU SOL ET SON CACHE, sortis le 2026-08-23 — la dernière coupe de Q10, et
// la seule dont la couture n'avait AUCUN import retour. Le module a emporté d'un bloc
// les trois morceaux qui vivaient ici sans se voir : l'ordre des passes du bake
// (`drawIsoGround`), la machinerie de cache (apaisement, tranches, défilement au pan,
// crans de zoom, pré-cuisson), et la décision qui les orchestre — 396 lignes au milieu
// de `drawIsoWorldInner`. On ne voit plus d'ici aucun des seize noms qu'ils partageaient.
// ⚠ Cet import fait AUSSI vivre `globalThis.__groundZoomCacheStats`, publié au niveau
// module là-bas : c'est un effet de bord de chargement (cf. P32 du plan).
import { paintIsoGroundCached } from './isoGroundBake.js';
// La COLLECTE du peintre, sortie de drawIsoLive le 2026-08-23 : elle dresse la liste
// de ce qui se dessine, sans rien dessiner. Le POOL d'items part avec elle — c'est
// son état privé. Le TRI, lui, reste ici : c'est lui qui donne son sens à la liste.
import { collectIsoItems } from './isoLiveCollect.js';
// Le DESSIN du peintre, sorti le 2026-08-23. Ses trois phases (préparation, boucle,
// composition) sont parties ENSEMBLE : elles se partagent l'état des lots GPU, qui est
// réassigné — il devait voyager avec ses écritures.
// Le SURVOL AU SOL l'a rejoint le même jour, par CONSOLIDATION plutôt que par création
// d'un module de 38 lignes : ce fichier portait déjà l'autre moitié du survol (l'or et
// le liseré des silhouettes), et il n'a eu besoin d'aucun import nouveau pour l'accueillir.
import { drawIsoHoverCell, paintIsoItems } from './isoLivePaint.js';
// Objets posés au sol (points d'eau, art au sol, décor d'île), extraits le 2026-08-23.
// Le port fluvial (flotte legacy sur le ruban, quai, ponton), extrait le 2026-08-23.
import { drawIsoShips} from './isoPort.js';
// Palette plate du sol, extraite le 2026-08-23. Feuille du graphe : elle n'importe
// rien, donc tout peut la lire. ⚠ L'état de SAISON est resté ici (plus bas) — il est
// réassigné chaque frame, et une liaison importée est en lecture seule.
import { rgb} from './isoPalette.js';
// La météo qui tombe (pluie, éclats, neige), extraite le 2026-08-23. Elle emporte
// les teintes de flocon, qui traînaient dans la section « liseré d'herbe ».
import { drawIsoRain } from './isoWeather.js';
// Le fleuve, extrait le 2026-08-23 : le ruban d'eau vivant et tout ce qui bat sa
// berge. Trois symboles suffisent au peintre — il peint, et il sait découper sur
// l'eau.
import { drawIsoRiver } from './isoRiver.js';
// Les unités mobiles (véhicules, émeutiers, objets portés) et leur profondeur au
// tri, extraites le 2026-08-23.
// Scènes moteur et liserés de sprite, extraits le 2026-08-23.
// AURA DE LA MAISON DES PLAISIRS. Module à part (le renderer pèse déjà 11 000
// lignes) et sans import retour : il ne connaît que CM, la projection et les
// deux couches de lumière — donc aucun cycle ES avec nous.
import {  drawPlaisirsSky} from './isoPlaisirs.js';
import {
  updateCitizens, updateVehicles, drawCitizenThoughts,
  // le lot bateaux est parti avec isoPort.js, les drones avec isoSky.js
                            // le reste du lot est parti avec isoUnits.js
} from '../agents.js';
// PLACE COMPOSÉE : tout le modèle (rôles des cellules, recettes par ère, tailles
// en tuiles, molette __plaza) vit dans isoPlaza.js. Ici on ne fait que pousser
// ses items dans le tri peintre. Cf. docs/PLACES-ISO-COMPOSEES.md.
import {
  // personHT : les POINTS D'EAU se cotent au même étalon que le mobilier de
  // place — la hauteur d'un habitant. Cf. § POINTS D'EAU.
  // La FONTAINE de la scène de place est rentrée ici le 2026-08-23 : elle décrivait
  // déjà une scène de ce module.
} from './isoPlaza.js';
// MOBILIER DE TROTTOIR : la POSE vit là-bas (corps pur, testable), le dessin
// reste celui du kit des places. Cf. § MOBILIER DE TROTTOIR plus bas.

// PALETTE DE SAISON, résolue une fois par frame depuis CM.season. Ces variables
// remplacent GRASS / GRASS_WILD / GD_TIP partout où le SOL est peint : le sol
// étant baké, elles ne sont relues qu'à la recuisson, et la saison figure dans
// la clé du bake. Les constantes ci-dessus restent la référence d'été.
// (Une MATIÈRE DE TROTTOIR a vécu ici — table de tons par bande et résolution
//  de tuile dédiée, avec son art `walk-stone` / `walk-granite`. Retirée le
//  2026-08-05 en même temps que la bande : le sol de ville EST le trottoir, il
//  n'a donc pas de matière propre. Cf. le § LA MARCHE, ET RIEN QUE LA MARCHE,
//  dans la passe route.)





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
  const items = collectIsoItems({ T, L, b, band, dvVis, z, smokeK, eraIdx }, now);
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
  paintIsoItems({ ctx, T, z, hw, hh, L, houseBoxes, band, eraIdx, smokeK }, items, now);
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
  paintIsoGroundCached(ctx, L, helpers);
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
