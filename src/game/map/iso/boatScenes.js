"use strict";
// ── LES PETITES SCÈNES DU FLEUVE (docs/PLAN-BATEAUX.md §5, lots 5-6) ───────────
//
// Ce qui vit AU BORD de l'eau autour de la flotte, trié avec la ville par le
// peintre (items 'fleetScene') :
//   · les deux EMBARCADÈRES du passeur, et les voyageurs qui attendent le bac sur
//     celui d'en face ;
//   · le PONTON DE LA NAVETTE DES PLAISIRS (sa lanterne rouge, allumée la nuit) et
//     ceux qui attendent la navette quand elle est partie.
// ⛔ La BÊTE DE HALAGE du chaland, qui vivait ici, est RETIRÉE (Raph, 2026-10-03 :
// « plus de halage du tout ») : elle marchait en haut du quai, dans la rue, sa corde
// balayant le mur et les escaliers. Le chaland avance à la perche (makeBarge).
// Les positions viennent de la sim (riverFleet) : ici on ne fait que dessiner.

import { CM } from '../layout.js';
import { worldToScreen } from './projection.js';
import { isoUnitDepth } from './isoUnits.js';
import { agentSetForBand, agentSpecFor, drawNamedAgentIso, AGENT_SCALE } from '../agents.js';
import { focusMark, drawFocusRingAt, noteSceneFigure, sceneRingWidth } from '../citizenFocus.js';
import { ribbonAt, ferryReach, FERRY_TIP, FERRY_WALK, ferryBoardEl } from '../riverFleet.js';
import { drawBoat } from './boatKit.js';
import { fleetFor, BOAT_MODELS } from './boatKits.js';
import { pontoonAt } from './boatLandings.js';
import { repaintQuayRect } from './isoQuay.js';
import { h32 } from './boatBake.js';
import { FLOAT_W } from './boatFamilies.js';
import { rippleField, noteRipples } from './waterRipples.js';


// Un embarcadère : origine au bord d'eau, cap vers le large.
function landingPose(site, side, sm) {
  const r = ribbonAt(sm, site.t);
  const x = r.x + r.nx * side * site.hw, y = r.y + r.ny * side * site.hw;
  return { x, y, th: Math.atan2(-side * r.ny, -side * r.nx), dx: -side * r.nx, dy: -side * r.ny, ax: r.tx, ay: r.ty };
}

// L'embarcadère de cette rive : celui de l'ère, son tablier ALLONGÉ jusqu'au pied du
// mur de quai quand on en voit la face (le bac s'arrête là, cf. riverFleet.ferryLat).
// Rend { id, ext } — ext = px d'art de tablier en plus. Modèle dérivé enregistré une
// fois (le peintre ne connaît que BOAT_MODELS).
function landingFor(base, site, side) {
  const ext = Math.round((ferryReach(site, side) - FERRY_TIP) * 32);
  if (ext <= 0) return { id: base, ext: 0 };
  const id = base + '@' + ext;
  if (!BOAT_MODELS[id]) {
    const M0 = BOAT_MODELS[base];
    if (!M0 || !M0.withReach) return { id: base, ext: 0 };
    BOAT_MODELS[id] = M0.withReach(ext);
  }
  return { id, ext };
}

// LES VOYAGEURS EXISTENT LE TEMPS DE LEUR TRAVERSÉE (fiche d'habitant,
// citizenFocus.js) : un objet par voyageur et par `trip`, gardé d'une frame à
// l'autre — sinon on ne pourrait ni le désigner ni le suivre à bord. Ils portent
// leur bac et leur traversée : citizenFocus en déduit qu'ils sont montés à bord
// (trip + 1), puis qu'ils ont débarqué (trip + 2). Gardés : la traversée en cours
// ET les deux d'avant — ceux qui MONTENT (trip − 1) et ceux qui DESCENDENT
// (trip − 2, ferryWalkers) sont les mêmes personnes que celles qui attendaient
// (mêmes tirages que partySpecs) : on les retrouve, on ne les recrée pas.
let _party = { ferry: null, trips: new Map() };
function traveller(ferry, k, trip = ferry.trip | 0) {
  if (_party.ferry !== ferry) _party = { ferry, trips: new Map() };
  let list = _party.trips.get(trip);
  if (!list) {
    list = [];
    _party.trips.set(trip, list);
    for (const t of _party.trips.keys()) if (t < (ferry.trip | 0) - 3) _party.trips.delete(t);
  }
  return list[k] || (list[k] = {
    charType: h32(trip, 73, k) % 2, variant: h32(trip, 74, k) % 3,
    figSeed: h32(trip, 75, k), ferryShip: ferry, trip, dir: 0,
  });
}
// Ceux qui attendent la NAVETTE DES PLAISIRS : le temps de leur attente (ils
// partent avec elle, la cuisson les assoit à bord).
let _shuttleParty = { shuttle: null, trip: -1, list: [] };
function shuttleTraveller(shuttle, trip, k) {
  if (_shuttleParty.shuttle !== shuttle || _shuttleParty.trip !== trip) _shuttleParty = { shuttle, trip, list: [] };
  return _shuttleParty.list[k] || (_shuttleParty.list[k] = {
    charType: h32(trip, 83, k) % 2, variant: h32(trip, 84, k) % 3,
    figSeed: h32(trip, 85, k), sceneTag: 'navette', dir: 0,
  });
}

// LES PONTONS FLOTTANTS (iso/boatLandings.js) : celui de l'embarcadère de l'ère, à sa
// longueur, avec ou sans la lanterne rouge de la navette des Plaisirs. Modèles dérivés
// enregistrés une fois (le peintre ne connaît que BOAT_MODELS).
function pontoonModel(base, len, lantern) {
  const M0 = BOAT_MODELS[base];
  if (!M0 || !M0.asPontoon) return null;
  const id = base + '!ponton' + len + (lantern ? 'L' : '');
  if (!BOAT_MODELS[id]) BOAT_MODELS[id] = M0.asPontoon(len, lantern);
  return id;
}
// Item d'un ponton, trié à son milieu.
function pontoonItem(P, id) {
  const T = CM.TILE, m = pontoonAt(P, P.len / 2);
  const pose = { x: P.x, y: P.y, th: Math.atan2(P.dy, P.dx), dx: P.dx, dy: P.dy, ax: P.ax, ay: P.ay };
  if (P.sink) Object.assign(pose, { sink: P.sink, ex: P.ex, ey: P.ey });
  return { d: isoUnitDepth(m.x * T, m.y * T), kind: 'fleetScene', what: 'landing', P: pose, landing: id };
}
// Le QUAI DEVANT un ponton enfoncé (rive au mur caché) : trié après lui et après ceux
// qui l'attendent, il repose le garde-corps par-dessus (« la barrière doit passer
// devant le ponton », Raph).
function quayFrontItem(P) {
  const T = CM.TILE, m = pontoonAt(P, P.len / 2);
  return { d: isoUnitDepth(m.x * T, m.y * T) + 0.05, kind: 'fleetScene', what: 'quayFront', P };
}
// Ceux qui attendent sur un ponton : debout sur son plancher, le long de son axe, le
// regard vers le large ; peints APRÈS lui (trié à son milieu, il les couvrait).
function waitingOnPontoon(P, n, seed, band, mk) {
  const T = CM.TILE, out = [];
  const pd = pontoonItem(P, null).d;
  const vx = P.kind === 'stair' ? P.ax : P.dx, vy = P.kind === 'stair' ? P.ay : P.dy;
  const dir = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 0 : 1) : (vy > 0 ? 2 : 3);
  for (let k = 0; k < n; k += 1) {
    // Sur la part VISIBLE du ponton (au bord d'un mur caché, sa racine est sous le quai).
    const a = P.kind === 'stair' ? P.len * 0.25 + 7 * k : (P.hid || 0) * 32 + 5 + 5 * k;
    const c = ((h32(seed, 82, k) % 3) - 1) * 1.6;
    const p = pontoonAt(P, Math.min(P.len - 3, a), c);
    const it = { d: Math.max(isoUnitDepth(p.x * T, p.y * T), pd) + 0.01 + k * 1e-3, kind: 'fleetScene', what: 'traveller', x: p.x, y: p.y, z: 2.3 - (P.sink || 0), dir, band, ...mk(k) };
    if (it.q) it.q.dir = dir;
    out.push(it);
  }
  return out;
}

// Le ponton de la NAVETTE DES PLAISIRS sans quai à son bord : l'embarcadère de l'ère
// avec sa lanterne rouge (makeLanding.withLantern), allongé comme celui du passeur.
function shuttleLanding(base, C) {
  const M0 = BOAT_MODELS[base];
  if (!M0 || !M0.withLantern) return { id: base, ext: 0 };
  const lid = base + '!lanterne';
  if (!BOAT_MODELS[lid]) BOAT_MODELS[lid] = M0.withLantern();
  const ext = Math.round(((C.reach || FERRY_TIP) - FERRY_TIP) * 32);
  if (ext <= 0) return { id: lid, ext: 0 };
  const id = lid + '@' + ext;
  if (!BOAT_MODELS[id]) BOAT_MODELS[id] = BOAT_MODELS[lid].withReach(ext);
  return { id, ext };
}

// ── MONTER, DESCENDRE (docs/PLAN-COMPORTEMENTS.md, lot 5) ──────────────────────
// Personne ne montait ni ne descendait : à l'accostage, ceux qui attendaient
// disparaissaient d'un coup et le pont se remplissait d'autres gens. Désormais LES
// MÊMES : le groupe qui attend au voyage `trip` (charType/variant tirés de trip) est
// celui qu'on voit à bord au voyage suivant (sh._passNames → boatKit, places de voyageur
// du bac), et pendant l'escale ceux qui arrivent DESCENDENT à pied jusqu'à la rive où
// ils s'effacent, puis ceux qui attendaient MONTENT chacun à sa place — le pont cuit
// ne les montre qu'une fois tous arrivés (riverFleet.ferryDeckHidden).
const dirOf = (vx, vy) => (Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 0 : 1) : (vy > 0 ? 2 : 3));
// Combien voyagent au voyage `trip` : pas plus que de places de voyageur sur le pont.
function partySize(ferry, trip) {
  const slots = (ferry._deckSlots || []).length || 3;
  return Math.min(slots, 1 + (h32(trip, 71, 3) % 3));
}
function partySpecs(band, trip, n) {
  const set = agentSetForBand(band), out = [];
  for (let k = 0; k < n; k += 1) {
    const sp = agentSpecFor(set, h32(trip, 73, k) % 2, h32(trip, 74, k) % 3);
    if (sp) out.push({ name: sp.name, scale: sp.scale });
  }
  return out;
}
function ferryWalkers(ferry, site, sm, band, pont, el) {
  const out = [], P = ferry._defer, slots = ferry._deckSlots;
  if (!P || !slots || !slots.length) return out;
  const T = CM.TILE, W = FERRY_WALK, trip = ferry.trip | 0, side = ferry.ferrySide;
  const k32 = T / 32;
  const deck = (j) => { const q = slots[j % slots.length]; return { x: (P.wx + q.dx * k32) / T, y: (P.wy + q.dy * k32) / T, z: q.h }; };
  const hb = T * 0.30 * (ferry._len || 1), hullD = isoUnitDepth(P.wx + hb, P.wy + hb);
  const ux = Math.cos(P.thW), uy = Math.sin(P.thW);
  const L2 = (ferry._len || 0.95) / 2 + 0.05, B2 = (ferry._beam || 0.47) / 2 + 0.08;
  const onDeck = (x, y) => {
    const dx = x - P.wx / T, dy = y - P.wy / T;
    return Math.abs(dx * ux + dy * uy) < L2 && Math.abs(-dx * uy + dy * ux) < B2;
  };
  const pp = pont(side), lp = pp ? null : landingPose(site, side, sm);
  const landD = pp ? pontoonItem(pp.P, null).d : isoUnitDepth((lp.x + lp.dx * 0.1) * T, (lp.y + lp.dy * 0.1) * T);
  // Le bout de l'embarcadère côté rive : on y arrive, on s'en va par là.
  const root = pp
    ? { ...pontoonAt(pp.P, pp.P.kind === 'stair' ? 2 : (pp.P.hid || 0) * 32 + 2, 0), z: 2.3 - (pp.P.sink || 0) }
    : { x: lp.x - lp.dx * 0.3, y: lp.y - lp.dy * 0.3, z: 4.2 };
  // Où attendait le groupe qui monte (mêmes tirages que l'attente, au voyage trip − 1).
  const spot = (k) => {
    if (pp) {
      const Q = pp.P, a = Q.kind === 'stair' ? Q.len * 0.25 + 7 * k : (Q.hid || 0) * 32 + 5 + 5 * k;
      const q = pontoonAt(Q, Math.min(Q.len - 3, a), ((h32(trip - 1, 82, k) % 3) - 1) * 1.6);
      return { x: q.x, y: q.y, z: 2.3 - (Q.sink || 0) };
    }
    const a = -0.18 + 0.12 * k, c = ((h32(trip - 1, 72, k) % 5) - 2) * 0.07;
    return { x: lp.x + lp.dx * a + lp.ax * c, y: lp.y + lp.dy * a + lp.ay * c, z: 4.2 };
  };
  const walk = (A, B, t0) => {
    const len = Math.hypot(B.x - A.x, B.y - A.y), dur = len / W.speed;
    const u = dur > 0 ? Math.max(0, Math.min(1, (el - t0) / dur)) : 1;
    return { u, end: t0 + dur, x: A.x + (B.x - A.x) * u, y: A.y + (B.y - A.y) * u, z: A.z + (B.z - A.z) * u,
      walking: el > t0 && u < 1, dist: u * len * T, dir: dirOf(B.x - A.x, B.y - A.y) };
  };
  // `q` : la personne (fiche d'habitant) — celle qui attendait, retrouvée par sa traversée.
  const push = (sp, w, k, alpha, salt, q) => {
    const own = isoUnitDepth(w.x * T, w.y * T);
    const d = onDeck(w.x, w.y) ? Math.max(own, hullD) + 0.012 : Math.max(own, landD) + 0.01;
    if (q) { q.dir = w.dir; q.walking = w.walking; q.walkDist = w.dist; }
    out.push({ d: d + k * 1e-4, kind: 'fleetScene', what: 'traveller', x: w.x, y: w.y, z: w.z, dir: w.dir, band,
      name: sp.name, scale: sp.scale, walking: w.walking, dist: w.dist, phase: (h32(trip, salt, k) % 97) / 97, alpha, q });
  };
  // Ceux qui ARRIVENT (à bord pendant la traversée) : ils descendent, s'en vont.
  const offN = partySize(ferry, trip - 2), off = partySpecs(band, trip - 2, offN);
  off.forEach((sp, k) => {
    const w = walk(deck(k), root, W.off0 + k * W.gap);
    if (w.u >= 1) return;
    push(sp, w, k, w.u > 0.7 ? (1 - w.u) / 0.3 : 1, 77, traveller(ferry, k, trip - 2));
  });
  // Ceux qui MONTENT (ils attendaient ici) : après les arrivants, chacun à sa place.
  const on0 = W.off0 + Math.max(0, offN - 1) * W.gap + W.pause;
  const onN = partySize(ferry, trip - 1), on = partySpecs(band, trip - 1, onN);
  const ws = on.map((sp, k) => walk(spot(k), deck(k), on0 + k * W.gap));
  const last = ws.reduce((m, w) => Math.max(m, w.end), 0);
  // Le pont montre ses voyageurs quand le dernier est arrivé (jamais après la fin de l'escale).
  ferry._revealAt = Math.min(last + 0.2, Math.max(1, (ferry.boardD || W.reveal) - 0.4));
  if (el < ferry._revealAt) on.forEach((sp, k) => push(sp, ws[k], k, 1, 78, traveller(ferry, k, trip - 1)));
  return out;
}

// Les items de la frame. `band` = bande d'ère (habits des gens).
export function fleetSceneItems(now, band) {
  const out = [];
  const L = CM.layout, rv = L && L.river;
  if (!rv || !rv.present || !rv.samples || rv.samples.length < 2) return out;
  const sm = rv.samples, T = CM.TILE;
  const fl = fleetFor(band);
  const base = (fl && fl.landing) || 'embarcadere';
  const site = CM.ferrySite;
  const ferry = site ? (CM.ships || []).find((s) => s.kind === 'ferry') : null;
  if (site && ferry) {
    // Chaque rive : un ponton flottant (escalier du quai, ou bord d'une rive au mur
    // caché — cf. cityMapRuntime), sinon l'embarcadère sur pieux.
    const pont = (side) => {
      const P = site.landings && site.landings[side];
      const id = P ? pontoonModel(base, P.len, false) : null;
      return id ? { P, id } : null;
    };
    for (const side of [-1, 1]) {
      const pp = pont(side);
      if (pp) {
        out.push(pontoonItem(pp.P, pp.id));
        if (pp.P.sink) out.push(quayFrontItem(pp.P));
        continue;
      }
      const P = landingPose(site, side, sm);
      const lg = landingFor(base, site, side);
      // Le tablier s'avance de 10 px dans l'eau (plus son allonge) : sa profondeur est
      // celle de son milieu.
      const m = 0.1 + lg.ext / 64;
      out.push({ d: isoUnitDepth((P.x + P.dx * m) * T, (P.y + P.dy * m) * T), kind: 'fleetScene', what: 'landing', P, landing: lg.id });
    }
    // Les VOYAGEURS attendent sur l'embarcadère que le bac va chercher : celui d'en
    // face quand il est à quai, sa destination quand il traverse.
    const waitSide = ferry.state === 'cross' ? ferry.ferrySide : -ferry.ferrySide;
    // Pas plus que de places de voyageur sur le pont : ce sont EUX qu'on y verra (lot 5).
    const n = partySize(ferry, ferry.trip | 0);
    const w0 = out.length;
    // Combien montent à chaque traversée : la fiche du bac dit combien il en porte.
    if (!ferry._parties) ferry._parties = {};
    ferry._parties[ferry.trip | 0] = n;
    delete ferry._parties[(ferry.trip | 0) - 3];
    const pw = pont(waitSide);
    if (pw) {
      out.push(...waitingOnPontoon(pw.P, n, ferry.trip | 0, band, (k) => {
        const q = traveller(ferry, k);
        return { charType: q.charType, variant: q.variant, q };
      }));
    } else {
      const P = landingPose(site, waitSide, sm);
      for (let k = 0; k < n; k += 1) {
        const a = -0.18 + 0.12 * k, c = ((h32(ferry.trip | 0, 72, k) % 5) - 2) * 0.07;
        const x = P.x + P.dx * a + P.ax * c, y = P.y + P.dy * a + P.ay * c;
        // Ils regardent l'eau (le bac qui vient).
        const dir = Math.abs(P.dx) > Math.abs(P.dy) ? (P.dx > 0 ? 0 : 1) : (P.dy > 0 ? 2 : 3);
        const q = traveller(ferry, k);
        q.dir = dir;
        out.push({
          d: isoUnitDepth(x * T, y * T) + 0.004, kind: 'fleetScene', what: 'traveller',
          x, y, z: 4.2, dir, band, charType: q.charType, variant: q.variant, q,
        });
      }
    }
    // Chacun respire à son rythme ; le groupe suivant arrive sur l'autre rive en fondu
    // à l'accostage (il ne surgit plus). À bord : ceux qui attendaient au voyage d'avant.
    const elW = ferryBoardEl(ferry);
    for (let k = w0; k < out.length; k += 1) {
      out[k].phase = (h32(ferry.trip | 0, 76, k - w0) % 97) / 97;
      if (elW < 1.5) out[k].alpha = elW / 1.5;
    }
    ferry._passNames = partySpecs(band, (ferry.trip | 0) - 1, partySize(ferry, (ferry.trip | 0) - 1));
    if (elW < Infinity) out.push(...ferryWalkers(ferry, site, sm, band, pont, elW));
  }
  // LA NAVETTE DES PLAISIRS : son ponton en ville, et ceux qui l'attendent quand elle
  // n'y est pas (à quai, ils sont déjà à bord : la cuisson les y assoit).
  const ss = CM.shuttleSite;
  const shuttle = ss ? (CM.ships || []).find((s) => s.kind === 'shuttle') : null;
  if (ss && shuttle) {
    const C = ss.city;
    const pid = C.pontoon ? pontoonModel(base, C.pontoon.len, true) : null;
    const away = !(shuttle.state === 'dock' && shuttle.at === 'city');
    const trip = (shuttle.trip | 0) + 1;                 // les passagers du prochain départ
    const n = 1 + (h32(trip, 81, 5) % 3);
    // Chacun a son objet (fiche d'habitant) : cliquable le temps de son attente.
    const mk = (k) => {
      const q = shuttleTraveller(shuttle, trip, k);
      return { charType: q.charType, variant: q.variant, q };
    };
    if (pid) {
      out.push(pontoonItem(C.pontoon, pid));
      if (C.pontoon.sink) out.push(quayFrontItem(C.pontoon));
      if (away) out.push(...waitingOnPontoon(C.pontoon, n, trip, band, mk));
    } else {
      const lg = shuttleLanding(base, C);
      const P = landingPose(C, C.side || 1, sm);
      const m = 0.1 + lg.ext / 64;
      out.push({ d: isoUnitDepth((P.x + P.dx * m) * T, (P.y + P.dy * m) * T), kind: 'fleetScene', what: 'landing', P, landing: lg.id });
      if (away) {
        const dir = Math.abs(P.dx) > Math.abs(P.dy) ? (P.dx > 0 ? 0 : 1) : (P.dy > 0 ? 2 : 3);
        for (let k = 0; k < n; k += 1) {
          const a = -0.2 + 0.12 * k, c = ((h32(trip, 82, k) % 5) - 2) * 0.06;
          const x = P.x + P.dx * a + P.ax * c, y = P.y + P.dy * a + P.ay * c;
          out.push({ d: isoUnitDepth(x * T, y * T) + 0.004, kind: 'fleetScene', what: 'traveller', x, y, z: 4.2, dir, band, ...mk(k) });
        }
      }
    }
  }
  return out;
}

// Découpe au CÔTÉ DE L'EAU de la ligne du bord du quai (pose d'un ponton enfoncé :
// ex, ey = un point du bord, ax, ay = le long du bord, dx, dy = vers le large).
function clipWaterSide(ctx, P) {
  const T = CM.TILE;
  const E = worldToScreen(P.ex * T, P.ey * T), F = worldToScreen((P.ex + P.ax) * T, (P.ey + P.ay) * T);
  const W = worldToScreen((P.ex + P.dx) * T, (P.ey + P.dy) * T);
  let ux = F.x - E.x, uy = F.y - E.y; const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
  let nx = W.x - E.x, ny = W.y - E.y; const dd = nx * ux + ny * uy; nx -= dd * ux; ny -= dd * uy;
  const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
  const K = 4000;
  ctx.beginPath();
  ctx.moveTo(E.x - ux * K, E.y - uy * K);
  ctx.lineTo(E.x + ux * K, E.y + uy * K);
  ctx.lineTo(E.x + ux * K + nx * K, E.y + uy * K + ny * K);
  ctx.lineTo(E.x - ux * K + nx * K, E.y - uy * K + ny * K);
  ctx.closePath();
  ctx.clip();
}

// LES REMOUS d'un embarcadère (iso/waterRipples.js ; Raph, 2026-10-04 : « fais les
// remous sur le ponton et sur tous les pontons »), dans le repère du kit (a le long
// du cap, c à sa gauche — boatBake.projectLocal) :
//   · ponton FLOTTANT (modèle « !pontonN ») : le liseré fait le tour de son tablier
//     (a de 0 à N, c ± FLOAT_W/2) — contre le mur et sur le palier, le quai
//     peint après le recouvre ; enfoncé (rive au mur caché), à l'altitude de l'eau ;
//   · embarcadère SUR PIEUX : rides et sillage au pied de chaque pieu au-dessus de
//     l'eau (a > 0) ; allongé jusqu'au pied d'un mur (« @ext »), un pieu descend
//     jusqu'à l'eau au bas du mur, comme son dessin (boatFamilies.makeLanding).
function landingRipples(it) {
  const P = it.P, id = String(it.landing || ''), T = CM.TILE;
  const X0 = P.x * T, Y0 = P.y * T, fx = Math.cos(P.th), fy = Math.sin(P.th);
  const at = (a, c) => [X0 + a * fx - c * fy, Y0 + a * fy + c * fx];
  const seed = Math.round(X0 * 0.37 + Y0 * 0.61);
  const fl = id.match(/!ponton(\d+)/);
  if (fl) {
    // Le bord du TABLIER (il déborde des flotteurs de 0,8 px) : le liseré tombe juste
    // dessous, là où l'œil le voit.
    const len = +fl[1], hw = FLOAT_W / 2;
    const F = rippleField({ decks: [[at(0, -hw), at(len, -hw), at(len, hw), at(0, hw)]], seed });
    return [{ F, h: -(P.sink || 0), clip: 'river' }];
  }
  const ext = +((id.match(/@(\d+)/) || [0, 0])[1]), tip = 10 + ext, k45 = Math.max(0.3, fx + fy), out = [];
  const flow = [P.ax || 0, P.ay || 0];
  const piles = [5];
  for (let a = 13; a <= tip - 3; a += 8) piles.push(a);
  for (const a of piles) {
    const h = ext ? Math.max(-38, -0.5 - (tip - a) / k45) : 0;
    out.push({ F: rippleField({ posts: [at(a, -6.2), at(a, 6.2)].map((p) => [...p, 0.6]), flow, seed: seed + a }), h, clip: 'river' });
  }
  return out;
}

export function drawFleetScene(ctx, it, now) {
  const T = CM.TILE, z = CM.cam.zoom;
  if (it.what === 'landing') {
    const P = it.P;
    noteRipples('landing:' + it.landing + ':' + P.x.toFixed(2) + ',' + P.y.toFixed(2) + ':' + P.th.toFixed(3) + ':' + (P.sink || 0), () => landingRipples(it));
    // Ponton ENFONCÉ (rive au mur caché) : posé au niveau de l'eau, il passe sous le bord
    // du quai — on ne le peint que du côté de l'eau de la ligne du bord.
    if (P.sink) { ctx.save(); clipWaterSide(ctx, P); }
    const p = worldToScreen(P.x * T, P.y * T, -(P.sink || 0));
    const r = drawBoat(ctx, { id: it.landing, seed: 1 }, p.x, p.y, P.th, z, now, { state: 'dock' });
    if (P.sink) ctx.restore();
    // Sa lanterne (ponton de la navette des Plaisirs) : la passe de nuit l'allume.
    if (r && r.lamps) {
      if (!CM._sceneLamps || CM._sceneLamps.at !== now) CM._sceneLamps = { at: now, pts: [] };
      CM._sceneLamps.pts.push(...r.lamps);
    }
    return;
  }
  if (it.what === 'quayFront') {
    // Le cadre d'écran du ponton et de ceux qui s'y tiennent, côté eau seulement : on y
    // repose le quai (son garde-corps) devant eux.
    const P = it.P;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [a, c] of [[-3, -6], [-3, 6], [P.len, -6], [P.len, 6]]) {
      const q = pontoonAt(P, a, c), s = worldToScreen(q.x * T, q.y * T, -P.sink);
      x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y);
    }
    const pad = 3 * z;
    ctx.save();
    clipWaterSide(ctx, { ...P, ex: P.ex, ey: P.ey });
    repaintQuayRect(ctx, Math.floor(x0 - pad), Math.floor(y0 - 18 * z), Math.ceil(x1 + pad), Math.ceil(y1 + pad));
    ctx.restore();
    return;
  }
  if (it.what === 'traveller') {
    // Nommé (lot 5) : voyageur qui monte ou descend du bac, sinon tiré de son ère.
    const spec = it.name ? it : agentSpecFor(agentSetForBand(it.band), it.charType, it.variant);
    if (!spec) return;
    const pa0 = ctx.globalAlpha;
    if (it.alpha != null) { if (it.alpha <= 0.02) return; ctx.globalAlpha = pa0 * it.alpha; }
    const p = worldToScreen(it.x * T, it.y * T, it.z);
    // Fiche d'habitant : désigné ou survolé, l'anneau sur les planches ; et il se
    // signale avec la boîte peinte pour être cliquable.
    const mark = it.q ? focusMark(it.q) : 0;
    if (mark) drawFocusRingAt(ctx, p.x, p.y, sceneRingWidth(T * z * spec.scale * AGENT_SCALE), mark === 2);
    const d = drawNamedAgentIso(ctx, p.x, p.y, z, spec.name, spec.scale, it.dir, !!it.walking, now, it.phase || 0, 1, it.walking ? it.dist : null, true);
    ctx.globalAlpha = pa0;
    if (d && it.q) noteSceneFigure(it.q, it.q.sceneTag || 'bac', spec.name, p.x, p.y, d);
    return;
  }
}
