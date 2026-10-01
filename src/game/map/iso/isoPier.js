"use strict";
// ── LE PONTON DU PORT, AU PIXEL ─────────────────────────────────────────────
//
// Demande de Raph (2026-10-01, capture du port médiéval) : « on peut améliorer le port
// et son ponton ? ». Le ponton était un sprite PixelLab carré (une plate-forme de
// 0,7 tuile sur six pieux) posé sous la maison : il se lisait comme un radeau échoué,
// pas comme un appontement, et le bateau flottait à une demi-tuile de lui.
//
// LE NOUVEAU est un vrai APPONTEMENT, construit et non plus collé :
//   · un TABLIER qui part de la plage, franchit la laisse et avance dans le fleuve,
//     perpendiculaire à la rive ; au bout, une TÊTE en T le long de laquelle le bateau
//     de l'ère s'amarre bord à bord ;
//   · des PIEUX qui entrent dans l'eau, des ducs-d'albe aux coins, des bornes ;
//   · une matière par ère, alignée sur la maison du port : rondins (campement),
//     planches (médiéval), pierre (classique, XIXe), béton (moderne, cosmique) ;
//   · son OMBRE sur l'eau et sur le sable, son REFLET dans le fleuve — calculés au pixel
//     par la même géométrie, pas devinés sur la silhouette.
//
// COMMENT. Le ponton est une poignée de BOÎTES alignées sur les axes du monde (tablier,
// tête, pieux, bornes). On le cuit UNE fois, dans l'« espace d'art » des quais
// (iso/isoQuay.js : zoom 1, caméra nulle — un pixel d'art devient un bloc à l'écran,
// comme le reste de la carte), en lançant pour chaque pixel le rayon de vue à travers
// les boîtes : le pixel prend la face touchée la plus proche (dessus, flanc sud, flanc
// est), et sa texture se lit en coordonnées LOCALES du ponton (planche, joint, assise).
// Pas un trait lissé, pas une couleur d'antialias : les bords tombent au pixel, comme
// sur les quais validés le même jour.
//   · OMBRE : un pixel de sol est à l'ombre si le rayon vers le soleil (l'est du monde,
//     cf. isoSunShadow) traverse une boîte. Posée en multiply, à la force du soleil du
//     moment, AVANT les bateaux (paintPierUnder).
//   · REFLET : la même scène retournée sous le plan de l'eau, versée dans le calque des
//     reflets (isoReflect.noteReflectionImage) : il ondule, se teinte et s'éteint avec
//     ceux des bateaux et des façades.
// ⚠ Axes du monde SEULEMENT (nord-sud ou est-ouest, choisi selon la tangente du fleuve
// au droit du port) : un ponton en biais sortirait en escaliers de pixels. Le fleuve
// au droit du port est presque toujours ouest→est (|pente| ≤ 0,55 sur 60 graines,
// cf. la note des pontons) : l'axe nord-sud y est perpendiculaire à 30° près au pire.
//
// Molette : __pier({ on, reach, house, … }) ; __pier(false) rend le sprite d'avant.
import { CM } from '../layout.js';
import { SUN_SHADOW, sunShadowAlpha } from './isoSunShadow.js';
import { noteReflectionImage } from './isoReflect.js';
import { quayStyleFor } from '../quaysAndRiot.js';

// reach : longueur du ponton au-delà du bord d'eau, en fraction de la demi-largeur du
//         fleuve (bornée) — au-delà de ~0,6 il entre dans la voie des bateaux ;
// house : recul de la maison du port sur la plage, en tuiles (0 = au ras de l'eau,
//         comme avant : elle posait son socle de pierre dans le fleuve).
export const PIER = { on: true, reach: 0.58, house: 0.7, crane: true, shadow: true, reflect: true, foam: true };
if (typeof window !== 'undefined') {
  window.__pier = (o) => {
    if (o === false) PIER.on = false;
    else if (o === true) PIER.on = true;
    else if (o && typeof o === 'object') Object.assign(PIER, o);
    _cache.clear();
    return { ...PIER };
  };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mul = (c, k) => [Math.min(255, Math.round(c[0] * k)), Math.min(255, Math.round(c[1] * k)), Math.min(255, Math.round(c[2] * k))];
const mix = (a, b, t) => [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
function h01(x, y, s = 0) {
  let n = (x | 0) * 374761393 + (y | 0) * 668265263 + s * 982451653;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
const hexRgb = (h) => {
  if (typeof h !== 'string') return null;
  if (h[0] === '#') { const n = parseInt(h.slice(1, 7), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const m = h.match(/\d+(\.\d+)?/g);
  return m ? m.slice(0, 3).map(Number) : null;
};

// ── LES MATIÈRES, PAR ÈRE ───────────────────────────────────────────────────
// Même découpe que la maison du port (isoPort : stade 0..3 sur l'index d'ère). Tons
// pris sur les maisons de port et l'ancien ponton (bois), sur la pierre des quais
// (pierre), sur le béton des docks modernes.
const MATS = {
  log: {
    kind: 'log', top: [[128, 94, 62], [116, 86, 58], [138, 102, 68]], gap: [70, 50, 34],
    face: [100, 74, 50], pile: [88, 66, 46], post: [96, 72, 50], cap: [150, 118, 84], rope: [196, 176, 128],
  },
  plank: {
    kind: 'plank', top: [[168, 120, 74], [154, 108, 66], [178, 130, 82]], gap: [92, 62, 38],
    face: [128, 88, 54], pile: [98, 70, 46], post: [106, 76, 50], cap: [182, 142, 98],
    crane: [112, 80, 52], rope: [74, 60, 44], load: [158, 118, 72],
  },
  stone: {
    kind: 'stone', top: [[198, 190, 172], [188, 180, 162], [206, 198, 180]], gap: [146, 138, 122],
    face: [172, 162, 144], coping: [226, 220, 204], post: [58, 56, 54], cap: [92, 90, 86],
    crane: [70, 68, 66], rope: [48, 46, 44], load: [158, 118, 72],
  },
  concrete: {
    kind: 'concrete', top: [[180, 180, 174], [172, 172, 167], [186, 186, 180]], gap: [146, 146, 142],
    face: [156, 156, 150], pile: [146, 146, 142], edge: [222, 186, 64], fender: [42, 42, 44],
    post: [50, 52, 56], cap: [86, 88, 92],
    crane: [214, 172, 58], rope: [40, 40, 42], load: [178, 74, 54],
  },
};
function stageOf(ei) { return ei < 10 ? 0 : ei < 20 ? 1 : ei < 30 ? 2 : 3; }

// ── LE PLAN DU PONTON, EN COORDONNÉES LOCALES ───────────────────────────────
// `a` = le long du ponton (0 au bord d'eau peint, + vers le large), `c` = en travers
// (centré sur l'axe), `z` = hauteur au-dessus de l'eau. Tout en TUILES.
// Rend { reach, deckZ, head: {a0, a1, c0, c1} | null, boxes: [...] }.
// LA GRUE DE PORT — ce qui fait lire « port » et non « maison au bord de l'eau » :
// une bigue au coin EST de la tête (le côté qu'on voit) — un mât, une FLÈCHE INCLINÉE
// qui part de son pied et monte au-dessus de l'eau, le hauban qui la tient au sommet du
// mât, un filin et sa charge suspendue au bord de la tête. Les obliques sont des
// marches de boîtes : un trait en biais, au pixel, EST un escalier. Une STRUCTURE,
// comme le mur du quai — pas du mobilier posé (cf. quay-props : refusé).
// Bois au médiéval, fonte à l'ère de la pierre, acier peint au béton.
function addCrane(box, stage, reach, hw2, z) {
  const H = stage === 3 ? 1.6 : 1.4;                   // hauteur du mât au-dessus du tablier
  const m = stage === 3 ? 0.11 : 0.09;                 // section du mât
  const ma = reach - 0.4, mc = hw2 - 0.34;             // pied du mât sur la tête
  const tipA = reach + 0.85, tipZ = z + H * 0.82, footZ = z + 0.12;
  box('crane', ma, ma + m, mc, mc + m, z, z + H);
  const step = (part, A0, Z0, A1, Z1, N, c0, c1, t) => {
    for (let k = 0; k < N; k += 1) {
      const u0 = k / N, u1 = (k + 1) / N;
      const x0 = A0 + (A1 - A0) * u0, x1 = A0 + (A1 - A0) * u1;
      const y0 = Z0 + (Z1 - Z0) * u0, y1 = Z0 + (Z1 - Z0) * u1;
      box(part, Math.min(x0, x1), Math.max(x0, x1) + 0.015, c0, c1, Math.min(y0, y1), Math.max(y0, y1) + t);
    }
  };
  // La flèche : du pied du mât au bout, au-dessus de l'eau.
  step('crane', ma + m, footZ, tipA, tipZ, 16, mc + 0.015, mc + 0.075, 0.07);
  // Le hauban : du sommet du mât au bout de la flèche.
  step('rope', ma + m * 0.5, z + H, tipA, tipZ + 0.05, 14, mc + 0.03, mc + 0.06, 0.035);
  // Le filin, et la charge au bout, au ras de la tête.
  box('rope', tipA - 0.02, tipA + 0.015, mc + 0.028, mc + 0.063, z + 0.62, tipZ);
  box('load', tipA - 0.12, tipA + 0.1, mc - 0.07, mc + 0.16, z + 0.4, z + 0.62);
}

export function pierPlan(stage, hw, band) {
  const reach = clamp(hw * PIER.reach, stage === 0 ? 1.1 : 1.5, stage === 0 ? 1.9 : 3.0);
  const B = [];
  const box = (part, a0, a1, c0, c1, z0, z1, extra) => B.push({ part, a0, a1, c0, c1, z0, z1, ...extra });
  if (stage === 0) {
    // RONDINS : un étroit platelage sur pieux, sans tête, deux piquets qui dépassent.
    const w = 0.5, z = 0.16, th = 0.07;
    box('deck', -0.75, reach, -w / 2, w / 2, z - th, z);
    for (let a = -0.45; a < reach - 0.1; a += 0.5) {
      box('pile', a, a + 0.1, w / 2 - 0.11, w / 2 - 0.01, 0, z - th);
      box('pile', a, a + 0.1, -w / 2 + 0.01, -w / 2 + 0.11, 0, z - th);
    }
    box('post', reach - 0.04, reach + 0.08, w / 2 - 0.02, w / 2 + 0.1, 0, z + 0.2);
    box('post', reach - 0.04, reach + 0.08, -w / 2 - 0.1, -w / 2 + 0.02, 0, z + 0.14);
    box('post', 0.35, 0.45, w / 2, w / 2 + 0.1, 0, z + 0.12);
    return { reach, deckZ: z, head: null, w, boxes: B };
  }
  if (stage === 1) {
    // PLANCHES : tablier sur pieux, tête en T, ducs-d'albe aux coins de la tête.
    const w = 0.62, z = 0.24, th = 0.07, hl = 0.6, hw2 = 0.88;
    const h0 = reach - hl;
    box('deck', -0.85, h0 + 0.02, -w / 2, w / 2, z - th, z);
    box('head', h0, reach, -hw2, hw2, z - th, z);
    for (let a = -0.55; a < h0 - 0.15; a += 0.55) {
      box('pile', a, a + 0.09, w / 2 - 0.1, w / 2 - 0.01, 0, z - th);
      box('pile', a, a + 0.09, -w / 2 + 0.01, -w / 2 + 0.1, 0, z - th);
    }
    for (const c of [-hw2 + 0.02, -0.3, 0.3 - 0.09, hw2 - 0.11]) {
      box('pile', h0 + 0.02, h0 + 0.11, c, c + 0.09, 0, z - th);
      box('pile', reach - 0.1, reach - 0.01, c, c + 0.09, 0, z - th);
    }
    // Ducs-d'albe : deux pieux qui dépassent le tablier aux coins du large.
    box('post', reach - 0.02, reach + 0.1, hw2 - 0.04, hw2 + 0.08, 0, z + 0.24);
    box('post', reach - 0.02, reach + 0.1, -hw2 - 0.08, -hw2 + 0.04, 0, z + 0.2);
    // Bornes d'amarrage sur la tête et au départ du tablier.
    box('bitt', reach - 0.2, reach - 0.11, 0.42, 0.51, z, z + 0.1);
    box('bitt', reach - 0.2, reach - 0.11, -0.51, -0.42, z, z + 0.1);
    box('post', 0.05, 0.15, w / 2 + 0.01, w / 2 + 0.11, 0, z + 0.14);
    if (PIER.crane) addCrane(box, stage, reach, hw2, z);
    return { reach, deckZ: z, head: { a0: h0, a1: reach, c0: -hw2, c1: hw2 }, w, boxes: B };
  }
  if (stage === 2) {
    // PIERRE : une jetée maçonnée pleine, tête élargie, bornes de fonte.
    const w = 0.78, z = 0.32, hl = 0.72, hw2 = 1.0;
    const h0 = reach - hl;
    box('mole', -0.6, h0 + 0.02, -w / 2, w / 2, 0, z);
    box('mole', h0, reach, -hw2, hw2, 0, z, { head: true });
    for (const [a, c] of [[reach - 0.16, hw2 - 0.16], [reach - 0.16, -hw2 + 0.08], [h0 + 0.1, hw2 - 0.16], [0.3, w / 2 - 0.16]]) {
      box('bitt', a, a + 0.08, c, c + 0.08, z, z + 0.1);
    }
    if (PIER.crane) addCrane(box, stage, reach, hw2, z);
    return { reach, deckZ: z, head: { a0: h0, a1: reach, c0: -hw2, c1: hw2 }, w, boxes: B };
  }
  // BÉTON : dalle sur poteaux, tête large, défenses de caoutchouc, liseré de sécurité
  // (lumineux aux ères d'énergie : la couleur du quai de l'ère).
  const w = 0.9, z = 0.32, th = 0.1, hl = 0.82, hw2 = 1.15;
  const h0 = reach - hl;
  box('deck', -0.65, h0 + 0.02, -w / 2, w / 2, z - th, z);
  box('head', h0, reach, -hw2, hw2, z - th, z);
  for (let a = -0.4; a < h0 - 0.2; a += 0.7) {
    box('pile', a, a + 0.12, w / 2 - 0.14, w / 2 - 0.02, 0, z - th);
    box('pile', a, a + 0.12, -w / 2 + 0.02, -w / 2 + 0.14, 0, z - th);
  }
  for (const c of [-hw2 + 0.04, -0.06, hw2 - 0.16]) box('pile', reach - 0.16, reach - 0.04, c, c + 0.12, 0, z - th);
  for (const c of [-0.85, -0.32, 0.2, 0.72]) box('fender', reach, reach + 0.05, c, c + 0.13, z - 0.24, z - 0.03);
  box('bitt', reach - 0.2, reach - 0.1, hw2 - 0.22, hw2 - 0.12, z, z + 0.1);
  box('bitt', reach - 0.2, reach - 0.1, -hw2 + 0.12, -hw2 + 0.22, z, z + 0.1);
  if (PIER.crane) addCrane(box, 3, reach, hw2, z);
  return { reach, deckZ: z, head: { a0: h0, a1: reach, c0: -hw2, c1: hw2 }, w, boxes: B, glow: band >= 6, cosmic: band >= 7 };
}

// ── OÙ EST LE PONTON ────────────────────────────────────────────────────────
// Point du fleuve le plus proche (segment + paramètre) d'un point monde (tuiles).
function nearestOnRiver(sm, x, y, j0 = 0, j1 = sm.length - 1) {
  let bj = Math.max(0, j0), bf = 0, bd = Infinity;
  for (let j = Math.max(0, j0); j < Math.min(sm.length - 1, j1); j += 1) {
    const a = sm[j], b = sm[j + 1];
    const tx = b.x - a.x, ty = b.y - a.y, l2 = tx * tx + ty * ty || 1e-9;
    const f = clamp(((x - a.x) * tx + (y - a.y) * ty) / l2, 0, 1);
    const qx = a.x + tx * f, qy = a.y + ty * f, d = (x - qx) * (x - qx) + (y - qy) * (y - qy);
    if (d < bd) { bd = d; bj = j; bf = f; }
  }
  const a = sm[bj], b = sm[bj + 1];
  return { j: bj, f: bf, d: Math.sqrt(bd), hw: (a.hw || 2) + ((b.hw || 2) - (a.hw || 2)) * bf, qx: a.x + (b.x - a.x) * bf, qy: a.y + (b.y - a.y) * bf };
}

// Le repère du ponton d'un port : racine (bord d'eau peint), direction vers le large
// (un axe du monde), travers. ⚠ Le bord d'eau est celui du RUBAN (samples), jamais le
// riverSet cellulaire (cf. map-water-placement) : on part de l'intérieur des terres
// et on avance le long de l'axe jusqu'à entrer dans le ruban.
function pierFrame(t, spanX, spanY, rv) {
  const sm = rv.samples;
  const pcx = t.gx + spanX / 2, pcy = t.gy + spanY / 2;
  const nr = nearestOnRiver(sm, pcx, pcy);
  const a = sm[nr.j], b = sm[nr.j + 1];
  let tx = b.x - a.x, ty = b.y - a.y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
  // Vers le large = vers la ligne médiane, depuis le côté du port.
  let wx = nr.qx - pcx, wy = nr.qy - pcy;
  const wl = Math.hypot(wx, wy);
  if (wl < 1e-6) { wx = -ty; wy = tx; } else { wx /= wl; wy /= wl; }
  // Molette héritée des pontons sprités : __pontoonAxis = 'auto' | 'ns' | 'ew'.
  const axisOv = (typeof window !== 'undefined' && window.__pontoonAxis) || 'auto';
  const ew = axisOv === 'ew' || (axisOv !== 'ns' && Math.abs(wx) > Math.abs(wy));
  const dir = ew ? { x: Math.sign(wx) || 1, y: 0 } : { x: 0, y: Math.sign(wy) || 1 };
  const across = ew ? { x: 0, y: 1 } : { x: 1, y: 0 };
  // Départ : l'axe passe par le centre du lot en travers ; on part 3 tuiles à terre.
  let sx = ew ? nr.qx - dir.x * (nr.hw + 3) : pcx, sy = ew ? pcy : nr.qy - dir.y * (nr.hw + 3);
  let root = null;
  for (let k = 0; k < 160; k += 1) {
    const q = nearestOnRiver(sm, sx, sy);
    if (q.d <= q.hw) { root = { x: sx, y: sy }; break; }
    sx += dir.x * 0.05; sy += dir.y * 0.05;
  }
  if (!root) return null;
  return { root, dir, across, hw: nr.hw, si: nr.j };
}

// Boîte locale → boîte MONDE en px (axes du monde, donc min/max des coins suffit).
function worldBox(F, bx, T) {
  const xs = [], ys = [];
  for (const a of [bx.a0, bx.a1]) for (const c of [bx.c0, bx.c1]) {
    xs.push((F.root.x + F.dir.x * a + F.across.x * c) * T);
    ys.push((F.root.y + F.dir.y * a + F.across.y * c) * T);
  }
  return { ...bx, X0: Math.min(...xs), X1: Math.max(...xs), Y0: Math.min(...ys), Y1: Math.max(...ys), Z0: bx.z0 * T, Z1: bx.z1 * T };
}

// ── LA CUISSON ──────────────────────────────────────────────────────────────
function mkCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

// Rayon d'un pixel d'art (ax, ay) → la boîte touchée la plus proche de l'œil.
// Projection (ISO_X = 1, ISO_Y = ½) : ax = wx − wy, ay = (wx + wy)/2 − z. Avec
// s = (wx + wy)/2, le rayon est (s + ax/2, s − ax/2, s − ay) : l'œil est vers s → +∞.
// `mirror` : la scène retournée sous le plan de l'eau (z → −z), pour le reflet. Les
// filins n'y sont pas : un trait d'un pixel, retourné puis ondulé, s'y lisait comme
// une rayure dans l'eau.
export function castRay(boxes, ax, ay, mirror) {
  let best = null, bs = -Infinity, bface = 0;
  for (const bx of boxes) {
    if (mirror && bx.part === 'rope') continue;
    const xLo = bx.X0 - ax / 2, xHi = bx.X1 - ax / 2;
    const yLo = bx.Y0 + ax / 2, yHi = bx.Y1 + ax / 2;
    const zLo = mirror ? ay - bx.Z1 : bx.Z0 + ay, zHi = mirror ? ay - bx.Z0 : bx.Z1 + ay;
    const lo = Math.max(xLo, yLo, zLo), hi = Math.min(xHi, yHi, zHi);
    if (lo > hi || hi <= bs) continue;
    bs = hi; best = bx;
    bface = hi === zHi ? 2 : hi === yHi ? 1 : 0;      // 2 dessus (dessous en miroir), 1 flanc sud, 0 flanc est
  }
  return best ? { bx: best, s: bs, face: bface } : null;
}

// Couleur d'un point touché. (wx, wy, zz) en px monde ; (a, c) en px le long / en
// travers du ponton (repère local, depuis la racine).
function shadeHit(M, P, hit, wx, wy, zz, a, c, mirror) {
  const bx = hit.bx, face = hit.face, part = bx.part;
  const edgeX = bx.X1 - wx, edgeY = bx.Y1 - wy;
  const g = 1 + (h01(Math.floor(wx), Math.floor(wy), 3) - 0.5) * 0.06;
  let col;
  if (part === 'pile' || part === 'post') {
    col = M.pile || M.post;
    if (part === 'post') col = M.post;
    if (face === 2) col = M.cap || mul(col, 1.25);
    // Ligne de flottaison : le bas du pieu, mouillé, verdi.
    else if (zz < 1.2) col = mix(mul(col, 0.62), [54, 74, 50], 0.35);
    else if (zz < 2.4) col = mul(col, 0.82);
  } else if (part === 'bitt') {
    col = face === 2 ? (M.cap || mul(M.post, 1.3)) : M.post;
  } else if (part === 'fender') {
    col = M.fender;
  } else if (part === 'crane') {
    col = face === 2 ? mul(M.crane, 1.2) : M.crane;
  } else if (part === 'rope') {
    col = M.rope;
  } else if (part === 'load') {
    col = M.load;
    if (face === 2) col = mul(col, 1.15);
    // Cerclage d'une caisse / nervures d'un conteneur : une ligne tous les 3 px.
    else if (((Math.floor(face === 1 ? wx : wy) % 3) + 3) % 3 === 0) col = mul(col, 0.8);
  } else if (face === 2 && !mirror) {
    // ── DESSUS DU TABLIER ──
    if (M.kind === 'plank' || M.kind === 'log') {
      // Sur la tête, les planches tournent d'un quart : elles courent le long du T.
      const u = part === 'head' ? c : a;
      const pitch = M.kind === 'log' ? 5 : 4;
      const k = Math.floor(u / pitch), r = u - k * pitch;
      col = M.top[Math.floor(h01(k, part === 'head' ? 7 : 3, 11) * M.top.length)];
      if (r < 1) col = M.gap;
      else if (M.kind === 'log') col = r < 2 ? mul(col, 1.12) : r >= pitch - 1 ? mul(col, 0.8) : col;
      // Longerons : le bord du tablier, plus sombre (sauf la lèvre éclairée).
      const half = (part === 'head' ? P.headHalfA : P.wHalf);
      const v = part === 'head' ? Math.abs(a - P.headMidA) : Math.abs(c);
      if (v > half - 1.2) col = mul(col, 0.86);
    } else if (M.kind === 'stone') {
      // Dalles : joints tous les ~10 px le long, une rangée au milieu en travers.
      const ka = Math.floor(a / 10.5), ra = a - ka * 10.5;
      col = M.top[Math.floor(h01(ka, Math.floor(c / 9), 5) * M.top.length)];
      if (ra < 1 || Math.abs(((c % 9) + 9) % 9) < 1) col = M.gap;
      if (edgeX < 1.4 || edgeY < 1.4 || wx - bx.X0 < 1.2 || wy - bx.Y0 < 1.2) col = M.coping;
    } else {
      const ka = Math.floor(a / 16), ra = a - ka * 16;
      col = M.top[Math.floor(h01(ka, 1, 9) * M.top.length)];
      if (ra < 1) col = M.gap;
      if (edgeX < 1.3 || edgeY < 1.3 || wx - bx.X0 < 1.1 || wy - bx.Y0 < 1.1) col = P.glow || M.edge;
    }
    // Lèvre éclairée au bord avant du dessus.
    if (M.kind !== 'stone' && M.kind !== 'concrete' && (edgeX < 1 || edgeY < 1)) col = mul(col, 1.14);
  } else if (face === 2 && mirror) {
    col = mul(M.face, 0.45);                          // le dessous du tablier, vu dans l'eau
  } else {
    // ── FLANCS ──
    col = M.face;
    if (M.kind === 'stone') {
      // Assises de 3 px, joints verticaux décalés d'une assise à l'autre.
      const u = face === 1 ? wx : wy, row = Math.floor(zz / 3.2);
      const off = (row & 1) ? 4 : 0;
      if (zz - row * 3.2 < 0.9) col = M.gap;
      else if ((((Math.floor(u) + off) % 8) + 8) % 8 === 0) col = M.gap;
      else col = mix(M.face, M.top[(row + Math.floor((u + off) / 8)) % M.top.length], 0.25);
      if (zz < 2.2) col = mix(mul(M.face, 0.6), [58, 76, 56], 0.3);
    } else if (M.kind === 'plank' || M.kind === 'log') {
      if (bx.Z1 - zz < 1) col = mul(col, 1.1);         // arête haute éclairée
      else if (zz - bx.Z0 < 0.8) col = mul(col, 0.8);  // arête basse
    } else if (M.kind === 'concrete') {
      if (bx.Z1 - zz < 1) col = mul(col, 1.08);
    }
  }
  // Lumière haut-gauche : flanc sud (tourné vers la gauche de l'écran) mi-clair,
  // flanc est (vers la droite) dans l'ombre.
  const k = face === 2 ? 1 : face === 1 ? 0.8 : 0.64;
  return mul(col, k * g);
}

// Est-ce de l'eau (le ruban peint) sous ce point monde (px) ? Fenêtre de samples
// autour du port : le ponton ne fait que quelques tuiles.
function waterAt(sm, wx, wy, T, si) {
  const q = nearestOnRiver(sm, wx / T, wy / T, si - 8, si + 9);
  return q.d < q.hw - 0.02;
}

function bakePier(F, plan, M, T, band, sm) {
  const boxes = plan.boxes.map((b) => worldBox(F, b, T));
  // Repère local en px : a le long, c en travers, depuis la racine.
  const rx = F.root.x * T, ry = F.root.y * T;
  const P = {
    wHalf: plan.w * T / 2,
    headHalfA: plan.head ? (plan.head.a1 - plan.head.a0) * T / 2 : 0,
    headMidA: plan.head ? (plan.head.a0 + plan.head.a1) * T / 2 : 0,
    glow: null,
  };
  if (plan.glow) {
    const st = quayStyleFor(band);
    P.glow = (st && st.glow && hexRgb(st.glow)) || null;
  }
  // Boîte d'art de tout ce qu'on peut peindre : le ponton, son reflet (sous l'eau),
  // son ombre (vers l'est) — plus une marge.
  let AX0 = Infinity, AX1 = -Infinity, AY0 = Infinity, AY1 = -Infinity;
  for (const b of boxes) {
    for (const x of [b.X0, b.X1]) for (const y of [b.Y0, b.Y1]) {
      const ax = x - y, ay = (x + y) / 2;
      AX0 = Math.min(AX0, ax); AX1 = Math.max(AX1, ax + b.Z1 * 0.9);
      AY0 = Math.min(AY0, ay - b.Z1); AY1 = Math.max(AY1, ay + b.Z1 + 2);
    }
  }
  AX0 = Math.floor(AX0) - 6; AY0 = Math.floor(AY0) - 6; AX1 = Math.ceil(AX1) + 8; AY1 = Math.ceil(AY1) + 6;
  const W = AX1 - AX0, H = AY1 - AY0;
  if (!(W > 0 && H > 0) || W * H > 1e6) return null;
  const body = new Uint8ClampedArray(W * H * 4);
  const shad = new Uint8ClampedArray(W * H * 4);
  const refl = new Uint8ClampedArray(W * H * 4);
  const shCol = hexRgb(SUN_SHADOW.col) || [142, 150, 173];
  const kSun = (SUN_SHADOW.len || 0.5) * 2 / Math.sqrt(5);
  const wet = new Map();
  const isWet = (gx, gy) => {
    const k = Math.floor(gx) + ',' + Math.floor(gy);
    let v = wet.get(k);
    if (v === undefined) { v = waterAt(sm, gx, gy, T, F.si); wet.set(k, v); }
    return v;
  };
  const toLocal = (wx, wy) => ({
    a: (wx - rx) * F.dir.x + (wy - ry) * F.dir.y,
    c: (wx - rx) * F.across.x + (wy - ry) * F.across.y,
  });
  for (let py = 0; py < H; py += 1) {
    for (let px = 0; px < W; px += 1) {
      const ax = AX0 + px + 0.5, ay = AY0 + py + 0.5;
      const i = (py * W + px) * 4;
      const hit = castRay(boxes, ax, ay, false);
      if (hit) {
        const wx = hit.s + ax / 2, wy = hit.s - ax / 2, zz = hit.s - ay;
        const l = toLocal(wx, wy);
        const col = shadeHit(M, P, hit, wx, wy, zz, l.a, l.c, false);
        body[i] = col[0]; body[i + 1] = col[1]; body[i + 2] = col[2]; body[i + 3] = 255;
        continue;
      }
      // Rien de bâti devant : le SOL (z = 0) sous ce pixel.
      const gx = ay + ax / 2, gy = ay - ax / 2;
      // Ombre : le rayon vers le soleil (vers l'ouest du monde quand on remonte) touche-t-il ?
      if (PIER.shadow) {
        for (const b of boxes) {
          if (gy < b.Y0 || gy > b.Y1) continue;
          const h0 = Math.max(b.Z0, 0.5, (gx - b.X1) / kSun), h1 = Math.min(b.Z1, (gx - b.X0) / kSun);
          if (h0 <= h1) { shad[i] = shCol[0]; shad[i + 1] = shCol[1]; shad[i + 2] = shCol[2]; shad[i + 3] = 255; break; }
        }
      }
      if (!isWet(gx, gy)) continue;
      // Clapot au pied des pieux : un pixel clair au contact de l'eau, devant eux.
      if (PIER.foam) {
        for (const b of boxes) {
          if (b.Z0 > 0.01 || (b.part !== 'pile' && b.part !== 'post' && b.part !== 'mole')) continue;
          const dx = gx - b.X1, dy = gy - b.Y1;
          const inX = gx >= b.X0 - 0.5 && gx <= b.X1 + 1.6, inY = gy >= b.Y0 - 0.5 && gy <= b.Y1 + 1.6;
          if (inX && inY && (dx > 0 || dy > 0) && h01(Math.floor(gx), Math.floor(gy), 21) < 0.7) {
            body[i] = 214; body[i + 1] = 230; body[i + 2] = 232; body[i + 3] = 150;
            break;
          }
        }
      }
      // Reflet : la scène retournée sous l'eau.
      if (PIER.reflect) {
        const rh = castRay(boxes, ax, ay, true);
        if (rh) {
          const wx = rh.s + ax / 2, wy = rh.s - ax / 2, zz = ay - rh.s;
          const l = toLocal(wx, wy);
          const col = shadeHit(M, P, rh, wx, wy, zz, l.a, l.c, true);
          refl[i] = col[0]; refl[i + 1] = col[1]; refl[i + 2] = col[2]; refl[i + 3] = 255;
        }
      }
    }
  }
  const put = (data) => {
    const cv = mkCanvas(W, H);
    cv.getContext('2d').putImageData(new ImageData(data, W, H), 0, 0);
    return cv;
  };
  return { AX0, AY0, W, H, body: put(body), shadow: put(shad), refl: put(refl) };
}

// ── LE CACHE, PAR PORT ──────────────────────────────────────────────────────
const _cache = new Map();
function geomFor(t, spanX, spanY, band, ei) {
  const L = CM.layout, rv = L && L.river;
  if (!rv || !rv.present || !rv.samples || rv.samples.length < 2) return null;
  const stage = stageOf(ei);
  const key = (CM.layoutRecomputeAt || 0) + ':' + t.gx + ',' + t.gy + ':' + band + ':' + stage + ':' + PIER.reach + ':' + PIER.house
    + ':' + (PIER.crane ? 1 : 0) + (PIER.shadow ? 1 : 0) + (PIER.reflect ? 1 : 0) + (PIER.foam ? 1 : 0) + ':' + ((typeof window !== 'undefined' && window.__pontoonAxis) || 'a');
  const hit = _cache.get(t);
  if (hit && hit.key === key) return hit.g;
  const F = pierFrame(t, spanX, spanY, rv);
  let g = null;
  if (F) {
    const matKey = stage === 0 ? 'log' : stage === 1 ? 'plank' : stage === 2 ? 'stone' : 'concrete';
    const plan = pierPlan(stage, F.hw, band);
    // Ères d'énergie : la grue et sa charge prennent la nacre des bâtiments cosmiques
    // (un engin de chantier jaune y faisait anachronisme).
    const M = plan.cosmic ? { ...MATS[matKey], crane: [208, 214, 222], load: [138, 150, 168] } : MATS[matKey];
    const bake = bakePier(F, plan, M, CM.TILE, band, rv.samples);
    g = bake ? { F, plan, bake, stage } : null;
  }
  if (_cache.size > 8) _cache.clear();
  _cache.set(t, { key, g });
  return g;
}

// Le port (tuile moteur) dont l'emprise mouille, comme le peintre le décide. Mémoïsé
// par layout (et par nombre de tuiles, au cas où un achat l'enrichirait sur place) :
// la passe d'ombre le demande à chaque image.
function portTiles(L) {
  const nT = (L.tiles || []).length;
  if (L._pierPorts && L._pierPorts.n === nT) return L._pierPorts.list;
  const out = [];
  L._pierPorts = { n: nT, list: out };
  const rc = L.river && L.river.present && L.river.cells;
  if (!rc) return out;
  for (const t of (L.tiles || [])) {
    if (t.buildingId !== 'river_ports' || t.type !== 'engine') continue;
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    let w = false;
    for (let ax = 0; ax < sx && !w; ax += 1) for (let ay = 0; ay < sy && !w; ay += 1) {
      const k = (t.gx + ax) + ',' + (t.gy + ay);
      if (rc.has(k) || (L.river.banks && L.river.banks.has(k))) w = true;
    }
    if (w) out.push(t);
  }
  return out;
}

// ── LA POSE ─────────────────────────────────────────────────────────────────
function blitArt(ctx, cv, AX0, AY0, W, H) {
  const z = CM.cam.zoom, dpr = CM.dpr || 1;
  const camX = CM.cam.x - CM.cam.y, camY = (CM.cam.x + CM.cam.y) / 2;
  const snap = (v) => Math.round(v * dpr) / dpr;
  const X = snap((AX0 - camX) * z + CM.cw / 2), Y = snap((AY0 - camY) * z + CM.ch / 2);
  const X1 = snap((AX0 + W - camX) * z + CM.cw / 2), Y1 = snap((AY0 + H - camY) * z + CM.ch / 2);
  if (X1 < 0 || Y1 < 0 || X > CM.cw || Y > CM.ch) return null;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = z < 0.999;
  ctx.drawImage(cv, X, Y, X1 - X, Y1 - Y);
  ctx.imageSmoothingEnabled = prev;
  return { X, Y, w: X1 - X, h: Y1 - Y };
}

// Sous les bateaux, après les quais : l'ombre du ponton (multiply, force du soleil du
// moment) et son reflet (calque des reflets, posé sous la surface à l'image suivante).
export function paintPierUnder(ctx) {
  if (!PIER.on) return;
  const L = CM.layout;
  if (!L || CM.collapseAt) return;
  const band = (L.counts && L.counts.eraBand) | 0, ei = (L.counts && L.counts.eraIndex) | 0;
  for (const t of portTiles(L)) {
    const g = geomFor(t, t.spanX || t.size || 1, t.spanY || t.size || 1, band, ei);
    if (!g) continue;
    const B = g.bake;
    const a = PIER.shadow ? sunShadowAlpha() : 0;
    if (a > 0) {
      const prevA = ctx.globalAlpha, prevOp = ctx.globalCompositeOperation;
      ctx.globalAlpha = prevA * a;
      if (SUN_SHADOW.mode) ctx.globalCompositeOperation = SUN_SHADOW.mode;
      blitArt(ctx, B.shadow, B.AX0, B.AY0, B.W, B.H);
      ctx.globalAlpha = prevA; ctx.globalCompositeOperation = prevOp;
    }
    if (PIER.reflect) {
      const z = CM.cam.zoom;
      const camX = CM.cam.x - CM.cam.y, camY = (CM.cam.x + CM.cam.y) / 2;
      noteReflectionImage(ctx, B.refl, (B.AX0 - camX) * z + CM.cw / 2, (B.AY0 - camY) * z + CM.ch / 2, B.W * z, B.H * z);
    }
  }
}

// Le ponton lui-même, dans le tri du peintre (scène riveraine du port). Rend le point
// d'ancrage de la maison (px écran) : la racine du ponton, reculée de PIER.house sur
// la plage — ou null si rien n'a été posé.
export function drawPortPier(ctx, t, spanX, spanY, band, ei) {
  if (!PIER.on) return null;
  const g = geomFor(t, spanX, spanY, band, ei);
  if (!g) return null;
  blitArt(ctx, g.bake.body, g.bake.AX0, g.bake.AY0, g.bake.W, g.bake.H);
  return g;
}

// Le point d'ancrage MONDE (tuiles) de la maison du port : sur la plage, à `house`
// tuiles en arrière de la racine du ponton.
export function pierHouseFoot(g) {
  const F = g.F, back = PIER.house;
  return { x: F.root.x - F.dir.x * back, y: F.root.y - F.dir.y * back };
}

// Mouillage du bateau de l'ère : bord à bord le long de la TÊTE, côté large (le bateau
// est parallèle au fleuve, comme le cap que lui donne drawIsoPortBoat) ; sans tête
// (rondins), le long du tablier, à son bout. Rend des candidats (tuiles monde), du
// meilleur au repli — l'appelant écarte ceux qui tombent sur un pont.
export function pierMoorings(t, spanX, spanY, band, ei, effSize) {
  if (!PIER.on) return null;
  const g = geomFor(t, spanX, spanY, band, ei);
  if (!g) return null;
  const F = g.F, plan = g.plan;
  const P = (a, c) => ({ x: F.root.x + F.dir.x * a + F.across.x * c, y: F.root.y + F.dir.y * a + F.across.y * c });
  const out = [];
  if (plan.head) {
    // Au large de la tête d'une demi-largeur de coque : un cargo de 1,8 tuile y
    // mordait la tête à 0,2 (vu à la planche des ères, bande 6).
    const off = plan.reach + 0.12 + effSize * 0.27;
    // Décalé vers l'OUEST de la tête : la charge de la grue (coin est) pend au bout
    // du bateau au lieu de disparaître sous sa coque, peinte après elle.
    out.push({ ...P(off, -0.3), along: 'river' }, { ...P(off, 0.3), along: 'river' }, { ...P(off, -0.7), along: 'river' });
  }
  const side = plan.w / 2 + 0.06 + effSize * 0.2;
  const a = Math.max(0.4, plan.reach - effSize * 0.45);
  // Le long du tablier : flanc EST d'abord (côté visible), puis l'ouest.
  out.push({ ...P(a, side), along: 'pier' }, { ...P(a, -side), along: 'pier' });
  return { cands: out, dir: F.dir, si: F.si };
}
