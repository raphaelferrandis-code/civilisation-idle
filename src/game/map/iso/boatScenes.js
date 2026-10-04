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
import { agentSetForBand, agentSpecFor, drawNamedAgentIso } from '../agents.js';
import { ribbonAt, ferryReach, FERRY_TIP } from '../riverFleet.js';
import { drawBoat } from './boatKit.js';
import { fleetFor, BOAT_MODELS } from './boatKits.js';
import { pontoonAt } from './boatLandings.js';
import { repaintQuayRect } from './isoQuay.js';
import { h32 } from './boatBake.js';


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
    const n = 1 + (h32(ferry.trip | 0, 71, 3) % 3);
    const pw = pont(waitSide);
    if (pw) {
      out.push(...waitingOnPontoon(pw.P, n, ferry.trip | 0, band, (k) => ({ charType: h32(ferry.trip | 0, 73, k) % 2, variant: h32(ferry.trip | 0, 74, k) % 3 })));
    } else {
      const P = landingPose(site, waitSide, sm);
      for (let k = 0; k < n; k += 1) {
        const a = -0.18 + 0.12 * k, c = ((h32(ferry.trip | 0, 72, k) % 5) - 2) * 0.07;
        const x = P.x + P.dx * a + P.ax * c, y = P.y + P.dy * a + P.ay * c;
        // Ils regardent l'eau (le bac qui vient).
        const dir = Math.abs(P.dx) > Math.abs(P.dy) ? (P.dx > 0 ? 0 : 1) : (P.dy > 0 ? 2 : 3);
        out.push({
          d: isoUnitDepth(x * T, y * T) + 0.004, kind: 'fleetScene', what: 'traveller',
          x, y, z: 4.2, dir, band, charType: h32(ferry.trip | 0, 73, k) % 2, variant: h32(ferry.trip | 0, 74, k) % 3,
        });
      }
    }
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
    const mk = (k) => ({ charType: h32(trip, 83, k) % 2, variant: h32(trip, 84, k) % 3 });
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

export function drawFleetScene(ctx, it, now) {
  const T = CM.TILE, z = CM.cam.zoom;
  if (it.what === 'landing') {
    const P = it.P;
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
    const spec = agentSpecFor(agentSetForBand(it.band), it.charType, it.variant);
    if (!spec) return;
    const p = worldToScreen(it.x * T, it.y * T, it.z);
    drawNamedAgentIso(ctx, p.x, p.y, z, spec.name, spec.scale, it.dir, false, now, 0, 1, null, true);
    return;
  }
}
