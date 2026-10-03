"use strict";
// ── LES MERVEILLES CUITES — construites par le code (docs/PLAN-MERVEILLES.md) ──
//
// Décision de Raph (2026-10-01) : les six merveilles refaites « comme le pont »
// — construites et peintes pixel par pixel en iso exact, dans la matière de l'ère
// de la ville (wonderKits.js), avec le même grain, la même lumière et la même
// pierre que les quais et le pont. Chaque merveille grandit à chaque RANG.
//
// Repère LOCAL d'une merveille : x vers l'est, y vers le sud (px monde), origine
// au CENTRE de la case de son emplacement ; h = altitude (px d'écran). Le socle
// est un carré de côté `B` (cmWonderBaseTiles × T) centré sur l'origine — c'est le
// contrat de placement (wonderFootWorld, branche pavée). L'œil regarde selon
// (1, 1, 1) : faces sud (+y) ÉCLAIRÉES, est (+x) à l'OMBRE, dessus les plus clairs.
//
// Les volumes sont peints du fond vers l'avant DANS le raster (chaque recette les
// ordonne) ; le tri avec la ville se fait au dessin, par tranches (isoWonder.js).
//
// Une recette rend { R (raster), props } : les objets ANIMÉS ou tirés d'une
// planche (flammes, statues, drapeaux, lueurs) sont posés au dessin. ⚠ Un objet
// est dessiné APRÈS tout le monument : on n'en pose que là où rien du monument
// ne passe devant lui (bords avant, sommets).
//
// Pur : aucun DOM, aucun CM. Testable en Node.
import {
  put, rgbOf, h32, projLT, frameOf, paintBox, paintLine, fillPoly, ramp, shadeOf, ashlar, outline,
} from './isoPixelPaint.js';

const V = true;   // repère vertical : wx = t = x, wy = l = y
const S2 = Math.SQRT2;
const PR = (x, y, h = 0) => projLT(V, y, x, h);
// Modulo RÉEL (celui d'isoPixelPaint arrondit d'abord à l'entier : nervures,
// vitrages et rayures en fraction de tour y tombaient tous à zéro).
const fm = (a, n) => ((a % n) + n) % n;

// ── Lumière ──────────────────────────────────────────────────────────────────
// Soleil haut-gauche, le même que les faces des boîtes : un mur sud lit le cran 1,
// un mur est le cran 4, un dessus le cran 0.
const LX = -0.42, LY = 0.46, LH = 0.78;
export function lum(nx, ny, nh) {
  const n = Math.hypot(nx, ny, nh) || 1;
  return (nx * LX + ny * LY + nh * LH) / n;
}
// Lumière → cran 0 (reflet) … 4 (ombre).
export function band5(I) { return I >= 0.7 ? 0 : I >= 0.42 ? 1 : I >= 0.26 ? 2 : I >= 0.12 ? 3 : 4; }
// Cran → teinte d'une palette de n couleurs (claire → sombre).
export const palIdx = (I, n) => Math.round((band5(I) * (n - 1)) / 4);
export const pick = (pal, I) => rgbOf(pal[palIdx(I, pal.length)]);
// Cran → rampe de pierre du kit (dessus litBase−1 … ombre shadeBase).
export function stoneIdx(K, I) {
  return [K.litBase - 1, K.litBase, K.litBase + 1, K.shadeBase - 1, K.shadeBase][band5(I)];
}

// ── Formes ───────────────────────────────────────────────────────────────────
// Boîte [x0,x1]×[y0,y1]×[h0,h1]. face(f, u, hv, lit) : f 'S' (sud, u = x) ou
// 'E' (est, u = y) ; top(x, y) pour le dessus (null : pas de dessus).
export function box(R, x0, x1, y0, y1, h0, h1, face, top) {
  paintBox(R, V, y0, y1, x0, x1, h0, h1,
    (f, u, hv, lit) => face(f === 'l' ? 'S' : 'E', u, hv, lit),
    top ? (l, t) => top(t, l) : null);
}

// FACETTE plane (polygone 3D convexe, sommets [x, y, h]) : invisible si elle
// tourne le dos à l'œil ; `inside` = un point intérieur du solide (oriente la
// normale). col(I, x, y, h) reçoit la lumière et le point du monde sous le pixel.
// Les faces visibles d'un solide CONVEXE ne se recouvrent pas : pas de tri.
export function facet(R, pts, inside, col) {
  const [a, b, c] = pts;
  const ux = b[0] - a[0], uy = b[1] - a[1], uh = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vh = c[2] - a[2];
  let nx = uy * vh - uh * vy, ny = uh * vx - ux * vh, nh = ux * vy - uy * vx;
  let gx = 0, gy = 0, gh = 0;
  for (const p of pts) { gx += p[0]; gy += p[1]; gh += p[2]; }
  gx /= pts.length; gy /= pts.length; gh /= pts.length;
  if ((gx - inside[0]) * nx + (gy - inside[1]) * ny + (gh - inside[2]) * nh < 0) { nx = -nx; ny = -ny; nh = -nh; }
  const nd = nx + ny + nh;                       // vers l'œil : (1, 1, 1)
  if (nd <= 1e-6 * (Math.abs(nx) + Math.abs(ny) + Math.abs(nh))) return;
  const I = lum(nx, ny, nh);
  fillPoly(R, pts.map((p) => PR(p[0], p[1], p[2])), (X, Y) => {
    // Point du plan sous le pixel : le rayon de vue p0 + t·(1, 1, 1).
    const ax = X / 2 + Y / 3, ay = -X / 2 + Y / 3, ah = (-2 * Y) / 3;
    const t = (nx * (a[0] - ax) + ny * (a[1] - ay) + nh * (a[2] - ah)) / nd;
    return col(I, ax + t, ay + t, ah + t);
  });
}
const fillOf = (c) => (typeof c === 'function' ? c : () => c);

// Pyramide à base [x0,x1]×[y0,y1] en h0, sommet à h0 + H.
export function pyramid(R, x0, x1, y0, y1, h0, H, col) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, ap = [cx, cy, h0 + H], ins = [cx, cy, h0 + H * 0.25];
  const f = fillOf(col);
  facet(R, [[x0, y0, h0], [x1, y0, h0], ap], ins, f);
  facet(R, [[x0, y0, h0], [x0, y1, h0], ap], ins, f);
  facet(R, [[x1, y0, h0], [x1, y1, h0], ap], ins, f);
  facet(R, [[x0, y1, h0], [x1, y1, h0], ap], ins, f);
}
// Tronc de pyramide (mur à fruit, mastaba, mansarde) : `ins` = retrait du haut.
export function frustum(R, x0, x1, y0, y1, h0, h1, ins, col, topCol) {
  const b = [[x0, y0, h0], [x1, y0, h0], [x1, y1, h0], [x0, y1, h0]];
  const t = [[x0 + ins, y0 + ins, h1], [x1 - ins, y0 + ins, h1], [x1 - ins, y1 - ins, h1], [x0 + ins, y1 - ins, h1]];
  const c = [(x0 + x1) / 2, (y0 + y1) / 2, (h0 + h1) / 2];
  const f = fillOf(col);
  facet(R, [b[0], b[1], t[1], t[0]], c, f);
  facet(R, [b[0], b[3], t[3], t[0]], c, f);
  facet(R, [b[1], b[2], t[2], t[1]], c, f);
  facet(R, [b[3], b[2], t[2], t[3]], c, f);
  facet(R, t, c, fillOf(topCol || col));
}
// Toit à deux pans : faîtage NORD-SUD (pignon au sud) ou, `alongX`, EST-OUEST
// (pignon à l'est). Les deux pans se voient quand le toit est peu pentu.
export function gable(R, x0, x1, y0, y1, h0, H, colSlope, colEnd, alongX = false) {
  const ins = [(x0 + x1) / 2, (y0 + y1) / 2, h0 + H * 0.3];
  const fs = fillOf(colSlope), fe = fillOf(colEnd);
  if (!alongX) {
    const cx = (x0 + x1) / 2;
    facet(R, [[x0, y0, h0], [x0, y1, h0], [cx, y1, h0 + H], [cx, y0, h0 + H]], ins, fs);
    facet(R, [[x1, y0, h0], [x1, y1, h0], [cx, y1, h0 + H], [cx, y0, h0 + H]], ins, fs);
    facet(R, [[x0, y1, h0], [x1, y1, h0], [cx, y1, h0 + H]], ins, fe);
  } else {
    const cy = (y0 + y1) / 2;
    facet(R, [[x0, y0, h0], [x1, y0, h0], [x1, cy, h0 + H], [x0, cy, h0 + H]], ins, fs);
    facet(R, [[x0, y1, h0], [x1, y1, h0], [x1, cy, h0 + H], [x0, cy, h0 + H]], ins, fs);
    facet(R, [[x1, y0, h0], [x1, y1, h0], [x1, cy, h0 + H]], ins, fe);
  }
}
// Toit en croupe (quatre pans), faîtage le long du grand côté.
export function hip(R, x0, x1, y0, y1, h0, H, col) {
  const dx = (x1 - x0) / 2, dy = (y1 - y0) / 2, r = Math.min(dx, dy);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const A = dx >= dy ? [x0 + r, cy, h0 + H] : [cx, y0 + r, h0 + H];
  const Bp = dx >= dy ? [x1 - r, cy, h0 + H] : [cx, y1 - r, h0 + H];
  const ins = [cx, cy, h0 + H * 0.3], f = fillOf(col);
  const nw = [x0, y0, h0], ne = [x1, y0, h0], se = [x1, y1, h0], sw = [x0, y1, h0];
  if (dx >= dy) {
    facet(R, [nw, ne, Bp, A], ins, f); facet(R, [nw, sw, A], ins, f);
    facet(R, [ne, se, Bp], ins, f); facet(R, [sw, se, Bp, A], ins, f);
  } else {
    facet(R, [nw, ne, A], ins, f); facet(R, [nw, sw, Bp, A], ins, f);
    facet(R, [ne, se, Bp, A], ins, f); facet(R, [sw, se, Bp], ins, f);
  }
}

// SOLIDE DE RÉVOLUTION autour de la verticale (cx, cy), de h0 à h1 : prof(h) =
// rayon à l'altitude h. Tour, fût, coupole, flèche conique, sphère, rocher : une
// seule primitive, éclairée par sa vraie normale. col(I, h, ang, rho, cap) →
// couleur (ang : 0 = est, π/2 = sud ; cap : pixel du disque supérieur).
// `facets` : normale quantifiée → tour octogonale, fût cannelé…
export function revolve(R, cx, cy, h0, h1, prof, col, facets = 0) {
  if (!(h1 > h0)) return;
  let rMax = 0;
  for (let h = h0; h <= h1 + 1e-6; h += 0.5) rMax = Math.max(rMax, prof(Math.min(h, h1)));
  if (!(rMax > 0)) return;
  const c = PR(cx, cy, 0);
  const i0 = Math.max(0, Math.floor(c.X - rMax * S2 - R.ox) - 1), i1 = Math.min(R.w - 1, Math.ceil(c.X + rMax * S2 - R.ox) + 1);
  const j0 = Math.max(0, Math.floor(c.Y - h1 - rMax / S2 - R.oy) - 1), j1 = Math.min(R.h - 1, Math.ceil(c.Y - h0 + rMax / S2 - R.oy) + 1);
  const inside = (x, y, h) => { const r = prof(h); return x * x + y * y <= r * r; };
  for (let j = j0; j <= j1; j += 1) {
    for (let i = i0; i <= i1; i += 1) {
      const X = R.ox + i + 0.5 - c.X, Y = R.oy + j + 0.5 - c.Y;
      // Rayon de vue : (ax, ay, ah) + t·(1, 1, 1) ; t croît vers l'œil.
      const ax = X / 2 + Y / 3, ay = -X / 2 + Y / 3, ah = (-2 * Y) / 3;
      const tTop = h1 - ah;
      const tHi = Math.min(tTop, rMax - ax, rMax - ay), tLo = Math.max(h0 - ah, -rMax - ax, -rMax - ay);
      if (tHi < tLo) continue;
      let t = tHi, hit = inside(ax + t, ay + t, ah + t);
      if (!hit) {
        for (t = tHi - 0.4; t > tLo; t -= 0.4) if (inside(ax + t, ay + t, ah + t)) { hit = true; break; }
        if (!hit && inside(ax + tLo, ay + tLo, ah + tLo)) { t = tLo; hit = true; }
        if (!hit) continue;
        let a = t, b = Math.min(tHi, t + 0.4);
        for (let k = 0; k < 6; k += 1) { const m = (a + b) / 2; if (inside(ax + m, ay + m, ah + m)) a = m; else b = m; }
        t = a;
      }
      const x = ax + t, y = ay + t, h = ah + t;
      const rho = Math.hypot(x, y), ang = Math.atan2(y, x);
      let nx, ny, nh, cap = false;
      if (t >= tTop - 1e-6) { nx = 0; ny = 0; nh = 1; cap = true; }
      else {
        const ha = Math.max(h0, h - 0.5), hb = Math.min(h1, h + 0.5);
        const dr = hb > ha ? (prof(hb) - prof(ha)) / (hb - ha) : 0;
        let a = ang;
        if (facets) { const st = (2 * Math.PI) / facets; a = Math.round(a / st) * st; }
        nx = Math.cos(a); ny = Math.sin(a); nh = -dr;
      }
      const cc = col(lum(nx, ny, nh), h, ang, rho, cap);
      if (cc) put(R, i, j, cc);
    }
  }
}
export const cyl = (r) => () => r;
export const taper = (h0, h1, r0, r1) => (h) => r0 + ((r1 - r0) * (h - h0)) / (h1 - h0);
export const domeProf = (h0, r, H) => (h) => r * Math.sqrt(Math.max(0, 1 - ((h - h0) / H) ** 2));
export const ballProf = (hc, r) => (h) => Math.sqrt(Math.max(0, r * r - (h - hc) * (h - hc)));

// ANNEAU 3D (tore mince) de rayon `rad`, épaisseur `th`, dans le plan (U, W)
// centré en c. `part` : 'back' (moitié arrière), 'front' ou 'all' — pour glisser
// une sphère ou un fût entre les deux moitiés. col(I, p) → couleur.
export function ring3d(R, c, rad, th, U, W, col, part = 'all') {
  const n = Math.max(32, Math.ceil(rad * 2 * Math.PI * 1.6));
  const pts = [];
  for (let k = 0; k < n; k += 1) {
    const a = (k / n) * 2 * Math.PI, ca = Math.cos(a), sa = Math.sin(a);
    const ox = U[0] * ca + W[0] * sa, oy = U[1] * ca + W[1] * sa, oh = U[2] * ca + W[2] * sa;
    const d = ox + oy + oh;
    if (part === 'back' && d > 0) continue;
    if (part === 'front' && d <= 0) continue;
    pts.push({ x: c[0] + rad * ox, y: c[1] + rad * oy, h: c[2] + rad * oh, d, I: lum(ox, oy, oh), a });
  }
  pts.sort((p, q) => p.d - q.d);
  const r = th / 2, rc = Math.ceil(r);
  for (const p of pts) {
    const s = PR(p.x, p.y, p.h);
    for (let dj = -rc; dj <= rc; dj += 1) {
      for (let di = -rc; di <= rc; di += 1) {
        if (di * di + dj * dj > r * r + 0.3) continue;
        const I = p.I * 0.55 + (dj < 0 ? 0.32 : dj > 0 ? -0.08 : 0.14);
        put(R, Math.floor(s.X - R.ox + di), Math.floor(s.Y - R.oy + dj), col(I, p));
      }
    }
  }
}
// Plans usuels : horizontal ; vertical face à l'œil (sud-est).
export const PLANE_H = [[1, 0, 0], [0, 1, 0]];
export const PLANE_FACE = [[1 / S2, -1 / S2, 0], [0, 0, 1]];
// Le même plan, cercle ROND à l'écran : la projection étire l'horizontale de √2
// (un cercle vrai debout se lit comme un anneau couché) — on étire la verticale
// d'autant, l'anneau se lit dressé.
export const PLANE_ROUND = [[1 / S2, -1 / S2, 0], [0, 0, S2]];

// DISQUE vertical face à l'œil (miroir, lentille), ROND à l'écran (rayon r·√2 px) :
// col(s, v, q), s, v ∈ [−1, 1] (v vers le haut), q = distance au centre.
export function vdisc(R, cx, cy, hc, r, col) {
  const c = PR(cx, cy, hc);
  for (let j = Math.floor(c.Y - r * S2 - R.oy) - 1; j <= Math.ceil(c.Y + r * S2 - R.oy) + 1; j += 1) {
    for (let i = Math.floor(c.X - r * S2 - R.ox) - 1; i <= Math.ceil(c.X + r * S2 - R.ox) + 1; i += 1) {
      const s = (R.ox + i + 0.5 - c.X) / S2, v = -(R.oy + j + 0.5 - c.Y) / S2;
      const q = Math.sqrt(s * s + v * v) / r;
      if (q > 1) continue;
      const cc = col(s / r, v / r, q);
      if (cc) put(R, i, j, cc);
    }
  }
}

// BANDEAU COURBE (mur, gradin ou entablement en arc) : anneau [r0, r1] entre les
// angles a0 → a1 (0 = est, π/2 = sud), de h0 à h1. Peint de l'arrière vers l'avant.
export function arcBand(R, cx, cy, r0, r1, a0, a1, h0, h1, col) {
  const n = Math.max(12, Math.ceil(Math.abs(a1 - a0) * r1 * 0.5));
  const da = (a1 - a0) / n, pad = 0.7 / r1;
  const segs = [];
  for (let k = 0; k < n; k += 1) { const a = a0 + (k + 0.5) * da; segs.push({ a, d: Math.cos(a) + Math.sin(a) }); }
  segs.sort((p, q) => p.d - q.d);
  const f = fillOf(col);
  const pt = (r, a, h) => [cx + r * Math.cos(a), cy + r * Math.sin(a), h];
  for (const s of segs) {
    const aA = s.a - Math.abs(da) / 2 - pad, aB = s.a + Math.abs(da) / 2 + pad;
    const ins = pt((r0 + r1) / 2, s.a, (h0 + h1) / 2);
    facet(R, [pt(r1, aA, h0), pt(r1, aB, h0), pt(r1, aB, h1), pt(r1, aA, h1)], ins, f);
    if (r0 > 0.5) facet(R, [pt(r0, aA, h0), pt(r0, aB, h0), pt(r0, aB, h1), pt(r0, aA, h1)], ins, f);
    facet(R, [pt(Math.max(0, r0), aA, h1), pt(r1, aA, h1), pt(r1, aB, h1), pt(Math.max(0, r0), aB, h1)], ins, f);
  }
}

// TRAIT entre deux points [x, y, h] (couleur '#rrggbb'), épaisseur w px d'écran.
export function line(R, a, b, col, w = 1) {
  for (let k = 0; k < w; k += 1) {
    const o = k - Math.floor((w - 1) / 2);
    paintLine(R, V, [a[1] - o / 2, a[0] + o / 2, a[2]], [b[1] - o / 2, b[0] + o / 2, b[2]], col);
  }
}

// ── Matières ─────────────────────────────────────────────────────────────────
function ashlarI(P, K, u, hv, base, seed) {
  const course = K.course || 4;
  const row = Math.floor((hv + 1000) / course), inRow = hv + 1000 - row * course;
  const joint = K.joint != null ? K.joint : 2;
  if (inRow === course - 1) return ramp(P, base + joint);
  const len = (K.block || 11) + (h32(row, seed, 7) % (K.rough ? 7 : 5)) - (K.rough ? 3 : 0);
  const uu = Math.floor(u) + (h32(row, seed, 3) % len) + 4096;
  if (uu % len === 0) return ramp(P, base + joint);
  const v = h32(row, Math.floor(uu / len), seed) % (K.rough ? 5 : 9);
  return ramp(P, base + (v === 0 ? 1 : 0) - (inRow === 0 && base <= K.litBase ? 1 : 0));
}
// ── Marqueurs de nuit ────────────────────────────────────────────────────────
// Une vitre est peinte avec un alpha de 254, une source de lumière (lanterne,
// iris, filet lumineux) de 253 : à l'œil c'est opaque, et `finish` sait les
// retrouver pour cuire le calque de nuit, puis remet l'alpha à 255.
const A_WIN = 254, A_LIGHT = 253;
const mark = (c, a) => [c[0], c[1], c[2], a];
// Raccourcis lus par toutes les recettes, construits une fois par kit.
export function mats(K) {
  const P = K.pal;
  const c = (pal, k) => rgbOf(pal[Math.max(0, Math.min(pal.length - 1, k))]);
  const KR = { ...K, rough: true, block: 6, course: 4 };
  // Rampe du marbre en 5 crans : ses trois teintes, puis l'ombre de la pierre.
  const M5 = [P.marble[0], P.marble[1], P.marble[Math.min(2, P.marble.length - 1)], P.stone[K.shadeBase - 1], P.stone[K.shadeBase]];
  const SNOW = [rgbOf('#f4f7fb'), rgbOf('#e3e9f1')];
  const snowy = (I) => K.snow && band5(I) === 0;
  const glowC = rgbOf(P.glow);
  // MUR de l'ère au cran de lumière `base` (u = position le long du mur, hv = altitude).
  const wallAt = (u, hv, base, seed) => {
    switch (K.wall) {
      case 'rough': return ashlarI(P, KR, u, hv, base, seed);
      case 'brick': {
        const row = Math.floor((hv + 999) / 3), inRow = hv + 999 - row * 3, off = row & 1 ? 3 : 0;
        if (inRow === 2 || fm(u + off, 6) < 1) return ramp(P, base);           // mortier clair
        const v = h32(row, Math.floor((u + off + 4096) / 6), seed) % 7;
        return rgbOf(P.brick[Math.max(0, Math.min(8, base + (v === 0 ? 1 : v === 1 ? -1 : 0)))]);
      }
      case 'panel': {
        if (fm(hv, 9) < 1 || fm(u, 12) < 1) return ramp(P, base + 2);
        return ramp(P, base + (h32(Math.floor((u + 4096) / 12), Math.floor((hv + 999) / 9), seed) % 5 === 0 ? 1 : 0));
      }
      case 'tech': {
        if (fm(hv, 18) < 1) return mark(glowC, A_LIGHT);                      // filet lumineux
        if (fm(u, 22) < 1) return ramp(P, base + 2);
        return ramp(P, base);
      }
      default: return ashlarI(P, K, u, hv, base, seed);
    }
  };
  // Vitre (peinte avec le marqueur de nuit).
  const winCol = (lit) => {
    if (K.winStyle === 'glass') return mark(c(P.glassRamp, lit ? 2 : 3), A_WIN);
    if (K.winStyle === 'glow') return mark(lit ? c(P.glassRamp, 1) : c(P.glassRamp, 2), A_WIN);
    return mark(rgbOf(P.win[lit ? 0 : 1]), A_WIN);
  };
  const X = {
    P, K,
    dark: rgbOf(P.stone[8]), ink: P.stone[8],
    lite: K.snow ? SNOW[0] : ramp(P, Math.max(0, K.litBase - 1)),
    metal: (k) => c(P.metal, k), roof: (k) => c(P.roof, k), marble: (k) => c(P.marble, k),
    wood: (k) => c(P.wood, k), glass: (k) => c(P.glassRamp, k), turf: (k) => c(P.turf, k),
    win: (u, hv, lit) => winCol(lit),
    // Source de lumière (lanterne, iris, filet) : la couleur donnée, marquée pour la nuit.
    light: (col) => mark(Array.isArray(col) ? col : rgbOf(col), A_LIGHT),
    // Faces de boîte (f, u, hv, lit).
    stone: (seed) => (f, u, hv, lit) => wallAt(u, hv, shadeOf(K, lit), seed),
    rough: (seed) => (f, u, hv, lit) => ashlar(P, u, hv, lit, KR, seed),
    plain: (d = 0) => (f, u, hv, lit) => ramp(P, shadeOf(K, lit) + d),
    marbleF: (f, u, hv, lit) => rgbOf(M5[lit ? 1 : 3]),
    metalF: (f, u, hv, lit) => c(P.metal, lit ? 0 : 2),
    woodF: (f, u, hv, lit) => c(P.wood, lit ? 1 : 3),
    top: (k = 1) => () => (K.snow ? SNOW[0] : ramp(P, k)),
    // Corniche claire en haut, liseré d'ombre dessous.
    banded: (seed, h1) => (f, u, hv, lit) => (hv >= h1 - 1 ? ramp(P, shadeOf(K, lit) - 2)
      : hv === h1 - 2 ? ramp(P, shadeOf(K, lit) + 2) : wallAt(u, hv, shadeOf(K, lit), seed)),
    // Volumes éclairés (I = lumière) : facettes et révolutions. La neige tient sur
    // ce qui regarde le ciel (cran 0).
    stoneL: (I, h, a, rho, cap) => {
      if (snowy(I)) return SNOW[0];
      if (!cap && a != null && rho > 2) return wallAt(a * rho, Math.floor(h), stoneIdx(K, I), 0);
      return ramp(P, stoneIdx(K, I) + (h != null && band5(I) > 0 && fm(h, K.course || 4) < 1 ? 1 : 0));
    },
    smooth: (I) => (snowy(I) ? SNOW[0] : ramp(P, stoneIdx(K, I))),
    stoneF: (seed) => (I, x, y, h) => (snowy(I) ? SNOW[0] : wallAt(x - y, Math.floor(h), stoneIdx(K, I), seed)),
    roughL: (I, h, a) => (snowy(I) ? SNOW[1] : ramp(P, Math.min(7, stoneIdx(K, I) + 2 + (h32(Math.round(a * 9), Math.round(h / 3), 5) % 4 === 0 ? 1 : 0)))),
    metalL: (I) => (snowy(I) ? SNOW[1] : pick(P.metal, I)),
    roofL: (I) => (snowy(I) ? SNOW[0] : pick(P.roof, I)),
    marbleL: (I) => (snowy(I) ? SNOW[0] : rgbOf(M5[band5(I)])),
    woodL: (I) => (snowy(I) ? SNOW[1] : pick(P.wood, I)),
    glassL: (I) => pick(P.glassRamp, I),
    turfL: (I, h, a) => (K.snow ? SNOW[band5(I) === 0 ? 0 : 1] : c(P.turf, palIdx(I, 5) + (h32(Math.round((a || 0) * 30), Math.round((h || 0) * 1.3), 5) % 9 === 0 ? 1 : 0))),
  };
  return X;
}

// ── Pièces ───────────────────────────────────────────────────────────────────
// Ouvertures (portes, fenêtres) percées dans une texture de face : chaque trou
// { f, u0, u1, h0, h1, arch: false|'round'|'pointed', col }.
export function pierce(tex, holes) {
  return (f, u, hv, lit) => {
    for (const o of holes) {
      if (o.f !== f || u < o.u0 || u >= o.u1 || hv < o.h0) continue;
      let top = o.h1;
      const m = (o.u0 + o.u1) / 2, r = (o.u1 - o.u0) / 2;
      if (o.arch === 'pointed') top = o.h1 - Math.abs(u + 0.5 - m) * 1.3;
      else if (o.arch) top = o.h1 - r + Math.sqrt(Math.max(0, r * r - (u + 0.5 - m) * (u + 0.5 - m)));
      if (hv < top) return typeof o.col === 'function' ? o.col(u, hv, lit) : o.col;
    }
    return tex(f, u, hv, lit);
  };
}
// Rangée régulière de fenêtres sur la face f, de u0 à u1.
export function windowRow(f, u0, u1, pitch, w, h0, h1, col, arch = 'round') {
  const out = [];
  const n = Math.max(1, Math.floor((u1 - u0) / pitch));
  const start = u0 + (u1 - u0 - n * pitch) / 2 + (pitch - w) / 2;
  for (let k = 0; k < n; k += 1) out.push({ f, u0: start + k * pitch, u1: start + k * pitch + w, h0, h1, arch, col });
  return out;
}
// Corniche (et soubassement) autour d'une texture de face.
export function corniced(X, tex, h0, h1) {
  return (f, u, hv, lit) => {
    if (hv >= h1 - 2) return ramp(X.P, shadeOf(X.K, lit) - (hv === h1 - 1 ? 2 : 1));
    if (hv === h1 - 3) return ramp(X.P, shadeOf(X.K, lit) + 2);
    if (hv < h0 + 3) return ramp(X.P, shadeOf(X.K, lit) + (hv === h0 + 2 ? 1 : 0));
    return tex(f, u, hv, lit);
  };
}
// Haut INACHEVÉ : les assises s'arrêtent en dents de scie.
export function ragged(tex, hTop, seed = 0) {
  return (f, u, hv, lit) => (hv >= hTop - (h32(Math.floor(u / 4), seed, f === 'S' ? 1 : 2) % 5) ? null : tex(f, u, hv, lit));
}
// Escalier : n marches de 3 px montant de h0 (devant, y = yF) à h1, vers le nord.
export function stairs(R, X, x0, x1, yF, depth, h0, h1) {
  const n = Math.max(1, Math.round((h1 - h0) / 3));
  const d = depth / n, sh = (h1 - h0) / n;
  for (let i = n - 1; i >= 0; i -= 1) {
    const top = h0 + (i + 1) * sh;
    box(R, x0, x1, yF - (i + 1) * d, yF - i * d, h0, top,
      (f, u, hv, lit) => (hv >= top - 1 ? X.lite : ramp(X.P, shadeOf(X.K, lit))), () => X.lite);
  }
}
// Créneaux sur le pourtour d'un dessus, à l'altitude h (fond d'abord).
export function crenels(R, X, x0, x1, y0, y1, h, mw = 3, mh = 4) {
  const tex = X.plain(0), top = X.top(1);
  const m = (ax, ay) => box(R, ax, ax + mw, ay, ay + mw, h, h + mh, tex, top);
  for (let x = x0; x + mw <= x1 + 0.01; x += 2 * mw) m(x, y0);
  for (let y = y0 + 2 * mw; y + mw <= y1 - mw + 0.01; y += 2 * mw) m(x0, y);
  for (let y = y0 + 2 * mw; y + mw <= y1 - mw + 0.01; y += 2 * mw) m(x1 - mw, y);
  for (let x = x0; x + mw <= x1 + 0.01; x += 2 * mw) m(x, y1 - mw);
}
// Murs creux (chantier, enceinte) : nord, ouest, est, sud.
export function walls(R, x0, x1, y0, y1, h0, h1, th, tex, top) {
  box(R, x0, x1, y0, y0 + th, h0, h1, tex, top);
  box(R, x0, x0 + th, y0 + th, y1 - th, h0, h1, tex, top);
  box(R, x1 - th, x1, y0 + th, y1 - th, h0, h1, tex, top);
  box(R, x0, x1, y1 - th, y1, h0, h1, tex, top);
}
// Colonne : base, fût (léger galbe), chapiteau, abaque.
export function column(R, X, cx, cy, r, h0, h1, shaft) {
  revolve(R, cx, cy, h0, h0 + 2, cyl(r + 1), X.marbleL);
  revolve(R, cx, cy, h0 + 2, h1 - 3, (h) => r * (1 - (0.12 * (h - h0)) / (h1 - h0)), shaft || X.marbleL);
  revolve(R, cx, cy, h1 - 3, h1 - 1, (h) => r * 0.88 + (h - (h1 - 3)) * 0.7, X.marbleL);
  box(R, cx - r - 1.2, cx + r + 1.2, cy - r - 1.2, cy + r + 1.2, h1 - 1, h1, X.marbleF, () => X.marble(0));
}
// Cercle de pierres levées : 'back' (derrière le centre) ou 'front'.
export function menhirs(R, X, rad, n, w, h, part, a0 = Math.PI / 2 + Math.PI / n) {
  const list = [];
  for (let k = 0; k < n; k += 1) {
    const a = a0 + (k / n) * 2 * Math.PI, x = rad * Math.cos(a), y = rad * Math.sin(a), d = x + y;
    if ((part === 'back') !== (d < 0)) continue;
    list.push({ x, y, d, hh: h * (0.78 + (h32(k, 7) % 5) * 0.09), k });
  }
  list.sort((p, q) => p.d - q.d);
  for (const s of list) box(R, s.x - w / 2, s.x + w / 2, s.y - w / 2, s.y + w / 2, 0, s.hh, X.rough(50 + s.k), X.top(2));
}
// Flamme sur un petit socle de pierre (posée au dessin).
function pedestalFlame(R, X, props, x, y, h, big = false) {
  box(R, x - 2, x + 2, y - 2, y + 2, 0, h, X.plain(0), X.top(1));
  props.push({ prop: 'flame', x, y, h, big });
}
// Obélisque : socle, aiguille, pyramidion de métal.
export function obelisk(R, X, cx, cy, h0, H) {
  box(R, cx - 4, cx + 4, cy - 4, cy + 4, h0, h0 + 5, X.plain(1), X.top(1));
  frustum(R, cx - 2.6, cx + 2.6, cy - 2.6, cy + 2.6, h0 + 5, h0 + H, 0.8, X.smooth, X.smooth);
  pyramid(R, cx - 1.8, cx + 1.8, cy - 1.8, cy + 1.8, h0 + H, 5, X.metalL);
}
// ÉCHAFAUDAGE de bois devant la face f ('S' : y = fixed ; 'E' : x = fixed).
export function scaffold(R, X, f, fixed, u0, u1, h0, h1, step = 9) {
  const W = X.P.wood, at = (u, h) => (f === 'S' ? [u, fixed, h] : [fixed, u, h]);
  for (let u = u0; u <= u1 + 0.01; u += step) line(R, at(u, h0), at(u, h1), W[2]);
  for (let h = h0 + step; h <= h1 + 0.01; h += step) line(R, at(u0, h), at(u1, h), W[0]);
  for (let u = u0; u + step <= u1 + 0.01; u += step * 2) {
    for (let h = h0; h + step <= h1 + 0.01; h += step * 2) line(R, at(u, h), at(u + step, h + step), W[3]);
  }
}
// GRUE de l'ère (kit.crane) plantée en (x, y), flèche vers (tx, ty).
//   roue : mât de bois, flèche inclinée, roue à écureuil
//   vapeur : derrick en treillis, chaudière fumante
//   tour / lumiere : grue à tour, flèche horizontale et contre-flèche
export function crane(R, X, kind, x, y, h0, H, tx, ty) {
  const L = Math.hypot(tx - x, ty - y) || 1, dx = (tx - x) / L, dy = (ty - y) / L;
  const W = X.P.wood, M = X.P.metal;
  const rope = '#2a2420';
  if (kind === 'roue') {
    ring3d(R, [x - 4, y + 4, h0 + 7], 5, 1.6, PLANE_ROUND[0], PLANE_ROUND[1], () => rgbOf(W[2]));
    line(R, [x - 4, y + 4, h0 + 0.5], [x - 4, y + 4, h0 + 13.5], W[3]);
    line(R, [x - 8.6, y + 8.6, h0 + 7], [x + 0.6, y - 0.6, h0 + 7], W[3]);
    line(R, [x + 5, y, h0], [x, y, h0 + H * 0.55], W[3]);
    line(R, [x, y, h0], [x, y, h0 + H], W[1], 2);
    const jl = Math.min(L * 0.95, H * 0.75), tip = [x + dx * jl, y + dy * jl, h0 + H + jl * 0.3];
    line(R, [x, y, h0 + H * 0.8], tip, W[0], 2);
    line(R, [x, y, h0 + H + 1], tip, W[3]);
    const hk = h0 + H * 0.5;
    line(R, tip, [tip[0], tip[1], hk], rope);
    box(R, tip[0] - 2.5, tip[0] + 2.5, tip[1] - 2.5, tip[1] + 2.5, hk - 4, hk, X.plain(0), X.top(1));
  } else if (kind === 'vapeur') {
    box(R, x - 7, x - 1, y + 1, y + 6, h0, h0 + 7, (f, u, hv, lit) => rgbOf(M[lit ? 1 : 2]), () => rgbOf(M[0]));
    revolve(R, x - 5, y + 3, h0 + 7, h0 + 15, cyl(1), (I) => pick(['#4a4440', '#2e2a28'], I));
    for (const o of [-1.5, 1.5]) line(R, [x + o, y - o, h0], [x + o * 0.4, y - o * 0.4, h0 + H], M[2]);
    for (let h = h0; h < h0 + H - 4; h += 5) line(R, [x - 1.5, y + 1.5, h], [x + 1.5, y - 1.5, h + 5], M[1]);
    const jl = Math.min(L * 0.95, H * 0.8), tip = [x + dx * jl, y + dy * jl, h0 + H + jl * 0.25];
    line(R, [x, y, h0 + H * 0.75], tip, M[1], 2);
    line(R, [x, y, h0 + H + 2], tip, M[2]);
    const hk = h0 + H * 0.45;
    line(R, tip, [tip[0], tip[1], hk], rope);
    box(R, tip[0] - 2.5, tip[0] + 2.5, tip[1] - 2.5, tip[1] + 2.5, hk - 4, hk, X.plain(0), X.top(1));
  } else {
    const yel = kind === 'lumiere' ? X.P.glow : '#e0b33a', yd = kind === 'lumiere' ? M[1] : '#9a7420';
    for (const o of [-2, 2]) line(R, [x + o, y - o, h0], [x + o, y - o, h0 + H], yd);
    for (let h = h0; h < h0 + H - 4; h += 4) line(R, [x - 2, y + 2, h], [x + 2, y - 2, h + 4], yel);
    const jl = Math.min(L * 1.05, H * 0.9), tip = [x + dx * jl, y + dy * jl, h0 + H];
    const back = [x - dx * jl * 0.32, y - dy * jl * 0.32, h0 + H];
    line(R, back, tip, yel, 2);
    line(R, [x, y, h0 + H + 7], tip, yd);
    line(R, [x, y, h0 + H + 7], back, yd);
    box(R, back[0] - 3, back[0] + 3, back[1] - 3, back[1] + 3, h0 + H - 5, h0 + H, (f, u, hv, lit) => rgbOf(M[lit ? 1 : 2]), () => rgbOf(M[0]));
    box(R, x - 2.5, x + 2.5, y - 2.5, y + 2.5, h0 + H - 6, h0 + H - 1, (f, u, hv, lit) => rgbOf(lit ? yel : yd), () => rgbOf(yel));
    const hk = h0 + H * 0.55, t2 = [x + dx * jl * 0.7, y + dy * jl * 0.7, h0 + H];
    line(R, t2, [t2[0], t2[1], hk], rope);
    box(R, t2[0] - 2.5, t2[0] + 2.5, t2[1] - 2.5, t2[1] + 2.5, hk - 4, hk, X.plain(0), X.top(1));
  }
}

// Teinte des statues d'apparat : le métal de l'ère (rien aux âges de pierre).
function statueTint(K) {
  return K.band >= 4 ? K.pal.metal[0] : null;
}

// ── Cadre et contour ─────────────────────────────────────────────────────────
function rasterFor(B, H, extra = 0) {
  const r = B / 2 + 4 + extra;
  return frameOf(V, [[-r, r, -r, r, -2, H + 6]]);
}
// CALQUE DE NUIT : les vitres marquées s'allument (pas toutes : une sur trois reste
// noire, tirée par fenêtre et non par pixel), les sources de lumière gardent leur
// couleur. Rend le raster N (même cadre que R) ou null s'il n'y a rien à allumer.
export function nightOf(R, X) {
  const N = { ox: R.ox, oy: R.oy, w: R.w, h: R.h, data: new Uint8ClampedArray(R.data.length) };
  const night = rgbOf(X.P.night);
  let any = false;
  for (let j = 0; j < R.h; j += 1) {
    for (let i = 0; i < R.w; i += 1) {
      const k = (j * R.w + i) * 4, a = R.data[k + 3];
      if (a !== A_WIN && a !== A_LIGHT) continue;
      R.data[k + 3] = 255;
      if (a === A_WIN && h32(i >> 2, j >> 3, 77) % 3 === 0) continue;
      const c = a === A_WIN ? night : [R.data[k], R.data[k + 1], R.data[k + 2]];
      N.data[k] = c[0]; N.data[k + 1] = c[1]; N.data[k + 2] = c[2]; N.data[k + 3] = a === A_WIN ? 235 : 255;
      any = true;
    }
  }
  return any ? N : null;
}
// Sommet du monument : milieu de sa plus haute rangée de pixels (coordonnées raster).
function topOf(R) {
  for (let j = 0; j < R.h; j += 1) {
    let i0 = -1, i1 = -1;
    for (let i = 0; i < R.w; i += 1) if (R.data[(j * R.w + i) * 4 + 3]) { if (i0 < 0) i0 = i; i1 = i; }
    if (i0 >= 0) return { rx: (i0 + i1 + 1) / 2, ry: j };
  }
  return null;
}
function finish(R, X, props, B, H, o = {}) {
  outline(R, X.ink);
  const N = nightOf(R, X);
  // Ce que porte l'ère au sommet : balise d'aviation rouge dès le néon, halo de
  // lumière qui flotte au-dessus aux âges cosmiques.
  const t = topOf(R);
  if (t && X.K.band >= 6 && !o.noBeacon) props.push({ prop: 'beacon', rx: t.rx, ry: t.ry - 1 });
  if (t && X.K.band >= 7 && !o.noHalo) props.push({ prop: 'halo', rx: t.rx, ry: t.ry - 14, r: Math.max(8, Math.min(26, B * 0.14)) });
  return { R, N, props, B, H };
}

// ══ LE GRAND MAUSOLÉE (effondrements traversés) ══════════════════════════════
// Une nécropole qui grandit par ACCRÉTION :
//   I   tumulus gazonné, dolmen d'entrée, cercle de pierres levées
//   II  mastaba à deux degrés, escaliers, tambour funéraire au sommet
//   III pyramide à degrés, chapelle haute à portique
//   IV  + obélisques aux coins, statues au pied de l'escalier
//   V   mausolée d'Halicarnasse : podium à frise, péristyle, toit pyramidal à
//       gradins, quadrige doré au sommet
export function bakeMausoleum(K, tier, B, Hmax) {
  const X = mats(K), R = rasterFor(B, Hmax), props = [];
  const half = B / 2;
  if (tier === 1) {
    const r = B * 0.33, yE = r * 0.86, H = r * 0.8;
    menhirs(R, X, half * 0.92, 11, 3, 13, 'back');
    revolve(R, 0, 0, 0, 4, cyl(r + 2), X.stoneL);
    revolve(R, 0, 0, 4, 4 + H, domeProf(4, r, H), X.turfL);
    box(R, -3.5, 3.5, yE - 8, yE + 1, 0, 12, () => X.dark, null);
    box(R, -8, -3.5, yE - 6, yE + 3, 0, 13, X.rough(31), X.top(2));
    box(R, 3.5, 8, yE - 6, yE + 3, 0, 13, X.rough(37), X.top(2));
    box(R, -10, 10, yE - 8, yE + 4, 13, 17, X.rough(41), X.top(1));
    menhirs(R, X, half * 0.92, 11, 3, 13, 'front');
    pedestalFlame(R, X, props, -15, yE + 8, 6);
    pedestalFlame(R, X, props, 15, yE + 8, 6);
  } else if (tier === 2) {
    const s1 = half * 0.84, h1 = 28, i1 = 4;
    frustum(R, -s1, s1, -s1, s1, 0, h1, i1, X.stoneF(21), X.top(1));
    stairs(R, X, -7, 7, s1 + 9, 9 + i1 + 2, 0, h1);
    const s2 = (s1 - i1) * 0.64, h2 = h1 + 22, i2 = 3;
    frustum(R, -s2, s2, -s2, s2, h1, h2, i2, X.stoneF(23), X.top(1));
    stairs(R, X, -5, 5, s2 + 7, 7 + i2 + 1, h1, h2);
    const r = (s2 - i2) * 0.62;
    revolve(R, 0, 0, h2, h2 + 20, cyl(r), (I, h, a) => (Math.abs(a - Math.PI / 2) < 5 / r && h < h2 + 13 ? X.metal(h < h2 + 12 ? 1 : 0) : X.stoneL(I, h)));
    revolve(R, 0, 0, h2 + 20, h2 + 20 + r * 0.5, domeProf(h2 + 20, r + 1, r * 0.5), X.stoneL);
    const k = s1 - i1 - 3;
    props.push({ prop: 'flame', x: -k, y: k, h: h1 }, { prop: 'flame', x: k, y: k, h: h1 }, { prop: 'flame', x: k, y: -k, h: h1 });
  } else if (tier <= 4) {
    const podH = 6, n = tier === 3 ? 5 : 6, stepH = 24, s0 = half * 0.96;
    box(R, -s0, s0, -s0, s0, 0, podH, X.banded(11, podH), X.top(2));
    stairs(R, X, -8, 8, s0 + 6, 6, 0, podH);
    let h = podH, s = s0 - 10;
    const sTop = half * 0.3, sb = (s - sTop) / n;
    const lev = [];
    for (let i = 0; i < n; i += 1) {
      box(R, -s, s, -s, s, h, h + stepH, X.banded(13 + i, h + stepH), X.top(2));
      stairs(R, X, -6, 6, s + sb * 0.85, sb * 0.85, h, h + stepH);
      lev.push({ s, h: h + stepH });
      h += stepH; s -= sb;
    }
    chapel(R, X, 0, 0, s + sb, h, props);
    for (const L of lev.slice(0, 2)) props.push({ prop: 'flame', x: -L.s + 3, y: L.s - 3, h: L.h, small: true }, { prop: 'flame', x: L.s - 3, y: L.s - 3, h: L.h, small: true });
    if (tier === 4) {
      const o = s0 - 5;
      obelisk(R, X, o, -o, podH, 62);
      obelisk(R, X, -o, o, podH, 62);
      obelisk(R, X, o, o, podH, 62);
      props.push({ prop: 'statue', x: -13, y: s0 + 4, h: 0 }, { prop: 'statue', x: 13, y: s0 + 4, h: 0 });
    }
  } else {
    const s = half * 0.97;
    box(R, -s, s, -s, s, 0, 5, X.plain(1), X.top(2));
    const p = s * 0.9, podH = 70;
    const frieze = (f, u, hv, lit) => {
      if (hv >= podH - 3) return ramp(X.P, shadeOf(K, lit) - (hv === podH - 1 ? 2 : 1));
      if (hv >= podH - 17 && hv < podH - 5) {
        const m = fm(u, 9);
        const fig = m >= 2 && m < 6 && (hv < podH - 8 || m === 3 || m === 4);
        return fig ? X.marble(lit ? 0 : 1) : X.roof(lit ? 2 : 3);
      }
      if (hv === podH - 18 || hv === podH - 4) return ramp(X.P, shadeOf(K, lit) + 2);
      if (hv < 10) return ramp(X.P, shadeOf(K, lit) - 1 + (hv === 9 ? 2 : 0));
      return X.stone(19)(f, u, hv, lit);
    };
    box(R, -p, p, -p, p, 5, podH, frieze, X.top(2));
    const c = p * 0.8, colH = 52, h0 = podH;
    box(R, -c * 0.76, c * 0.76, -c * 0.76, c * 0.76, h0, h0 + colH,
      pierce(X.stone(23), [{ f: 'S', u0: -6, u1: 6, h0, h1: h0 + 26, arch: false, col: (u, hv, lit) => X.metal(fm(u, 4) < 1 ? 2 : lit ? 1 : 2) }]), null);
    const nC = 9;
    for (let i = 0; i < nC - 1; i += 1) column(R, X, c, -c + (2 * c * i) / (nC - 1), 2.7, h0, h0 + colH);
    for (let i = 0; i < nC; i += 1) column(R, X, -c + (2 * c * i) / (nC - 1), c, 2.7, h0, h0 + colH);
    const e0 = h0 + colH, e1 = e0 + 8;
    box(R, -c - 3, c + 3, -c - 3, c + 3, e0, e1,
      (f, u, hv, lit) => (hv >= e1 - 2 ? X.marble(0) : hv === e0 + 3 && fm(u, 3) < 1.5 ? X.marble(2) : X.marble(lit ? 1 : 2)), () => X.marble(0));
    const rH = 92;
    frustum(R, -c - 3, c + 3, -c - 3, c + 3, e1, e1 + rH, c - 4,
      (I, x, y, h) => ramp(X.P, stoneIdx(K, I) + (fm(h - e1, 3) < 1 ? 1 : 0)), X.top(1));
    props.push({ prop: 'statue', x: 0, y: 0, h: e1 + rH, big: true, tint: statueTint(K) });
    for (const [x, y] of [[-p + 4, p - 4], [p - 4, p - 4], [p - 4, -p + 4]]) props.push({ prop: 'statue', x, y, h: podH, small: true });
    for (const [x, y] of [[-s + 3, s - 3], [s - 3, s - 3], [s - 3, -s + 3]]) props.push({ prop: 'flame', x, y, h: 5 });
  }
  return finish(R, X, props, B, Hmax);
}
// Chapelle haute : cella, portique de quatre colonnes, fronton, toit de tuiles.
function chapel(R, X, cx, cy, c, h, props) {
  const w = c * 0.66, d0 = -c * 0.75, d1 = c * 0.3, colY = c * 0.74, H = Math.max(16, c * 1.15);
  box(R, cx - w, cx + w, cy + d0, cy + d1, h, h + H,
    pierce(X.stone(17), [{ f: 'S', u0: cx - 3.5, u1: cx + 3.5, h0: h, h1: h + H * 0.6, arch: 'round', col: X.dark }]), X.top(2));
  for (let k = 0; k < 4; k += 1) column(R, X, cx - w + (2 * w * k) / 3, cy + colY, 1.9, h, h + H);
  const e = h + H;
  box(R, cx - w - 2, cx + w + 2, cy + d0 - 2, cy + colY + 2.5, e, e + 3, X.marbleF, () => X.marble(0));
  gable(R, cx - w - 2, cx + w + 2, cy + d0 - 2, cy + colY + 2.5, e + 3, Math.max(7, w * 0.75), X.roofL, X.marbleL);
  props.push({ prop: 'flame', x: cx - w - 1, y: cy + colY + 5, h }, { prop: 'flame', x: cx + w + 1, y: cy + colY + 5, h });
}

// ══ LA COLONNE DU MILLION (Rayonnement) ══════════════════════════════════════
//   I   stèle gravée sur un emmarchement
//   II  colonne sur podium, trépied de bronze
//   III colonne à statue, quatre colonnettes à flammes
//   IV  + exèdre à colonnade derrière
//   V   colonne monumentale à relief en spirale, statue dorée, torchères
export function bakeColumn(K, tier, B, Hmax) {
  const X = mats(K), half = B / 2;
  const exR = Math.max(half * 1.6, 46);
  const R = rasterFor(B, Hmax, tier >= 4 ? Math.max(0, exR + 8 - half) : 0), props = [];
  if (tier >= 4) exedra(R, X, exR, props);
  let h = 0, s = half * 0.92;
  const s0 = s;
  for (let k = 0; k < 3; k += 1) { box(R, -s, s, -s, s, h, h + 4, X.plain(k === 0 ? 1 : 0), X.top(k === 2 ? 1 : 2)); h += 4; s -= half * 0.1; }
  const sTop = s + half * 0.1;
  if (tier === 1) {
    box(R, -9, 9, -5, 5, h, h + 6, X.plain(0), X.top(1));
    const a = h + 6, b = a + 84;
    box(R, -6.5, 6.5, -2.5, 2.5, a, b, (f, u, hv, lit) => (f === 'S' && hv > a + 10 && hv < b - 14 && fm(hv - a, 4) === 0 && Math.abs(u) < 5 && h32(Math.floor(u), hv) % 3 !== 0
      ? X.marble(2) : X.marble(lit ? 0 : 2)), null);
    gable(R, -7, 7, -3, 3, b, 7, X.marbleL, X.marbleL);
    props.push({ prop: 'flame', x: -sTop + 2.5, y: sTop - 2.5, h }, { prop: 'flame', x: sTop - 2.5, y: sTop - 2.5, h });
    return finish(R, X, props, B, Hmax);
  }
  const big = tier >= 5;
  const p = half * (big ? 0.6 : 0.5), pH = big ? 38 : 22;
  const cs = sTop - 3;
  // Colonnettes (III+) et torchères (V) devant/à côté du fût : NO, NE, SO d'abord.
  const minor = (x, y) => {
    if (big) {
      revolve(R, x, y, 0, 28, (hh) => (hh < 3 ? 2.6 : 1.2), X.metalL);
      revolve(R, x, y, 28, 31, (hh) => 1.5 + (hh - 28) * 0.8, X.metalL);
      props.push({ prop: 'flame', x, y, h: 31, big: true });
    } else if (tier >= 3) {
      column(R, X, x, y, 2.2, h, h + 30);
      props.push({ prop: 'flame', x, y, h: h + 30 });
    }
  };
  const tc = big ? s0 + 3 : cs;
  if (tier >= 3) { minor(tc, -tc); minor(-tc, tc); }
  const ped = (f, u, hv, lit) => {
    const top = h + pH;
    if (hv >= top - 3) return ramp(X.P, shadeOf(K, lit) - (hv === top - 1 ? 2 : 1));
    if (hv < h + 4) return ramp(X.P, shadeOf(K, lit) + (hv === h + 3 ? 1 : -1));
    if (big && hv >= h + 9 && hv < top - 8 && Math.abs(u) < p - 5) {
      const m = fm(u + 100, 7);
      return hv === h + 9 || hv === top - 9 ? X.metal(1) : m < 3 && h32(Math.floor(u), hv) % 4 ? X.marble(lit ? 0 : 1) : ramp(X.P, shadeOf(K, lit) + 1);
    }
    return X.stone(41)(f, u, hv, lit);
  };
  box(R, -p, p, -p, p, h, h + pH, ped, X.top(2));
  const r0 = big ? 9 : 7, a = h + pH;
  const L = Math.min(Hmax - a - 34, { 2: 100, 3: 128, 4: 150, 5: 214 }[tier]);
  revolve(R, 0, 0, a, a + 4, cyl(r0 + 2.5), X.marbleL);
  const spiral = (I, hh, ang) => {
    const pitch = 15, k = fm(hh - ((ang + Math.PI) / (2 * Math.PI)) * pitch, pitch);
    if (k < 1.2) return X.marble(2);
    if (k > 3 && k < 12 && h32(Math.round(ang * 12), Math.round(hh)) % 3 === 0) return pick(X.P.marble, I - 0.18);
    return X.marbleL(I);
  };
  revolve(R, 0, 0, a + 4, a + 4 + L, (hh) => r0 * (1 - (0.1 * (hh - a)) / L), big ? spiral : X.marbleL, big ? 0 : 16);
  const c0 = a + 4 + L;
  revolve(R, 0, 0, c0, c0 + 4, (hh) => r0 * 0.9 + (hh - c0) * 0.9, X.marbleL);
  box(R, -r0 - 3, r0 + 3, -r0 - 3, r0 + 3, c0 + 4, c0 + 7, X.marbleF, () => X.marble(0));
  const top = c0 + 7;
  if (tier === 2) {
    revolve(R, 0, 0, top, top + 6, (hh) => (hh < top + 3 ? 1.2 : 2.5 + (hh - top - 3) * 0.9), X.metalL);
    props.push({ prop: 'flame', x: 0, y: 0, h: top + 6, big: true });
  } else {
    revolve(R, 0, 0, top, top + 5, cyl(r0 * 0.7), X.marbleL);
    props.push({ prop: 'statue', x: 0, y: 0, h: top + 5, big: true, tint: big ? statueTint(K) || 'gold' : statueTint(K) });
  }
  if (tier >= 3) minor(tc, tc);
  return finish(R, X, props, B, Hmax);
}
// Exèdre : demi-cercle de colonnes au nord, mur de fond, entablement courbe.
function exedra(R, X, rad, props) {
  const a0 = -Math.PI + 0.3, a1 = -0.3, colH = 34;
  arcBand(R, 0, 0, rad - 6, rad + 6, a0, a1, 0, 4, X.stoneF(61));
  arcBand(R, 0, 0, rad + 3, rad + 6, a0, a1, 4, 4 + colH - 6, X.stoneF(63));
  const n = 9, cols = [];
  for (let k = 0; k < n; k += 1) { const a = a0 + ((k + 0.5) / n) * (a1 - a0); cols.push({ a, d: Math.cos(a) + Math.sin(a) }); }
  cols.sort((p, q) => p.d - q.d);
  for (const c of cols) column(R, X, (rad - 2) * Math.cos(c.a), (rad - 2) * Math.sin(c.a), 2.2, 4, 4 + colH);
  arcBand(R, 0, 0, rad - 5, rad + 6, a0, a1, 4 + colH, 4 + colH + 5, (I) => pick(X.P.marble, I));
  for (const a of [a0, a1]) props.push({ prop: 'statue', x: rad * Math.cos(a), y: rad * Math.sin(a), h: 4 });
}

// ══ LE PALAIS DE LA COURONNE (ère atteinte) ══════════════════════════════════
//   I   donjon crénelé à bannière, petite enceinte
//   II  château : courtines crénelées, tours rondes à poivrière, châtelet
//   III palais : corps de logis, ailes, cour d'honneur, coupole
//   IV  + pavillons d'angle, grand escalier, parterres
//   V   cité palatiale : tours à bulbe d'or, grande coupole dorée, dômes des ailes
export function bakePalace(K, tier, B, Hmax) {
  const X = mats(K), R = rasterFor(B, Hmax), props = [];
  const u = B, half = B / 2;
  const flag = (x, y, h, poleH = 12) => props.push({ prop: 'flag', x, y, h, poleH, fw: 7, fh: 4 });
  const wall = (f, uu, hv, lit) => X.stone(71)(f, uu, hv, lit);
  if (tier <= 2) {
    const s = half * (tier === 1 ? 0.9 : 0.88), wh = tier === 1 ? 9 : 20, th = tier === 1 ? 3 : 4;
    const tower = (x, y, r, hT, roof = true) => {
      revolve(R, x, y, 0, hT, cyl(r), (I, h) => X.stoneL(I, h));
      if (roof) {
        revolve(R, x, y, hT, hT + r * 2.1, taper(hT, hT + r * 2.1, r + 1.2, 0), X.roofL);
        flag(x, y, hT + r * 2.1, 8);
      }
    };
    const gateHoles = [{ f: 'S', u0: -4, u1: 4, h0: 0, h1: Math.min(wh - 2, 12), arch: 'round', col: X.dark }];
    const tR = 7, tH = wh + 12;
    if (tier === 2) tower(-s, -s, tR, tH);
    box(R, -s, s, -s, -s + th, 0, wh, wall, X.top(2));
    if (tier === 2) crenels(R, X, -s, s, -s, -s + th, wh, 2.5, 3);
    box(R, -s, -s + th, -s + th, s - th, 0, wh, wall, X.top(2));
    if (tier === 2) crenels(R, X, -s, -s + th, -s, s, wh, 2.5, 3);
    // Donjon.
    const k = tier === 1 ? u * 0.21 : u * 0.15, ky = tier === 1 ? -2 : -u * 0.14, kh = tier === 1 ? 50 : 58;
    box(R, -k, k, ky - k, ky + k, 0, kh,
      corniced(X, pierce(X.stone(73), [
        { f: 'S', u0: -3.5, u1: 3.5, h0: 0, h1: 12, arch: 'round', col: X.dark },
        ...windowRow('S', -k, k, 9, 2, kh * 0.45, kh * 0.45 + 6, X.win, 'round'),
        ...windowRow('E', ky - k, ky + k, 9, 2, kh * 0.45, kh * 0.45 + 6, X.win, 'round'),
        ...windowRow('S', -k, k, 9, 2, kh * 0.72, kh * 0.72 + 6, X.win, 'round'),
        ...windowRow('E', ky - k, ky + k, 9, 2, kh * 0.72, kh * 0.72 + 6, X.win, 'round'),
      ]), 0, kh), X.top(2));
    crenels(R, X, -k, k, ky - k, ky + k, kh, 3, 4);
    for (const [bx, by] of [[-k, ky - k], [k, ky - k], [-k, ky + k], [k, ky + k]]) {
      revolve(R, bx, by, kh - 12, kh + 2, cyl(3), (I, h) => X.stoneL(I, h));
      revolve(R, bx, by, kh + 2, kh + 10, taper(kh + 2, kh + 10, 4, 0), X.roofL);
    }
    flag(0, ky, kh + 4, 14);
    if (tier === 2) { tower(s, -s, tR, tH); tower(-s, s, tR, tH); }
    box(R, s - th, s, -s + th, s - th, 0, wh, wall, X.top(2));
    if (tier === 2) crenels(R, X, s - th, s, -s, s, wh, 2.5, 3);
    box(R, -s, s, s - th, s, 0, wh, pierce(wall, gateHoles), X.top(2));
    if (tier === 2) {
      crenels(R, X, -s, s, s - th, s, wh, 2.5, 3);
      tower(-8, s, 5, wh + 8); tower(8, s, 5, wh + 8);
      tower(s, s, tR, tH);
    } else {
      props.push({ prop: 'flame', x: -6, y: s + 2, h: 0 }, { prop: 'flame', x: 6, y: s + 2, h: 0 });
    }
    return finish(R, X, props, B, Hmax);
  }
  // ── Palais (III-V) ──
  const Hm = (tier >= 4 ? 0.3 : 0.34) * u, Hw = Hm * 0.86;
  const m0 = -0.44 * u, m1 = -0.14 * u, xw = 0.44 * u, xi = 0.27 * u, yS = 0.38 * u;
  const fac = (x0, x1, y0, y1, h1, rows, seed) => {
    const holes = [];
    const fh = (h1 - 4) / rows;
    for (let r = 0; r < rows; r += 1) {
      const wb = 3 + r * fh + fh * 0.22, wt = wb + fh * 0.55;
      holes.push(...windowRow('S', x0 + 1, x1 - 1, 7, 3, wb, wt, X.win), ...windowRow('E', y0 + 1, y1 - 1, 7, 3, wb, wt, X.win));
    }
    return corniced(X, pierce(X.stone(seed), holes), 0, h1);
  };
  const block = (x0, x1, y0, y1, h1, rows, seed, roofH) => {
    box(R, x0, x1, y0, y1, 0, h1, fac(x0, x1, y0, y1, h1, rows, seed), X.top(2));
    if (roofH) hip(R, x0 - 1, x1 + 1, y0 - 1, y1 + 1, h1, roofH, X.roofL);
  };
  const gold = (I) => pick(X.P.metal, I);
  const domeC = tier >= 5 ? gold : (I) => pick(X.P.roof, I);
  // Tours du fond (V) : derrière le corps de logis, leur haut le domine.
  const towerV = (x, y) => {
    const tw = 0.05 * u, tH = 0.88 * u;
    box(R, x - tw, x + tw, y - tw, y + tw, 0, tH,
      corniced(X, pierce(X.stone(81), [...windowRow('S', x - tw, x + tw, 6, 2, tH * 0.55, tH * 0.55 + 8, X.win), ...windowRow('E', y - tw, y + tw, 6, 2, tH * 0.55, tH * 0.55 + 8, X.win),
        ...windowRow('S', x - tw, x + tw, 6, 2, tH * 0.8, tH * 0.8 + 8, X.win), ...windowRow('E', y - tw, y + tw, 6, 2, tH * 0.8, tH * 0.8 + 8, X.win)]), 0, tH), X.top(2));
    revolve(R, x, y, tH, tH + tw * 1.4, (h) => tw * 1.05 * Math.sin(Math.PI * Math.min(1, 0.25 + (0.75 * (h - tH)) / (tw * 1.4))) + 0.3, gold);
    revolve(R, x, y, tH + tw * 1.4, tH + tw * 1.4 + 6, taper(tH + tw * 1.4, tH + tw * 1.4 + 6, 1.4, 0), gold);
    flag(x, y, tH + tw * 1.4 + 6, 8);
  };
  if (tier >= 5) { towerV(-0.36 * u, -0.46 * u); towerV(0.36 * u, -0.46 * u); }
  block(-xw, xw, m0, m1, Hm, tier >= 4 ? 3 : 2, 83, 0.07 * u);
  // Coupole sur tambour, au milieu du corps de logis.
  const dr = (tier >= 5 ? 0.13 : 0.1) * u, dy = -0.29 * u, d0 = Hm + 0.07 * u * 0.5, d1 = d0 + (tier >= 5 ? 0.14 : 0.11) * u;
  if (tier >= 5) {
    const n = 12, cols = [];
    for (let k = 0; k < n; k += 1) { const a = (k / n) * 2 * Math.PI; cols.push({ a, d: Math.cos(a) + Math.sin(a) }); }
    revolve(R, 0, dy, d0, d1, cyl(dr), (I, h) => X.stoneL(I, h));
    cols.sort((p, q) => p.d - q.d);
    for (const c of cols) if (c.d > -0.4) column(R, X, (dr + 2) * Math.cos(c.a), dy + (dr + 2) * Math.sin(c.a), 1.6, d0, d1);
    box(R, -dr - 4, dr + 4, dy - dr - 4, dy + dr + 4, d1, d1 + 2, X.marbleF, () => X.marble(0));
  } else {
    revolve(R, 0, dy, d0, d1, cyl(dr), (I, h, a) => (fm(a * dr, 7) < 2.4 && h > d0 + 3 && h < d1 - 3 && Math.cos(a) + Math.sin(a) > -0.2 ? X.win(0, 0, I > 0.3) : X.stoneL(I, h)));
  }
  const dTop = d1 + (tier >= 5 ? 2 : 0), dH = dr * 1.05;
  revolve(R, 0, dy, dTop, dTop + dH, domeProf(dTop, dr + 1, dH), (I, h, a) => (fm(a * 12 / Math.PI, 2) < 0.18 ? pick(X.P.metal, I - 0.2) : domeC(I)));
  revolve(R, 0, dy, dTop + dH - 1, dTop + dH + 7, cyl(2.4), X.marbleL);
  revolve(R, 0, dy, dTop + dH + 7, dTop + dH + 13, taper(dTop + dH + 7, dTop + dH + 13, 2.6, 0), gold);
  // Avant-corps central à fronton.
  const ac = 0.1 * u;
  box(R, -ac, ac, m1 - 2, m1 + 3, 0, Hm + 4, corniced(X, pierce(X.stone(85), [{ f: 'S', u0: -4, u1: 4, h0: 0, h1: 14, arch: 'round', col: X.dark }]), 0, Hm + 4), X.top(2));
  gable(R, -ac - 1, ac + 1, m1 - 3, m1 + 4, Hm + 4, 8, X.roofL, X.marbleL);
  if (tier >= 4) {
    box(R, -0.2 * u, 0.2 * u, m1, m1 + 0.1 * u, 0, 8, X.banded(87, 8), X.top(1));
    stairs(R, X, -0.1 * u, 0.1 * u, m1 + 0.1 * u + 8, 8, 0, 8);
  }
  // Ailes et cour.
  const wingRoof = 0.06 * u;
  block(-xw, -xi, m1, yS, Hw, tier >= 4 ? 3 : 2, 89, wingRoof);
  if (tier >= 5) {
    revolve(R, -(xw + xi) / 2, (m1 + yS) / 2, Hw + wingRoof * 0.6, Hw + wingRoof * 0.6 + 0.05 * u, domeProf(Hw + wingRoof * 0.6, 0.05 * u, 0.05 * u), gold);
  }
  // Parterres (IV+) ou pavé de cour et bassin.
  const cy0 = m1 + (tier >= 4 ? 0.1 * u + 10 : 4), cy1 = yS - 4;
  if (tier >= 4) {
    for (const [x0, x1] of [[-xi + 4, -4], [4, xi - 4]]) {
      box(R, x0, x1, cy0, cy1, 0, 2, X.plain(1), (x, y) => (Math.abs(x - (x0 + x1) / 2) < 1.2 || Math.abs(y - (cy0 + cy1) / 2) < 1.2 ? X.lite
        : K.snow ? X.lite : X.turf(fm(Math.floor(x / 3) + Math.floor(y / 3), 2) ? 1 : 2)));
    }
  }
  revolve(R, 0, (cy0 + cy1) / 2, 0, 3, cyl(tier >= 4 ? 5 : 6), (I, h, a, rho, cap) => (cap ? (rho < 4 ? X.glass(1) : X.lite) : X.stoneL(I, h)));
  block(xi, xw, m1, yS, Hw, tier >= 4 ? 3 : 2, 91, wingRoof);
  if (tier >= 5) {
    revolve(R, (xw + xi) / 2, (m1 + yS) / 2, Hw + wingRoof * 0.6, Hw + wingRoof * 0.6 + 0.05 * u, domeProf(Hw + wingRoof * 0.6, 0.05 * u, 0.05 * u), gold);
  }
  // Pavillons d'angle (IV+) au bout des ailes.
  if (tier >= 4) {
    for (const sx of [-1, 1]) {
      const x0 = sx < 0 ? -xw - 3 : xi - 3, x1 = sx < 0 ? -xi + 3 : xw + 3, y0 = yS - 0.16 * u, y1 = yS + 3, ph = Hw + 8;
      box(R, x0, x1, y0, y1, 0, ph, fac(x0, x1, y0, y1, ph, 3, 93 + sx), X.top(2));
      frustum(R, x0 - 1, x1 + 1, y0 - 1, y1 + 1, ph, ph + 10, 4, (I) => (tier >= 5 ? gold(I) : X.roofL(I)), (I) => X.roofL(I));
      flag((x0 + x1) / 2, (y0 + y1) / 2, ph + 10, 10);
    }
  }
  // Grille de la cour d'honneur.
  box(R, -xi, xi, yS - 2, yS, 0, 5, (f, uu, hv, lit) => (hv >= 3 || fm(uu, 3) < 1 ? X.metal(lit ? 1 : 2) : null), null);
  for (const gx of [-6, 6]) box(R, gx - 2, gx + 2, yS - 3, yS + 1, 0, 12, X.plain(0), X.top(1));
  props.push({ prop: 'statue', x: -6, y: yS - 1, h: 12, small: true }, { prop: 'statue', x: 6, y: yS - 1, h: 12, small: true });
  flag(-ac, m1, Hm + 12 + 2, 10); flag(ac, m1, Hm + 12 + 2, 10);
  return finish(R, X, props, B, Hmax);
}

// ══ LA CATHÉDRALE INACHEVÉE (achats accomplis) ═══════════════════════════════
// Un chantier qui ne finit jamais vraiment : le plan (nef nord-sud, façade et
// tours au sud, face à la ville) monte d'un rang à l'autre.
//   I   fondations tracées, chœur couvert (la chapelle), grue, blocs
//   II  transept et nef qui montent, échafaudages, contreforts
//   III nef couverte, façade, une tour à moitié
//   IV  deux tours, arcs-boutants, rosace, tour de croisée
//   V   flèches achevées — et une dernière grue, pour l'éternité
export function bakeCathedral(K, tier, B, Hmax) {
  const X = mats(K), R = rasterFor(B, Hmax), props = [];
  const u = B;
  const Hn = 0.42 * u, Ha = 0.24 * u, Rn = 0.13 * u, xa = 0.27 * u;
  const yT0 = -0.26 * u, yT1 = -0.1 * u, xT = 0.42 * u, yC0 = -0.42 * u;
  const yF = 0.26 * u, yFront = 0.44 * u, tw0 = 0.1 * u, tw1 = 0.3 * u, yTw = 0.46 * u;
  const tFull = 0.8 * u, spH = 0.62 * u;
  const st = (seed) => X.stone(seed);
  const lancet = (f, u0, u1, h0, h1, pitch = 8, w = 3) => windowRow(f, u0, u1, pitch, w, h0, h1, X.win, 'pointed');
  // Chœur et abside (la chapelle du rang I).
  const choirH = tier === 1 ? Hn * 0.72 : Hn;
  revolve(R, 0, yC0, 0, choirH, cyl(Rn), (I, h, a) => (Math.cos(a) > 0.2 && fm(a * Rn, 9) < 3 && h > choirH * 0.35 && h < choirH * 0.8 ? X.win(0, 0, I > 0.3) : X.stoneL(I, h)));
  revolve(R, 0, yC0, choirH, choirH + 0.13 * u, taper(choirH, choirH + 0.13 * u, Rn + 1.5, 0), X.roofL);
  box(R, -Rn, Rn, yC0, yT0, 0, choirH, corniced(X, pierce(st(101), lancet('E', yC0, yT0, choirH * 0.35, choirH * 0.8)), 0, choirH), X.top(2));
  gable(R, -Rn - 1, Rn + 1, yC0 - 1, yT0, choirH, 0.14 * u, X.roofL, X.marbleL);
  if (tier === 1) {
    // Fondations : le tracé de tout le plan, à hauteur de genou.
    const fh = 4, ft = 2.5, fs = X.rough(103);
    walls(R, -xT, xT, yT0, yT1, 0, fh, ft, fs, X.top(2));
    walls(R, -xa, xa, yT1 - ft, yF + ft, 0, fh, ft, fs, X.top(2));
    walls(R, -tw1, -tw0, yF, yTw, 0, fh, ft, fs, X.top(2));
    walls(R, tw0, tw1, yF, yTw, 0, fh, ft, fs, X.top(2));
    for (let y = yT1 + 0.08 * u; y < yF - 2; y += 0.09 * u) for (const x of [-Rn, Rn]) box(R, x - 2, x + 2, y - 2, y + 2, 0, 5, fs, X.top(2));
    for (const [bx, by] of [[-0.18 * u, 0.02 * u], [0.16 * u, 0.12 * u], [-0.04 * u, 0.3 * u], [0.06 * u, 0.33 * u]]) {
      box(R, bx - 3, bx + 3, by - 2.5, by + 2.5, 0, 4, X.plain(0), X.top(1));
    }
    crane(R, X, K.crane, 0.24 * u, -0.06 * u, 0, 0.62 * u, 0, yT0);
    return finish(R, X, props, B, Hmax);
  }
  // Transept.
  const tH = tier === 2 ? Hn * 0.8 : Hn;
  if (tier === 2) {
    walls(R, -xT, xT, yT0, yT1, 0, tH, 3, ragged(st(105), tH, 1), X.top(2));
  } else {
    box(R, -xT, xT, yT0, yT1, 0, Hn, corniced(X, pierce(st(105), [...lancet('S', -xT + 2, -Rn - 2, Hn * 0.3, Hn * 0.82, 9, 4), ...lancet('S', Rn + 2, xT - 2, Hn * 0.3, Hn * 0.82, 9, 4),
      { f: 'E', u0: (yT0 + yT1) / 2 - 0.05 * u, u1: (yT0 + yT1) / 2 + 0.05 * u, h0: Hn * 0.4, h1: Hn * 0.86, arch: 'pointed', col: X.win }]), 0, Hn), X.top(2));
    gable(R, -xT - 1, xT + 1, yT0 - 1, yT1 + 1, Hn, 0.14 * u, X.roofL, X.marbleL, true);
  }
  // Tour de croisée (IV+), flèche (V).
  if (tier >= 4) {
    const ch = Hn + 0.14 * u + 0.1 * u, cx0 = -Rn * 0.8, cx1 = Rn * 0.8, cyA = yT0 + 2, cyB = yT1 - 2;
    box(R, cx0, cx1, cyA, cyB, Hn, ch, corniced(X, pierce(st(107), [...lancet('S', cx0, cx1, ch - 0.11 * u, ch - 4, 6, 2), ...lancet('E', cyA, cyB, ch - 0.11 * u, ch - 4, 6, 2)]), Hn, ch), X.top(2));
    if (tier >= 5) pyramid(R, cx0, cx1, cyA, cyB, ch, 0.42 * u, (I, x, y, h) => (fm(h, 6) < 1 ? pick(X.P.roof, I - 0.15) : X.roofL(I)));
    else crenels(R, X, cx0, cx1, cyA, cyB, ch, 2.5, 3);
  }
  // Nef et bas-côtés.
  const aH = tier === 2 ? Ha * 0.85 : Ha, nH = tier === 2 ? Hn * 0.6 : Hn;
  const aisle = (x0, x1, seed) => {
    if (tier === 2) { walls(R, x0, x1, yT1, yF, 0, aH, 3, ragged(st(seed), aH, seed), X.top(2)); return; }
    box(R, x0, x1, yT1, yF, 0, Ha, corniced(X, pierce(st(seed), lancet('E', yT1 + 2, yF - 2, Ha * 0.3, Ha * 0.82, 0.09 * u, 3)), 0, Ha), X.top(2));
    const lo = x0 < 0 ? x0 : x1, hi = x0 < 0 ? x1 : x0;
    facet(R, [[lo, yT1, Ha], [lo, yF, Ha], [hi, yF, Ha + 7], [hi, yT1, Ha + 7]], [(x0 + x1) / 2, (yT1 + yF) / 2, Ha - 2], X.roofL);
    facet(R, [[lo, yF, Ha], [hi, yF, Ha], [hi, yF, Ha + 7]], [(x0 + x1) / 2, (yT1 + yF) / 2, Ha - 2], X.marbleL);
  };
  aisle(-xa, -Rn, 109);
  if (tier === 2) {
    walls(R, -Rn, Rn, yT1, yF, 0, nH, 3, ragged(st(111), nH, 3), X.top(2));
  } else {
    box(R, -Rn, Rn, yT1, yF, 0, Hn, corniced(X, pierce(st(111), lancet('E', yT1 + 2, yF - 2, Ha + 10, Hn - 6, 0.09 * u, 3)), 0, Hn), X.top(2));
    gable(R, -Rn - 1, Rn + 1, yT1, yF, Hn, 0.14 * u, X.roofL, X.marbleL);
  }
  aisle(Rn, xa, 113);
  // Contreforts du flanc est ; arcs-boutants (IV+).
  for (let y = yT1 + 0.06 * u; y < yF - 2; y += 0.09 * u) {
    const bh = tier === 2 ? aH : Ha + 8;
    box(R, xa, xa + 4, y - 2, y + 2, 0, bh, X.plain(0), X.top(1));
    if (tier >= 4) {
      const A = [xa + 2, y, Ha + 8], Bq = [Rn, y, Hn - 6], M = [(xa + Rn) / 2 + 2, y, Hn + 1];
      let prev = A;
      for (let k = 1; k <= 8; k += 1) {
        const t = k / 8, q = [(1 - t) * (1 - t) * A[0] + 2 * t * (1 - t) * M[0] + t * t * Bq[0], y, (1 - t) * (1 - t) * A[2] + 2 * t * (1 - t) * M[2] + t * t * Bq[2]];
        line(R, prev, q, X.P.stone[3], 2);
        prev = q;
      }
      pyramid(R, xa, xa + 4, y - 2, y + 2, Ha + 8, 7, X.smooth);
    }
  }
  if (tier === 2) scaffold(R, X, 'E', xa + 6, yT1 + 2, yF - 2, 0, aH + 6, 9);
  // Tours et façade.
  const towerH = (side) => (tier === 2 ? 10 : tier === 3 ? (side < 0 ? 0.45 * u : 0.2 * u) : tFull);
  const tower = (side) => {
    const x0 = side < 0 ? -tw1 : tw0, x1 = side < 0 ? -tw0 : tw1, h = towerH(side);
    const done = h >= tFull - 0.01;
    const holes = [];
    if (h > 0.3 * u) holes.push(...lancet('S', x0 + 2, x1 - 2, h - 0.2 * u, h - 6, 7, 3), ...lancet('E', yF + 2, yTw - 2, h - 0.2 * u, h - 6, 7, 3));
    if (h > 0.5 * u) holes.push(...lancet('S', x0 + 2, x1 - 2, 0.3 * u, 0.42 * u, 7, 3), ...lancet('E', yF + 2, yTw - 2, 0.3 * u, 0.42 * u, 7, 3));
    const tex = done ? corniced(X, pierce(st(115 + side), holes), 0, h) : ragged(pierce(st(115 + side), holes), h, 7 + side);
    if (tier === 2) walls(R, x0, x1, yF, yTw, 0, h, 3, ragged(st(115 + side), h, 9 + side), X.top(2));
    else box(R, x0, x1, yF, yTw, 0, h, tex, done ? X.top(2) : (x, y) => (fm(x + y, 7) < 1 ? X.dark : X.top(2)()));
    if (done) {
      if (tier >= 5) {
        const sp = (I, x, y, hh) => (fm(hh, 7) < 1 ? pick(X.P.roof, I - 0.15) : X.roofL(I));
        pyramid(R, x0 + 2, x1 - 2, yF + 2, yTw - 2, h, spH, sp);
        const fx = (x0 + x1) / 2, fy = (yF + yTw) / 2, fh = h + spH;
        line(R, [fx, fy, fh - 1], [fx, fy, fh + 7], X.P.metal[1]);
        line(R, [fx - 1.5, fy + 1.5, fh + 4], [fx + 1.5, fy - 1.5, fh + 4], X.P.metal[1]);
      } else crenels(R, X, x0, x1, yF, yTw, h, 3, 4);
      for (const [px, py] of [[x0 + 2, yF + 2], [x1 - 2, yF + 2], [x0 + 2, yTw - 2], [x1 - 2, yTw - 2]]) {
        pyramid(R, px - 2, px + 2, py - 2, py + 2, h, tier >= 5 ? 16 : 10, X.smooth);
      }
    }
    return { x0, x1, h };
  };
  const tW = tower(-1);
  // Façade entre les tours : portail, rosace (IV+), pignon.
  const fH = tier === 2 ? 10 : Hn, rose = tier >= 4;
  const roseC = Hn * 0.62, roseR = 0.065 * u;
  const facade = (f, uu, hv, lit) => {
    if (f === 'S' && rose) {
      const dd = Math.hypot(uu + 0.5, hv - roseC);
      if (dd < roseR) {
        if (dd > roseR - 1.5) return ramp(X.P, shadeOf(K, lit) - 1);
        const ang = Math.atan2(hv - roseC, uu + 0.5);
        return fm(ang * 8 / Math.PI, 1) < 0.22 || Math.abs(dd - roseR * 0.45) < 0.8 ? ramp(X.P, shadeOf(K, lit)) : X.win(0, 0, (Math.floor(ang * 8 / Math.PI) & 1) === 0);
      }
    }
    return st(117)(f, uu, hv, lit);
  };
  const portal = [{ f: 'S', u0: -0.045 * u, u1: 0.045 * u, h0: 0, h1: 0.17 * u, arch: 'pointed', col: (uu, hv, lit) => (hv > 0.1 * u ? X.marble(lit ? 1 : 2) : X.metal(2)) }];
  if (tier === 2) walls(R, -tw0, tw0, yF, yFront, 0, fH, 3, ragged(st(117), fH, 11), X.top(2));
  else {
    box(R, -tw0, tw0, yF, yFront, 0, Hn, corniced(X, pierce(facade, portal), 0, Hn), X.top(2));
    gable(R, -tw0, tw0, yF, yFront, Hn, 0.14 * u, X.roofL, (I) => X.smooth(I));
  }
  const tE = tower(1);
  // Échafaudages et grue : là où l'on bâtit encore.
  if (tier === 3) {
    scaffold(R, X, 'S', yTw + 2, tW.x0, tW.x1, tW.h - 0.15 * u, tW.h + 6, 8);
    scaffold(R, X, 'E', tE.x1 + 2, yF, yTw, 0, tE.h + 6, 8);
    crane(R, X, K.crane, 0.38 * u, 0.36 * u, 0, 0.62 * u, -0.2 * u, 0.36 * u);
  } else if (tier === 2) {
    crane(R, X, K.crane, 0.36 * u, 0.06 * u, 0, 0.66 * u, 0, 0.06 * u);
  } else if (tier >= 5) {
    crane(R, X, K.crane === 'roue' ? 'roue' : 'tour', 0.42 * u, 0.3 * u, 0, tFull + 0.3 * u, 0.2 * u, 0.36 * u);
  }
  return finish(R, X, props, B, Hmax);
}

// ══ L'AIGUILLE CÉLESTE (temps de veille, dans le fleuve) ═════════════════════
//   I   phare de bois sur un rocher, feu dans une corbeille
//   II  tour de pierre à lanterne
//   III grand phare à trois étages, statue au sommet
//   IV  aiguille à galeries étagées
//   V   flèche céleste, anneaux suspendus, faisceau vers le ciel la nuit
// `opts.lift` : l'Aiguille posée sur son ÎLOT construit (wonderIsle.js) — un socle de
// pierre remplace le rocher, et tout le raster monte à l'altitude de l'esplanade.
export function bakeNeedle(K, tier, B, Hmax, opts = {}) {
  const X = mats(K), Bf = Math.max(B, 56), R = rasterFor(Bf, Hmax), props = [];
  const rr = Bf * 0.5, rockH = 12, lift = opts.lift || 0;
  if (lift && tier >= 2) {
    revolve(R, 0, 0, 0, 5, cyl(rr * 0.62), X.stoneL);
    revolve(R, 0, 0, 5, rockH, cyl(rr * 0.48), (I, h, a, rho, cap) => (cap ? X.lite : h >= rockH - 1 ? X.lite : X.stoneL(I, h, a, rho)));
  } else {
    const r0 = lift ? rr * 0.7 : rr;
    revolve(R, 0, 0, 0, rockH, (h) => r0 * (1 - 0.5 * Math.pow(h / rockH, 1.5)), (I, h, a) => (h < 2 && !lift ? rgbOf(X.P.wet[0]) : X.roughL(I, h, a)));
  }
  const done = () => {
    const out = finish(R, X, props, Bf, Hmax);
    if (!lift) return out;
    out.R.oy -= lift;
    if (out.N) out.N.oy -= lift;
    for (const pr of out.props) if (pr.rx == null) pr.h += lift;
    return out;
  };
  const gallery = (rad, h, part) => {
    if (part !== 'front') revolve(R, 0, 0, h, h + 2.5, cyl(rad), X.stoneL);
    ring3d(R, [0, 0, h + 5], rad - 0.5, 1, PLANE_H[0], PLANE_H[1], (I) => pick(X.P.metal, I - 0.3), part);
  };
  const lantern = (r, h, H) => {
    revolve(R, 0, 0, h, h + H, cyl(r), (I, hh, a) => (fm(a * 6 / Math.PI, 1) < 0.2 ? pick(X.P.metal, I - 0.2) : X.light(X.glass(hh > h + H * 0.5 ? 1 : 0))));
    revolve(R, 0, 0, h + H, h + H + r * 0.8, domeProf(h + H, r + 0.8, r * 0.8), X.metalL);
    revolve(R, 0, 0, h + H + r * 0.8 - 1, h + H + r * 0.8 + 6, taper(h + H + r * 0.8 - 1, h + H + r * 0.8 + 6, 1.3, 0), X.metalL);
    props.push({ prop: 'glow', x: 0, y: 0, h: h + H * 0.5, big: true });
  };
  if (tier === 1) {
    const top = 72, W = X.P.wood;
    const legs = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (const [sx, sy] of legs) line(R, [sx * 10, sy * 10, rockH], [sx * 4, sy * 4, top], W[sx + sy > 0 ? 2 : 1], 2);
    for (const hb of [32, 52]) {
      const k = 10 - ((hb - rockH) / (top - rockH)) * 6;
      line(R, [-k, k, hb], [k, k, hb], W[1]);
      line(R, [k, -k, hb], [k, k, hb], W[2]);
    }
    line(R, [-10, 10, rockH], [6, 6, 52], W[3]); line(R, [10, -10, rockH], [6, 6, 52], W[3]);
    box(R, -7, 7, -7, 7, top, top + 3, X.woodF, () => X.wood(0));
    for (const [sx, sy] of legs) line(R, [sx * 4, sy * 4, top + 3], [sx * 4, sy * 4, top + 10], X.P.metal[2]);
    ring3d(R, [0, 0, top + 10], 5.6, 1, PLANE_H[0], PLANE_H[1], (I) => pick(X.P.metal, I - 0.3));
    props.push({ prop: 'flame', x: 0, y: 0, h: top + 4, big: true });
    return done();
  }
  if (tier === 2) {
    const Ht = 128;
    revolve(R, 0, 0, rockH, Ht, taper(rockH, Ht, 10, 7.5), (I, h, a) => (Math.abs(a - Math.PI / 4) < 0.14 && fm(h, 26) > 10 && fm(h, 26) < 17 ? X.dark : X.stoneL(I, h)));
    gallery(11, Ht, 'back');
    lantern(6, Ht + 2.5, 11);
    gallery(11, Ht, 'front');
    return done();
  }
  if (tier === 3) {
    const b = Bf * 0.4, h1 = 86;
    box(R, -b, b, -b, b, rockH, h1, corniced(X, pierce(X.stone(121), [
      ...windowRow('S', -b, b, 8, 2.5, 30, 37, X.win), ...windowRow('E', -b, b, 8, 2.5, 30, 37, X.win),
      ...windowRow('S', -b, b, 8, 2.5, 56, 63, X.win), ...windowRow('E', -b, b, 8, 2.5, 56, 63, X.win),
      { f: 'S', u0: -3.5, u1: 3.5, h0: rockH, h1: rockH + 11, arch: 'round', col: X.dark }]), rockH, h1), X.top(2));
    crenels(R, X, -b, b, -b, b, h1, 2.5, 3);
    const h2 = 146;
    revolve(R, 0, 0, h1, h2, cyl(b * 0.6), (I, h, a) => (fm(a * 4 / Math.PI, 1) > 0.42 && fm(a * 4 / Math.PI, 1) < 0.58 && fm(h, 20) > 8 && fm(h, 20) < 15 ? X.dark : X.stoneL(I, h)), 8);
    gallery(b * 0.6 + 3, h2, 'back');
    const h3 = 178;
    revolve(R, 0, 0, h2 + 2.5, h3, cyl(b * 0.4), X.stoneL);
    gallery(b * 0.4 + 2.5, h3, 'back');
    lantern(5.5, h3 + 2.5, 9);
    gallery(b * 0.4 + 2.5, h3, 'front');
    gallery(b * 0.6 + 3, h2, 'front');
    props.push({ prop: 'statue', x: 0, y: 0, h: h3 + 2.5 + 9 + 5.5 * 0.8 + 6, big: true, tint: statueTint(K) || 'gold' });
    for (const [x, y] of [[-b + 1.5, b - 1.5], [b - 1.5, b - 1.5], [b - 1.5, -b + 1.5]]) props.push({ prop: 'statue', x, y, h: h1 + 3, small: true });
    return done();
  }
  // IV-V : aiguille.
  const big = tier >= 5;
  const r0 = Bf * (big ? 0.15 : 0.17), r1 = Bf * (big ? 0.045 : 0.07), a = 32, top = big ? 300 : 270;
  revolve(R, 0, 0, rockH, a, taper(rockH, a, r0 * 1.8, r0 * 1.4), X.stoneL, 8);
  const prof = taper(a, top, r0, r1);
  const ringsAt = big ? [118, 186, 246] : [];
  const gals = big ? [] : [100, 170, 230];
  const ringCol = (I) => (I > 0.4 ? X.light(X.P.glow) : pick(X.P.metal, I));
  for (const hR of ringsAt) ring3d(R, [0, 0, hR], prof(hR) + 9, 2, PLANE_H[0], PLANE_H[1], ringCol, 'back');
  for (const g of gals) gallery(prof(g) + 4, g, 'back');
  // Rang V : verre et nervures aux âges qui savent le couler (néon+), sinon la
  // pierre de l'ère cerclée de métal.
  const glassy = big && K.band >= 6;
  const shaftCol = glassy
    ? (I, h, ang) => (fm(ang * 8 / Math.PI, 1) < 0.16 ? pick(X.P.metal, I) : fm(h, 9) < 1 ? pick(X.P.metal, I - 0.1) : X.glassL(I))
    : big ? (I, h) => (fm(h, 24) < 2 ? pick(X.P.metal, I) : X.marbleL(I)) : (I, h) => X.stoneL(I, h);
  revolve(R, 0, 0, a, top, prof, shaftCol, glassy ? 0 : 12);
  for (const g of gals) gallery(prof(g) + 4, g, 'front');
  for (const hR of ringsAt) ring3d(R, [0, 0, hR], prof(hR) + 9, 2, PLANE_H[0], PLANE_H[1], ringCol, 'front');
  const lr = Math.max(4.5, r1 + 1);
  lantern(lr, top, 10);
  const sp0 = top + 10 + lr * 0.8 + 4, sp1 = Math.min(Hmax + 4, sp0 + (big ? 30 : 26));
  revolve(R, 0, 0, sp0 - 4, sp1, taper(sp0 - 4, sp1, 2, 0), X.metalL);
  if (big) props.push({ prop: 'beam', x: 0, y: 0, h: sp1 });
  return done();
}

// ══ L'ŒIL DE LA SINGULARITÉ (mythes accomplis) ═══════════════════════════════
//   I   disque poli dressé au milieu d'un cercle de pierres
//   II  observatoire : tambour, coupole fendue, lunette
//   III sphère-œil dans ses anneaux-gyroscope, sur un piédestal
//   IV  temple-observatoire : tholos à colonnes, anneaux concentriques
//   V   porte-anneau colossale, l'œil au centre, anneaux en orbite
// L'ŒIL : une sphère d'obsidienne dont l'iris, toujours tourné vers nous, luit.
function irisCol(X, hc, r) {
  return (I, h, ang, rho) => {
    const x = rho * Math.cos(ang), y = rho * Math.sin(ang), e = (x + y + (h - hc)) / (r * Math.sqrt(3));
    if (e > 0.93) return X.light(X.P.glow);
    if (e > 0.84) return X.light(X.glass(2));
    if (e > 0.79) return X.metal(0);
    return ramp(X.P, Math.min(8, 6 + (band5(I) >= 3 ? 1 : 0) - (band5(I) === 0 ? 1 : 0)));
  };
}
const rotZ = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a), v[2]];
// LE CŒUR ANIMÉ de l'Œil (rangs III-V) : la sphère et ses anneaux, cuits à part,
// une image par pas de rotation (f / F d'un tour) — les anneaux tournent autour de
// l'œil, chacun à son rythme et dans son sens. Même repère que la merveille.
export function bakeEyeCore(K, core, f, F) {
  const X = mats(K);
  let rm = core.r;
  for (const g of core.rings) rm = Math.max(rm, g[0] + g[3]);
  rm += 3;
  const R = frameOf(V, [[-rm, rm, -rm, rm, core.hc - rm, core.hc + rm]]);
  const th = (2 * Math.PI * f) / F, c = [0, 0, core.hc];
  const rings = core.rings.map((g, k) => {
    const a = th * (k % 2 ? -1 : 1) * (1 + (k >> 1));
    return [g[0], rotZ(g[1], a), rotZ(g[2], a), g[3]];
  });
  const metalRing = (I) => pick(X.P.metal, I);
  for (const [rad, U, W, t] of rings) ring3d(R, c, rad, t, U, W, metalRing, 'back');
  revolve(R, 0, 0, core.hc - core.r, core.hc + core.r, ballProf(core.hc, core.r), irisCol(X, core.hc, core.r));
  for (const [rad, U, W, t] of rings) ring3d(R, c, rad, t, U, W, metalRing, 'front');
  outline(R, X.ink);
  return { R, N: nightOf(R, X) };
}
export function bakeEye(K, tier, B, Hmax) {
  const X = mats(K), R = rasterFor(B, Hmax), props = [];
  const half = B / 2;
  const metalRing = (I) => pick(X.P.metal, I);
  if (tier <= 2) {
    const n = tier === 1 ? 8 : 10, a0 = Math.PI / 2 + Math.PI / n, mh = tier === 1 ? 10 : 12;
    menhirs(R, X, half * 0.88, n, 3, mh, 'back', a0);
    if (tier === 1) {
      box(R, -6, 6, -3, 3, 0, 9, X.rough(131), X.top(2));
      const r = 11, hc = 9 + r * S2;
      vdisc(R, 0.7, -0.7, hc, r, () => X.metal(2));
      vdisc(R, 0, 0, hc, r, (s, v, q) => {
        if (q > 0.88) return s < 0 && v > 0 ? X.metal(0) : X.metal(1);
        if (Math.abs(s + v - 0.3) < 0.1) return rgbOf('#ffffff');
        return X.glass(v > 0.4 ? 0 : v > -0.15 ? 1 : 2);
      });
      props.push({ prop: 'glow', x: 0, y: 0, h: hc });
    } else {
      const r = B * 0.3, H = 24;
      revolve(R, 0, 0, 0, H, cyl(r), (I, h, a) => (Math.abs(a - Math.PI / 2) < 4 / r && h < 12 ? X.dark
        : Math.cos(a) + Math.sin(a) > 0 && fm(a * r, 10) < 2.5 && h > 14 && h < 19 ? X.win(0, 0, I > 0.3) : X.stoneL(I, h)));
      const slit = -Math.PI / 4;
      revolve(R, 0, 0, H, H + r * 0.92, domeProf(H, r + 0.6, r * 0.92), (I, h, a) => (Math.abs(a - slit) < 0.16 ? X.dark : pick(X.P.marble, I)));
      line(R, [2, -2, H + r * 0.55], [r * 0.95, -r * 0.95, H + r * 1.35], X.P.metal[2], 3);
      line(R, [2, -2, H + r * 0.55], [r * 0.95, -r * 0.95, H + r * 1.35], X.P.metal[1], 1);
      props.push({ prop: 'glow', x: r * 0.95, y: -r * 0.95, h: H + r * 1.35 });
    }
    menhirs(R, X, half * 0.88, n, 3, mh, 'front', a0);
    return finish(R, X, props, B, Hmax);
  }
  if (tier === 3) {
    revolve(R, 0, 0, 0, 5, cyl(B * 0.42), X.stoneL);
    revolve(R, 0, 0, 5, 12, cyl(B * 0.2), X.stoneL);
    revolve(R, 0, 0, 12, 38, (h) => 4.5 - (h - 12) * 0.05, X.marbleL, 8);
    const r = B * 0.16, hc = 40 + r + 4;
    const rings = [
      [r + 7, [1, 0, 0], [0, Math.cos(0.45), Math.sin(0.45)]],
      [r + 11, PLANE_FACE[0], [0.35, 0.35, 0.87]],
      [r + 15, [Math.cos(0.6), Math.sin(0.6), 0], [0, 0, 1]],
    ];
    props.push({ prop: 'glow', x: 0, y: 0, h: hc, big: true });
    return { ...finish(R, X, props, B, Hmax, { noHalo: true, noBeacon: true }), core: { hc, r, rings: rings.map((g) => [...g, 2.2]) } };
  }
  if (tier === 4) {
    revolve(R, 0, 0, 0, 4, cyl(half * 0.94), X.stoneL);
    revolve(R, 0, 0, 4, 8, cyl(half * 0.84), X.stoneL);
    const cr = half * 0.7, colH = 40, h0 = 8, n = 12, cols = [];
    for (let k = 0; k < n; k += 1) { const a = ((k + 0.5) / n) * 2 * Math.PI; cols.push({ a, d: Math.cos(a) + Math.sin(a) }); }
    cols.sort((p, q) => p.d - q.d);
    for (const c of cols) if (c.d <= 0) column(R, X, cr * Math.cos(c.a), cr * Math.sin(c.a), 2.4, h0, h0 + colH);
    arcBand(R, 0, 0, cr - 4, cr + 4, (3 * Math.PI) / 4, (7 * Math.PI) / 4, h0 + colH, h0 + colH + 6, X.marbleL);
    const r = 14, hc = h0 + colH + 6 + r + 12;
    const rings = [[r + 8, [1, 0, 0], [0, Math.cos(0.2), Math.sin(0.2)]], [r + 14, [Math.cos(-0.15), 0, Math.sin(-0.15)], [0, 1, 0]]];
    for (const c of cols) if (c.d > 0) column(R, X, cr * Math.cos(c.a), cr * Math.sin(c.a), 2.4, h0, h0 + colH);
    arcBand(R, 0, 0, cr - 4, cr + 4, -Math.PI / 4, (3 * Math.PI) / 4, h0 + colH, h0 + colH + 6, X.marbleL);
    props.push({ prop: 'glow', x: 0, y: 0, h: hc, big: true });
    return { ...finish(R, X, props, B, Hmax, { noHalo: true, noBeacon: true }), core: { hc, r, rings: rings.map((g) => [...g, 2.2]) } };
  }
  // V : porte-anneau.
  revolve(R, 0, 0, 0, 6, cyl(half * 0.94), X.stoneL);
  revolve(R, 0, 0, 6, 12, cyl(half * 0.76), X.stoneL);
  const Rr = half * 0.76, hc = 22 + Rr * S2 - 2, th = 11;
  frustum(R, -12, 12, -12, 12, 12, 22, 4, X.stoneF(141), X.top(1));
  ring3d(R, [0, 0, hc], Rr, th, PLANE_ROUND[0], PLANE_ROUND[1], metalRing);
  ring3d(R, [0, 0, hc], Rr - th / 2 / S2 - 0.6, 1.4, PLANE_ROUND[0], PLANE_ROUND[1], () => X.light(X.P.glow));
  const r = 16;
  const orbits = [[r + 9, [1, 0, 0], [0, Math.cos(0.5), Math.sin(0.5)]], [r + 15, [0, 1, 0], [Math.cos(-0.5), 0, Math.sin(-0.5)]]];
  props.push({ prop: 'glow', x: 0, y: 0, h: hc, big: true });
  return { ...finish(R, X, props, B, Hmax, { noHalo: true, noBeacon: true }), core: { hc, r, rings: orbits.map((g) => [...g, 2]) } };
}
