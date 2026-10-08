"use strict";
// ── LES POSTES D'ACCOSTAGE DE LA FLOTTE (docs/PLAN-BATEAUX.md §5, lot 4) ──────
//
// Le marchand ne « s'arrête » plus 2,5 s au milieu du fleuve à hauteur du port :
// il vient se ranger BORD À BORD au ponton, charge, décharge, et repart. (Le bateau
// qui y était peint en décor, drawIsoPortBoat, est parti : audit du 05/10, MORT-6.)
//
// Un poste = un point d'eau au pied du ponton (pierMoorings, la géométrie du port
// tenue par la session « port et plage » : elle reste la source), exprimé dans le
// repère de la NAVIGATION (t le long du ruban, lat en travers) pour que la sim y
// conduise le bateau, plus le cap à quai.
//
// Un poste par port : la tête du ponton (le long du fleuve, on y glisse de côté
// sans manœuvre). Les candidats de pierMoorings sont des RÉGLAGES d'un même poste,
// on prend le premier que l'emprise d'un pont ne bloque pas.
//
// Bandes 5-9 (plus de ponton au fleuve) : le poste LIBRE du terminal de commerce,
// publié par isoTradePort (contrat portBerths) — cf. plus bas.

import { CM } from '../layout.js';
import { pierMoorings, pierSiteMoorings, pierPlan, isPierPortTile } from './isoPier.js';
import { portBerths } from './portBerths.js';
import './isoTradePort.js';   // son fournisseur de postes s'enregistre à l'import
import { bridgeBlocks } from './isoBridge.js';
import { BOAT_MODELS, fleetFor, traderLen } from './boatKits.js';
import { worldToScreen } from './projection.js';
import { agentSetForBand, agentSpecFor, drawNamedAgentIso, AGENT_SCALE } from '../agents.js';
import { focusMark, drawFocusRingAt, noteSceneFigure, sceneRingWidth } from '../citizenFocus.js';
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

export function fleetBerths(L) { return berthsOf(L, false); }
// LES REPÈRES DES PORTS sur le ruban (positions t), que le bac et la navette fuient
// (cityMapRuntime : `avoid` de ferrySite / shuttleSite) : les postes de la flotte, plus
// celui qu'AURAIENT la capitainerie et le terminal (même géométrie, rien de cuit).
// ⚠ BUG-17 (audit du 2026-10-05) : ces deux postes fantômes ont quitté la flotte, mais
// ils tenaient le bac et la navette à distance des deux ports du XIXe — sans eux, l'un
// et l'autre changeaient de site dans les villes existantes (bandes 5-9), jusqu'au pied
// du terminal.
export function fleetPortMarks(L) { return berthsOf(L, true).map((b) => b.t); }
function berthsOf(L, marks) {
  const out = [];
  const rv = L && L.river;
  if (!rv || !rv.present || !rv.samples || rv.samples.length < 2 || !rv.cells) return out;
  const c = L.counts || {};
  const band = c.eraBand | 0, ei = c.eraIndex | 0;
  const fl = fleetFor(band);
  if (!fl || !fl.trade) return out;
  const T = CM.TILE;
  // Le poste est coté pour le plus long marchand de l'époque.
  const big = traderLen(band);
  for (const t of L.tiles || []) {
    // Seuls les ports à ponton (isPierPortTile, le même tri que le peintre) : la
    // capitainerie et le terminal bordent l'eau mais n'ont pas de ponton (BUG-17) —
    // ils ne comptent que pour les repères (fleetPortMarks).
    if (t.buildingId !== 'river_ports' || t.type !== 'engine' || t.oldPort) continue;
    const pier = isPierPortTile(t);
    if (!pier && !marks) continue;
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    let wet = false;
    for (let ax = 0; ax < sx && !wet; ax += 1) for (let ay = 0; ay < sy && !wet; ay += 1) {
      const k = (t.gx + ax) + ',' + (t.gy + ay);
      if (rv.cells.has(k) || (rv.banks && rv.banks.has(k))) wet = true;
    }
    if (!wet) continue;
    const pm = pier ? pierMoorings(t, sx, sy, band, ei, big) : pierSiteMoorings(t, sx, sy, band, ei, big);
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
  // L'ESCALE DU TERMINAL DE COMMERCE (audit du 2026-10-05, BUG-17 et MORT-5) : son poste
  // libre, entre les navires-décor, s'il loge le plus long marchand de l'époque. Ni
  // ponton ni porteurs (`pier` nul : le terre-plein n'a pas de tablier) ; le marchand y
  // vient en LONGEANT les navires-décor par le large (`approachLat`), se range de côté
  // une fois arrêté, et s'en écarte de même avant de repartir (riverFleet) — `quay` (la
  // tuile du terminal) et `span` (son quai, en t) disent à la scène du terminal de le
  // peindre tant qu'il y manœuvre. Ce n'est pas un repère pour le bac et la navette :
  // le terminal a déjà le sien (pierSiteMoorings), un second déplaçait leurs sites.
  if (!marks) {
    const beam = Math.max(...fl.trade.map((id) => BOAT_MODELS[id].beam / 32));
    for (const b of portBerths(L, 'commerce')) {
      if (b.decor || !b.out || !b.extent || !(b.maxLen >= big)) continue;
      // Le centre de coque au pied du mur, sur le plan de l'eau (z < 0). La flotte navigue
      // au plan du sol : (x, y, z) se peint où se peindrait (x − z, y − z, 0) (projection.js,
      // ISO_X = 1, ISO_Y = 0,5) — le marchand se range là où se peignent les navires-décor.
      const z = b.z || 0;
      const vx = b.x + b.out.x * beam / 2 - z, vy = b.y + b.out.y * beam / 2 - z;
      if (bridgeBlocks(vx * T, vy * T, (big * 0.55 + 0.3) * T)) continue;
      const pr = projectOnRibbon(rv.samples, vx, vy);
      const inland = projectOnRibbon(rv.samples, vx - b.out.x, vy - b.out.y);
      if (!pr || !inland) continue;
      const side = inland.lat < pr.lat ? -1 : 1;                 // la rive du quai
      const span = [b.extent.x0, b.extent.x1].map((x) => projectOnRibbon(rv.samples, x - z, vy).t).sort((p, q) => p - q);
      out.push({
        id: b.id, x: vx, y: vy, t: pr.t, lat: pr.lat, th: Math.atan2(b.axis.y, b.axis.x), along: 'quay', side, beam: big * 0.3, pier: null, band,
        approachLat: pr.lat - side * b.clear, quay: b.tile, span,
      });
    }
  }
  return out;
}

// ── LES PORTEURS DU PONTON (docs/PLAN-BATEAUX.md, lot 4) ──────────────────────
// Pendant l'escale, deux porteurs de l'ère font la navette sur le tablier : à vide
// vers le bateau, CHARGÉS (la charge de l'ère à l'épaule) vers la rive — on décharge. Leur
// position ne dépend que du temps passé à quai : rien à simuler, rien à sauver.
// `elapsed` = secondes depuis l'amarrage.
// LOT 5 de PLAN-COMPORTEMENTS : ils allaient au métronome (deux demi-cycles exacts,
// pauses fixes), apparaissaient au bout du ponton et disparaissaient en plein pas au
// départ du bateau, et portaient l'amphore à toutes les ères. Désormais chaque
// aller-retour a ses pauses (tirées par porteur et par voyage), ils descendent de la
// rive en fondu et y REMONTENT avant que le bateau ne largue (`dwell` = durée de
// l'escale), un sur trois est une porteuse, et la charge est celle de l'ère
// (PORTER_LOAD). Toujours une fonction pure du temps passé à quai.
const PORTER = { speed: 0.75, pause: [0.8, 2.6], n: 2, fade: 0.5 };
const ph01 = (seed, k, i, salt) => (((((seed | 0) * 2654435761) ^ (k * 40503 + i * 9973 + salt * 7919)) >>> 0) % 1000) / 1000;
// Où en est le porteur k, `t` secondes après sa descente : { a, toShip, walking }.
function porterAt(seed, k, t, a0, len, leg) {
  for (let i = 0; i < 64; i += 1) {
    const p1 = PORTER.pause[0] + (PORTER.pause[1] - PORTER.pause[0]) * ph01(seed, k, i, 1);   // charger au bateau
    const p2 = PORTER.pause[0] + (PORTER.pause[1] - PORTER.pause[0]) * ph01(seed, k, i, 2);   // poser à terre
    if (t < leg) return { a: a0 + (t / leg) * len, toShip: true, walking: true };
    t -= leg;
    if (t < p1) return { a: a0 + len, toShip: false, walking: false };
    t -= p1;
    if (t < leg) return { a: a0 + len - (t / leg) * len, toShip: false, walking: true };
    t -= leg;
    if (t < p2) return { a: a0, toShip: true, walking: false };
    t -= p2;
  }
  return { a: a0, toShip: true, walking: false };
}
export function dockPorters(berth, elapsed, seed = 0, dwell = Infinity) {
  const P = berth && berth.pier;
  if (!P || !(elapsed >= 0)) return [];
  const a0 = -0.45, a1 = Math.max(a0 + 0.6, P.reach - 0.45);
  const len = a1 - a0;
  const leg = len / PORTER.speed;
  const out = [];
  for (let k = 0; k < PORTER.n; k += 1) {
    // Le second descend un peu après le premier — pas pile à la demi-période.
    const start = 1.2 + k * (leg * (0.6 + 0.8 * ph01(seed, k, 0, 3)) + 1);
    // Un signe (paroles/signs.js) : le porteur qui le reçoit s'arrête, son temps prend du
    // retard (`_signLag`, s), qu'il rattrape ensuite ; la fiche ne le propose qu'à qui a
    // encore le temps de finir avant que le bateau ne largue (`left`).
    const fig = _porters.get(seed + ':' + k);
    const t = elapsed - start - ((fig && fig._signLag) || 0);
    if (t < 0) continue;                               // il n'est pas encore descendu
    let st = porterAt(seed, k, t, a0, len, leg);
    let alpha = Math.min(1, t / PORTER.fade);          // il arrive de la rive
    // La fin de l'escale : là où il en est, il regagne la rive (posant sa charge s'il
    // allait la chercher) et s'y efface avant que le bateau ne largue.
    // (dans SON temps : il doit avoir le temps de revenir du bout et de s'effacer)
    const tEnd = dwell - start - leg - PORTER.fade - 0.3;
    if (tEnd <= 0) continue;                           // escale trop courte : il ne descend pas
    if (t > tEnd) {
      const e = porterAt(seed, k, tEnd, a0, len, leg);
      const a = Math.max(a0, e.a - (t - tEnd) * PORTER.speed);
      st = { a, toShip: false, walking: a > a0, carry: !e.toShip };
      if (a <= a0) alpha = Math.max(0, 1 - (t - tEnd - (e.a - a0) / PORTER.speed) / PORTER.fade);
    }
    if (alpha <= 0) continue;
    const toShip = st.toShip;
    // Un pas de côté par porteur : ils se croisent sans se traverser.
    const c = (k ? 0.16 : -0.16);
    const ac = P.dx ? { x: 0, y: 1 } : { x: 1, y: 0 };
    const sgn = toShip ? 1 : -1;
    const wdx = P.dx * sgn, wdy = P.dy * sgn;
    const dir = Math.abs(wdx) > Math.abs(wdy) ? (wdx > 0 ? 0 : 1) : (wdy > 0 ? 2 : 3);
    const sd = fig && fig._signDir != null ? fig._signDir : null;
    out.push({
      x: P.rx + P.dx * st.a + ac.x * c, y: P.ry + P.dy * st.a + ac.y * c, z: P.deckZ,
      dir: sd != null ? sd : dir, walking: sd != null ? false : st.walking, carry: st.carry != null ? st.carry : !toShip, dist: t * PORTER.speed * CM.TILE, k, seed, berthId: berth.id,
      alpha, charType: ph01(seed, k, 0, 4) < 0.34 ? 1 : 0, load: PORTER_LOAD[Math.max(0, Math.min(9, (berth.band | 0)))],
      left: dwell - elapsed,
    });
  }
  return out;
}

// LES MÊMES PORTEURS TOUTE L'ESCALE (fiche d'habitant, citizenFocus.js) : un objet
// par bateau et par rang, gardé d'une frame à l'autre — on peut le désigner et le
// suivre. dockPorters, lui, rend des positions neuves à chaque frame ; on les recopie
// ici. Ils PARTENT AVEC LEUR BATEAU (audit du 05/10, MEM-9) : un bateau ne revient
// jamais (chaque naissance prend un id neuf, `seed` = son id), et la Map gagnait deux
// entrées par escale, sans fin — passé PORTERS_SWEEP entrées, celles des bateaux qui
// ne sont plus sur le fleuve sont retirées.
const _porters = new Map();
const PORTERS_SWEEP = 64;
function sweepPorters() {
  const alive = new Set();
  for (const sh of CM.ships || []) alive.add(sh.id);
  for (const [key, pp] of _porters) if (!alive.has(pp.shipId)) _porters.delete(key);
}
export const portersSize = () => _porters.size;
export function porterOf(q) {
  const key = q.seed + ':' + q.k;
  let pp = _porters.get(key);
  if (!pp) {
    if (_porters.size >= PORTERS_SWEEP) sweepPorters();
    pp = { charType: q.charType | 0, figSeed: ((q.seed | 0) * 7919 + q.k * 104729) >>> 0, shipId: q.seed };
    _porters.set(key, pp);
  }
  pp.dir = q.dir; pp.walking = q.walking; pp.carry = q.carry; pp.walkDist = q.walking ? q.dist : null;
  pp.phase = q.k * 0.5; pp.workKey = q.berthId; pp.left = q.left;
  return pp;
}

// Un porteur, à sa profondeur (item 'porter' du peintre).
export function drawDockPorter(ctx, q, band, now) {
  const spec = agentSpecFor(agentSetForBand(band), q.charType | 0, (q.seed + q.k) % 3);
  if (!spec) return;
  const pa0 = ctx.globalAlpha;
  if (q.alpha != null && q.alpha < 1) { if (q.alpha <= 0.02) return; ctx.globalAlpha = pa0 * q.alpha; }
  const T = CM.TILE, z = CM.cam.zoom;
  const p = worldToScreen(q.x * T, q.y * T, q.z * T);
  const pp = porterOf(q);
  const mark = focusMark(pp);
  if (mark) drawFocusRingAt(ctx, p.x, p.y, sceneRingWidth(T * z * spec.scale * AGENT_SCALE), mark === 2);
  const d = drawNamedAgentIso(ctx, p.x, p.y, z, spec.name, spec.scale, q.dir, q.walking, now, q.k * 0.5, 1, q.walking ? q.dist : null, true);
  if (d) noteSceneFigure(pp, 'port', spec.name, p.x, p.y, d);
  if (q.carry) drawPorterLoad(ctx, q.load || 'amphora', p, q.dir, z);
  ctx.globalAlpha = pa0;
}

// LA CHARGE DE L'ÈRE (lot 5) : sur l'épaule, à la toise du porteur (≈ 8 px d'art),
// cernée d'encre comme les habitants. L'amphore n'était juste qu'à l'Antiquité.
const PORTER_LOAD = ['bundle', 'basket', 'sack', 'sack', 'amphora', 'crate', 'box', 'case', 'case', 'case'];
const LOAD_ART = {
  // [largeur, hauteur, corps, reflet, détail] en px d'art
  bundle: [4, 3, '#8a5a32', '#b07a48', '#5a3a1e'],
  basket: [4, 3, '#c89a4a', '#e0b868', '#8a6a2a'],
  sack: [4, 3, '#d8c08a', '#ecd8a8', '#8a6a3a'],
  amphora: [2, 4, '#c97a4e', '#e8a072', null],
  crate: [4, 4, '#a8743a', '#c8945a', '#6a4422'],
  box: [4, 3, '#c9a46a', '#e0c08a', '#8a6a3a'],
  case: [4, 3, '#b8c4cc', '#dfe8ee', '#7fe8ff'],
};
function drawPorterLoad(ctx, kind, p, dir, z) {
  const A = LOAD_ART[kind] || LOAD_ART.amphora;
  const u = Math.max(1, snapDev(z));
  const [w, h, body, hi, det] = A;
  const x = snapDev(p.x + (dir === 0 || dir === 2 ? 0 : -u) - (w > 2 ? u : 0)), y = snapDev(p.y - (5 + h) * u);   // posée sur l'épaule, pas au-dessus de la tête
  ctx.fillStyle = '#2a1b12';
  ctx.fillRect(x - u, y - u, (w + 2) * u, (h + 2) * u);
  ctx.fillStyle = body;
  ctx.fillRect(x, y, w * u, h * u);
  ctx.fillStyle = hi;
  ctx.fillRect(x, y + u, u, u);
  if (det) {
    ctx.fillStyle = det;
    if (kind === 'crate' || kind === 'box') ctx.fillRect(x, y + Math.floor(h / 2) * u, w * u, u);   // planche, ruban
    else if (kind === 'case') ctx.fillRect(x + (w - 1) * u, y + u, u, u);                             // le voyant
    else ctx.fillRect(x + Math.floor(w / 2) * u, y, u, u);                                           // le lien
  }
}
