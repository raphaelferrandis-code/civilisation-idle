import { CM } from './layout.js';

/* ============================================================================
 * COUCHE DE LUMIÈRE OCCULTÉE — « les halos doivent respecter la perspective ».
 *
 * Les mâts sont rangés dans le tri peintre (computeIsoLamps publie leur clé de
 * profondeur) : un lampadaire caché derrière une maison disparaît bien derrière
 * elle. Leur HALO, lui, était peint en fin de frame, à plat, par-dessus toute la
 * scène — donc par-dessus les bâtiments situés DEVANT le mât. Résultat : une
 * façade traversée par la lueur d'une lampe qu'on ne voit même pas, et le
 * bâtiment qui a l'air transparent.
 *
 * ⚠ ON NE PEUT PAS SIMPLEMENT PEINDRE LE HALO À SA PLACE DANS LE TRI. Le voile
 * de nuit passe APRÈS la scène vivante : une lumière posée avant se fait manger
 * ET refroidir par le multiply « heure bleue » (cf. flameGlow.js, la leçon y est
 * écrite en toutes lettres). D'où cette couche :
 *
 *   1. pendant la passe vivante, chaque lampe DÉPOSE son halo dans un calque
 *      transparent, à l'instant exact où le tri peintre la dessine ;
 *   2. tout ce qui est dessiné APRÈS (donc DEVANT) découpe sa silhouette dans ce
 *      calque, en `destination-out` — la même image, la même géométrie, donc une
 *      découpe au pixel, pas une boîte approximative ;
 *   3. la passe de nuit blitte le calque en additif, APRÈS le voile.
 *
 * L'ordre du peintre est ainsi respecté sans jamais peindre la lumière avant le
 * voile. Et le mécanisme DÉGRADE PROPREMENT : un site de dessin qui oublie
 * d'appeler `lightCut*` laisse simplement sa lumière passer par-dessus lui,
 * c'est-à-dire l'ancien comportement, jamais un trou noir.
 *
 * Réglage live : window.__lightOcclusion({ on }) — `on:false` rend la main au
 * dessin direct (halos par-dessus tout), pour comparer.
 * ========================================================================== */

// minUnit = taille ÉCRAN d'une tuile (px) sous laquelle on renonce à
// l'occultation. Sous ce seuil un halo fait moins de dix pixels : aucun
// bâtiment ne peut visiblement l'avaler, alors que la découpe, elle, se paie
// sur chaque sprite de la ville — mesuré à +15 ms sur le dézoom d'une mégapole,
// une image déjà lourde. On rend alors la main au dessin direct.
// fine = côté (px) de la grille FINE de l'échappatoire des découpes (0 = coupée) ;
// tight = emprises SERRÉES déclarées par les dépôts (ce que peint vraiment un mât,
// cœurs seuls le jour ; texels allumés des masques de fenêtres et d'émissifs, cf.
// litBox). Audit du 2026-10-05 (PERF-2) : image identique au pixel (vérifiée en jeu,
// rendu logiciel et GPU) ; `__lightOcclusion({ fine: 0, tight: false })` rejoue
// l'ancien chemin (A/B de la mesure).
export const LIGHT_LAYER = { on: true, cell: 64, minUnit: 12, fine: 16, tight: true };
if (typeof window !== 'undefined') {
  window.__lightOcclusion = (o) => { if (o) Object.assign(LIGHT_LAYER, o); return { ...LIGHT_LAYER }; };
}

let buf = null, bctx = null;
let armed = false;          // la passe vivante est en cours : dépôts et découpes actifs
let usable = false;         // le calque a été armé pour CETTE frame (sinon : repli direct)
let suspended = false;      // passe hors écran (silhouette de survol, mesure d'encre)
let painted = false;        // au moins une lumière déposée depuis le début de frame
let needClear = false;      // effacement PARESSEUX : une frame sans lampe ne coûte rien
let glows = 0, cuts = 0, spared = 0;    // diagnostic (window.__lightStats)

// Grilles grossières de COUVERTURE : « y a-t-il de la lumière dans ce coin
// d'écran ? ». Elles servent trois fois, et c'est ce qui rend la couche
// abordable — un plein écran effacé puis reblité coûtait à lui seul ~1 ms alors
// que les halos n'en couvrent qu'une fraction :
//   - échappatoire des découpes (un sprite loin de toute lampe ne paie rien) ;
//   - EFFACEMENT du calque, limité aux cases qui portent de la lumière ;
//   - BLIT final, limité aux cases allumées à CETTE frame.
// `cov` = cases allumées par CETTE frame (blit + échappatoire des découpes).
// `held` = cases qui portent encore de la lumière DANS le calque, tant qu'on ne
// les a pas effacées. Les deux diffèrent dès qu'une frame ne dépose rien : le
// calque garde alors sa vieille lumière (elle n'est pas blitée, donc invisible)
// et il faudra bien l'effacer avant d'en déposer une nouvelle au même endroit.
let cov = null, held = null, cgw = 0, cgh = 0, cell = 64;
// GRILLE FINE (audit du 2026-10-05, PERF-2) : la même question que `cov`, posée à
// 16 px au lieu de 64, et SEULEMENT par l'échappatoire des découpes. Le blit et
// l'effacement restent sur les cases de 64 (en plages : une trentaine d'appels ; à
// 16 px, ce seraient des centaines). Une case de 64 marquée par une lampe faisait
// payer une découpe à tout sprite qui l'effleurait, à 60 px de toute lumière.
// Chaque emprise y est ÉLARGIE de `fpad` : un halo au pixel (vieHalo, arrondi au
// pixel d'art) déborde d'environ 1,5 pixel d'art de l'emprise que déclare son
// appelant. Découper là où il n'y a aucune lumière ne change aucun pixel — en
// sauter une, si : la marge est prise large.
let fin = null, fgw = 0, fgh = 0, fcell = 0, fpad = 0;

function ensureBuf() {
  if (typeof document === 'undefined') return null;
  const dpr = CM.dpr || 1;
  const w = Math.max(1, Math.round((CM.cw || 1) * dpr));
  const h = Math.max(1, Math.round((CM.ch || 1) * dpr));
  if (!buf) {
    buf = document.createElement('canvas');
    bctx = buf.getContext('2d');
    if (!bctx) { buf = null; return null; }
  }
  if (buf.width !== w || buf.height !== h) { buf.width = w; buf.height = h; }
  // Même repère que CM.ctx : les appelants passent des pixels LOGIQUES.
  bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return bctx;
}

function ensureCov() {
  const c = Math.max(16, LIGHT_LAYER.cell | 0);
  const gw = Math.max(1, Math.ceil((CM.cw || 1) / c));
  const gh = Math.max(1, Math.ceil((CM.ch || 1) / c));
  if (!cov || cgw !== gw || cgh !== gh || cell !== c) {
    // Redimensionnement : les cases d'avant ne veulent plus rien dire — et le
    // canvas est réalloué juste à côté (donc vide), il n'y a rien à effacer.
    cov = new Uint8Array(gw * gh); held = new Uint8Array(gw * gh);
    cgw = gw; cgh = gh; cell = c;
  } else cov.fill(0);
  ensureFine();
}

function ensureFine() {
  const c = LIGHT_LAYER.fine | 0;
  if (c <= 0) { fcell = 0; return; }
  const fc = Math.max(4, c);
  const gw = Math.max(1, Math.ceil((CM.cw || 1) / fc));
  const gh = Math.max(1, Math.ceil((CM.ch || 1) / fc));
  if (!fin || fgw !== gw || fgh !== gh || fcell !== fc) {
    fin = new Uint8Array(gw * gh); fgw = gw; fgh = gh; fcell = fc;
  } else fin.fill(0);
  // Débord d'un halo au pixel ≈ 1,5 pixel d'art (≈ 1,7 × zoom) : 4 + 4 × zoom le
  // couvre deux fois, du dézoom (pixel d'art plancher d'un pixel) au zoom maximal.
  const z = (CM.cam && CM.cam.zoom) || 1;
  fpad = 4 + 4 * z;
}

const fineRange = (x0, y0, x1, y1) => ({
  i0: Math.max(0, Math.floor((x0 - fpad) / fcell)), i1: Math.min(fgw - 1, Math.floor((x1 + fpad) / fcell)),
  j0: Math.max(0, Math.floor((y0 - fpad) / fcell)), j1: Math.min(fgh - 1, Math.floor((y1 + fpad) / fcell)),
});

function markFine(x0, y0, x1, y1) {
  if (!fcell) return;
  const r = fineRange(x0, y0, x1, y1);
  for (let j = r.j0; j <= r.j1; j += 1) for (let i = r.i0; i <= r.i1; i += 1) fin[j * fgw + i] = 1;
}

// Sans grille fine (molette fine: 0), la réponse est toujours « peut-être » : la
// découpe ne dépend plus que des cases de 64, comme avant.
function hasFine(x0, y0, x1, y1) {
  if (!fcell) return true;
  const i0 = Math.max(0, Math.floor(x0 / fcell)), i1 = Math.min(fgw - 1, Math.floor(x1 / fcell));
  const j0 = Math.max(0, Math.floor(y0 / fcell)), j1 = Math.min(fgh - 1, Math.floor(y1 / fcell));
  for (let j = j0; j <= j1; j += 1) for (let i = i0; i <= i1; i += 1) if (fin[j * fgw + i]) return true;
  return false;
}

// Parcourt les cases marquées d'une grille en PLAGES horizontales (une case
// isolée = une plage) : ~30 rectangles au lieu de plusieurs centaines d'appels.
function forEachRun(grid, fn) {
  for (let j = 0; j < cgh; j += 1) {
    let i = 0;
    while (i < cgw) {
      if (!grid[j * cgw + i]) { i += 1; continue; }
      let k = i;
      while (k + 1 < cgw && grid[j * cgw + k + 1]) k += 1;
      fn(i * cell, j * cell, (k - i + 1) * cell, cell);
      i = k + 1;
    }
  }
}

const cellRange = (x0, y0, x1, y1) => ({
  i0: Math.max(0, Math.floor(x0 / cell)), i1: Math.min(cgw - 1, Math.floor(x1 / cell)),
  j0: Math.max(0, Math.floor(y0 / cell)), j1: Math.min(cgh - 1, Math.floor(y1 / cell)),
});

function markCov(x0, y0, x1, y1) {
  const r = cellRange(x0, y0, x1, y1);
  for (let j = r.j0; j <= r.j1; j += 1) for (let i = r.i0; i <= r.i1; i += 1) { cov[j * cgw + i] = 1; held[j * cgw + i] = 1; }
}

function hasCov(x0, y0, x1, y1) {
  const r = cellRange(x0, y0, x1, y1);
  for (let j = r.j0; j <= r.j1; j += 1) for (let i = r.i0; i <= r.i1; i += 1) if (cov[j * cgw + i]) return true;
  return false;
}

// ── Cycle de vie ────────────────────────────────────────────────────────────
// Arme le calque au début de la passe vivante. Renvoie false quand il n'est pas
// disponible (molette éteinte, pas de canvas) : l'appelant reprend alors le
// dessin direct des halos dans la passe de nuit.
// `enabled` (facultatif) : l'appelant peut renoncer à l'occultation pour cette
// frame — mais il doit APPELER quand même, sinon `usable` garderait la valeur
// d'une frame précédente et la passe de nuit se croirait déjà servie.
export function beginLightLayer(enabled) {
  armed = false; usable = false; suspended = false; painted = false;
  glows = 0; cuts = 0; spared = 0;
  if (enabled === false || !LIGHT_LAYER.on) return false;
  if (!ensureBuf()) return false;
  ensureCov();
  needClear = true;
  armed = true; usable = true;
  return true;
}

export function endLightLayer() { armed = false; }

// Carte DÉMONTÉE (resetCityMapRuntime ; audit du 05/10, MEM-8) : le calque est un
// plein écran de cw × ch × dpr² — 12 Mo à dpr 1 sur ~2 400 × 1 300, 28 Mo à 1,5 —,
// effacé et repeint à chaque frame : rien à y garder pendant que le joueur est sur
// un autre onglet. Largeur nulle = mémoire rendue tout de suite, sans attendre le
// ramasse-miettes. ensureBuf et ensureCov réallouent à la demande, grilles vides
// comme le canvas neuf (il n'y reste aucune lumière à effacer).
export function releaseLightLayer() {
  if (buf) { buf.width = 0; buf.height = 0; }
  buf = null; bctx = null;
  cov = null; held = null; fin = null;
  armed = false; usable = false; suspended = false; painted = false; needClear = false;
}

// Passe hors écran (silhouette dorée du survol, mesure d'encre d'une scène) :
// elle redessine la scène dans un canvas AUXILIAIRE, avec ses propres
// coordonnées. Une découpe y serait faite au mauvais endroit — et une lumière
// déposée, purement fantôme.
export function suspendLightLayer(on) { suspended = !!on; }

export const lightLayerArmed = () => armed && !suspended;

// ── Dépôt d'une lumière ─────────────────────────────────────────────────────
// Renvoie le contexte du calque (déjà en additif) ou null si le calque n'est pas
// disponible. (x0,y0)-(x1,y1) = emprise écran de la lumière, utilisée pour la
// grille de couverture : c'est elle qui décide quels sprites paieront une découpe.
export function lightCtx(x0, y0, x1, y1) {
  if (!armed || suspended) return null;
  if (x1 < 0 || y1 < 0 || x0 > (CM.cw || 0) || y0 > (CM.ch || 0)) return null;
  if (needClear) {
    // Effacement CIBLÉ, et seulement au PREMIER dépôt : le reste du calque n'a
    // jamais été touché. `held` recense ce qui porte encore de la lumière.
    forEachRun(held, (x, y, w, h) => bctx.clearRect(x, y, w, h));
    held.fill(0);
    needClear = false;
  }
  markCov(x0, y0, x1, y1);
  markFine(x0, y0, x1, y1);
  painted = true; glows += 1;
  bctx.globalCompositeOperation = 'lighter';
  bctx.globalAlpha = 1;
  return bctx;
}

// ── Masque dont seule une partie s'allume (fenêtres, émissifs) ──────────────
// Le masque a la taille du sprite, mais seuls quelques texels portent de la
// lumière : seule l'EMPRISE déclarée à lightCtx se resserre sur les texels
// allumés [u0, u1[ × [v0, v1[ (repère de la source, échelle kx, ky depuis
// (dx, dy)), calée sur la grille device avec un pixel de marge. LE BLIT, LUI, NE
// CHANGE PAS — même image, même rectangle, aucun clip. Deux essais mesurés au
// pixel le 2026-10-05 l'ont exigé : un masque ROGNÉ posé par une transformation
// pourtant équivalente décalait d'un texel des colonnes entières de vitres (les
// arrondis tombent autrement), et un CLIP sur l'emprise faisait de même sur GPU
// (Skia y recoupe le quad et recalcule ses coordonnées de texture).
export function litBox(dx, dy, kx, ky, u0, v0, u1, v1) {
  const d = CM.dpr || 1;
  return {
    x0: (Math.floor((dx + u0 * kx) * d) - 1) / d, y0: (Math.floor((dy + v0 * ky) * d) - 1) / d,
    x1: (Math.ceil((dx + u1 * kx) * d) + 1) / d, y1: (Math.ceil((dy + v1 * ky) * d) + 1) / d,
  };
}

// ── Découpe : ce qui passe DEVANT efface la lumière déposée avant lui ───────
// Généraliste : `fn(lctx)` trace la silhouette, le composite est déjà posé.
// (x0,y0)-(x1,y1) = emprise écran, pour l'échappatoire « aucune lumière ici ».
export function lightCut(x0, y0, x1, y1, fn) {
  if (!armed || suspended || !painted) return false;
  if (!hasCov(x0, y0, x1, y1)) return false;
  if (!hasFine(x0, y0, x1, y1)) { spared += 1; return false; }
  bctx.save();
  bctx.globalCompositeOperation = 'destination-out';
  bctx.globalAlpha = 1;
  bctx.imageSmoothingEnabled = false;
  // ⚠ En 'destination-out' c'est l'ALPHA de la source qui efface. Le dernier
  // fillStyle posé sur ce contexte est un DÉGRADÉ de halo (alpha → 0 au bord) :
  // le laisser en place ne découperait qu'un fantôme. Opaque, donc.
  bctx.fillStyle = '#000';
  try { fn(bctx); } finally { bctx.restore(); }
  cuts += 1;
  return true;
}

// Cas courant : la silhouette EST le sprite qu'on vient de blitter. Les quatre
// derniers arguments (rectangle source) sont facultatifs, comme pour drawImage.
// Le garde de lightCut, AVANT de fabriquer la fermeture (audit du 05/10, PERF-46) :
// de jour, ou sans lumière déposée, chaque arbre, buisson ou moulin en allouait une.
export function lightCutImage(img, dx, dy, dw, dh, sx, sy, sw, sh) {
  if (!armed || suspended || !painted || !img || !(dw > 0) || !(dh > 0)) return false;
  return lightCut(dx, dy, dx + dw, dy + dh, (lc) => {
    if (sw == null) lc.drawImage(img, dx, dy, dw, dh);
    else lc.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  });
}

// Le même garde, pour l'appelant qui doit fabriquer sa propre silhouette (plusieurs
// blits : le vent dans les arbres, cf. isoLivePaint) — sans fermeture de jour.
export const lightCutLive = () => armed && !suspended && painted;

// ── Rendu du calque ─────────────────────────────────────────────────────────
// À appeler dans la passe de nuit, APRÈS le voile. Renvoie true si le calque a
// pris en charge les lumières de cette frame (même s'il n'y en avait aucune) —
// false = repli, l'appelant doit peindre lui-même.
export function paintLightLayer(ctx) {
  if (!usable) return false;
  if (painted && ctx && buf) {
    const prevOp = ctx.globalCompositeOperation, prevA = ctx.globalAlpha;
    const prevSm = ctx.imageSmoothingEnabled;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;             // blit 1:1, aucun rééchantillonnage
    const d = CM.dpr || 1;
    // Case par case, jamais deux fois la même : en additif, un pixel blité deux
    // fois doublerait sa lumière (c'est pourquoi on découpe en PLAGES de cases
    // disjointes et non en rectangles englobants qui pourraient se chevaucher).
    forEachRun(cov, (x, y, w, h) => {
      ctx.drawImage(buf, x * d, y * d, w * d, h * d, x, y, w, h);
    });
    ctx.globalAlpha = prevA;
    ctx.globalCompositeOperation = prevOp;
    ctx.imageSmoothingEnabled = prevSm;
  }
  painted = false;
  return true;
}

// Diagnostic (window.__lightStats()) : nombre de lumières déposées et de
// silhouettes découpées à la dernière passe vivante ; `spared` = découpes que
// les cases de 64 auraient fait payer et que la grille fine a épargnées.
export const lightLayerStats = () => ({ armed, usable, glows, cuts, spared });
if (typeof window !== 'undefined') window.__lightStats = lightLayerStats;
