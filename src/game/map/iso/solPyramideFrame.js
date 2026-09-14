"use strict";
// ── LE SOL EN PYRAMIDE DE TUILES — LA FRAME (lot 2 de PLAN-SOL-PYRAMIDE) ─────
//
// Ce que fait une frame quand `__solPyramide(true)` :
//   1. le niveau = le cran de zoom sous le zoom courant (levelZoom) ; pendant
//      un glissement, ses tuiles s'étirent de s = zoom / z — la carte web
//      « garde le niveau étiré », rien n'est inventé ;
//   2. les tuiles visibles qui manquent (ou sont périmées) se cuisent, la plus
//      proche du centre d'abord, dans un BUDGET de ~8 ms (coût par tuile mesuré
//      et lissé par niveau) — et 2 tuiles au plus par frame pendant un geste
//      (les uploads GPU groupés faisaient les trous de 100-150 ms) ;
//   3. on compose : tuile fraîche → 1:1 à position device entière ; tuile
//      PÉRIMÉE (autre contenu, autre époque d'invalidation) → dessinée telle
//      quelle en attendant la fraîche (le filet, par construction) ; tuile
//      absente → la portion correspondante d'un AUTRE niveau en cache, le plus
//      proche en échelle, étirée (le repli pyramidal) ; rien du tout → le fond
//      hors-monde posé par l'appelant, le temps d'une cuisson (premières frames) ;
//   4. au repos, le budget restant cuit l'ANNEAU autour de l'écran puis le
//      PLANCHER (le dézoom réflexe) ; le cache est un LRU en Mo, jamais purgé.
//
// Le cache est indexé par POSITION (niveau, tx, ty) — une seule entrée par
// tuile, la plus récente. Sa fraîcheur = même base de contenu (signature du
// sol + saison/ère/plage/quai/relief) ET même époque d'invalidation ; sinon
// elle sert de repli et se recuit. Pas de purge sur recompute : c'est la leçon
// du lot 4 anti-clignotement (une partie qui croît changeait la signature
// toutes les 10 s et le cache mourait) — ici le sol à peine périmé reste à
// l'écran jusqu'à la tuile fraîche. Le lot 3 rendra l'invalidation partielle
// (seules les tuiles dont les cellules ont changé perdent leur fraîcheur).
//
// Capture (`CM.capture`, harnais déterministe) : tout le visible se cuit dans
// la frame, sans budget — le sol est complet et exact.
//
//   __solPyramideTune({ budgetMs, gestureMaxTiles, memMo, ring })   réglages
//   __solPyramideStats                                              relevé (sonde)
import { CM } from '../layout.js';
import { ensureQuayGate } from '../quaysAndRiot.js';
import { groundContentSig, groundKeySuffix } from './isoGroundBake.js';
import { setSolPyramideInvalidator } from './solInvalidate.js';
import {
  SOL_PYRAMIDE, solPyramideStats, levelZoom, tileSideCss, camSpace, tileSpace, tileOrigin, cookTile, ZOOM_MIN, ZOOM_MAX,
} from './solPyramide.js';

export const PYR = { budgetMs: 8, gestureBudgetMs: 12, gestureMaxTiles: 6, holeCapMs: 80, memMo: 96, ring: 1, gestureMs: 400 };

const cache = new Map();      // 'z:tx,ty' → { key, z, tx, ty, S, G, canvas, bytes, base, epoch, last }
let bytes = 0;
let epoch = 0;                // bascule à chaque invalidation 'all'/'soft' : les entrées d'avant sont périmées
let baseCur = '';
let softAt = -1e9;
const costMs = new Map();     // z → coût lissé d'une tuile (ms)
let lastCamX = NaN, lastCamY = NaN, lastZoom = NaN, lastMoveAt = -1e9;

const posKey = (z, tx, ty) => z.toFixed(3) + ':' + tx + ',' + ty;
const fresh = (e) => !!e && e.base === baseCur && e.epoch === epoch;

// ── Invalidation (via la façade solInvalidate) ───────────────────────────────
function invalidate(kind) {
  if (kind === 'soft') {
    // Décodages en rafale au chargement : une époque par fenêtre de 250 ms,
    // pas une par sprite (les tuiles périmées restent affichées de toute façon).
    const now = performance.now();
    if (now - softAt < 250) return;
    softAt = now;
  }
  epoch += 1;
  solPyramideStats.sales += cache.size;
}
setSolPyramideInvalidator(invalidate);

// Coût estimé d'une tuile au niveau z : mesuré à ce niveau, sinon extrapolé
// d'un niveau mesuré en 1/zoom² (la loi éprouvée), sinon 4 ms.
function estimateMs(z) {
  const m = costMs.get(z);
  if (m != null) return m;
  let best = null, bestD = Infinity;
  for (const [zz, ms] of costMs) { const d = Math.abs(Math.log(zz / z)); if (d < bestD) { bestD = d; best = ms * (zz / z) ** 2; } }
  return best != null ? best : 4;
}

function cook(z, tx, ty, now) {
  const t = cookTile(z, tx, ty);
  const key = posKey(z, tx, ty);
  const old = cache.get(key);
  if (old) bytes -= old.bytes;
  const e = { key, z, tx, ty, S: t.S, G: t.G, canvas: t.canvas, bytes: t.canvas.width * t.canvas.height * 4, base: baseCur, epoch, last: now };
  cache.set(key, e); bytes += e.bytes;
  const prev = costMs.get(z);
  costMs.set(z, prev == null ? t.ms : prev * 0.7 + t.ms * 0.3);
  return e;
}

function evict(keep) {
  const max = PYR.memMo * 1048576;
  if (bytes <= max) return;
  const arr = [...cache.values()].filter((e) => !keep.has(e.key)).sort((a, b) => a.last - b.last);
  for (const e of arr) { if (bytes <= max) break; cache.delete(e.key); bytes -= e.bytes; }
}

// Tuiles (tx, ty) du niveau de côté S couvrant [x0, x1) × [y0, y1) d'espace tuile.
function tilesInRect(x0, y0, x1, y1, S) {
  const out = [];
  const tx0 = Math.floor(x0 / S), tx1 = Math.floor((x1 - 1e-9) / S);
  const ty0 = Math.floor(y0 / S), ty1 = Math.floor((y1 - 1e-9) / S);
  for (let ty = ty0; ty <= ty1; ty += 1) for (let tx = tx0; tx <= tx1; tx += 1) out.push({ tx, ty });
  return out;
}

// Dessine la partie [ax, bx) × [ay, by) (espace tuile du niveau de `e`) de la
// tuile `e`, à l'écran : `sE` = zoom / e.z, `c` = camSpace de la caméra au zoom
// courant. Position rabattue sur la grille device ; 1:1 en nearest, étiré lissé.
function drawPart(ctx, e, ax, ay, bx, by, sE, c, cw, ch, dpr) {
  const o = tileOrigin(e.tx, e.ty, e.S);
  const x0 = Math.max(ax, o.x), y0 = Math.max(ay, o.y), x1 = Math.min(bx, o.x + e.S), y1 = Math.min(by, o.y + e.S);
  if (x1 <= x0 || y1 <= y0) return;
  const sx = (x0 - (o.x - e.G)) * dpr, sy = (y0 - (o.y - e.G)) * dpr;
  const dx = x0 * sE - c.x + cw / 2, dy = y0 * sE - c.y + ch / 2;
  const snap = (v) => Math.round(v * dpr) / dpr;
  ctx.imageSmoothingEnabled = sE !== 1;
  ctx.drawImage(e.canvas, sx, sy, (x1 - x0) * dpr, (y1 - y0) * dpr, snap(dx), snap(dy), (x1 - x0) * sE, (y1 - y0) * sE);
}

// Repli pyramidal : la région de la tuile manquante (niveau z) servie par ce
// que le cache a aux AUTRES niveaux. Partiel accepté — un morceau de sol étiré
// vaut toujours mieux qu'un trou (mesuré au banc : exiger une couverture
// entière laissait 5-14 trous par frame pendant un dézoom). Les niveaux les
// plus ÉLOIGNÉS en échelle se dessinent d'abord, le plus proche en dernier :
// ce qui reste à l'écran est toujours la meilleure version disponible.
function drawFallback(ctx, z, tx, ty, S, zoom, c, cw, ch, dpr, levels) {
  const o = tileOrigin(tx, ty, S);
  let any = false;
  for (let i = levels.length - 1; i >= 0; i -= 1) {
    const zz = levels[i];
    const r = zz / z, Sz = tileSideCss(dpr, zz);
    const ax = o.x * r, ay = o.y * r, bx = (o.x + S) * r, by = (o.y + S) * r;
    const sE = zoom / zz;
    for (const t of tilesInRect(ax, ay, bx, by, Sz)) {
      const e = cache.get(posKey(zz, t.tx, t.ty));
      if (!e) continue;
      drawPart(ctx, e, ax, ay, bx, by, sE, c, cw, ch, dpr);
      any = true;
    }
  }
  return any;
}

// Le plancher EFFECTIF du zoom (cf. gzcFloorZ de l'ancien cache) : le clamp
// géométrique publié par la caméra, jamais sous ZOOM_MIN — c'est là que le
// dézoom réflexe atterrit, c'est ce niveau qu'on pré-cuit au repos.
function floorLevel() { return levelZoom(Math.max(CM.zoomFloor || 0.35, ZOOM_MIN)); }

// Les tuiles d'un niveau qui couvrent TOUT le plan de ville (ses gridN × gridN
// cellules, projetées en espace tuile) — le plancher se pré-cuit sur cette base.
// Boîte du plan de ville en espace tuile du niveau z (avec une cellule de marge :
// les cellules du bord débordent). Ce qui est HORS de cette boîte n'a rien à
// cuire : c'est le fond hors-monde, déjà posé par l'appelant — ni tuile, ni trou.
// (Mesuré sans ce test : au plancher d'une grande carte, des dizaines de tuiles
// vides « cuites » en urgence par la règle des trous, 100 ms de gel pour rien.)
function mapBBoxAtLevel(L, z) {
  const N = ((L.gridN | 0) || 1) + 1, T = CM.TILE;
  const corners = [tileSpace(-T, -T, z), tileSpace(N * T, -T, z), tileSpace(-T, N * T, z), tileSpace(N * T, N * T, z)];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of corners) { x0 = Math.min(x0, c.x); x1 = Math.max(x1, c.x); y0 = Math.min(y0, c.y); y1 = Math.max(y1, c.y); }
  return { x0, y0, x1, y1 };
}
const inMap = (mb, tx, ty, S) => (tx + 1) * S > mb.x0 && tx * S < mb.x1 && (ty + 1) * S > mb.y0 && ty * S < mb.y1;

function mapTilesAtLevel(L, z, S) {
  const mb = mapBBoxAtLevel(L, z);
  return tilesInRect(mb.x0, mb.y0, mb.x1, mb.y1, S);
}

// Y a-t-il QUELQUE CHOSE à montrer pour la tuile (z, tx, ty) : une entrée
// périmée à sa place, ou une tuile d'un autre niveau qui la recouvre en partie ?
// Sinon c'est un TROU (fond hors-monde) — et un trou ne se budgète pas.
function hasAnyFallback(z, tx, ty, S, dpr, levels) {
  if (cache.has(posKey(z, tx, ty))) return true;
  const o = tileOrigin(tx, ty, S);
  for (const zz of levels) {
    const r = zz / z, Sz = tileSideCss(dpr, zz);
    for (const t of tilesInRect(o.x * r, o.y * r, (o.x + S) * r, (o.y + S) * r, Sz)) {
      if (cache.has(posKey(zz, t.tx, t.ty))) return true;
    }
  }
  return false;
}

// Niveaux présents dans le cache, triés par proximité d'échelle avec z.
function cachedLevelsNear(z) {
  const set = new Set();
  for (const e of cache.values()) if (e.z !== z) set.add(e.z);
  return [...set].sort((a, b) => Math.abs(Math.log(a / z)) - Math.abs(Math.log(b / z)));
}

// ── La frame ─────────────────────────────────────────────────────────────────
export function paintGroundPyramid(ctx, L, nowMs) {
  if (!SOL_PYRAMIDE.on || !L) return false;
  ensureQuayGate();
  const base = groundContentSig(L) + groundKeySuffix(L);
  if (base !== baseCur) baseCur = base;      // (lot 3 : diff des cellules → tuiles sales ciblées)

  const dpr = CM.dpr || 1, cw = CM.cw, ch = CM.ch;
  const zoom = CM.cam.zoom, z = levelZoom(zoom), s = zoom / z, S = tileSideCss(dpr, z);
  if (CM.cam.x !== lastCamX || CM.cam.y !== lastCamY || zoom !== lastZoom) {
    lastCamX = CM.cam.x; lastCamY = CM.cam.y; lastZoom = zoom; lastMoveAt = nowMs;
  }
  // ⚠ L'horloge de RAFALE DE ZOOM (`CM._igZoomAt`) est lue par le quai
  // (quayGlide.js) pour servir son bake étiré pendant un glissement. Elle était
  // tenue par l'ancien cache du sol — qui ne tourne plus quand les tuiles sont
  // allumées : mesuré chez Raph, le quai recuisait de nouveau à CHAQUE frame de
  // zoom (jusqu'à 25 ms). Le sol en tuiles la tient donc lui aussi, à l'identique.
  if (zoom !== CM._igZoomPrev) { CM._igZoomPrev = zoom; CM._igZoomAt = nowMs; }
  const gesture = nowMs - lastMoveAt < PYR.gestureMs;
  const c = camSpace(CM.cam.x, CM.cam.y, zoom);
  const x0 = (c.x - cw / 2) / s, x1 = (c.x + cw / 2) / s, y0 = (c.y - ch / 2) / s, y1 = (c.y + ch / 2) / s;
  const mbZ = mapBBoxAtLevel(L, z);
  const visAll = tilesInRect(x0, y0, x1, y1, S);
  const vis = visAll.filter((t) => inMap(mbZ, t.tx, t.ty, S));
  const vides = visAll.length - vis.length;
  const keep = new Set();
  for (const t of vis) keep.add(posKey(z, t.tx, t.ty));

  // 1) Cuisson des manquantes / périmées, du centre vers les bords, sous budget.
  // ⚠ Pendant un GLISSEMENT de zoom (zoomGoal ≠ zoom), on cuit au niveau CIBLE,
  // pas au niveau courant : le cran change à chaque frame et une tuile cuite
  // en route était perdue au suivant (mesuré : 171 trous sur un dézoom). Les
  // tuiles cibles servent tout de suite, étirées, par le repli — et sont là
  // à l'atterrissage.
  // ⚠ Cible bornée au PLANCHER effectif : un zoomGoal sous le clamp (0,25 demandé,
  // 0,5 atteignable) laissait cuire un niveau que la vue n'atteint jamais, et
  // le visible attendait derrière (mesuré : 103 trous, 20 frames de repli).
  const zc = (!CM.capture && CM.zoomGoal != null && Math.abs(CM.zoomGoal - zoom) > 1e-6)
    ? Math.max(levelZoom(CM.zoomGoal), floorLevel()) : z;
  const Sc = tileSideCss(dpr, zc), rc = zc / z;
  const cxT = (x0 + x1) / 2 * rc, cyT = (y0 + y1) / 2 * rc;
  const mbC = zc === z ? mbZ : mapBBoxAtLevel(L, zc);
  const need = tilesInRect(x0 * rc, y0 * rc, x1 * rc, y1 * rc, Sc)
    .filter((t) => inMap(mbC, t.tx, t.ty, Sc) && !fresh(cache.get(posKey(zc, t.tx, t.ty))))
    .sort((a, b) => (Math.hypot((a.tx + 0.5) * Sc - cxT, (a.ty + 0.5) * Sc - cyT) - Math.hypot((b.tx + 0.5) * Sc - cxT, (b.ty + 0.5) * Sc - cyT)));
  const t0 = performance.now();
  // En geste, un budget un peu plus large : un trou (fond hors-monde) se voit
  // plus qu'une frame à 25 ms, et la première tuile d'un niveau coûte le
  // double (variantes de textures construites à la demande).
  const budget = CM.capture ? Infinity : (gesture ? PYR.gestureBudgetMs : PYR.budgetMs);
  const maxN = CM.capture ? Infinity : (gesture ? PYR.gestureMaxTiles : 1e9);
  let n = 0;
  // ⚠ « JAMAIS UN PIXEL SANS CONTENU » passe avant le budget : une tuile visible
  // qui n'a AUCUN repli (ni entrée périmée, ni autre niveau qui la recouvre)
  // serait un trou noir à l'écran — elle se cuit tout de suite, hors budget,
  // sous un plafond dur (holeCapMs) qui borne le gel. Ça n'arrive qu'au premier
  // affichage, après un saut de caméra ou à la découverte d'une zone jamais vue
  // (mesuré : sans cette règle, 35 trous au premier affichage d'une grande
  // ville, résorbés à 1-2 par frame pendant une seconde).
  const levelsAvant = cachedLevelsNear(z);
  const holes = [], others = [];
  for (const t of need) {
    if (zc === z && !CM.capture && !hasAnyFallback(z, t.tx, t.ty, S, dpr, levelsAvant)) holes.push(t); else others.push(t);
  }
  for (const t of holes) {
    if (performance.now() - t0 > PYR.holeCapMs) break;
    cook(zc, t.tx, t.ty, nowMs); n += 1;
  }
  for (const t of others) {
    if (n >= maxN) break;
    if (n > 0 && performance.now() - t0 + estimateMs(zc) > budget) break;
    cook(zc, t.tx, t.ty, nowMs); n += 1;
  }

  // 2) Composition.
  const prevSm = ctx.imageSmoothingEnabled;
  let levels = null;
  let hits = 0, replis = 0, trous = 0;
  for (const t of vis) {
    const e = cache.get(posKey(z, t.tx, t.ty));
    if (e) {
      const o = tileOrigin(t.tx, t.ty, S);
      drawPart(ctx, e, o.x, o.y, o.x + S, o.y + S, s, c, cw, ch, dpr);
      e.last = nowMs;
      if (fresh(e)) hits += 1; else replis += 1;
    } else {
      if (!levels) levels = cachedLevelsNear(z);
      if (drawFallback(ctx, z, t.tx, t.ty, S, zoom, c, cw, ch, dpr, levels)) replis += 1; else trous += 1;
    }
  }
  ctx.imageSmoothingEnabled = prevSm;

  // 3) Repos : le PLANCHER sous la vue d'abord (le dézoom réflexe révèle d'un
  //    coup 4 à 40 fois plus de monde : seules les tuiles du plancher peuvent
  //    le boucher — mesuré : sans elles, 100-170 trous par dézoom), puis
  //    l'anneau autour de l'écran (le drag).
  if (!gesture && !CM.capture && performance.now() - t0 + estimateMs(z) <= budget) {
    const R = PYR.ring;
    // Le plancher couvre TOUTE LA CARTE (bornée par le plan), pas seulement la
    // vue : un dézoom réflexe révèle d'un coup jusqu'à 16 fois le monde visible
    // et seules ces tuiles-là peuvent le boucher (mesuré : 221 trous sur un
    // dézoom avec un plancher limité à la vue). Une grande carte au plancher,
    // c'est ~15 tuiles de 128 px : quelques secondes de repos, une fois.
    const zf = floorLevel();
    if (z > zf) {
      const Sf = tileSideCss(dpr, zf), r = zf / z;
      const floor = mapTilesAtLevel(L, zf, Sf)
        .filter((t) => !fresh(cache.get(posKey(zf, t.tx, t.ty))))
        .sort((a, b) => (Math.hypot((a.tx + 0.5) * Sf - cxT * r / rc, (a.ty + 0.5) * Sf - cyT * r / rc)
          - Math.hypot((b.tx + 0.5) * Sf - cxT * r / rc, (b.ty + 0.5) * Sf - cyT * r / rc)));
      for (const t of floor) {
        if (performance.now() - t0 + estimateMs(zf) > budget) break;
        cook(zf, t.tx, t.ty, nowMs);
      }
    }
    const ring = tilesInRect(x0 - R * S, y0 - R * S, x1 + R * S, y1 + R * S, S)
      .filter((t) => inMap(mbZ, t.tx, t.ty, S) && !keep.has(posKey(z, t.tx, t.ty)) && !fresh(cache.get(posKey(z, t.tx, t.ty))));
    for (const t of ring) {
      if (performance.now() - t0 + estimateMs(z) > budget) break;
      cook(z, t.tx, t.ty, nowMs);
    }
  }

  // 4) Mémoire.
  evict(keep);

  solPyramideStats.hits += hits; solPyramideStats.replis += replis; solPyramideStats.trous = (solPyramideStats.trous || 0) + trous;
  // La dernière frame, à plat — ce que la sonde et le banc lisent pour comprendre un trou.
  solPyramideStats.dernier = { zoom: +zoom.toFixed(3), z, zc, s: +s.toFixed(3), vis: vis.length, vides, aCuire: need.length, cuites: n, hits, replis, trous, gesture, zoomGoal: CM.zoomGoal == null ? null : +CM.zoomGoal.toFixed(3), msSol: +(performance.now() - t0).toFixed(1) };
  solPyramideStats.tuilesVisibles = vis.length; solPyramideStats.memoMo = Math.round(bytes / 1048576 * 10) / 10;
  solPyramideStats.entrees = cache.size;
  return true;
}

export function solPyramideReset() { cache.clear(); bytes = 0; costMs.clear(); }

if (typeof globalThis !== 'undefined') {
  globalThis.__solPyramideTune = (o) => { if (o) Object.assign(PYR, o); return { ...PYR }; };
  globalThis.__solPyramideReset = solPyramideReset;
}
// Bornes connues du module (documentation vivante) : les niveaux vont de ZOOM_MIN à ZOOM_MAX.
export const SOL_PYRAMIDE_LEVELS = { min: ZOOM_MIN, max: ZOOM_MAX };
