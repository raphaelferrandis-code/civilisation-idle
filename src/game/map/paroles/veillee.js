"use strict";

// LA VEILLÉE DE CLAUDE (docs/PLAN-ECOUTER-PARLER.md, lot 5).
//
// Aux deux premières périodes de la gazette, chaque nuit, Claude, le gardien du feu de la
// Chronique, sort de sa tente et va s'asseoir au foyer du camp ; un habitant le rejoint, et
// ils causent. La première fois qu'on les écoute, dans une cité, c'est le déclic (listen.js) :
// à sa dernière réplique, « Mais quelqu'un écoute. », Claude se lève, tourné vers toi, puis
// se rassoit. À l'aube, il rentre dormir et l'autre reprend sa journée.
// Au Bois, le foyer du camp est encore le cœur du village (layout.js, CAMP_HEARTH) : il y
// reste. Sans foyer, il veille devant le culte des ancêtres (Raph, 2026-10-08 : « au feu du
// culte », jusqu'à la période 3) ; sans l'un ni l'autre, il ne sort pas.
//
// Ce sont des passants de la rue (CM.citizens) : la fiche, l'écoute et les signes les
// prennent comme les autres. Claude est fait ici (d'aucun foyer : un prénom, un âge, son
// métier) ; l'autre est un vrai habitant, pris dans la rue ou tiré de chez lui. Ils portent
// `p._veille` { role: 'claude' | 'other', site, seat, seated, … } et `p._react` { act:
// 'veille' } (agents.js : ni salut, ni abri, ni retour du soir). Arrivés à leur place
// (agents.js, but 'veille'), la veillée les tient : assis, tournés vers le feu, la causette.
// Un signe qu'on leur fait passe devant (signs.js) ; ensuite, ils se rassoient.
import { CM } from '../layout.js';
import { citizenReactGo, citizenSpriteName, cityMapWalkRoadKey } from '../agents.js';
import { ageRange } from '../citizenIdentity.js';
import { dayNightMode } from '../dayNightMode.js';
import { getPeriod } from '../../core/chronicleEvaluator.js';
import { VEILLEE_JOB } from '../../data/parolesVeillee.js';

// nightIn / nightOut : il sort quand la nuit tombe, rentre quand le jour est là (CM.nightF).
// lastPeriod : la dernière période de la gazette où il veille (§ 7.2 : les mots viennent
// ensuite). dist : cases entre sa place et le cœur du feu (la case voisine est à 1).
// sitMs : le temps de s'asseoir ou de se lever. recruitR : jusqu'où (cases) on va chercher
// celui qui veille avec lui ; retryMs : s'il est parti, un autre vient après ce temps.
// standMs : au déclic, Claude reste debout le temps de sa réplique. cycleMs : le cycle
// jour-nuit de la carte (cityMapRuntime, DAY_CYCLE_MS), pour qui a choisi le plein jour.
export const VEILLEE = {
  on: true, nightIn: 0.45, nightOut: 0.15, lastPeriod: 2,
  dist: 0.8, sitMs: 900, recruitR: 26, retryMs: 30000, standMs: 6500, cycleMs: 540000,
};
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__veillee = (o) => {
    if (o) Object.assign(VEILLEE, o);
    return { ...VEILLEE, phase: V ? V.phase : null, claude: !!(V && V.claude), other: !!(V && V.other) };
  };
}

const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const tile = () => CM.TILE || 32;
const bandNow = () => ((CM.layout && CM.layout.counts && CM.layout.counts.eraBand) | 0);
const eraNow = () => ((CM.layout && CM.layout.counts && CM.layout.counts.eraIndex) | 0);
const walkable = (gx, gy) => !!(CM.walkRoadSet && CM.walkRoadSet.has(cityMapWalkRoadKey(gx, gy)));
// Cap d'agent vers (dx, dy) monde, comme agents.js : 0 sud-est, 1 nord-ouest, 2 sud-ouest,
// 3 nord-est. On ne s'assoit que tourné vers le sud (les deux vues où la pose existe).
const dirOf = (dx, dy) => (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 1) : (dy > 0 ? 2 : 3));
const sits = (d) => d === 0 || d === 2;
// S'asseoir, se lever : `u` (1 assis, 0 debout) va vers sa cible en `sitMs`, au temps (pas
// à la frame : une frame lente ne le fige pas à mi-hauteur).
const uAt = (W, now) => (W.target == null ? 0 : W.u0 + (W.target - W.u0) * Math.min(1, Math.max(0, (now - W.t0) / VEILLEE.sitMs)));
function aim(W, target, now) {
  if (W.target === target) return;
  W.u0 = uAt(W, now); W.t0 = now; W.target = target;
}

let V = null;          // la veillée de cette nuit : { phase, site, claude, other, … }
let cooldown = 0;      // rien à faire avant (pas de place, pas de chemin)

// ── L'HEURE ──────────────────────────────────────────────────────────────────
// La nuit du ciel ; en « plein jour » choisi dans les Options, l'heure de l'horloge murale
// (le même cycle) : le feu se garde quand même, et le déclic reste à portée.
function hourNow() {
  if (dayNightMode === 'day') {
    const d = (Date.now() / VEILLEE.cycleMs) % 1;
    return d >= 0.6 && d < 0.95 ? 1 : 0;
  }
  return CM.nightF || 0;
}

// ── LE LIEU ──────────────────────────────────────────────────────────────────
// Au foyer du camp : deux places à côté du feu, tournées vers lui et vers toi. Claude au
// nord-ouest, l'autre au nord-est : le feu entre eux et la caméra.
const HEARTH_SEATS = [[-1, 0], [0, -1], [-1, -1], [1, -1]];
function hearthSite(h) {
  const T = tile(), fx = (h.gx + 0.5) * T, fy = (h.gy + 0.5) * T;
  const seats = [];
  for (const [dx, dy] of HEARTH_SEATS) {
    const gx = h.gx + dx, gy = h.gy + dy;
    if (!walkable(gx, gy)) continue;
    const n = Math.hypot(dx, dy), d = dirOf(-dx, -dy);
    const sx = fx + (dx / n) * VEILLEE.dist * T, sy = fy + (dy / n) * VEILLEE.dist * T;
    seats.push({ gx, gy, dir: d, sit: sits(d), ox: sx - (gx + 0.5) * T, oy: sy - (gy + 0.5) * T });
    if (seats.length === 2) break;
  }
  if (seats.length < 2) return null;
  return { kind: 'hearth', gx: h.gx, gy: h.gy, seats, work: { fr: 'Le feu du camp', en: 'The camp fire' } };
}
// Devant le culte des ancêtres : sur son parvis, tournés vers lui.
const NEIGH = [[1, 0], [0, 1], [-1, 0], [0, -1]];
function cultSite() {
  for (const c of CM.workRoadCells || []) {
    const t = c.t;
    if (!t || t.buildingId !== 'ancestral_cult') continue;
    const cx = t.gx + (t.spanX || t.size || 1) / 2, cy = t.gy + (t.spanY || t.size || 1) / 2;
    const dA = dirOf(cx - (c.gx + 0.5), cy - (c.gy + 0.5));
    for (const [dx, dy] of NEIGH) {
      const gx = c.gx + dx, gy = c.gy + dy;
      if (!walkable(gx, gy)) continue;
      const dB = dirOf(cx - (gx + 0.5), cy - (gy + 0.5));
      return {
        kind: 'cult', gx: t.gx, gy: t.gy,
        seats: [
          { gx: c.gx, gy: c.gy, dir: dA, sit: sits(dA), ox: 0, oy: 0 },
          { gx, gy, dir: dB, sit: sits(dB), ox: 0, oy: 0 },
        ],
        work: { fr: 'Le feu du culte', en: 'The shrine fire' },
      };
    }
  }
  return null;
}
export function veilleeSite() {
  const L = CM.layout;
  if (!L || !CM.walkRoadSet) return null;
  return (L.campHearth && hearthSite(L.campHearth)) || cultSite();
}
const sameSite = (a, b) => !!a && !!b && a.kind === b.kind && a.gx === b.gx && a.gy === b.gy;

// ── CLAUDE ───────────────────────────────────────────────────────────────────
// Le plus vieux du camp (l'âge le plus haut d'un ancien, à cet âge de la cité), le dessin
// du vieil homme à la barbe blanche (caveman4). Têtu et râleur : « Comme d'habituuude. »
const CLAUDE_SEED = 0x0C1A0DE5;
function claudeIdentity(p, band) {
  return {
    seed: CLAUDE_SEED, band, sprite: citizenSpriteName(p, band), child: false, fem: false,
    age: ageRange(band, 'old')[1], job: VEILLEE_JOB, traits: ['stubborn', 'grumpy'], epithet: null,
    given: 'Claude', name: 'Claude', family: null, household: null, slot: null, line: null,
  };
}
function keepClaude(p) {
  const band = bandNow();
  if (!p.identity || p.identity.band !== band || p.identity.sprite !== citizenSpriteName(p, band)) p.identity = claudeIdentity(p, band);
  p.name = 'Claude'; p.fem = false;
}
// Il sort de la tente la plus proche du feu (sa porte, le premier seuil d'où l'on y va).
function makeClaude(site) {
  const seat = site.seats[0], T = tile();
  const doors = (CM.homeRoadCells || []).slice().sort((a, b) => (Math.abs(a.gx - seat.gx) + Math.abs(a.gy - seat.gy)) - (Math.abs(b.gx - seat.gx) + Math.abs(b.gy - seat.gy)));
  const tried = new Set();
  for (const r of doors) {
    const k = r.gx + ',' + r.gy;
    if (tried.has(k)) continue;
    tried.add(k);
    if (tried.size > 6) break;
    const p = {
      gx: r.gx, gy: r.gy, x: (r.gx + 0.5) * T, y: (r.gy + 0.5) * T, tx: (r.gx + 0.5) * T, ty: (r.gy + 0.5) * T,
      fade: 0, dir: seat.dir, goal: null, pauseT: 0, phase: 0.371,
      charType: 0, skinVariant: 3, home: null, work: null, speed: 9,
      col: '#5d4630', skin: '#d4a878', hat: null, seed: CLAUDE_SEED, fem: false, name: 'Claude',
      role: { fr: 'Gardien du feu', en: 'Fire keeper' }, workLabel: site.work,
      // Né dehors, à la nuit tombée, sans rentrer aussitôt (agents.js, « naître la nuit »).
      _born: true,
    };
    p.identity = claudeIdentity(p, bandNow());
    if (citizenReactGo(p, { kind: 'cell', cell: seat, as: 'veille' })) return p;
  }
  return null;
}

// ── CELUI QUI VEILLE AVEC LUI ────────────────────────────────────────────────
// Le plus proche qui est encore dehors, un adulte, seul (ni compagnon ni meneur) ; sinon
// on va le chercher chez lui. Pas un autre vieux à barbe blanche, s'il y a le choix : on
// doit reconnaître Claude (vu en jeu le 2026-10-08 : deux chamans au coin du feu).
const TWIN = 1000;
function recruit(now) {
  const seat = V.site.seats[1];
  const Q = CM.signRequest;
  const look = citizenSpriteName(V.claude);
  let out = null, bo = Infinity, inn = null, bi = Infinity;
  for (const q of CM.citizens || []) {
    if (q === V.claude || q._veille || q.charType === 2 || q.lead || (q._nf || 0) > 0 || q.leaving) continue;
    if (q._riot || q._dead || q._react || q.scene || (Q && !Q.done && Q.p === q)) continue;
    const near = Math.abs(q.gx - seat.gx) + Math.abs(q.gy - seat.gy);
    if (near > VEILLEE.recruitR) continue;
    const d = near + (citizenSpriteName(q) === look ? TWIN : 0);
    if (q._vanish === undefined && !q._enter) {
      if ((q.fade ?? 1) >= 1 && d < bo) { bo = d; out = q; }
    } else if (q._enter && q._enter.dawn && d < bi) { bi = d; inn = q; }
  }
  const q = out || inn;
  if (!q || !citizenReactGo(q, { kind: 'cell', cell: seat, as: 'veille', wake: q === inn })) {
    V.nextRecruit = now + VEILLEE.retryMs;
    return;
  }
  q._veille = { role: 'other', site: V.site, seat, seated: false, target: null };
  q._react = { act: 'veille', run: false, hurry: 0, stay: 0, pose: null };
  V.other = q;
}

// ── LA VEILLÉE ───────────────────────────────────────────────────────────────
function start(now) {
  if (now < cooldown) return;
  const site = veilleeSite();
  const claude = site ? makeClaude(site) : null;
  if (!claude) { cooldown = now + 20000; return; }
  claude._veille = { role: 'claude', site, seat: site.seats[0], seated: false, target: null };
  claude._react = { act: 'veille', run: false, hurry: 0, stay: 0, pose: null };
  // En tête de la foule : la baisse de la cible (la pluie) renvoie chez eux les derniers.
  CM.citizens.unshift(claude);
  V = { phase: 'on', site, claude, other: null, nextRecruit: now + 2500, siteAt: now + 1000, endAt: 0 };
}
const alive = (p) => !!p && !p._dead && Array.isArray(CM.citizens) && CM.citizens.indexOf(p) >= 0;

// Il lâche la veillée : il se lève, et reprend sa vie (l'autre) ou rentre dormir (Claude,
// par le premier seuil, et quitte la rue).
function release(p) {
  if (!p) return;
  const W = p._veille;
  if (W && W.role === 'claude') p.leaving = true;
  else p._veille = null;
  if (p._react && p._react.act === 'veille') p._react = null;
  p._chatWith = null; p.chatT = 0; p.pauseT = 0; p.goal = null; p._path = null;
}
// La veillée finit : l'autre reprend sa vie, Claude rentre dormir.
function finish() {
  release(V.other);
  V.other = null;
  release(V.claude);
  V.phase = 'end';
}

// La place de chacun, à chaque frame. Rend faux s'il a quitté la veillée.
function tend(p, now) {
  const W = p._veille;
  if (!alive(p) || !W) return false;
  const R = p._react;
  // Un signe passe devant (signs.js) : il lève les yeux, se lève, regarde ; on attend.
  if (R && R.act !== 'veille') { W.seated = false; W.target = null; return true; }
  // L'aube venue, qui n'est pas encore assis ne vient plus.
  if (V.phase !== 'on' && !W.seated) return false;
  if (!R) p._react = { act: 'veille', run: false, hurry: 0, stay: 0, pose: null };
  const seat = W.seat;
  if (!W.seated) {
    const free = p._vanish === undefined && !p._enter;
    if (free && !p.goal && p.gx === seat.gx && p.gy === seat.gy) {
      // Arrivé : il s'assoit (ci-dessous).
      W.seated = true;
      W.target = null;
      W.seatAt = now; W.lox0 = p.lox || 0; W.loy0 = p.loy || 0;
    } else {
      if (free && !p.goal) {
        // Il ne va plus à sa place (un signe l'a fait reculer, partir) : il y retourne,
        // s'il n'est pas allé trop loin.
        const far = Math.abs(p.gx - seat.gx) + Math.abs(p.gy - seat.gy) > VEILLEE.recruitR;
        if (far || !citizenReactGo(p, { kind: 'cell', cell: seat, as: 'veille' })) return false;
      } else if (p._enter) {
        // Rentré chez lui : Claude ressort (le feu l'attend), l'autre reste couché. (Qui
        // ressort de chez lui, sans `_enter`, est en chemin.)
        if (W.role !== 'claude') return false;
        if (!citizenReactGo(p, { kind: 'cell', cell: seat, as: 'veille', wake: true })) return false;
      }
      p._react.pose = null;
      return true;
    }
  }
  // Assis à sa place, tourné vers le feu ; Claude se lève au déclic.
  let up = false;
  const L = CM.listening;
  if (W.role === 'claude' && L && L.declic && (L.p === p || L.q === p)) {
    const last = L.t0 + (L.lines.length - 1) * (L.lineMs || 2800);
    up = now >= last - 300 && now < last + VEILLEE.standMs;
  }
  if (V.phase !== 'on') up = true;
  aim(W, up || !seat.sit ? 0 : 1, now);
  const u = uAt(W, now);
  p.pauseT = Math.max(p.pauseT || 0, 1);
  p.dir = seat.dir;
  p._react.pose = u > 0.02 ? { kind: 'sit', u } : null;
  // Le dernier pas jusqu'à sa place, près du feu (le rendu lit p.x + p.lox).
  const k = Math.min(1, (now - W.seatAt) / 400);
  p.lox = W.lox0 + (seat.ox - W.lox0) * k;
  p.loy = W.loy0 + (seat.oy - W.loy0) * k;
  return true;
}

// À chaque frame (iso/isoSignes.js, avant les signes).
export function veilleeTick(now = clock()) {
  if (!CM.layout || !Array.isArray(CM.citizens)) { V = null; return null; }
  const period = getPeriod(eraNow()) <= VEILLEE.lastPeriod;
  if (!V) {
    if (VEILLEE.on && period && hourNow() >= VEILLEE.nightIn) start(now);
    return V;
  }
  const c = V.claude;
  if (!alive(c)) {
    // Rentré dormir (ou la cité est tombée, la foule refaite) : plus de veillée cette
    // nuit-là, ou pas tout de suite.
    if (V.other) release(V.other);
    V = null;
    cooldown = now + 60000;
    return null;
  }
  keepClaude(c);
  // Il rentre dormir : jusqu'à ce qu'il ait passé une porte (agents.js, le partant).
  if (V.phase === 'end') { c.leaving = true; return V; }
  if (V.phase === 'on') {
    let stop = !VEILLEE.on || !period || hourNow() <= VEILLEE.nightOut;
    if (now >= V.siteAt) {
      V.siteAt = now + 1000;
      if (!sameSite(veilleeSite(), V.site)) stop = true;
    }
    // Ils se lèvent, puis s'en vont.
    if (stop) { V.phase = 'rise'; V.endAt = now + VEILLEE.sitMs; }
  }
  if (!tend(c, now)) { finish(); return V; }
  if (V.other && !tend(V.other, now)) {
    release(V.other);
    V.other = null;
    V.nextRecruit = now + VEILLEE.retryMs;
  }
  if (V.phase === 'on' && !V.other && now >= V.nextRecruit && c._veille.seated) recruit(now);
  // La causette : tant qu'ils sont tous deux assis.
  const o = V.other;
  if (V.phase === 'on' && o && c._veille.seated && o._veille && o._veille.seated) {
    c._chatWith = o; o._chatWith = c;
    c.chatT = Math.max(c.chatT || 0, 2); o.chatT = Math.max(o.chatT || 0, 2);
  } else if (c._chatWith) {
    c._chatWith = null;
  }
  if (V.phase === 'rise' && now >= V.endAt) finish();
  return V;
}

// Tout s'arrête (la carte démontée, un test qui repart de zéro). Claude quitte la rue.
export function resetVeillee() {
  if (V) {
    if (V.other) release(V.other);
    if (V.claude && Array.isArray(CM.citizens)) {
      const i = CM.citizens.indexOf(V.claude);
      if (i >= 0) CM.citizens.splice(i, 1);
    }
  }
  V = null; cooldown = 0;
}
export const veilleeNow = () => V;

// ── CE QUE LA FICHE DIT QU'IL FAIT ──────────────────────────────────────────
export function veilleeLabel(p) {
  const W = p && p._veille;
  if (!W || !V) return null;
  if (W.role === 'claude') {
    if (V.phase === 'end') return { fr: 'Rentre dormir', en: 'Going to bed' };
    return W.seated ? { fr: 'Veille le feu', en: 'Keeping the fire' } : { fr: 'Va garder le feu', en: 'Going to keep the fire' };
  }
  return W.seated ? { fr: 'Veille avec Claude', en: 'Keeping watch with Claude' } : { fr: 'Rejoint Claude au feu', en: 'Joining Claude at the fire' };
}
