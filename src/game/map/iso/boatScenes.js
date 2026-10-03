"use strict";
// ── LES PETITES SCÈNES DU FLEUVE (docs/PLAN-BATEAUX.md §5, lots 5-6) ───────────
//
// Ce qui vit AU BORD de l'eau autour de la flotte, trié avec la ville par le
// peintre (items 'fleetScene') :
//   · les deux EMBARCADÈRES du passeur, et les voyageurs qui attendent le bac sur
//     celui d'en face.
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

// Les items de la frame. `band` = bande d'ère (habits des gens).
export function fleetSceneItems(now, band) {
  const out = [];
  const L = CM.layout, rv = L && L.river;
  if (!rv || !rv.present || !rv.samples || rv.samples.length < 2) return out;
  const sm = rv.samples, T = CM.TILE;
  const site = CM.ferrySite;
  const ferry = site ? (CM.ships || []).find((s) => s.kind === 'ferry') : null;
  if (site && ferry) {
    const fl = fleetFor(band);
    for (const side of [-1, 1]) {
      const P = landingPose(site, side, sm);
      const lg = landingFor((fl && fl.landing) || 'embarcadere', site, side);
      // Le tablier s'avance de 10 px dans l'eau (plus son allonge) : sa profondeur est
      // celle de son milieu.
      const m = 0.1 + lg.ext / 64;
      out.push({ d: isoUnitDepth((P.x + P.dx * m) * T, (P.y + P.dy * m) * T), kind: 'fleetScene', what: 'landing', P, landing: lg.id });
    }
    // Les VOYAGEURS attendent sur l'embarcadère que le bac va chercher : celui d'en
    // face quand il est à quai, sa destination quand il traverse.
    const waitSide = ferry.state === 'cross' ? ferry.ferrySide : -ferry.ferrySide;
    const P = landingPose(site, waitSide, sm);
    const n = 1 + (h32(ferry.trip | 0, 71, 3) % 3);
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
  return out;
}

export function drawFleetScene(ctx, it, now) {
  const T = CM.TILE, z = CM.cam.zoom;
  if (it.what === 'landing') {
    const P = it.P;
    const p = worldToScreen(P.x * T, P.y * T);
    drawBoat(ctx, { id: it.landing, seed: 1 }, p.x, p.y, P.th, z, now, { state: 'dock' });
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
