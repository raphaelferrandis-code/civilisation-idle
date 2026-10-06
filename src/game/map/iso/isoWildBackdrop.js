"use strict";
// ── LE FOND D'HERBE : LE SOL NE FINIT PAS AU BORD DU PLAN ────────────────────
//
// Capture de Raph (2026-09-29) : « pourquoi l'herbe ne charge pas ? ». Elle ne
// chargeait pas : elle n'existait pas. Le sol en tuiles (solPyramideFrame) n'est
// cuit QUE sur le rectangle qui englobe le plan de ville ; au-delà, le fond de la
// frame était un APLAT (SEASON_WILD à 0,9) — une herbe vert olive, sans matière,
// sous une forêt dessinée, elle, partout. La caméra, bornée sur le fleuve (qui
// déborde le plan de 1,3 N de chaque côté), y va sans peine.
//
// Ce fond est désormais la VRAIE herbe du jeu, en motif répété : la même tuile
// (`iso-grass`, variantes, miroirs, hiver compris via blitIsoTileKey), la même
// sous-couche d'ombre, la même grille iso ancrée au monde, cuite au MÊME NIVEAU
// de zoom que les tuiles du sol (levelZoom) puis étirée comme elles pendant un
// glissement. Au bord du rectangle cuit, la matière continue ; seuls les fleurs,
// touffes et voiles de prairie (le « tapis vivant », cher, cuit par cellule)
// s'arrêtent — une nuance, là où l'aplat faisait une marche.
//
// ⚠ POURQUOI UN MOTIF ET PAS DES TUILES CUITES EN PLUS : le rectangle du plan
// borne la cuisson EXPRÈS (mesuré au lot 4 : au plancher d'une grande carte, des
// dizaines de tuiles « vides » cuites en urgence, 100 ms de gel). Un motif ne cuit
// rien : UN remplissage par frame, HORS du plan seulement (cf. paintWildBackdrop),
// un canvas par niveau de zoom (LRU de 3).
//
// ⚠ PÉRIODE : le motif est un rectangle de 2P·hw × 2P·hh qui contient les cellules
// (i, j) dont le contenu ne dépend que de (i mod P, j mod P). Il est donc
// périodique sous (i + P, j − P) et (i + P, j + P), c'est-à-dire sous (2P·hw, 0) et
// (0, 2P·hh) à l'écran : un `createPattern('repeat')` le pave sans couture. P = 8
// casse la répétition à l'œil (les variantes tournent sur 64 cellules).
//
// Repli : tuile d'herbe pas encore décodée → l'aplat d'avant, à l'identique.
// (Sa molette d'A/B __wildBackdrop est retirée : audit 2026-10-05, DEV-3.)
import { CM, cmHash } from '../layout.js';
import { worldToScreen, ISO_X, ISO_Y } from './projection.js';
import { levelZoom } from './solPyramide.js';
import { blitIsoTileKey, isoTileProbe, ISO_TILE_KEYS } from './isoGroundTiles.js';
import { SEASON_WILD, GRASS_DETAIL, GRASS_TILE_UNDER, GRASS_TILE_UNDER_WINTER } from './isoGroundDetail.js';
import { WINTER } from '../seasonMode.js';
import { diamondPath } from './isoQuad.js';
import { rgb } from './isoPalette.js';
import { fm } from '../pixelUtil.js';

export const WILD_BACKDROP_PERIOD = 8;
const CACHE_MAX = 3;
const RETRY_MS = 500;               // motif incomplet (variante pas décodée) : on le refait, sans marteler
const cache = [];                   // [{ key, canvas, complete, at }], le plus récent en tête

const mkCanvas = (w, h) => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
};
const mod = fm;   // modulo réel (../pixelUtil.js)

// Les cellules (i, j) à peindre pour couvrir le rectangle [0, W) × [0, H) du motif,
// dans l'ordre NORD → SUD (i + j croissant) : les brins d'une tuile d'herbe
// débordent au-dessus de son losange et doivent recouvrir le voisin du nord,
// comme dans le bake. Une rangée de marge de chaque côté : ce qui déborde DANS le
// rectangle depuis l'extérieur y est aussi. Pure et exportée (testée).
export function wildBackdropCells(P = WILD_BACKDROP_PERIOD) {
  const out = [];
  for (let d = -3; d <= 2 * P + 2; d += 1) {          // d = i + j : la rangée écran
    for (let e = -2; e <= 2 * P + 2; e += 1) {        // e = i − j : la colonne écran
      if (((d + e) & 1) !== 0) continue;              // i et j entiers
      const i = (d + e) / 2, j = (d - e) / 2;
      out.push({ i, j, mi: mod(i, P), mj: mod(j, P) });
    }
  }
  return out;
}
const CELLS = wildBackdropCells();

function buildPattern(key, lz, dpr) {
  const T = CM.TILE, P = WILD_BACKDROP_PERIOD;
  const hw = T * ISO_X * lz, hh = T * ISO_Y * lz;
  const W = 2 * P * hw, H = 2 * P * hh;
  const canvas = mkCanvas(Math.round(W * dpr), Math.round(H * dpr));
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const under = rgb(CM.season === WINTER ? GRASS_TILE_UNDER_WINTER : GRASS_TILE_UNDER, 1);
  const alpha = GRASS_DETAIL.tileAlpha;
  let complete = true;
  for (const c of CELLS) {
    const nx = (c.i - c.j) * hw, ny = (c.i + c.j) * hh;
    // Cellule hors du rectangle (brins compris) : rien à peindre.
    if (nx + hw < 0 || nx - hw > W || ny + 2 * hh < 0 || ny - 2 * hh > H) continue;
    // Même tirage que le bake (isoGroundCells) : miroir = bit 3, variante = bits 5-6
    // du hash de la cellule — mais sur la cellule RAMENÉE dans la période.
    const h = cmHash(c.mi + ',' + c.mj);
    const mir = ((h >>> 3) & 1) === 1;
    ctx.fillStyle = under;
    diamondPath(ctx, nx, ny, hw, hh);
    ctx.fill();
    ctx.strokeStyle = under;                  // anti-couture, même geste que le bake
    ctx.lineWidth = 1;
    ctx.stroke();
    if (alpha < 1) ctx.globalAlpha = alpha;
    if (!blitIsoTileKey(ctx, key, nx, ny, hw, mir, h)) complete = false;
    if (alpha < 1) ctx.globalAlpha = 1;
  }
  return { canvas, complete };
}

function patternCanvas(lz, dpr, nowMs) {
  const key = ISO_TILE_KEYS.grass;
  const base = isoTileProbe(key);
  if (!base || !base.ready) return null;
  const k = lz + '|' + dpr + '|' + (CM.season === WINTER ? 'w' : 's') + '|' + GRASS_DETAIL.tileAlpha + '|' + CM.TILE;
  const i = cache.findIndex((c) => c.key === k);
  let hit = i >= 0 ? cache[i] : null;
  if (hit && (hit.complete || nowMs - hit.at < RETRY_MS)) {
    if (i > 0) { cache.splice(i, 1); cache.unshift(hit); }
    return hit.canvas;
  }
  const built = buildPattern(key, lz, dpr);
  if (!built) return hit ? hit.canvas : null;
  if (i >= 0) cache.splice(i, 1);
  hit = { key: k, canvas: built.canvas, complete: built.complete, at: nowMs };
  cache.unshift(hit);
  if (cache.length > CACHE_MAX) cache.length = CACHE_MAX;
  return hit.canvas;
}

// La boîte ÉCRAN du plan de ville, marge d'une cellule comprise : la même que
// celle sur laquelle le sol en tuiles se cuit (solPyramideFrame, mapBBoxAtLevel).
// Dedans, les tuiles cuites recouvrent tout ; le motif n'y servirait à rien.
function planScreenBox(L) {
  const N = ((L.gridN | 0) || 1) + 1, T = CM.TILE;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [wx, wy] of [[-T, -T], [N * T, -T], [-T, N * T], [N * T, N * T]]) {
    const p = worldToScreen(wx, wy);
    if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
  }
  return { x0, y0, x1, y1 };
}

// Peint le fond de la frame : l'aplat d'avant partout (il bouche encore les
// premières frames d'une tuile pas encore cuite, comme avant), puis l'herbe en
// motif HORS du plan seulement. ⚠ COÛT : la carte de Raph tourne sans GPU (rendu
// logiciel), et un remplissage de motif plein écran à chaque frame y coûterait
// plusieurs millisecondes. Restreint au complément de la boîte du plan, il ne
// coûte RIEN au zoom de jeu en ville (la boîte couvre l'écran) et ne se paie qu'en
// regardant le bord du monde.
// `covered` (audit du 05/10, PERF-64) = le sol de la frame couvrira tout l'écran de
// tuiles opaques, au pixel (groundCoversScreen, solPyramideFrame.js) : l'aplat — et
// le motif — seraient entièrement repeints. C'est le cas courant au repos en ville ;
// l'aplat plein écran y coûtait 0,3 à 0,5 ms par frame en rendu logiciel (mesuré sur
// 2 560 × 1 340) pour rien. Il reste posé dès qu'une tuile manque (premières frames,
// repli, glissement de zoom) : c'est lui qui bouche le trou.
export function paintWildBackdrop(ctx, nowMs, covered = false) {
  if (covered) return;
  ctx.fillStyle = rgb(SEASON_WILD, 0.9);
  ctx.fillRect(0, 0, CM.cw, CM.ch);
  const L = CM.layout;
  if (!L) return;
  const box = planScreenBox(L);
  if (box.x0 <= 0 && box.y0 <= 0 && box.x1 >= CM.cw && box.y1 >= CM.ch) return;   // le plan couvre l'écran
  const zoom = CM.cam.zoom, dpr = CM.dpr || 1;
  const lz = levelZoom(zoom);
  const canvas = patternCanvas(lz, dpr, nowMs || 0);
  let pat = null;
  if (canvas) {
    try { pat = ctx.createPattern(canvas, 'repeat'); } catch { pat = null; }
  }
  if (!pat) return;                         // tuile d'herbe pas encore décodée : l'aplat reste
  // Ancre : le coin nord de la cellule (0, 0), rabattu sur la grille DEVICE comme
  // l'origine du sol en tuiles (screenOrigin) — la matière tombe au pixel sur
  // celle des tuiles cuites, pas à côté.
  const o = worldToScreen(0, 0);
  const ox = Math.round(o.x * dpr) / dpr, oy = Math.round(o.y * dpr) / dpr;
  const k = (zoom / lz) / dpr;              // px device du niveau → px CSS du zoom courant
  pat.setTransform({ a: k, b: 0, c: 0, d: k, e: ox, f: oy });
  const prevSm = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = zoom !== lz;  // 1:1 net au repos, lissé pendant l'étirement d'un glissement
  ctx.fillStyle = pat;
  // Le complément de la boîte du plan : écran + boîte, règle 'evenodd'.
  ctx.beginPath();
  ctx.rect(0, 0, CM.cw, CM.ch);
  ctx.rect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
  ctx.fill('evenodd');
  ctx.imageSmoothingEnabled = prevSm;
}
