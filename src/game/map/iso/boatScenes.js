"use strict";
// ── LES PETITES SCÈNES DU FLEUVE (docs/PLAN-BATEAUX.md §5, lots 5-6) ───────────
//
// Ce qui vit AU BORD de l'eau autour de la flotte, trié avec la ville par le
// peintre (items 'fleetScene') :
//   · les deux EMBARCADÈRES du passeur, et les voyageurs qui attendent le bac sur
//     celui d'en face ;
//   · la BÊTE DE HALAGE du chaland et son conducteur, sur la berge, la corde tendue
//     jusqu'au mât de halage.
// Les positions viennent de la sim (riverFleet) et de la pose de la frame que
// drawIsoShips laisse sur chaque bateau : ici on ne fait que dessiner.

import { CM } from '../layout.js';
import { worldToScreen } from './projection.js';
import { isoUnitDepth } from './isoUnits.js';
import { drawDraftIso } from './isoUnits.js';
import { agentSetForBand, agentSpecFor, drawNamedAgentIso } from '../agents.js';
import { ribbonAt, ribbonLength } from '../riverFleet.js';
import { drawBoat } from './boatKit.js';
import { fleetFor } from './boatKits.js';
import { h32 } from './boatBake.js';


// Un embarcadère : origine au bord d'eau, cap vers le large.
function landingPose(site, side, sm) {
  const r = ribbonAt(sm, site.t);
  const x = r.x + r.nx * side * site.hw, y = r.y + r.ny * side * site.hw;
  return { x, y, th: Math.atan2(-side * r.ny, -side * r.nx), dx: -side * r.nx, dy: -side * r.ny, ax: r.tx, ay: r.ty };
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
    for (const side of [-1, 1]) {
      const P = landingPose(site, side, sm);
      // Le tablier s'avance de 10 px dans l'eau : sa profondeur est celle de son milieu.
      const fl = fleetFor(band);
      out.push({ d: isoUnitDepth((P.x + P.dx * 0.1) * T, (P.y + P.dy * 0.1) * T), kind: 'fleetScene', what: 'landing', P, landing: (fl && fl.landing) || 'embarcadere' });
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
  // La bête de halage de chaque chaland (pose laissée par drawIsoShips).
  for (const sh of CM.ships || []) {
    const H = sh._hauler;
    if (!H || H.at !== now) continue;
    out.push({ d: isoUnitDepth(H.x * T, H.y * T), kind: 'fleetScene', what: 'hauler', H, band });
  }
  return out;
}

// Pose de halage d'un chaland pour cette frame : la bête marche 3,4 tuiles devant
// lui, sur le BORD de la rive de son chemin (lat = ±(demi-largeur + 0,45)). À 0,85
// elle marchait dans la forêt des berges sauvages, cachée par les arbres (banc).
export function haulerPose(sh, rope, now, animal) {
  const sm = CM.layout && CM.layout.river && CM.layout.river.samples;
  if (!sm || sm.length < 2 || !rope) return null;
  const Lr = ribbonLength(sm);
  const t = sh.t + (sh.dir || 1) * 3.4 / Lr;
  const r = ribbonAt(sm, t);
  const side = sh.towSide || 1;
  const x = r.x + r.nx * side * (r.hw + 0.45), y = r.y + r.ny * side * (r.hw + 0.45);
  const mx = r.tx * (sh.dir || 1), my = r.ty * (sh.dir || 1);
  const dir = Math.abs(mx) > Math.abs(my) ? (mx > 0 ? 0 : 1) : (my > 0 ? 2 : 3);
  return { x, y, dir, roll: Math.abs(sh.t * Lr * CM.TILE), rope, at: now, ax: r.nx * side, ay: r.ny * side, seed: sh.id | 0, animal: animal || 'ox' };
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
  if (it.what === 'hauler') {
    const H = it.H;
    const p = worldToScreen(H.x * T, H.y * T);
    // La CORDE : du mât de halage jusqu'au collier de la bête, légèrement creusée.
    const hx = p.x, hy = p.y - 4 * z;
    const mx = (H.rope.x + hx) / 2, my = (H.rope.y + hy) / 2 + 3 * z;
    ctx.strokeStyle = 'rgba(74,54,34,0.9)';
    ctx.lineWidth = Math.max(1, Math.round(z * 0.8));
    ctx.beginPath();
    ctx.moveTo(H.rope.x, H.rope.y);
    ctx.quadraticCurveTo(mx, my, hx, hy);
    ctx.stroke();
    // Le BOUVIER marche à côté de la bête, côté terre.
    const spec = agentSpecFor(agentSetForBand(it.band), 0, H.seed % 3);
    const dp = worldToScreen((H.x + H.ax * 0.3) * T, (H.y + H.ay * 0.3) * T);
    const drover = () => { if (spec) drawNamedAgentIso(ctx, dp.x, dp.y, z, spec.name, spec.scale, H.dir, true, now, 0.3, 1, H.roll, true); };
    if (dp.y < p.y) drover();
    drawDraftIso(ctx, p.x, p.y, z, H.animal || 'ox', { dir: H.dir, rollDist: H.roll });
    if (dp.y >= p.y) drover();
  }
}
