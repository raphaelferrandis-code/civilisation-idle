"use strict";
// ── LA VIE DES CHAMPS : le laboureur (docs/PLAN-TERROIR.md, T4) ──────────────
//
// Un terroir sans personne restait un décor. Un ATTELAGE laboure, va et vient le
// long d'une parcelle : la bête de trait devant, la charrue, le laboureur qui la
// tient. Mêmes briques que le halage des péniches (boatScenes.js) : la bête de
// trait de drawDraftIso, l'habitant de l'ère de drawNamedAgentIso — la même main
// que tout ce qui marche dans la ville.
//   · un attelage par parcelle PAIRE (0, 2) : deux au plus par terroir — de la
//     vie, pas une foule ;
//   · bœuf jusqu'au marbre, cheval à la fonte ; rien au néon (les pivots
//     arrosent seuls) ni aux âges cosmiques ; rien l'hiver (champs sous la neige).
// Tout se déduit de `now` : aucun état, aucun tirage par frame.
// Molette : __terroirLife({ on, speed }).
import { CM } from '../layout.js';
import { worldToScreen } from './projection.js';
import { isoUnitDepth, drawDraftIso } from './isoUnits.js';
import { agentSetForBand, agentSpecFor, drawNamedAgentIso } from '../agents.js';
import { WINTER } from '../seasonMode.js';

export const terroirLifeTune = { on: true, speed: 0.3 };   // cases par seconde

export function pushTerroirTeams(items, L, band, now) {
  if (!terroirLifeTune.on || band > 5 || CM.season === WINTER || !L || !L.tiles) return;
  const T = CM.TILE, v = Math.max(0.05, terroirLifeTune.speed);
  for (const t of L.tiles) {
    if (t.buildingId !== 'irrigated_fields' || !t.rural || ((t.parcel | 0) % 2) !== 0) continue;
    const sx = t.spanX || 1, sy = t.spanY || 1;
    if (Math.max(sx, sy) < 3) continue;
    const alongX = sx >= sy, Lc = alongX ? sx : sy, Wc = alongX ? sy : sx;
    const seed = ((t.gx * 73856093) ^ (t.gy * 19349663)) >>> 0;
    // Aller-retour sur la longueur, à une voie fixe tirée par parcelle.
    const len = Lc - 1.6;
    const run = ((now || 0) / 1000) * v + (seed % 997) / 97;
    const ph = run % (2 * len), fwd = ph < len, a = fwd ? ph : 2 * len - ph;
    const lane = Wc * (0.28 + 0.44 * ((seed >>> 5) % 9) / 9);
    const along = 0.8 + a;
    const x = t.gx + (alongX ? along : lane), y = t.gy + (alongX ? lane : along);
    const dir = alongX ? (fwd ? 0 : 1) : (fwd ? 2 : 3);
    items.push({
      d: isoUnitDepth(x * T, y * T), kind: 'terroirTeam',
      team: { x, y, dir, ux: alongX ? (fwd ? 1 : -1) : 0, uy: alongX ? 0 : (fwd ? 1 : -1), roll: run * T, band, seed },
    });
  }
}

export function drawTerroirTeam(ctx, it, now) {
  const q = it.team;
  if (!q) return;
  const T = CM.TILE, z = CM.cam.zoom;
  // La bête devant, la charrue au milieu, le laboureur derrière.
  const po = worldToScreen((q.x + q.ux * 0.24) * T, (q.y + q.uy * 0.24) * T);
  const pp = worldToScreen((q.x - q.ux * 0.06) * T, (q.y - q.uy * 0.06) * T);
  const pf = worldToScreen((q.x - q.ux * 0.3) * T, (q.y - q.uy * 0.3) * T);
  const animal = q.band >= 5 ? 'horse' : 'ox';
  const spec = agentSpecFor(agentSetForBand(q.band), 0, q.seed % 3);
  const k = Math.max(1, Math.round(z));
  const parts = [
    [po.y, () => drawDraftIso(ctx, po.x, po.y, z, animal, { dir: q.dir, rollDist: q.roll })],
    // La charrue : les mancherons tenus par le laboureur, le soc dans la terre.
    [pp.y, () => {
      ctx.strokeStyle = '#3e2c1c';
      ctx.lineWidth = k;
      ctx.beginPath();
      ctx.moveTo(Math.round(po.x), Math.round(po.y - 4 * z));
      ctx.lineTo(Math.round(pp.x), Math.round(pp.y - 1 * z));
      ctx.lineTo(Math.round(pf.x), Math.round(pf.y - 5 * z));
      ctx.stroke();
      ctx.fillStyle = '#5a5048';
      ctx.fillRect(Math.round(pp.x - k), Math.round(pp.y - k), 2 * k, k);
    }],
    [pf.y, () => {
      if (!spec) return;
      drawNamedAgentIso(ctx, pf.x, pf.y, z, spec.name, spec.scale, q.dir, true, now, (q.seed % 7) * 0.13, 1, q.roll, true);
    }],
  ];
  parts.sort((a, b) => a[0] - b[0]);
  for (const [, fn] of parts) fn();
}

if (typeof window !== 'undefined') {
  window.__terroirLife = (o) => { if (o) Object.assign(terroirLifeTune, o); return { ...terroirLifeTune }; };
}
