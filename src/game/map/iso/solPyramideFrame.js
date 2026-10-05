"use strict";
// ── LE SOL EN PYRAMIDE DE TUILES — LA FRAME (lot 2 de PLAN-SOL-PYRAMIDE) ─────
//
// Ce que fait une frame (le sol en tuiles est le seul chemin depuis le lot 4) :
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
import { CM, cmEngineHomeHidden } from '../layout.js';
import { ensureQuayGate } from '../quaysAndRiot.js';
import { groundContentSig, groundKeySuffix } from './isoGroundBake.js';
import { setSolPyramideInvalidator } from './solInvalidate.js';
import { builtCells, courOf } from './isoTissu.js';
import { WONDER_GROUND, wonderGroundSet } from './isoWonderGround.js';
import { beachPortCells, beachZone } from './isoBeachCells.js';
import { BEACH } from './isoGroundTiles.js';
import { forestFloorSig } from './isoForestFloor.js';
import { meadowSig } from './isoMeadow.js';
import { ISO_X, ISO_Y } from './projection.js';
import {
  solPyramideStats, levelZoom, tileSideCss, camSpace, tileSpace, tileOrigin, cookTile, ZOOM_MIN, ZOOM_MAX, softCoalescer,
} from './solPyramide.js';

export const PYR = { budgetMs: 8, gestureBudgetMs: 12, gestureMaxTiles: 6, holeCapMs: 80, memMo: 96, ring: 1, gestureMs: 400 };

const cache = new Map();      // 'z:tx,ty' → { key, z, tx, ty, S, G, canvas, bytes, base, epoch, dpr, last }
let bytes = 0;
let epoch = 0;                // bascule à chaque invalidation 'all'/'soft' : les entrées d'avant sont périmées
let cacheDpr = 0;             // dpr auquel le cache a été cuit (le côté S et le raster des tuiles en dépendent)
let sigCur = '';              // empreinte de CONTENU du plan (groundContentSig) — change quand une cellule change
let sufCur = '';              // tout le reste (ère, saison, plage, quai, relief, fleuve) — change rarement
let curL = null;              // le plan courant, pour signer les tuiles
let revealSeen = 0;           // compteur de révélation des maisons-moteur vu à la dernière frame
const soft = softCoalescer(250);  // décodages en rafale : retenus, jamais perdus
const costMs = new Map();     // z → coût lissé d'une tuile (ms)
let lastCamX = NaN, lastCamY = NaN, lastZoom = NaN, lastMoveAt = -1e9;

const posKey = (z, tx, ty) => z.toFixed(3) + ':' + tx + ',' + ty;
// ── L'INVALIDATION PARTIELLE (lot 3) ─────────────────────────────────────────
// Le recompute du plan change la signature globale du sol (sigCur) : avant le
// lot 3, toutes les tuiles devenaient périmées d'un coup — la mort du cache
// de l'ancien système, en tuiles. Ici chaque tuile porte la SIGNATURE DE SES
// CELLULES (tileSig : routes et leur masque, urbain, pelouses, parvis, fleuve,
// bâti, cour — exactement les entrées de kindAt et des passes, avec deux
// cellules de marge pour les franges et les faces). Au recompute, une tuile
// dont la signature n'a pas bougé reste FRAÎCHE : seules celles où le monde a
// changé se recuisent. Le calcul se fait à la demande et se mémoïse par
// signature globale (une comparaison par tuile et par recompute, ~0,1 ms).
// Ce qui ne se signe pas par cellule (saison, ère, plage, quai, relief,
// géométrie du fleuve) reste dans le suffixe : s'il change, tout se recuit.
// Le fleuve est signé PAR TUILE (ses cellules, ses îles qui touchent la tuile) :
// dans une ville qui grandit, la grille s'étend et le fleuve avec elle — sa
// taille globale change à chaque recompute (mesuré : 1 866 → 2 003 cellules),
// alors que ses cellules déjà cuites, elles, ne bougent pas.
// LA RÉVÉLATION PER-ACHAT passe par le même jugement, mais ciblé. Une maison-
// moteur pré-posée n'a d'allée de seuil qu'une fois révélée (cmEngineHomeHidden) :
// ses cellules portent un bit « masquée » dans la signature de tuile. Or un achat
// ne recalcule pas le plan — sans rien de plus, toutes les tuiles restaient
// fraîches et la maison apparaissait sans son seuil jusqu'au recompute suivant.
// Quand le compteur bouge, seules les entrées dont la boîte de cellules touche
// une maison qui a changé d'état perdent leur verdict (revealTouched) : fresh()
// les re-juge, les autres gardent le leur. Mettre le compteur dans la signature
// globale aurait marché aussi, mais en re-jugeant TOUT le cache à chaque achat :
// mesuré ~16 ms la frame d'après (112 tuiles visibles à 0,14 ms, ville de
// 1 361 bâtiments), sur un chemin d'achat conçu pour ne rien coûter.
function riverSig(L) { return (L && L.river && L.river.present) ? 'r1' : 'r0'; }

// Cellules des maisons-MOTEUR (emprise entière) → leur tuile, mémoïsé sur le
// plan comme builtCells : la signature y lit, cellule par cellule, si la maison
// est encore masquée.
function engineHomeCells(L) {
  if (L._engineHomeCells) return L._engineHomeCells;
  const m = new Map();
  for (const t of (L.tiles || [])) {
    if (t.type !== 'enginehome') continue;
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    for (let ax = 0; ax < sx; ax += 1) for (let ay = 0; ay < sy; ay += 1) m.set((t.gx + ax) + ',' + (t.gy + ay), t);
  }
  L._engineHomeCells = m;
  return m;
}

// La boîte de cellules qu'une tuile signe : ses coins (espace tuile, sans
// terrain) → monde → cellules, + 2 de marge. Partagée par tileSig et
// revealTouched — une maison touche une tuile si et seulement si elle est signée.
function tileCellBox(z, tx, ty, S) {
  const T = CM.TILE;
  const o = tileOrigin(tx, ty, S);
  let wx0 = Infinity, wy0 = Infinity, wx1 = -Infinity, wy1 = -Infinity;
  for (const [X, Y] of [[o.x, o.y], [o.x + S, o.y], [o.x, o.y + S], [o.x + S, o.y + S]]) {
    const a = X / (ISO_X * z), b = Y / (ISO_Y * z);
    const wx = (b + a) / 2, wy = (b - a) / 2;
    wx0 = Math.min(wx0, wx); wx1 = Math.max(wx1, wx); wy0 = Math.min(wy0, wy); wy1 = Math.max(wy1, wy);
  }
  return { gx0: Math.floor(wx0 / T) - 2, gx1: Math.ceil(wx1 / T) + 2, gy0: Math.floor(wy0 / T) - 2, gy1: Math.ceil(wy1 / T) + 2 };
}

// Les entrées ({ z, tx, ty, S }) dont la boîte de cellules touche une maison-
// moteur qui change d'état entre les compteurs r0 et r1 — celles dont la
// signature change. Pure : le cache n'y entre que comme liste.
export function revealTouched(L, r0, r1, entries) {
  const moved = [];
  for (const t of (L.tiles || [])) if (cmEngineHomeHidden(t, r0) !== cmEngineHomeHidden(t, r1)) moved.push(t);
  const out = [];
  if (!moved.length) return out;
  for (const e of entries) {
    const bx = tileCellBox(e.z, e.tx, e.ty, e.S);
    for (const t of moved) {
      const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
      if (t.gx + sx > bx.gx0 && t.gx <= bx.gx1 && t.gy + sy > bx.gy0 && t.gy <= bx.gy1) { out.push(e); break; }
    }
  }
  return out;
}

export function tileSig(L, z, tx, ty, S) {
  const { gx0, gx1, gy0, gy1 } = tileCellBox(z, tx, ty, S);
  // Les pelouses de ville (L.townGreen, cf. isoMeadow.townLawnAt) : voile clair,
  // massifs de fleurs, bord franc — cuits dans le sol. Hors de urbanSet, un jardin
  // qui apparaît ne changeait aucun autre bit de sa cellule. (Le bit 4 signait
  // jusqu'ici `L.meadow`, un champ que le plan ne produit plus.)
  const roadSet = L.roadSet, roadMap = L.roadMap, urban = L.urbanSet, green = L.townGreen && L.townGreen.has ? L.townGreen : null;
  const wg = WONDER_GROUND.on ? wonderGroundSet(L) : null;
  const river = (L.river && L.river.present && L.river.cells) || null;
  const built = builtCells(L), cour = courOf(L), ports = beachPortCells(L), homes = engineHomeCells(L);
  // Le masque du quai : les bancs de berge (cellules) et les brèches (points),
  // signés PAR TUILE — sa clé globale porte l'horodatage du recalcul, elle ne
  // peut pas servir (elle périmait toutes les tuiles à chaque recompute).
  const banks = CM.quayBankCells && CM.quayBankCells.has ? CM.quayBankCells : null;
  const gaps = (CM.quayGate && CM.quayGate.gapPts) || null;
  // La GRÈVE (isoBeachCells.beachZone) : une bande mesurée le long du fleuve, dont la
  // rampe court sur ±3 samples de 1,5 tuile — sa cause sort de la marge de deux
  // cellules, les brèches ci-dessus ne la couvrent pas. On signe son RÉSULTAT par
  // cellule ; ses exclusions (route, bâti hors port) sont signées à côté (audit du
  // 2026-10-05, BUG-100).
  const beach = BEACH.on ? beachZone(L) : null;
  const RANK = { plaza: 1, main: 2, path: 3 }, SURF = { bridge: 1 };
  let h = 2166136261;
  const mix = (v) => { h = Math.imul(h ^ (v | 0), 16777619) >>> 0; };
  for (let gy = gy0; gy <= gy1; gy += 1) {
    for (let gx = gx0; gx <= gx1; gx += 1) {
      const key = gx + ',' + gy;
      let code = 0;
      if (roadSet && roadSet.has(key)) {
        code |= 1;
        const c = roadMap && roadMap.get(key);
        if (c) code |= ((c.mask | 0) & 255) << 8 | ((RANK[c.rank] || 7) << 16) | ((SURF[c.roadSurface] || 0) << 20);
        // Matière de la cellule (mémoire des rues, docs/PLAN-ROUTES.md R4) : une venelle
        // repavée doit recuire sa tuile même si son rang et son masque n'ont pas bougé.
        if (c && c.pave != null) code |= ((c.pave & 15) + 1) << 27;
      }
      if (urban && urban.has(key)) code |= 2;
      if (green && green.has(key)) code |= 4;
      if (wg && wg.has(key)) code |= 8;
      if (river && river.has(key)) code |= 16;
      if (built.has(key)) code |= 32;
      if (ports && ports.has(key)) code |= 64;
      if (banks && banks.has(key)) code |= 128;
      if (beach && beach.has(key)) code |= 1 << 21;
      const ck = cour && cour.get ? cour.get(key) : null;
      if (ck) code |= (ck === 'urban' ? 1 : ck === 'dirt' ? 2 : 3) << 24;
      const eh = homes.get(key);
      if (eh && cmEngineHomeHidden(eh)) code |= 1 << 26;   // maison masquée : pas d'allée de seuil
      if (code) { mix(gx * 73856093 ^ gy * 19349663); mix(code); }
    }
  }
  if (gaps) for (const p of gaps) {
    if (p.x >= gx0 && p.x <= gx1 + 1 && p.y >= gy0 && p.y <= gy1 + 1) { mix(Math.round(p.x * 16)); mix(Math.round(p.y * 16)); }
  }
  const isles = L.river && L.river.islands;
  if (isles) for (const il of isles) {
    const R = Math.max(il.rx || 0, il.ry || 0) + 1;
    if (il.x + R >= gx0 && il.x - R <= gx1 + 1 && il.y + R >= gy0 && il.y - R <= gy1 + 1) {
      mix(Math.round(il.x * 16)); mix(Math.round(il.y * 16)); mix(Math.round((il.rx || 0) * 16)); mix(Math.round((il.ry || 0) * 16));
      mix(Math.round((il.tx || 0) * 1024)); mix(Math.round((il.ty || 0) * 1024));
    }
  }
  // Le SOUS-BOIS (isoForestFloor) suit la distance à la vie, qui dépend de routes et
  // d'emprises jusqu'à 5 cellules hors de la tuile : elle se signe ici.
  forestFloorSig(L, mix, gx0, gx1, gy0, gy1);
  // Les PRÉS (isoMeadow) suivent la distance au fleuve, jusqu'à MEADOW.water cellules.
  meadowSig(L, mix, gx0, gx1, gy0, gy1);
  return h;
}

// Une entrée est fraîche si : même époque d'invalidation, même suffixe, même
// dpr de cuisson, et même plan — ou, le plan ayant changé, même signature de
// ses cellules.
const fresh = (e) => {
  if (!e || e.epoch !== epoch || e.suf !== sufCur || e.dpr !== cacheDpr) return false;
  if (e.sig === sigCur) return true;
  if (e.chk !== sigCur) {
    e.chk = sigCur;
    e.chkOk = !!curL && e.tsig === tileSig(curL, e.z, e.tx, e.ty, e.S);
    if (e.chkOk) { e.sig = sigCur; solPyramideStats.revalidees = (solPyramideStats.revalidees || 0) + 1; }
    else solPyramideStats.sales += 1;
  }
  return e.chkOk;
};

// ── Invalidation (via la façade solInvalidate) ───────────────────────────────
function invalidate(kind) {
  const inv = solPyramideStats.invalidations || (solPyramideStats.invalidations = { all: 0, soft: 0, cells: 0 });
  inv[kind] = (inv[kind] || 0) + 1;
  // 'cells' (recompute de layout) : rien à faire ici — la frame voit la
  // signature globale changer et re-juge chaque tuile sur ses cellules.
  if (kind === 'cells') return;
  // Décodages en rafale au chargement : une époque par fenêtre de 250 ms, pas une
  // par sprite (les tuiles périmées restent affichées de toute façon). Ceux qui
  // tombent dans la fenêtre sont RETENUS et rendus par la frame (flushSoft).
  if (kind === 'soft' && !soft.hit(performance.now())) return;
  bumpEpoch();
}
function bumpEpoch() {
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
  const e = { key, z, tx, ty, S: t.S, G: t.G, canvas: t.canvas, bytes: t.canvas.width * t.canvas.height * 4,
    sig: sigCur, suf: sufCur, tsig: curL ? tileSig(curL, z, tx, ty, t.S) : 0, chk: sigCur, chkOk: true, epoch, dpr: cacheDpr, last: now };
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

// ── L'ORIGINE ÉCRAN DE L'ESPACE TUILE, ARRONDIE UNE SEULE FOIS PAR FRAME ─────
// Le trait vertical d'un pixel qui traversait tout le sol (capture de Raph du
// 2026-09-28, « je le vois souvent ») : une colonne où AUCUNE tuile n'était
// posée, donc le fond hors-monde (SEASON_WILD d'été 98,120,76 posé à 0,9 sur
// fond sombre — la capture donne 87,108,71 sur toute la colonne).
// Chaque tuile arrondissait SA position, x0·sE − c.x + cw/2, au pixel device.
// La caméra de rendu est quantifiée (drawIsoWorld) : c.x·dpr tombe sur un entier
// — au bruit flottant près, car u = round(…)/(z·dpr) n'est pas exact en binaire
// hors z = ½, 1, 2. Si cw·dpr est IMPAIR (le canevas de Raph fait 1 765 px),
// + cw/2 pose chaque tuile PILE sur un demi-pixel, et ce bruit, qui ne survit
// pas à l'identique dans toutes les soustractions, faisait arrondir une tuile
// vers le bas et sa voisine vers le haut : un pixel de vide entre les deux, sur
// toute la hauteur de l'écran. Simulé : 0,3 à 1 % des jointures de colonnes par
// position de caméra à z 0,75 / 1,25 / 1,375 / 1,5 / 1,625 / 2,5 / 3 ; jamais
// avec une largeur paire (d'où « non reproduit » sur un banc de 952 px), et en
// Y dès que ch·dpr est impair (dpr 1,25, hauteur 900).
// Remède : on arrondit l'ORIGINE une fois, les tuiles s'y posent par des
// décalages entiers (S·dpr est entier par construction, cf. tileSideCss) — deux
// voisines ne peuvent plus se séparer. Simulé : 0 trou, 0 recouvrement, dans
// toutes les configurations. Exportée pour le test (solPyramideSeam.test.js).
export function screenOrigin(c, cw, ch, dpr) {
  const d = dpr || 1;
  return { x: Math.round((cw / 2 - c.x) * d) / d, y: Math.round((ch / 2 - c.y) * d) / d };
}

// Dessine la partie [ax, bx) × [ay, by) (espace tuile du niveau de `e`) de la
// tuile `e`, à l'écran : `sE` = zoom / e.z, `org` = origine écran de l'espace
// tuile (cf. screenOrigin). Position rabattue sur la grille device ; 1:1 en
// nearest, étiré lissé.
function drawPart(ctx, e, ax, ay, bx, by, sE, org, dpr) {
  const o = tileOrigin(e.tx, e.ty, e.S);
  const x0 = Math.max(ax, o.x), y0 = Math.max(ay, o.y), x1 = Math.min(bx, o.x + e.S), y1 = Math.min(by, o.y + e.S);
  if (x1 <= x0 || y1 <= y0) return;
  const sx = (x0 - (o.x - e.G)) * dpr, sy = (y0 - (o.y - e.G)) * dpr;
  const dx = x0 * sE + org.x, dy = y0 * sE + org.y;
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
function drawFallback(ctx, z, tx, ty, S, zoom, org, dpr, levels) {
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
      drawPart(ctx, e, ax, ay, bx, by, sE, org, dpr);
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
  if (!L) return false;
  // Un décodage retenu par la fenêtre des invalidations douces : rendu ici.
  if (soft.flush(performance.now())) bumpEpoch();
  ensureQuayGate();
  curL = L;
  sigCur = groundContentSig(L);
  // Le compteur de révélation a bougé (un achat, sans recompute) : les seules
  // tuiles de la maison apparue perdent leur verdict (cf. L'INVALIDATION PARTIELLE).
  const reveal = CM.engineHomeReveal || 0;
  if (reveal !== revealSeen) {
    for (const e of revealTouched(L, revealSeen, reveal, cache.values())) { e.sig = ''; e.chk = ''; }
    revealSeen = reveal;
  }
  // Le suffixe partagé porte la clé du masque de quai AVEC l'horodatage du
  // recalcul (l'ancien cache en a besoin) ; ici on ne garde que son mode
  // (plein/naturel) — le contenu du masque est signé par tuile (tileSig).
  sufCur = groundKeySuffix(L).replace(/:qg[^:]*:([fu])/, ':qg$1') + ':' + riverSig(L);

  const dpr = CM.dpr || 1, cw = CM.cw, ch = CM.ch;
  // ⚠ LE DPR CHANGE EN COURS DE JEU (audit du 2026-10-05, BUG-21) : zoom du
  // navigateur, Ctrl±, fenêtre glissée vers un écran à 125/150 %. Le côté des
  // tuiles en dépend (256 px device : 256 px CSS à dpr 1, 208 à 1,25, 168 à 1,5),
  // leur raster aussi — or la clé (niveau, tx, ty) et la fraîcheur l'ignoraient.
  // Calculé sur une grande ville (dpr 1 → 1,25) : 97 tuiles visibles sur 117 ne
  // recouvraient plus rien, 20 étaient à la mauvaise échelle, toutes jugées
  // fraîches, donc jamais recuites — le sol disparaissait jusqu'à la saison
  // suivante. Un cache cuit à un autre dpr ne sert à rien, même en repli (ses
  // sources sont à une autre échelle) : on le vide, et la règle des trous recuit
  // l'écran tout de suite, plancher d'abord.
  if (dpr !== cacheDpr) {
    if (cache.size) solPyramideReset();
    cacheDpr = dpr;
  }
  const zoom = CM.cam.zoom, z = levelZoom(zoom), s = zoom / z, S = tileSideCss(dpr, z);
  if (CM.cam.x !== lastCamX || CM.cam.y !== lastCamY || zoom !== lastZoom) {
    lastCamX = CM.cam.x; lastCamY = CM.cam.y; lastZoom = zoom; lastMoveAt = nowMs;
  }
  const gesture = nowMs - lastMoveAt < PYR.gestureMs;
  const c = camSpace(CM.cam.x, CM.cam.y, zoom);
  const org = screenOrigin(c, cw, ch, dpr);
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
  // Un trou se bouche avec la tuile du PLANCHER qui le couvre quand elle est
  // plus grossière que le niveau courant : même surface d'écran pour 2 à 16
  // fois moins de cuisson (mesuré chez Raph : 22 tuiles exactes cuites d'un
  // coup = 60 ms ; une tuile de plancher couvre quatre tuiles de zoom 1). La
  // tuile exacte suit par le budget, comme les autres.
  const zf = floorLevel();
  if (holes.length && zf < z) {
    const Sf = tileSideCss(dpr, zf), r = zf / z;
    const done = new Set();
    for (const t of holes) {
      if (performance.now() - t0 > PYR.holeCapMs) break;
      const o = tileOrigin(t.tx, t.ty, S);
      for (const ft of tilesInRect(o.x * r, o.y * r, (o.x + S) * r, (o.y + S) * r, Sf)) {
        const k = posKey(zf, ft.tx, ft.ty);
        if (done.has(k) || cache.has(k)) continue;
        done.add(k); cook(zf, ft.tx, ft.ty, nowMs); n += 1;
      }
      others.push(t);
    }
  } else {
    for (const t of holes) {
      if (performance.now() - t0 > PYR.holeCapMs) break;
      cook(zc, t.tx, t.ty, nowMs); n += 1;
    }
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
      drawPart(ctx, e, o.x, o.y, o.x + S, o.y + S, s, org, dpr);
      e.last = nowMs;
      if (fresh(e)) hits += 1; else replis += 1;
    } else {
      if (!levels) levels = cachedLevelsNear(z);
      if (drawFallback(ctx, z, t.tx, t.ty, S, zoom, org, dpr, levels)) replis += 1; else trous += 1;
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
  // Diagnostic du lot 3 : combien d'entrées portent la signature courante, combien
  // ont été re-jugées fraîches sur leurs cellules, combien attendent leur jugement.
  { let memeSig = 0, rejugees = 0, aJuger = 0; for (const e of cache.values()) { if (e.sig === sigCur) memeSig += 1; else if (e.chk === sigCur) rejugees += 1; else aJuger += 1; }
    solPyramideStats.dernier.sig = sigCur.slice(0, 24); solPyramideStats.dernier.memeSig = memeSig; solPyramideStats.dernier.rejugees = rejugees; solPyramideStats.dernier.aJuger = aJuger;
    solPyramideStats.dernier.suf = sufCur; solPyramideStats.dernier.epoch = epoch; }
  return true;
}

export function solPyramideReset() { cache.clear(); bytes = 0; costMs.clear(); }

if (typeof globalThis !== 'undefined') {
  globalThis.__solPyramideTune = (o) => { if (o) Object.assign(PYR, o); return { ...PYR }; };
  globalThis.__solPyramideReset = solPyramideReset;
}
// Bornes connues du module (documentation vivante) : les niveaux vont de ZOOM_MIN à ZOOM_MAX.
export const SOL_PYRAMIDE_LEVELS = { min: ZOOM_MIN, max: ZOOM_MAX };
