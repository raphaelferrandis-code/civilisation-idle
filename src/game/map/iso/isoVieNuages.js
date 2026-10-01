// LES OMBRES DE NUAGES (docs/PLAN-MAQUETTE-VIVANTE.md §9, lot V5).
//
// Réponse de Raph (2026-10-01) : « de grandes ombres douces qui passent lentement sur
// la ville, comme sur une maquette au soleil ». Elles glissent dans le sens du vent,
// de jour et par beau temps seulement : la nuit il n'y a pas de soleil pour les
// projeter, et sous l'averse le ciel est couvert d'un bout à l'autre.
//
// SANS ÉTAT : la position d'un nuage est une fonction du temps (dérive continue sur
// un tore un peu plus grand que la carte), donc captures reproductibles.
//
// ⚠ COÛT : c'est une grande SURFACE en multiply, et le rendu logiciel (le Chrome de
// Raph) paie la surface, pas le JavaScript (leçon de l'ombre solaire). D'où : peu de
// nuages (≈ 15 % du sol couvert), fondu sous le zoom 0,6, coupé au palier « perf »
// (CM.fxOn === false) et en vue lointaine.
import { CM } from '../layout.js';
import { worldToScreen } from './projection.js';
import { VIE, vieGenerated, vieBlitAt, vieCount } from './isoVie.js';
import { cloudShadowMask, hash01 } from './vieArt.js';

// Un masque = une « case de nuage » pour 1/13 de tuile. Il est cuit UNE fois par
// nuage, à cette résolution fixe, puis posé à un nombre ENTIER de pixels par case
// selon le zoom : le recuire à chaque zoom coûtait des dizaines de millisecondes.
const CELLS_PER_TILE = 13;
export function drawVieClouds(now) {
  if (!VIE.on || !(VIE.nuages > 0)) return;
  if (CM.lodActive || CM.fxOn === false || CM.collapseAt) return;
  const L = CM.layout;
  if (!L) return;
  const z = CM.cam.zoom;
  const zk = Math.max(0, Math.min(1, (z - 0.6) / 0.1));
  const dayK = Math.max(0, 1 - (CM.nightF || 0) * 1.8);
  const skyK = Math.max(0, 1 - (CM.rainF || 0) * 1.6);
  const force = (VIE.nuagesForce != null ? +VIE.nuagesForce : 0.3) * zk * dayK * skyK * VIE.nuages;
  if (force < 0.02) return;
  const ctx = CM.ctx, T = CM.TILE, N = L.gridN | 0;
  const t = (now || 0) / 1000;
  // Vent : direction et vitesse. Par temps calme, une brise d'ouest.
  const wind = CM.windX || 0;
  const dir = wind < 0 ? -1 : 1;
  const speed = 0.22 + Math.abs(wind) * 0.5;       // tuiles par seconde
  const ux = 0.94 * dir, uy = 0.34 * dir;
  const wrap = N + 60;                               // tore : la carte + une marge
  const n = Math.max(6, Math.round((wrap * wrap) / 520));
  const d = CM.dpr || 1;
  const cell = Math.max(1, Math.round((T * z * 1.3 / CELLS_PER_TILE) * d)) / d;   // px écran par case
  const prevOp = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'multiply';
  for (let i = 0; i < n; i += 1) {
    const s = (i * 7919 + 13) | 0;
    const wT = 9 + hash01(s) * 9;                    // largeur en tuiles
    // Position : graine + dérive, repliée sur le tore, centrée sur la carte.
    let cx = hash01(s + 1) * wrap + ux * speed * t, cy = hash01(s + 2) * wrap + uy * speed * t;
    cx = ((cx % wrap) + wrap) % wrap - 30; cy = ((cy % wrap) + wrap) % wrap - 30;
    const p = worldToScreen(cx * T, cy * T);
    // Largeur d'un nuage de wT tuiles, en cases (fixe) puis à l'écran (selon le zoom).
    const Wa = Math.round(wT * CELLS_PER_TILE), Ha = Math.round(Wa * 0.5);
    const Wpx = Wa * cell, Hpx = Ha * cell;
    if (p.x < -Wpx || p.x > CM.cw + Wpx || p.y < -Hpx || p.y > CM.ch + Hpx) continue;
    const img = vieGenerated('cloud:' + (s % 997) + ':' + Wa, () => cloudShadowMask(s % 997, Wa, Ha));
    if (vieBlitAt(ctx, img, p.x, p.y, cell, force, true)) vieCount('nuages');
  }
  ctx.globalCompositeOperation = prevOp;
}
