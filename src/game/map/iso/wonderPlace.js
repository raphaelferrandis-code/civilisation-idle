"use strict";
// ── LE LIEU DE CHAQUE MERVEILLE (docs/PLAN-MERVEILLES.md §5) ──────────────────
//
// Décision de Raph (2026-10-01) : « un vrai lieu » propre à chaque merveille —
// fini le grand carré pâle et nu. Trois couches :
//   · le SOL du lieu (dallage de l'ère, allée, rosace, parterres, terre de
//     chantier…) : un raster plat cuit DANS le sol de la carte, par-dessus le
//     parvis (isoWonderGround). Là où il est TRANSPARENT, c'est l'herbe du jeu
//     elle-même (la tuile iso-grass, posée dessous par isoWonder) : une pelouse de
//     merveille est un morceau du pré, pas un vert de synthèse (Raph 2026-10-03 :
//     « du rendu un peu cheap ») ;
//   · le DÉCOR en relief (cyprès, fontaines, blocs, obélisques) : de petits
//     rasters triés un par un avec la foule (isoWonder.js), plus quelques objets
//     tirés des planches de la ville (statues, braseros, réverbères) ;
//   · l'ENCEINTE : muret, balustrade ou grille selon l'ère, en modules courts
//     triés chacun à son pied, PERCÉE de portes au milieu de chaque côté et partout
//     où une rue l'aborde. Elle remplace la clôture générique des parvis
//     (fenceEdges, `FENCE.wonders`), dont le sens et le dessin n'allaient pas et
//     qui fermait l'allée d'entrée (Raph 2026-10-03).
//
// Repère : celui de la merveille (x est, y sud, origine au centre de la case de
// l'emplacement). Le lieu est le carré |x|, |y| ≤ half (le parvis pavé).
//
// Pur : aucun DOM, aucun CM.
import { put, rgbOf, h32, frameOf, ramp } from './isoPixelPaint.js';
import { mats, box, revolve, cyl, taper, pick, obelisk, menhirs, line, pixelFinish, nightOf } from './wonderBake.js';

const V = true;
const fm = (a, n) => ((a % n) + n) % n;
const WATER = ['#a9d0de', '#7fb0c9', '#5a8cab', '#41698a'];
// Verts des buis, ifs et cyprès : la famille de l'herbe du jeu, en plus sombre.
const CYPRESS = ['#4f7a3a', '#3c6530', '#2c5127', '#1f3d1e', '#142a15'];
const DIRT = ['#b29a74', '#9c835f', '#86704f', '#6c5a40'];
const FLOWERS = ['#f2efe2', '#e8c95a', '#d98aa0', '#9fb7e8'];

// ── Motifs de sol ────────────────────────────────────────────────────────────
// DALLAGE à joints décalés (s px) : chaque dalle a sa nuance, son arête au soleil
// (nord-ouest, plus claire) et son arête à l'ombre (sud-est), un peu d'usure ;
// aux âges anciens, de la mousse dans quelques joints.
function slabs(P, x, y, s, base, moss = false, seed = 3) {
  const row = Math.floor((y + 4096) / s), off = row & 1 ? s / 2 : 0;
  const fx = fm(x + off, s), fy = fm(y, s), col = Math.floor((x + off + 4096) / s);
  if (fx < 1 || fy < 1) {
    if (moss && h32(Math.floor(x / 3), Math.floor(y / 3), seed + 5) % 17 === 0) return rgbOf('#66744a');
    return ramp(P, base + 2);
  }
  const v = h32(row, col, seed) % 20;
  let k = base + (v < 3 ? 1 : v === 19 ? -1 : 0);
  if (fx < 2 || fy < 2) k -= 1;
  else if (fx > s - 1 || fy > s - 1) k += 1;
  if (h32(Math.floor(x), Math.floor(y), seed + 7) % 41 === 0) k += 1;
  return ramp(P, k);
}
// L'herbe du jeu (transparent), semée de quelques fleurs.
function grassAt(x, y) {
  const n = h32(Math.floor(x + 4096), Math.floor(y + 4096), 9) % 140;
  return n < FLOWERS.length ? rgbOf(FLOWERS[n]) : null;
}
function snowTurf(x, y) {
  const n = h32(Math.floor(x + 4096), Math.floor(y + 4096), 9) % 13;
  return rgbOf(n === 0 ? '#9db08c' : n < 3 ? '#dfe7ef' : '#f1f5f9');
}
function dirt(x, y) {
  const n = h32(Math.floor((x + 4096) / 2), Math.floor((y + 4096) / 2), 5) % 13;
  return rgbOf(DIRT[n === 0 ? 3 : n < 3 ? 2 : n < 7 ? 1 : 0]);
}
// Bordure de pierre d'une pelouse (ou d'un parterre) : un rang de pierre au soleil
// côté dallage, puis un liseré d'ombre portée sur l'herbe.
function kerb(P, d) { return d < 1.2 ? ramp(P, 1) : ramp(P, 5); }

// ── L'enceinte ───────────────────────────────────────────────────────────────
// Style par ère : moellons, muret de pierre, balustrade de marbre, grille en
// fonte aux pointes dorées, garde-corps de tubes, verre et filet de lumière.
export function fenceStyle(band) {
  return band <= 1 ? 'drystone' : band <= 3 ? 'wall' : band === 4 ? 'balustrade' : band === 5 ? 'railing' : band === 6 ? 'tube' : 'glass';
}
// Modules d'enceinte sur le carré |x|, |y| = e, percés de portes. `gates` : par côté
// ('N', 'S', 'E', 'W'), liste de [u0, u1] (u = x pour N/S, y pour E/W). Rend des
// éléments de décor : murs (wallX / wallY, `s` = longueur), piliers de porte,
// bornes d'angle ; et les objets posés sur les piliers.
export function enclosure(K, e, gates, props) {
  const decor = [];
  const sides = [['N', 0, -1], ['S', 0, 1], ['W', -1, 0], ['E', 1, 0]];
  const pierH = K.band <= 1 ? 9 : 13;
  for (const [side, sx, sy] of sides) {
    const along = sy !== 0;                                   // N/S : le long de x
    let cuts = (gates[side] || []).map(([a, b]) => [Math.max(-e + 6, a), Math.min(e - 6, b)]).filter(([a, b]) => b > a);
    cuts.sort((p, q) => p[0] - q[0]);
    const merged = [];
    for (const c of cuts) { const l = merged[merged.length - 1]; if (l && c[0] <= l[1] + 6) l[1] = Math.max(l[1], c[1]); else merged.push([...c]); }
    cuts = merged;
    // Tronçons pleins entre les portes, découpés en modules de ~16 px.
    let u = -e + 4;
    const runs = [];
    for (const [a, b] of cuts) { runs.push([u, a - 3]); u = b + 3; }
    runs.push([u, e - 4]);
    const at = (uu) => (along ? [uu, sy * e] : [sx * e, uu]);
    for (const [a, b] of runs) {
      const len = b - a;
      if (len < 3) continue;
      const n = Math.max(1, Math.round(len / 16)), m = len / n;
      for (let k = 0; k < n; k += 1) {
        const [x, y] = at(a + (k + 0.5) * m);
        decor.push({ kind: along ? 'wallX' : 'wallY', x, y, s: Math.round(m * 2) / 2 });
      }
    }
    // Piliers de porte, et ce qu'ils portent.
    for (const [a, b] of cuts) {
      for (const uu of [a - 1.5, b + 1.5]) {
        const [x, y] = at(uu);
        decor.push({ kind: 'pier', x, y });
        if (K.band <= 4) props.push({ prop: 'flame', x, y, h: pierH + 3, small: true });
        else props.push({ prop: 'glow', x, y, h: pierH + 2 });
      }
    }
  }
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) decor.push({ kind: 'post', x: sx * (e - 1.5), y: sy * (e - 1.5) });
  return decor;
}
// Portes d'office : le milieu de chaque côté (largeur w), plus celles des rues.
export function defaultGates(w, roadGates = {}) {
  const g = {};
  for (const s of ['N', 'S', 'E', 'W']) g[s] = [[-w / 2, w / 2], ...((roadGates[s] || []).map((u) => [u - 16, u + 16]))];
  return g;
}

// ── Plan du lieu, par merveille ──────────────────────────────────────────────
// Rend { col(x, y) → couleur | null (l'herbe du jeu), decor, props }.
//   decor : { kind: 'cypress'|'topiary'|'fountain'|'blocks'|'logs'|'obelisk'|'menhir'|'wallX'|…, x, y, s? }
//   props : comme les recettes (statue, brazier, gaslamp, ledlamp, flame, glow).
// opts.enclose : false → pas d'enceinte ici (elle borde alors le jardin) ;
// opts.roadGates : { N|S|E|W: [u…] } là où une rue aborde le lieu.
export function placePlan(id, tier, K, B, half, opts = {}) {
  const P = K.pal, hb = B / 2, T = 32;
  const old = K.band <= 3;                                     // mousse dans les joints
  const turf = K.snow ? snowTurf : grassAt;
  const decor = [], props = [];
  const lamp = (x, y) => {
    if (K.band <= 4) props.push({ prop: 'brazier', x, y, h: 0 });
    else props.push({ prop: K.band === 5 ? 'gaslamp' : 'ledlamp', x, y, h: 0 });
  };
  const enclose = opts.enclose !== false;
  // Le pourtour : la fondation de l'enceinte (ou une bordure, s'il n'y en a pas).
  const edge = (x, y) => {
    const d = half - Math.max(Math.abs(x), Math.abs(y));
    if (d < 1) return ramp(P, 5);
    if (d < 4) return ramp(P, enclose ? 3 : (d < 2 ? 1 : 3));
    return null;
  };
  const pave = (x, y) => slabs(P, x, y, 10, 2, old);
  let inner = pave;
  let gateW = 36;
  // Une pelouse bordée : rectangle |x| ∈ [x0, x1], y ∈ [y0, y1] (x symétrique).
  const lawn = (x, y, x0, x1, y0, y1) => {
    const ax = Math.abs(x);
    if (ax < x0 || ax > x1 || y < y0 || y > y1) return undefined;
    const d = Math.min(ax - x0, x1 - ax, y - y0, y1 - y);
    return d < 2.4 ? kerb(P, d) : turf(x, y);
  };
  if (id === 'dynasty1') {
    // ALLÉE PROCESSIONNELLE : du bord sud à l'escalier, bordée de pelouses et de
    // cyprès ; deux statues gardent l'entrée.
    const aw = Math.max(12, Math.min(0.7 * T, B * 0.16)), y0 = hb + 3;
    const lx0 = aw + 4, lx1 = half - 8, ly0 = y0 + 4, ly1 = half - 8;
    gateW = 2 * aw + 6;
    inner = (x, y) => {
      const ax = Math.abs(x);
      if (y > y0 - 2 && ax < aw) return ax > aw - 1.5 ? ramp(P, 4) : slabs(P, y, x, 8, 1, old, 11);
      const g = lawn(x, y, lx0, lx1, ly0, ly1);
      if (g !== undefined) return g;
      return pave(x, y);
    };
    if (ly1 - ly0 > 10) {
      for (let y = ly0 + 6; y < ly1 - 2; y += 13) for (const sx of [-1, 1]) decor.push({ kind: 'cypress', x: sx * (aw + 7), y });
    }
    props.push({ prop: 'statue', x: -(aw + 3), y: half - 9, h: 0 }, { prop: 'statue', x: aw + 3, y: half - 9, h: 0 });
    if (tier >= 3) { lamp(-(half - 10), -(half - 10)); lamp(half - 10, -(half - 10)); }
  } else if (id === 'pop1m') {
    // ROSACE de dalles autour de la colonne, quatre fontaines aux diagonales.
    const rc = half - 8;
    inner = (x, y) => {
      const rr = Math.hypot(x, y);
      if (rr < rc) {
        if (Math.abs(rr - rc) < 1.2) return ramp(P, 5);
        if (Math.abs(rr - rc) < 2.4) return ramp(P, 1);
        const ring = Math.floor(rr / 9), ang = Math.atan2(y, x);
        const sect = (ang + Math.PI) / (2 * Math.PI) * (12 + ring * 4);
        const fr = fm(rr, 9), fs = fm(sect, 1);
        if (fr < 1 || fs < 0.05) return ramp(P, 4);
        let k = ring & 1 ? 1 : 2;
        if (fr < 2) k -= 1; else if (fr > 8) k += 1;
        if (h32(Math.floor(x), Math.floor(y), 17) % 43 === 0) k += 1;
        return ramp(P, k);
      }
      return pave(x, y);
    };
    const f = rc * 0.72 / Math.SQRT2 + 2;
    if (rc > 40) {
      // Les deux fontaines de DEVANT (côté sud, celui de l'escalier) : celle de
      // l'est heurtait le bout de l'exèdre, celle du nord se cachait derrière le fût
      // (Raph 2026-10-03).
      for (const [sx, sy] of [[-1, 1], [1, 1]]) {
        decor.push({ kind: 'fountain', x: sx * f, y: sy * f, s: Math.min(11, rc * 0.14) });
        props.push({ prop: 'jet', x: sx * f, y: sy * f, h: 10 });
      }
    }
    for (const [x, y] of [[0, rc - 4], [rc - 4, 0], [-(rc - 4), 0], [0, -(rc - 4)]]) lamp(x, y);
  } else if (id === 'era_kingdom') {
    // PARTERRES À LA FRANÇAISE devant le palais : broderies de buis sur l'herbe du
    // jeu, allée centrale, ifs taillés aux angles.
    const aw = Math.max(10, B * 0.08), y0 = hb + 2;
    const bx0 = aw + 3, bx1 = half - 8, by0 = y0 + 3, by1 = half - 8;
    gateW = 2 * aw + 4;
    inner = (x, y) => {
      const ax = Math.abs(x);
      if (y > y0 - 2 && ax < aw) return slabs(P, y, x, 8, 1, old, 13);
      if (ax >= bx0 && ax <= bx1 && y >= by0 && y <= by1) {
        const d = Math.min(ax - bx0, bx1 - ax, y - by0, by1 - y);
        if (d < 2.4) return kerb(P, d);
        const u = (ax - bx0) / (bx1 - bx0), v = (y - by0) / (by1 - by0);
        const sw = Math.abs(Math.sin(u * Math.PI * 3) * 0.35 + 0.5 - v);
        const ring = Math.abs(Math.hypot(u - 0.5, v - 0.5) - 0.28);
        // Buis : un trait sombre, sa lèvre haute plus claire.
        // Buis taillé : son dessus pris par le soleil, son flanc dans l'ombre.
        if (sw < 0.05 || ring < 0.035) return rgbOf((sw < 0.028 || ring < 0.02) ? '#7f9e4c' : CYPRESS[3]);
        return turf(x, y);
      }
      return slabs(P, x, y, 7, 1, old, 7);
    };
    if (by1 - by0 > 8) {
      for (const sx of [-1, 1]) for (const yy of [by0 + 3, by1 - 3]) {
        decor.push({ kind: 'topiary', x: sx * (bx0 + 3), y: yy }, { kind: 'topiary', x: sx * (bx1 - 3), y: yy });
      }
    }
    props.push({ prop: 'statue', x: -(aw + 1), y: half - 8, h: 0 }, { prop: 'statue', x: aw + 1, y: half - 8, h: 0 });
  } else if (id === 'era_empire') {
    // CHANTIER : terre battue, blocs et bois empilés ; un parvis pavé devant la
    // façade dès qu'elle existe ; au rang V, il ne reste qu'une cour de chantier.
    const parvis = (x, y) => tier >= 3 && Math.abs(x) < B * 0.36 && y > B * 0.42;
    const yard = (x, y) => (tier >= 5 ? x > B * 0.3 && y > B * 0.12 : !parvis(x, y));
    inner = (x, y) => {
      if (parvis(x, y)) return slabs(P, x, y, 6, 2, old, 19);
      if (yard(x, y)) return dirt(x, y);
      return pave(x, y);
    };
    const spots = tier >= 5
      ? [[B * 0.4, B * 0.5, 'blocks'], [B * 0.55, B * 0.3, 'logs']]
      : [[-B * 0.5, -B * 0.1, 'blocks'], [B * 0.52, -B * 0.25, 'logs'], [-B * 0.42, B * 0.4, 'blocks'], [B * 0.5, B * 0.22, 'blocks'], [-B * 0.1, -B * 0.55, 'logs']];
    for (const [x, y, kind] of spots) if (Math.max(Math.abs(x), Math.abs(y)) < half - 10) decor.push({ kind, x, y });
  } else if (id === 'era_singularity') {
    // PLACE CIRCULAIRE : anneaux incrustés de métal et de lumière, rayons.
    const rc = half - 7;
    inner = (x, y) => {
      const rr = Math.hypot(x, y);
      if (rr > rc) return pave(x, y);
      for (const k of [0.95, 0.72, 0.5]) if (Math.abs(rr - rc * k) < 1.1) return k === 0.72 ? rgbOf(P.glow) : pick(P.metal, 0.5);
      const ang = Math.atan2(y, x);
      if (rr > rc * 0.72 && rr < rc * 0.95 && fm((ang + Math.PI) / (2 * Math.PI) * 16, 1) < 0.07) return pick(P.metal, 0.5);
      let k = rr > rc * 0.72 ? 5 : 6;
      if (h32(Math.floor(x / 2), Math.floor(y / 2), 23) % 9 === 0) k += 1;
      return ramp(P, k);
    };
    if (tier >= 3) {
      for (let k = 0; k < 8; k += 1) {
        const a = (k / 8) * 2 * Math.PI + Math.PI / 8;
        decor.push({ kind: 'obelisk', x: (rc + 2) * Math.cos(a), y: (rc + 2) * Math.sin(a) });
      }
    }
  }
  if (enclose) decor.push(...enclosure(K, half - 2, defaultGates(gateW, opts.roadGates), props));
  // L'hiver, la neige tient sur le dallage : quelques dalles affleurent encore.
  const snowy = (x, y) => {
    const c = inner(x, y);
    if (!K.snow || !c) return c;
    const n = h32(Math.floor((x + 4096) / 3), Math.floor((y + 4096) / 3), 31) % 10;
    return n < 6 ? rgbOf(n < 4 ? '#f1f5f9' : '#e2e8ef') : c;
  };
  return {
    col: (x, y) => edge(x, y) || snowy(x, y),
    decor, props, gateW,
  };
}

// SOL du lieu : raster plat (h = 0) couvrant le carré |x|, |y| ≤ half. Les pixels
// laissés vides sont l'herbe du jeu (posée dessous au dessin).
export function bakePlaceGround(plan, half) {
  const R = frameOf(V, [[-half, half, -half, half, 0, 0]]);
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

// ── Enceinte : un module de mur, un pilier, une borne ────────────────────────
// Un module le long de x (axis 'x') ou de y, de longueur L, centré sur l'origine.
function wallModule(R, X, K, L, axis) {
  const st = fenceStyle(K.band);
  const P = X.P;
  // b(u0, u1, t0, t1, h0, h1, face, top) : boîte dans le repère du module (u le long,
  // t en travers), posée dans le bon sens.
  const b = (u0, u1, t0, t1, h0, h1, face, top) => (axis === 'x'
    ? box(R, u0, u1, t0, t1, h0, h1, face, top)
    : box(R, t0, t1, u0, u1, h0, h1, face, top));
  const pt = (u, t, h) => (axis === 'x' ? [u, t, h] : [t, u, h]);
  const h2 = L / 2;
  if (st === 'drystone') {
    b(-h2, h2, -2, 2, 0, 4, X.rough(31), X.top(2));
    // Pierres de couronnement, irrégulières.
    for (let u = -h2 + 1; u < h2 - 2; u += 4) {
      const hh = 4 + (h32(Math.round(u * 3), 7) % 2);
      b(u, u + 3, -1.5, 1.5, 4, hh + 1, X.rough(37), X.top(1));
    }
  } else if (st === 'wall') {
    b(-h2, h2, -1.6, 1.6, 0, 4, X.stone(41), null);
    b(-h2, h2, -2.2, 2.2, 4, 5, X.plain(-1), X.top(1));
  } else if (st === 'balustrade') {
    b(-h2, h2, -2, 2, 0, 1.5, X.plain(0), X.top(1));
    for (let u = -h2 + 1.5; u < h2 - 0.5; u += 3) {
      const [x, y] = pt(u, 0, 0);
      revolve(R, x, y, 1.5, 5, (h) => 0.7 + 0.45 * Math.sin(Math.PI * (h - 1.5) / 3.5), X.marbleL);
    }
    b(-h2, h2, -1.6, 1.6, 5, 6, X.marbleF, () => X.marble(0));
  } else if (st === 'railing') {
    b(-h2, h2, -1.8, 1.8, 0, 2, X.stone(43), X.top(1));
    for (let u = -h2 + 1; u < h2; u += 2.5) {
      line(R, pt(u, 0, 2), pt(u, 0, 7), '#2b2c33');
      line(R, pt(u, 0, 7), pt(u, 0, 8), P.metal[0]);              // pointe dorée
    }
    line(R, pt(-h2, 0, 6.5), pt(h2, 0, 6.5), '#2b2c33');
    line(R, pt(-h2, 0, 3), pt(h2, 0, 3), '#2b2c33');
  } else if (st === 'tube') {
    b(-h2, h2, -1.8, 1.8, 0, 2.5, X.plain(0), X.top(1));
    for (let u = -h2 + 2; u < h2; u += 8) line(R, pt(u, 0, 2.5), pt(u, 0, 7), P.metal[2]);
    line(R, pt(-h2, 0, 7), pt(h2, 0, 7), P.metal[1]);
    line(R, pt(-h2, 0, 5), pt(h2, 0, 5), P.metal[2]);
  } else {
    b(-h2, h2, -1.4, 1.4, 0, 1, (f, u, hv, lit) => rgbOf(P.metal[lit ? 1 : 2]), () => rgbOf(P.metal[0]));
    b(-h2, h2, -0.6, 0.6, 1, 5, (f, u, hv, lit) => X.glass(lit ? 1 : 2), null);
    b(-h2, h2, -0.8, 0.8, 5, 5.8, () => X.light(P.glow), () => X.light(P.glow));
  }
}
function pierModule(R, X, K, small) {
  const st = fenceStyle(K.band);
  const H = small ? (K.band <= 1 ? 6 : 8) : (K.band <= 1 ? 9 : 13), w = small ? 2.4 : 3.2;
  if (st === 'drystone') {
    box(R, -w, w, -w, w, 0, H, X.rough(51), X.top(2));
  } else if (st === 'glass') {
    box(R, -w, w, -w, w, 0, H, (f, u, hv, lit) => rgbOf(X.P.metal[lit ? 1 : 2]), () => rgbOf(X.P.metal[0]));
    if (!small) box(R, -w + 0.8, w - 0.8, -w + 0.8, w - 0.8, H, H + 2, () => X.light(X.P.glow), () => X.light(X.P.glow));
  } else {
    const face = st === 'tube' ? X.plain(0) : X.stone(53);
    box(R, -w, w, -w, w, 0, H - 1, face, null);
    box(R, -w - 0.8, w + 0.8, -w - 0.8, w + 0.8, H - 1, H, X.plain(-1), X.top(1));
    if (!small && (st === 'wall' || st === 'balustrade')) {
      // Boule de couronnement.
      revolve(R, 0, 0, H, H + 1, cyl(1.2), X.stoneL);
      revolve(R, 0, 0, H + 1, H + 4, (h) => 1.8 * Math.sqrt(Math.max(0, 1 - ((h - H - 2.5) / 1.5) ** 2)), st === 'balustrade' ? X.marbleL : X.stoneL);
    } else if (!small && st === 'railing') {
      // Lanterne de fonte.
      box(R, -1.3, 1.3, -1.3, 1.3, H, H + 3, () => X.light(X.glass(0)), () => rgbOf('#2b2c33'));
    }
  }
}

// DÉCOR en relief : un petit raster par pièce, origine au pied. Rend { R, N } : N
// est son calque de nuit (bandeau et piliers de l'enceinte de verre, lanterne de
// fonte, filets des murs 'tech'), ou null s'il n'y a rien à allumer.
export function bakeDecor(kind, K, s = 10) {
  const X = mats(K);
  const big = kind === 'wallX' || kind === 'wallY';
  const ext = big ? Math.max(14, s / 2 + 4) : 14;
  const R = frameOf(V, [[-ext, ext, -ext, ext, -2, 44]]);
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
    box(R, -6, 0, -3, 3, 0, 4, X.stone(61), X.top(1));
    box(R, 1, 6, -4, 1, 0, 4, X.stone(63), X.top(1));
    box(R, -3, 3, -1, 4, 4, 8, X.stone(65), X.top(1));
  } else if (kind === 'logs') {
    for (const [y0, h0, x0] of [[-4, 0, -6], [0, 0, -6], [-2, 3, -5]]) {
      box(R, x0, x0 + 11, y0, y0 + 3, h0, h0 + 3, (f, u, hv, lit) => (f === 'E' ? rgbOf('#c9a273') : X.wood(lit ? 1 : 2)), () => X.wood(0));
    }
  } else if (kind === 'obelisk') {
    obelisk(R, X, 0, 0, 0, 22);
  } else if (kind === 'menhir') {
    menhirs(R, X, 0, 1, 3, 11, 'front', 0);
  } else if (kind === 'wallX' || kind === 'wallY') {
    wallModule(R, X, K, s, kind === 'wallX' ? 'x' : 'y');
  } else if (kind === 'pier' || kind === 'post') {
    pierModule(R, X, K, kind === 'post');
  }
  pixelFinish(R, X.ink, { grain: !big });
  // Les sources marquées (X.light, murs 'tech') s'allument la nuit comme celles du
  // monument ; nightOf remet aussi l'alpha des marqueurs à 255 (audit 05/10, BUG-64).
  return { R, N: nightOf(R, X) };
}

// JARDIN de l'anneau réservé (hors structure de ville, l'emprise entière de la
// merveille est pavée — un grand carré pâle et nu tout autour du lieu) : l'herbe
// du jeu, une allée de gravier le long du lieu et des allées en croix, des arbres
// aux angles et en alignement, des ifs au débouché des allées — et l'ENCEINTE de
// l'ère sur son bord extérieur. Le carré du lieu (|x|, |y| ≤ halfIn) reste vide.
export function gardenPlan(K, halfIn, halfOut, roadGates = {}) {
  const decor = [], props = [];
  const turf = K.snow ? snowTurf : grassAt;
  const gravel = (x, y) => {
    const n = h32(Math.floor(x + 4096), Math.floor(y + 4096), 13) % 9;
    return rgbOf(K.snow ? (n ? '#eef2f6' : '#cfd6de') : n === 0 ? '#a8977a' : n < 3 ? '#c4b493' : '#d3c5a6');
  };
  const col = (x, y) => {
    const d = Math.max(Math.abs(x), Math.abs(y));
    if (d <= halfIn) return null;
    if (d < halfIn + 1.2) return rgbOf('#8a7d64');            // bordure du gravier
    if (d < halfIn + 7) return gravel(x, y);
    // Allées en croix, du lieu aux quatre portes du jardin.
    if (d < halfOut - 3 && (Math.abs(x) < 6 || Math.abs(y) < 6)) return Math.abs(x) < 5 || Math.abs(y) < 5 ? gravel(x, y) : rgbOf('#8a7d64');
    if (d > halfOut - 4) return d > halfOut - 1 ? rgbOf('#6b604c') : gravel(x, y);   // fondation de l'enceinte
    return turf(x, y);
  };
  const m = halfOut - 12, span = halfOut - halfIn - 7;
  if (span > 18) {
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) decor.push({ kind: 'tree', x: sx * m, y: sy * m });
    const step = 44;
    for (let t = -m + step; t < m - step / 2; t += step) {
      if (Math.abs(t) < 16) continue;                    // l'allée passe
      decor.push({ kind: 'tree', x: t, y: -m }, { kind: 'tree', x: -m, y: t }, { kind: 'tree', x: m, y: t }, { kind: 'tree', x: t, y: m });
    }
    for (const [ax, ay] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
      const q = halfOut - 9;
      decor.push({ kind: 'topiary', x: ax * q + ay * 10, y: ay * q + ax * 10 }, { kind: 'topiary', x: ax * q - ay * 10, y: ay * q - ax * 10 });
    }
  }
  decor.push(...enclosure(K, halfOut - 2, defaultGates(16, roadGates), props));
  return { col, decor, props };
}
