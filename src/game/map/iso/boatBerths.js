"use strict";
// ── LES POSTES D'ACCOSTAGE DE LA FLOTTE (docs/PLAN-BATEAUX.md §5, lot 4) ──────
//
// Le marchand ne « s'arrête » plus 2,5 s au milieu du fleuve à hauteur du port :
// il vient se ranger BORD À BORD au ponton, charge, décharge, et repart. Le bateau
// qui y était peint en décor (drawIsoPortBoat) laisse la place à la flotte dans
// les ères où le kit de bateaux existe.
//
// Un poste = un point d'eau au pied du ponton (pierMoorings, la géométrie du port
// tenue par la session « port et plage » : elle reste la source), exprimé dans le
// repère de la NAVIGATION (t le long du ruban, lat en travers) pour que la sim y
// conduise le bateau, plus le cap à quai.
//
// Un poste par port : la tête du ponton (le long du fleuve, on y glisse de côté
// sans manœuvre). Les candidats de pierMoorings sont des RÉGLAGES d'un même poste,
// on prend le premier que l'emprise d'un pont ne bloque pas.

import { CM } from '../layout.js';
import { pierMoorings, pierPlan, PIER } from './isoPier.js';
import { bridgeBlocks } from './isoBridge.js';
import { BOAT_MODELS, fleetFor } from './boatKits.js';
import { BOATKIT } from './boatKit.js';
import { worldToScreen } from './projection.js';
import { agentSetForBand, agentSpecFor, drawNamedAgentIso } from '../agents.js';
import { snapDev } from '../blitSnap.js';

// Projection d'un point monde (tuiles) sur le ruban : t, voie transversale, tangente.
// Même repère que la navigation (riverFleet.ribbonAt) : normale = gauche des samples.
export function projectOnRibbon(sm, x, y) {
  let best = null;
  const n = sm.length;
  for (let i = 0; i < n - 1; i += 1) {
    const a = sm[i], b = sm[i + 1];
    const tx = b.x - a.x, ty = b.y - a.y, l2 = tx * tx + ty * ty || 1e-9;
    const f = Math.max(0, Math.min(1, ((x - a.x) * tx + (y - a.y) * ty) / l2));
    const qx = a.x + tx * f, qy = a.y + ty * f;
    const d = (x - qx) ** 2 + (y - qy) ** 2;
    if (!best || d < best.d) best = { d, i, f, qx, qy, tx, ty };
  }
  if (!best) return null;
  const tl = Math.hypot(best.tx, best.ty) || 1;
  const ux = best.tx / tl, uy = best.ty / tl;
  return { t: (best.i + best.f) / Math.max(1, n - 1), lat: (x - best.qx) * -uy + (y - best.qy) * ux, tx: ux, ty: uy };
}

export function fleetBerths(L) {
  const out = [];
  const rv = L && L.river;
  if (!rv || !rv.present || !rv.samples || rv.samples.length < 2 || !rv.cells) return out;
  const c = L.counts || {};
  const band = c.eraBand | 0, ei = c.eraIndex | 0;
  const fl = BOATKIT.on ? fleetFor(band) : null;
  if (!fl || !fl.trade) return out;
  const T = CM.TILE;
  // Le poste est coté pour le plus long marchand de l'époque.
  const big = Math.max(...fl.trade.map((id) => BOAT_MODELS[id].len / 32));
  for (const t of L.tiles || []) {
    if (t.buildingId !== 'river_ports' || t.type !== 'engine' || t.oldPort) continue;
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    let wet = false;
    for (let ax = 0; ax < sx && !wet; ax += 1) for (let ay = 0; ay < sy && !wet; ay += 1) {
      const k = (t.gx + ax) + ',' + (t.gy + ay);
      if (rv.cells.has(k) || (rv.banks && rv.banks.has(k))) wet = true;
    }
    if (!wet) continue;
    const pm = pierMoorings(t, sx, sy, band, ei, big);
    if (!pm) continue;
    for (const cand of pm.cands) {
      if (bridgeBlocks(cand.x * T, cand.y * T, (big * 0.55 + 0.3) * T)) continue;
      const pr = projectOnRibbon(rv.samples, cand.x, cand.y);
      if (!pr) continue;
      const th = cand.along === 'pier' ? Math.atan2(pm.dir.y, pm.dir.x) : Math.atan2(pr.ty, pr.tx);
      // Rive d'où part le ponton : celle du bâtiment (le signe de sa voie projetée).
      const home = projectOnRibbon(rv.samples, t.gx + sx / 2, t.gy + sy / 2);
      const side = home && home.lat < 0 ? -1 : 1;
      // LE TABLIER, pour les porteurs : racine au bord d'eau, longueur, hauteur.
      // Même plan que le peintre du ponton (pierPlan) ; la racine se déduit du poste
      // (pierMoorings le pose à reach + 0,12 + 0,27·coque devant elle, 0,3 de côté).
      const plan = pierPlan(ei < 10 ? 0 : ei < 20 ? 1 : ei < 30 ? 2 : 3, Math.max(1, (rv.samples[pm.si] || {}).hw || 2), band);
      const off = cand.along === 'river' ? plan.reach + 0.12 + big * 0.27 : null;
      const ac = pm.dir.x ? { x: 0, y: 1 } : { x: 1, y: 0 };
      const pier = off == null ? null : {
        rx: cand.x - pm.dir.x * off + ac.x * 0.3, ry: cand.y - pm.dir.y * off + ac.y * 0.3,
        dx: pm.dir.x, dy: pm.dir.y, reach: plan.reach, deckZ: plan.deckZ,
      };
      out.push({ id: t.gx + ',' + t.gy, x: cand.x, y: cand.y, t: pr.t, lat: pr.lat, th, along: cand.along, side, beam: big * 0.3, pier, band });
      break;
    }
  }
  return out;
}

// ── LES PORTEURS DU PONTON (docs/PLAN-BATEAUX.md, lot 4) ──────────────────────
// Pendant l'escale, deux hommes de l'ère font la navette sur le tablier : à vide
// vers le bateau, CHARGÉS (amphore à l'épaule) vers la rive — on décharge. Leur
// position ne dépend que du temps passé à quai : rien à simuler, rien à sauver.
// `elapsed` = secondes depuis l'amarrage.
const PORTER = { speed: 0.75, pause: 1.4, n: 2 };
export function dockPorters(berth, elapsed, seed = 0) {
  const P = berth && berth.pier;
  if (!P || !PIER.on || !(elapsed >= 0)) return [];
  const a0 = -0.45, a1 = Math.max(a0 + 0.6, P.reach - 0.45);
  const len = a1 - a0;
  const leg = len / PORTER.speed;
  const cyc = 2 * (leg + PORTER.pause);
  const out = [];
  for (let k = 0; k < PORTER.n; k += 1) {
    const t = elapsed - k * (cyc / 2) - 1.2;
    if (t < 0) continue;                               // il n'est pas encore descendu
    const u = t % cyc;
    let a, toShip, walking = true;
    if (u < leg) { a = a0 + (u / leg) * len; toShip = true; }
    else if (u < leg + PORTER.pause) { a = a1; toShip = false; walking = false; }
    else if (u < 2 * leg + PORTER.pause) { a = a1 - ((u - leg - PORTER.pause) / leg) * len; toShip = false; }
    else { a = a0; toShip = true; walking = false; }
    // Un pas de côté par porteur : ils se croisent sans se traverser.
    const c = (k ? 0.16 : -0.16);
    const ac = P.dx ? { x: 0, y: 1 } : { x: 1, y: 0 };
    const sgn = toShip ? 1 : -1;
    const wdx = P.dx * sgn, wdy = P.dy * sgn;
    const dir = Math.abs(wdx) > Math.abs(wdy) ? (wdx > 0 ? 0 : 1) : (wdy > 0 ? 2 : 3);
    out.push({
      x: P.rx + P.dx * a + ac.x * c, y: P.ry + P.dy * a + ac.y * c, z: P.deckZ,
      dir, walking, carry: !toShip, dist: t * PORTER.speed * CM.TILE, k, seed,
    });
  }
  return out;
}

// Un porteur, à sa profondeur (item 'porter' du peintre).
export function drawDockPorter(ctx, q, band, now) {
  const spec = agentSpecFor(agentSetForBand(band), 0, (q.seed + q.k) % 3);
  if (!spec) return;
  const T = CM.TILE, z = CM.cam.zoom;
  const p = worldToScreen(q.x * T, q.y * T, q.z * T);
  drawNamedAgentIso(ctx, p.x, p.y, z, spec.name, spec.scale, q.dir, q.walking, now, q.k * 0.5, 1, q.walking ? q.dist : null, true);
  if (!q.carry) return;
  // L'amphore SUR l'épaule : deux pixels d'art de large, quatre de haut, cernée
  // d'encre comme les habitants — à la toise du porteur (≈ 8 px), pas de la caméra.
  // (Première version à 3×5 posée à côté de lui : on lisait une caisse qui flotte.)
  const u = Math.max(1, snapDev(z));
  const x = snapDev(p.x + (q.dir === 0 || q.dir === 2 ? 0 : -u)), y = snapDev(p.y - 10 * u);
  ctx.fillStyle = '#2a1b12';
  ctx.fillRect(x - u, y - u, 4 * u, 6 * u);
  ctx.fillStyle = '#c97a4e';
  ctx.fillRect(x, y, 2 * u, 4 * u);
  ctx.fillStyle = '#e8a072';
  ctx.fillRect(x, y + u, u, u);
}
