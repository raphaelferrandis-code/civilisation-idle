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
import { agentSetForBand, agentSpecFor, drawNamedAgentIso, AGENT_SCALE } from '../agents.js';
import { WINTER, SUMMER } from '../seasonMode.js';
import { focusMark, drawFocusRingAt, noteSceneFigure, sceneRingWidth } from '../citizenFocus.js';
// Le guichet du paysage sonore : des modules-FEUILLES (aucun import), sans risque de cycle.
import { noteEmetteur } from '../../audio/paysage/evenements.js';

// LE LABOUREUR A UN NOM (fiche d'habitant, citizenFocus.js) : un objet par
// parcelle, gardé d'une frame à l'autre — c'est toujours le même qui laboure
// ce champ-là.
const _ploughmen = new Map();
function ploughmanOf(q) {
  let pp = _ploughmen.get(q.seed);
  if (!pp) { pp = { charType: 0, figSeed: q.seed, walking: true }; _ploughmen.set(q.seed, pp); }
  pp.dir = q.dir; pp.walkDist = q.roll; pp.phase = (q.seed % 7) * 0.13; pp.workKey = q.tile;
  return pp;
}

const terroirLifeTune = { on: true, speed: 0.3 };   // cases par seconde

// LOT 5 de PLAN-COMPORTEMENTS : il labourait le MÊME sillon pour toujours, la bête
// sautait d'un côté à l'autre à chaque bout (demi-tour instantané), et il labourait la
// nuit. Désormais il passe de sillon en sillon (en zigzag sur la largeur), souffle au
// bout du champ, tourne en ARC (la bête mène, le laboureur suit), et rentre au
// crépuscule (fondu) pour revenir au matin. L'été, ce sont les MOISSONNEURS : deux
// faucheurs qui avancent à petits pas, la faux qui balaie, et une lieuse derrière eux
// qui s'arrête pour lier les gerbes. Toujours une fonction pure de `now`.
const dirOf = (vx, vy) => (Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 0 : 1) : (vy > 0 ? 2 : 3));
const hh = (seed, i, salt) => ((((seed ^ (i * 2654435761) ^ (salt * 40503)) >>> 0) % 1000) / 1000);
const TURN = 1.6;                                   // secondes d'un demi-tour au bout du champ
// Où en est l'attelage, `time` secondes dans sa journée : position (le long, en travers),
// cap (ua le long, ul en travers), distance marchée (tuiles), marche ou souffle.
function ploughAt(seed, Lc, Wc, time, v) {
  const nL = Math.max(2, Math.min(5, Math.round(Wc * 1.6)));
  const laneOf = (j) => Wc * (0.2 + 0.6 * j / (nL - 1));
  const nP = 2 * (nL - 1), len = Lc - 1.6, a0 = 0.8, a1 = 0.8 + len, W = len / v;
  const seq = (i) => { const m = i % nP; return m < nL ? m : nP - m; };   // 0,1,…,nL−1,…,1
  const rest = (i) => 1.5 + 2.5 * hh(seed, i, 7);
  let P = 0;
  for (let i = 0; i < nP; i += 1) P += W + rest(i) + TURN;
  let t = ((time % P) + P) % P, roll = 0;
  for (let i = 0; i < nP; i += 1) {
    const fwd = i % 2 === 0, sgn = fwd ? 1 : -1, lane = laneOf(seq(i)), aEnd = fwd ? a1 : a0;
    if (t < W) return { a: (fwd ? a0 : a1) + sgn * t * v, lane, ua: sgn, ul: 0, roll: roll + t * v, walking: true };
    t -= W; roll += len;
    if (t < rest(i)) return { a: aEnd, lane, ua: sgn, ul: 0, roll, walking: false };
    t -= rest(i);
    const gap = laneOf(seq(i + 1)) - lane, sl = gap >= 0 ? 1 : -1;
    if (t < TURN) {
      const th = Math.PI * t / TURN, bulge = Math.min(0.35, Math.abs(gap) / 2);
      return {
        a: aEnd + sgn * bulge * Math.sin(th), lane: lane + gap * (1 - Math.cos(th)) / 2,
        ua: sgn * Math.cos(th), ul: sl * Math.sin(th), roll: roll + t / TURN * Math.PI * Math.abs(gap) / 2, walking: true,
      };
    }
    t -= TURN; roll += Math.PI * Math.abs(gap) / 2;
  }
  return { a: a0, lane: laneOf(0), ua: 1, ul: 0, roll, walking: false };
}

export function pushTerroirTeams(items, L, band, now) {
  if (!terroirLifeTune.on || band > 5 || CM.season === WINTER || !L || !L.tiles) return;
  // Le soir, on rentre : l'attelage s'efface quand la nuit tombe et revient au matin.
  const alpha = Math.max(0, Math.min(1, (0.55 - (CM.nightF || 0)) / 0.3));
  if (alpha <= 0) return;
  const T = CM.TILE, v = Math.max(0.05, terroirLifeTune.speed);
  for (const t of L.tiles) {
    if (t.buildingId !== 'irrigated_fields' || !t.rural || ((t.parcel | 0) % 2) !== 0) continue;
    const sx = t.spanX || 1, sy = t.spanY || 1;
    if (Math.max(sx, sy) < 3) continue;
    const alongX = sx >= sy, Lc = alongX ? sx : sy, Wc = alongX ? sy : sx;
    const seed = ((t.gx * 73856093) ^ (t.gy * 19349663)) >>> 0;
    const tile = t.gx + ',' + t.gy;
    const at = (a, lane) => ({ x: t.gx + (alongX ? a : lane), y: t.gy + (alongX ? lane : a) });
    // Un signe (paroles/signs.js) : le laboureur s'arrête, et son attelage avec lui ; leur
    // temps prend du retard (`_signLag`, s), qu'ils rattrapent ensuite.
    const fig = _ploughmen.get(seed);
    const time = (now || 0) / 1000 - ((fig && fig._signLag) || 0) + (seed % 997) / 9.7;
    if (CM.season === SUMMER) {
      // LES MOISSONNEURS : ils avancent ensemble le long du champ (aller, puis retour
      // sur la bande d'à côté), la lieuse un pas derrière.
      const len = Lc - 1.6, vr = 0.11, lap = (2 * len) / vr;
      const u = (time % lap) / lap, fwd = u < 0.5, a = 0.8 + (fwd ? u * 2 : 2 - u * 2) * len;
      const base = Wc * (fwd ? 0.3 : 0.62), ua = fwd ? 1 : -1;
      const crew = [[0, 0, 'reap'], [0.32, -0.18, 'reap'], [0.16, -0.75, 'bind']];
      crew.forEach(([dl, da, role], k) => {
        const p = at(Math.max(0.6, Math.min(Lc - 0.6, a + ua * da)), base + dl);
        const tw = time + k * 1.7;
        // La lieuse s'arrête lier une gerbe (3 s toutes les 7 s) ; les faucheurs, à chaque coup de faux.
        const walking = role === 'bind' ? (tw % 7) > 3 : (tw % 1.6) < 0.9;
        items.push({
          d: isoUnitDepth(p.x * T, p.y * T), kind: 'terroirTeam',
          team: { mode: 'harvest', role, x: p.x, y: p.y, dir: alongX ? (fwd ? 0 : 1) : (fwd ? 2 : 3), roll: time * vr * T, walking, band, seed: seed + k, k, tile, alpha, tw },
        });
      });
      continue;
    }
    const s = ploughAt(seed, Lc, Wc, time, v);
    const p = at(s.a, s.lane);
    const ux = alongX ? s.ua : s.ul, uy = alongX ? s.ul : s.ua;
    items.push({
      d: isoUnitDepth(p.x * T, p.y * T), kind: 'terroirTeam',
      team: { x: p.x, y: p.y, dir: dirOf(ux, uy), ux, uy, roll: s.roll * T, walking: s.walking && !(fig && fig._signDir != null), band, seed, tile, alpha },
    });
  }
}
// Un moissonneur (lot 5) : l'habitant de l'ère, et sa faux qui balaie devant lui ; la
// lieuse, elle, se penche sur la gerbe (son attente animée).
function drawHarvester(ctx, q, now) {
  const T = CM.TILE, z = CM.cam.zoom;
  const p = worldToScreen(q.x * T, q.y * T);
  const spec = agentSpecFor(agentSetForBand(q.band), q.role === 'bind' ? 1 : (q.k === 1 && (q.seed % 3) === 0 ? 1 : 0), q.seed % 3);
  if (!spec) return;
  drawNamedAgentIso(ctx, p.x, p.y, z, spec.name, spec.scale, q.dir, q.walking, now, (q.seed % 7) * 0.13, 1, q.walking ? q.roll : null, true);
  if (q.role !== 'reap') return;
  const u = Math.max(1, Math.round(z));
  const side = (q.dir === 0 || q.dir === 2) ? 1 : -1;
  const sw = Math.sin((q.tw % 1.6) / 1.6 * Math.PI * 2);           // le coup de faux
  const hx = Math.round(p.x + side * 2 * u), hy = Math.round(p.y - 4 * u);
  const bx = Math.round(hx + side * (3 + 2 * sw) * u), by = Math.round(p.y - (0.5 - 0.5 * sw) * u);
  ctx.strokeStyle = '#5a3a1e'; ctx.lineWidth = u;
  ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(bx, by); ctx.stroke();
  ctx.fillStyle = '#c8ccd0';
  ctx.fillRect(Math.min(bx, bx - side * 3 * u), by, 3 * u, u);
}


export function drawTerroirTeam(ctx, it, now) {
  const q = it.team;
  if (!q) return;
  const pa0 = ctx.globalAlpha;
  if (q.alpha != null && q.alpha < 1) { if (q.alpha <= 0.02) return; ctx.globalAlpha = pa0 * q.alpha; }
  if (q.mode === 'harvest') { drawHarvester(ctx, q, now); ctx.globalAlpha = pa0; return; }
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
      // Cliquable : désigné ou survolé, l'anneau sous lui ; la boîte peinte le signale.
      const pp = ploughmanOf(q), mark = focusMark(pp);
      if (mark) drawFocusRingAt(ctx, pf.x, pf.y, sceneRingWidth(T * z * spec.scale * AGENT_SCALE), mark === 2);
      // Le laboureur qui a reçu un signe se tourne vers ce qu'il a vu (paroles/signs.js).
      const sdir = pp._signDir != null ? pp._signDir : q.dir;
      const d = drawNamedAgentIso(ctx, pf.x, pf.y, z, spec.name, spec.scale, sdir, q.walking !== false, now, (q.seed % 7) * 0.13, 1, q.roll, true);
      if (d) noteSceneFigure(pp, 'champ', spec.name, pf.x, pf.y, d);
    }],
  ];
  parts.sort((a, b) => a[0] - b[0]);
  for (const [, fn] of parts) fn();
  ctx.globalAlpha = pa0;
  // LE SON (docs/PLAN-AMBIANCE-SONORE.md, lot 4) : le bœuf ou le cheval qui tire la
  // charrue a le pas de l'attelage, plus discret ; à l'arrêt en bout de sillon, rien.
  if (q.walking !== false) noteEmetteur('attelage', q.x * T, q.y * T, 0.6, now);
}

if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__terroirLife = (o) => { if (o) Object.assign(terroirLifeTune, o); return { ...terroirLifeTune }; };
}
