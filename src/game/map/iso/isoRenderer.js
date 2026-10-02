"use strict";
// LE RENDU DE LA CARTE — et il ne reste ici que de la COORDINATION.
//
// Trois fonctions, dans cet ordre : la PASSE VIVANTE (`drawIsoLive` — collecter,
// trier au peintre, dessiner), le POINT D'ENTRÉE (`drawIsoWorld`, qui quantifie la
// caméra au pixel device avant tout le reste), et le CORPS DE FRAME
// (`drawIsoWorldInner`, qui appelle les modules dans l'ordre PICTURAL : le sol, puis
// le fleuve et ses ouvrages, puis ce qui est debout, puis la nuit et le ciel).
// `cityMapRuntime.js` est le seul consommateur, et il n'en prend qu'un nom.
//
// Tout le reste vit dans `iso/*.js` — 35 modules sortis d'ici au fil de Q10
// (`docs/PLAN-SUPPRESSION-LEGACY.md` §6 : 11 039 → 359 lignes). L'histoire de chaque
// extraction — pourquoi cette borne, ce qu'elle a coûté, ce qu'elle a appris — vit
// dans le plan et les trois `CARTO-*.md`. Cet en-tête l'a longtemps portée, jusqu'à
// peser un tiers du fichier en récit de déménagements ; il ne la porte plus. Ce
// fichier doit se lire pour ce qu'il FAIT, pas pour ce qu'il a cessé de faire.
//
// ⚠⚠ INVARIANT : AUCUN module `iso/` n'importe ce fichier, et ça doit le rester. Un
// cycle ESM tombe en TDZ sur un `const`, et c'est ce qui a coûté une sauvegarde en
// juillet. Ce qui doit être partagé DESCEND dans une feuille (`isoMath`, `isoQuad`,
// `isoArt`, `isoPalette`) ; rien ne remonte ici.
import { endReflectionBuild } from './isoReflect.js';
import { updateCitizens, updateVehicles, drawCitizenThoughts } from '../agents.js';
import { fp } from '../framePerf.js';
import { CM } from '../layout.js';
import { updateCrisis } from '../quaysAndRiot.js';
import { drawIsoAmbient, SMOKE_TUNE, smokeSeason } from './isoAmbient.js';
import { drawIsoBridgeUnder, drawIsoBridgeNight } from './isoBridge.js';
import { drawIsoShipNight } from './isoFleet.js';
import { paintGroundPyramid } from './solPyramideFrame.js';
// ⚠ L'état de SAISON vit là-bas, AVEC SON ÉCRIVAIN : ici on ne fait que le rafraîchir.
// C'est `refreshSeasonPalette()` qui le réécrit, chez elle, une fois par frame ; le
// fond d'herbe (isoWildBackdrop) lit SEASON_WILD pour son repli en aplat.
import { refreshSeasonPalette } from './isoGroundDetail.js';
import { paintWildBackdrop } from './isoWildBackdrop.js';
import { collectIsoItems } from './isoLiveCollect.js';
import { drawIsoHoverCell, paintIsoItems } from './isoLivePaint.js';
import { drawPlaisirsSky } from './isoPlaisirs.js';
import { drawIsoShips } from './isoPort.js';
import { drawIsoRiver } from './isoRiver.js';
import { drawIsoRiverLife } from './isoRiverLife.js';
import { drawVieAir, vieResetStats } from './isoVie.js';
import './isoVieOiseaux.js';   // s'enregistre auprès d'isoVie (pigeons, mouettes)
import './isoVieTerre.js';     // … (chiens, chats, papillons, linge)
import './isoVieDrapeaux.js';  // … (drapeaux des bâtiments publics et des quais)
import './isoQuayWalk.js';     // … (promeneurs des quais)
import { drawVieClouds } from './isoVieNuages.js';
import { paintQuays } from './isoQuay.js';
import { drawIsoDrones } from './isoSky.js';
import { paintPierUnder } from './isoPier.js';
import { drawIsoNight } from './isoStreet.js';
import { drawIsoRain } from './isoWeather.js';
import { drawTerrainShade } from './isoTerrain.js';
import {
  worldToScreen, visibleCellBounds, visibleDiamondBounds, ISO_X, ISO_Y,
} from './projection.js';

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
// Le renderer JALONNE la frame (fp) mais n'en est pas propriétaire : le relevé
// est ouvert et clos par cityMapRuntime.frame(), qui englobe aussi le préambule.
// Cf. framePerf.js pour le pourquoi.
export function drawIsoWorld(dt, now) {
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
    return drawIsoWorldInner(dt, now);
  } finally {
    CM.cam.x = camRX; CM.cam.y = camRY;
  }
}

function drawIsoWorldInner(dt, now) {
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
  // Fond hors du plan : la VRAIE herbe en motif (isoWildBackdrop), puis le sol
  // cuit par-dessus. L'aplat d'avant faisait lire le bord du rectangle cuit
  // comme « l'herbe qui ne charge pas » (Raph, 2026-09-29).
  const ctx = CM.ctx;
  paintWildBackdrop(ctx, performance.now());
  // Le sol en tuiles (PLAN-SOL-PYRAMIDE, défaut depuis le lot 4).
  paintGroundPyramid(ctx, L, performance.now());
  fp('sol');
  // Fleuve LIVE (animé) par-dessus le sol baké → QUAIS par ère (promenade le
  // long du ruban, iso/isoQuay.js) → SOUS-STRUCTURE des ponts (ombre sur l'eau + piles) → bateaux
  // SUR l'eau (devant les piles quand ils sont au sud, sous le tablier sinon)
  // → tabliers de pont → scène vivante → drones (passe aérienne) → nuit.
  // Terre-plein : le gazon du bake porte le SOL ; le RELIEF vient de buissons
  // DEBOUT plantés dans la passe vivante (drawIsoLive) — la projection à plat
  // de l'art legacy « couchait » les plantes bakées (retour Raph).
  vieResetStats();       // compteurs de la petite vie : une frame à la fois
  drawIsoRiver(now);
  // Vie de SURFACE (iso/isoRiverLife.js) : ronds de pluie, feuilles à la dérive,
  // bouées et nasses, saut de poisson. Ici et pas plus tard : sur l'eau, sous
  // les coques — la pluie crible le fleuve, pas les bateaux.
  drawIsoRiverLife(now);
  fp('fleuve');
  // QUAIS (iso/isoQuay.js, 2026-10-01) : cuits une fois en tuiles ancrées au monde,
  // au pixel, recopiés seulement là où il y a du quai ; le liseré néon (ères 6+)
  // reste en direct. Les réverbères sont de vrais mâts (isoStreet.isoLamps).
  paintQuays(ctx);
  // Ombre et reflet du ponton du port (iso/isoPier.js) : sur l'eau et la plage, sous
  // les bateaux. Le ponton lui-même passe au tri du peintre, avec la maison du port.
  paintPierUnder(ctx, now);
  fp('quais');
  drawIsoBridgeUnder(now);
  fp('ponts-dessous');
  drawIsoShips(now);
  fp('bateaux');
  drawIsoLive(now);      // (les merveilles y sont des items du tri peintre)
  endReflectionBuild();  // plus rien ne se reflète après la scène (cf. isoReflect)
  drawTerrainShade();    // ombrage du relief — par-dessus la scène : le flanc prend aussi le bâti
  fp('scene-vivante');
  drawVieClouds(now);    // ombres de nuages : sur le sol ET le bâti, sous ce qui vole
  drawVieAir(now);       // petite vie qui VOLE (héron qui change de poste…), iso/isoVie.js
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
