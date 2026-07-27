"use strict";

// CACHE DES SCÈNES DE BÂTIMENTS-MOTEUR — étape 1 du chantier rendu (2026-07-27).
// Une scène d'atelier est DÉTERMINISTE à (id, tier, ère, nuit quantifiée,
// échelle) égaux : aucun aléa par instance (le jitter est appliqué en amont,
// drawIsoEngineScene), aucun cmHash/Math.random dans le dessin — vérifié par
// l'anatomie du 27/07. On cuit donc l'image UNE fois et toutes les instances la
// blittent, au lieu de rejouer murs/toits/props en vectoriel à chaque frame
// (mesuré : 3,3 ms/frame à dézoom 0,4, ~36 % de la passe de peinture).
//
// TROIS PLANS, découpés par le paramètre `pass` de drawEngineSprite :
//   back  (statique de fond)  → CUIT, blitté d'abord ;
//   anim  (flammes, humains, lueurs — lit `now` ou cam.zoom) → EN DIRECT ;
//   front (statique d'avant-plan : brouettes, cagettes…)     → CUIT, blitté après.
//
// MÉCANISME DE CUISSON : l'échange de CM.ctx — la garantie est documentée dans
// isoRenderer (drawIsoEngineOutline) : drawEngineSpriteCore lit CM.ctx UNE fois
// en tête, l'échanger le temps du tracé redirige la scène entière, props compris.
// flameGlow et lightLayer sont suspendus pendant la cuisson (mêmes gardes que
// les deux passes hors écran existantes : mesure d'encre, silhouette de survol).
//
// OCCULTATION : en direct, chaque blitProp découpe sa silhouette dans le calque
// de lumière. Ici, UNE découpe de la silhouette du canvas cuit la remplace —
// plus précise même (le vectoriel ne découpait rien du tout).
//
// Molette : window.__engineSceneCache = false → dessin direct intégral (A/B de
// vérification par paires de captures, même recette que __isoCullOff).

import { CM } from './layout.js';
import { drawEngineSprite } from './engineSprites.js';
import { getPropVersion } from './cityEngineSprites.js';
import { suspendFlameGlow } from './flameGlow.js';
import { suspendLightLayer, lightCutImage } from './lightLayer.js';

const cache = new Map(); // clé -> { back, front, mx, myT, side, dpr, at }

// Échelle EXACTE, quantifiée au demi-pixel : cuire à une autre échelle puis
// re-blitter introduirait un second rééchantillonnage nearest — du pixel-art
// « croqué » deux fois, et 44 000 px d'écart mesurés au diff strict avec le
// dessin direct. Au demi-pixel près, la cuisson rejoue les MÊMES appels aux
// MÊMES coordonnées : la qualité est identique par construction. Le jitter
// d'échelle (17 valeurs par id) multiplie les entrées — d'où le LRU généreux.
const BW_QUANT = 2; // clé = round(bw × 2) / 2
// Au-delà de ce côté logique (très gros zoom sur une halle), on dessine en
// direct : peu de bâtiments simultanés à ce zoom, et le canvas pèserait des Mo.
const SIDE_CAP = 512;
// Marges de débordement : haut pour les tours (H = 1.72·sh, base 0.95·sh chez
// blitCosmicTower), latéral pour les props à wFrac > 1 (ports, moulins).
const MARGIN_X_K = 0.35;
const MARGIN_TOP_K = 0.85;
const MARGIN_BOT_K = 0.15;
const MAX_ENTRIES = 288; // LRU — ids × jitter (17 échelles) à une ère/zoom donnés

// ⚠ OPT-IN pour l'instant (window.__engineSceneCache = true pour l'essayer) :
// le gain à zoom stable est prouvé (scènes −38 à −51 % en A/B à conditions
// égales), mais le coût d'UNE cuisson (~15-25 ms mesurés, cause non élucidée —
// Proxy espion ? création des deux canvas ?) rend les re-cuissons de l'aube et
// des changements d'ère trop visibles. À dompter avant d'inverser le défaut.
const enabled = () => typeof window !== 'undefined' && window.__engineSceneCache === true;

// GARDE-FOUS ANTI-TEMPÊTE. Un cran de zoom change l'échelle de TOUTES les
// scènes : chaque instance raterait le cache à chaque frame du geste — mesuré
// 45,8 ms/frame de cuissons en rafale, pire que le dessin direct (même piège
// que le sol avant son accalmie). Deux parades :
//  1. pendant un geste de zoom (échelle instable depuis < ZOOM_SETTLE_MS), le
//     cache s'efface : dessin direct, comme avant ;
//  2. jamais plus de MAX_BAKES_PER_FRAME cuissons par frame (changement d'ère,
//     pas de nuit) — les instances au-delà dessinent direct CETTE frame et se
//     cuisent aux suivantes : l'aube coûte quelques frames étalées, pas un gel.
const ZOOM_SETTLE_MS = 180;
const MAX_BAKES_PER_FRAME = 8;
let lastZoom = 0;
let zoomStableAt = 0;
let frameStamp = -1;
let bakesThisFrame = 0;

function sceneKey(t, side) {
  const id = t.buildingId || t.variant || '?';
  const band = (CM.layout && CM.layout.counts && CM.layout.counts.eraBand) | 0;
  const ei = (CM.layout && CM.layout.counts && CM.layout.counts.eraIndex) | 0;
  // Nuit QUANTIFIÉE au dixième (précédent : clé du bake des quais) — litWarm et
  // litGold en dérivent, les fenêtres allumées suivent par re-cuisson.
  const nightQ = (CM.nightF || 0).toFixed(1);
  return id + ':' + (t.tier || 0) + ':' + band + ':' + ei + ':' + nightQ + ':' + side
    + ':' + (t.spanX || 1) + 'x' + (t.spanY || 1) + ':' + getPropVersion();
}

// Espion de contexte : marque `flag.drew` au premier VRAI tracé — sert à ne pas
// blitter (ni garder) un plan `front` vide, le cas de la majorité des scènes.
const PAINT_METHODS = new Set(['drawImage', 'fill', 'fillRect', 'stroke', 'strokeRect', 'fillText']);
function spyCtx(real, flag) {
  return new Proxy(real, {
    get(o, k) {
      const v = o[k];
      if (typeof v !== 'function') return v;
      return (...a) => { if (PAINT_METHODS.has(k)) flag.drew = true; return v.apply(o, a); };
    },
    set(o, k, val) { o[k] = val; return true; },
  });
}

function mkCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// Cuit les deux plans statiques d'une scène à l'échelle `side` (px logiques).
// Renvoie null si la cuisson échoue — l'appelant retombe sur le dessin direct
// (et la quarantaine existante de drawIsoEngineScene fera son travail).
function bake(t, side, now) {
  const dpr = CM.dpr || 1;
  const mx = Math.ceil(side * MARGIN_X_K);
  const myT = Math.ceil(side * MARGIN_TOP_K);
  const myB = Math.ceil(side * MARGIN_BOT_K);
  const w = side + 2 * mx, h = side + myT + myB;
  const prevCtx = CM.ctx;
  suspendFlameGlow(true);
  suspendLightLayer(true);
  try {
    const backCv = mkCanvas(Math.round(w * dpr), Math.round(h * dpr));
    const bctx = backCv.getContext('2d');
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bctx.imageSmoothingEnabled = false;
    CM.ctx = bctx;
    drawEngineSprite(t, mx, myT, side, side, now, 'back');

    const frontFlag = { drew: false };
    const frontCv = mkCanvas(Math.round(w * dpr), Math.round(h * dpr));
    const fctx = frontCv.getContext('2d');
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fctx.imageSmoothingEnabled = false;
    CM.ctx = spyCtx(fctx, frontFlag);
    drawEngineSprite(t, mx, myT, side, side, now, 'front');

    return { back: backCv, front: frontFlag.drew ? frontCv : null, mx, myT, side, dpr, at: now };
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[scene-cache] cuisson échouée:', t.buildingId || t.variant, e);
    return null;
  } finally {
    CM.ctx = prevCtx;
    suspendFlameGlow(false);
    suspendLightLayer(false);
  }
}

function prune() {
  if (cache.size <= MAX_ENTRIES) return;
  let oldest = null, oldestAt = Infinity;
  for (const [k, e] of cache) if (e.at < oldestAt) { oldestAt = e.at; oldest = k; }
  if (oldest) cache.delete(oldest);
}

// Vide le cache (changement de préréglage qualité, tests). Exposé pour les hooks.
export function resetEngineSceneCache() { cache.clear(); }

// Dessine la scène de `t` via le cache : back cuit → animé en direct → front
// cuit. Renvoie false si le cache ne peut pas servir (molette off, échelle hors
// bornes, cuisson échouée) — l'appelant dessine alors en direct comme avant.
export function drawCachedEngineScene(ctx, t, bx, by, bw, now) {
  if (!enabled()) return false;
  const nowMs = performance.now();
  const z = CM.cam.zoom;
  if (z !== lastZoom) { lastZoom = z; zoomStableAt = nowMs; }
  // Geste de zoom en cours : direct (la capture, elle, reste déterministe).
  if (!CM.capture && nowMs - zoomStableAt < ZOOM_SETTLE_MS) return false;
  const side = Math.round(bw * BW_QUANT) / BW_QUANT;
  if (side <= 0 || side > SIDE_CAP) return false;
  const key = sceneKey(t, side);
  let e = cache.get(key);
  if (!e) {
    if (now !== frameStamp) { frameStamp = now; bakesThisFrame = 0; }
    if (!CM.capture && bakesThisFrame >= MAX_BAKES_PER_FRAME) return false;
    bakesThisFrame += 1;
    e = bake(t, side, now);
    if (!e) return false;
    cache.set(key, e);
    prune();
  }
  e.at = now;
  // Blit 1:1 (aucun rééchantillonnage) : le canvas cuit inclut ses marges.
  const dw = e.back.width / e.dpr, dh = e.back.height / e.dpr;
  const dx = bx - e.mx, dy = by - e.myT;
  const prevSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(e.back, dx, dy, dw, dh);
  // Occultation du calque de lumière : la silhouette du plan cuit remplace les
  // découpes par prop du chemin direct.
  lightCutImage(e.back, dx, dy, dw, dh);
  ctx.imageSmoothingEnabled = prevSmooth;
  // L'ANIMÉ en direct, entre les deux plans — flammes, humains, lueurs. Ses
  // propres blitProp/blitAnim continuent d'alimenter flameGlow et lightLayer.
  drawEngineSprite(t, bx, by, bw, bw, now, 'anim');
  if (e.front) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(e.front, dx, dy, dw, dh);
    lightCutImage(e.front, dx, dy, dw, dh);
    ctx.imageSmoothingEnabled = prevSmooth;
  }
  return true;
}
