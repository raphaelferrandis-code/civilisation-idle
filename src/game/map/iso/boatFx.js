"use strict";
// ── LES EFFETS DE LA FLOTTE (docs/PLAN-BATEAUX.md §5) ───────────────────────────
//
// Ce qui ne se cuit pas parce que ça BOUGE à chaque image : la fumée des
// cheminées, les jets des lances à incendie, le halo sous les coques qui lévitent.
// Tout est dessiné en pixels francs (carrés posés sur la grille du zoom), jamais en
// dégradé : une bouffée est un pavé qui grossit et pâlit en montant.

import { rgbOf } from './boatBake.js';
import { snapDev } from '../blitSnap.js';

const SMOKE = { puffs: 6, period: 3.6, rise: 16, drift: 10 };
// Fumée d'une cheminée. `at` = point écran de la bouche, `heading` = cap écran
// (la fumée part vers l'arrière, poussée par la marche), `moving` = le bateau
// avance (à l'arrêt elle monte droit).
export function drawSmoke(ctx, at, now, z, seed, heading, moving) {
  const t = (now || 0) / 1000;
  const bx = -Math.cos(heading || 0), by = -Math.sin(heading || 0) * 0.5;
  const prevA = ctx.globalAlpha;
  for (let i = 0; i < SMOKE.puffs; i += 1) {
    const age = ((t / SMOKE.period + i / SMOKE.puffs + (seed % 97) / 97) % 1);
    const sway = Math.sin((t + i * 1.7 + seed) * 1.3) * 1.5 * age;
    const x = at.x + ((moving ? bx * SMOKE.drift : 0) * age + sway) * z;
    const y = at.y - (SMOKE.rise * age) * z + (moving ? by * SMOKE.drift * age * z : 0);
    const r = Math.max(1, snapDev((1 + age * 2.6) * z));
    const a = (1 - age) * 0.75;
    if (a <= 0.02) continue;
    ctx.globalAlpha = prevA * a;
    ctx.fillStyle = age < 0.25 ? '#4c4a48' : age < 0.6 ? '#8a8784' : '#bdbab5';
    ctx.fillRect(snapDev(x - r), snapDev(y - r), r * 2, r * 2);
  }
  ctx.globalAlpha = prevA;
}

// Jets des lances : deux arcs d'eau vers les flancs, en gouttes qui défilent.
export function drawJets(ctx, anchors, now, z, heading, seed) {
  const t = (now || 0) / 1000;
  const prevA = ctx.globalAlpha;
  const sx = Math.cos((heading || 0) + Math.PI / 2), sy = Math.sin((heading || 0) + Math.PI / 2) * 0.5;
  [[anchors.jetL, -1], [anchors.jetR, 1]].forEach(([at, side]) => {
    if (!at) return;
    for (let i = 0; i < 14; i += 1) {
      const f = ((t * 1.4 + i / 14 + (seed % 7) * 0.13) % 1);
      const reach = 34 * f, lift = 22 * f * (1 - f) * 2;
      const x = at.x + side * sx * reach * z, y = at.y + side * sy * reach * z - lift * z + f * f * 6 * z;
      const r = Math.max(1, snapDev(z * (f > 0.75 ? 1.6 : 1)));
      ctx.globalAlpha = prevA * (f > 0.85 ? (1 - f) * 5 : 0.9);
      ctx.fillStyle = f > 0.8 ? '#e9f6fc' : '#bfe4f4';
      ctx.fillRect(snapDev(x), snapDev(y), r, r);
    }
  });
  ctx.globalAlpha = prevA;
}

// Halo sous une coque qui lévite : une ellipse de lumière posée sur l'eau, en
// mélange additif, qui respire doucement.
export function drawHoverGlow(ctx, x, y, z, len, color, now, seed) {
  const c = rgbOf(color);
  const k = 0.82 + 0.18 * Math.sin((now || 0) / 900 + (seed % 13));
  const prevOp = ctx.globalCompositeOperation, prevA = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter';
  for (const [rx, ry, a] of [[0.55, 0.22, 0.10], [0.4, 0.15, 0.12], [0.24, 0.09, 0.16]]) {
    ctx.globalAlpha = prevA * a * k;
    ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
    ctx.beginPath();
    ctx.ellipse(x, y, len * rx * z, len * ry * z, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = prevOp;
  ctx.globalAlpha = prevA;
}

// LES LANTERNES DE LA NAVETTE DES PLAISIRS, la nuit (passe de nuit, après le voile) :
// une lueur ronde rouge-orangé et un cœur d'un pixel d'art, qui palpite un peu comme
// une flamme sous le papier. `pts` = points écran ; `night` = 0…1.
export function drawLamps(ctx, pts, now, z, seed, night) {
  if (!pts || !pts.length || !(night > 0.02)) return;
  const prevA = ctx.globalAlpha;
  const px = Math.max(1, snapDev(z));
  pts.forEach((p, i) => {
    const fl = 0.85 + 0.15 * Math.sin((now || 0) / 170 + i * 1.9 + (seed % 13));
    const a = Math.min(1, night * 1.2) * fl;
    ctx.globalAlpha = prevA * a * 0.22;
    ctx.fillStyle = '#ff6a46';
    ctx.beginPath(); ctx.arc(p.x, p.y, 4.5 * z, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = prevA * a * 0.4;
    ctx.beginPath(); ctx.arc(p.x, p.y, 2.2 * z, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = prevA * a;
    ctx.fillStyle = '#ffd08a';
    ctx.fillRect(snapDev(p.x - px / 2), snapDev(p.y - px / 2), px, px);
  });
  ctx.globalAlpha = prevA;
}
