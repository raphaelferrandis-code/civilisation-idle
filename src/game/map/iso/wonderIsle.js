"use strict";
// ── L'ÎLOT DE L'AIGUILLE CÉLESTE (docs/PLAN-MERVEILLES.md) ────────────────────
//
// Raph (2026-10-02) : « revois l'îlot de l'aiguille pour avoir un truc plus
// imposant et marquant pour le joueur ». L'îlot est creusé dans le fleuve par
// layout.js (fuseau rx × ry tuiles, allongé dans le courant) ; on n'en change PAS
// la forme (les bras, l'écume, les obstacles des bateaux en dépendent). On le
// CONSTRUIT par-dessus, et il grandit avec la merveille :
//   I   rocher naturel, gazon et sable, ponton de bois
//   II  quai maçonné, esplanade dallée, escalier d'accostage
//   III + terrasse centrale, bastions aux deux pointes, feux
//   IV  quai plus haut, bastions coiffés et pavoisés, statues, cyprès
//   V   citadelle : tours de feu aux pointes, deuxième terrasse, couronne de lampes
//
// Deux couches, comme le lieu des autres merveilles :
//   · la BASE (rochers, quai, terrasses, escaliers, ponton) : un raster presque
//     plat, peint d'un bloc SOUS tout ce qui se tient dessus ;
//   · les objets HAUTS (bastions, arbres, obélisques) : un raster chacun, triés à
//     leur pied avec le reste, posés à l'altitude du quai.
//
// Repère : celui de la merveille, centré sur le centre de l'île ; (tx, ty) =
// tangente du courant. Une position de l'île (u le long, v en travers) devient
// x = u·tx − v·ty, y = u·ty + v·tx.
//
// Pur : aucun DOM, aucun CM.
import { rgbOf, h32, frameOf, ramp, outline } from './isoPixelPaint.js';
import { mats, facet, revolve, cyl, taper, domeProf, pick, band5, stoneIdx, obelisk, column, nightOf } from './wonderBake.js';

const V = true;
const fm = (a, n) => ((a % n) + n) % n;
const T = 32;
const CYPRESS = ['#6d8a45', '#56713a', '#43592d', '#324322', '#253219'];

// PRISME vertical sur un polygone CONVEXE (sommets [x, y]) : ses faces visibles,
// puis son dessus. wall/top : col(I, x, y, h).
export function prism(R, pts, h0, h1, wall, top) {
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p[0]; cy += p[1]; }
  cx /= pts.length; cy /= pts.length;
  const ins = [cx, cy, (h0 + h1) / 2];
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    facet(R, [[a[0], a[1], h0], [b[0], b[1], h0], [b[0], b[1], h1], [a[0], a[1], h1]], ins, wall);
  }
  if (top) facet(R, pts.map((p) => [p[0], p[1], h1]), ins, top);
}

// Modèle commun à la base et aux objets : rangs, gradins, positions.
// L'île MONTE vers l'Aiguille : un quai, puis des terrasses de plus en plus
// petites et hautes — une acropole posée sur le fleuve, lisible de loin.
//   levels : [{ su, sv, h0, h1 }] du quai au sommet (su/sv = échelle de l'ellipse).
export function isleModel(tier, il) {
  const RX = il.rx * T, RY = il.ry * T, tx = il.tx, ty = il.ty;
  const at = (u, v) => [u * tx - v * ty, u * ty + v * tx];
  // Côté de l'île tourné vers l'œil : sa normale (−ty, tx)·s regarde (1, 1).
  const side = tx - ty >= 0 ? 1 : -1;
  const plans = [
    [[0.98, 0.96, 7], [0.66, 0.72, 15], [0.4, 0.5, 23]],                      // I : colline de roche
    [[0.96, 0.95, 16], [0.62, 0.7, 32]],
    [[0.96, 0.95, 18], [0.66, 0.74, 36], [0.4, 0.52, 52]],
    [[0.96, 0.95, 20], [0.68, 0.75, 40], [0.44, 0.56, 58]],
    [[0.96, 0.95, 22], [0.7, 0.76, 44], [0.47, 0.58, 64], [0.27, 0.38, 78]],
  ][tier - 1];
  const levels = [];
  let h = 0;
  for (const [su, sv, h1] of plans) { levels.push({ su, sv, h0: h, h1 }); h = h1; }
  const qH = levels[0].h1, top = h;
  return { RX, RY, tx, ty, at, side, qH, top, levels, tier };
}
const ellipse = (M, su, sv, n = 56) => {
  const pts = [];
  for (let k = 0; k < n; k += 1) {
    const a = (k / n) * 2 * Math.PI;
    pts.push(M.at(M.RX * su * Math.cos(a), M.RY * sv * Math.sin(a)));
  }
  return pts;
};
// Rectangle tourné (u0..u1 le long, v0..v1 en travers), convexe.
const rect = (M, u0, u1, v0, v1) => [M.at(u0, v0), M.at(u1, v0), M.at(u1, v1), M.at(u0, v1)];

// ── LA BASE ──────────────────────────────────────────────────────────────────
export function bakeIsleBase(K, tier, il) {
  const X = mats(K), M = isleModel(tier, il);
  const ext = M.RX + 14;
  const R = frameOf(V, [[-ext, ext, -ext, ext, -2, M.top + 24]]);
  const P = X.P;
  const uv = (x, y) => [x * M.tx + y * M.ty, -x * M.ty + y * M.tx];
  // Dallage aligné sur l'île, deux tons, joints décalés.
  const slabs = (s, base) => (I, x, y) => {
    if (K.snow && band5(I) === 0 && h32(Math.floor(x / 3), Math.floor(y / 3), 9) % 10 < 6) return rgbOf('#eef2f6');
    const [u, v] = uv(x, y);
    const row = Math.floor((v + 4096) / s), off = row & 1 ? s / 2 : 0, col = Math.floor((u + off + 4096) / s);
    if (fm(v, s) < 1 || fm(u + off, s) < 1) return ramp(P, base + 2);
    return ramp(P, base + (h32(row, col, 3) % 6 === 0 ? 1 : 0));
  };
  const corniced = (h1, tex) => (I, x, y, h) => (h >= h1 - 2 ? ramp(P, stoneIdx(K, I) - 1) : h === h1 - 3 ? ramp(P, stoneIdx(K, I) + 2) : tex(I, x, y, h));
  const rock = (I, h, a) => (h < 1.5 ? rgbOf(P.wet[0]) : X.roughL(I, h, a));
  const visible = (nx, ny) => nx + ny > 0;
  // Rochers du pourtour (au pied du quai), tirés une fois.
  const rocks = [];
  const nR = Math.round((2 * Math.PI * Math.sqrt((M.RX ** 2 + M.RY ** 2) / 2)) / 11);
  for (let k = 0; k < nR; k += 1) {
    const a = ((k + (h32(k, 3) % 100) / 200) / nR) * 2 * Math.PI;
    const ca = Math.cos(a), sa = Math.sin(a);
    const s = 1.02 + (h32(k, 5) % 9) / 100;
    const [x, y] = M.at(M.RX * s * ca, M.RY * s * sa);
    const n = M.at(M.RY * ca, M.RX * sa);                    // normale de l'ellipse
    const r = 5 + (h32(k, 7) % 6), H = 4 + (h32(k, 11) % (tier === 1 ? 9 : 6));
    rocks.push({ x, y, r, H, vis: visible(n[0], n[1]), d: x + y, a });
  }
  // Le débarcadère (escalier + quai bas) au milieu du flanc visible : on n'y met
  // pas de rochers.
  const landV = M.side * M.RY;
  const inLanding = (x, y) => { const [u, v] = uv(x, y); return Math.abs(u) < 26 && v * M.side > 0; };
  const drawRocks = (vis, into = R) => {
    for (const q of rocks.filter((q) => q.vis === vis && !(tier >= 2 && inLanding(q.x, q.y))).sort((p, o) => p.d - o.d)) {
      revolve(into, q.x, q.y, 0, q.H, (h) => q.r * (1 - 0.55 * Math.pow(h / q.H, 1.6)), (I, h, a) => rock(I, h, a + q.a));
    }
  };
  drawRocks(false);
  // Corps de l'île : les gradins, du quai au sommet.
  const rockTop = (I, x, y) => {
    if (K.snow) return rgbOf(h32(Math.floor(x / 2), Math.floor(y / 2), 4) % 7 ? '#eef2f6' : '#a9a28c');
    const [u, v] = uv(x, y);
    const e = (u / M.RX) ** 2 + (v / M.RY) ** 2;
    if (e > 0.8) return rgbOf(['#d9c9a0', '#cbb98e'][h32(Math.floor(x), Math.floor(y), 2) % 2]);
    return X.turfL(I, 0, Math.atan2(y, x) * 7 + u * 0.05);
  };
  // Ombre portée au pied du gradin suivant : un liseré sombre sur le dallage, côté
  // soleil couchant — c'est lui qui détache les niveaux les uns des autres.
  const footShade = (tex, next) => (I, x, y, h) => {
    if (next) {
      const [u, v] = uv(x, y);
      const e = Math.sqrt((u / (M.RX * next.su)) ** 2 + (v / (M.RY * next.sv)) ** 2);
      if (e > 1 && e < 1.07 && x + y > 0) return ramp(P, stoneIdx(K, I) + 3);
    }
    return tex(I, x, y, h);
  };
  // Voûtes du quai (II+) : les hangars à barques, à fleur d'eau.
  const vaults = (tex, h1) => (I, x, y, h) => {
    const [u] = uv(x, y), m = fm(u + 4096, 30);
    if (h < h1 * 0.62 && m > 9 && m < 21 && Math.abs(u) > 34) {
      const r = 6, top = h1 * 0.62 - r + Math.sqrt(Math.max(0, r * r - (m - 15) ** 2));
      if (h < top) return h < 2 ? rgbOf(P.wet[1]) : X.dark;
    }
    return tex(I, x, y, h);
  };
  M.levels.forEach((L, li) => {
    const pts = ellipse(M, L.su, L.sv, li === 0 ? 56 : 44);
    const next = M.levels[li + 1];
    if (tier === 1) prism(R, pts, L.h0, L.h1, (I, x, y, h) => rock(I, h, Math.atan2(y, x) + li), footShade(rockTop, next));
    else {
      const wall = corniced(L.h1, X.stoneF(201 + li));
      prism(R, pts, L.h0, L.h1, li === 0 ? vaults(wall, L.h1) : wall, footShade(slabs(li === M.levels.length - 1 ? 9 : 14 - li * 2, 2), next));
    }
  });
  if (tier >= 2) {
    // LE GRAND ESCALIER : du quai bas d'accostage (dans l'eau) jusqu'au sommet,
    // d'une seule montée au milieu du flanc tourné vers la ville.
    const flight = (vA, vB, h0, h1, w) => {
      const n = Math.max(2, Math.round((h1 - h0) / 3)), dv = (vB - vA) / n;
      for (let i = n - 1; i >= 0; i -= 1) {
        const top = h0 + ((i + 1) * (h1 - h0)) / n, a = vA + i * dv, b = a + dv;
        prism(R, rect(M, -w, w, Math.min(a, b), Math.max(a, b)), h0, top,
          (I, x, y, h) => (h >= top - 1 ? X.lite : ramp(P, stoneIdx(K, I))), () => X.lite);
      }
    };
    const lw = 22, out = M.side * 18;
    prism(R, rect(M, -lw - 8, lw + 8, Math.min(landV, landV + out), Math.max(landV, landV + out)), 0, 4,
      corniced(4, X.stoneF(205)), slabs(8, 1));
    let vFrom = landV + out * 0.2, h0 = 4, w = 10;
    M.levels.forEach((L, li) => {
      const vEdge = M.side * M.RY * L.sv;                    // bord avant de ce gradin
      const next = M.levels[li + 1];
      const vTo = vEdge - M.side * (li === 0 ? 18 : 10);
      flight(vFrom, vTo, h0, L.h1, w);
      if (!next) return;
      vFrom = M.side * M.RY * next.sv + M.side * (li === 0 ? 12 : 8);
      h0 = L.h1; w = Math.max(5, w - 2);
    });
    // COLONNADE (IV+) sur le bord avant du premier gradin : colonnes et architrave
    // qui suivent l'ellipse, ouverte au milieu pour l'escalier.
    if (tier >= 4) {
      const L = M.levels[1], hb = L.h1, hc = hb + 15;
      const pts = [];
      for (let k = 0; k <= 24; k += 1) {
        const a = Math.PI * (0.06 + (0.88 * k) / 24);
        const u = M.RX * L.su * 0.93 * Math.cos(a), v = M.side * M.RY * L.sv * 0.86 * Math.sin(a);
        if (Math.abs(u) < 20) continue;
        const [x, y] = M.at(u, v); pts.push({ x, y, u, d: x + y });
      }
      for (const q of [...pts].sort((p0, p1) => p0.d - p1.d)) column(R, X, q.x, q.y, 1.9, hb, hc);
      const byU = [...pts].sort((p0, p1) => p0.u - p1.u);
      for (let k = 0; k + 1 < byU.length; k += 1) {
        const a = byU[k], b = byU[k + 1];
        if (Math.sign(a.u) !== Math.sign(b.u)) continue;     // l'escalier passe
        const nx = -(b.y - a.y), ny = b.x - a.x, nl = Math.hypot(nx, ny) || 1, ox = (nx / nl) * 2, oy = (ny / nl) * 2;
        prism(R, [[a.x - ox, a.y - oy], [b.x - ox, b.y - oy], [b.x + ox, b.y + oy], [a.x + ox, a.y + oy]], hc, hc + 3,
          (I) => X.marbleL(I), () => X.marble(0));
      }
    }
  }
  drawRocks(true);
  outline(R, X.ink);
  // CE QUI SE REFLÈTE : le mur du quai et les rochers, seuls au bord de l'eau. Le
  // dessus de l'île et ses gradins, vus d'en haut, ne se mirent pas — reflétés
  // colonne par colonne, ils faisaient une longue traînée claire sur le fleuve.
  const Rr = frameOf(V, [[-ext, ext, -ext, ext, -2, M.top + 24]]);
  const L0 = M.levels[0];
  if (tier === 1) prism(Rr, ellipse(M, L0.su, L0.sv, 56), 0, L0.h1, (I, x, y, h) => rock(I, h, Math.atan2(y, x)), null);
  else prism(Rr, ellipse(M, L0.su, L0.sv, 56), 0, L0.h1, corniced(L0.h1, X.stoneF(201)), null);
  drawRocks(true, Rr);
  return { R, M, Rr };
}

// ── LES OBJETS HAUTS ─────────────────────────────────────────────────────────
// Liste des objets posés sur l'île (position x, y, altitude h) et des feux.
export function islePlan(K, tier, il) {
  const M = isleModel(tier, il);
  const talls = [], props = [];
  const tip = M.RX - 22, Ls = M.levels;
  const put = (kind, u, v, h) => { const [x, y] = M.at(u, v); talls.push({ kind, x, y, h }); };
  if (tier === 1) {
    put('tree', -M.RX * 0.55, -M.side * 10, Ls[0].h1);
    put('tree', -M.RX * 0.42, M.side * 16, Ls[0].h1);
    put('tree', M.RX * 0.5, -M.side * 12, Ls[0].h1);
    put('tree', M.RX * 0.36, M.side * 18, Ls[1].h1);
  }
  if (tier >= 3) for (const s2 of [-1, 1]) put('bastion', s2 * tip, 0, 0);
  if (tier >= 4) {
    // Cyprès en allées sur le quai, de part et d'autre du premier gradin.
    for (const s2 of [-1, 1]) for (const f of [0.74, 0.84]) for (const v of [-1, 1]) put('cypress', s2 * M.RX * f, v * M.RY * 0.5, M.qH);
  }
  if (tier >= 5) {
    const L = Ls[2];
    for (const [su, sv] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) put('obelisk', su * M.RX * L.su * 0.78, sv * M.RY * L.sv * 0.62, L.h1);
  }
  // FEUX : le long du bord avant de chaque gradin (côté ville), et au débarcadère.
  const lamp = (x, y, h) => {
    if (K.band <= 4) props.push({ prop: tier >= 2 ? 'brazier' : 'flame', x, y, h });
    else props.push({ prop: K.band === 5 ? 'gaslamp' : 'ledlamp', x, y, h });
  };
  if (tier === 1) { const [x, y] = M.at(M.RX + 26, M.side * 6); lamp(x, y, 5); }
  else {
    Ls.forEach((L, li) => {
      if (li === Ls.length - 1) return;                       // le sommet porte l'Aiguille
      const n = li === 0 ? (tier >= 5 ? 12 : 8) : tier >= 4 ? 6 : 4;
      for (let k = 0; k < n; k += 1) {
        const a = Math.PI * (0.1 + (0.8 * k) / Math.max(1, n - 1));
        const u = M.RX * L.su * 0.9 * Math.cos(a), v = M.side * M.RY * L.sv * 0.82 * Math.sin(a);
        if (Math.abs(u) < 26) continue;                       // le grand escalier passe
        const [x, y] = M.at(u, v); lamp(x, y, L.h1);
      }
    });
    for (const s2 of [-1, 1]) { const [x, y] = M.at(s2 * 26, M.side * (M.RY + 14)); lamp(x, y, 4); }
  }
  if (tier >= 3) {
    // Statues qui gardent l'arrivée de l'escalier au sommet.
    const L = Ls[Ls.length - 2];
    for (const s2 of [-1, 1]) {
      const [x, y] = M.at(s2 * 12, M.side * (M.RY * Ls[Ls.length - 1].sv + 6));
      props.push({ prop: 'statue', x, y, h: L.h1, small: tier < 5 });
    }
  }
  return { M, talls, props };
}

// Raster d'un objet haut, origine à son pied.
export function bakeIsleTall(kind, K, tier) {
  const X = mats(K);
  const R = frameOf(V, [[-24, 24, -24, 24, -2, 110]]);
  const props = [];
  if (kind === 'bastion') {
    const H = [0, 0, 40, 50, 70][tier - 1], r = 17;
    revolve(R, 0, 0, 0, H, cyl(r), X.stoneL);
    revolve(R, 0, 0, H, H + 4, cyl(r + 1.5), (I, h, a, rho, cap) => (cap ? X.lite : X.marbleL(I)));
    if (tier >= 4) {
      revolve(R, 0, 0, H + 4, H + 4 + (tier >= 5 ? 26 : 18), taper(H + 4, H + 4 + (tier >= 5 ? 26 : 18), r + 2, 0), X.roofL);
      props.push({ prop: 'flag', x: 0, y: 0, h: H + 4 + (tier >= 5 ? 26 : 18), poleH: 10, fw: 7, fh: 4 });
    } else {
      // Créneaux : un anneau de merlons, et le feu au milieu.
      revolve(R, 0, 0, H + 4, H + 8, cyl(r + 1), (I, h, a) => (fm(a * (r + 1), 6) < 3 ? X.stoneL(I, h) : null));
      props.push({ prop: 'flame', x: 0, y: 0, h: H + 4, big: true });
    }
    if (tier >= 5) {
      // Lanterne de la tour de feu, sous la flèche : vitrée, elle luit la nuit.
      revolve(R, 0, 0, H - 14, H - 4, cyl(r + 0.4), (I, h, a) => (fm(a * 4 / Math.PI, 1) < 0.18 ? pick(X.P.metal, I) : X.light(X.glass(I > 0.3 ? 1 : 2))));
      props.push({ prop: 'glow', x: 0, y: 0, h: H - 9, big: true });
    }
  } else if (kind === 'cypress' || kind === 'tree') {
    const big = kind === 'tree';
    const Hh = big ? 22 : 24, r = big ? 8 : 3.4;
    revolve(R, 0, 0, 0, 3, cyl(big ? 1.2 : 0.9), () => rgbOf('#5a4028'));
    revolve(R, 0, 0, 2, 2 + Hh, big ? domeProf(2, r, Hh) : (h) => r * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, (h - 2) / Hh)) * 0.92 + 0.12), 0.8),
      (I, h, a) => (K.snow && I > 0.62 ? rgbOf('#eef3f8') : rgbOf(CYPRESS[Math.min(4, Math.max(0, Math.round((1 - I) * 3.2) - 1 + (h32(Math.round(a * 6), Math.round(h / 2), 3) % 5 === 0 ? 1 : 0)))])));
  } else if (kind === 'obelisk') {
    obelisk(R, X, 0, 0, 0, 30);
  }
  outline(R, X.ink);
  return { R, N: nightOf(R, X), props };
}
