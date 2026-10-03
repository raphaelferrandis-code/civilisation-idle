"use strict";
// ── LE LIEU DE CHAQUE MERVEILLE (docs/PLAN-MERVEILLES.md §5) ──────────────────
//
// Décision de Raph (2026-10-01) : « un vrai lieu » propre à chaque merveille —
// fini le grand carré pâle et nu. Deux couches :
//   · le SOL du lieu (dallage de l'ère, allée, pelouses, rosace, parterres,
//     terre de chantier…) : un raster plat cuit DANS le sol de la carte, par-dessus
//     le parvis (isoWonderGround) — les ombres des arbres voisins y restent justes ;
//   · le DÉCOR en relief (cyprès, fontaines, blocs de chantier, obélisques) : de
//     petits rasters triés un par un avec la foule (isoWonder.js), plus quelques
//     objets tirés des planches de la ville (statues, braseros, réverbères).
//
// Repère : celui de la merveille (x est, y sud, origine au centre de la case de
// l'emplacement). Le lieu est le carré |x|, |y| ≤ half (le parvis pavé).
//
// Pur : aucun DOM, aucun CM.
import { put, rgbOf, h32, frameOf, ramp, outline } from './isoPixelPaint.js';
import { mats, box, revolve, cyl, taper, pick, obelisk, menhirs } from './wonderBake.js';

const V = true;
const fm = (a, n) => ((a % n) + n) % n;
const WATER = ['#a9d0de', '#7fb0c9', '#5a8cab', '#41698a'];
const CYPRESS = ['#6d8a45', '#56713a', '#43592d', '#324322', '#253219'];
const DIRT = ['#b29a74', '#9c835f', '#86704f', '#6c5a40'];

// ── Motifs de sol ────────────────────────────────────────────────────────────
// Dallage à joints décalés (s px), deux tons tirés de la rampe de l'ère.
function slabs(P, x, y, s, base) {
  const row = Math.floor((y + 4096) / s), off = row & 1 ? s / 2 : 0;
  const col = Math.floor((x + off + 4096) / s);
  if (fm(y, s) < 1 || fm(x + off, s) < 1) return ramp(P, base + 2);
  return ramp(P, base + (h32(row, col, 3) % 6 === 0 ? 1 : 0));
}
function grassAt(x, y) {
  const n = h32(Math.floor(x + 4096), Math.floor(y + 4096), 9) % 11;
  return rgbOf(['#8fae5c', '#86a555', '#7c9b4e'][n === 0 ? 2 : n < 4 ? 1 : 0]);
}
function snowTurf(x, y) {
  const n = h32(Math.floor(x + 4096), Math.floor(y + 4096), 9) % 13;
  return rgbOf(n === 0 ? '#8fae5c' : n < 3 ? '#dfe7ef' : '#f1f5f9');
}
function dirt(x, y) {
  const n = h32(Math.floor((x + 4096) / 2), Math.floor((y + 4096) / 2), 5) % 13;
  return rgbOf(DIRT[n === 0 ? 3 : n < 3 ? 2 : n < 7 ? 1 : 0]);
}

// ── Plan du lieu, par merveille ──────────────────────────────────────────────
// Rend { col(x, y) → couleur | null (le parvis reste), decor, props }.
//   decor : { kind: 'cypress'|'topiary'|'fountain'|'blocks'|'logs'|'obelisk'|'menhir', x, y, s? }
//   props : comme les recettes (statue, brazier, gaslamp, ledlamp, flame).
export function placePlan(id, tier, K, B, half) {
  const P = K.pal, hb = B / 2, T = 32;
  const turf = K.snow ? snowTurf : grassAt;
  const decor = [], props = [];
  const lamp = (x, y) => {
    if (K.band <= 4) props.push({ prop: 'brazier', x, y, h: 0 });
    else props.push({ prop: K.band === 5 ? 'gaslamp' : 'ledlamp', x, y, h: 0 });
  };
  const edge = (x, y) => {
    const d = half - Math.max(Math.abs(x), Math.abs(y));
    if (d < 2) return ramp(P, 4);
    if (d < 3) return ramp(P, 1);
    return null;
  };
  const pave = (x, y) => slabs(P, x, y, 16, 2);
  let inner = pave;
  if (id === 'dynasty1') {
    // ALLÉE PROCESSIONNELLE : du bord sud à l'escalier, bordée de pelouses et de
    // cyprès ; deux statues gardent l'entrée.
    const aw = Math.max(12, Math.min(0.7 * T, B * 0.16)), y0 = hb + 3;
    const lx0 = aw + 4, lx1 = half - 7, ly0 = y0 + 4, ly1 = half - 7;
    inner = (x, y) => {
      const ax = Math.abs(x);
      if (y > y0 - 2 && ax < aw) return ax > aw - 1.5 ? ramp(P, 4) : slabs(P, y, x, 10, 1);
      if (ax >= lx0 && ax <= lx1 && y >= ly0 && y <= ly1) {
        if (ax < lx0 + 1.5 || ax > lx1 - 1.5 || y < ly0 + 1.5 || y > ly1 - 1.5) return rgbOf(CYPRESS[3]);
        return turf(x, y);
      }
      return pave(x, y);
    };
    if (ly1 - ly0 > 10) {
      for (let y = ly0 + 6; y < ly1 - 2; y += 13) for (const sx of [-1, 1]) decor.push({ kind: 'cypress', x: sx * (aw + 7), y });
    }
    props.push({ prop: 'statue', x: -(aw + 3), y: half - 6, h: 0 }, { prop: 'statue', x: aw + 3, y: half - 6, h: 0 });
    if (tier >= 3) { lamp(-(half - 8), -(half - 8)); lamp(half - 8, -(half - 8)); }
  } else if (id === 'pop1m') {
    // ROSACE de dalles autour de la colonne, quatre fontaines aux diagonales.
    const rc = half - 6;
    inner = (x, y) => {
      const rr = Math.hypot(x, y);
      if (rr < rc) {
        if (Math.abs(rr - rc) < 1.6) return ramp(P, 4);
        const ring = Math.floor(rr / 9), ang = Math.atan2(y, x);
        const sect = (ang + Math.PI) / (2 * Math.PI) * (12 + ring * 4);
        if (fm(rr, 9) < 1 || fm(sect, 1) < 0.06) return ramp(P, 3);
        return ramp(P, ring & 1 ? 1 : 2);
      }
      return pave(x, y);
    };
    const f = rc * 0.72 / Math.SQRT2 + 2;
    if (rc > 40) {
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        decor.push({ kind: 'fountain', x: sx * f, y: sy * f, s: Math.min(11, rc * 0.14) });
        props.push({ prop: 'jet', x: sx * f, y: sy * f, h: 10 });
      }
    }
    for (const [x, y] of [[0, rc - 4], [rc - 4, 0], [-(rc - 4), 0], [0, -(rc - 4)]]) lamp(x, y);
  } else if (id === 'era_kingdom') {
    // PARTERRES À LA FRANÇAISE devant le palais : broderies de buis sur gazon,
    // allée centrale, ifs taillés aux angles.
    const aw = Math.max(10, B * 0.08), y0 = hb + 2;
    const bx0 = aw + 3, bx1 = half - 6, by0 = y0 + 3, by1 = half - 6;
    inner = (x, y) => {
      const ax = Math.abs(x);
      if (y > y0 - 2 && ax < aw) return slabs(P, y, x, 8, 1);
      if (ax >= bx0 && ax <= bx1 && y >= by0 && y <= by1) {
        if (ax < bx0 + 2 || ax > bx1 - 2 || y < by0 + 2 || y > by1 - 2) return rgbOf(CYPRESS[2]);
        const u = (ax - bx0) / (bx1 - bx0), v = (y - by0) / (by1 - by0);
        const sw = Math.abs(Math.sin(u * Math.PI * 3) * 0.35 + 0.5 - v);
        if (sw < 0.05 || Math.abs(Math.hypot(u - 0.5, v - 0.5) - 0.28) < 0.035) return rgbOf(CYPRESS[2]);
        return turf(x, y);
      }
      return slabs(P, x, y, 6, 1);
    };
    if (by1 - by0 > 8) {
      for (const sx of [-1, 1]) for (const yy of [by0 + 2, by1 - 2]) {
        decor.push({ kind: 'topiary', x: sx * (bx0 + 2), y: yy }, { kind: 'topiary', x: sx * (bx1 - 2), y: yy });
      }
    }
    props.push({ prop: 'statue', x: -(aw + 1), y: half - 5, h: 0 }, { prop: 'statue', x: aw + 1, y: half - 5, h: 0 });
  } else if (id === 'era_empire') {
    // CHANTIER : terre battue, blocs et bois empilés ; un parvis pavé devant la
    // façade dès qu'elle existe ; au rang V, il ne reste qu'une cour de chantier.
    const parvis = (x, y) => tier >= 3 && Math.abs(x) < B * 0.36 && y > B * 0.42;
    const yard = (x, y) => (tier >= 5 ? x > B * 0.3 && y > B * 0.12 : !parvis(x, y));
    inner = (x, y) => {
      if (parvis(x, y)) return slabs(P, x, y, 5, 2);
      if (yard(x, y)) return dirt(x, y);
      return pave(x, y);
    };
    const spots = tier >= 5
      ? [[B * 0.4, B * 0.5, 'blocks'], [B * 0.55, B * 0.3, 'logs']]
      : [[-B * 0.5, -B * 0.1, 'blocks'], [B * 0.52, -B * 0.25, 'logs'], [-B * 0.42, B * 0.4, 'blocks'], [B * 0.5, B * 0.22, 'blocks'], [-B * 0.1, -B * 0.55, 'logs']];
    for (const [x, y, kind] of spots) if (Math.max(Math.abs(x), Math.abs(y)) < half - 8) decor.push({ kind, x, y });
  } else if (id === 'era_singularity') {
    // PLACE CIRCULAIRE : anneaux incrustés de métal et de lumière, rayons.
    const rc = half - 5;
    inner = (x, y) => {
      const rr = Math.hypot(x, y);
      if (rr > rc) return pave(x, y);
      for (const k of [0.95, 0.72, 0.5]) if (Math.abs(rr - rc * k) < 1.1) return k === 0.72 ? rgbOf(P.glow) : pick(P.metal, 0.5);
      const ang = Math.atan2(y, x);
      if (rr > rc * 0.72 && rr < rc * 0.95 && fm((ang + Math.PI) / (2 * Math.PI) * 16, 1) < 0.07) return pick(P.metal, 0.5);
      return ramp(P, rr > rc * 0.72 ? 5 : 6);
    };
    if (tier >= 3) {
      for (let k = 0; k < 8; k += 1) {
        const a = (k / 8) * 2 * Math.PI + Math.PI / 8;
        decor.push({ kind: 'obelisk', x: (rc + 2) * Math.cos(a), y: (rc + 2) * Math.sin(a) });
      }
    }
  }
  // L'hiver, la neige tient sur le dallage : quelques dalles affleurent encore.
  const snowy = (x, y) => {
    const c = inner(x, y);
    if (!K.snow || !c) return c;
    const n = h32(Math.floor((x + 4096) / 3), Math.floor((y + 4096) / 3), 31) % 10;
    return n < 6 ? rgbOf(n < 4 ? '#f1f5f9' : '#e2e8ef') : c;
  };
  return {
    col: (x, y) => edge(x, y) || snowy(x, y),
    decor, props,
  };
}

// SOL du lieu : raster plat (h = 0) couvrant le carré |x|, |y| ≤ half.
export function bakePlaceGround(plan, half) {
  const R = frameOf(V, [[-half, half, -half, half, 0, 0]]);
  // (plan.col rend null là où le parvis doit rester tel quel.)
  for (let j = 0; j < R.h; j += 1) {
    for (let i = 0; i < R.w; i += 1) {
      const X = R.ox + i + 0.5, Y = R.oy + j + 0.5;
      const x = Y + X / 2, y = Y - X / 2;
      if (Math.abs(x) > half || Math.abs(y) > half) continue;
      const c = plan.col(x, y);
      if (c) put(R, i, j, c);
    }
  }
  return R;
}

// DÉCOR en relief : un petit raster par pièce, origine au pied.
export function bakeDecor(kind, K, s = 10) {
  const X = mats(K);
  const R = frameOf(V, [[-14, 14, -14, 14, -2, 44]]);
  if (kind === 'cypress' || kind === 'topiary') {
    const H = kind === 'cypress' ? 26 : 11, r = kind === 'cypress' ? 3.4 : 3;
    revolve(R, 0, 0, 0, 2, cyl(0.9), () => rgbOf('#5a4028'));
    revolve(R, 0, 0, 1.5, 1.5 + H, (h) => r * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, (h - 1.5) / H)) * 0.92 + 0.12), 0.8),
      (I, h, a) => (K.snow && I > 0.62 ? rgbOf('#eef3f8')
        : rgbOf(CYPRESS[Math.min(4, Math.max(0, Math.round((1 - I) * 3.2) - 1 + (h32(Math.round(a * 6), Math.round(h / 2), 3) % 5 === 0 ? 1 : 0)))])));
  } else if (kind === 'tree') {
    // Arbre d'ornement : fût court, houppier rond.
    revolve(R, 0, 0, 0, 7, cyl(1.2), () => rgbOf('#5a4028'));
    revolve(R, 0, 0, 5, 27, (h) => 9.5 * Math.sqrt(Math.max(0, 1 - ((h - 16) / 11) ** 2)),
      (I, h, a) => (K.snow && I > 0.6 ? rgbOf('#eef3f8')
        : rgbOf(CYPRESS[Math.min(4, Math.max(0, Math.round((1 - I) * 3) + (h32(Math.round(a * 5), Math.round(h / 3), 7) % 4 === 0 ? 1 : 0)))])));
  } else if (kind === 'fountain') {
    revolve(R, 0, 0, 0, 3, cyl(s), (I, h, a, rho, cap) => (cap ? (rho < s - 1.6 ? rgbOf(WATER[rho < s * 0.45 ? 0 : 1]) : X.lite) : X.stoneL(I, h)));
    revolve(R, 0, 0, 3, 8, taper(3, 8, 1.6, 1.1), X.stoneL);
    revolve(R, 0, 0, 8, 10, (h) => 1.4 + (h - 8) * 1.2, (I, h, a, rho, cap) => (cap ? rgbOf(WATER[0]) : X.stoneL(I, h)));
  } else if (kind === 'blocks') {
    box(R, -6, 0, -3, 3, 0, 4, X.plain(0), X.top(1));
    box(R, 1, 6, -4, 1, 0, 4, X.plain(0), X.top(1));
    box(R, -3, 3, -1, 4, 4, 8, X.plain(0), X.top(1));
  } else if (kind === 'logs') {
    for (const [y0, h0, x0] of [[-4, 0, -6], [0, 0, -6], [-2, 3, -5]]) {
      box(R, x0, x0 + 11, y0, y0 + 3, h0, h0 + 3, (f, u, hv, lit) => (f === 'E' ? rgbOf('#c9a273') : X.wood(lit ? 1 : 2)), () => X.wood(0));
    }
  } else if (kind === 'obelisk') {
    obelisk(R, X, 0, 0, 0, 22);
  } else if (kind === 'menhir') {
    menhirs(R, X, 0, 1, 3, 11, 'front', 0);
  }
  outline(R, X.ink);
  return R;
}

// JARDIN de l'anneau réservé (hors structure de ville, l'emprise entière de la
// merveille est pavée — un grand carré pâle et nu tout autour du lieu) : pelouse,
// allée de gravier le long du lieu, haie basse au bord, arbres aux angles et le
// long de la haie. Le carré du lieu (|x|, |y| ≤ halfIn) reste vide.
export function gardenPlan(K, halfIn, halfOut) {
  const decor = [];
  const turf = K.snow ? snowTurf : grassAt;
  const gravel = (x, y) => {
    const n = h32(Math.floor(x + 4096), Math.floor(y + 4096), 13) % 9;
    return rgbOf(K.snow ? (n ? '#eef2f6' : '#cfd6de') : n === 0 ? '#bfae8c' : n < 3 ? '#d2c3a2' : '#dccfb2');
  };
  const col = (x, y) => {
    const d = Math.max(Math.abs(x), Math.abs(y));
    if (d <= halfIn) return null;
    if (d < halfIn + 7) return gravel(x, y);
    // Allées en croix, du lieu aux quatre côtés du jardin.
    if (d < halfOut - 3 && (Math.abs(x) < 5 || Math.abs(y) < 5)) return gravel(x, y);
    if (d > halfOut - 3) return rgbOf(CYPRESS[d > halfOut - 1.5 ? 4 : 2]);
    return turf(x, y);
  };
  const m = halfOut - 9, span = halfOut - halfIn - 7;
  if (span > 18) {
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) decor.push({ kind: 'tree', x: sx * m, y: sy * m });
    const step = 44;
    for (let t = -m + step; t < m - step / 2; t += step) {
      if (Math.abs(t) < 14) continue;                    // l'allée passe
      decor.push({ kind: 'tree', x: t, y: -m }, { kind: 'tree', x: -m, y: t }, { kind: 'tree', x: m, y: t }, { kind: 'tree', x: t, y: m });
    }
    // Ifs taillés au débouché de chaque allée.
    for (const [ax, ay] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
      const q = halfOut - 7;
      decor.push({ kind: 'topiary', x: ax * q + ay * 9, y: ay * q + ax * 9 }, { kind: 'topiary', x: ax * q - ay * 9, y: ay * q - ax * 9 });
    }
  }
  return { col, decor, props: [] };
}
