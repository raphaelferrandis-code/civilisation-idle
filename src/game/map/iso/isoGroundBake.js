"use strict";
// LA CUISSON DU SOL, ET SURTOUT SON CACHE — quand recuire, et comment ne pas recuire.
//
// Sortie d'isoRenderer le 2026-08-23 (Q10, derniere coupe du lot). Le module tient
// TROIS choses qui vivaient a trois endroits du fichier, sans se voir : le bandeau du
// sol et `drawIsoGround` (l'ordre des passes), la machinerie de cache (seuils
// d'apaisement, cuisson en tranches, defilement au pan, cache par cran de zoom,
// pre-cuisson en fond, signature de contenu), et la DECISION qui les orchestre, qui
// etait un bloc de 396 lignes au milieu de `drawIsoWorldInner`.
//
// ⚠ POURQUOI D'UN SEUL BLOC. La decision appelle `drawIsoGround` : la sortir seule
// aurait fait un cycle. Et elle est elle-meme indivisible — 10 noms declares dans sa
// premiere moitie sont relus par la seconde. Le cache de crans ne SUIT pas la
// decision de recuisson, il en fait partie. En emmenant tout, la contrainte
// disparait au lieu d'etre contournee : sur les 20 declarations de ce module,
// SEIZE ne servaient deja qu'ici. La couture avait ZERO import retour vers
// isoRenderer — la seule du chantier — pour une surface publique d'UNE fonction.
//
// ⚠ CE MODULE NE SAIT PAS QUELLE HEURE IL EST DANS LE JEU. `dt` et `now`, les deux
// parametres de la frame, ne sont lus nulle part ici : tout passe par
// `performance.now()`. C'est voulu — les delais (110 ms d'apaisement, 400 ms de
// repos, les budgets de 45 et 70 ms) sont des delais de RESSENTI, pas de simulation.
// Une pause du jeu ne doit pas geler la recuisson du sol.
//
// ⚠ Le corps est repris SANS UNE LIGNE DE CHANGEE : les trois seules lectures vers
// la fonction englobante (`ctx`, `L`, `helpers`) sont devenues des PARAMETRES DE
// MEME NOM, et l'indentation du bloc `if` est conservee telle quelle. La preuve par
// identite des octets tient donc sur les 763 lignes.
//
// ⚠ `globalThis.__groundZoomCacheStats` est publie par un effet de bord AU NIVEAU
// MODULE (cf. P32 du plan) : il ne s'executera que parce qu'isoRenderer importe ce
// fichier pour appeler la coupe. La molette doit toujours repondre apres coup.
import { CM } from '../layout.js';
import { ensureQuayGate } from '../quaysAndRiot.js';
import { DIRT_TONE } from './isoTissu.js';
import { sweepIsoGroundCells } from './isoGroundCells.js';
import { SEASON_GRASS, drawGrassDetailAll, drawGrassFringeAll } from './isoGroundDetail.js';
import { makeGroundBake } from './isoGroundResolve.js';
import { drawIsoGroundRoads } from './isoGroundRoads.js';
import { BEACH } from './isoGroundTiles.js';
import { terrainKey, terrainMaxPx } from './isoTerrain.js';
import { rgb } from './isoPalette.js';
import { drawIsoMedians } from './isoStreet.js';
import { drawWonderGroundAll } from './isoWonderGround.js';
import { ISO_X, ISO_Y, panDeltaToScreen, screenDeltaToPan, snapZoom } from './projection.js';

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
  // Le MONTAGE vit dans isoGroundResolve.js depuis le 2026-08-23 : il résout, il ne
  // peint pas. Ce qui reste ici est l'ORDRE des passes, et rien d'autre.
  const { bake, resolve, out } = makeGroundBake(ISO_GROUND_LOD);
  const { ctx, T, z, hw, hh, LOD, HARD, b, L, band, mat, urb, road, roadMap, riverCells, plazaEra, wg, PR } = bake;
  const { kindAt, grassAt, keyOfKind } = resolve;
  const { fringes, roads, wonderCells, grassCells, veilPush, flushVeils } = out;
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
  // + terrainMax en Y : la contremarche d'une cellule haute pend d'autant sous
  // son losange — culler au coin nord la couperait au bord haut de l'écran.
  // A/B : globalThis.__isoCellCull = false rejoue le balayage complet.
  const cullPadX = hw * 2, cullPadY = hh * 4 + terrainMaxPx() * z;
  const cullOn = globalThis.__isoCellCull !== false;
  // Contremarches du relief (quads écran, 8 nombres chacun) : terre claire/sombre
  // + pierre d'ère claire/sombre — la tranche prend la matière de sa cellule.
  const faceL = [], faceD = [], faceLU = [], faceDU = [];
  sweepIsoGroundCells(
    { ctx, T, hw, hh, LOD, HARD, b, cullOn, cullPadX, cullPadY, ISO_GROUND_SLICE,
      L, roadMap, riverCells, urb, mat, plazaEra, wg, PR },
    { kindAt, grassAt, keyOfKind },
    { fringes, roads, wonderCells, grassCells, veilPush, faceL, faceD, faceLU, faceDU },
  );
  if (PR) PR.cells = performance.now() - tLoop;
  // CONTREMARCHES DU RELIEF : remisées par le balayage, peintes en DEUX fills
  // d'union (claire = face +y vers la lumière haut-gauche, sombre = face +x).
  // L'ordre est libre — une face ne recouvre jamais un losange, le voisin plus
  // bas commence exactement où elle finit — mais AVANT tout ce qui se pose sur
  // le sol (parvis, franges, rubans) : la route rampe PAR-DESSUS sa marche.
  if (faceL.length || faceD.length || faceLU.length || faceDU.length) {
    const tF = PR && performance.now();
    const flushFaces = (arr, col) => {
      if (!arr.length) return;
      ctx.fillStyle = col;
      ctx.beginPath();
      for (let i = 0; i < arr.length; i += 8) {
        ctx.moveTo(arr[i], arr[i + 1]); ctx.lineTo(arr[i + 2], arr[i + 3]);
        ctx.lineTo(arr[i + 4], arr[i + 5]); ctx.lineTo(arr[i + 6], arr[i + 7]);
        ctx.closePath();
      }
      ctx.fill();
    };
    flushFaces(faceD, rgb(DIRT_TONE, 0.58));
    flushFaces(faceL, rgb(DIRT_TONE, 0.82));
    flushFaces(faceDU, rgb(urb, 0.60));    // pierre d'ère : mur de soutènement
    flushFaces(faceLU, rgb(urb, 0.84));
    if (PR) PR.faces = performance.now() - tF;
  }
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
  drawIsoGroundRoads(
    { ctx, T, z, hw, LOD, HARD, L, band, road, roadMap, urb, PR, ISO_GROUND_SLICE },
    { kindAt },
    roads,
  );
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
// `farRestores` : restores servis AU-DELÀ du ½ cran (plafond levé en glide,
// lot 1 anti-clignotement) ; `filet` : frames de geste où la photo la plus
// basse du cache a bouché le pourtour du blit compensé (même lot).
const gzcStats = { restores: 0, snapshots: 0, missBase: 0, purges: 0, prebakes: 0, farRestores: 0, filet: 0 };
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

// Le filet du geste (cf. la branche « ZOOM en cours ») n'a rien à servir tant
// que le cache n'a pas de photo AU PLANCHER pour la base courante — c'est
// l'état des premières secondes d'une session, mesuré : un dézoom immédiat y
// retrouvait le cadre de fond nu (.preview-shots/filet-v3-c2f0.png). C'est le
// SEUL cas où la pré-cuisson passe devant l'hystérésis de contenu (lot 2) —
// et comme le plancher est la cible n° 1 du picker, « manquant ⟹ c'est lui
// qu'on cuit ». Grâce au court-circuit de l'appelant, la boucle ne tourne
// qu'en fenêtre d'hystérésis (≤ 8 entrées, une fois par frame de repos).
// Le plancher EFFECTIF de la caméra — la cible n° 1 de la pré-cuisson. Le
// clamp géométrique (CM.zoomFloor, publié par cmClampCamera) descend très bas
// sur une grande carte (mesuré : 0,125) mais AUCUNE entrée n'y va : wheel,
// pinch et clavier partagent le garde-fou 0,35, rabattu au cran de la grille
// par snapZoom — c'est LÀ que le dézoom max atterrit. Viser le clamp seul
// faisait cuire une photo 4× trop chère ((0,25/0,125)² = 4, posée à ~7 s au
// lieu de ~3) que personne ne pouvait atteindre exactement.
function gzcFloorZ() {
  return Math.min(CM.cam.zoom, Math.max(CM.zoomFloor || 0.35, snapZoom(0.35, -1)));
}
function gzcFloorMissing(base) {
  const zf = gzcFloorZ() * 1.06;
  const gc = CM._groundZoomCache;
  if (gc) for (const e of gc.values()) { if (e.base === base && e.z <= zf) return false; }
  return true;
}
// « L'écran est servi par un COMPENSÉ (photo ou plein d'une autre échelle) et
// le cran courant n'a pas sa photo » — le second cas qui lève l'hystérésis de
// la pré-cuisson (lot 5) : c'est l'atterrissage « carte web », il ATTEND sa
// photo. Un light/hard en place n'en fait pas partie (sa montée en tranches
// s'en charge), un soft non plus (il recuit par son propre chemin).
function gzcScreenMissing(base, key) {
  const b = CM._isoGroundBake;
  if (!b || b.soft || b.zoomB == null || b.other === key) return false;
  const o = String(b.other || '');
  if (o.endsWith(':lod') || o.endsWith(':lodl')) return false;
  const gc = CM._groundZoomCache, QT = Math.log(1.12) / 4;
  if (gc) for (const e of gc.values()) { if (e.base === base && Math.abs(Math.log(e.z / CM.cam.zoom)) < QT) return false; }
  return true;
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

// Le point d'entree, et le seul : `drawIsoWorldInner` ne voit plus aucun des noms
// ci-dessus. `helpers` = { bakeMargin, blitMargin }, les caches offscreen du runtime.
export function paintIsoGroundCached(ctx, L, helpers) {
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
      // LE TERRAIN EST DANS LE SOL BAKÉ : niveaux de cellules ET contremarches
      // dépendent du champ → tout réglage doit recuire (vide à l'arrêt).
      + terrainKey()
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
    const nowMs = performance.now();
    // ACCALMIE SUR LE MOUVEMENT RÉEL de la caméra — surtout PAS sur la clé : un
    // DRAG ne change pas la clé (zoom et layout fixes), donc une accalmie « clé
    // stable » se croyait au repos en plein geste et recuisait en boucle (retour
    // Raph : « ça rame au drag »).
    if (CM.cam.x !== CM._igX || CM.cam.y !== CM._igY || CM.cam.zoom !== CM._igZ) {
      CM._igX = CM.cam.x; CM._igY = CM.cam.y; CM._igZ = CM.cam.zoom; CM._igMoveAt = nowMs;
    }
    // Horloge du dernier changement d'ÉCHELLE, séparée du mouvement général :
    // c'est elle qui borne la rafale de molette — un drag qui suit un zoom ne
    // doit pas la prolonger, sinon le sol resterait compensé pendant tout le
    // déplacement. (_igZ ne peut pas servir : le bloc ci-dessus l'écrase dès
    // que x ou y bougent seuls.)
    if (CM.cam.zoom !== CM._igZoomPrev) { CM._igZoomPrev = CM.cam.zoom; CM._igZoomAt = nowMs; }
    const stillMs = nowMs - (CM._igMoveAt || 0);
    const settled = CM.capture || stillMs > ISO_SETTLE_MS;
    // `restful` = accalmie LONGUE (cf. ISO_CRISP_SETTLE_MS) : elle seule autorise
    // le sol plein. `settled` ne donne plus que le sol allégé.
    const restful = CM.capture || stillMs > ISO_CRISP_SETTLE_MS;
    // `zoomBurst` = la RAFALE de molette est en cours : le dernier changement
    // d'échelle date de moins d'une accalmie longue. Déclarée AVANT la
    // restauration — c'est elle qui y règle la stabilité de la source (lot 4).
    const zoomBurst = nowMs - (CM._igZoomAt || 0) < ISO_CRISP_SETTLE_MS;
    // ── CACHE DE CRANS : RESTAURATION, EXACTE OU APPROCHÉE ────────────────────
    // EXACTE (même clé, zoom compris) : on repose la photo dans le canvas de
    // travail et la cascade n'y voit qu'un bake valide (sameContent) — blit
    // direct, zéro recuisson. C'est l'atterrissage instantané d'un zoom déjà
    // visité.
    // APPROCHÉE : pendant le GESTE, le zoom GLISSE (cmCameraGlide) par des
    // valeurs intermédiaires qu'aucune clé exacte ne re-matchera jamais — la
    // première version du cache n'avait donc AUCUN hit en geste (mesuré :
    // 1 restore sur tout un aller-retour). On sert alors le cran caché le plus
    // PROCHE en échelle comme SOURCE du re-blit compensé : il reste un blit
    // compensé (other garde le marqueur, la cascade compense zoom/zoomB), mais
    // depuis une image du bon voisinage au lieu du bake de départ du geste —
    // quasi net au lieu de flou croissant.
    // PENDANT LA RAFALE (zoomBurst), AUCUN plafond de distance (lot 1
    // anti-clignotement) : un sol étiré de deux crans reste un sol, alors que
    // l'alternative était le fond hors-monde nu — le « cadre sombre » du dézoom
    // (.preview-shots/flicker-c2f0.png). HORS RAFALE, le ½ cran (±5,8 %) reste
    // exigé : la cascade recuit dans la même frame, une photo lointaine serait
    // une copie ~9 Mo pour rien — et au drag, le light exact en place vaut
    // mieux qu'un plein étiré. Un bake courant déjà plus proche (ou aussi
    // proche) est gardé.
    // ET LA SOURCE EST STABLE (lot 4, retour Raph « scintillement au zoom ») :
    // pendant la rafale, changer de source ne se fait que pour un gain d'UN
    // CRAN ENTIER. La règle d'avant (« strictement plus proche », et l'exact
    // prioritaire) faisait sauter la netteté à chaque mi-chemin entre deux
    // photos et à chaque pose de cran photographié — net→flou→net au rythme de
    // la molette, ~10 sauts par seconde. Une carte web garde le niveau étiré
    // pendant tout le pincement ; ici pareil : au plus un changement de source
    // par cran entier d'écart, et le net revient à l'arrêt (l'atterrissage).
    // Les suffixes ':lod' (allégé HARD) et ':lodl' (allégé LIGHT, textures et
    // voiles gardés) marquent un bake posé pendant un geste : même contenu de
    // base, détails en moins → à remplacer par un bake plein au repos. Déclaré
    // ICI, avant la restauration : elle aussi doit savoir reconnaître « un
    // allégé de la clé courante » (cf. curKeyLod).
    const baseOf = (k) => (k && k.endsWith(':lodl') ? k.slice(0, -5)
      : k && k.endsWith(':lod') ? k.slice(0, -4) : k);
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
          // ½ cran et cran entier de molette (cf. CAM_FEEL.wheelStep = 1,12).
          const HALF_STEP = Math.log(1.12) / 2;
          const FULL_STEP = Math.log(1.12);
          // Une photo est « exacte » au grain de la clé vivante (zoom à 3
          // décimales) : sous ±0,05 % l'écart d'échelle est sous le pixel.
          const exact = !!best && Math.abs(best.z - CM.cam.zoom) < CM.cam.zoom * 5e-4;
          // Distance d'échelle du bake courant — un lod/soft ne compte pas
          // (une photo PLEINE, même approchée, vaut mieux qu'un allégé exact).
          const curLod = !!cur && (!!cur.soft || !cur.other || cur.other.endsWith(':lod') || cur.other.endsWith(':lodl'));
          // ⚠ SAUF un allégé DE LA CLÉ COURANTE, hors glide : c'est la MONTÉE
          // vers le plein en cours (l'atterrissage l'a posé, les tranches
          // l'écrasent). Le compter « infiniment loin » rejouait le duel à
          // CHAQUE frame de repos : la photo approchée s'installait par-dessus
          // l'allégé, la cascade recuisait l'allégé par-dessus la photo —
          // 70-100 ms de recuisson par frame, en boucle, et les tranches ne
          // s'amorçaient jamais (vu au banc : HARD éternel à 74 ms/frame). À sa
          // vraie distance (0), l'approché ne gagne plus ; l'EXACT passe
          // toujours (`exact ||` ci-dessous) et TERMINE la montée d'un coup.
          const curKeyLod = !!cur && !cur.soft && curLod && !zoomBurst && baseOf(cur.other) === key;
          const curD = (cur && cur.zoomB != null && (!curLod || curKeyLod))
            ? Math.abs(Math.log(cur.zoomB / CM.cam.zoom)) : Infinity;
          // Déjà installé ? (exact : la clé vivante ; approché : le marqueur et
          // SON échelle) — sinon on recopierait la photo à chaque frame.
          const installed = !!cur && (exact
            ? cur.other === key
            : (cur.other === '__zoomcache__' && best && Math.abs((cur.zoomB || 0) - best.z) < 1e-9));
          // En rafale : victoire au CRAN ENTIER seulement (source stable, cf. le
          // bandeau) — l'exact n'y est plus prioritaire, il redevient roi à
          // l'arrêt. Hors rafale : la règle historique.
          const wins = zoomBurst ? bestD < curD - FULL_STEP : (exact || bestD < curD - 1e-9);
          if (best && (bestD <= HALF_STEP || zoomBurst) && !installed && wins) {
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
            if (bestD > HALF_STEP) gzcStats.farRestores += 1;
          }
        }
      }
    }
    const bm = CM._isoGroundBake;
    const M = CM._bakeMargin || 0;
    const pd = bm ? panDeltaToScreen(CM.cam.x - bm.camX, CM.cam.y - bm.camY) : null;
    const sameContent = !!bm && !bm.soft && baseOf(bm.other) === key;
    const inMargin = !!bm && !!M && Math.abs(pd.x) <= M && Math.abs(pd.y) <= M;
    const isLod = !!bm && !!bm.other && (bm.other.endsWith(':lod') || bm.other.endsWith(':lodl'));
    // « Atterrissage de zoom en ATTENTE » (lot 3 anti-clignotement) : le bake en
    // place est à une AUTRE échelle et le dernier cran date de moins d'une
    // accalmie longue — la rafale de molette n'est probablement pas finie. Tant
    // que c'est vrai, la branche d'accalmie COURTE ne pose plus de light : les
    // crans humains s'espacent de 200-400 ms, donc CHAQUE cran atteignait les
    // 110 ms de `settled` et posait un light net… que le cran suivant renvoyait
    // au compensé flou. Le sol ALTERNAIT net/flou au rythme de la molette — LE
    // clignotement du dézoom une fois le cadre bouché par le filet. Une seule
    // apparence par geste : compensé pendant la rafale, le net à l'arrêt réel.
    // (Un bake `soft` d'une autre échelle compte aussi : son contenu reste
    // valable par définition, donc compensable — sa recuisson attendra l'arrêt.)
    const zoomStale = !!bm && bm.zoomB != null && bm.zoomB !== CM.cam.zoom && zoomBurst;
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
    // ATTERRISSAGE « CARTE WEB » (lot 5, retour Raph : « l'herbe autour reste
    // toute verte un bon moment ») : quand la source compensée est à MOINS D'UN
    // CRAN — du PLEIN étiré, touffes, fleurs et franges comprises — on la garde
    // à l'écran au lieu de poser un allégé. Sur la campagne, le light sacrifie
    // précisément touffes/fleurs/franges, c'est-à-dire TOUTE la matière de
    // l'herbe : le temps de la montée en tranches (longue sur une mégapole),
    // l'écran montrait un aplat vert uni. Ici la branche du compensé garde
    // l'affichage, pendant que la PRÉ-CUISSON (tout en bas) cuit le cran
    // courant vers son canvas tiers en tranches de ~8 ms — jamais de gel — et
    // qu'à sa photo posée, le restore EXACT l'installe : le net arrive d'un
    // coup, une seule transition. Un plein abordable d'un coup (petite ville)
    // garde son chemin direct ; un light déjà en place finit ses tranches ; un
    // soft recuit ; la capture ignore tout ceci. A/B : __webLanding = false.
    const webLanding = globalThis.__webLanding !== false
      && !CM.capture && !CM.previewWonder
      && globalThis.__groundZoomCache !== false
      && !!bm && !bm.soft && !isLod && bm.zoomB != null
      && baseOf(bm.other) !== key
      && crispEstMs > crispBudget
      && Math.abs(Math.log(bm.zoomB / CM.cam.zoom)) <= Math.log(1.12) * 1.0001;
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
      // Pendant la rafale de molette (zoomStale), cette branche ne prend plus la
      // main avant l'arrêt réel : le compensé (plus bas) garde l'écran. Et à
      // l'arrêt, l'atterrissage « carte web » (webLanding) la saute aussi tant
      // que la photo du cran courant se cuit en coulisse.
      && !webLanding
      && (restful || !zoomStale)
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
        // ATTERRISSAGE SANS GEL (lot 3) : depuis que la rafale ne cuit plus de
        // light, on arrive souvent ici à l'arrêt SANS light en place — un plein
        // d'un coup gèlerait la frame sur une grande ville (98-134 ms par cran
        // mesurés en juillet, bien plus au plancher). S'il est cher, on pose
        // d'abord le LIGHT : la frame suivante le voit en place (isLod, même
        // clé) et le plein monte en TRANCHES, comme depuis toujours. Les
        // petites villes gardent leur plein immédiat (sous budget = pas un
        // gel), la capture aussi (déterminisme).
        bake(CM.capture || crispEstMs <= crispBudget ? false
          : (lightEstMs <= lightBudget ? 'light' : true));
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
      // LE FILET (lot 1 anti-clignotement). Au dézoom, s < 1 : le rectangle
      // compensé ne couvre plus l'écran, et le pourtour retombait sur le fond
      // hors-monde uni — un cadre sombre qui grandissait à chaque frame du
      // glide, LE clignotement du dézoom (.preview-shots/flicker-c2f0.png).
      // Règle des cartes web (Leaflet garde l'ancien niveau étiré, Google Maps
      // sert la tuile parente) : jamais un pixel sans contenu, on étire le
      // niveau disponible en attendant le net. Sous le rectangle, on pose donc
      // d'abord la photo du cran le plus BAS du cache : cuite plus dézoomée que
      // la source courante, elle couvre plus de monde qu'elle — tout l'écran
      // dès que son échelle passe sous le zoom courant. Un drawImage de plus
      // par frame de geste, invisible à côté des ~4 000 blits du dézoom. Au
      // zoom-IN (s ≥ 1) la source couvre déjà tout : aucune photo plus basse
      // n'est retenue et la branche ne coûte rien. Sans photo basse au cache
      // (début de session, pré-cuisson pas passée), comportement d'avant.
      // A/B : globalThis.__solFilet = false.
      if (globalThis.__solFilet !== false && globalThis.__groundZoomCache !== false) {
        const gcF = CM._groundZoomCache;
        // Deux rangs de fond : la base VIVANTE d'abord ; à défaut, une photo du
        // LAYOUT PRÉCÉDENT au même keySuf (même saison/ère/plage — seule la
        // signature du sol diffère). Sur une partie qui CROÎT, le recompute
        // (~10 s) change la signature et tuait tout le filet d'un coup : le
        // « carré » revenait à chaque recompute le temps que le plancher
        // recuise (retour Raph). Un sol à peine périmé, étiré, en FOND d'un
        // transitoire, vaut toujours mieux que le vide — les cartes web
        // servent leurs tuiles périmées exactement pareil.
        let fond = null, fondStale = null;
        if (gcF && gcF.size) {
          for (const e of gcF.values()) {
            if (!e.canvas || e.z >= bm.zoomB) continue;
            if (e.canvas.width !== CM.groundCanvas.width || e.canvas.height !== CM.groundCanvas.height) continue;
            if (e.base === cacheBase) { if (!fond || e.z < fond.z) fond = e; }
            // ⚠ PAS de comparaison par keySuf : il porte la clé du QUAI, qui
            // contient le timestamp de layout — après un recompute il ne
            // rematche jamais (vu au banc : fallback mort-né, filet=0). Les
            // seuls fragments qui FLASHERAIENT dans un fond étiré sont la
            // saison et la bande d'ère : ce sont eux qu'on exige (étiquetés
            // sur la photo à sa pose).
            else if (e.season === (CM.season | 0) && e.band === (((L.counts && L.counts.eraBand) | 0))) {
              if (!fondStale || e.z < fondStale.z) fondStale = e;
            }
          }
        }
        if (!fond) fond = fondStale;
        if (fond) {
          const s2 = CM.cam.zoom / fond.z;
          const pdF = panDeltaToScreen(CM.cam.x - fond.camX, CM.cam.y - fond.camY);
          ctx.drawImage(fond.canvas,
            cx - s2 * (cx + M) - pdF.x, cy - s2 * (cy + M) - pdF.y,
            (CM.cw + 2 * M) * s2, (CM.ch + 2 * M) * s2);
          gzcStats.filet += 1;
        }
      }
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
            // Étiquettes du fallback de fond (cf. la branche « ZOOM en cours ») :
            // ce qui rendrait un fond périmé FLASHANT, et rien d'autre.
            e.season = CM.season | 0; e.band = (L.counts && L.counts.eraBand) | 0;
            gzcStats.snapshots += 1;
            // PLUS DE PURGE EXPLICITE des bases mortes (lot 4) : depuis que le
            // filet les sert en dernier recours (cf. la branche « ZOOM en
            // cours »), une photo d'un layout précédent GARDE une valeur — la
            // jeter au premier snapshot rouvrait le « carré » à chaque
            // recompute d'une partie en croissance. L'éviction LRU borne la
            // mémoire comme avant (cap inchangé), et les photos mortes sortent
            // naturellement, les moins servies d'abord. `gzcStats.purges`
            // reste à 0 — conservé pour les molettes qui le lisent.
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
    // EXCEPTION (lot 2 anti-clignotement) : LE PLANCHER N'ATTEND PAS. Tant
    // qu'il manque au cache (cf. gzcFloorMissing), le filet du geste est
    // aveugle — la cuisson démarre dès que l'écran est servi en plein. Le tapis
    // roulant ne revient pas : ce chemin cuit au plus UNE cible (le plancher)
    // par base, ~8 ms par frame de repos, puis l'hystérésis reprend la main
    // pour les jalons.
    if (CM._gzcSigSeen !== cacheBase) { CM._gzcSigSeen = cacheBase; CM._gzcSigAt = nowMs; }
    if (!CM.capture && restful && !CM.previewWonder && _solSlice === null
      && (nowMs - (CM._gzcSigAt || 0) > 3000 || gzcFloorMissing(cacheBase)
        || gzcScreenMissing(cacheBase, key))
      && globalThis.__groundZoomCache !== false) {
      const bNow = CM._isoGroundBake;
      // « L'écran d'abord » : soit il est servi en PLEIN exact (la règle
      // d'origine), soit il est servi par un COMPENSÉ qui attend sa photo du
      // cran courant (lot 5) — et la cuire, c'est précisément servir l'écran.
      if (bNow && !bNow.soft && (bNow.other === key || gzcScreenMissing(cacheBase, key))) {
        // Annulé si le monde, l'écran ou la caméra ont bougé depuis l'amorce :
        // des tranches cuites sous deux caméras ne se raccordent pas.
        if (gzcPre && (gzcPre.base !== cacheBase || gzcPre.W !== CM.groundCanvas.width
          || gzcPre.H !== CM.groundCanvas.height || gzcPre.camX !== CM.cam.x
          || gzcPre.camY !== CM.cam.y || gzcPre.z0 !== CM.cam.zoom)) gzcPre = null;
        if (!gzcPre) {
          // Prochaine cible : le PLANCHER EFFECTIF (cf. gzcFloorZ — le cran où
          // le dézoom max atterrit vraiment, ni le 0,35 nu du wheel ni le clamp
          // géométrique), puis un jalon tous les DEUX crans sous le zoom
          // courant — la suite que la molette suivra réellement, les crans
          // impairs étant servis par le restore approché (± ½ cran).
          const zFloor = gzcFloorZ();
          const targets = [];
          // L'ÉCRAN D'ABORD (lot 5) : si le joueur regarde un compensé, le
          // cran courant est la cible n° 1 — c'est sa photo que le restore
          // exact installera pour finir l'atterrissage « carte web ».
          if (gzcScreenMissing(cacheBase, key)) targets.push(CM.cam.zoom);
          targets.push(zFloor);
          for (let zt = CM.cam.zoom / (1.12 * 1.12); zt > zFloor * 1.06; zt /= (1.12 * 1.12)) targets.push(zt);
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
              // Mêmes étiquettes de fallback que le snapshot (fond du filet).
              season: CM.season | 0, band: (L.counts && L.counts.eraBand) | 0,
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
}
