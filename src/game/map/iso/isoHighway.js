"use strict";
// ── L'AUTOROUTE DE L'ARTÈRE — le dessin (lot 2 de docs/PLAN-ETAGES.md) ───────
//
// Le PLAN (tracé, profil, échangeur) vient du layout : L.highway, calculé par
// procedural/highwayPlan.js. Ici on le dessine, au grain du sol, comme les ponts :
//   · le TABLIER, découpé en tronçons d'une demi-cellule. Chaque tronçon donne
//     DEUX acteurs au peintre : le dessus (chaussée, marquages, face intérieure des
//     glissières qui regardent ailleurs) trié à son coin ARRIÈRE, et la tranche
//     (face visible, sous-face, glissière extérieure) triée à son coin AVANT —
//     ce qui roule dessus passe entre les deux ;
//   · les PILES en T sur le terre-plein central, les lampadaires, l'OMBRE au sol ;
//   · la CIRCULATION : les vraies voitures de l'ère (drawIsoVehicle, skins de
//     vehSkinFor), posées à la hauteur du tablier, en pur f(now).
// Tout morceau qui se répète est CUIT (elevPaint) : le tablier droit tient en deux
// images par zoom.
//
// Molette : __highway({ on, cars, lamps, shadow }).
import { CM } from '../layout.js';
import { worldToScreen, depthOf } from './projection.js';
import { drawIsoVehicle } from './isoUnits.js';
import { muteSunShadow } from './isoSunShadow.js';
import { vehSkinFor } from '../agents.js';
import { bankRibbon, loopRibbons, HIGHWAY } from '../procedural/highwayPlan.js';
import { boxShapes, bakeShapes, blitBaked, makeBakeCache, artKdAt, elevGlow as glowAt, segGeo, shadeFace as shade, relTo as rel, vquad } from './elevPaint.js';

export const HWY = { on: true, cars: 1, lamps: 1, shadow: 0.55, th: 0.26, ph: 0.1 };

// Matière par ère : chaussée (2 tons), marquages, faces (éclairée / moyenne /
// ombre), sous-face, face intérieure des glissières, piles, contour, et la lueur
// des bandes de rive la nuit (null = aucune).
const MAT = {
  6: { top: ['#55575d', '#5c5e64'], line: 'rgba(236,232,220,0.85)', mid2: 'rgba(240,200,80,0.9)', lit: '#cfccc4', mid: '#aeaaa2', dark: '#86837d', under: '#5d5b57', parIn: '#9a978f', pyl: ['#c4c0b8', '#9e9a92'], out: '#3b3a37', edge: null, lamp: '255,190,110' },
  7: { top: ['#4a5552', '#505b58'], line: 'rgba(226,246,236,0.85)', mid2: 'rgba(120,230,190,0.9)', lit: '#e6f0ea', mid: '#c4d8cd', dark: '#93ab9e', under: '#5e6f66', parIn: '#b5c9be', pyl: ['#e0ece5', '#a9c2b5'], out: '#2d3a33', edge: '150,255,210', lamp: '170,255,220' },
  8: { top: ['#4f4a44', '#56514a'], line: 'rgba(250,240,214,0.85)', mid2: 'rgba(240,196,90,0.9)', lit: '#fbf3dc', mid: '#ead9a8', dark: '#c9ad6a', under: '#7a6a48', parIn: '#e0cfa0', pyl: ['#f6ecd0', '#d6bf86'], out: '#40341c', edge: '255,220,140', lamp: '255,214,140' },
  9: { top: ['#4c4860', '#534f68'], line: 'rgba(240,236,252,0.85)', mid2: 'rgba(180,150,255,0.9)', lit: '#f4f1fb', mid: '#dcd4ee', dark: '#b8acd6', under: '#6c6288', parIn: '#cfc5e6', pyl: ['#efeafa', '#c4b8e0'], out: '#3a3050', edge: '170,140,255', lamp: '200,180,255' },
};
const matFor = (band) => MAT[Math.max(6, Math.min(9, band | 0))];

// ── RUBANS (monde) ───────────────────────────────────────────────────────────
let _ribFor = null, _ribs = [];
export function highwayRibbons(H, T) {
  if (!H) return [];
  if (_ribFor === H) return _ribs;
  const out = [];
  for (const b of H.banks) out.push(bankRibbon(H, b));
  for (const r of loopRibbons(H)) out.push(r);
  for (const r of out) {
    r.pts = r.pts.map((p) => ({ x: p.x * T, y: p.y * T, z: p.z * T }));
    r.cum = [0];
    for (let i = 1; i < r.pts.length; i += 1) r.cum.push(r.cum[i - 1] + Math.hypot(r.pts[i].x - r.pts[i - 1].x, r.pts[i].y - r.pts[i - 1].y));
    // Par tronçon : géométrie, et CLÉ DU PEINTRE = le coin avant (sud) de l'emprise,
    // comme un bâtiment. ⚠ Triés au coin ARRIÈRE (premier jet), les tronçons passaient
    // sous les tours situées DERRIÈRE eux (un bâtiment se trie à SON coin sud, plus
    // loin que le coin arrière d'un tablier voisin) : « des bâtiments passent dans
    // l'autoroute » (Raph, 2026-10-02).
    r.geo = []; r.dF = [];
    for (let i = 0; i < r.pts.length - 1; i += 1) {
      const g = segGeo(r.pts[i], r.pts[i + 1], r.w * T);
      r.geo.push(g);
      r.dF.push(Math.max(...[g.AL, g.BL, g.AR, g.BR].map((p) => depthOf(p[0], p[1]))));
    }
    r.skipL = new Array(r.geo.length).fill(false);
    r.skipR = new Array(r.geo.length).fill(false);
  }
  // LES BRETELLES S'INSÈRENT : la glissière du tablier s'ouvre là où une boucle le
  // longe, et la boucle n'a pas de glissière tant qu'elle est sur le tablier
  // (retour Raph : « la barrière de l'autoroute coupe le bras d'insertion »).
  const x0 = H.ax * T, x1 = (H.ax + 2) * T;
  for (const lp of out.filter((r) => !r.main)) {
    const west = lp.pts[lp.pts.length - 1].x < x0;
    let ymin = Infinity, ymax = -Infinity;
    for (const p of lp.pts) {
      const near = west ? p.x > x0 - 0.55 * T : p.x < x1 + 0.55 * T;
      if (near && p.z > 0.2 * T) { if (p.y < ymin) ymin = p.y; if (p.y > ymax) ymax = p.y; }
    }
    ymin -= 0.25 * T; ymax += 0.25 * T;
    for (const r of out.filter((q) => q.main)) {
      r.geo.forEach((g, i) => {
        const ya = Math.min(r.pts[i].y, r.pts[i + 1].y), yb = Math.max(r.pts[i].y, r.pts[i + 1].y);
        if (yb < ymin || ya > ymax) return;
        // ruban principal orienté vers +y : sa gauche est l'OUEST
        if (west) r.skipL[i] = true; else r.skipR[i] = true;
      });
    }
    const onDeck = (p) => p[0] > x0 - 0.06 * T && p[0] < x1 + 0.06 * T;
    lp.geo.forEach((g, i) => {
      if (onDeck(g.AL) || onDeck(g.BL)) lp.skipL[i] = true;
      if (onDeck(g.AR) || onDeck(g.BR)) lp.skipR[i] = true;
    });
  }
  _ribFor = H; _ribs = out;
  return out;
}

function backShapes(M, r, a, b, g, i, T, skipL, skipR) {
  const s = [];
  const ph = HWY.ph * T;
  s.push({ poly: [rel(a, g.AL), rel(a, g.BL), rel(a, g.BR), rel(a, g.AR)], col: M.top[i % 2] });
  // marquages : rives pleines, tirets entre voies (deux sur quatre), axe central
  const half = r.w / 2;
  const tick = (u, off, col) => {
    const p = [a.x + (b.x - a.x) * u + g.nx * off, a.y + (b.y - a.y) * u + g.ny * off, a.z + (b.z - a.z) * u];
    s.push({ px: rel(a, p), col });
  };
  for (let u = 0; u < 1; u += 0.25) {
    tick(u, half - 0.1 * T, M.line); tick(u, -half + 0.1 * T, M.line);
    if (r.main) {
      if ((i % 2) === 0) { tick(u, 0.49 * T, M.line); tick(u, -0.49 * T, M.line); }
      tick(u, 0.03 * T, M.mid2); tick(u, -0.03 * T, M.mid2);
    }
  }
  // glissières dont la face extérieure regarde AILLEURS : on voit leur face intérieure
  const visL = (g.nx + g.ny) > 0, visR = (-g.nx - g.ny) > 0;
  if (!visL && !skipL) s.push(vquad(a, g.AL, g.BL, 0, ph, M.parIn));
  if (!visR && !skipR) s.push(vquad(a, g.AR, g.BR, 0, ph, M.parIn));
  return s;
}
function frontShapes(M, g, a, T, skipL, skipR, loop) {
  const s = [];
  const ph = HWY.ph * T, th = HWY.th * T;
  const visL = (g.nx + g.ny) > 0, visR = (-g.nx - g.ny) > 0;
  // Sur le tablier, une boucle n'a ni tranche ni glissière (elle EST la chaussée).
  if (visL && !(loop && skipL)) {
    s.push(vquad(a, g.AL, g.BL, -th, 0, shade(M, g.nx, g.ny)));
    s.push(vquad(a, g.AL, g.BL, -th, -th * 0.72, M.under));
    if (!skipL) s.push(vquad(a, g.AL, g.BL, 0, ph, M.lit));
  }
  if (visR && !(loop && skipR)) {
    s.push(vquad(a, g.AR, g.BR, -th, 0, shade(M, -g.nx, -g.ny)));
    s.push(vquad(a, g.AR, g.BR, -th, -th * 0.72, M.under));
    if (!skipR) s.push(vquad(a, g.AR, g.BR, 0, ph, M.mid));
  }
  return s;
}
function pierShapes(M, r, g, top, T) {
  const big = r.main, c = (big ? 0.16 : 0.1) * T;
  const s = boxShapes(-c, -c, c, c, -top, -(big ? 0.14 : 0.05) * T, null, M.pyl[0], M.pyl[1], M.out);
  if (!big) return s;
  // chevêtre : poutre transversale sous le tablier
  const hw = r.w * 0.42;
  const ax = Math.abs(g.nx) > Math.abs(g.ny);
  if (ax) s.push(...boxShapes(-hw, -0.2 * T, hw, 0.2 * T, -0.18 * T, 0, M.mid, M.lit, M.dark, null));
  else s.push(...boxShapes(-0.2 * T, -hw, 0.2 * T, hw, -0.18 * T, 0, M.mid, M.lit, M.dark, null));
  return s;
}
// Gravats d'une travée tombée : trois blocs de dalle et de pile, de travers.
function rubbleShapes(M, T) {
  return [
    ...boxShapes(-0.45 * T, -0.3 * T, 0.2 * T, 0.25 * T, 0, 0.14 * T, M.top[0], M.mid, M.dark, M.out),
    ...boxShapes(0.05 * T, -0.15 * T, 0.5 * T, 0.35 * T, 0, 0.22 * T, M.lit, M.mid, M.dark, M.out),
    ...boxShapes(-0.2 * T, 0.1 * T, 0.08 * T, 0.42 * T, 0, 0.1 * T, M.pyl[0], M.pyl[1], M.dark, M.out),
  ];
}
function lampShapes(M, T) {
  const s = [];
  // mât plein (des pixels espacés se lisaient en pointillé au fort zoom)
  s.push(...boxShapes(-0.025 * T, -0.025 * T, 0.025 * T, 0.025 * T, 0, 0.62 * T, null, M.out, M.out, null));
  s.push({ px: [-0.06 * T, 0.06 * T, 0.64 * T], col: '#d8d4c8' }, { px: [0, 0, 0.64 * T], col: '#d8d4c8' }, { px: [0.06 * T, -0.06 * T, 0.64 * T], col: '#d8d4c8' });
  return s;
}

const _bakes = makeBakeCache(1600);
// Au zoom de REPOS (elevPaint.getZ) : pendant un glissement de zoom, la dernière
// cuisson de la forme, posée à l'échelle — plus 109 à 139 canvas recuits par frame.
function baked(key, make) {
  const d = CM.dpr || 1;
  return _bakes.getZ(key, d, (z) => bakeShapes(make(), z, d, artKdAt(z, d)));
}
const r1 = (v) => Math.round(v * 10) / 10;

// ── LA CIRCULATION ───────────────────────────────────────────────────────────
const CAR_TYPES = ['car', 'car', 'car', 'taxi', 'car', 'bus', 'car', 'van', 'car', 'truck'];
function h01(n) {
  let h = Math.imul((n | 0) ^ 0x85ebca6b, 2654435761) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}
// Point du ruban à l'abscisse curviligne s : position, cap, hauteur.
function along(r, s) {
  let j = 1;
  while (j < r.cum.length - 1 && r.cum[j] < s) j += 1;
  const a = r.pts[j - 1], b = r.pts[j], seg = (r.cum[j] - r.cum[j - 1]) || 1;
  const u = Math.max(0, Math.min(1, (s - r.cum[j - 1]) / seg));
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u, ux: (b.x - a.x) / seg, uy: (b.y - a.y) / seg, i: j - 1 };
}
// Les voitures du tablier, par id (ri·1000 + li·100 + i) : bornées par le plan et
// réutilisées ; vidées quand le plan change (audit du 05/10, MEM-9 — les entrées d'un
// plan quitté restaient). Cf. highwayActors.
const _veh = [];
let _vehFor = null;
function carActors(r, ri, now, band, T, out, vis) {
  const total = r.cum[r.cum.length - 1];
  if (total <= 0) return;
  const t = now / 1000;
  r.lanes.forEach((lo, li) => {
    const dir = r.lanes.length === 1 ? 1 : (lo > 0 ? 1 : -1);
    const gap = (1.4 + h01(ri * 31 + li * 7) * 1.2) * T;
    const n = Math.floor(total / gap);
    for (let i = 0; i < n; i += 1) {
      const id = ri * 1000 + li * 100 + i;
      if (h01(id * 13) < 0.3 * (2 - HWY.cars)) continue;
      const s = ((t * 2.4 * T * dir + i * gap + h01(id * 3) * gap * 0.5) % total + total) % total;
      const p = along(r, s);
      if (p.z < 0.12 * T) continue;                       // au sol : les voitures du jeu y sont déjà
      const x = p.x + -p.uy * lo * T, y = p.y + p.ux * lo * T;
      if (!vis(x, y, p.z)) continue;
      const hx = p.ux * dir, hy = p.uy * dir;
      const vdir = Math.abs(hx) > Math.abs(hy) ? (hx > 0 ? 0 : 1) : (hy > 0 ? 2 : 3);
      const type = CAR_TYPES[Math.floor(h01(id * 17) * CAR_TYPES.length)];
      const v = _veh[id] || (_veh[id] = { x: 0, y: 0, gx: 0, gy: 0, dir: 0, type, skin: vehSkinFor(type, id * 2654435761, band), rollDist: 0, fade: 1, _lox: 0, _loy: 0, tx: 0, ty: 0, parkT: 0, pauseT: 0 });
      if (v._band !== band) { v._band = band; v.type = type; v.skin = vehSkinFor(type, id * 2654435761, band) || undefined; }
      const z = p.z;
      // Clé : après SON tronçon et le suivant (le suivant, plus avant, recouvrirait le
      // bas de la carrosserie), jamais avant le sol qu'elle survole.
      const dCar = Math.max(depthOf(x, y), r.dF[p.i], r.dF[Math.min(r.dF.length - 1, p.i + 1)]) + 0.05 * T;
      out.push({ wx: x, wy: y, d: dCar, draw(ctx, nw) {
        v.x = x; v.y = y; v.gx = Math.floor(x / T); v.gy = Math.floor(y / T);
        v.dir = vdir; v.rollDist = s; v.tx = x + hx * T; v.ty = y + hy * T;
        const zz = CM.cam.zoom, nn = CM.nightF || 0;
        // ⚠ PERF (rendu logiciel) : les phares du jeu sont deux arcs et un dégradé radial
        // par véhicule — ×60 voitures sur un tablier, c'était le poste n° 2 de la nuit.
        // On les coupe (parkT > 0 éteint les phares, rien d'autre ne le lit en iso) et on
        // pose deux lueurs au pixel, comme le trafic aérien.
        v.parkT = nn > 0.3 ? 1 : 0;
        ctx.save();
        ctx.translate(0, -Math.round(z * zz * (CM.dpr || 1)) / (CM.dpr || 1));
        // ⚠ Ombre et REFLET coupés (muteSunShadow) : sous la translation, le crochet du
        // reflet lirait la voiture à une fausse hauteur d'écran et la refléterait dans
        // le fleuve ; le tablier porte déjà son ombre.
        try { muteSunShadow(() => drawIsoVehicle(ctx, v, nw, zz)); } finally { ctx.restore(); }
        if (nn > 0.3) {
          const f = worldToScreen(x + hx * 0.22 * T, y + hy * 0.22 * T, z + 0.08 * T);
          const r0 = worldToScreen(x - hx * 0.22 * T, y - hy * 0.22 * T, z + 0.08 * T);
          glowAt(f.x, f.y, 4 * zz / 0.625, '255,244,210', 0.65 * nn);
          glowAt(r0.x, r0.y, 3 * zz / 0.625, '255,70,50', 0.6 * nn);
        }
      } });
    }
  });
}

// ── LES ACTEURS ──────────────────────────────────────────────────────────────
export const hwyStats = { segs: 0, cars: 0 };
export function highwayActors(now, out, decay = 0) {
  hwyStats.segs = 0; hwyStats.cars = 0;
  const L = CM.layout;
  if (!HWY.on || !L || !L.highway || CM.lodActive) return;
  const T = CM.TILE, z = CM.cam.zoom, d = CM.dpr || 1;
  const band = (L.counts && L.counts.eraBand) | 0;
  const M = matFor(band);
  const night = (CM.nightF || 0) * (1 - decay);
  const mg = 3 * T * z;
  const vis = (x, y, zz) => {
    const p = worldToScreen(x, y, zz);
    return p.x > -mg && p.x < CM.cw + mg && p.y > -mg && p.y < CM.ch + mg * 2;
  };
  const ribs = highwayRibbons(L.highway, T);
  if (_vehFor !== ribs) { _vehFor = ribs; _veh.length = 0; }
  ribs.forEach((r, ri) => {
    for (let i = 0; i < r.pts.length - 1; i += 1) {
      const a = r.pts[i], b = r.pts[i + 1];
      if (Math.max(a.z, b.z) < 0.03 * T) continue;      // au sol : la rue suffit
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (!vis(mx, my, a.z) && !vis(mx, my, 0)) continue;
      // LA CHUTE (lot 4) : des travées entières tombent, par grappes de 3 tronçons
      // (un tirage par grappe) ; leurs gravats restent au sol, sous le vide.
      if (decay > 0.5 && h01(ri * 977 + Math.floor(i / 3) * 31) < (decay - 0.4) * 1.0) {
        if (i % 3 === 1) out.push({ wx: mx, wy: my, d: depthOf(mx, my), draw(ctx) {
          const bk = baked('ru|' + band, () => rubbleShapes(M, T));
          const s0 = worldToScreen(mx, my, 0);
          blitBaked(ctx, bk, s0.x, s0.y, d);
        } });
        continue;
      }
      hwyStats.segs += 1;
      const g = r.geo[i];
      const skL = r.skipL[i], skR = r.skipR[i];
      // Les CLÉS DE FORME du tronçon et son ombre, gardées sur le plan (audit du 05/10,
      // PERF-54) : elles ne changent qu'avec lui (et la bande, et les molettes d'ombre et
      // d'épaisseur) ; rebâties à chaque frame, elles se rehachaient aussi à chaque
      // lecture du cache. Mêmes textes de clé que la version calculée sur place.
      const kc = r.kc || (r.kc = []);
      let K = kc[i];
      if (!K || K.band !== band) {
        const kGeo = r1(b.x - a.x) + ',' + r1(b.y - a.y) + ',' + r1(a.z) + ',' + r1(b.z - a.z) + '|' + r.w + '|' + (r.main ? 1 : 0) + (skL ? 'l' : '') + (skR ? 'r' : '');
        K = kc[i] = { band, sh: 'sh|' + kGeo, bk: 'bk|' + band + '|' + (i % 2) + '|' + kGeo, fr: 'fr|' + band + '|' + kGeo, sk: null, o: null, q: null, sd: 0, th: null, pi: '', la: '' };
      }
      const dFront = r.dF[i];
      // ombre au sol, décalée vers le bas-droite (soleil haut-gauche)
      if (HWY.shadow > 0) {
        const sk = HWY.shadow;
        if (K.sk !== sk) {
          const o = { x: a.x + a.z * sk, y: a.y, z: 0 };
          K.q = [g.AL, g.BL, g.BR, g.AR].map((p) => [p[0] + p[2] * sk - o.x, p[1] - o.y, 0]);
          K.sd = Math.min(...K.q.map((p) => depthOf(p[0] + o.x, p[1] + o.y)));
          K.o = o; K.sk = sk;
        }
        const o = K.o, q = K.q, kSh = K.sh;
        out.push({ wx: o.x, wy: o.y, d: K.sd - 0.05 * T, draw(ctx) {
          const bk = baked(kSh, () => [{ poly: q, col: '#141828' }]);
          const p = worldToScreen(o.x, o.y, 0);
          blitBaked(ctx, bk, p.x, p.y, d, 0.16 * (1 - 0.75 * (CM.nightF || 0)));
        } });
      }
      const kBk = K.bk, kFr = K.fr;
      out.push({ wx: mx, wy: my, d: dFront - 0.002 * T, draw(ctx) {
        const bk = baked(kBk, () => backShapes(M, r, a, b, g, i, T, skL, skR));
        const p = worldToScreen(a.x, a.y, a.z);
        blitBaked(ctx, bk, p.x, p.y, d);
      } });
      out.push({ wx: mx, wy: my, d: dFront, draw(ctx) {
        const bk = baked(kFr, () => frontShapes(M, g, a, T, skL, skR, !r.main));
        const p = worldToScreen(a.x, a.y, a.z);
        blitBaked(ctx, bk, p.x, p.y, d);
        // la nuit, les ères cosmiques allument la rive du tablier
        if (M.edge && night > 0.05) {
          const pb = worldToScreen(b.x, b.y, b.z);
          glowAt((p.x + pb.x) / 2, (p.y + pb.y) / 2 + HWY.th * T * z * 0.5, 3 * z / 0.625, M.edge, 0.35 * night);
        }
      } });
      // piles : sur le terre-plein (tablier principal) toutes les 3 cellules, sous
      // les boucles toutes les 4 tranches
      const every = r.main ? 6 : 4;
      const top = a.z - HWY.th * T;
      if (i % every === 0 && top > 0.35 * T) {
        if (K.th !== HWY.th) { K.th = HWY.th; K.pi = 'pi|' + band + '|' + r1(top) + '|' + (r.main ? 1 : 0) + '|' + (Math.abs(g.nx) > Math.abs(g.ny) ? 1 : 0); }
        const kPi = K.pi;
        // ⚠ AVANT le dessus du tablier : le chevêtre est SOUS la chaussée ; trié à
        // l'aplomb de l'axe, il se peignait par-dessus elle.
        out.push({ wx: a.x, wy: a.y, d: dFront - 0.3 * T, draw(ctx) {
          const bk = baked(kPi, () => pierShapes(M, r, g, top, T));
          const p = worldToScreen(a.x, a.y, top);
          blitBaked(ctx, bk, p.x, p.y, d);
        } });
      }
      // lampadaires sur l'axe du tablier principal, toutes les 2 cellules
      if (HWY.lamps > 0 && r.main && i % 4 === 2 && a.z > 0.5 * T) {
        const kLa = K.la || (K.la = 'la|' + band);
        out.push({ wx: a.x, wy: a.y, d: dFront + 0.01 * T, draw(ctx) {
          const p = worldToScreen(a.x, a.y, a.z);
          blitBaked(ctx, baked(kLa, () => lampShapes(M, T)), p.x, p.y, d);
          if (night > 0.05) {
            const ph = worldToScreen(a.x, a.y, a.z + 0.64 * T);
            glowAt(ph.x, ph.y, 13 * z / 0.625, M.lamp, 0.5 * night);
          }
        } });
      }
    }
    if (HWY.cars > 0 && decay < 0.5) { const n0 = out.length; carActors(r, ri, now, band, T, out, vis); hwyStats.cars += out.length - n0; }
  });
}

if (typeof window !== 'undefined') {
  window.__highway = (o) => { if (o) Object.assign(HWY, o); const L = CM.layout; return { ...HWY, plan: L && L.highway ? { banks: L.highway.banks.map((b) => ({ sign: b.sign, y0: b.y0, len: b.len, s0: b.s0, s1: b.s1, ramp: b.ramp })), interchange: L.highway.interchange, ax: L.highway.ax } : null, stats: { ...hwyStats }, deck: HIGHWAY.deck }; };
}
