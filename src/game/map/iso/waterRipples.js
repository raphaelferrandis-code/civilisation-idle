"use strict";
// ── LES REMOUS AU PIED DES PONTONS ───────────────────────────────────────────
//
// Raph (2026-10-04), sur captures du ponton de l'îlot et d'un ponton de quai :
// « fais les remous sur le ponton et sur tous les pontons ». Là où un ouvrage touche
// l'eau — pieux d'un appontement, bord d'un ponton flottant — l'eau s'y froisse :
//   · un LISERÉ clair colle au bord et clapote (il se déchire et se recoud) ;
//   · des RIDES partent du contact et s'élargissent en s'effaçant (deux par houle) ;
//   · derrière chaque pieu, un SILLAGE file dans le sens du courant.
// Au pixel d'art (même grille que les rasters des ouvrages : 1 px = 1 px monde au
// zoom 1), en tons d'écume pâle — jamais au milieu du courant, toujours au contact.
//
// Deux temps, comme l'écume des rochers de l'îlot (wonderIsle.bakeFoam) :
//   rippleField(contact) — UNE fois : les pixels candidats autour du contact, avec
//     leur distance au bord, leur abscisse le long du courant, leur dentelle ;
//   paintRipples(field, t, out) — à chaque pas : allume ceux de l'instant t.
// Le dessin à l'écran (un canvas par champ, repeint au plus tous les RIPPLE_STEP ms)
// est dans drawRipples, la seule partie qui touche au DOM.
//
// contact = {
//   posts: [[x, y, r]]       pieux (monde, px) et leur rayon ;
//   decks: [[[x, y], …]]     bords d'un ponton FLOTTANT (polygone convexe au ras de
//                            l'eau) — le liseré en fait le tour ;
//   flow: [fx, fy]           sens du courant (unitaire, monde) — pour les sillages ;
//   seed                     pour décaler les houles d'un ouvrage à l'autre ;
//   keep(x, y) → bool        facultatif : ce point (monde, au ras de l'eau) est-il de
//                            l'EAU ? (exclut la berge, le quai) ;
// }
// Pur jusqu'à drawRipples.
import { h32 } from './isoPixelPaint.js';

export const RIPPLE_STEP = 80;          // ms entre deux repeints (~12 images/s)
const PERIOD = 2600;                    // ms, une houle de rides
const REACH = 8;                        // px monde : portée des rides
const WAKE = 13;                        // px monde : longueur d'un sillage
const pack = (r, g, b, a) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
const C_LINE = pack(240, 248, 247, 255);   // liseré au contact
const C_SOFT = pack(214, 236, 240, 225);   // son second rang, déchiré
const C_RING = pack(204, 230, 238, 215);   // rides et sillage, un peu transparents
const fm = (a, n) => ((a % n) + n) % n;

// Distance d'un point au bord d'un polygone convexe (négative dedans) — dedans quand
// il est du même côté de toutes les arêtes, quel que soit le sens du polygone.
export function polyGap(px, py, pts) {
  let best = Infinity, pos = 0, neg = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
    best = Math.min(best, Math.hypot(px - ax - t * dx, py - ay - t * dy));
    const s = (px - ax) * dy - (py - ay) * dx;
    if (s > 0) pos += 1; else if (s < 0) neg += 1;
  }
  return pos && neg ? best : -best;
}

// LES PIEUX RANGÉS EN GRILLE (audit du 05/10, PERF-13) : au pied des Plaisirs, 49 à
// 101 pieux, tous testés pour chaque pixel de la boîte — 30 à 70 ms par cuisson. Un
// pixel ne regarde plus que les 9 cases autour de lui. MÊME RÉSULTAT AU BIT PRÈS : un
// pixel n'est gardé que si son pieu le plus proche est à portée des rides
// (g ≤ REACH + 0,6) ou de son sillage (le cône borne la distance au pieu à
// √(WAKE² + (0,7 + 0,16·WAKE)²) / |flow|) ; la case fait ce rayon, plus l'écart des
// rayons de pieux (un pieu plus fin mais plus loin peut être « le plus proche ») et un
// pixel de marge. Hors de ce rayon, la boucle complète jetait le pixel elle aussi.
// null : la boucle complète (peu de pieux, ou un cas que la borne ne couvre pas).
function postGrid(posts, fl) {
  if (posts.length < 8) return null;
  let rMin = Infinity, rMax = -Infinity, bx = Infinity, by = Infinity, ex = -Infinity, ey = -Infinity;
  for (const [x, y, r] of posts) {
    rMin = Math.min(rMin, r); rMax = Math.max(rMax, r);
    bx = Math.min(bx, x); by = Math.min(by, y); ex = Math.max(ex, x); ey = Math.max(ey, y);
  }
  if (!(rMin >= 0) || !Number.isFinite(rMax + bx + by + ex + ey)) return null;
  let C = REACH + 0.6 + rMax;
  if (fl) {
    const fn = Math.hypot(fl[0], fl[1]);
    if (!(fn > 0.1)) return null;
    C = Math.max(C, Math.hypot(WAKE, 0.7 + 0.16 * WAKE) / fn + rMax - rMin);
  }
  C += 1;
  const gw = Math.floor((ex - bx) / C) + 1, gh = Math.floor((ey - by) / C) + 1;
  const cells = Array.from({ length: gw * gh }, () => []);
  for (let k = 0; k < posts.length; k += 1) {
    cells[Math.floor((posts[k][1] - by) / C) * gw + Math.floor((posts[k][0] - bx) / C)].push(k);
  }
  return { cells, gw, gh, bx, by, C };
}

export function rippleField(contact) {
  const posts = contact.posts || [], decks = contact.decks || [];
  if (!posts.length && !decks.length) return null;
  const fl = contact.flow || null, seed = contact.seed | 0, keep = contact.keep || null;
  // Boîte monde du contact, élargie de la portée des rides et des sillages.
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (x, y, m) => { x0 = Math.min(x0, x - m); x1 = Math.max(x1, x + m); y0 = Math.min(y0, y - m); y1 = Math.max(y1, y + m); };
  for (const [x, y, r] of posts) grow(x, y, r + Math.max(REACH, fl ? WAKE : 0) + 1);
  for (const d of decks) for (const [x, y] of d) grow(x, y, REACH + 1);
  // Boîte ÉCRAN (zoom 1) : X = x − y, Y = (x + y)/2.
  const X0 = Math.floor(x0 - y1), X1 = Math.ceil(x1 - y0), Y0 = Math.floor((x0 + y0) / 2), Y1 = Math.ceil((x1 + y1) / 2);
  const w = X1 - X0 + 1, h = Y1 - Y0 + 1;
  const at = [], gap = [], along = [], cross = [], n1 = [], n2 = [], kind = [];
  const lace = (u, salt) => {
    const i = Math.floor(u), f = u - i, s = f * f * (3 - 2 * f);
    return ((h32(i, seed, salt) % 1000) * (1 - s) + (h32(i + 1, seed, salt) % 1000) * s) / 1000;
  };
  const grid = postGrid(posts, fl);
  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) {
      const X = X0 + i + 0.5, Y = Y0 + j + 0.5, x = Y + X / 2, y = Y - X / 2;
      let g = Infinity, gx = 0, gy = 0, gr = 0, gk = -1;
      if (grid) {
        // Les seuls pieux à portée, départagés par leur rang comme la boucle complète.
        const { cells, gw, gh, bx, by, C } = grid;
        const ci = Math.floor((x - bx) / C), cj = Math.floor((y - by) / C);
        for (let b = Math.max(0, cj - 1); b <= Math.min(gh - 1, cj + 1); b += 1) {
          for (let a = Math.max(0, ci - 1); a <= Math.min(gw - 1, ci + 1); a += 1) {
            for (const k of cells[b * gw + a]) {
              const [px, py, r] = posts[k];
              const d = Math.hypot(x - px, y - py) - r;
              if (d < g || (d === g && k < gk)) { g = d; gx = px; gy = py; gr = r; gk = k; }
            }
          }
        }
      } else {
        for (let k = 0; k < posts.length; k += 1) {
          const [px, py, r] = posts[k];
          const d = Math.hypot(x - px, y - py) - r;
          if (d < g) { g = d; gx = px; gy = py; gr = r; gk = k; }
        }
      }
      let onDeck = false;
      for (const d of decks) {
        const dg = polyGap(x, y, d);
        if (dg < g) { g = dg; onDeck = true; }
      }
      if (g < -0.2) continue;                              // sous l'ouvrage
      // Sillage d'un pieu : en aval, dans un cône étroit qui s'ouvre.
      let al = -1, cr = 0;
      if (fl && !onDeck && gk >= 0) {
        const dx = x - gx, dy = y - gy;
        al = dx * fl[0] + dy * fl[1]; cr = -dx * fl[1] + dy * fl[0];
        if (!(al > gr && al < WAKE && Math.abs(cr) < 0.7 + al * 0.16)) al = -1;
      }
      if (g > REACH + 0.6 && al < 0) continue;
      if (keep && !keep(x, y)) continue;
      // Dentelle tirée le long du bord (l'angle autour du pieu, ou l'abscisse sur le
      // ponton) : des tirets qui se tiennent, pas du sel.
      const u = onDeck ? (x + y) * 0.45 : Math.atan2(y - gy, x - gx) * 3.2 + gx * 0.7;
      at.push(j * w + i); gap.push(g); along.push(al); cross.push(cr);
      n1.push(lace(u, 11)); n2.push(lace(u * 1.7 + 5, 23)); kind.push(onDeck ? 1 : 0);
    }
  }
  if (!at.length) return null;
  return {
    ox: X0, oy: Y0, w, h, seed,
    at: Int32Array.from(at), gap: Float32Array.from(gap), along: Float32Array.from(along), cross: Float32Array.from(cross),
    n1: Float32Array.from(n1), n2: Float32Array.from(n2), kind: Uint8Array.from(kind),
    ph: (h32(seed, 7) % 1000) / 1000,
  };
}

// Allume les remous de l'instant t (ms) dans out (Uint32Array w × h, octets RGBA).
// Pur : un même t redonne la même image.
export function paintRipples(F, t, out) {
  out.fill(0);
  const p = t / PERIOD + F.ph;
  // Le liseré respire avec la houle : plus fourni quand l'eau monte contre l'ouvrage.
  const swell = 0.5 + 0.5 * Math.sin(2 * Math.PI * p);
  const lineD = 0.42 + 0.3 * swell;
  // Deux rides par houle, qui partent du contact et s'élargissent en s'effaçant.
  const rings = [fm(p, 1), fm(p + 0.5, 1)];
  const wakeV = t * 0.0045;                                  // px monde / ms
  for (let k = 0; k < F.at.length; k += 1) {
    const g = F.gap[k];
    let c = 0;
    if (g < 0.9 && F.n1[k] < lineD) c = C_LINE;
    else if (g < 1.9 && F.n1[k] < lineD * 0.75) c = C_SOFT;
    else {
      for (const q of rings) {
        const rho = 0.8 + q * REACH;
        if (Math.abs(g - rho) < 0.65 && F.n2[k] < 0.9 * (1 - q)) { c = C_RING; break; }
      }
      const al = F.along[k];
      if (!c && al >= 0) {
        // Des traits qui filent vers l'aval et pâlissent en s'éloignant.
        const s = fm(al - wakeV, 4.2);
        if (s < 1.3 && F.n2[k] < 0.95 - al / WAKE) c = C_RING;
      }
    }
    if (c) out[F.at[k]] = c;
  }
  return out;
}

// ── LE REGISTRE ──────────────────────────────────────────────────────────────
// Chaque ouvrage NOTE ses remous en se peignant (noteRipples) ; la passe des remous
// (waterRipplesPass, juste après l'eau, AVANT les quais, les pontons et les bateaux)
// peint à l'image suivante ce qui a été noté — tout ce qui se peint ensuite recouvre
// les remous là où il le doit (le mur du quai, le tablier, une coque). Un ouvrage ne
// bouge pas : l'image de retard ne se voit pas.
//   make() → [{ F: rippleField(…), h (altitude de l'eau, px monde), clip: 'river' | null,
//              wx, wy (facultatifs : le point monde, px, où est l'origine du champ) }]
//   'river' : découpé au ruban du fleuve (rien sur la grève ni la berge) ; null : sans
//   découpe (le bassin du Vieux-Port, que le ruban ne couvre pas).
const _made = new Map();
let _noted = new Map();
export function noteRipples(key, make) {
  let v = _made.get(key);
  if (v === undefined) {
    v = (make() || []).filter((e) => e && e.F);
    _made.set(key, v);
    if (_made.size > 96) _made.delete(_made.keys().next().value);
  }
  if (v.length) _noted.set(key, v);
}
// Ce qui a été noté depuis le dernier appel (et on repart à vide).
export function takeNotedRipples() {
  const n = _noted;
  _noted = new Map();
  return n;
}

// ── À L'ÉCRAN ────────────────────────────────────────────────────────────────
// Un canvas par champ (WeakMap), repeint au plus une fois par RIPPLE_STEP. (sx, sy)
// = point ÉCRAN du monde (0, 0) au ras de l'eau ; z = zoom. Rien sous le zoom où la
// petite vie s'efface (minZ).
const _cv = new WeakMap();
export function drawRipples(ctx, F, sx, sy, z, now, minZ = 0.7, view = null) {
  if (!F || z < minZ || typeof document === 'undefined') return;
  // Hors de l'écran : ni repeint ni posé.
  if (view && (sx + (F.ox + F.w) * z < 0 || sx + F.ox * z > view.w || sy + (F.oy + F.h) * z < 0 || sy + F.oy * z > view.h)) return;
  let e = _cv.get(F);
  if (!e) {
    const cv = document.createElement('canvas');
    cv.width = F.w; cv.height = F.h;
    const g = cv.getContext('2d'), img = g.createImageData(F.w, F.h);
    e = { cv, g, img, u32: new Uint32Array(img.data.buffer), tick: -1 };
    _cv.set(F, e);
  }
  const tk = Math.floor((now || 0) / RIPPLE_STEP);
  if (tk !== e.tick) { e.tick = tk; paintRipples(F, tk * RIPPLE_STEP, e.u32); e.g.putImageData(e.img, 0, 0); }
  const dx = Math.round(sx + F.ox * z), dy = Math.round(sy + F.oy * z);
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(e.cv, dx, dy, Math.round(sx + (F.ox + F.w) * z) - dx, Math.round(sy + (F.oy + F.h) * z) - dy);
  ctx.imageSmoothingEnabled = prev;
}
