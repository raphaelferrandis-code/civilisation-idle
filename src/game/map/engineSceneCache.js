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
// isoEngineScene (drawIsoEngineOutline) : drawEngineSpriteCore lit CM.ctx UNE fois
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
// LRU à BUDGET D'OCTETS et non à compte d'entrées : au dézoom, les combinaisons
// vivantes (ids × tiers × 17 échelles de jitter) approchent le millier — un
// plafond à 288 entrées évinçait en boucle (61 re-cuissons mesurées par
// échantillon de 12 frames). Or c'est justement au dézoom que les entrées
// rognées sont minuscules (~10-30 ko) : le budget mémoire est le bon curseur —
// beaucoup de petites entrées au dézoom, peu de grosses au zoom serré.
const MAX_ENTRIES = 1024;
const BYTE_BUDGET = 48 * 1024 * 1024;
let cacheBytes = 0;

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

// ÉPOQUE globale (ère, nuit quantifiée, version des props) : calculée UNE fois
// par frame — huit concaténations de chaîne PAR SCÈNE PAR FRAME pesaient plus
// que le dessin direct d'une petite scène. La clé complète est mémoïsée sur la
// TUILE (objet layout persistant) et ne se reconstruit qu'au changement
// d'époque ou d'échelle.
let epochStamp = -1;
let epochStr = '';
function currentEpoch(now) {
  if (now !== epochStamp) {
    epochStamp = now;
    const band = (CM.layout && CM.layout.counts && CM.layout.counts.eraBand) | 0;
    const ei = (CM.layout && CM.layout.counts && CM.layout.counts.eraIndex) | 0;
    // Nuit QUANTIFIÉE au dixième (précédent : clé du bake des quais) — litWarm
    // et litGold en dérivent, les fenêtres allumées suivent par re-cuisson.
    // La SAISON entre dans l'époque depuis la neige des toits (snowRoof.js) :
    // une scène cuite en été et rejouée en hiver garderait ses tuiles sèches au
    // milieu d'une ville blanche. Un entier de plus, quatre valeurs, aucun coût.
    epochStr = band + ':' + ei + ':' + (CM.nightF || 0).toFixed(1) + ':' + (CM.season | 0) + ':' + getPropVersion();
  }
  return epochStr;
}

function sceneKey(t, side, now) {
  const ep = currentEpoch(now);
  if (t._scnEp === ep && t._scnSide === side) return t._scnKey;
  const id = t.buildingId || t.variant || '?';
  t._scnEp = ep;
  t._scnSide = side;
  // ⚠ `size` en repli : les moteurs CARRÉS (halle + ateliers) portent leur
  // empreinte dans `size`, pas dans spanX/spanY — sans lui la clé disait « 1x1 »
  // pour tout le monde et ne tenait que par `side`, qui se confond d'un zoom à
  // l'autre. Une halle et un atelier pouvaient alors partager une scène cuite,
  // et donc le sprite de PALIER (substitué sur l'empreinte, cf. palierImg).
  const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
  t._scnKey = id + ':' + (t.tier || 0) + ':' + side + ':' + sx + 'x' + sy + ':' + ep;
  return t._scnKey;
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

// BROUILLON DE MESURE D'ENCRE — persistant, marqué willReadFrequently : le
// getImageData y est une lecture CPU bon marché. ⚠ Ne JAMAIS lire les canvas
// définitifs : un getImageData les fait basculer en rendu logiciel et chaque
// blit de frame les re-téléverse — mesuré : cuisson ×35 (0,1 → 3,7 ms) et
// régime établi dégradé. Les plans gardés sont dessinés DIRECTEMENT à la
// taille rognée (un dessin de scène coûte 0,014 ms — le rejouer est gratuit).
let scratch = null;
let sctx = null;
function ensureScratch(w, h) {
  if (!scratch || scratch.width < w || scratch.height < h) {
    const W = Math.max(w, scratch ? scratch.width : 0);
    const H = Math.max(h, scratch ? scratch.height : 0);
    scratch = mkCanvas(W, H);
    sctx = scratch.getContext('2d', { willReadFrequently: true });
  }
  return sctx;
}

// Bbox de l'encre (alpha > 8) d'une région du brouillon — même geste que le
// rognage des teintes de maisons (pixelHouses). Payé une fois à la cuisson :
// chaque frame re-blitte ensuite un canvas SANS pixels vides (les marges de
// débordement, ×1,7 en aire, pesaient plus que le dessin direct des petites
// scènes).
function inkBBoxOfScratch(W, H) {
  const d = sctx.getImageData(0, 0, W, H).data;
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    let i = (y * W) * 4 + 3;
    for (let x = 0; x < W; x++, i += 4) {
      if (d[i] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

// Cuit les deux plans statiques d'une scène à l'échelle `side` (px logiques).
// Renvoie null si la cuisson échoue — l'appelant retombe sur le dessin direct
// (et la quarantaine existante de drawIsoEngineScene fera son travail).
// Stats de cuisson (diagnostic) : window.__sceneBakeStats — remises à zéro par
// __sceneBakeStatsReset(). Phases en ms cumulées : canvas (création+contexte),
// backDraw, frontDraw (espion compris). maxTotal repère la pire cuisson.
const bakeStats = { count: 0, canvas: 0, backDraw: 0, frontDraw: 0, total: 0, maxTotal: 0, last: null };
if (typeof window !== 'undefined') {
  window.__sceneBakeStats = bakeStats;
  window.__sceneBakeStatsReset = () => {
    bakeStats.count = 0; bakeStats.canvas = 0; bakeStats.backDraw = 0;
    bakeStats.frontDraw = 0; bakeStats.total = 0; bakeStats.maxTotal = 0; bakeStats.last = null;
  };
}

function bake(t, side, now) {
  const dpr = CM.dpr || 1;
  const mx = Math.ceil(side * MARGIN_X_K);
  const myT = Math.ceil(side * MARGIN_TOP_K);
  const myB = Math.ceil(side * MARGIN_BOT_K);
  const w = side + 2 * mx, h = side + myT + myB;
  const prevCtx = CM.ctx;
  suspendFlameGlow(true);
  suspendLightLayer(true);
  const t0 = performance.now();
  try {
    // 1) MESURE : les deux plans dessinés sur le brouillon (union d'encre),
    //    le front sous espion pour savoir s'il existe.
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    ensureScratch(W, H);
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, W, H);
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sctx.imageSmoothingEnabled = false;
    const t1 = performance.now();
    CM.ctx = sctx;
    drawEngineSprite(t, mx, myT, side, side, now, 'back');
    const frontFlag = { drew: false };
    CM.ctx = spyCtx(sctx, frontFlag);
    drawEngineSprite(t, mx, myT, side, side, now, 'front');
    const t2 = performance.now();
    const bb = inkBBoxOfScratch(W, H);
    const t3 = performance.now();

    // 2) CUISSON DÉFINITIVE, directement à la taille rognée — ces canvas ne
    //    subissent JAMAIS de lecture, ils restent accélérés.
    let entry;
    if (!bb) {
      // Scène encore VIDE (props pas décodés) : rien à blitter, l'animé reste
      // en direct, le bump de propVersion (dans l'époque de la clé) re-cuira.
      entry = { empty: true, side, dpr, at: now };
    } else {
      const pad = Math.max(1, Math.round(dpr));
      const tw = bb.x1 - bb.x0 + 1 + 2 * pad, th = bb.y1 - bb.y0 + 1 + 2 * pad;
      const mkPlane = (pass, flag) => {
        const cv = mkCanvas(tw, th);
        const cctx = cv.getContext('2d');
        // Translation PHYSIQUE : la scène se dessine décalée pour tomber
        // exactement dans le cadre rogné.
        cctx.setTransform(dpr, 0, 0, dpr, (pad - bb.x0) , (pad - bb.y0));
        cctx.imageSmoothingEnabled = false;
        CM.ctx = flag ? spyCtx(cctx, flag) : cctx;
        drawEngineSprite(t, mx, myT, side, side, now, pass);
        return cv;
      };
      const back = mkPlane('back', null);
      const front = frontFlag.drew ? mkPlane('front', null) : null;
      entry = {
        back, front,
        // Décalage du blit en px LOGIQUES : position du coin rogné dans la
        // boîte (bx, by) demandée par le peintre.
        ox: (bb.x0 - pad) / dpr - mx,
        oy: (bb.y0 - pad) / dpr - myT,
        side, dpr, at: now,
      };
    }
    const t4 = performance.now();
    const t5 = t4;

    // Phases re-mappées sur les champs existants : canvas = préparation du
    // brouillon + canvas définitifs ; backDraw = dessins sur brouillon ;
    // frontDraw = scan d'encre (getImageData CPU).
    bakeStats.count += 1;
    bakeStats.canvas += (t1 - t0) + (t4 - t3);
    bakeStats.backDraw += t2 - t1;
    bakeStats.frontDraw += t3 - t2;
    bakeStats.total += t5 - t0;
    if (t5 - t0 > bakeStats.maxTotal) {
      bakeStats.maxTotal = t5 - t0;
      bakeStats.last = (t.buildingId || t.variant || '?') + '@' + side;
    }

    return entry;
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[scene-cache] cuisson échouée:', t.buildingId || t.variant, e);
    return null;
  } finally {
    CM.ctx = prevCtx;
    suspendFlameGlow(false);
    suspendLightLayer(false);
  }
}

function entryBytes(e) {
  if (e.empty) return 64;
  return e.back.width * e.back.height * 4 + (e.front ? e.front.width * e.front.height * 4 : 0);
}

function prune() {
  while (cache.size > MAX_ENTRIES || cacheBytes > BYTE_BUDGET) {
    let oldest = null, oldestAt = Infinity;
    for (const [k, e] of cache) if (e.at < oldestAt) { oldestAt = e.at; oldest = k; }
    if (!oldest) return;
    cacheBytes -= entryBytes(cache.get(oldest));
    cache.delete(oldest);
  }
}

// Vide le cache (changement de préréglage qualité, tests). Exposé pour les hooks.
export function resetEngineSceneCache() { cache.clear(); cacheBytes = 0; }

// Dessine la scène de `t` via le cache : back cuit → animé en direct → front
// cuit. Renvoie false si le cache ne peut pas servir (molette off, échelle hors
// bornes, cuisson échouée) — l'appelant dessine alors en direct comme avant.
//
// DEUX TEMPS, et la distinction est structurelle (cf. engineAnim.js) :
//   `now`     — temps de la FRAME. Il pilote la clé de cache et la fraîcheur LRU.
//               ⚠ Il DOIT rester commun à toutes les instances : `currentEpoch`
//               se mémoïse dessus, un temps par instance la ferait recalculer par
//               scène — précisément les huit concaténations par scène et par
//               frame que la mémoïsation avait supprimées.
//   `animNow` — temps propre à l'INSTANCE (décalé), pour la seule passe animée.
//               Les plans cuits n'en ont que faire : ils ne lisent pas `now` (un
//               bloc qui le lit est classé 'anim' par la doctrine du découpage).
export function drawCachedEngineScene(ctx, t, bx, by, bw, now, animNow = now) {
  if (!enabled()) return false;
  const nowMs = performance.now();
  const z = CM.cam.zoom;
  if (z !== lastZoom) { lastZoom = z; zoomStableAt = nowMs; }
  // Geste de zoom en cours : direct (la capture, elle, reste déterministe).
  if (!CM.capture && nowMs - zoomStableAt < ZOOM_SETTLE_MS) return false;
  const side = Math.round(bw * BW_QUANT) / BW_QUANT;
  if (side <= 0 || side > SIDE_CAP) return false;
  const key = sceneKey(t, side, now);
  let e = cache.get(key);
  if (!e) {
    if (now !== frameStamp) { frameStamp = now; bakesThisFrame = 0; }
    if (!CM.capture && bakesThisFrame >= MAX_BAKES_PER_FRAME) return false;
    bakesThisFrame += 1;
    e = bake(t, side, now);
    if (!e) return false;
    cache.set(key, e);
    cacheBytes += entryBytes(e);
    prune();
  }
  e.at = now;
  if (!e.empty) {
    // Blit 1:1 (aucun rééchantillonnage) d'un canvas ROGNÉ sur son encre.
    const dw = e.back.width / e.dpr, dh = e.back.height / e.dpr;
    const dx = bx + e.ox, dy = by + e.oy;
    const prevSmooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(e.back, dx, dy, dw, dh);
    // Occultation du calque de lumière : la silhouette du plan cuit remplace
    // les découpes par prop du chemin direct.
    lightCutImage(e.back, dx, dy, dw, dh);
    // L'ANIMÉ en direct, entre les deux plans — flammes, humains, lueurs. Ses
    // propres blitProp/blitAnim continuent d'alimenter flameGlow et lightLayer.
    ctx.imageSmoothingEnabled = prevSmooth;
    drawEngineSprite(t, bx, by, bw, bw, animNow, 'anim');
    if (e.front) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(e.front, dx, dy, dw, dh);
      lightCutImage(e.front, dx, dy, dw, dh);
      ctx.imageSmoothingEnabled = prevSmooth;
    }
  } else {
    // Scène (encore) vide : seul l'animé se dessine — le repli procédural
    // intégral reviendrait re-payer le vectoriel qu'on cherche à éviter, et la
    // re-cuisson arrive au prochain décodage (propVersion dans l'époque).
    drawEngineSprite(t, bx, by, bw, bw, animNow, 'anim');
  }
  return true;
}
