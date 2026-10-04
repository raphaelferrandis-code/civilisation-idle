"use strict";
// ── LES PROMENEURS DES QUAIS ─────────────────────────────────────────────────
//
// Raph (2026-10-01) : « fais-en une voie piétonne, en vérifiant qu'il n'y ait pas de
// problème avec l'autre session ». La promenade des quais (iso/isoQuay.js) avait un
// garde-corps, des réverbères, des escaliers… et personne dessus : les habitants
// marchent sur la voirie, que le quai ne touche pas.
//
// Des FLÂNEURS f(now), sans état ni simulation : chacun longe un tronçon de promenade
// en ville, fait demi-tour au pont ou au bout du quai, et s'arrête de temps en temps
// face à l'eau, accoudé au garde-corps. Deux files, une par sens (on garde sa droite
// en regardant l'aval), plus lentes que les passants des rues.
//
// PARTAGE AVEC LA SESSION DES PERSONNAGES (docs/PLAN-VIVANT.md) — convenu le soir même :
//   · on ne touche NI agents.js, NI isoUnits.js, NI isoLiveCollect.js, NI CM.citizens ;
//   · le dessin est le SIEN, en lecture : drawIsoCitizenItem(ctx, p, now, z), avec un
//     pseudo-habitant { x, y, dir, pauseT, phase, charType, walkDist, skinVariant } —
//     même costume par ère, mêmes métiers, même ombre solaire que les passants ;
//   · son lot D (groupes, arrêts aux étals) reste sur la voirie et les places.
// Le tri du peintre passe par les acteurs de la petite vie (isoVie.registerVieActors),
// à la profondeur d'un habitant (isoUnitDepthEx).
//
// ⚠ Le garde-corps est cuit dans le sol. Sur la rive d'en face (mur visible), il est
// DEVANT le promeneur ; les files sont donc tenues côté terre (0,5 et 0,68 de la
// largeur) : les pieds restent au-dessus de sa lisse à l'écran, rien ne se chevauche.
import { CM, cmHash } from '../layout.js';
import { worldToScreen } from './projection.js';
import { isoUnitDepthEx, drawIsoCitizenItem } from './isoUnits.js';
import { registerVieActors } from './isoVie.js';
import { quayWalkSpans, quayLanePoint } from './isoQuay.js';
import { noteFig, FIG } from '../figures.js';

// Molette : __quayWalk({ on, density, speed }).
export const QUAY_WALK = { on: true, density: 1, speed: 1 };
if (typeof window !== 'undefined') {
  window.__quayWalk = (o) => { if (o) Object.assign(QUAY_WALK, o); _key = ''; return { ...QUAY_WALK }; };
}

const LANES = [0.5, 0.68];        // fraction de la largeur : vers l'aval, vers l'amont
const PER_SAMPLES = 1.1;          // un promeneur pour ~1,1 sample de quai (≈ 1,6 tuile)
const PAIR = 0.33, PAIR_GAP = 0.15; // un sur trois flâne à deux, côte à côte (écart en largeur)
// LOT 5 de PLAN-COMPORTEMENTS : la promenade n'avait que des HOMMES seuls ; elle a ses
// promeneuses, et l'accompagnant d'un sur trois est un enfant. L'accompagnant se tient
// du côté EXTÉRIEUR de sa file (l'eau pour qui descend, la terre pour qui remonte) : à
// 0,65, celui de la file aval croisait la file amont (0,68) en plein. Et l'on se DOUBLE :
// qui rattrape un promeneur plus lent de sa file s'écarte vers le milieu le temps de le
// passer, au lieu de lui marcher au travers.
const MATE_SIDE = [-1, 1];          // file aval : vers l'eau (pas plus près que 0,38 : le garde-corps) ; file amont : vers la terre
const PASS = { gap: 0.45, off: 0.09 };   // en samples ; écart latéral (fraction de largeur)
const SPEED_PX = 4.6;             // px monde / s : un flâneur, plus lent qu'un passant
const DIRS = (tx, ty) => (Math.abs(tx) > Math.abs(ty) ? (tx > 0 ? 0 : 1) : (ty > 0 ? 2 : 3));
// ⚠ BRASSÉ (fmix32) : cmHash de graines voisines (« …:0o », « …:1o ») sort des
// valeurs voisines — les promeneurs d'un tronçon avançaient en paquets de 3 à 5.
const fmix = (h) => { h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0; };
const h01 = (s) => fmix(cmHash(s) >>> 0) / 4294967296;

// Les promeneurs d'un tronçon : tirés une fois par ville (graine = tronçon + rang).
let _key = '', _walkers = [];
function walkers(spans) {
  const key = (CM.layoutRecomputeAt || 0) + ':' + spans.length + ':' + QUAY_WALK.density;
  if (key === _key && _walkers.spans === spans) return _walkers;
  _key = key; _walkers = []; _walkers.spans = spans;
  for (const sp of spans) {
    const len = sp.i1 - sp.i0;
    const n = Math.max(1, Math.round(len / PER_SAMPLES * QUAY_WALK.density));
    for (let j = 0; j < n; j += 1) {
      const sd = 'qw:' + sp.run.ri + ':' + sp.i0 + ':' + j;
      _walkers.push({
        sp, len,
        off: h01(sd + 'o') * 2 * len,                    // où il en est de son aller-retour
        v: (0.75 + 0.5 * h01(sd + 'v')),                 // ±25 % autour du pas de flâneur
        move: 12 + 16 * h01(sd + 'm'),                   // s de marche entre deux arrêts
        stop: 3 + 4 * h01(sd + 's'),                     // s d'arrêt face à l'eau
        night: h01(sd + 'n'),                            // qui rentre quand la nuit tombe
        p: { x: 0, y: 0, lox: 0, loy: 0, dir: 0, pauseT: 0, phase: h01(sd + 'p'),
          charType: h01(sd + 'g') < 0.5 ? 0 : 1, walkDist: 0, skinVariant: fmix(cmHash(sd + 'k') >>> 0) % 12 },
        // Le compagnon : même pas, même arrêt, à côté (côté terre), un autre dessin.
        mate: h01(sd + 'c') < PAIR ? { x: 0, y: 0, lox: 0, loy: 0, dir: 0, pauseT: 0, phase: h01(sd + 'q'),
          charType: h01(sd + 'h') < 0.35 ? 2 : (h01(sd + 'g') < 0.5 ? 1 : 0), walkDist: 0, skinVariant: fmix(cmHash(sd + 'j') >>> 0) % 12 } : null,
      });
    }
  }
  return _walkers;
}

registerVieActors((now, out) => {
  const L = CM.layout;
  if (!QUAY_WALK.on || !L || CM.lodActive || CM.collapseAt) return;
  const band = (L.counts && L.counts.eraBand) | 0;
  if (band < 2) return;                                  // pas de quai au campement
  const spans = quayWalkSpans();
  if (!spans.length) return;
  const T = CM.TILE, t = (now || 0) / 1000, night = CM.nightF || 0;
  const z = CM.cam.zoom;
  // Échantillon moyen (px monde) : la vitesse se donne en px, le parcours en samples.
  const sm = L.river.samples;
  if (!L._quayWalkStep) {
    let d = 0; for (let i = 1; i < sm.length; i += 1) d += Math.hypot(sm[i].x - sm[i - 1].x, sm[i].y - sm[i - 1].y);
    L._quayWalkStep = (d / Math.max(1, sm.length - 1)) * T;
  }
  const stepPx = L._quayWalkStep;
  // Qui reste sur la promenade (lot 4 de PLAN-COMPORTEMENTS) : la nuit ~40 %, sous
  // l'averse ~30 %, l'hiver ~65 %. Chacun a son seuil (w.night) ; près du seuil il
  // s'EFFACE en fondu au lieu de disparaître d'un coup.
  const rain = CM.rainF || 0;
  const th = Math.max(night * 0.6, rain > 0.15 ? rain * 0.7 + 0.1 : 0, (CM.season | 0) === 3 ? 0.35 : 0);
  const live = [];
  for (const w of walkers(spans)) {
    const fade = Math.min(1, (w.night - th) / 0.12);     // un fondu de quelques secondes au crépuscule
    if (fade <= 0) continue;
    const cyc = w.move + w.stop, k = Math.floor(t / cyc), ph = t - k * cyc;
    const moved = k * w.move + Math.min(ph, w.move);      // secondes de marche écoulées
    const paused = ph >= w.move;
    const distPx = moved * SPEED_PX * w.v * QUAY_WALK.speed;
    const per = 2 * w.len;
    const q = (((distPx / stepPx + w.off) % per) + per) % per;
    const fwd = q < w.len;
    const u = w.sp.i0 + (fwd ? q : per - q);
    live.push({ w, u, fwd, paused, distPx, fade, lane: LANES[fwd ? 0 : 1] });
  }
  // On se double : dans une même file, celui qui en suit un autre de près (dans son sens
  // de marche) s'écarte vers le milieu de la promenade.
  const byRun = new Map();
  for (const e of live) {
    const k = e.w.sp.run.ri + ':' + (e.fwd ? 1 : 0);
    if (!byRun.has(k)) byRun.set(k, []);
    byRun.get(k).push(e);
  }
  for (const list of byRun.values()) {
    list.sort((a, b) => a.u - b.u);
    for (let i = 0; i < list.length; i += 1) {
      const e = list[i], ahead = e.fwd ? list[i + 1] : list[i - 1];
      if (!ahead || e.paused) continue;
      const d = Math.abs(ahead.u - e.u);
      if (d < PASS.gap) e.lane += (e.fwd ? 1 : -1) * PASS.off * (1 - d / PASS.gap);
    }
  }
  for (const { w, u, fwd, paused, distPx, fade, lane } of live) {
    const pos = quayLanePoint(w.sp.run, u, lane);
    const p = w.p;
    p.x = pos.x; p.y = pos.y; p.pauseT = paused ? 1 : 0; p.walkDist = distPx; p.fade = fade;
    const s = worldToScreen(pos.x, pos.y);
    if (s.x < -40 || s.x > CM.cw + 40 || s.y < -20 || s.y > CM.ch + 80) continue;
    let dir;
    if (paused) {                                         // face à l'eau, accoudé
      const wtr = quayLanePoint(w.sp.run, u, 0);
      dir = DIRS(wtr.x - pos.x, wtr.y - pos.y);
    } else {
      const a = quayLanePoint(w.sp.run, u + (fwd ? 0.05 : -0.05), lane);
      dir = DIRS(a.x - pos.x, a.y - pos.y);
    }
    p.dir = dir;
    noteFig(pos.x, pos.y, FIG.QUAY | (paused ? 0 : FIG.MOVING));
    out.push({
      wx: pos.x, wy: pos.y, d: isoUnitDepthEx(pos.x, pos.y).d,
      draw(ctx, nowD) { drawIsoCitizenItem(ctx, p, nowD, z); },
    });
    const m = w.mate;
    if (m) {
      const mp = quayLanePoint(w.sp.run, u, Math.max(0.38, Math.min(0.9, lane + MATE_SIDE[fwd ? 0 : 1] * PAIR_GAP)));
      m.x = mp.x; m.y = mp.y; m.dir = dir; m.pauseT = p.pauseT; m.walkDist = distPx + 7; m.fade = fade;
      noteFig(mp.x, mp.y, FIG.QUAY | (paused ? 0 : FIG.MOVING));
      out.push({
        wx: mp.x, wy: mp.y, d: isoUnitDepthEx(mp.x, mp.y).d,
        draw(ctx, nowD) { drawIsoCitizenItem(ctx, m, nowD, z); },
      });
    }
  }
});

// Vérification : les promeneurs du moment (monde, tuiles).
if (typeof window !== 'undefined') {
  window.__quayWalkers = () => _walkers.map((w) => [+(w.p.x / CM.TILE).toFixed(1), +(w.p.y / CM.TILE).toFixed(1), w.p.pauseT ? 'arrêt' : 'marche']);
}
