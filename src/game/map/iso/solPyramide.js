"use strict";
// ── LE SOL EN PYRAMIDE DE TUILES ─────────────────────────────────────────────
//
// docs/PLAN-SOL-PYRAMIDE.md fait foi. Ce module reçoit la pyramide lot par lot.
//
// Depuis le lot 4 (2026-09-14) le sol en tuiles est LE chemin : l'ancien cache
// plein écran d'isoGroundBake.js a été retiré, la molette d'A/B avec lui.
//   __solPyramideStats          cuites, ms, hits, replis étirés, sales, mémoire
//
// Ce module porte LA TUILE (lot 1) : la géométrie (fonctions pures, testées) et
// la cuisson d'UNE tuile par `drawIsoGround`, ancrée MONDE. Le rendu par tuiles
// dans la frame (cache, budget, anneau) vit dans solPyramideFrame.js depuis le
// lot 2. La PREUVE du lot 1 reste ici : le banc `solPyramideAB` (dev) compare, à
// caméra identique, le sol en tuiles au sol plein, et le sol en tuiles à lui-même
// sur une grille décalée d'une demi-tuile — l'invariance à la découpe, c'est la
// couture mesurée.
//
// L'ESPACE DES TUILES. `worldToScreen(p) = tileSpace(p) − camSpace(cam) + centre`
// (cf. projection.js) : tout point du monde a une position FIXE dans « l'écran à
// caméra nulle », `tileSpace`, et la caméra n'est qu'une translation. C'est là
// que vivent les tuiles : la tuile (tx, ty) du niveau z couvre
// [tx·S, (tx+1)·S) × [ty·S, (ty+1)·S) de cet espace, S = 256 px DEVICE (S/dpr en
// px CSS). Sa clé ne dépend donc jamais de la caméra.
//
// LA CUISSON. On pose `CM.cam` sur le point du monde dont camSpace tombe au
// CENTRE de la tuile, `CM.cw/ch` sur S + 2G (G = gouttière d'une cellule : les
// franges d'herbe mordent, les faces débordent — le clip au blit ne garde que
// S), `CM.ctx` sur le canvas de la tuile, et `drawIsoGround()` fait le reste :
// il cuit déjà une zone quelconque (c'est ce que les tranches lui demandent).
// ⚠ Deux ancrages sinon coutures : (1) l'origine de la tuile est ENTIÈRE dans
// tileSpace, donc les cellules se rastérisent sur la même grille quelle que soit
// la tuile ; (2) le calque de voirie (raster à zoom 1) reçoit l'origine de la
// tuile par `artLayerAnchor` pour que SA grille soit ancrée monde aussi.
// ⚠ Le terrain (amp = 0 par défaut) entre dans tileSpace par worldToScreen, pas
// dans camSpace : cohérent avec la projection, inerte à plat.
import { CM } from '../layout.js';
import { ISO_X, ISO_Y, snapZoom } from './projection.js';
import { terrainZ } from './isoTerrain.js';
import { drawIsoGround } from './isoGroundBake.js';
import { artLayerAnchor } from './isoArtLayer.js';
import { mkCanvas } from '../pixelUtil.js';

export const TILE_PX = 256;                 // côté d'une tuile, en px DEVICE
export const ZOOM_MIN = 0.25, ZOOM_MAX = 3.2;

// Relevé vivant, remis à zéro par la sonde ; rempli à partir du lot 2.
export const solPyramideStats = {
  cuites: 0, cuissonMs: 0, hits: 0, replis: 0, sales: 0, tuilesVisibles: 0, memoMo: 0,
};

// ── Coalescence des invalidations douces (pure) ──────────────────────────────
// Un décodage tardif (tuile, sprite) périme les tuiles cuites sans lui. Au
// chargement ils arrivent en RAFALE : une bascule d'époque par fenêtre suffit.
// ⚠ Mais un décodage tombé DANS la fenêtre ne doit pas être perdu, seulement
// RETENU : jeté, il laissait pour toujours les tuiles cuites entre-temps sans
// lui. Capture de Raph (2026-10-03) : « un point de zoom précis où l'herbe ne
// charge pas » — les tuiles du cran affiché au chargement avaient été cuites
// juste avant le décodage de l'herbe, dont l'invalidation était tombée à moins
// de 250 ms de la précédente ; les autres crans, cuits plus tard, étaient
// justes. `hit` dit s'il faut basculer TOUT DE SUITE ; sinon le décodage est
// mis de côté et `flush` (appelé à chaque frame) le rend dès la fenêtre passée.
export function softCoalescer(windowMs = 250) {
  let at = -1e9, pending = false;
  return {
    hit(now) {
      if (now - at >= windowMs) { at = now; pending = false; return true; }
      pending = true;
      return false;
    },
    flush(now) {
      if (pending && now - at >= windowMs) { at = now; pending = false; return true; }
      return false;
    },
  };
}

// ── Géométrie (pure) ─────────────────────────────────────────────────────────

// Le NIVEAU d'un zoom : le cran de la grille de molette (1/8) immédiatement
// sous lui — pendant un glissement, la tuile de ce niveau s'étire de zoom/z.
export function levelZoom(zoom) {
  const z = snapZoom(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom)), -1);
  return Math.max(ZOOM_MIN, z);
}

// Côté d'une tuile en px CSS, PAR NIVEAU. Mesuré au banc du lot 1 : avec un
// côté fixe de 256, deux découpes du même monde différaient sur 2,5-5,7 % des
// pixels, partout, pas seulement aux frontières. Cause : la caméra de cuisson
// (camForTile) tombait sur des flottants non dyadiques (8·X/n pour z = n/8), et
// worldToScreen — (wx − cam.x) − (wy − cam.y), fois z — arrondissait au dernier
// bit DIFFÉREMMENT d'une tuile à l'autre ; un blit au plus proche voisin posé
// pile sur un demi-pixel bascule alors d'un pixel entier, et une cellule entière
// change. Remède : un côté MULTIPLE DE n (n = 8z), le plus proche de 256 — la
// caméra de chaque tuile devient un demi-entier, exact, et tout le calcul de
// projection est exact pour les coordonnées dyadiques (les cellules le sont).
// Et le côté en px DEVICE doit rester entier (le blit reste 1:1) : S·dpr entier.
// ⚠ Sous z = 0,5, la tuile est de 128 px : au plancher d'une grande ville une
// tuile de 256 px coûtait 17 ms (mesuré, lot 2), plus que le budget d'une
// frame — impossible à découper. À 128 px elle tient dans le budget, et la
// cuisson progresse à chaque frame au lieu d'une tuile toutes les deux.
export function tileSideCss(dpr, z = 1) {
  const d = dpr || 1, n = Math.max(1, Math.round((z || 1) * 8)), base = (z < 0.5 ? TILE_PX / 2 : TILE_PX) / d;
  let best = null, bestErr = Infinity;
  for (let k = Math.max(1, Math.floor(base / n) - 8); k <= Math.ceil(base / n) + 8; k += 1) {
    const S = k * n;
    if (Math.abs(S * d - Math.round(S * d)) > 1e-9) continue;   // côté device entier
    const err = Math.abs(S - base);
    if (err < bestErr) { bestErr = err; best = S; }
  }
  return best != null ? best : Math.round(base / n) * n;
}

// Gouttière : 8 px, constante. Mesuré au lot 2 (grande ville, 3 zooms) : la
// largeur de gouttière ne change PAS la couture (les cellules qui débordent
// dans la tuile sont déjà dessinées grâce au pad de culling de drawIsoGround,
// hw·2 et hh·4, qui suit le zoom) — mais une gouttière d'une cellule (64 px à
// z = 1) faisait cuire 2,25 fois la surface utile : 4,2 ms la tuile contre 2,2.
// Les 8 px couvrent l'antialiasing d'un bord et un trait de joint.
export function gutterCss() { return 8; }

// Position d'un point du monde dans l'écran à caméra nulle (avec son terrain).
export function tileSpace(wx, wy, z) {
  return { x: (wx - wy) * ISO_X * z, y: (wx + wy) * ISO_Y * z - terrainZ(wx, wy) * z };
}
// La part CAMÉRA de worldToScreen (sans terrain) : tileSpace(p) − camSpace(cam) + centre.
export function camSpace(cx, cy, z) {
  return { x: (cx - cy) * ISO_X * z, y: (cx + cy) * ISO_Y * z };
}
// Inverse de camSpace : le point du monde dont la part caméra vaut (sx, sy).
export function camForSpace(sx, sy, z) {
  const a = sx / (ISO_X * z), b = sy / (ISO_Y * z);
  return { x: (b + a) / 2, y: (b - a) / 2 };
}
// Indices de la tuile contenant (sx, sy) d'espace tuile, côté S ; `shift`
// décale la grille (banc d'invariance : une demi-tuile).
export function tileIndex(sx, sy, S, shift = 0) {
  return { tx: Math.floor((sx - shift) / S), ty: Math.floor((sy - shift) / S) };
}
// Origine (coin haut-gauche) de la tuile dans l'espace tuile.
export function tileOrigin(tx, ty, S, shift = 0) { return { x: tx * S + shift, y: ty * S + shift }; }

// La caméra qui cuit la tuile (tx, ty) dans un canvas de côté S + 2G : celle
// dont camSpace tombe au centre du canvas, soit au centre de la tuile.
export function camForTile(tx, ty, S, z, shift = 0) {
  const o = tileOrigin(tx, ty, S, shift);
  return camForSpace(o.x + S / 2, o.y + S / 2, z);
}

// Les tuiles qui couvrent un écran cw×ch (px CSS) à la caméra (cx, cy), niveau z.
export function tilesCovering(cx, cy, z, cw, ch, S, shift = 0) {
  const c = camSpace(cx, cy, z);
  const x0 = c.x - cw / 2, y0 = c.y - ch / 2;
  const a = tileIndex(x0, y0, S, shift), b = tileIndex(x0 + cw - 1e-9, y0 + ch - 1e-9, S, shift);
  const out = [];
  for (let ty = a.ty; ty <= b.ty; ty += 1) for (let tx = a.tx; tx <= b.tx; tx += 1) out.push({ tx, ty });
  return out;
}

// ── La cuisson d'une tuile ───────────────────────────────────────────────────

// (mkCanvas : ../pixelUtil.js.)

// Cuit la tuile (tx, ty) du niveau z dans un canvas de (S + 2G)·dpr px device,
// via drawIsoGround, et renvoie { canvas, G, S, ms }. Restaure TOUT l'état
// qu'elle emprunte (caméra, viewport, cible, ancre du calque), même en cas
// de jet — un bake qui laisse la caméra ailleurs est la pire des pannes muettes.
export function cookTile(z, tx, ty, opts = {}) {
  const dpr = CM.dpr || 1;
  const S = tileSideCss(dpr, z);
  const G = opts.gutter != null ? opts.gutter : gutterCss();
  const shift = opts.shift || 0;
  const side = S + 2 * G;
  const W = Math.round(side * dpr);
  // `opts.canvas` : la toile de l'entrée que cette cuisson remplace (audit du 05/10,
  // PERF-53) — une toile neuve de ~300 Ko par recuisson, l'ancienne laissée au
  // ramasse-miettes : 0,35 ms d'allocation de texture par tuile en GPU, et des dizaines
  // de Mo en suspens après une recuisson d'écran (saison, décodage). Reprise seulement
  // à la même taille et si son contexte sait se REMETTRE À ZÉRO (reset : état par
  // défaut et pixels effacés, comme une toile neuve — vérifié octet pour octet dans
  // Chrome, en logiciel et en GPU, après un usage qui laisse un état sale).
  let canvas = opts.canvas && opts.canvas.width === W && opts.canvas.height === W ? opts.canvas : null;
  let ctx = null;
  if (canvas) {
    ctx = canvas.getContext('2d');
    if (ctx && typeof ctx.reset === 'function') ctx.reset();
    else canvas = null;
  }
  if (!canvas) { canvas = mkCanvas(W, W); ctx = canvas.getContext('2d'); }
  const saved = { x: CM.cam.x, y: CM.cam.y, zoom: CM.cam.zoom, cw: CM.cw, ch: CM.ch, ctx: CM.ctx };
  const cam = camForTile(tx, ty, S, z, shift);
  const o = tileOrigin(tx, ty, S, shift);
  const t0 = performance.now();
  try {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    CM.cam.x = cam.x; CM.cam.y = cam.y; CM.cam.zoom = z;
    CM.cw = side; CM.ch = side; CM.ctx = ctx;
    artLayerAnchor(o.x - G, o.y - G);        // origine du CANVAS dans l'espace tuile
    drawIsoGround();
    // Ce qui se cuit PAR-DESSUS le sol, même caméra (la forêt des niveaux ≤ 0,5,
    // iso/forestBake.js — branchée par solPyramideFrame, ce module ne la connaît pas).
    if (opts.after) opts.after(ctx, cam, side);
  } finally {
    artLayerAnchor(null);
    CM.cam.x = saved.x; CM.cam.y = saved.y; CM.cam.zoom = saved.zoom;
    CM.cw = saved.cw; CM.ch = saved.ch; CM.ctx = saved.ctx;
  }
  const ms = performance.now() - t0;
  solPyramideStats.cuites += 1; solPyramideStats.cuissonMs += ms;
  return { canvas, G, S, ms, tx, ty, z };
}

// Blitte une tuile cuite sur `ctx` (écran cw×ch, caméra cx/cy, zoom courant) :
// la partie utile (sans gouttière), à position DEVICE entière, étirée de
// zoom/z si le zoom courant n'est pas le niveau de la tuile.
export function blitTile(ctx, tile, cx, cy, zoom, cw, ch) {
  const dpr = CM.dpr || 1, S = tile.S, G = tile.G;
  const s = zoom / tile.z;
  const o = tileOrigin(tile.tx, tile.ty, S, tile.shift || 0);
  const c = camSpace(cx, cy, zoom);
  // Coin de la tuile à l'écran : son origine en espace tuile (niveau z), étirée.
  const x = (o.x * s) - c.x + cw / 2, y = (o.y * s) - c.y + ch / 2;
  const snap = (v) => Math.round(v * dpr) / dpr;
  ctx.drawImage(tile.canvas, G * dpr, G * dpr, S * dpr, S * dpr, snap(x), snap(y), S * s, S * s);
}

// ── Le banc du lot 1 (dev) : couture mesurée ─────────────────────────────────
//
// À caméra identique et pour chaque zoom demandé (rabattu sur son cran) :
//   A  = le sol plein d'aujourd'hui (drawIsoGround sur un canvas écran)
//   B  = le sol composé de tuiles (grille ancrée à 0)
//   B2 = le sol composé de tuiles, grille décalée d'une DEMI-tuile
// Un rendu ancré monde est invariant à la découpe : B et B2 doivent être
// IDENTIQUES au pixel — c'est le test de couture. A vs B dit ce que la tuile
// change au rendu (attendu : rien, hors la phase du raster de voirie, que le
// plein ne fixe pas).
export function solPyramideAB(opts = {}) {
  if (!CM.layout || !CM.ctx) return { err: 'pas de layout — appeler __CM.forceFrame() d abord' };
  const zooms = opts.zooms || [1, 0.5, 0.25];
  const dpr = CM.dpr || 1, cw = CM.cw, ch = CM.ch;
  const W = Math.round(cw * dpr), H = Math.round(ch * dpr);
  const saved = { x: CM.cam.x, y: CM.cam.y, zoom: CM.cam.zoom, cw: CM.cw, ch: CM.ch, ctx: CM.ctx };
  const cx = saved.x, cy = saved.y;
  const A = mkCanvas(W, H), B = mkCanvas(W, H), B2 = mkCanvas(W, H);
  const out = { dpr, ecran: cw + 'x' + ch, zooms: [] };
  const px = (c) => c.getContext('2d').getImageData(0, 0, W, H).data;
  const compose = (target, z, shift) => {
    const tctx = target.getContext('2d');
    tctx.setTransform(1, 0, 0, 1, 0, 0); tctx.clearRect(0, 0, W, H); tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    tctx.imageSmoothingEnabled = false;
    const S = tileSideCss(dpr, z);
    const list = tilesCovering(cx, cy, z, cw, ch, S, shift);
    let ms = 0;
    const tiles = [];
    for (const { tx, ty } of list) { const t = cookTile(z, tx, ty, { shift }); t.shift = shift; ms += t.ms; tiles.push(t); }
    for (const t of tiles) blitTile(tctx, t, cx, cy, z, cw, ch);
    return { n: tiles.length, ms, msParTuile: tiles.length ? ms / tiles.length : 0, S, list, shift };
  };
  try {
    for (const zq of zooms) {
      const z = levelZoom(zq);
      // A : le plein d'aujourd'hui, même caméra, même écran.
      const actx = A.getContext('2d');
      actx.setTransform(1, 0, 0, 1, 0, 0); actx.clearRect(0, 0, W, H); actx.setTransform(dpr, 0, 0, dpr, 0, 0);
      CM.cam.x = cx; CM.cam.y = cy; CM.cam.zoom = z; CM.cw = cw; CM.ch = ch; CM.ctx = actx;
      const tA = performance.now();
      drawIsoGround();
      const msA = performance.now() - tA;
      CM.cam.x = saved.x; CM.cam.y = saved.y; CM.cam.zoom = saved.zoom; CM.cw = saved.cw; CM.ch = saved.ch; CM.ctx = saved.ctx;
      CM.cam.zoom = z;   // les tuiles se composent au zoom du niveau
      const rB = compose(B, z, 0);
      // Même monde, grille décalée d'une demi-tuile — décalage MULTIPLE DE n
      // (n = 8z) : sinon la grille décalée n'a plus la caméra exacte (cf.
      // tileSideCss) et le banc mesurerait son propre bruit (vu à z = 0,375 :
      // 20 000 px « forts » pour un décalage de 127,5).
      const nq = Math.max(1, Math.round(z * 8));
      const rB2 = compose(B2, z, nq * Math.floor(rB.S / (2 * nq)));
      CM.cam.zoom = saved.zoom;
      // Diffs au pixel, en deux classes : FAIBLE (Δ ≤ 8 sur le canal le plus
      // écarté) = l'antialiasing d'un voile translucide dont l'union de losanges
      // s'est découpée autrement — invisible ; FORT (Δ > 8) = un contenu qui
      // diffère vraiment — c'est LUI qui doit valoir zéro entre deux découpes.
      const a = px(A), b = px(B), b2 = px(B2);
      const dmax = (u, v, i) => Math.max(Math.abs(u[i] - v[i]), Math.abs(u[i + 1] - v[i + 1]), Math.abs(u[i + 2] - v[i + 2]), Math.abs(u[i + 3] - v[i + 3]));
      let dAB = 0, dABFort = 0, dBB2 = 0, dBB2Fort = 0, dBB2Bord = 0, dBB2FortBord = 0, maxBB2 = 0;
      // Frontières de B (grille 0) en px device : x = (tx·S − camSpace.x + cw/2)·dpr.
      const c0 = camSpace(cx, cy, z);
      const S = rB.S;
      const bordX = new Set(), bordY = new Set();
      for (const { tx, ty } of rB.list) {
        const bx = Math.round((tx * S - c0.x + cw / 2) * dpr), by = Math.round((ty * S - c0.y + ch / 2) * dpr);
        for (let d = -1; d <= 1; d += 1) { bordX.add(bx + d); bordY.add(by + d); }
      }
      for (let y = 0; y < H; y += 1) {
        for (let x = 0; x < W; x += 1) {
          const i = (y * W + x) * 4;
          const e1 = dmax(a, b, i);
          if (e1) { dAB += 1; if (e1 > 8) dABFort += 1; }
          const e2 = dmax(b, b2, i);
          if (e2) {
            dBB2 += 1; if (e2 > maxBB2) maxBB2 = e2;
            const bord = bordX.has(x) || bordY.has(y);
            if (bord) dBB2Bord += 1;
            if (e2 > 8) { dBB2Fort += 1; if (bord) dBB2FortBord += 1; }
          }
        }
      }
      const total = W * H;
      out.zooms.push({
        z, S, tuiles: rB.n, tuilesDecalees: rB2.n, msPlein: +msA.toFixed(1), msTuiles: +rB.ms.toFixed(1), msParTuile: +rB.msParTuile.toFixed(2),
        plein_vs_tuiles: { faible: dAB - dABFort, fort: dABFort, fort_pct: +(100 * dABFort / total).toFixed(3) },
        decoupe: { faible: dBB2 - dBB2Fort, fort: dBB2Fort, fort_surBords: dBB2FortBord, faible_surBords: dBB2Bord - dBB2FortBord, deltaMax: maxBB2 },
      });
    }
  } finally {
    CM.cam.x = saved.x; CM.cam.y = saved.y; CM.cam.zoom = saved.zoom; CM.cw = saved.cw; CM.ch = saved.ch; CM.ctx = saved.ctx;
  }
  out.canvases = { A, B, B2 };
  return out;
}

if (typeof globalThis !== 'undefined') {
  globalThis.__solPyramideStats = solPyramideStats;
}
