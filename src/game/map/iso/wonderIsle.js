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
// tangente du courant, vers l'AVAL (cf. isoRiver.islandWakeK : a = π, u < 0, est la
// pointe amont, où l'eau s'empile). Une position de l'île (u le long, v en travers)
// devient x = u·tx − v·ty, y = u·ty + v·tx.
//
// LE NATUREL AU PIXEL (2026-10-04). Raph, sur capture du rang I : « tu me la fais
// bien en pixel art l'île ? et de l'écume sur les rochers autour ». Le gazon était
// tiré de l'ANGLE autour du centre (des veines de bois en éventail), les gradins de
// roche y traçaient des arcs beiges, les rochers étaient des œufs lisses de la
// pierre de l'ère. Désormais, au rang I :
//   · le corps de l'île est un RELIEF (plage, prairie, colline sous l'Aiguille),
//     lancé au rayon comme un volume et éclairé par sa pente, en tons tramés ;
//   · le gazon est celui de la tuile d'herbe du jeu : des brins VERTICAUX à l'écran,
//     pointe claire et pied sombre, quelques fleurs ; la plage est le sable des
//     berges, mouillé au bord, semé de galets ; un sentier monte du ponton ;
//   · les arbres sont ceux de la ville (isoWonder les dessine avec ses sprites).
// À TOUS les rangs, les rochers du pourtour sont des blocs de granite taillés
// (wonderBake.boulder) et l'ÉCUME bat leur pied (bakeFoam + paintFoam) : à chaque
// rocher sa houle, elle gonfle à l'arrivée de la vague, rejaillit sur la roche, puis
// se détache en dentelle qui s'éloigne — plus forte à la pointe amont.
//
// Pur : aucun DOM, aucun CM.
import { rgbOf, h32, frameOf, ramp, put } from './isoPixelPaint.js';
import { rippleField } from './waterRipples.js';
import { mats, facet, revolve, cyl, taper, domeProf, pick, band5, lum, stoneIdx, obelisk, column, nightOf, pixelFinish, boulder, rockShape, vnoise, ROCK } from './wonderBake.js';

const V = true;
const fm = (a, n) => ((a % n) + n) % n;
const T = 32;
const CYPRESS = ['#4f7a3a', '#3c6530', '#2c5127', '#1f3d1e', '#142a15'];
// Les verts de la tuile d'herbe du jeu (iso-grass), du plus clair au plus sombre ;
// le sable des berges (iso-sand) ; la terre battue du sentier ; la neige.
const MEADOW = ['#5c8f47', '#4c7c41', '#3a6a36', '#2e5e2f', '#214e23', '#19451b'];
const SAND = ['#eedfbe', '#e2caa5', '#d6b898', '#c8ae8d', '#b4997c', '#957e64'];
const DIRT = ['#bf9d72', '#a3825a', '#856745', '#6a5137'];
const SNOWP = ['#f4f7fb', '#e3e9f1', '#cdd6e2', '#b3bfcf'];
const FLOWERS = ['#f4f1e2', '#efd36b', '#e9a3b8'];
// L'écume : le cœur blanc, puis la frange qui tire sur le bleu du fleuve.
const FOAM0 = [242, 248, 246, 255], FOAM1 = [208, 230, 236, 230];
// Pas de rafraîchissement de l'écume (ms) : ~12 images/s, l'allure de la petite vie.
export const FOAM_STEP = 80;
const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

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
  const M = { RX, RY, tx, ty, at, side, qH, top, levels, tier };
  if (tier === 1) {
    // Rang I : le RELIEF (sol(x, y) → altitude), le ponton et le sentier au milieu
    // du flanc tourné vers l'œil, un gros rocher au large de la pointe aval qui
    // porte le feu. Les gradins de `levels` ne sont plus peints à ce rang : seul
    // leur sommet (top, où se pose l'Aiguille) compte encore.
    M.ground = isleGround(M);
    M.landU = -RX * 0.16;
    M.lampRock = { u: RX + 7, v: side * 3, r: 7.5, H: 7 };
  }
  return M;
}
// LE RELIEF DU RANG I : une plage qui monte doucement de l'eau (1,5 px au bord), une
// prairie un peu bosselée, et une colline au centre dont le sommet, plat, est à
// M.top — là où se pose le rocher de l'Aiguille. −1 hors de l'île.
function isleGround(M) {
  const { RX, RY, tx, ty } = M, hill = M.top - 3.7;
  return (x, y) => {
    const u = x * tx + y * ty, v = -x * ty + y * tx;
    const e2 = (u / RX) ** 2 + (v / RY) ** 2;
    if (e2 > 1) return -1;
    const e = Math.sqrt(e2), d = Math.sqrt((u / (RX * 0.46)) ** 2 + (v / (RY * 0.86)) ** 2);
    const lump = (0.8 * Math.sin(u * 0.045 + 1.3) * Math.sin(v * 0.1 + 0.4) + 0.5 * Math.sin(u * 0.11 + v * 0.07))
      * ss(0.95, 0.6, e) * ss(0.12, 0.4, d);
    return 1.5 + 2.2 * ss(1, 0.8, e) + hill * ss(1, 0.22, d) + lump;
  };
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
  // Rochers du pourtour (au pied du quai), tirés une fois ; qui a peint chaque pixel
  // en dernier (l'écume rejaillit sur la roche, jamais sur ce qui la cache).
  const rocks = isleRocks(M, tier);
  const own = { id: new Int32Array(R.w * R.h), h: new Float32Array(R.w * R.h), c: new Int32Array(R.w * R.h) };
  const landV = M.side * M.RY;
  const drawRocks = (list, into = R, ow = own) => {
    for (const q of [...list].sort((p, o) => p.d - o.d)) boulder(into, q, K, ow);
  };
  drawRocks(rocks.filter((q) => !q.vis));
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
  if (tier === 1) naturalBody(R, M, K);
  else {
    M.levels.forEach((L, li) => {
      const pts = ellipse(M, L.su, L.sv, li === 0 ? 56 : 44);
      const wall = corniced(L.h1, X.stoneF(201 + li));
      prism(R, pts, L.h0, L.h1, li === 0 ? vaults(wall, L.h1) : wall, footShade(slabs(li === M.levels.length - 1 ? 9 : 14 - li * 2, 2), M.levels[li + 1]));
    });
  }
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
  // Devant : les rochers du flanc visible et, au rang I, les blocs de la prairie et
  // le ponton — triés à leur pied.
  const front = rocks.filter((q) => q.vis).map((q) => ({ d: q.d, draw: () => boulder(R, q, K, own) }));
  if (tier === 1) {
    for (const q of isleOutcrops(M)) front.push({ d: q.d, draw: () => boulder(R, q, K, own) });
    const pier = pontoonOf(M);
    front.push({ d: pier.d, draw: () => drawPontoon(R, M, X, pier) });
  }
  for (const it of front.sort((a, b) => a.d - b.d)) it.draw();
  // Un pixel de rocher repeint depuis (l'île devant un rocher du fond) n'est plus à
  // lui : l'écume ne doit pas y rejaillir.
  for (let p = 0; p < own.id.length; p += 1) {
    if (!own.id[p]) continue;
    const k = p * 4;
    if (((R.data[k] << 16) | (R.data[k + 1] << 8) | R.data[k + 2]) !== own.c[p]) own.id[p] = 0;
  }
  pixelFinish(R, X.ink);
  const foam = bakeFoam(R, M, rocks, own);
  // LES REMOUS (waterRipples) au pied des pieux du ponton (rang I) ou autour du quai
  // bas d'accostage (rangs II+, le même rectangle que son prisme) : seulement sur l'eau
  // que la base laisse voir — le tablier, la plage et les rochers les recouvrent.
  const keep = (x, y) => {
    const i = Math.floor(x - y - R.ox), j = Math.floor((x + y) / 2 - R.oy);
    return i >= 0 && j >= 0 && i < R.w && j < R.h && !R.data[(j * R.w + i) * 4 + 3];
  };
  const ripples = tier === 1
    ? rippleField({ posts: pontoonOf(M).posts.map(([u, v]) => [...M.at(u, v), 0.9]), flow: [M.tx, M.ty], seed: 41, keep })
    : rippleField({ decks: [rect(M, -30, 30, Math.min(landV, landV + M.side * 18), Math.max(landV, landV + M.side * 18))], seed: 43, keep });
  // CE QUI SE REFLÈTE : le mur du quai et les rochers, seuls au bord de l'eau. Le
  // dessus de l'île et ses gradins, vus d'en haut, ne se mirent pas — reflétés
  // colonne par colonne, ils faisaient une longue traînée claire sur le fleuve.
  // Au rang I, la plage est à fleur d'eau : seuls les rochers se mirent.
  const Rr = frameOf(V, [[-ext, ext, -ext, ext, -2, M.top + 24]]);
  const L0 = M.levels[0];
  if (tier >= 2) prism(Rr, ellipse(M, L0.su, L0.sv, 56), 0, L0.h1, corniced(L0.h1, X.stoneF(201)), null);
  drawRocks(rocks.filter((q) => q.vis), Rr, null);
  return { R, M, Rr, foam, ripples };
}

// LES ROCHERS DU POURTOUR, à pas réguliers LE LONG du rivage (à angle égal, ils
// s'entassaient aux pointes et s'espaçaient sur les flancs) : gros blocs, moyens et
// galets mêlés, quelques trous — plus rares à la pointe amont, où le courant les a
// entassés. Le débarcadère (escalier II+, ponton I) en est dégagé ; au rang I, le
// gros rocher du feu se tient au large de la pointe aval.
function isleRocks(M, tier) {
  const { RX, RY } = M, N = 720, cum = new Float64Array(N + 1);
  const pt = (k) => { const a = (k / N) * 2 * Math.PI; return [RX * Math.cos(a), RY * Math.sin(a)]; };
  for (let k = 0; k < N; k += 1) { const p = pt(k), q = pt(k + 1); cum[k + 1] = cum[k] + Math.hypot(q[0] - p[0], q[1] - p[1]); }
  const aAt = (s) => {
    let lo = 0, hi = N;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    return ((lo + (s - cum[lo]) / (cum[lo + 1] - cum[lo] || 1)) / N) * 2 * Math.PI;
  };
  const out = [], LR = M.lampRock;
  const add = (u, v, r, H, a, salt, o = {}) => {
    const [x, y] = M.at(u, v);
    const n = M.at(RY * Math.cos(a), RX * Math.sin(a));         // normale de l'ellipse
    out.push({
      x, y, u, v, r, H, h0: 0, a, up: (1 - Math.cos(a)) / 2,
      rot: (h32(salt, 31) % 628) / 100, el: (h32(salt, 37) % 30) / 100, s1: (h32(salt, 41) % 628) / 100, s2: (h32(salt, 43) % 628) / 100,
      nf: 5 + (h32(salt, 47) % 3), wet: true, moss: h32(salt, 53) % 4 === 0, jit: (h32(salt, 59) % 100) / 100,
      id: out.length, d: x + y, vis: n[0] + n[1] > 0, ...o,
    });
  };
  const step = 10.5, n = Math.round(cum[N] / step);
  for (let k = 0; k < n; k += 1) {
    const a = aAt((k + (h32(k, 3) % 100) / 220) * step), up = (1 - Math.cos(a)) / 2;
    if (h32(k, 17) % 100 < 24 - 16 * up) continue;
    const cls = h32(k, 5) % 20, big = cls < 6, small = cls >= 15;
    const r = big ? 7 + (h32(k, 7) % 4) : small ? 2.8 + (h32(k, 7) % 2) : 4.6 + (h32(k, 7) % 3);
    const H = big ? 7 + (h32(k, 11) % (tier === 1 ? 6 : 4)) : small ? 2.5 + (h32(k, 11) % 2) : 4 + (h32(k, 11) % 4);
    const ca = Math.cos(a), sa = Math.sin(a), nl = Math.hypot(RY * ca, RX * sa) || 1;
    const off = r * 0.35 + (h32(k, 23) % 4);
    const u = RX * ca + ((RY * ca) / nl) * off, v = RY * sa + ((RX * sa) / nl) * off;
    if (v * M.side > 0 && (tier >= 2 ? Math.abs(u) < 26 : Math.abs(u - M.landU) < 9 + r)) continue;
    if (LR && Math.hypot(u - LR.u, v - LR.v) < LR.r + r * 0.6) continue;
    add(u, v, r, H, a, k);
    // Un galet au pied des gros blocs, de côté.
    if (big && h32(k, 29) % 2) {
      const tl = Math.hypot(RX * sa, RY * ca) || 1, sg = h32(k, 61) % 2 ? 1 : -1;
      add(u + sg * ((-RX * sa) / tl) * (r + 2.5) + ((RY * ca) / nl) * 2, v + sg * ((RY * ca) / tl) * (r + 2.5) + ((RX * sa) / nl) * 2,
        2.4 + (h32(k, 67) % 2), 2.5, a, k + 5000);
    }
  }
  if (LR) add(LR.u, LR.v, LR.r, LR.H, 0, 7777, { cut: 0.8, moss: false, el: 0.18 });
  return out;
}

// Rang I : des blocs à demi enterrés dans la prairie et au pied du rocher de
// l'Aiguille — la « colline de roche » qui affleure. [u, v] en fractions des demi-axes
// (v vers l'œil), rayon, hauteur hors sol.
function isleOutcrops(M) {
  const spots = [[-0.74, 0.1, 6, 5], [0.7, -0.12, 5.5, 4], [0.14, -0.42, 4.5, 4], [-0.24, -0.5, 5, 4],
    [0.22, 0.5, 4, 3], [-0.42, -0.3, 3.5, 3], [-0.1, -0.12, 5, 5], [0.12, -0.06, 4, 4]];
  return spots.map(([fu, fv, r, H], k) => {
    const [x, y] = M.at(fu * M.RX, fv * M.RY * M.side);
    return {
      x, y, h0: M.ground(x, y) - 1.2, r, H: H + 1.2, rot: k * 1.7, el: 0.15 + (k % 3) * 0.1, s1: k * 2.1, s2: k * 0.7 + 1,
      nf: 5 + (k % 3), wet: false, moss: k % 2 === 0, id: 500 + k, d: x + y,
    };
  });
}

// LE PONTON du rang I : quelques planches sur pieux, de la plage vers le large, au
// milieu du flanc tourné vers l'œil — là où monte le sentier.
// Ses PIEUX : une rangée de chaque côté, de la plage au bout (ceux du sable n'ont pas
// de remous : ils n'ont pas d'eau autour) — [u, v] dans le repère de l'île.
function pontoonOf(M) {
  const v0 = M.side * M.RY * 0.9, v1 = M.side * (M.RY + 17), [x, y] = M.at(M.landU, (v0 + v1) / 2), w = 5;
  const posts = [], far = v1 - M.side * 1.5, n = Math.max(2, Math.round(Math.abs(far - v0) / 5.5));
  for (let k = 0; k <= n; k += 1) for (const du of [-w + 0.8, w - 0.8]) posts.push([M.landU + du, far + ((v0 - far) * k) / n]);
  return { u: M.landU, v0, v1, w, d: x + y, posts };
}
function drawPontoon(R, M, X, pr) {
  const W = X.P.wood, deck = 3.6, s = M.side, far = pr.v1 - s * 1.5;
  const uvOf = (x, y) => [x * M.tx + y * M.ty, -x * M.ty + y * M.tx];
  const post = (u, v, h1) => prism(R, rect(M, u - 0.8, u + 0.8, v - 0.8, v + 0.8), 0, h1, (I) => pick(W.slice(1), I), () => rgbOf(W[1]));
  const dOf = ([u, v]) => { const p = M.at(u, v); return p[0] + p[1]; };
  for (const [u, v] of [...pr.posts].sort((a, b) => dOf(a) - dOf(b))) post(u, v, deck - 1);   // au peintre
  // Le tablier : des planches EN TRAVERS, joints sombres, une sur quatre plus claire.
  prism(R, rect(M, pr.u - pr.w, pr.u + pr.w, Math.min(pr.v0, pr.v1), Math.max(pr.v0, pr.v1)), deck - 1.2, deck,
    (I) => pick(W.slice(1), I), (I, x, y) => {
      const v = uvOf(x, y)[1], row = Math.floor((v + 4096) / 3);
      if (fm(v + 4096, 3) < 0.8) return rgbOf(W[3]);
      return rgbOf(W[h32(row, 5) % 4 === 0 ? 0 : 1]);
    });
  // Deux bittes d'amarrage au bout.
  for (const du of [-pr.w + 0.8, pr.w - 0.8]) prism(R, rect(M, pr.u + du - 0.8, pr.u + du + 0.8, far - 0.8, far + 0.8), deck, deck + 2.6, (I) => pick(W.slice(1), I), () => rgbOf(W[0]));
}

// LE CORPS DE L'ÎLE AU RANG I, lancé au rayon : pour chaque pixel, le rayon de vue
// (paramétré par l'altitude) traverse le cylindre de l'île, on descend jusqu'au sol
// (sol(x, y) ≥ h) par pas qui suivent l'écart, puis on affine. Entré par le flanc
// (sol au-dessus du point d'entrée) : la petite berge de sable mouillé.
function naturalBody(R, M, K) {
  const { RX, RY, tx, ty, top, side } = M, g = M.ground;
  const gs = (x, y) => { const v = g(x, y); return v < 0 ? 1.5 : v; };
  const bx = Math.hypot(RX * tx, RY * ty), by = Math.hypot(RX * ty, RY * tx);
  const i0 = Math.max(0, Math.floor(-(bx + by) - R.ox) - 1), i1 = Math.min(R.w - 1, Math.ceil(bx + by - R.ox) + 1);
  const j0 = Math.max(0, Math.floor(-(bx + by) / 2 - top - 3 - R.oy)), j1 = Math.min(R.h - 1, Math.ceil((bx + by) / 2 - R.oy) + 1);
  const a1 = tx + ty, a2 = tx - ty, A = (a1 / RX) ** 2 + (a2 / RY) ** 2;
  // Le sentier : du ponton jusqu'au pied du rocher de l'Aiguille, en lacets ADOUCIS
  // (Catmull-Rom) — des segments droits s'y lisaient comme un éclair.
  const lu = M.landU;
  const ctl = [[lu, 1.02 * RY], [lu, 0.93 * RY], [lu + 2, 0.78 * RY], [lu + 16, 0.62 * RY], [lu + 2, 0.45 * RY], [lu + 20, 0.3 * RY], [lu + 27, 0.2 * RY], [lu + 34, 0.1 * RY]];
  const path = [];
  for (let k = 1; k + 2 < ctl.length; k += 1) {
    const [p0, p1, p2, p3] = [ctl[k - 1], ctl[k], ctl[k + 1], ctl[k + 2]];
    for (let s = 0; s < 10; s += 1) {
      const t = s / 10, t2 = t * t, t3 = t2 * t;
      const cr = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
      path.push([cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1]) * side]);
    }
  }
  path.push([ctl[ctl.length - 2][0], ctl[ctl.length - 2][1] * side]);
  const pu0 = Math.min(...path.map((p) => p[0])) - 6, pu1 = Math.max(...path.map((p) => p[0])) + 6;
  const pv0 = Math.min(...path.map((p) => p[1])) - 6, pv1 = Math.max(...path.map((p) => p[1])) + 6;
  const pathD = (u, v) => {
    if (u < pu0 || u > pu1 || v < pv0 || v > pv1) return Infinity;
    let best = Infinity;
    for (let k = 0; k + 1 < path.length; k += 1) {
      const [ua, va] = path[k], [ub, vb] = path[k + 1], du = ub - ua, dv = vb - va;
      const t = Math.max(0, Math.min(1, ((u - ua) * du + (v - va) * dv) / (du * du + dv * dv)));
      best = Math.min(best, Math.hypot(u - ua - t * du, v - va - t * dv));
    }
    return best;
  };
  for (let j = j0; j <= j1; j += 1) {
    for (let i = i0; i <= i1; i += 1) {
      const Xp = R.ox + i + 0.5, Yp = R.oy + j + 0.5;
      // Rayon de vue : x = Yp + h + Xp/2, y = Yp + h − Xp/2 ; en (u, v) : U0 + h·a1, V0 + h·a2.
      const U0 = Yp * a1 + (Xp / 2) * a2, V0 = Yp * a2 - (Xp / 2) * a1;
      const B = 2 * ((U0 * a1) / RX ** 2 + (V0 * a2) / RY ** 2), C = (U0 / RX) ** 2 + (V0 / RY) ** 2 - 1;
      const disc = B * B - 4 * A * C;
      if (disc < 0) continue;
      const sq = Math.sqrt(disc), hA = Math.max(0, (-B - sq) / (2 * A)), hB = Math.min(top + 2, (-B + sq) / (2 * A) - 1e-4);
      if (hB < hA) continue;
      let h = hB, gh = g(Yp + h + Xp / 2, Yp + h - Xp / 2), hit = gh >= h, wall = hit && gh > h + 0.3;
      if (!hit) {
        let prev = h;
        while (h > hA) {
          prev = h;
          h = Math.max(hA, h - Math.max(0.25, (h - gh) * 0.5));
          gh = g(Yp + h + Xp / 2, Yp + h - Xp / 2);
          if (gh >= h) { hit = true; break; }
        }
        if (!hit) continue;
        let lo = h, hi = prev;
        for (let k = 0; k < 4; k += 1) { const m = (lo + hi) / 2; if (g(Yp + m + Xp / 2, Yp + m - Xp / 2) >= m) lo = m; else hi = m; }
        h = lo;
      }
      const x = Yp + h + Xp / 2, y = Yp + h - Xp / 2;
      const u = x * tx + y * ty, v = -x * ty + y * tx;
      const e = Math.hypot(u / RX, v / RY), ang = Math.atan2(v / RY, u / RX), par = (i + j) & 1;
      let col;
      if (wall) {
        const nx = (u / RX ** 2) * tx - (v / RY ** 2) * ty, ny = (u / RX ** 2) * ty + (v / RY ** 2) * tx;
        col = h < 0.8 ? SAND[5] : lum(nx, ny, 0) > 0.3 ? SAND[3] : SAND[4];
      } else {
        const g0 = gs(x, y), I = lum(g0 - gs(x + 1, y), g0 - gs(x, y + 1), 1);
        const sandE = 0.835 + 0.022 * Math.sin(7 * ang + 1.1) + 0.013 * Math.sin(19 * ang + 0.3);
        if (e > sandE) {
          // LA PLAGE : sable sec au grain fin, galets, liseré mouillé au bord de l'eau
          // (et ses reflets), touffes d'herbe qui débordent sur le haut.
          const wetE = 0.966 - 0.006 * Math.sin(11 * ang + 0.5);
          let k;
          if (e > wetE) { k = h32(i, j, 3) % 5 === 0 ? 4 : 3; if (h32(i, j, 71) % 41 === 0) k = 1; }
          else {
            k = I < 0.7 ? 2 : 1;
            const n = h32(i, j, 3) % 23;
            if (n < 2) k += 1; else if (n === 2) k = 0;
          }
          // La trace du sentier dans le sable, du ponton au haut de la plage.
          if (e <= wetE && pathD(u, v) < 2.4 + 0.8 * (vnoise(u, v, 4, 5) - 0.5)) k = h32(i, j, 9) % 4 === 0 ? 2 : 3;
          col = SAND[k];
          if (e <= wetE && K.snow) col = SNOWP[k <= 1 ? 0 : k === 3 ? 2 : 1];
          if (e < sandE + 0.018 && h32(i, j, 5) % 3 === 0) col = K.snow ? SNOWP[2] : MEADOW[3];
          else if (h32(i >> 1, j, 77) % 220 === 0) col = ROCK[2];
          else if (h32(i >> 1, j - 1, 77) % 220 === 0) col = ROCK[3];
        } else {
          // LA PRAIRIE : le ton suit la pente (tramé aux transitions), puis des BRINS
          // verticaux de 3 px — pointe claire ou pied sombre, comme la tuile d'herbe.
          // Tramage ÉTROIT : le damier ne couvre que la lisière entre deux tons, pas
          // toute une pente douce.
          const sh = (I - 0.78) / 0.07 + (par ? 0.12 : -0.12);
          let k = Math.max(1, Math.min(4, 2 - Math.round(sh)));
          const off = h32(i, 7) % 3, cell = Math.floor((j + off) / 3), ph = (j + off) % 3, n = h32(i, cell, 11) % 10;
          if (n < 3 && ph < 2) k -= 1; else if (n >= 3 && n < 6 && ph >= 1) k += 1;
          // Bord du sentier irrégulier : la largeur respire le long du chemin.
          const pd = pathD(u, v) - 0.7 * (vnoise(u, v, 5, 3) - 0.5);
          if (pd < 3) {
            let kd = (pd < 1.6 ? 0 : 1) + (I < 0.74 ? 1 : 0);
            if (h32(i, j, 61) % 7 === 0) kd += 1;
            col = K.snow ? SNOWP[2 + (kd > 1 ? 1 : 0)] : DIRT[Math.min(3, kd)];
          } else {
            if (pd < 3.8) k = Math.min(5, k + 1);                // bord piétiné
            col = MEADOW[k];
            const fl = h32(i, j, 13) % 700;
            if (fl < 3 && k <= 2 && e < sandE - 0.03 && pd > 5) col = FLOWERS[fl];
            if (K.snow) col = SNOWP[Math.min(3, Math.max(0, k - 1))];
          }
        }
      }
      put(R, i, j, rgbOf(col));
    }
  }
}

// L'ÉCUME AU PIED DES ROCHERS. Elle ne se peint que sur l'EAU (pixel vide de la
// base) et, quand la vague monte, sur le bas de la roche qui est encore à ce rocher
// (own) — jamais sur l'île ni sur un rocher de devant.
// Chaque rocher a sa HOULE s (0 → 1 → 0), montée vive et retrait lent comme le
// ressac du fleuve (skew) : à la montée, une collerette blanche gonfle contre la
// roche et rejaillit dessus ; au retrait, une dentelle s'en détache et s'éloigne en
// s'effilochant. La dentelle est tirée par ARC le long du pied (des tirets, pas du
// sel) et ne bouge pas : seules sa portée et sa densité suivent la houle.
// ⚠ ANIMATION CONTINUE, PAS UNE BANDE D'IMAGES (Raph, 2026-10-04 : « l'écume arrive
// sur les cailloux au même moment et on dirait que ça lag »). Dix images cuites
// pour toute la houle faisaient 3 images/s, et tous les rochers changeaient d'image
// au même instant. Ici on ne cuit que les pixels CANDIDATS de chaque rocher (une
// fois) ; paintFoam les allume pour un instant donné, et chaque rocher a sa propre
// période et sa propre phase — ils ne battent jamais ensemble.
const FOAM_PERIOD = 3400;                       // ms, une houle du fleuve (waveTune.period)
const pack = (c) => ((c[3] << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0;
const FOAM0_U = pack(FOAM0), FOAM1_U = pack(FOAM1);
function bakeFoam(R, M, rocks, own) {
  const cand = rocks.filter((q) => q.wet).map((q) => {
    const shape = rockShape(q), out = [];
    const ext = q.r * (1 + (q.el || 0)) * 1.2 + 9, cX = q.x - q.y, cY = (q.x + q.y) / 2;
    const i0 = Math.max(0, Math.floor(cX - 2 * ext - R.ox)), i1 = Math.min(R.w - 1, Math.ceil(cX + 2 * ext - R.ox));
    const j0 = Math.max(0, Math.floor(cY - q.H - ext - R.oy)), j1 = Math.min(R.h - 1, Math.ceil(cY + ext - R.oy));
    const N = Math.max(8, Math.round((2 * Math.PI * q.r) / 1.7));
    const hh = (m, salt) => (h32(((m % N) + N) % N, q.id, salt) % 1000) / 1000;
    const lace = (c, salt) => 0.5 * hh(c, salt) + 0.25 * hh(c - 1, salt) + 0.25 * hh(c + 1, salt);
    for (let j = j0; j <= j1; j += 1) {
      for (let i = i0; i <= i1; i += 1) {
        const p = j * R.w + i;
        if (!R.data[p * 4 + 3]) {
          const Xp = R.ox + i + 0.5, Yp = R.oy + j + 0.5;
          const o = shape(Yp + Xp / 2 - q.x, Yp - Xp / 2 - q.y, true), gap = o.d - o.rb;
          if (gap < -0.6 || gap > 9) continue;
          const c = Math.floor(((o.a + Math.PI) / (2 * Math.PI)) * N);
          out.push([i, j, gap, lace(c, 1), lace(c, 2), 0]);
        } else if (own.id[p] === q.id + 1 && own.h[p] < 3.2) {
          out.push([i, j, own.h[p], (h32(i, j, q.id) % 1000) / 1000, 0, 1]);
        }
      }
    }
    return { q, out };
  }).filter((c) => c.out.length);
  if (!cand.length) return null;
  let x0 = R.w, y0 = R.h, x1 = -1, y1 = -1;
  for (const { out } of cand) for (const c of out) { if (c[0] < x0) x0 = c[0]; if (c[0] > x1) x1 = c[0]; if (c[1] < y0) y0 = c[1]; if (c[1] > y1) y1 = c[1]; }
  const W = x1 - x0 + 1;
  return {
    ox: R.ox + x0, oy: R.oy + y0, w: W, h: y1 - y0 + 1,
    rocks: cand.map(({ q, out }) => {
      const n = out.length, at = new Int32Array(n), gap = new Float32Array(n), n1 = new Float32Array(n), n2 = new Float32Array(n), spray = new Uint8Array(n);
      out.forEach((c, k) => { at[k] = (c[1] - y0) * W + (c[0] - x0); gap[k] = c[2]; n1[k] = c[3]; n2[k] = c[4]; spray[k] = c[5]; });
      return {
        id: q.id, at, gap, n1, n2, spray,
        // Sa période (±18 %) et sa phase : tirées au hasard pour l'essentiel, avec un
        // soupçon d'avance en amont (la vague y arrive un peu plus tôt).
        per: FOAM_PERIOD * (0.82 + 0.36 * ((h32(q.id, 71) % 100) / 100)),
        ph: q.jit * 0.75 - (q.u / M.RX) * 0.22,
        str: (0.62 + 0.38 * q.up) * (0.75 + 0.25 * Math.min(1, q.r / 8)),
      };
    }),
  };
}
// Allume l'écume de l'instant t (ms) dans out (Uint32Array w × h, octets RGBA).
// Pur : un même t redonne la même image (captures déterministes).
export function paintFoam(F, t, out) {
  out.fill(0);
  for (const r of F.rocks) {
    const psi = t / r.per + r.ph, th = 2 * Math.PI * psi, ths = th - 0.35 * Math.sin(th);
    const s = 0.5 - 0.5 * Math.cos(ths), ret = Math.sin(ths) < 0 ? fm(ths, 2 * Math.PI) / Math.PI - 1 : -1;
    const str = r.str, ss2 = s * str;
    // Un fond d'écume demeure entre deux vagues (plus fourni en amont) : un rocher
    // battu par le courant n'est jamais tout à fait nu.
    const w = 0.8 + 0.6 * str + 2.6 * ss2, dens = 0.26 + 0.2 * str + 0.55 * ss2, wHalf = w * 0.5;
    const ringG = ret >= 0 ? 1.4 + 1.6 * str + 4.5 * ret : -9, ringD = ret >= 0 ? 0.62 * (1 - ret) * str : 0;
    const spray = ss2 > 0.32 ? 0.6 + (2.6 * (ss2 - 0.32)) / 0.68 : -1, sprayD = 0.35 + 0.4 * ss2;
    // Bulles éparses : retirées une quinzaine de fois par houle, pas à chaque image.
    const kb = Math.floor(fm(psi, 1) * 15), bub = 5 * ss2;
    for (let k = 0; k < r.at.length; k += 1) {
      const g = r.gap[k];
      let col = 0;
      if (r.spray[k]) { if (g < spray && r.n1[k] < sprayD) col = FOAM0_U; }
      else if (g <= w && r.n1[k] < dens) col = g < wHalf ? FOAM0_U : FOAM1_U;
      else if (Math.abs(g - ringG) < 0.7 && r.n2[k] < ringD) col = FOAM1_U;
      else if (bub > 0 && g < w + 2.5 && h32(r.at[k], kb, r.id) % 100 < bub) col = FOAM1_U;
      if (col) out[r.at[k]] = col;
    }
  }
  return out;
}

// ── LES OBJETS HAUTS ─────────────────────────────────────────────────────────
// Liste des objets posés sur l'île (position x, y, altitude h) et des feux.
export function islePlan(K, tier, il) {
  const M = isleModel(tier, il);
  const talls = [], props = [];
  const tip = M.RX - 22, Ls = M.levels;
  const put = (kind, u, v, h) => { const [x, y] = M.at(u, v); talls.push({ kind, x, y, h }); };
  if (tier === 1) {
    // Posés sur le relief (isleGround) ; isoWonder les dessine avec les arbres de la ville.
    for (const [u, v] of [[-M.RX * 0.55, -M.side * 10], [-M.RX * 0.42, M.side * 16], [M.RX * 0.5, -M.side * 12], [M.RX * 0.36, M.side * 18]]) {
      const [x, y] = M.at(u, v);
      talls.push({ kind: 'tree', x, y, h: M.ground(x, y) });
    }
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
  if (tier === 1) { const L = M.lampRock, [x, y] = M.at(L.u, L.v); lamp(x, y, L.H); }   // sur le rocher du feu
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
      props.push({ prop: 'glow', x: 0, y: 0, h: H - 9, big: true, sweep: true });
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
  pixelFinish(R, X.ink);
  return { R, N: nightOf(R, X), props };
}
