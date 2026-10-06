"use strict";
// ── L'AUTOROUTE DE L'ARTÈRE — la circulation (docs/PLAN-ETAGES.md, lot 2) ────────
//
// Retour Raph du 2026-10-06 : « les voitures disparaissent au bout du bras d'autoroute
// plutôt que de suivre la route ». La circulation du tablier était un pur f(now) bouclé
// sur chaque voie : la voiture qui touchait le sol au pied d'une rampe s'effaçait (« au
// sol : les voitures du jeu y sont déjà » — elles n'y étaient pas), et une autre naissait
// sur la rampe d'en face, comme au départ de chaque boucle de l'échangeur, en plein
// tablier.
//
// Ce sont désormais des VÉHICULES raccordés à la flotte des rues (CM.vehicles) :
//   · sur l'autoroute, chacun tient sa VOIE — abscisse u le long de la voie, suivi à
//     distance `gap` derrière celui qui le précède ; iso/isoHighway.js les dessine à la
//     hauteur du tablier ;
//   · au bout d'une voie de SORTIE (pied d'une rampe, ou de la boucle de sortie de
//     l'échangeur), il descend dans la rue où il se trouve et entre dans la flotte, à sa
//     file : il y roule comme les autres (suivi, priorité au carrefour), sur un
//     ITINÉRAIRE de rues (v.route, suivi par agents.js) qui le ramène au pied d'une
//     voie d'ACCÈS — demi-tour au carrefour suivant, ou tour d'un pâté de maisons ;
//   · au pied de la voie d'accès, il quitte la flotte et monte.
// Personne n'apparaît ni ne disparaît sous les yeux du joueur : l'effectif est semé
// une fois sur les voies (le tirage du f(now) d'avant : au chargement, le tablier est
// celui qu'on connaissait) ; seul un manque — un véhicule perdu au recalcul du plan, à
// la chute… — se recomble, par une rampe d'accès HORS CHAMP. Mesuré sur la mégapole de
// l'ère 33 (93 voitures) : ~80 sur le tablier, ~12 en ville, aucune bloquée en 90 s.
// Effectif à part : cmSyncRoadFleet ne compte ni ne retire les `v.hwy`.
//
// Les BOUCLES de l'échangeur ont chacune leur sens (conduite à droite) : celle qui
// quitte le tablier du côté de la voie qui va vers la lisière est une SORTIE (un
// virage à gauche vers la rue transversale) ; l'autre est une ENTRÉE, parcourue à
// rebours, de la rue transversale vers la voie qui revient de la lisière. Les deux
// roulaient du tablier vers la rue, l'une à contresens.
//
// Molette : __highwayTraffic({ on, cars, share, speed, gap, exitP, detour }) — un
// changement d'effectif ressème les voies.
import { CM } from './layout.js';
import { bankRibbon, loopRibbons } from './procedural/highwayPlan.js';
import { CM_DIRS, cityMapWalkRoadKey, roadStepAllowed, vehSkinFor } from './agents.js';
import { worldToScreen } from './iso/projection.js';

// on, cars (densité, 1 = celle du f(now) d'avant), share (part de cet effectif semée),
// speed (tuiles/s sur le tablier), gap (tuiles, d'axe à axe dans une voie), exitP (part
// des voitures de la voie extérieure qui prennent la boucle de sortie), detour (part des
// itinéraires de retour qui font le tour d'un pâté), reach (rayon de recherche, cases).
export const HTR = { on: true, cars: 1, share: 1, speed: 2.4, gap: 0.9, exitP: 0.35, detour: 0.5, reach: 18 };
const BLEND = 1.2;   // tuiles : l'écart latéral à l'entrée d'une voie (file de rue, bretelle) s'y fond
const EASE = 1.5;    // tuiles : au pied d'une rampe, l'allure passe de celle de la rue à celle du tablier
const CLEAR = 0.6;   // tuiles : la place libre qu'il faut au pied d'une sortie pour y descendre
const HEADWAY = 0.25; // s : le suivi (cf. stepLane)
const FORCE = 4;     // s : au-delà, la sortie passe quand même (jamais de file figée, cf. VEH_GAP.patience)

let P = null;        // le plan de circulation courant (buildPlan), null sans autoroute
// Compteurs (molette, gardes) : voitures sans chemin de retour devenues voitures de la
// flotte, sorties forcées (pied encombré plus de FORCE s), voitures recomblées hors champ.
export const HTS = { lost: 0, lastLost: null, forced: 0, topUp: 0 };

export function h01(n) {
  let h = Math.imul((n | 0) ^ 0x85ebca6b, 2654435761) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}
const CAR_TYPES = ['car', 'car', 'car', 'taxi', 'car', 'bus', 'car', 'van', 'car', 'truck'];
// Allure dans les rues (px monde/s) : la grille de la flotte (cmSyncRoadFleet).
const streetSpeed = (type, n) => (type === 'bus' || type === 'truck' ? 24 + (n % 4) * 3 : type === 'van' ? 30 + (n % 5) * 3 : 34 + (n % 6) * 4);

// ── LES VOIES ────────────────────────────────────────────────────────────────
// Une voie = une polyligne MONDE dans le sens de marche { pts: [{ x, y, z }], cum, len },
// le ruban qui la porte (`ri`, même ordre qu'isoHighway : rives puis boucles), le tronçon
// de ce ruban sous chaque segment (`seg`, pour la clé du peintre), ses voitures (u
// décroissant : la tête d'abord) et ses raccords : `entry` (case de rue au pied de
// l'accès), `exit` (case de rue au pied de la sortie), `branch` (la boucle de sortie qui
// s'en détache), `merge` (la voie où la boucle d'entrée se fond).
function mkLane(ri, kind, pts, seg) {
  const cum = [0];
  for (let i = 1; i < pts.length; i += 1) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return { ri, kind, pts, seg, cum, len: cum[cum.length - 1], cars: [], entry: null, exit: null, branch: null, merge: null };
}
// Point de la voie à l'abscisse u (j = segment de départ de la recherche, u croissant).
function laneAt(l, u, j0 = 1) {
  let j = Math.max(1, Math.min(j0, l.cum.length - 1));
  while (j > 1 && l.cum[j - 1] > u) j -= 1;
  while (j < l.cum.length - 1 && l.cum[j] < u) j += 1;
  const a = l.pts[j - 1], b = l.pts[j], sg = (l.cum[j] - l.cum[j - 1]) || 1;
  const t = Math.max(0, Math.min(1, (u - l.cum[j - 1]) / sg));
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, ux: (b.x - a.x) / sg, uy: (b.y - a.y) / sg, j };
}
// Abscisse du point de la voie le plus proche de (x, y).
function uOn(l, x, y) {
  let best = 0, bd = Infinity;
  for (let j = 1; j < l.pts.length; j += 1) {
    const a = l.pts[j - 1], b = l.pts[j], sg = (l.cum[j] - l.cum[j - 1]) || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / (sg * sg)));
    const d = Math.hypot(a.x + (b.x - a.x) * t - x, a.y + (b.y - a.y) * t - y);
    if (d < bd) { bd = d; best = l.cum[j - 1] + t * sg; }
  }
  return best;
}
const headOf = (ux, uy) => (Math.abs(ux) > Math.abs(uy) ? (ux > 0 ? 0 : 1) : (uy > 0 ? 2 : 3));
// Le raccord d'une voie à la rue, à son début (end = 0) ou à sa fin (end = 1) : la case,
// son centre (px monde) et le cap (0 = E, 1 = O, 2 = S, 3 = N, comme CM_DIRS).
function endCell(l, end, T) {
  const n = l.pts.length;
  const p = end ? l.pts[n - 1] : l.pts[0];
  const a = end ? l.pts[n - 2] : l.pts[0], b = end ? l.pts[n - 1] : l.pts[1];
  const gx = Math.floor(p.x / T), gy = Math.floor(p.y / T);
  return { gx, gy, dir: headOf(b.x - a.x, b.y - a.y), cx: (gx + 0.5) * T, cy: (gy + 0.5) * T };
}

function planSig(H, T) {
  const ic = H.interchange;
  return T + '|' + H.ax + '|' + H.banks.map((b) => [b.sign, b.y0, b.s0, b.s1, b.ramp].join(',')).join(';') + '|' + (ic ? ic.sign + ',' + ic.yc : '');
}

let gen = 0;
function buildPlan(H, T) {
  const W = (p) => ({ x: p.x * T, y: p.y * T, z: p.z * T });
  const ribs = [...H.banks.map((b) => bankRibbon(H, b)), ...loopRibbons(H)];
  const lanes = [];
  ribs.forEach((r, ri) => {
    if (!r.main) return;
    const n = r.pts.length - 1;
    r.lanes.forEach((lo, li) => {
      // décalage latéral du ruban (même calcul que l'ancien f(now) : normale gauche du tronçon)
      const off = r.pts.map((p, i) => {
        const a = r.pts[Math.min(i, n - 1)], b = r.pts[Math.min(i, n - 1) + 1];
        const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        return { x: (p.x - (b.y - a.y) / d * lo) * T, y: (p.y + (b.x - a.x) / d * lo) * T, z: p.z * T };
      });
      const dir = lo > 0 ? 1 : -1;
      const seg = off.slice(1).map((_, j) => (dir > 0 ? j : n - 1 - j));
      const l = mkLane(ri, 'main', dir > 0 ? off : off.reverse(), seg);
      l.lo = lo; l.li = li; l.key = 'main|' + H.banks[ri].sign + '|' + lo;
      l.entry = endCell(l, 0, T); l.exit = endCell(l, 1, T);
      lanes.push(l);
    });
  });
  const ic = H.interchange;
  const bi = ic ? H.banks.findIndex((b) => b.sign === ic.sign) : -1;
  ribs.forEach((r, ri) => {
    if (r.main || bi < 0) return;
    const side = r.id === 'loop-1' ? -1 : 1;
    // Le dernier point du ruban est un bout de rue posé À REBOURS du virage (il n'est
    // pas dessiné : au sol) ; la voie s'arrête au pied du cercle, sur la rue
    // transversale, et rejoint le centre de sa case — un pas de plus dans le même sens.
    const m = r.pts.length - 1;
    const deck = r.pts.slice(0, m).map(W);
    const bot = r.pts[m - 1];
    const c = { x: (Math.floor(bot.x) + 0.5) * T, y: (Math.floor(bot.y) + 0.5) * T, z: 0 };
    // La voie extérieure du bord d'où part la boucle (ouest : vers +y, lo > 0). Une boucle
    // qui ne retombe pas sur une chaussée de la flotte n'est pas parcourue.
    const outer = lanes.find((q) => q.ri === bi && q.lo === -side * 0.72);
    if (!outer || !CM.walkRoadSet || !CM.walkRoadSet.has(cityMapWalkRoadKey(Math.floor(bot.x), Math.floor(bot.y)))) return;
    if (ic.sign === -side) {
      const l = mkLane(ri, 'exit', [...deck, c], [...deck.slice(1).map((_, j) => j), m - 2]);
      l.exit = endCell(l, 1, T); l.key = 'exit|' + side;
      outer.branch = { lane: l, u: uOn(outer, deck[0].x, deck[0].y) };
      lanes.push(l);
    } else {
      const rev = deck.slice().reverse();
      const l = mkLane(ri, 'entry', [c, ...rev], [m - 2, ...rev.slice(1).map((_, j) => m - 2 - j)]);
      l.entry = endCell(l, 0, T); l.key = 'entry|' + side;
      l.merge = { lane: outer, u: uOn(outer, deck[0].x, deck[0].y) };
      lanes.push(l);
    }
  });
  // Les cases de l'artère SOUS LES RAMPES (tablier entre ras du sol et passage libre) : un
  // itinéraire de retour n'y passe jamais — la voiture traverserait la rampe. Sous le
  // tablier plein, la rue transversale reste un passage.
  const avoid = new Set();
  const ground = new Set(lanes.flatMap((l) => [l.entry, l.exit]).filter(Boolean).map((e) => cityMapWalkRoadKey(e.gx, e.gy)));
  for (const r of ribs) {
    if (!r.main) continue;
    for (const p of r.pts) {
      if (p.z <= 0.02 || p.z >= 1.45) continue;
      const y = Math.floor(p.y);
      for (const x of [H.ax, H.ax + 1]) { const k = cityMapWalkRoadKey(x, y); if (!ground.has(k)) avoid.add(k); }
    }
  }
  // Les voies qui descendent dans la même case de rue (les deux voies d'un sens).
  for (const l of lanes) l.rivals = l.exit ? lanes.filter((q) => q !== l && q.exit && q.exit.gx === l.exit.gx && q.exit.gy === l.exit.gy) : [];
  // Pieds d'accès, par case et cap d'arrivée : les voies qu'on peut y prendre.
  const entries = new Map();
  for (const l of lanes) {
    if (!l.entry) continue;
    const k = cityMapWalkRoadKey(l.entry.gx, l.entry.gy) * 4 + l.entry.dir;
    if (!entries.has(k)) entries.set(k, { ...l.entry, lanes: [] });
    entries.get(k).lanes.push(l);
  }
  gen += 1;
  return { H, T, lanes, avoid, entries, gen, target: 0, acc: 0, sig: planSig(H, T) };
}

// ── LES ITINÉRAIRES DE RETOUR ────────────────────────────────────────────────
// Une case où une voiture peut rouler : chaussée de la flotte, ni esplanade, ni parvis
// de merveille (les règles de vehicleChooseNext), ni dessous de rampe.
function drivable(P, x, y) {
  const k = cityMapWalkRoadKey(x, y);
  if (!CM.walkRoadSet || !CM.walkRoadSet.has(k) || P.avoid.has(k)) return false;
  if (CM.wonderWalkSet && CM.wonderWalkSet.has(k)) return false;
  const r = CM.layout && CM.layout.roadMap && CM.layout.roadMap.get(x + ',' + y);
  return !(r && r.rank === 'plaza');
}
// Plus court chemin de cases, sans demi-tour sur place (un véhicule ne recule pas), de
// (sx, sy) au cap sd jusqu'à un état (case, cap d'arrivée) qui satisfait `goal`, dans un
// carré de rayon `reach` autour du départ. Rend { cells: [[x, y], …] (départ exclu), x,
// y, d } ou null.
function bfs(P, sx, sy, sd, goal) {
  const R = HTR.reach;
  const key = (x, y, d) => cityMapWalkRoadKey(x, y) * 4 + d;
  const k0 = key(sx, sy, sd);
  const prev = new Map([[k0, -1]]);
  const q = [[sx, sy, sd, k0]];
  for (let h = 0; h < q.length; h += 1) {
    const [x, y, d, kk] = q[h];
    if (h > 0 && goal(x, y, d)) {
      const cells = [];
      for (let k = kk; k !== k0; k = prev.get(k)) { const c = Math.floor(k / 4); cells.push([Math.floor(c / 10000), c % 10000]); }
      return { cells: cells.reverse(), x, y, d };
    }
    for (let i = 0; i < 4; i += 1) {
      if (i === (d ^ 1)) continue;
      const nx = x + CM_DIRS[i][0], ny = y + CM_DIRS[i][1];
      if (Math.abs(nx - sx) > R || Math.abs(ny - sy) > R) continue;
      const nk = key(nx, ny, i);
      if (prev.has(nk) || !drivable(P, nx, ny) || !roadStepAllowed(x, y, i)) continue;
      prev.set(nk, kk);
      q.push([nx, ny, i, nk]);
    }
  }
  return null;
}
// L'itinéraire d'une voiture qui descend en (gx, gy) au cap d : vers le pied d'accès le
// plus proche ; une fois sur deux (detour) par une case tirée à 3-6 cases, hors de
// l'artère — un tour de pâté plutôt qu'un demi-tour au carrefour, borné à DETOUR_MAX
// cases (les rues roulent deux fois moins vite que le tablier : un long détour y
// retiendrait l'effectif). null : aucun accès à portée (elle reste alors dans la
// flotte, comme les autres).
const DETOUR_MAX = 24;
function routeFor(P, v, gx, gy, d) {
  const isEntry = (x, y, dd) => P.entries.has(cityMapWalkRoadKey(x, y) * 4 + dd);
  const n = v.hwy.id * 7 + v.hwy.n;
  if (h01(n * 31 + 5) < HTR.detour) {
    const ax = P.H.ax, cand = [];
    for (let y = gy - 6; y <= gy + 6; y += 1) {
      for (let x = gx - 6; x <= gx + 6; x += 1) {
        if (Math.max(Math.abs(x - gx), Math.abs(y - gy)) < 3 || x === ax || x === ax + 1) continue;
        if (drivable(P, x, y)) cand.push([x, y]);
      }
    }
    if (cand.length) {
      const w = cand[Math.floor(h01(n * 17 + 3) * cand.length)];
      const a = bfs(P, gx, gy, d, (x, y) => x === w[0] && y === w[1]);
      const b = a && bfs(P, a.x, a.y, a.d, isEntry);
      if (b && a.cells.length + b.cells.length <= DETOUR_MAX) return { cells: a.cells.concat(b.cells), entry: P.entries.get(cityMapWalkRoadKey(b.x, b.y) * 4 + b.d) };
    }
  }
  const b = bfs(P, gx, gy, d, isEntry);
  return b ? { cells: b.cells, entry: P.entries.get(cityMapWalkRoadKey(b.x, b.y) * 4 + b.d) } : null;
}
// Donne (ou redonne) à une voiture des rues son chemin de retour ; sans chemin, elle
// quitte l'effectif de l'autoroute et devient une voiture de la flotte comme une autre.
function giveRoute(P, v) {
  const rt = routeFor(P, v, v.gx, v.gy, v.dir);
  v.hwy.wait = 0;
  if (rt) { v.route = rt.cells; v.hwy.entry = rt.entry; return true; }
  HTS.lost += 1; HTS.lastLost = [v.gx, v.gy, v.dir];
  v.route = null; v.hwy = null;
  return false;
}

// ── LES VOITURES ─────────────────────────────────────────────────────────────
let serial = 0;
function mkCar(P, id, band) {
  const type = CAR_TYPES[Math.floor(h01(id * 17) * CAR_TYPES.length)];
  serial += 1;
  const v = {
    x: 0, y: 0, gx: 0, gy: 0, tx: 0, ty: 0, dir: 0, type, skin: vehSkinFor(type, id * 2654435761, band) || undefined,
    speed: streetSpeed(type, id), col: '#6f8490', rollDist: 0, fade: 1, _lox: 0, _loy: 0, parkT: 0, pauseT: 0, goal: null, route: null,
    hwy: { gen: P.gen, id: serial, seed: id, band, n: 0, entry: null, wait: 0 },
  };
  return v;
}
// Pose la voiture `v` sur la voie `l` à l'abscisse u ; (fx, fy) = là où elle était (px
// monde) — son écart à la voie (de travers, et le peu qu'il lui restait à faire jusqu'au
// pied) se fond sur BLEND tuiles.
function putOnLane(l, v, u, fx, fy, T) {
  const p = laneAt(l, u);
  const c = { v, u, bu: u, dl: 0, da: 0, j: p.j, wait: 0, x: 0, y: 0, z: 0, hx: p.ux, hy: p.uy, seg: 0 };
  if (fx != null) { c.dl = (fx - p.x) * -p.uy + (fy - p.y) * p.ux; c.da = (fx - p.x) * p.ux + (fy - p.y) * p.uy; }
  v._lox = 0; v._loy = 0; v.route = null; v.parkT = 0;
  if (v.hwy) { v.hwy.entry = null; v.hwy.wait = 0; }
  let k = l.cars.length;
  while (k > 0 && l.cars[k - 1].u < u) k -= 1;
  l.cars.splice(k, 0, c);
  place(l, c, T);
  return c;
}
// Position dessinée (cache lu par isoHighway) : le point de la voie, plus l'écart
// d'entrée qui se fond.
function place(l, c, T) {
  const p = laneAt(l, c.u, c.j);
  c.j = p.j;
  const f = c.dl || c.da ? Math.max(0, 1 - (c.u - c.bu) / (BLEND * T)) : 0;
  if (!f) { c.dl = 0; c.da = 0; }
  c.x = p.x + (-p.uy * c.dl + p.ux * c.da) * f; c.y = p.y + (p.ux * c.dl + p.uy * c.da) * f; c.z = p.z;
  c.hx = p.ux; c.hy = p.uy; c.seg = l.seg[Math.min(l.seg.length - 1, p.j - 1)];
}
// Une voie a-t-elle la place de recevoir une voiture en u ? (devant : gap ; derrière :
// un peu plus, celui qui arrive roule à la même allure.)
function roomAt(l, u, T) {
  const g = HTR.gap * T;
  for (const c of l.cars) if (c.u > u - 1.3 * g && c.u < u + g) return false;
  return true;
}
// Le pied d'une sortie (x, y) est-il libre (aucune voiture des rues à moins de CLEAR) ?
function exitClear(x, y, T) {
  const r = CLEAR * T;
  for (const v of CM.vehicles || []) {
    if (v.type === 'drone') continue;
    const vx = v.x + (v._lox || 0) * T, vy = v.y + (v._loy || 0) * T;
    if (Math.abs(vx - x) < r && Math.abs(vy - y) < r) return false;
  }
  return true;
}
// La voiture `c` quitte la voie `l` par sa sortie : elle entre dans la flotte, à la case
// du pied de la sortie, à sa file (l'écart à la file de la rue se résorbe dans
// updateVehicles), avec son itinéraire de retour.
function handOff(P, l, c, T) {
  const v = c.v, e = l.exit, end = l.pts[l.pts.length - 1];
  v.gx = e.gx; v.gy = e.gy; v.dir = e.dir;
  v.x = v.tx = e.cx; v.y = v.ty = e.cy;
  v._lox = (end.x - e.cx) / T; v._loy = (end.y - e.cy) / T;
  v.parkT = 0; v.pauseT = 0; v.fade = 1; v.goal = null;
  v.hwy.n += 1;
  giveRoute(P, v);
  CM.vehicles.push(v);
}

// La voie avance d'un pas : allure (rue → tablier au pied des rampes), suivi, puis les
// raccords de la tête (sortie, fusion) et les bretelles de sortie au passage.
function stepLane(P, l, dt, T, moved) {
  const cars = l.cars;
  const gap = HTR.gap * T, vDeck = HTR.speed * T, ease = EASE * T;
  const gone = [];
  for (let k = 0; k < cars.length; k += 1) {
    const c = cars[k];
    if (moved.has(c)) continue;
    moved.add(c);
    const vs = Math.min(vDeck, c.v.speed || vDeck);
    let sp = vDeck;
    if (l.entry && c.u < ease) sp = vs + (vDeck - vs) * (c.u / ease);
    if (l.exit && l.len - c.u < ease) sp = Math.min(sp, vs + (vDeck - vs) * Math.max(0, l.len - c.u) / ease);
    // Suivi : l'allure tombe avec l'écart au précédent encore sur la voie (ceux qui en sont
    // partis cette frame ne gênent plus) — nulle à `gap`, celle de l'écart en trop parcouru
    // en HEADWAY au-delà. Une file arrêtée repart voiture après voiture, pas d'un bloc.
    for (let a = k - 1; a >= 0; a -= 1) {
      if (gone.includes(cars[a])) continue;
      const room = cars[a].u - c.u - gap;
      sp = Math.min(sp, Math.max(0, room) / HEADWAY);
      sp = Math.min(sp, Math.max(0, room) / dt);
      break;
    }
    let nu = c.u + sp * dt;
    // tête d'une SORTIE : au pied, il faut la place de descendre — et les deux voies d'un
    // sens qui descendent dans la même rue passent chacune leur tour (celle qui attend
    // depuis le plus longtemps d'abord : sans ça, la voie servie la première affamait
    // l'autre, qui se remplissait jusqu'à la bretelle).
    const yieldTo = l.exit && nu > l.len - T && l.rivals.some((q) => { const h = q.cars[0]; return h && q.len - h.u < T && h.wait > c.wait; });
    if (l.exit && nu > l.len - T && (yieldTo || !exitClear(l.pts[l.pts.length - 1].x, l.pts[l.pts.length - 1].y, T))) {
      c.wait += dt;
      if (c.wait < FORCE) nu = Math.min(nu, Math.max(c.u, l.len - T));
      else if (c.wait - dt < FORCE) HTS.forced += 1;
    } else c.wait = 0;
    nu = Math.max(c.u, nu);
    // bretelle de sortie au passage (voie extérieure) : une part des voitures la prend
    const br = l.branch;
    if (br && c.u < br.u && nu >= br.u && h01(c.v.hwy.id * 13 + c.v.hwy.n * 7) < HTR.exitP && roomAt(br.lane, 0, T)) {
      gone.push(c);
      c.v.hwy.n += 1;
      moved.add(putOnLane(br.lane, c.v, Math.min(nu - br.u, br.lane.len), c.x, c.y, T));
      continue;
    }
    c.v.rollDist = (c.v.rollDist || 0) + (nu - c.u);
    c.u = nu;
    if (c.u >= l.len) {
      if (l.exit) { gone.push(c); handOff(P, l, c, T); continue; }
      if (l.merge) {
        const m = l.merge;
        if (roomAt(m.lane, m.u, T)) {
          gone.push(c);
          moved.add(putOnLane(m.lane, c.v, m.u, c.x, c.y, T));
          continue;
        }
        c.u = l.len;
      }
    }
    place(l, c, T);
  }
  if (gone.length) l.cars = cars.filter((c) => !gone.includes(c));
}

// ── LE SEMIS, L'ENTRETIEN ────────────────────────────────────────────────────
// Le tirage de l'ancien f(now) (pas et trous par voie, au même numéro), éclairci de
// `share` : les voitures partent de là où le tablier les montrait. `put` = false : le
// compte seul (l'effectif voulu d'un plan qui en remplace un autre).
function seed(P, band, T, put = true) {
  let n0 = 0;
  for (const l of P.lanes) {
    const ri = l.ri, li = l.li || 0;
    const gap = (1.4 + h01(ri * 31 + li * 7) * 1.2) * T;
    const n = Math.floor(l.len / gap);
    for (let i = 0; i < n; i += 1) {
      const id = ri * 1000 + li * 100 + i;
      if (h01(id * 13) < 0.3 * (2 - HTR.cars) || h01(id * 29) >= HTR.share) continue;
      const u = (i * gap + h01(id * 3) * gap * 0.5) % l.len;
      if (!put) { n0 += 1; continue; }
      if (!roomAt(l, u, T)) continue;
      putOnLane(l, mkCar(P, id, band), u, null, null, T);
      n0 += 1;
    }
  }
  P.target = n0;
}
// Un plan qui en remplace un autre (la ville grandit, une rive s'allonge) : chaque
// voiture du tablier passe sur la voie de même rôle, au plus près de là où elle roulait ;
// celle qui en tomberait loin (rampe déplacée) se perd — l'entretien la recomblera hors
// champ. Celles des rues sont reprises par la boucle (génération).
function migrate(P0, P, T) {
  for (const l0 of P0.lanes) {
    const l = P.lanes.find((q) => q.key === l0.key);
    if (!l) continue;
    for (const c of l0.cars) {
      const u = uOn(l, c.x, c.y), p = laneAt(l, u);
      if (Math.hypot(p.x - c.x, p.y - c.y) > 0.3 * T || Math.abs(p.z - c.z) > 0.2 * T || !roomAt(l, u, T)) continue;
      c.v.hwy.gen = P.gen;
      putOnLane(l, c.v, u, c.x, c.y, T);
    }
  }
}
// Un manque se recomble par un pied d'accès HORS CHAMP (une voiture arrive de la rue
// qu'on ne voit pas) : jamais sous les yeux du joueur.
function topUp(P, band, T) {
  if (!CM.cw || !CM.cam) return;
  const mg = 2 * T * (CM.cam.zoom || 1);
  for (const l of P.lanes) {
    if (!l.entry || !roomAt(l, 0, T)) continue;
    const s = worldToScreen(l.pts[0].x, l.pts[0].y, 0);
    if (s.x > -mg && s.x < CM.cw + mg && s.y > -mg && s.y < CM.ch + mg) continue;
    putOnLane(l, mkCar(P, 5000 + serial, band), 0, null, null, T);
    HTS.topUp += 1;
    return;
  }
}
// Plus d'autoroute (ville en ruine — la flotte des rues aussi s'y vide, MORT-11 —, plan
// parti avec un nouveau cycle, molette) : le tablier se vide, et celles qui roulaient en
// ville avec lui.
function dropPlan() {
  const veh = CM.vehicles || [];
  for (let i = veh.length - 1; i >= 0; i -= 1) if (veh[i].hwy) veh.splice(i, 1);
  P = null;
}

export function updateHighwayTraffic(dt) {
  const L = CM.layout, H = L && L.highway, T = CM.TILE;
  // = elevDecay (iso/isoElevated.js) : en ruine ou pendant la chute, le tablier est vide.
  const decay = CM.collapseAt ? 1 : CM.frameRuined ? 0.65 : 0;
  if (!HTR.on || !(HTR.cars > 0) || !H || decay >= 0.5 || !CM.walkRoadSet || !CM.vehicles) { if (P) dropPlan(); return; }
  const band = (L.counts && L.counts.eraBand) | 0;
  if (!P || P.sig !== planSig(H, T)) {
    const P0 = P;
    P = buildPlan(H, T);
    seed(P, band, T, !P0);
    if (P0) migrate(P0, P, T);
  }
  P.H = H;
  // Pas de pas pendant un cliché (CM.captureFrame) : un cliché « sans vie » vide la flotte
  // le temps de la frame et ne la rend que si rien ne l'a regarnie — une voiture qui
  // descendrait du tablier à ce moment-là la ferait perdre jusqu'au prochain recalcul.
  if (!(dt > 0) || CM.capture) return;
  const reskin = (v) => { if (v.hwy.band !== band) { v.hwy.band = band; v.skin = vehSkinFor(v.type, v.hwy.seed * 2654435761, band) || undefined; } };
  // 1. Les rues : arrivées au pied d'une rampe d'accès, chemins perdus, voitures d'un
  //    plan précédent (recalcul, retour de la chute) reprises.
  const veh = CM.vehicles;
  const moved = new Set();   // déjà avancées cette frame (dans la rue, ou d'une voie à l'autre)
  for (let i = veh.length - 1; i >= 0; i -= 1) {
    const v = veh[i];
    if (!v.hwy) continue;
    if (v.hwy.gen !== P.gen) { v.hwy.gen = P.gen; v.route = null; }
    reskin(v);
    if (!v.route && !giveRoute(P, v)) continue;
    const e = v.hwy.entry;
    if (v.route.length || !e || v.gx !== e.gx || v.gy !== e.gy || Math.abs(v.x - e.cx) > 3 || Math.abs(v.y - e.cy) > 3) continue;
    // au centre de la case du pied : parmi les voies qui ont la place, la moins chargée
    // (la voie extérieure reçoit déjà la bretelle d'entrée : à la place la plus libre au
    // pied, elle se remplissait jusqu'à faire file à la sortie suivante)
    let best = null;
    for (const l of e.lanes) if (roomAt(l, 0, T) && (!best || l.cars.length < best.cars.length)) best = l;
    if (best) {
      veh.splice(i, 1);
      moved.add(putOnLane(best, v, 0, v.x + (v._lox || 0) * T, v.y + (v._loy || 0) * T, T));
    } else if ((v.hwy.wait += dt) > 1.2) {
      // voie d'accès bouchée : un autre tour
      v.hwy.n += 1;
      giveRoute(P, v);
    }
  }
  // 2. Les voies.
  let deck = 0;
  for (const l of P.lanes) {
    stepLane(P, l, dt, T, moved);
    for (const c of l.cars) reskin(c.v);
    deck += l.cars.length;
  }
  // 3. Un manque (véhicule perdu) : recomblé hors champ, une voiture par demi-seconde
  //    (compté APRÈS les voies : celles qui viennent d'en descendre sont en ville).
  P.acc += dt;
  if (P.acc >= 0.5) {
    P.acc = 0;
    let street = 0;
    for (const v of veh) if (v.hwy) street += 1;
    if (deck + street < P.target) topUp(P, band, T);
  }
}

// Les voies et leurs voitures, pour le dessin (iso/isoHighway.js) ; null sans autoroute.
export function highwayTrafficLanes() { return P ? P.lanes : null; }

if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__highwayTraffic = (o) => {
    if (o) { Object.assign(HTR, o); if (P) { dropPlan(); } }
    const lanes = P ? P.lanes : [];
    return { ...HTR, lanes: lanes.map((l) => ({ kind: l.kind, ri: l.ri, lo: l.lo, len: l.len, cars: l.cars.length, entry: l.entry, exit: l.exit })), street: (CM.vehicles || []).filter((v) => v.hwy).length, target: P ? P.target : 0, stats: { ...HTS } };
  };
}
