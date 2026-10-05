"use strict";
// ── LE MÉTRO DU QUAI — le dessin (lot 3 de docs/PLAN-ETAGES.md) ──────────────
//
// Le tracé vient de procedural/metroPlan.js (au-dessus de la promenade du quai de la
// rive opposée au cœur), mémorisé par layout. Trois matières sur la MÊME ligne :
//   · bande 5, MÉTRO DE FER : viaduc à poutres-treillis vertes sur colonnes de fonte
//     jumelles (socle de pierre), parapet de fonte ; gares à quais de pierre et
//     marquises de verre à lambrequin ; voitures Sprague ;
//   · bande 6, MÉTRO DE BÉTON : poutre-caisson lisse sur piles en marteau, quais et
//     auvents blancs à bandeau bleu ; rames blanches à bandeau vitré ;
//   · bandes 7-9, MONORAIL : deux poutres fines sur piles en Y, rames de nacre
//     profilées, quais et auvents dans la matière de l'ère.
//
// REPRISE DU 2026-10-04 (Raph : « le tunnel du métro fait 2 gros carrés verts qui
// ne vont pas et se posent sur la route. Le design du métro est très cheap ») :
//   · LES BOUTS : plus de talus d'herbe posé sur la promenade. La ligne plonge dans
//     une TRÉMIE — tranchée maçonnée sous le niveau du quai, bouche de tunnel en
//     arc au fond — puis remonte par une RAMPE MAÇONNÉE jusqu'au viaduc. Au-dessus
//     du sol : un parapet, rien d'autre. Le plan pose ces bouts sur du terrain libre.
//   · LES RAMES : construites en volumes par le peintre des bateaux (metroCars.js),
//     à n'importe quel cap, penchées sur la rampe, coupées net à la bouche du tunnel.
//     Elles S'ARRÊTENT en gare (accélération, arrêt, départ).
//   · LE VIADUC, LES PILES, LES GARES : redessinés (traverses et rails, treillis
//     riveté, colonnes de fonte, quais, marquises).
//
// TRI. Un tronçon = deux acteurs (dessus au coin arrière, tranche au coin avant ; cf.
// la règle des structures en l'air, clé au coin AVANT). Ce qui passe DEVANT une rame
// (parapet côté caméra, mur de la trémie) n'est pas confié au tri : la rame est
// peinte dans une toile de travail et EFFACÉE sous la ligne de ce parapet — exact
// quel que soit l'ordre (une rame qui longe un parapet ne « monte » plus dessus).
//
// Molette : __metro({ on, trains, shadow, stops }).
import { CM } from '../layout.js';
import { worldToScreen, depthOf } from './projection.js';
import { vieK, registerVieMask } from './isoVie.js';
import { planMetro, METRO, metroUAt } from '../procedural/metroPlan.js';
import { boxShapes, bakeShapes, blitBaked, makeBakeCache, elevGlow, segGeo, relTo, vquad, isoLocal } from './elevPaint.js';
import { drawMetroCar, CAR, CAR_PITCH, dirIndex, quantPitch } from './metroCars.js';

export const MET = { on: true, trains: 1, shadow: 0.55, stops: 1 };

// Matières par bande. Rampes du plus clair au plus sombre.
const MAT = {
  5: { kind: 'iron', ballast: '#7f7568', ballastD: '#6b6256', sleeper: '#4d3f33', rail: '#b4b6b0',
    iron: ['#7c9886', '#5f7a6a', '#465b4f', '#2e3b34'], stone: ['#e3d7bd', '#c9b999', '#a89777', '#7d6f55', '#4e4535'],
    plat: ['#d9cfbc', '#bfb39b', '#9d917a'], edge: '#efe9d8',
    roof: ['#cfe3ea', '#a9c9d6', '#7fa3b2'], frame: ['#5f7a6a', '#465b4f', '#2e3b34'],
    glow: '255,210,130', edgeGlow: null },
  6: { kind: 'concrete', ballast: '#76736d', ballastD: '#64615b', sleeper: '#9d9a93', rail: '#c8cbcd',
    conc: ['#eceae4', '#d6d4cc', '#bab8b0', '#97958d', '#64635d'], stone: ['#e6e4de', '#cfcdc5', '#b1afa7', '#8d8b84', '#5a5954'],
    plat: ['#d8d6cf', '#bebcb4', '#9c9a93'], edge: '#f0d24a',
    roof: ['#f6f6f3', '#dcdcd7', '#b9b9b3'], frame: ['#4677b2', '#365f93', '#284873'], col: ['#9aa1a6', '#7c8388', '#5e656a'],
    glow: '255,226,170', edgeGlow: null },
  7: { kind: 'mono', beam: ['#e6f0ea', '#c4d8cd', '#93ab9e'], lit: '#e6f0ea', mid: '#c4d8cd', dark: '#93ab9e', out: '#2d3a33',
    stone: ['#eef5f1', '#d5e5dc', '#b4ccbf', '#8ea99b', '#56695f'], plat: ['#e6f0ea', '#c4d8cd', '#93ab9e'], edge: '#5af0b4',
    roof: ['#d6f2ea', '#9ad6c4', '#5fae98'], frame: ['#93ab9e', '#6f8a7c', '#4d6357'], ballast: '#9fb3a8', ballastD: '#8aa094',
    glow: '170,255,220', edgeGlow: '150,255,210' },
  8: { kind: 'mono', beam: ['#fbf3dc', '#ead9a8', '#c9ad6a'], lit: '#fbf3dc', mid: '#ead9a8', dark: '#c9ad6a', out: '#40341c',
    stone: ['#fdf8ea', '#efe3c2', '#d8c693', '#b39b62', '#6e5d34'], plat: ['#fbf3dc', '#ead9a8', '#c9ad6a'], edge: '#ffcd78',
    roof: ['#fdf2d0', '#f0d48a', '#c9a24a'], frame: ['#c9ad6a', '#a68a4c', '#7a6434'], ballast: '#d3c39b', ballastD: '#bfae84',
    glow: '255,214,140', edgeGlow: '255,220,140' },
  9: { kind: 'mono', beam: ['#f4f1fb', '#dcd4ee', '#b8acd6'], lit: '#f4f1fb', mid: '#dcd4ee', dark: '#b8acd6', out: '#3a3050',
    stone: ['#f7f5fc', '#e4def3', '#c9bfe4', '#a294c8', '#5e5280'], plat: ['#f4f1fb', '#dcd4ee', '#b8acd6'], edge: '#aa8cff',
    roof: ['#ece6fb', '#cbbcf2', '#9c88d8'], frame: ['#b8acd6', '#9282bb', '#6c5d96'], ballast: '#c7bfdc', ballastD: '#b3a9cc',
    glow: '200,180,255', edgeGlow: '170,140,255' },
};
const matFor = (band) => MAT[Math.max(5, Math.min(9, band | 0))];

// Gabarits (tuiles). Tablier : largeur ; trémie : demi-largeurs intérieure et
// extérieure (deux voies et leurs rames tiennent dedans) ; parapet ; voies.
export const GEO = { w: 0.8, wMono: 0.9, pitIn: 0.39, pitOut: 0.45, par: 0.1, lane: 0.2, laneMono: 0.24, beamH: 0.2 };
// Gares : quais de part et d'autre du tablier, auvents au-dessus des quais (la voie
// reste à ciel ouvert : on voit la rame à l'arrêt). Lu par le téléphérique, qui se
// pose sur l'auvent côté fleuve.
export const STATION = { platIn: 0.4, platOut: 0.66, platH: 0.09, roofZ: 0.66, roofIn: 0.3, roofOut: 0.72, roofT: 0.07 };
// Décalage de la ligne vers les terres, en tuiles (lu aussi par le téléphérique).
export const LINE_SHIFT = 0.06;
const TH_IRON = 0.42, TH_CONC = 0.36, TH_MONO = 0.26;

// ── LE TRACÉ (mémo par layout) ───────────────────────────────────────────────
let _for = null, _plan = null;
export function metroPlanFor(L) {
  if (_for === L) return _plan;
  _for = L; _plan = null;
  if (!L || !L.river || !L.plan || !L.counts) return null;
  const occ = new Set();
  for (const t of L.tiles || []) {
    if (t.type === 'field') continue;
    const sx = t.spanX || 1, sy = t.spanY || 1;
    for (let i = 0; i < sx; i += 1) for (let j = 0; j < sy; j += 1) occ.add((t.gx + i) + ',' + (t.gy + j));
  }
  // Terrain libre pour une trémie : ni rue (ni place), ni bâtiment, ni tête de pont,
  // ni port, ni l'enclos des Plaisirs.
  const R = L.river, br = R.bridge, ports = L.ports || {}, pl = R.plaisirs;
  const inRect = (o, x, y) => o && x >= o.gx - 1 && x <= o.gx + (o.w || 1) && y >= o.gy - 1 && y <= o.gy + (o.h || 1);
  const free = (x, y) => {
    const k = x + ',' + y;
    if (occ.has(k) || (L.roadSet && L.roadSet.has(k))) return false;
    if (br && Math.abs(x + 0.5 - br.x) < 3.5) return false;
    if (inRect(ports.old, x, y) || inRect(ports.trade, x, y)) return false;
    if (pl && Math.hypot(x + 0.5 - pl.x, y + 0.5 - pl.y) < (pl.clear || 8) + 1) return false;
    return true;
  };
  const p = planMetro({ river: R, core: L.plan.core, N: L.gridN, band: L.counts.eraBand | 0, built: (x, y) => occ.has(x + ',' + y), free });
  if (!p) return null;
  const T = CM.TILE;
  p.w = p.mono ? GEO.wMono : GEO.w;
  // DANS la case du quai (jamais bâtie), à peine décalée vers les terres.
  p.wpts = p.pts.map((q) => ({ x: q.x * T, y: (q.y + p.sign * LINE_SHIFT) * T, z: q.z * T }));
  p.cum = [0];
  for (let i = 1; i < p.wpts.length; i += 1) p.cum.push(p.cum[i - 1] + Math.hypot(p.wpts[i].x - p.wpts[i - 1].x, p.wpts[i].y - p.wpts[i - 1].y));
  p.total = p.cum[p.cum.length - 1];
  const nSeg = p.wpts.length - 1;
  // Clés du peintre par tronçon : coin AVANT (dF) et coin ARRIÈRE (dB) de l'emprise —
  // celle de la trémie, plus large, aux bouts.
  p.G = p.ground;                                // cellules « au sol » à chaque bout
  p.geo = []; p.dF = []; p.dB = []; p.gnd = [];
  for (let i = 0; i < nSeg; i += 1) {
    const gnd = i < p.G || i >= nSeg - p.G;
    p.gnd.push(gnd);
    const g = segGeo(p.wpts[i], p.wpts[i + 1], (gnd ? 2 * GEO.pitOut : p.w) * T);
    p.geo.push(g);
    const ds = [g.AL, g.BL, g.AR, g.BR].map((q) => depthOf(q[0], q[1]));
    p.dF.push(Math.max(...ds)); p.dB.push(Math.min(...ds));
  }
  // LES BOUCHES DE TUNNEL : aux deux bouts de la ligne, au fond de la trémie ; la
  // rame n'existe qu'entre elles, coupée net à leur plan.
  p.mouth0 = p.wpts[0].x;
  p.mouth1 = p.wpts[nSeg].x;
  p.pitLen = metroUAt(0) * T;                    // longueur de la tranchée (rails sous le sol)
  // Piles : toutes les 3 cellules (4 au monorail), jamais au sol, jamais sur une rue,
  // un bâtiment ou dans une gare ; décalées d'une case si besoin.
  const blocked = (i) => {
    const q = p.wpts[i]; if (!q) return true;
    const k = Math.floor(q.x / T) + ',' + Math.floor(q.y / T);
    return occ.has(k) || (L.roadSet && L.roadSet.has(k));
  };
  // Gares : 3 tronçons (fer : 3 voitures) ou 4 (monorail), centrées sur la station du plan.
  const span = p.mono ? 4 : 3;
  p.st = [];
  for (const sx of p.stations) {
    const i0 = sx - p.x0 - 1, i1 = i0 + span;           // tronçons [i0, i1)
    if (i0 < p.G + 1 || i1 > nSeg - p.G - 1) continue;
    const sMid = (p.cum[i0] + p.cum[i1]) / 2;
    p.st.push({ i0, i1, sMid });
  }
  p.inStation = new Uint8Array(nSeg);
  for (const s of p.st) for (let i = s.i0; i < s.i1; i += 1) p.inStation[i] = 1;
  const every = p.mono ? 4 : 3;
  p.piers = [];
  for (let i = p.G + 1; i < nSeg - p.G; i += every) {
    for (const j of [i, i + 1, i - 1]) {
      if (j <= p.G || j >= nSeg - p.G || blocked(j) || p.inStation[j]) continue;
      p.piers.push(j); break;
    }
  }
  _plan = p;
  return p;
}

// ── LES BOUTS COMME LIEUX : rien ne s'y pose ─────────────────────────────────
// Emprises (px monde) des deux bouts « au sol » (trémie + rampe maçonnée), tirés
// droits le long de x. Les promeneurs du quai y font demi-tour (metroCutSpans), les
// réverbères du quai et la petite vie ne s'y posent pas (metroGroundAt) — sinon un
// réverbère ou un héron se tenait au-dessus du vide de la tranchée.
function groundRects(p) {
  if (p._rects) return p._rects;
  const T = CM.TILE, n = p.wpts.length - 1, h = GEO.pitOut * T;
  p._rects = [[0, p.G], [n - p.G, n]].map(([i0, i1]) => {
    const A = p.wpts[i0], B = p.wpts[i1];
    return { x0: Math.min(A.x, B.x), x1: Math.max(A.x, B.x), y0: Math.min(A.y, B.y) - h, y1: Math.max(A.y, B.y) + h };
  });
  return p._rects;
}
export function metroGroundAt(wx, wy, margin = 0) {
  const L = CM.layout, p = L && metroPlanFor(L);
  if (!p) return false;
  for (const r of groundRects(p)) if (wx >= r.x0 - margin && wx <= r.x1 + margin && wy >= r.y0 - margin && wy <= r.y1 + margin) return true;
  return false;
}
registerVieMask((wx, wy) => metroGroundAt(wx, wy));
// Les tronçons de promenade des flâneurs (isoQuay.quayWalkSpans), coupés aux bouts du
// métro : un tronçon qui traverse une trémie devient deux (demi-tour au parapet).
// Même objet rendu d'une frame à l'autre (les flâneurs sont tirés par tronçon).
const _cut = { src: null, plan: null, out: null };
export function metroCutSpans(spans, lanePoint) {
  const L = CM.layout, p = L && metroPlanFor(L);
  if (!p || !spans || !spans.length) return spans;
  if (_cut.src === spans && _cut.plan === p) return _cut.out;
  const T = CM.TILE, out = [];
  for (const sp of spans) {
    let a = -1;
    for (let k = sp.i0; k <= sp.i1 + 1; k += 1) {
      const ok = k <= sp.i1 && ![0.2, 0.5, 0.8].some((f) => { const q = lanePoint(sp.run, k, f); return metroGroundAt(q.x, q.y, 0.35 * T); });
      if (ok) { if (a < 0) a = k; continue; }
      if (a >= 0 && k - 1 - a >= 3) out.push({ ...sp, i0: a, i1: k - 1 });
      a = -1;
    }
  }
  _cut.src = spans; _cut.plan = p; _cut.out = out;
  return out;
}

// ── PRIMITIVES ───────────────────────────────────────────────────────────────
// Un point du monde à `off` TUILES du côté `side` (+1 = normale gauche) d'un point
// d'un tronçon, à la hauteur z (px monde).
const sidePt = (q, g, off, side, z) => [q.x + g.nx * off * side * CM.TILE, q.y + g.ny * off * side * CM.TILE, z];
// Un pixel d'art tous les demi-pixels le long d'un segment monde p→q (ligne fine).
function dotLine(s, a, p, q, col, stepW) {
  const L = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
  const n = Math.max(1, Math.ceil(L / stepW));
  for (let k = 0; k <= n; k += 1) {
    const u = k / n;
    s.push({ px: relTo(a, [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, p[2] + (q[2] - p[2]) * u]), col });
  }
}
// Le côté VISIBLE d'un tronçon (normale tournée vers la caméra) : +1 = gauche.
const nearSide = (g) => ((g.nx + g.ny) > 0 ? 1 : -1);

// Voie : ballast, traverses, rails (fer et béton), entre ±hw, rails à `lane` ±0,07.
function trackShapes(M, a, b, g, T, hw, stepW, zOff = 0, shade = false) {
  const s = [];
  const A = (off, side) => sidePt(a, g, off, side, a.z + zOff), B = (off, side) => sidePt(b, g, off, side, b.z + zOff);
  s.push({ poly: [relTo(a, A(hw, 1)), relTo(a, B(hw, 1)), relTo(a, B(hw, -1)), relTo(a, A(hw, -1))], col: shade ? M.ballastD : M.ballast });
  for (const lane of [-GEO.lane, GEO.lane]) {
    // traverses : tous les huitièmes de tuile
    const n = Math.max(2, Math.round(g.L / (T / 8)));
    for (let k = 0; k < n; k += 1) {
      const u0 = (k + 0.2) / n, u1 = (k + 0.62) / n;
      const P = (u, off) => [a.x + (b.x - a.x) * u + g.nx * off * T, a.y + (b.y - a.y) * u + g.ny * off * T, a.z + (b.z - a.z) * u + zOff];
      s.push({ poly: [relTo(a, P(u0, lane + 0.13)), relTo(a, P(u1, lane + 0.13)), relTo(a, P(u1, lane - 0.13)), relTo(a, P(u0, lane - 0.13))], col: M.sleeper });
    }
    for (const r of [-0.07, 0.07]) dotLine(s, a, sidePt(a, g, lane + r, 1, a.z + zOff), sidePt(b, g, lane + r, 1, b.z + zOff), M.rail, stepW);
  }
  return s;
}
// Monorail : deux poutres pleines (le dessus), posées à `zOff` sous le niveau de la voie.
function beamTops(M, a, b, g) {
  const s = [];
  for (const lane of [-GEO.laneMono, GEO.laneMono]) {
    const hw = 0.07;
    s.push({ poly: [relTo(a, sidePt(a, g, lane + hw, 1, a.z)), relTo(a, sidePt(b, g, lane + hw, 1, b.z)), relTo(a, sidePt(b, g, lane - hw, 1, b.z)), relTo(a, sidePt(a, g, lane - hw, 1, a.z))], col: M.beam[0] });
  }
  return s;
}
function beamSides(M, a, b, g, T, th) {
  const s = [];
  const ns = nearSide(g);
  for (const lane of [-GEO.laneMono, GEO.laneMono]) {
    const P = sidePt(a, g, lane + 0.07 * ns, 1, a.z), Q = sidePt(b, g, lane + 0.07 * ns, 1, b.z);
    s.push(vquad(a, P, Q, -th, 0, M.beam[2]));
    s.push(vquad(a, P, Q, -0.04 * T, 0, M.beam[1]));
    s.push(vquad(a, P, Q, -th, -th + 0.05 * T, M.out));
  }
  return s;
}

// ── LE VIADUC (tronçons en l'air) ────────────────────────────────────────────
// Dessus : la voie et le parapet du côté caché (sa face intérieure se voit).
function deckBack(M, a, b, g, T, stepW, st) {
  if (M.kind === 'mono') return beamTops(M, a, b, g);
  const s = trackShapes(M, a, b, g, T, 0.4, stepW);
  if (!st) {
    const fs = -nearSide(g), P = sidePt(a, g, 0.4, fs, a.z), Q = sidePt(b, g, 0.4, fs, b.z);
    const c = M.kind === 'iron' ? M.iron : M.conc;
    s.push(vquad(a, P, Q, 0, GEO.par * T, c[1]));
    s.push(vquad(a, P, Q, GEO.par * T - 0.025 * T, GEO.par * T, c[0]));
  }
  return s;
}
// Tranche : la poutre du côté caméra et son parapet.
function deckFront(M, a, b, g, T, stepW, st, i) {
  if (M.kind === 'mono') return beamSides(M, a, b, g, T, TH_MONO * T);
  const s = [];
  const ns = nearSide(g);
  const P = sidePt(a, g, 0.4, ns, a.z), Q = sidePt(b, g, 0.4, ns, b.z);
  const at = (u, dz) => [P[0] + (Q[0] - P[0]) * u, P[1] + (Q[1] - P[1]) * u, P[2] + (Q[2] - P[2]) * u + dz];
  if (M.kind === 'iron') {
    // POUTRE-TREILLIS : âme sombre (on voit au travers), membrures, montants, diagonales
    // en V (Warren), rivets sur la membrure haute.
    const th = TH_IRON * T, I = M.iron;
    s.push(vquad(a, P, Q, -th, 0, I[3]));
    const n = 4;                                             // panneaux par tronçon
    for (let k = 0; k <= n; k += 1) {
      const u = k / n, du = 0.035 * T / g.L;
      const p0 = at(u - du, 0), p1 = at(u + du, 0);
      s.push(vquad(a, p0, p1, -th, 0, I[1]));
      if (k < n) {
        const um = (k + 0.5) / n;
        dotLine(s, a, at(u, -th + 0.05 * T), at(um, -0.05 * T), I[1], stepW);
        dotLine(s, a, at(um, -0.05 * T), at((k + 1) / n, -th + 0.05 * T), I[1], stepW);
        dotLine(s, a, at(u + 0.012, -th + 0.05 * T), at(um + 0.012, -0.05 * T), I[2], stepW);
      }
    }
    s.push(vquad(a, P, Q, -0.07 * T, 0, I[0]));
    s.push(vquad(a, P, Q, -th, -th + 0.07 * T, I[1]));
    for (let k = 0; k < 16; k += 1) s.push({ px: relTo(a, at((k + 0.5) / 16, -0.035 * T)), col: I[2] });
    // parapet de fonte : une tôle à main courante claire
    if (!st) {
      s.push(vquad(a, P, Q, 0, GEO.par * T, I[1]));
      s.push(vquad(a, P, Q, GEO.par * T - 0.025 * T, GEO.par * T, I[0]));
    }
  } else {
    // POUTRE-CAISSON de béton : face lisse, larmier sombre, joint tous les 3 tronçons.
    const th = TH_CONC * T, C = M.conc;
    s.push(vquad(a, P, Q, -th, 0, C[1]));
    s.push(vquad(a, P, Q, -th, -th + 0.04 * T, C[3]));
    s.push(vquad(a, P, Q, -0.05 * T, 0, C[0]));
    if (i % 3 === 0) { const du = 0.012 * T / g.L; s.push(vquad(a, at(-du, 0), at(du, 0), -th, 0, C[3])); }
    if (!st) {
      s.push(vquad(a, P, Q, 0, GEO.par * T, C[0]));
      s.push(vquad(a, P, Q, 0, 0.025 * T, C[2]));
    }
  }
  return s;
}

// ── LES BOUTS : TRÉMIE ET RAMPE MAÇONNÉE (tronçons « au sol ») ─────────────────
// wt = haut du mur (le sol dans la tranchée, les rails sur la rampe). Pierre à assises
// (fer), béton (néon), la matière de l'ère (monorail).
const wallTop = (z) => Math.max(0, z);
function courses(s, a, P, Q, z0A, z0B, z1A, z1B, col, T) {
  // assises horizontales tous les 0,16 T, entre z0 (bas) et z1 (haut)
  for (let zc = -6 * T; zc < 2 * T; zc += 0.16 * T) {
    const zA = Math.max(z0A, Math.min(z1A, zc)), zB = Math.max(z0B, Math.min(z1B, zc));
    if (zc <= Math.min(z0A, z0B) || zc >= Math.max(z1A, z1B)) continue;
    s.push({ poly: [relTo(a, [P[0], P[1], zA + 0.02 * T]), relTo(a, [Q[0], Q[1], zB + 0.02 * T]), relTo(a, [Q[0], Q[1], zB]), relTo(a, [P[0], P[1], zA])], col });
  }
}
function groundBack(M, a, b, g, T, stepW, end) {
  const s = [];
  const S = M.stone, mono = M.kind === 'mono';
  const ns = nearSide(g), fs = -ns;
  const zfA = a.z - (mono ? GEO.beamH * T : 0), zfB = b.z - (mono ? GEO.beamH * T : 0);   // fond de voie
  // 1. Le fond : voie (ou poutres sur un radier) entre les murs.
  if (mono) {
    const A = (off, side) => sidePt(a, g, off, side, zfA), B = (off, side) => sidePt(b, g, off, side, zfB);
    s.push({ poly: [relTo(a, A(GEO.pitIn, 1)), relTo(a, B(GEO.pitIn, 1)), relTo(a, B(GEO.pitIn, -1)), relTo(a, A(GEO.pitIn, -1))], col: M.ballast });
    for (const lane of [-GEO.laneMono, GEO.laneMono]) {
      s.push(...[[0.07 * ns, M.beam[2]]].map(([o, c]) => vquad(a, sidePt(a, g, lane + o, 1, a.z), sidePt(b, g, lane + o, 1, b.z), -GEO.beamH * T, 0, c)));
    }
    s.push(...beamTops(M, a, b, g));
  } else {
    s.push(...trackShapes(M, a, b, g, T, GEO.pitIn, stepW, 0, a.z < 0 || b.z < 0));
  }
  // 2. Le mur du fond : sa face intérieure, du fond de voie au sol (dans la tranchée).
  // Plus sombre que la maçonnée au soleil : c'est un CREUX (premier essai : une face
  // claire de 20 px se lisait comme un mur posé sur le quai, pas comme une tranchée).
  // Au pied, une bande d'ombre sur le ballast.
  const PI = sidePt(a, g, GEO.pitIn, fs, 0), QI = sidePt(b, g, GEO.pitIn, fs, 0);
  if (zfA < 0 || zfB < 0) {
    const bA = Math.min(0, zfA), bB = Math.min(0, zfB);
    s.push({ poly: [relTo(a, [PI[0], PI[1], 0]), relTo(a, [QI[0], QI[1], 0]), relTo(a, [QI[0], QI[1], bB]), relTo(a, [PI[0], PI[1], bA])], col: S[3] });
    courses(s, a, PI, QI, bA, bB, 0, 0, S[4], T);
    const PS = sidePt(a, g, GEO.pitIn - 0.1, fs, 0), QS = sidePt(b, g, GEO.pitIn - 0.1, fs, 0);
    s.push({ poly: [relTo(a, [PI[0], PI[1], bA]), relTo(a, [QI[0], QI[1], bB]), relTo(a, [QS[0], QS[1], bB]), relTo(a, [PS[0], PS[1], bA])], col: S[4] });
  }
  // 3. Couronnement et parapet du mur du fond (on voit sa face intérieure).
  const wA = wallTop(a.z), wB = wallTop(b.z);
  const PO = sidePt(a, g, GEO.pitOut, fs, 0), QO = sidePt(b, g, GEO.pitOut, fs, 0);
  s.push({ poly: [relTo(a, [PI[0], PI[1], wA]), relTo(a, [QI[0], QI[1], wB]), relTo(a, [QO[0], QO[1], wB]), relTo(a, [PO[0], PO[1], wA])], col: S[0] });
  const PM = sidePt(a, g, (GEO.pitIn + GEO.pitOut) / 2, fs, 0), QM = sidePt(b, g, (GEO.pitIn + GEO.pitOut) / 2, fs, 0);
  s.push({ poly: [relTo(a, [PM[0], PM[1], wA + GEO.par * T]), relTo(a, [QM[0], QM[1], wB + GEO.par * T]), relTo(a, [QM[0], QM[1], wB]), relTo(a, [PM[0], PM[1], wA])], col: S[1] });
  s.push({ poly: [relTo(a, [PM[0], PM[1], wA + GEO.par * T]), relTo(a, [QM[0], QM[1], wB + GEO.par * T]), relTo(a, [QO[0], QO[1], wB + GEO.par * T]), relTo(a, [PO[0], PO[1], wA + GEO.par * T])], col: S[0] });
  // 4. La bouche du tunnel (bout ouest seulement : elle regarde la caméra).
  if (end === 0) s.push(...portalFace(M, a, g, T, zfA, mono));
  return s;
}
// La tête du tunnel, vue de face : un mur à assises, l'arc sombre bordé de claveaux
// clairs, la clé de voûte ; au-dessus du sol, le parapet qui ferme la tranchée.
function portalFace(M, a, g, T, zf, mono) {
  const s = [];
  const S = M.stone;
  const P = (off, z) => [a.x + g.nx * off * T, a.y + g.ny * off * T, z];
  const hwI = GEO.pitIn, x = 0.004 * T;
  const face = [relTo(a, P(hwI, 0)), relTo(a, P(-hwI, 0)), relTo(a, P(-hwI, zf)), relTo(a, P(hwI, zf))];
  s.push({ poly: face, col: S[3] });
  courses(s, a, P(-hwI, 0), P(hwI, 0), zf, zf, 0, 0, S[4], T);
  const r = (mono ? 0.3 : 0.31) * T, spring = zf + (mono ? 0.36 : 0.3) * T;
  const arch = (rr, ext) => {
    const pts = [[-rr, zf], [-rr, spring]];
    for (let k = 0; k <= 12; k += 1) { const an = Math.PI - (k / 12) * Math.PI; pts.push([Math.cos(an) * rr, spring + Math.sin(an) * rr * 0.86 + ext]); }
    pts.push([rr, spring], [rr, zf]);
    return pts.map(([o, z]) => { const q = P(o / T, z); return relTo(a, [q[0] + x * g.ux, q[1] + x * g.uy, q[2]]); });
  };
  s.push({ poly: arch(r + 0.055 * T, 0.03 * T), col: S[0] });
  s.push({ poly: arch(r, 0), col: '#101114' });
  // clé de voûte
  const kz = spring + r * 0.86;
  s.push({ poly: [relTo(a, P(-0.035, kz - 0.01 * T)), relTo(a, P(0.035, kz - 0.01 * T)), relTo(a, P(0.045, kz + 0.07 * T)), relTo(a, P(-0.045, kz + 0.07 * T))].map((q) => [q[0] + 2 * x * g.ux, q[1] + 2 * x * g.uy, q[2]]), col: S[1] });
  // parapet au-dessus de la bouche (face vers la caméra)
  s.push({ poly: [relTo(a, P(GEO.pitOut, GEO.par * T)), relTo(a, P(-GEO.pitOut, GEO.par * T)), relTo(a, P(-GEO.pitOut, 0)), relTo(a, P(GEO.pitOut, 0))], col: S[2] });
  s.push({ poly: [relTo(a, P(GEO.pitOut, GEO.par * T)), relTo(a, P(-GEO.pitOut, GEO.par * T)), relTo(a, P(-GEO.pitOut, GEO.par * T - 0.025 * T)), relTo(a, P(GEO.pitOut, GEO.par * T - 0.025 * T))], col: S[0] });
  return s;
}
// Devant : le mur côté caméra (face extérieure sur la rampe, sous le parapet), son
// couronnement et son parapet ; au bout est, le parapet qui ferme la tranchée ; au
// raccord avec le viaduc (bout ouest), la culée.
function groundFront(M, a, b, g, T, end, abut) {
  const s = [];
  const S = M.stone;
  const ns = nearSide(g);
  const wA = wallTop(a.z), wB = wallTop(b.z);
  const PO = sidePt(a, g, GEO.pitOut, ns, 0), QO = sidePt(b, g, GEO.pitOut, ns, 0);
  const PI = sidePt(a, g, GEO.pitIn, ns, 0), QI = sidePt(b, g, GEO.pitIn, ns, 0);
  const par = GEO.par * T;
  // face extérieure, du sol au haut du parapet
  s.push({ poly: [relTo(a, [PO[0], PO[1], wA + par]), relTo(a, [QO[0], QO[1], wB + par]), relTo(a, [QO[0], QO[1], 0]), relTo(a, [PO[0], PO[1], 0])], col: S[1] });
  courses(s, a, PO, QO, 0, 0, wA, wB, S[2], T);
  // soubassement et couronnement
  s.push({ poly: [relTo(a, [PO[0], PO[1], wA + par]), relTo(a, [QO[0], QO[1], wB + par]), relTo(a, [QO[0], QO[1], wB + par - 0.03 * T]), relTo(a, [PO[0], PO[1], wA + par - 0.03 * T])], col: S[0] });
  s.push({ poly: [relTo(a, [PI[0], PI[1], wA + par]), relTo(a, [QI[0], QI[1], wB + par]), relTo(a, [QO[0], QO[1], wB + par]), relTo(a, [PO[0], PO[1], wA + par])], col: S[0] });
  // bout est : le parapet en travers de la tranchée (sa face extérieure regarde la caméra)
  if (end === 1) {
    const E = (o, z) => [b.x + g.nx * o * T, b.y + g.ny * o * T, z];
    s.push({ poly: [relTo(a, E(GEO.pitOut, par)), relTo(a, E(-GEO.pitOut, par)), relTo(a, E(-GEO.pitOut, 0)), relTo(a, E(GEO.pitOut, 0))], col: S[2] });
    s.push({ poly: [relTo(a, E(GEO.pitOut, par)), relTo(a, E(-GEO.pitOut, par)), relTo(a, E(-GEO.pitOut, par - 0.03 * T)), relTo(a, E(GEO.pitOut, par - 0.03 * T))], col: S[0] });
  }
  // culée : la tête de la rampe, face au viaduc (visible au bout ouest)
  if (abut) {
    const E = (o, z) => [b.x + g.nx * o * T, b.y + g.ny * o * T, z];
    s.push({ poly: [relTo(a, E(GEO.pitOut, wB + par)), relTo(a, E(-GEO.pitOut, wB + par)), relTo(a, E(-GEO.pitOut, 0)), relTo(a, E(GEO.pitOut, 0))], col: S[2] });
    courses(s, a, E(-GEO.pitOut, 0), E(GEO.pitOut, 0), 0, 0, wB, wB, S[3], T);
  }
  return s;
}

// ── PILES ────────────────────────────────────────────────────────────────────
// Fer : deux colonnes de fonte (chapiteau, fût, base) sur un socle de pierre, sous
// une entretoise. Béton : une pile en marteau. Monorail : un fût et deux bras en Y.
function pierShapes(M, g, top, T) {
  const ax = Math.abs(g.ny) > Math.abs(g.nx);            // tablier le long de x → colonnes réparties en y
  const B = (u0, u1, v0, v1, z0, z1, cT, cL, cR, out) => (ax ? boxShapes(u0, v0, u1, v1, z0, z1, cT, cL, cR, out) : boxShapes(v0, u0, v1, u1, z0, z1, cT, cL, cR, out));
  const s = [];
  if (M.kind === 'iron') {
    const I = M.iron, S = M.stone, c = 0.055 * T;
    for (const v of [0.31 * T, -0.31 * T]) {
      s.push(...B(-0.11 * T, 0.11 * T, v - 0.11 * T, v + 0.11 * T, -top, -top + 0.12 * T, S[0], S[1], S[2], S[4]));            // socle
      s.push(...B(-c * 1.5, c * 1.5, v - c * 1.5, v + c * 1.5, -top + 0.12 * T, -top + 0.2 * T, I[0], I[1], I[2], I[3]));    // base
      s.push(...B(-c, c, v - c, v + c, -top + 0.2 * T, -0.12 * T, null, I[1], I[2], I[3]));                                   // fût
      s.push(...B(-c * 1.6, c * 1.6, v - c * 1.6, v + c * 1.6, -0.12 * T, -0.05 * T, I[0], I[1], I[2], I[3]));               // chapiteau
    }
    s.push(...B(-0.07 * T, 0.07 * T, -0.4 * T, 0.4 * T, -0.06 * T, 0, I[0], I[1], I[2], I[3]));                                 // entretoise
    return s;
  }
  if (M.kind === 'concrete') {
    const C = M.conc;
    s.push(...B(-0.12 * T, 0.12 * T, -0.16 * T, 0.16 * T, -top, -0.2 * T, null, C[1], C[3], C[4]));          // fût
    s.push(...B(-0.13 * T, 0.13 * T, -0.26 * T, 0.26 * T, -0.2 * T, -0.13 * T, null, C[1], C[3], C[4]));      // évasement
    s.push(...B(-0.14 * T, 0.14 * T, -0.38 * T, 0.38 * T, -0.13 * T, 0, C[0], C[1], C[3], C[4]));             // marteau
    return s;
  }
  const c = 0.1 * T, arm = 0.31 * T;
  s.push(...B(-c, c, -c, c, -top, -0.14 * T, null, M.beam[1], M.beam[2], M.out));
  s.push(...B(-c, c, -arm, arm, -0.14 * T, 0, M.beam[0], M.beam[1], M.beam[2], M.out));
  return s;
}

// ── GARES ────────────────────────────────────────────────────────────────────
// Deux quais (côté fleuve, côté terre) le long du tablier, un auvent sur chacun ;
// la voie reste à ciel ouvert. `side` : +1 / −1 (normale gauche). Origine = a.
function stationSide(M, a, b, g, T, side, mono) {
  const s = [];
  const A = (off, z) => sidePt(a, g, off, side, a.z + z), Bp = (off, z) => sidePt(b, g, off, side, b.z + z);
  const { platIn, platOut, platH, roofZ, roofIn, roofOut, roofT } = STATION;
  const P = M.plat;
  // le quai : dessus, liseré de bord, face extérieure
  s.push({ poly: [relTo(a, A(platIn, platH * T)), relTo(a, Bp(platIn, platH * T)), relTo(a, Bp(platOut, platH * T)), relTo(a, A(platOut, platH * T))], col: P[0] });
  s.push({ poly: [relTo(a, A(platIn, platH * T)), relTo(a, Bp(platIn, platH * T)), relTo(a, Bp(platIn + 0.04, platH * T)), relTo(a, A(platIn + 0.04, platH * T))], col: M.edge });
  // la dalle du quai déborde du tablier : on voit sa rive, pas un mur (premier essai :
  // une jupe de 0,3 tuile cachait la poutre et pesait sous la gare)
  s.push(vquad(a, A(platOut, 0), Bp(platOut, 0), -0.08 * T, platH * T, P[1]));
  s.push(vquad(a, A(platOut, 0), Bp(platOut, 0), -0.08 * T, -0.05 * T, P[2]));
  s.push(vquad(a, A(platIn, 0), Bp(platIn, 0), 0, platH * T, P[2]));
  // poteaux
  const n = Math.max(1, Math.round(g.L / T));
  const F = M.frame;
  for (let k = 0; k <= n; k += 1) {
    const u = k / n;
    const C = [a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, a.z + (b.z - a.z) * u];
    const o = (platOut - 0.08) * side, cx = C[0] + g.nx * o * T, cy = C[1] + g.ny * o * T;
    const cw = (mono ? 0.025 : 0.03) * T;
    for (const q of boxShapes(cx - cw, cy - cw, cx + cw, cy + cw, C[2] + platH * T, C[2] + roofZ * T, null, F[0], F[1], null)) {
      s.push({ ...q, poly: q.poly.map((p) => relTo(a, p)) });
    }
  }
  // l'auvent : dessus (verre, tôle ou nacre), rive, lambrequin (fer)
  const R = M.roof, z1 = roofZ * T, z2 = (roofZ + roofT) * T;
  s.push({ poly: [relTo(a, A(roofIn, z2)), relTo(a, Bp(roofIn, z2)), relTo(a, Bp(roofOut, z2 + 0.04 * T)), relTo(a, A(roofOut, z2 + 0.04 * T))], col: R[0] });
  {
    // verrière (fer) : chevrons de fonte tous les quarts de tuile ; tôle (béton, nacre) :
    // nervures d'un ton plus sombre, deux fois plus espacées
    const iron = M.kind === 'iron';
    const m = Math.max(2, Math.round(g.L / (T / (iron ? 4 : 2))));
    for (let k = 0; k <= m; k += 1) {
      const u = k / m;
      const p0 = [a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, a.z + (b.z - a.z) * u];
      dotLine(s, a, [p0[0] + g.nx * roofIn * side * T, p0[1] + g.ny * roofIn * side * T, p0[2] + z2], [p0[0] + g.nx * roofOut * side * T, p0[1] + g.ny * roofOut * side * T, p0[2] + z2 + 0.04 * T], iron ? F[0] : R[1], T / 40);
    }
  }
  // rive intérieure (côté voie) et rive extérieure
  s.push(vquad(a, A(roofIn, 0), Bp(roofIn, 0), z1, z2, F[1]));
  s.push(vquad(a, A(roofOut, 0), Bp(roofOut, 0), z1 + 0.04 * T, z2 + 0.04 * T, F[0]));
  if (M.kind === 'iron') {
    // lambrequin : festons sous la rive intérieure
    const m = Math.max(4, Math.round(g.L / (T / 10)));
    for (let k = 0; k < m; k += 1) {
      const u = (k + 0.5) / m;
      const q = [a.x + (b.x - a.x) * u + g.nx * roofIn * side * T, a.y + (b.y - a.y) * u + g.ny * roofIn * side * T, a.z + (b.z - a.z) * u + z1];
      s.push({ px: relTo(a, [q[0], q[1], q[2] - 0.02 * T]), col: F[1] });
    }
  } else if (M.kind === 'concrete') {
    s.push(vquad(a, A(roofOut, 0), Bp(roofOut, 0), z2, z2 + 0.06 * T, M.frame[0]));        // bandeau bleu
  }
  return s;
}

// ── CUISSONS ─────────────────────────────────────────────────────────────────
const _bakes = makeBakeCache(1400);
const artK = () => { const d = CM.dpr || 1; return Math.max(1, Math.round(vieK() * d)); };
function baked(key, make, erase = null) {
  const z = CM.cam.zoom, d = CM.dpr || 1, kd = artK();
  return _bakes.get(key + '|' + z + '|' + d, () => {
    const bk = bakeShapes(make(), z, d, kd);
    if (bk && erase) eraseBelowLines(bk.cv.getContext('2d'), erase.a, erase.lines, z, d, kd, bk.ox, bk.oy);
    return bk;
  });
}
// Efface, dans une toile dont l'ORIGINE (le point monde a) est en (ox, oy) device, tout
// ce qui est SOUS chacune des lignes monde p→q (vue à l'écran) : ce qu'un mur ou un
// parapet cache. Grille d'art `kd`, pixels entiers (pas d'anticrénelage).
// Rangée d'art par rangée d'art, bornée à la toile : un fillRect par rangée et par
// ligne (une voiture : une trentaine), jamais un polygone géant rempli à chaque image.
function eraseBelowLines(g, a, lines, z, d, kd, ox, oy, rows = null) {
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = '#000';
  const W = g.canvas.width, H = rows || g.canvas.height;
  for (const [p, q] of lines) {
    const P = isoLocal(p[0] - a.x, p[1] - a.y, p[2] - a.z, z), Q = isoLocal(q[0] - a.x, q[1] - a.y, q[2] - a.z, z);
    const x0 = P[0] * d + ox, y0 = P[1] * d + oy, x1 = Q[0] * d + ox, y1 = Q[1] * d + oy;
    if (Math.abs(x1 - x0) < 1e-6) continue;
    const m = (y1 - y0) / (x1 - x0);
    for (let r = 0; r * kd < H; r += 1) {
      const yc = (r + 0.5) * kd;
      if (Math.abs(m) < 1e-6) { if (yc > y0) g.fillRect(0, r * kd, W, kd); continue; }
      // sous la ligne : à gauche de son point de la rangée si elle descend vers la droite
      const c = Math.round((x0 + (yc - y0) / m) / kd) * kd;
      if (m > 0) { if (c > 0) g.fillRect(0, r * kd, Math.min(W, c), kd); } else if (c < W) g.fillRect(Math.max(0, c), r * kd, W - Math.max(0, c), kd);
    }
  }
  g.restore();
}
const r1 = (v) => Math.round(v * 10) / 10;

// Point de la ligne à l'abscisse curviligne s (extrapolé au-delà des bouts).
function along(p, s) {
  let j = 1;
  while (j < p.cum.length - 1 && p.cum[j] < s) j += 1;
  const a = p.wpts[j - 1], b = p.wpts[j], seg = (p.cum[j] - p.cum[j - 1]) || 1;
  const u = (s - p.cum[j - 1]) / seg;
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u, ux: (b.x - a.x) / seg, uy: (b.y - a.y) / seg, i: j - 1 };
}

// ── L'HORAIRE : départ, arrêts en gare, sortie ───────────────────────────────
// Une rame d'un sens : la tête part de sous terre (déjà lancée), s'arrête au milieu
// de chaque gare, repart, et rentre sous terre à l'autre bout ; puis un temps hors
// champ. Mouvements à accélération constante (trapèzes de vitesse).
const RUN = { vIron: 2.6, vMono: 3.4, acc: 1.1, dwell: 4.5, off: 7 };     // tuiles/s, tuiles/s², s
function legOf(d, v0, v1, vmax, acc) {
  const vp = Math.min(vmax, Math.sqrt(Math.max(0, (2 * acc * d + v0 * v0 + v1 * v1) / 2)));
  const t1 = Math.max(0, (vp - v0) / acc), d1 = Math.max(0, (vp * vp - v0 * v0) / (2 * acc));
  const t3 = Math.max(0, (vp - v1) / acc), d3 = Math.max(0, (vp * vp - v1 * v1) / (2 * acc));
  const d2 = Math.max(0, d - d1 - d3), t2 = vp > 0 ? d2 / vp : 0;
  return { d, v0, v1, vp, t1, t2, t3, d1, d2, T: t1 + t2 + t3 };
}
function legPos(L, t, acc) {
  if (t <= L.t1) return L.v0 * t + 0.5 * acc * t * t;
  if (t <= L.t1 + L.t2) return L.d1 + L.vp * (t - L.t1);
  const u = Math.min(L.t3, t - L.t1 - L.t2);
  return L.d1 + L.d2 + L.vp * u - 0.5 * acc * u * u;
}
// Horaire mémorisé par plan et par sens : liste [{ s0, leg | dwell, t0 }].
function timetable(p, dir, T) {
  if (!p._tt) p._tt = {};
  if (p._tt[dir]) return p._tt[dir];
  const mono = p.mono, n = mono ? 4 : 3, len = n * (mono ? CAR_PITCH.mono : CAR_PITCH.iron);
  const vmax = (mono ? RUN.vMono : RUN.vIron) * T, acc = RUN.acc * T;
  // positions de la TÊTE, dans le sens de marche (σ = s pour dir +1, total − s sinon)
  const stops = p.st.map((st) => (dir > 0 ? st.sMid : p.total - st.sMid) + len / 2).sort((u, v) => u - v);
  const start = -len - T, end = p.total + len + T;
  const pts = MET.stops ? [start, ...stops, end] : [start, end];
  const steps = [];
  let t = 0;
  for (let k = 0; k + 1 < pts.length; k += 1) {
    const L = legOf(pts[k + 1] - pts[k], k === 0 ? vmax : 0, k + 2 === pts.length ? vmax : 0, vmax, acc);
    steps.push({ kind: 'run', s0: pts[k], t0: t, L }); t += L.T;
    if (k + 2 < pts.length) { steps.push({ kind: 'dwell', s0: pts[k + 1], t0: t, T: RUN.dwell }); t += RUN.dwell; }
  }
  const tt = { steps, period: t + RUN.off, len, acc, end };
  p._tt[dir] = tt;
  return tt;
}
function headAt(tt, t) {
  const tm = ((t % tt.period) + tt.period) % tt.period;
  let st = tt.steps[0];
  for (const s of tt.steps) { if (s.t0 <= tm) st = s; else break; }
  if (tm >= tt.steps[tt.steps.length - 1].t0 + (tt.steps[tt.steps.length - 1].L ? tt.steps[tt.steps.length - 1].L.T : 0)) return tt.end + 10 * tt.len;
  if (st.kind === 'dwell') return st.s0;
  return st.s0 + legPos(st.L, tm - st.t0, tt.acc);
}

// ── LES ACTEURS ──────────────────────────────────────────────────────────────
export const metroStats = { segs: 0, cars: 0, where: null, stopped: 0 };
let _carCv = null;
const _memo = new Map();
export function metroActors(now, out, decay = 0) {
  metroStats.segs = 0; metroStats.cars = 0; metroStats.where = null; metroStats.stopped = 0;
  const L = CM.layout;
  if (!MET.on || !L || CM.lodActive) return;
  const p = metroPlanFor(L);
  if (!p) return;
  const T = CM.TILE, z = CM.cam.zoom, d = CM.dpr || 1;
  const band = (L.counts.eraBand) | 0;
  const M = matFor(band), mono = p.mono;
  const mg = 3 * T * z;
  const vis = (x, y, zz) => { const q = worldToScreen(x, y, zz); return q.x > -mg && q.x < CM.cw + mg && q.y > -mg && q.y < CM.ch + mg * 2; };
  const th = (mono ? TH_MONO : M.kind === 'concrete' ? TH_CONC : TH_IRON) * T;
  const stepW = 0.5 * artK() / (z * d);                   // un demi-pixel d'art, en px monde
  const nSeg = p.wpts.length - 1;
  for (let i = 0; i < nSeg; i += 1) {
    const a = p.wpts[i], b = p.wpts[i + 1];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    if (!vis(mx, my, a.z) && !vis(mx, my, 0)) continue;
    const g = p.geo[i];
    const kGeo = r1(b.x - a.x) + ',' + r1(b.y - a.y) + ',' + r1(a.z) + ',' + r1(b.z - a.z);
    if (p.gnd[i]) {
      // ── trémie et rampe maçonnée : la maçonnerie reste debout dans la ruine
      const end = i < p.G ? 0 : 1;
      const first = end === 0 ? i === 0 : i === nSeg - 1;
      const abut = end === 0 && i === p.G - 1;
      metroStats.segs += 1;
      // Ce que les murs côté caméra cachent du fond : sous le bord du mur (et, au
      // bout est, sous le bord du parapet qui ferme la tranchée).
      const ns = nearSide(g);
      const lines = [[sidePt(a, g, GEO.pitIn, ns, 0), sidePt(b, g, GEO.pitIn, ns, 0)]];
      if (end === 1) lines.push([[p.mouth1, a.y - T, 0], [p.mouth1, a.y + T, 0]]);
      // (au bout est, la ligne du parapet de bout est propre à chaque tronçon)
      const kE = kGeo + '|' + (first ? 1 : 0) + '|' + end + (end === 1 ? '|' + i : '');
      out.push({ wx: mx, wy: my, d: p.dB[i] - 0.05 * T, draw(ctx) {
        const bk = baked('gb|' + band + '|' + kE, () => groundBack(M, a, b, g, T, stepW, first ? end : -1), { a, lines });
        const s0 = worldToScreen(a.x, a.y, a.z);
        blitBaked(ctx, bk, s0.x, s0.y, d);
      } });
      out.push({ wx: mx, wy: my, d: p.dF[i] + 0.02 * T, draw(ctx) {
        const bk = baked('gf|' + band + '|' + kE + '|' + (abut ? 1 : 0), () => groundFront(M, a, b, g, T, first ? end : -1, abut));
        const s0 = worldToScreen(a.x, a.y, a.z);
        blitBaked(ctx, bk, s0.x, s0.y, d);
      } });
      continue;
    }
    // LA CHUTE (lot 4) : travées tombées par grappes de 3 tronçons.
    if (decay > 0.5 && ((Math.floor(i / 3) * 2654435761) >>> 0) / 4294967296 < (decay - 0.4) * 1.0) continue;
    metroStats.segs += 1;
    const dFront = p.dF[i], st = p.inStation[i] === 1;
    if (MET.shadow > 0) {
      const sk = MET.shadow;
      const o = { x: a.x + a.z * sk, y: a.y, z: 0 };
      const gs = segGeo(a, b, p.w * T);
      const q = [gs.AL, gs.BL, gs.BR, gs.AR].map((c) => [c[0] + c[2] * sk - o.x, c[1] - o.y, 0]);
      out.push({ wx: o.x, wy: o.y, d: Math.min(...q.map((c) => depthOf(c[0] + o.x, c[1] + o.y))) - 0.05 * T, draw(ctx) {
        const bk = baked('sh|' + (mono ? 1 : 0) + '|' + kGeo, () => [{ poly: q, col: '#141828' }]);
        const s0 = worldToScreen(o.x, o.y, 0);
        blitBaked(ctx, bk, s0.x, s0.y, d, (mono ? 0.11 : 0.15) * (1 - 0.75 * (CM.nightF || 0)));
      } });
    }
    out.push({ wx: mx, wy: my, d: dFront - 0.002 * T, draw(ctx) {
      const bk = baked('bk|' + band + '|' + kGeo + '|' + (st ? 1 : 0), () => deckBack(M, a, b, g, T, stepW, st));
      const s0 = worldToScreen(a.x, a.y, a.z);
      blitBaked(ctx, bk, s0.x, s0.y, d);
    } });
    out.push({ wx: mx, wy: my, d: dFront, draw(ctx) {
      const bk = baked('fr|' + band + '|' + kGeo + '|' + (st ? 1 : 0) + '|' + (i % 3 === 0 ? 1 : 0), () => deckFront(M, a, b, g, T, stepW, st, i));
      const s0 = worldToScreen(a.x, a.y, a.z);
      blitBaked(ctx, bk, s0.x, s0.y, d);
      if (M.edgeGlow && (CM.nightF || 0) * (1 - decay) > 0.05) {
        const s1 = worldToScreen(b.x, b.y, b.z);
        elevGlow((s0.x + s1.x) / 2, (s0.y + s1.y) / 2 + th * z * 0.5, 2.5 * z / 0.625, M.edgeGlow, 0.3 * (CM.nightF || 0));
      }
    } });
  }
  // piles
  for (const i of p.piers) {
    const a = p.wpts[i];
    if (decay > 0.5 && ((Math.floor(i / 3) * 2654435761) >>> 0) / 4294967296 < (decay - 0.4) * 1.0) continue;
    if (!vis(a.x, a.y, a.z) && !vis(a.x, a.y, 0)) continue;
    const g = p.geo[i];
    const top = a.z - th;
    if (top < 0.25 * T) continue;
    out.push({ wx: a.x, wy: a.y, d: p.dF[i] - 0.3 * T, draw(ctx) {
      const bk = baked('pi|' + band + '|' + r1(top) + '|' + (Math.abs(g.ny) > Math.abs(g.nx) ? 1 : 0), () => pierShapes(M, g, top, T));
      const s0 = worldToScreen(a.x, a.y, top);
      blitBaked(ctx, bk, s0.x, s0.y, d);
    } });
  }
  // gares : le quai et l'auvent du fond AVANT les rames, ceux de devant APRÈS
  for (const sg of p.st) {
    const am = along(p, sg.sMid);
    if (!vis(am.x, am.y, am.z)) continue;
    const ns = nearSide(p.geo[sg.i0]);
    let dFmax = -Infinity, dBmin = Infinity;
    for (let i = sg.i0; i < sg.i1; i += 1) { dFmax = Math.max(dFmax, p.dF[i]); dBmin = Math.min(dBmin, p.dB[i]); }
    for (let i = sg.i0; i < sg.i1; i += 1) {
      const a = p.wpts[i], b = p.wpts[i + 1], g = p.geo[i];
      const kGeo = r1(b.x - a.x) + ',' + r1(b.y - a.y) + ',' + r1(a.z) + ',' + r1(b.z - a.z);
      for (const side of [-ns, ns]) {
        const front = side === ns;
        out.push({ wx: a.x, wy: a.y, d: front ? dFmax + 0.1 * T + i * 0.001 : dBmin - 0.02 * T, draw(ctx) {
          const bk = baked('st|' + band + '|' + kGeo + '|' + side, () => stationSide(M, a, b, g, T, side, mono));
          const s0 = worldToScreen(a.x, a.y, a.z);
          blitBaked(ctx, bk, s0.x, s0.y, d);
        } });
      }
    }
    const nF = (CM.nightF || 0) * (1 - decay);
    if (nF > 0.05) {
      out.push({ wx: am.x, wy: am.y, d: dFmax + 0.2 * T, draw() {
        for (const side of [-1, 1]) {
          for (const f of [-0.33, 0, 0.33]) {
            const q = along(p, sg.sMid + f * (sg.i1 - sg.i0) * T);
            const s0 = worldToScreen(q.x - q.uy * side * 0.55 * T, q.y + q.ux * side * 0.55 * T, q.z + (STATION.roofZ - 0.05) * T);
            elevGlow(s0.x, s0.y, 9 * z / 0.625, M.glow, 0.45 * nF);
          }
        }
      } });
    }
  }
  // rames
  if (MET.trains > 0 && decay < 0.5) trainActors(p, M, band, now, out, vis);
}

// Une rame par sens. Chaque voiture : cap, pente et coupe de bouche calculés sur
// ses deux bogies ; dessinée dans une toile de travail d'où l'on efface ce que le
// parapet (ou le mur de la trémie) côté caméra cache.
function trainActors(p, M, band, now, out, vis) {
  const T = CM.TILE, z = CM.cam.zoom, d = CM.dpr || 1;
  const mono = p.mono, G = mono ? CAR.mono : CAR.iron, nCars = mono ? 4 : 3;
  const pitch = mono ? CAR_PITCH.mono : CAR_PITCH.iron, bog = G.Lh - 5.6;
  const t = now / 1000;
  const night = (CM.nightF || 0) > 0.45;
  for (const [dir, lane] of [[1, mono ? GEO.laneMono : GEO.lane], [-1, -(mono ? GEO.laneMono : GEO.lane)]]) {
    const tt = timetable(p, dir, T);
    const head = headAt(tt, t + (dir < 0 ? tt.period * 0.5 : 0));
    const moving = Math.abs(headAt(tt, t + 0.05 + (dir < 0 ? tt.period * 0.5 : 0)) - head) > 0.01;
    if (!moving && head > 0 && head < p.total) metroStats.stopped += 1;
    for (let c = 0; c < nCars; c += 1) {
      const sig = head - (c + 0.5) * pitch;                      // milieu de la voiture, sens de marche
      if (sig < -G.Lh - 2 || sig > p.total + G.Lh + 2) continue;
      const s = dir > 0 ? sig : p.total - sig;
      const qa = along(p, s - dir * bog), qb = along(p, s + dir * bog);
      const cx = (qa.x + qb.x) / 2, cy = (qa.y + qb.y) / 2, cz = (qa.z + qb.z) / 2;
      const q = along(p, s);
      const x = cx + -q.uy * lane * T, y = cy + q.ux * lane * T;
      if (!vis(x, y, cz)) continue;
      const theta = Math.atan2(qb.y - qa.y, qb.x - qa.x);
      const tp = (qb.z - qa.z) / (2 * bog);
      // Coupe aux bouches : en a (repère de la voiture), la part entre les deux plans.
      const lo = Math.round(-sig), hi = Math.round(p.total - sig);
      const cut = (lo > -G.Lh - 2 || hi < G.Lh + 2) ? [Math.max(-G.Lh - 3, lo), Math.min(G.Lh + 3, hi)] : null;
      if (cut && cut[1] - cut[0] < 2) continue;
      const role = c === 0 ? 'head' : c === nCars - 1 ? 'tail' : 'mid';
      const spec = { band, role, first: band === 5 && c === 1, dir: dirIndex(theta), pq: quantPitch(tp), cut, night };
      metroStats.cars += 1;
      if (!metroStats.where) metroStats.where = [Math.round(x / T), Math.round(y / T)];
      // Ce qui la cache : le parapet côté caméra (fer, béton) ou, dans la trémie et sur
      // la rampe, le mur ; au bout est, le parapet qui ferme la tranchée.
      const ii = Math.max(0, Math.min(p.geo.length - 1, q.i));
      const g = p.geo[ii], ns = nearSide(g);
      const gnd = p.gnd[ii];
      const lines = [];
      if (!mono || gnd) {
        const off = gnd ? GEO.pitIn : 0.4;
        const top = (zz) => (gnd ? wallTop(zz) : zz) + GEO.par * T;
        const pa = along(p, s - G.Lh - 2), pb = along(p, s + G.Lh + 2);
        lines.push([sidePt(pa, g, off, ns, top(pa.z)), sidePt(pb, g, off, ns, top(pb.z))]);
      }
      if (gnd && ii >= p.geo.length - p.G) lines.push([[p.mouth1, y - T, GEO.par * T], [p.mouth1, y + T, GEO.par * T]]);
      const ln = lines.length ? lines : null;
      // Clé : en l'air, après les tronçons qu'elle couvre (jusqu'au suivant) ; dans la
      // trémie et sur la rampe, juste après le FOND des tronçons couverts — pas plus : la
      // maison plantée au bord de la tranchée est devant elle (premier essai : la clé
      // « en l'air » la faisait passer par-dessus le toit). Ce qui la cache côté
      // caméra (mur, parapet) est effacé, pas trié.
      const jj = Math.min(p.dF.length - 1, ii + 1);
      const inPit = gnd && p.gnd[jj];
      const dCar = (inPit ? Math.max(p.dB[ii], p.dB[jj]) + 0.25 * T : Math.max(p.dF[ii], p.dF[jj]) + 0.05 * T) + (depthOf(x, y) - depthOf(q.x, q.y)) * 0.05;
      const mk = dir + ':' + c;
      let memo = _memo.get(mk);
      if (!memo) { memo = {}; _memo.set(mk, memo); }
      out.push({ wx: x, wy: y, d: dCar, draw(ctx) {
        const r = drawCarErased(ctx, spec, x, y, cz, now, memo, ln, z, d);
        if (!r) return;
        const nF = CM.nightF || 0;
        if (nF > 0.05) {
          const sc = worldToScreen(x, y, cz + 0.25 * T);
          elevGlow(sc.x, sc.y, 9 * z / 0.625, M.glow, 0.35 * nF);
          for (const l of r.lamps) elevGlow(l.x, l.y, 3 * z / 0.625, l.tail ? '255,80,60' : '255,240,200', 0.7 * nF);
        }
      } });
    }
  }
}
// Pose une voiture via une toile de travail : on la peint, on efface sous les lignes
// des parapets qui la cachent, on recopie.
function drawCarErased(ctx, spec, x, y, cz, now, memo, lines, z, d) {
  if (!lines) return drawMetroCar(ctx, spec, x, y, cz, now, memo);
  if (typeof document === 'undefined') return null;
  if (!_carCv) _carCv = document.createElement('canvas');
  const cv = _carCv, g = cv.getContext('2d');
  // Une pose « à blanc » donne l'emprise ; on peint dans la toile à cette emprise.
  const probe = { drawImage() {}, imageSmoothingEnabled: false };
  const r = drawMetroCar(probe, spec, x, y, cz, now, memo);
  if (!r) return null;
  const W = Math.max(1, Math.ceil(r.dw * d) + 2), H = Math.max(1, Math.ceil(r.dh * d) + 2);
  if (cv.width < W || cv.height < H) { cv.width = Math.max(cv.width, W); cv.height = Math.max(cv.height, H); }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, W, H);
  g.imageSmoothingEnabled = false;
  g.drawImage(r.img, 0, 0, Math.round(r.dw * d), Math.round(r.dh * d));
  // Origine monde (le milieu de la voiture au rail) → toile : on efface en device.
  const a = { x, y, z: cz };
  const o = worldToScreen(x, y, cz);
  const kd = Math.max(1, Math.round(z * d));
  eraseBelowLines(g, a, lines, z, d, kd, (o.x - r.bx) * d, (o.y - r.by) * d, H);
  ctx.drawImage(cv, 0, 0, W, H, r.bx, r.by, W / d, H / d);
  return r;
}

if (typeof window !== 'undefined') {
  window.__metro = (o) => {
    // `replan` : recalcule le tracé (après avoir forcé la bande d'un layout, en vérif).
    if (o) { Object.assign(MET, o); if ('stops' in o && _plan) _plan._tt = null; if (o.replan) { _for = null; delete MET.replan; } }
    const p = CM.layout ? metroPlanFor(CM.layout) : null;
    return { ...MET, plan: p ? { sign: p.sign, x0: p.x0, x1: p.x1, stations: p.stations, mono: p.mono, y0: p.pts[0] && p.pts[0].y, ground: p.G, piers: p.piers.length, st: p.st.length } : null, stats: { ...metroStats }, deck: METRO.deck };
  };
}
