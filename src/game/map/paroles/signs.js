"use strict";

// LES SIGNES (docs/PLAN-ECOUTER-PARLER.md, lots 4 et 4 bis).
//
// Un geste du joueur vers le passant désigné, choisi dans sa fiche : un souffle de vent
// autour de lui, la lumière plus forte sur lui, le feu le plus proche qui monte, une
// bête qui s'arrête et le fixe. Une pensée dit ce qu'il en fait, par l'âge, par son
// caractère, par la répétition (la première fois la surprise, la deuxième une
// explication, la troisième « Ça suffit. »), et il FAIT ce qu'elle dit (Raph,
// 2026-10-07 : « les comportements du pnj ne changent pas, il marche tranquillement ») :
// il regarde, recule, s'agenouille, te fait signe, reste à chercher des yeux, part en
// courant, rentre s'enfermer chez lui, va prier, court vers sa mère. Les passants
// autour s'arrêtent et regardent aussi. Après la troisième fois, il ne se prête plus au
// jeu : la fiche ne lui propose plus de signe ; aucun délai de recharge, un autre attend.
// Rien ne change au jeu : le feu monte à l'écran, la production ne bouge pas.
//
// Ici ce qui se DÉCIDE et se MÈNE : ce qu'on peut faire, le signe en cours (`CM.sign`,
// l'effet), les réactions en cours (une par personne, plusieurs à la fois), la pensée.
// signTick avance tout à chaque frame (appelé par iso/isoSignes.js). Le dessin (le vent,
// la lumière, les flammes) est dans iso/isoSignes.js ; la bête se tourne dans son propre
// dessin (critters, isoVieTerre). Un passant de la rue part par agents.citizenReactGo et
// porte `p._react` ({ act, run, hurry, stay, pose }), qui le garde de ce qui défairait
// son geste ; un personnage de scène (quai, pont, place, Maison des Plaisirs) s'arrête et
// se tourne par `_signDir` et prend du retard sur sa scène par `_signLag` (s), qu'il
// résorbe ensuite (isoQuayWalk, isoBridge, plazaFolk, isoPlaisirs).
// LE DIALOGUE PAR SIGNES (lot 5) : après le déclic, un passant demande un signe dans sa
// pensée (listen.js pose `CM.signRequest`) ; il s'arrête et attend, les yeux levés. Le
// joueur lui fait ce signe-là, un autre, ou rien : sa pensée le dit (« Le feu a monté. Il
// m'a entendu. », « J'ai demandé le feu, il m'envoie le vent. Ça veut dire non ? »,
// « Comme d'habitude. »), et la cité se souvient de qui a été exaucé.
// ⛔ Des phénomènes naturels seulement (§ 5.4) : ni orbe, ni halo, ni anneau ; le feu
// passe par les flammes existantes. Muets jusqu'à la fin du chantier « ambiance sonore ».
import { CM } from '../layout.js';
import { flameFires, FIRE_BOOST } from '../flameGlow.js';
import { CRITTER_DIR_OF_CAP } from '../critters.js';
import { identityOfPick } from '../citizenFocus.js';
import { citizenReactGo, citizenCanPray, citizenSpriteName, POSE_NAMES, POSE_NONE } from '../agents.js';
import { listenContext, toiRecord, LISTEN } from './listen.js';
import { pickSign } from './pick.js';
import { nearestFire as fireNear } from './nearFire.js';
import { veilleeLabel } from './veillee.js';
import { parolesHeard, parolesNoteSign, parolesNoteHeard } from '../../core/paroles.js';
import { SIGN_KINDS } from '../../core/parolesState.js';
import { PAROLES_SIGNES, PAROLES_REPONSES } from '../../data/parolesSignes.js';

const SIGNES_BY_ID = new Map([...PAROLES_SIGNES, ...PAROLES_REPONSES].map((e) => [e.id, e]));

export { SIGN_KINDS };

// fireReach / beastReach : jusqu'où (en cases) on va chercher le feu, la bête.
// thoughtMs : la pensée vient après le geste (le temps de voir, de s'arrêter).
export const SIGN = { fireReach: 8, beastReach: 5, thoughtMs: 1300, effectMs: 6200 };
// LE DÉROULÉ des gestes, en ms depuis le geste du joueur (une case = `tile()`) :
//   notice   il s'arrête et se tourne vers ce qu'il a vu
//   look     il regarde (devant la bête : il se retourne à turnAt, la regarde à backAt)
//   back     il recule de `dist` cases entre `from` et `to`, puis regarde jusqu'à `end`
//   search   il cherche des yeux jusqu'à `end`, d'un côté puis de l'autre
//   kneel    il descend (`down`, sur `downMs`), reste, se relève (`up`, sur `upMs`)
//   wave     il fait signe `n` fois, chaque geste `ms`
//   leave    il part (fuir, rentrer, prier, courir vers sa mère, repartir)
//   runMs / walkMs : jusqu'où on le tient pour une course, un pas pressé ;
//   home     rentré, il reste enfermé `stay` s ; au culte, `pray` s
//   bleed    un personnage de scène rattrape son retard à cette fraction du temps
//   gawk     les badauds : à `r` cases au plus, `n` au plus, chacun avec la chance `p`,
//            arrêtés de `min` à `max` ms ; un enfant dont le parent est dans la rue
//            court vers lui une fois sur deux (`kid`)
//   wait     (lot 5) il a demandé un signe : il l'attend sur place, tourné vers le feu
//            qu'il veut voir monter (sinon vers toi), jusqu'au bout de sa demande
//   rise     (lot 5) assis à la veillée, il se lève d'abord, en ce temps-là
export const REACT = {
  notice: 250, look: 5200,
  back: { from: 300, to: 650, dist: 0.35, end: 4200 },
  search: { end: 20000 },
  kneel: { down: 500, downMs: 900, up: 6800, upMs: 700, end: 7800 },
  wave: { start: 450, ms: 1300, n: 2, end: 3700 },
  leave: { flee: 800, home: 1000, pray: 1100, parent: 600, go: 1200 },
  runMs: 14000, walkMs: 30000, goMs: 8000,
  stay: { home: 40, pray: 20 },
  bleed: 0.3,
  gawk: { r: 3.5, n: 4, p: 0.7, min: 2400, max: 4200, kid: 0.5 },
  rise: 600,
};
export const BEAST_BEATS = { turnAt: 1700, backAt: 3000 };
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__give = (kind, act) => giveSign(kind, clock(), { act });
  window.__signs = (o) => {
    if (o) Object.assign(SIGN, o);
    return { ...SIGN, on: CM.sign ? CM.sign.kind : null, reactions: [...REACTIONS.values()].map((R) => ({ act: R.act, t: Math.round(clock() - R.t0) })) };
  };
}

const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const tile = () => CM.TILE || 32;
const bandNow = () => ((CM.layout && CM.layout.counts && CM.layout.counts.eraBand) | 0);
// Cap d'agent vers (dx, dy) monde : 0 +x (sud-est), 1 −x (nord-ouest), 2 +y (sud-ouest),
// 3 −y (nord-est), comme agents.js.
const dirOf = (dx, dy) => (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 1) : (dy > 0 ? 2 : 3));
const OPPOSITE = [1, 0, 3, 2];
const PERP = [[2, 3], [2, 3], [0, 1], [0, 1]];
// Face à toi (la caméra) : sud-est ou sud-ouest, le plus proche de là où il regardait.
// Ce sont aussi les deux seules vues où existent les poses (agenouillé, salut).
const towardCamera = (d) => (d === 1 || d === 2 ? 2 : 0);
const feetOf = (p) => ({ x: p.x + (p.lox || 0), y: p.y + (p.loy || 0) });
const cellOf = (w) => ({ gx: Math.floor(w.x / tile()), gy: Math.floor(w.y / tile()) });
const isChild = (p) => p.charType === 2 || !!(p.identity && p.identity.child);
const traitsOf = (p) => (p.identity && p.identity.traits) || [];

// Les bêtes, dans la langue de la pensée : « Ce chien me regarde. »
const BEAST_NAME = {
  dog: { fr: 'ce chien', Fr: 'Ce chien', en: 'that dog', En: 'That dog' },
  cat: { fr: 'ce chat', Fr: 'Ce chat', en: 'that cat', En: 'That cat' },
  goat: { fr: 'cette chèvre', Fr: 'Cette chèvre', en: 'that goat', En: 'That goat' },
  sheep: { fr: 'ce mouton', Fr: 'Ce mouton', en: 'that sheep', En: 'That sheep' },
  cow: { fr: 'cette vache', Fr: 'Cette vache', en: 'that cow', En: 'That cow' },
};

// ── CE QU'ON PEUT FAIRE ──────────────────────────────────────────────────────
// Un passant de la rue, ou un personnage de scène : ceux du quai, du pont, de la place,
// de la Maison des Plaisirs et le laboureur s'arrêtent (leur scène prend du retard) ; le
// porteur du port aussi, s'il a le temps de finir avant que son bateau ne largue ; le
// voyageur du bac ou de la navette tant qu'il attend sur le ponton, et le marin sur son
// pont, se tournent seulement (leur bateau ne les attend pas). Qu'on voit, dehors, et qui
// n'a pas encore dit « Ça suffit. ».
export const SIGN_SCENES = new Set(['quai', 'pont', 'place', 'plaisirs', 'champ', 'port', 'bac', 'navette', 'bateau']);
const PORT_LEFT_MIN = 30;   // s d'escale qu'il faut encore au porteur
function sceneReady(p) {
  const ships = CM.ships || [];
  switch (p.scene) {
    case 'port': return (p.left || 0) >= PORT_LEFT_MIN;
    case 'bac': return !!p.ferryShip && ships.indexOf(p.ferryShip) >= 0 && (p.ferryShip.trip | 0) <= p.trip;
    case 'navette': return !!p.shuttleShip && ships.indexOf(p.shuttleShip) >= 0 && (p.shuttleShip.trip | 0) < p.trip;
    case 'bateau': return !!p.onShip && ships.indexOf(p.onShip) >= 0;
    default: return SIGN_SCENES.has(p.scene);
  }
}
function signable(f) {
  if (!f || (f.kind !== 'citizen' && f.kind !== 'figure')) return false;
  const p = f.p;
  if (!p || p._nightHidden || p._dead || p._riot || p._vanish !== undefined || p._enter) return false;
  if (f.kind === 'figure' && !sceneReady(p)) return false;
  if ((p.fade ?? 1) < 0.5 || (p._sleepFade ?? 1) < 0.5) return false;
  return (p._signN | 0) < 3;
}

// Le feu le plus proche, à portée du signe (nearFire.js).
export function nearestFire(p, fires = flameFires()) {
  return fireNear(p, fires, SIGN.fireReach);
}

// La bête la plus proche : une bête posée (le bétail, le chien couché au seuil) ou le
// chien qu'un autre passant promène. Pas le sien : son chien le regarde tout le temps.
export function nearestBeast(p) {
  if (!p) return null;
  const f = feetOf(p), T = tile(), reach = SIGN.beastReach * T;
  let best = null, bd = Infinity;
  const crs = (CM.layout && CM.layout.critters) || [];
  for (const cr of crs) {
    const x = (cr.gx + 0.5 + cr.jx) * T, y = (cr.gy + 0.5 + cr.jy) * T;
    const d = Math.hypot(x - f.x, y - f.y);
    if (d < bd && d <= reach && BEAST_NAME[cr.kind]) { bd = d; best = { kind: cr.kind, cr, x, y }; }
  }
  const band = bandNow();
  if (band >= 1 && band <= 6) {
    for (const c of CM.citizens || []) {
      const dg = c._vieDog;
      if (!dg || c === p || c._nightHidden || c._vanish !== undefined || (c.fade ?? 1) < 0.5) continue;
      const hx = dg.hx || 1, hy = dg.hy || 0;
      const x = c.x + (c.lox || 0) + hx * T * 0.12 - hy * T * 0.34 * dg.side;
      const y = c.y + (c.loy || 0) + hy * T * 0.12 + hx * T * 0.34 * dg.side;
      const d = Math.hypot(x - f.x, y - f.y);
      if (d < bd && d <= reach) { bd = d; best = { kind: 'dog', dog: dg, master: c, x, y }; }
    }
  }
  return best;
}

// Son père ou sa mère (l'aïeul compte), dans la rue en ce moment, le plus proche : un
// enfant effrayé court vers lui. Seulement un enfant.
export function parentOnStreet(p, maxTiles = 14) {
  const id = p && p.identity;
  if (!id || id.household == null || !id.line || id.line.kind !== 'child' || !Array.isArray(id.line.parents)) return null;
  const T = tile();
  let best = null, bd = maxTiles * T;
  for (const q of CM.citizens || []) {
    if (q === p || q._dead || q._nightHidden || q._vanish !== undefined || q._riot || q._enter) continue;
    const qi = q.identity;
    if (!qi || qi.household !== id.household || !id.line.parents.includes(qi.slot)) continue;
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}

// Ce que la fiche propose au passant désigné, ou null. `busy` : le signe qu'on vient de
// lui faire n'a pas encore fait son effet (la pensée n'est pas venue).
export function signsOffered(now = clock()) {
  const f = CM.focus;
  if (!signable(f)) return null;
  const p = f.p;
  const S = CM.sign;
  return {
    wind: true,
    light: true,
    // Aux âges 7 à 9, ni bêtes ni feux : le vent et la lumière (Raph, 2026-10-08).
    fire: bandNow() <= 6 && !!nearestFire(p),
    beast: bandNow() <= 6 && !!nearestBeast(p),
    busy: !!(S && S.p === p && now < S.thoughtAt),
  };
}

// LES GESTES QU'IL PEUT FAIRE, là où il est : sa pensée n'en annonce pas d'autre (on ne
// pense pas « je vais au temple » sans temple, ni « je rentre » sans logis). Un
// personnage de scène ne quitte pas sa scène : il regarde, cherche des yeux, repart.
const hasPose = (p, kind) => {
  const name = citizenSpriteName(p);
  return !!name && POSE_NAMES.has(name) && !POSE_NONE.has(name + ':' + kind);
};
const canGoHome = (p) => !!p.home || !!(CM.buildingEdgeSet && CM.buildingEdgeSet.size);
export function signActs(p, figure) {
  if (figure) return ['look', 'search', 'go'];
  const acts = ['look', 'back', 'search', 'go', 'flee'];
  if (hasPose(p, 'sit')) acts.push('kneel');
  if (hasPose(p, 'wave')) acts.push('wave');
  if (canGoHome(p)) acts.push('home');
  if (citizenCanPray(p)) acts.push('pray');
  if (isChild(p) && (parentOnStreet(p) || canGoHome(p))) acts.push('parent');
  return acts;
}

// ── LE GESTE ─────────────────────────────────────────────────────────────────
// Rend vrai si le signe est fait. `opts.act` impose son geste (tests, réglage en dev :
// window.__give('light', 'kneel')).
export function giveSign(kind, now = clock(), opts = {}) {
  const f = CM.focus;
  if (!SIGN_KINDS.includes(kind) || !signable(f)) return false;
  const p = f.p, figure = f.kind === 'figure';
  const feet = feetOf(p);
  // Aux âges 7 à 9, ni bêtes ni feux (Raph, 2026-10-08).
  const fire = kind === 'fire' && bandNow() <= 6 ? nearestFire(p) : null;
  const beast = kind === 'beast' && bandNow() <= 6 ? nearestBeast(p) : null;
  if ((kind === 'fire' && !fire) || (kind === 'beast' && !beast)) return false;

  // L'effet qui était en cours s'arrête là (la bête reprend sa pose, le feu retombe).
  endSign();
  const stage = Math.min(3, (p._signN | 0) + 1);
  p._signN = stage;

  // D'où vient ce qu'il regarde : le vent (il se tourne vers où il est venu), la
  // lumière (en haut à gauche, d'où vient le jour du jeu), le feu, la bête.
  const S = { kind, p, figure, stage, t0: now, thoughtAt: now + SIGN.thoughtMs, endAt: now + SIGN.effectMs, feet, face: 1, src: null };
  if (kind === 'wind') {
    // Le sens du vent du moment, sinon un sens tiré : la rafale passe SUR lui.
    const wx = CM.windX || 0;
    const a = Math.abs(wx) > 0.15 ? (wx > 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 0.9 : Math.random() * Math.PI * 2;
    S.wind = { gx: Math.cos(a), gy: Math.sin(a), seed: (Math.random() * 1e9) >>> 0 };
    S.face = dirOf(-S.wind.gx, -S.wind.gy);
    S.src = { x: feet.x - S.wind.gx * tile() * 2, y: feet.y - S.wind.gy * tile() * 2 };
  } else if (kind === 'light') {
    S.face = 1;
    S.src = { x: feet.x - tile() * 2, y: feet.y };
  } else if (kind === 'fire') {
    S.fire = fire;
    S.face = dirOf(fire.G.x - feet.x, fire.G.y - feet.y);
    S.src = { x: fire.G.x, y: fire.G.y };
  } else {
    S.beast = beast;
    S.face = dirOf(beast.x - feet.x, beast.y - feet.y);
    S.src = { x: beast.x, y: beast.y };
    // La bête se tourne vers lui. Le chien promené s'assoit et le fixe, son maître
    // s'arrête avec lui (signTick le tient).
    if (beast.cr) {
      beast.dir0 = beast.cr.dir;
      beast.cr.dir = CRITTER_DIR_OF_CAP[dirOf(feet.x - beast.x, feet.y - beast.y)];
    } else if (beast.dog) {
      beast.dog.stare = { x: feet.x, y: feet.y, until: S.endAt };
    }
  }
  CM.sign = S;

  // La pensée : la situation de l'écoute, plus le signe, la fois, la bête, et les
  // gestes qu'il peut faire ici.
  const ctx = listenContext('thought', p, f.kind);
  ctx.kind = 'sign';
  ctx.sign = kind;
  ctx.stage = stage;
  ctx.beast = beast ? beast.kind : null;
  ctx.acts = signActs(p, figure);
  // IL L'AVAIT DEMANDÉ (lot 5) : c'est la réponse. Le signe qu'il voulait, ou un autre.
  const Q = CM.signRequest;
  const answering = !!(Q && Q.p === p && !Q.done && now <= Q.until);
  if (answering) {
    Q.done = true;
    ctx.answer = kind === Q.sign ? 'yes' : 'other';
    ctx.asked = Q.sign;
  }
  if (beast) {
    const nm = BEAST_NAME[beast.kind];
    ctx.names.bete = { fr: nm.fr, en: nm.en };
    ctx.names.Bete = { fr: nm.Fr, en: nm.En };
    if (beast.master) {
      const id = identityOfPick('citizen', beast.master);
      if (id && id.given) ctx.names.maitre = id.given;
    }
  }
  let r = answering ? pickSign(ctx, parolesHeard(), Math.random, PAROLES_REPONSES) : null;
  if (!r) { ctx.answer = null; r = pickSign(ctx, parolesHeard()); }
  const act = opts.act || (r && r.act) || 'look';
  // La cité a vu qui l'a reçu et ce qu'il a fait (elle en parlera en le nommant, et de
  // celui qui a été exaucé : `ans`) ; et si sa pensée parle de toi, le panneau « Ce
  // qu'on dit de toi » la garde.
  const e = r ? SIGNES_BY_ID.get(r.id) : null;
  parolesNoteSign(kind, r ? r.id : null, {
    seen: ctx.names.a ? { act, who: ctx.names.a, fem: !!(ctx.a && ctx.a.fem), ans: ctx.answer === 'yes' } : null,
    toi: e && e.toi ? toiRecord(r, ctx, e) : null,
  });
  if (r) {
    // Elle passe par l'écoute (la fiche l'affiche comme ses pensées), au moment venu.
    CM.listening = {
      p, q: null, kind: 'thought', id: r.id, lines: r.lines, t0: S.thoughtAt, lineMs: LISTEN.lineMs,
      names: { a: ctx.names.a, b: null }, sign: kind,
    };
  }
  // Ce qu'il fait : le geste de sa pensée (il regarde, s'il n'en a pas).
  startReaction(p, act, S, { figure, now });
  // Les passants autour ont vu aussi.
  startBystanders(p, S, now);
  return true;
}

// ── LES RÉACTIONS ────────────────────────────────────────────────────────────
// Une par personne : le passant désigné, les badauds, l'enfant qui court vers sa mère.
// Une nouvelle remplace la précédente de la même personne.
const REACTIONS = new Map();
export const signReactions = () => REACTIONS;

function startReaction(p, act, S, { figure = false, now = clock(), delay = 0, gawkMs = 0, bystander = false } = {}) {
  const prev = REACTIONS.get(p);
  if (prev) stopReaction(prev);
  const T = tile();
  const R = {
    p, act, figure, bystander, S, t0: now + delay, last: now,
    face: S.face, src: S.src, beast: !bystander && S.kind === 'beast',
    moved: 0, started: false, until: 0, done: false,
  };
  if (bystander) {
    // Le badaud regarde ce qu'il y a à voir : le feu, la bête ; sinon celui à qui ça arrive.
    const f = feetOf(p);
    const to = S.kind === 'fire' || S.kind === 'beast' ? S.src : feetOf(S.p);
    R.face = dirOf(to.x - f.x, to.y - f.y);
    R.holdEnd = gawkMs;
  }
  if (act === 'kneel' || act === 'wave') R.face = towardCamera(R.face);
  if (act === 'back' && R.src) {
    const f = feetOf(p), dx = f.x - R.src.x, dy = f.y - R.src.y, n = Math.hypot(dx, dy) || 1;
    R.backV = { x: (dx / n) * REACT.back.dist * T, y: (dy / n) * REACT.back.dist * T };
  }
  if (act === 'parent') R.parent = parentOnStreet(p);
  // Assis à la veillée de Claude (lot 5) : il se lève d'abord (pas d'un bond), sauf pour
  // s'agenouiller, qui le garde bas.
  const sat = !figure && p._veille && p._react && p._react.pose && p._react.pose.kind === 'sit' ? p._react.pose.u : 0;
  if (sat > 0 && act !== 'kneel') { R.rise = REACT.rise; R.u0 = sat; }
  REACTIONS.set(p, R);
  if (!figure) p._react = { act, run: false, hurry: 0, stay: 0, pose: R.rise ? { kind: 'sit', u: sat } : null };
  return R;
}

// Les passants autour : quelques-uns s'arrêtent et regardent, à leur rythme ; un enfant
// dont le père ou la mère est dans la rue court vers lui.
function startBystanders(p, S, now) {
  const G = REACT.gawk, T = tile(), f = feetOf(p);
  const near = [];
  for (const q of CM.citizens || []) {
    if (q === p || q.lead === p || p.lead === q || REACTIONS.has(q)) continue;
    if (q._nightHidden || q._dead || q._riot || q._enter || q.leaving || q.lead || q._vanish !== undefined || (q.fade ?? 1) < 0.9) continue;
    if ((q.chatT || 0) > 0) continue;
    const d = Math.hypot(q.x + (q.lox || 0) - f.x, q.y + (q.loy || 0) - f.y);
    if (d <= G.r * T) near.push({ q, d });
  }
  near.sort((a, b) => a.d - b.d);
  let n = 0;
  for (const { q } of near) {
    if (n >= G.n) break;
    if (Math.random() >= G.p) continue;
    n += 1;
    const delay = 150 + Math.random() * 600;
    if (isChild(q) && parentOnStreet(q) && Math.random() < G.kid) {
      startReaction(q, 'parent', S, { now, delay, bystander: true });
    } else {
      startReaction(q, 'gawk', S, { now, delay, bystander: true, gawkMs: G.min + Math.random() * (G.max - G.min) });
    }
  }
}

function hold(q, until, now) {
  if (!q) return;
  const s = (until - now) / 1000;
  if (s > 0 && (q.pauseT || 0) < s) q.pauseT = s;
}
// Le moment où il part, et ce qui le fait partir.
const LEAVE = REACT.leave;
function holdEndOf(R) {
  switch (R.act) {
    case 'look': return REACT.look;
    case 'back': return REACT.back.end;
    case 'search': return REACT.search.end;
    case 'kneel': return REACT.kneel.end;
    case 'wave': return REACT.wave.end;
    case 'gawk': return R.holdEnd || REACT.gawk.min;
    case 'wait': return R.holdEnd || 0;
    default: return LEAVE[R.act] || REACT.look;
  }
}

// La pose du moment (agents.citizenPose la lit) : agenouillé, ou le salut.
function poseOf(R, t) {
  if (R.act === 'kneel') {
    const K = REACT.kneel;
    if (t < K.down) return null;
    const down = Math.min(1, (t - K.down) / K.downMs);
    const up = t > K.up ? Math.max(0, 1 - (t - K.up) / K.upMs) : 1;
    return { kind: 'sit', u: Math.min(down, up) };
  }
  if (R.act === 'wave') {
    const W = REACT.wave, s = t - W.start;
    if (s < 0 || s >= W.ms * W.n) return null;
    return { kind: 'wave', u: (s % W.ms) / W.ms };
  }
  return null;
}
// Où il regarde : vers ce qu'il a vu ; devant la bête, il suit son regard (il se
// retourne) puis la regarde de nouveau ; en cherchant, d'un côté puis de l'autre.
const SEARCH = [[0, 0], [2600, 1], [4800, 0], [7000, 2], [9400, 3], [11400, 0], [13800, 1], [16000, 0], [18200, 2]];
function dirAt(R, t) {
  const f = R.face;
  if (R.beast && R.act === 'look' && t >= BEAST_BEATS.turnAt && t < BEAST_BEATS.backAt) return OPPOSITE[f];
  if (R.act === 'search') {
    let k = 0;
    for (let i = 0; i < SEARCH.length; i += 1) if (t >= SEARCH[i][0]) k = SEARCH[i][1];
    return k === 0 ? f : k === 3 ? OPPOSITE[f] : PERP[f][k - 1];
  }
  return f;
}

// Il part : chez lui, au culte, loin de ce qui l'effraie, vers sa mère, ou il repart.
function leave(R, now) {
  const p = R.p, rx = p._react;
  R.started = true;
  const tr = traitsOf(p);
  if (R.act === 'flee') {
    const home = p.home && Math.abs(p.home.gx - p.gx) + Math.abs(p.home.gy - p.gy) <= 30;
    const ok = (home && citizenReactGo(p, { kind: 'home' }))
      || (R.src && citizenReactGo(p, { kind: 'away', from: cellOf(R.src), dist: 7 }))
      || citizenReactGo(p, { kind: 'home' });
    rx.run = true; rx.stay = REACT.stay.home;
    R.until = now + REACT.runMs;
    if (!ok) R.until = now;
  } else if (R.act === 'home') {
    const ok = citizenReactGo(p, { kind: 'home' });
    rx.hurry = tr.includes('grumpy') ? 1.7 : 1.3; rx.stay = REACT.stay.home;
    R.until = ok ? now + REACT.walkMs : now;
  } else if (R.act === 'pray') {
    const ok = citizenReactGo(p, { kind: 'pray' });
    rx.hurry = 1.35; rx.stay = REACT.stay.pray;
    R.until = ok ? now + REACT.walkMs : now;
  } else if (R.act === 'parent') {
    const q = R.parent && !R.parent._nightHidden ? R.parent : null;
    const ok = q ? citizenReactGo(p, { kind: 'cell', cell: { gx: q.gx, gy: q.gy } }) : citizenReactGo(p, { kind: 'home' });
    if (!q) R.parent = null;
    rx.run = true; rx.stay = q ? 0 : REACT.stay.home;
    R.until = ok ? now + REACT.runMs : now;
    R.retarget = now + 700;
  } else {
    // Il repart, en pressant le pas, là où il allait.
    p.pauseT = 0;
    rx.hurry = 1.4;
    R.until = now + REACT.goMs;
  }
}

function stopReaction(R) {
  R.done = true;
  const p = R.p;
  if (R.figure) {
    p._signDir = null;
    // Le retard pris sur sa scène se résorbe ensuite (signTick, `bleed`).
    if ((p._signLag || 0) > 0) BLEED.add(p);
  } else if (p._react) {
    p._react = null;
  }
  // L'enfant qui a rejoint son père ou sa mère peut de nouveau marcher avec lui
  // (citizenReactGo l'avait détaché de son meneur).
  if (R.act === 'parent' && R.met && !p.lead) p._grp = undefined;
  if (REACTIONS.get(p) === R) REACTIONS.delete(p);
}
// Les personnages de scène qui rattrapent leur retard.
const BLEED = new Set();

function tickReaction(R, now) {
  const p = R.p, t = now - R.t0;
  const dt = Math.max(0, Math.min(100, now - R.last)) / 1000;
  R.last = now;
  if (t < 0) return;
  // Il a disparu (rentré, parti, effacé) : fini.
  if (!R.figure && (p._dead || p._nightHidden || p._enter || p._vanish !== undefined || (CM.citizens && CM.citizens.indexOf(p) < 0))) { stopReaction(R); return; }
  const notice = R.bystander ? 0 : REACT.notice;
  const holdEnd = holdEndOf(R);
  // ── tenu sur place ──
  if (t < holdEnd) {
    if (t < notice) return;
    const d = dirAt(R, t);
    if (R.figure) {
      p._signDir = d;
      p._signLag = (p._signLag || 0) + dt;
      return;
    }
    hold(p, R.t0 + holdEnd, now);
    if (p.lead) hold(p.lead, R.t0 + holdEnd, now);
    // Il se lève (la veillée) avant de se tourner : on ne s'assoit que face à toi.
    const rising = R.rise && t < notice + R.rise;
    if (!rising) p.dir = d;
    if (p._react) p._react.pose = rising ? { kind: 'sit', u: R.u0 * (1 - (t - notice) / R.rise) } : poseOf(R, t);
    // Il recule : un pas en arrière, sans quitter des yeux ce qu'il a vu.
    if (R.backV && !p.lead && t >= REACT.back.from) {
      const k = Math.min(1, (t - REACT.back.from) / (REACT.back.to - REACT.back.from));
      const e = k * (2 - k);
      const step = e - R.moved;
      if (step > 0) { p.x += R.backV.x * step; p.y += R.backV.y * step; R.moved = e; }
    }
    return;
  }
  // ── la suite ──
  if (R.act === 'look' || R.act === 'back' || R.act === 'search' || R.act === 'kneel' || R.act === 'wave' || R.act === 'gawk' || R.act === 'wait' || R.figure) {
    if (!R.figure && p._react) p._react.pose = null;
    stopReaction(R);
    return;
  }
  if (!R.started) { leave(R, now); return; }
  // L'enfant qui court vers son père ou sa mère : il le suit des yeux, le rejoint, et
  // ils se regardent un moment.
  if (R.act === 'parent' && R.parent) {
    const q = R.parent;
    const dq = Math.hypot(q.x - p.x, q.y - p.y);
    if (dq <= tile() * 0.9 || R.met) {
      if (!R.met) { R.met = now; p._react.run = false; }
      hold(p, R.met + 3000, now); hold(q, R.met + 3000, now);
      p.dir = dirOf(q.x - p.x, q.y - p.y); q.dir = dirOf(p.x - q.x, p.y - q.y);
      if (now >= R.met + 3000) stopReaction(R);
      return;
    }
    if (now >= R.retarget) {
      R.retarget = now + 700;
      if (q._nightHidden || q._vanish !== undefined) { R.parent = null; citizenReactGo(p, { kind: 'home' }); }
      else if (!p.goal || p.goal.gx !== q.gx || p.goal.gy !== q.gy) citizenReactGo(p, { kind: 'cell', cell: { gx: q.gx, gy: q.gy } });
    }
  }
  // Arrivé (il entre : la porte le prend, cf. plus haut) ou trop long : fini.
  if (now >= R.until) stopReaction(R);
}

// ── LA SCÈNE ─────────────────────────────────────────────────────────────────
// À chaque frame (iso/isoSignes.js) : les réactions avancent, le feu attisé suit son
// enveloppe, et l'effet s'arrête à son heure. Rend le signe en cours, ou null.
export function signEnvelope(S, now) {
  const t = now - S.t0;
  if (t <= 0) return 0;
  const up = Math.min(1, t / 300);
  const down = 1 - Math.max(0, Math.min(1, (t - 2600) / 1400));
  return Math.max(0, Math.min(up, down));
}
// ── LA DEMANDE (lot 5) ───────────────────────────────────────────────────────
// Il a pensé « Si tu m'entends, fais monter le feu. » (listen.js, `CM.signRequest`) : il
// s'arrête et attend. Rien ne vient avant la fin de sa demande, et on le regardait
// encore : « Comme d'habitude. », et il repart. Personne ne le regardait plus : sa
// demande se perd sans qu'on le sache.
function requestTick(now) {
  const Q = CM.signRequest;
  if (!Q || Q.done) return;
  const p = Q.p;
  if (!p || p._dead || p._nightHidden || p._enter || p._vanish !== undefined || (CM.citizens && CM.citizens.indexOf(p) < 0)) { Q.done = true; return; }
  if (!Q.started) {
    Q.started = true;
    // Il lève les yeux : vers le feu qu'il veut voir monter, sinon vers toi.
    const fire = Q.sign === 'fire' ? nearestFire(p) : null;
    const f = feetOf(p);
    const face = fire ? dirOf(fire.G.x - f.x, fire.G.y - f.y) : towardCamera(p.dir < 0 ? 0 : p.dir);
    // (Depuis sa pensée : elle est venue avec sa demande.)
    const t0 = Math.min(now, Q.t0);
    const R = startReaction(p, 'wait', { kind: Q.sign, p, face, src: fire ? { x: fire.G.x, y: fire.G.y } : null }, { now: t0 });
    R.holdEnd = Math.max(0, Q.until - t0);
  }
  if (now <= Q.until) return;
  Q.done = true;
  const f = CM.focus;
  if (!f || f.p !== p || f.kind !== 'citizen') return;
  const ctx = listenContext('thought', p, f.kind);
  ctx.kind = 'sign';
  ctx.answer = 'none';
  ctx.asked = Q.sign;
  ctx.acts = signActs(p, false);
  const r = pickSign(ctx, parolesHeard(), Math.random, PAROLES_REPONSES);
  if (!r) return;
  parolesNoteHeard(r.id);
  CM.listening = {
    p, q: null, kind: 'thought', id: r.id, lines: r.lines, t0: now, lineMs: LISTEN.lineMs,
    names: { a: ctx.names.a, b: null },
  };
  startReaction(p, r.act || 'go', { kind: Q.sign, p, face: p.dir < 0 ? 0 : p.dir, src: null }, { now });
}

let lastBleed = 0;
export function signTick(now = clock()) {
  requestTick(now);
  for (const R of [...REACTIONS.values()]) if (!R.done) tickReaction(R, now);
  // Les personnages de scène rattrapent doucement le temps qu'ils ont passé arrêtés.
  const dt = Math.max(0, Math.min(100, now - (lastBleed || now))) / 1000;
  lastBleed = now;
  for (const p of BLEED) {
    if (REACTIONS.has(p)) continue;
    p._signLag = Math.max(0, (p._signLag || 0) - dt * REACT.bleed);
    if (p._signLag <= 0) BLEED.delete(p);
  }
  const S = CM.sign;
  if (!S) return null;
  if (now >= S.endAt) { endSign(); return null; }
  if (S.beast && S.beast.master) hold(S.beast.master, S.endAt - 400, now);
  if (S.fire) {
    FIRE_BOOST.on = true;
    FIRE_BOOST.k = signEnvelope(S, now);
  }
  return S;
}
// L'effet s'arrête : la bête reprend sa pose, le feu retombe. (Les réactions, elles,
// vont à leur terme.)
export function endSign() {
  const S = CM.sign;
  CM.sign = null;
  FIRE_BOOST.on = false;
  FIRE_BOOST.k = 0;
  if (!S) return;
  if (S.beast) {
    if (S.beast.cr && S.beast.dir0 != null) S.beast.cr.dir = S.beast.dir0;
    if (S.beast.dog) S.beast.dog.stare = null;
  }
}
// Tout s'arrête (la carte démontée, un test qui repart de zéro).
export function resetSigns() {
  endSign();
  CM.signRequest = null;
  for (const R of [...REACTIONS.values()]) stopReaction(R);
  for (const p of BLEED) p._signLag = 0;
  BLEED.clear();
}

// ── CE QUE LA FICHE DIT QU'IL FAIT ──────────────────────────────────────────
// La ligne « Activité » pendant sa réaction : { fr, en } (accordée), ou null.
export function reactionLabel(p, now = clock()) {
  const R = p && REACTIONS.get(p);
  // Sans geste en cours : sa veillée, s'il veille au feu (lot 5).
  if (!R || R.done || now < R.t0) return veilleeLabel(p);
  const fem = !!(p.identity && p.identity.fem);
  switch (R.act) {
    case 'look': case 'gawk': return { fr: 'Regarde', en: 'Looking' };
    case 'back': return { fr: 'Recule', en: 'Stepping back' };
    case 'search': return { fr: 'Cherche des yeux', en: 'Looking around' };
    case 'kneel': return { fr: 'À genoux', en: 'Kneeling' };
    case 'wave': return { fr: 'Fait signe', en: 'Waving' };
    case 'flee': return { fr: 'S’enfuit', en: 'Running away' };
    case 'home': return fem ? { fr: 'Rentre chez elle', en: 'Going home' } : { fr: 'Rentre chez lui', en: 'Going home' };
    case 'pray': return { fr: 'Va prier', en: 'Going to pray' };
    case 'parent': {
      const s = R.parent && R.parent.identity && R.parent.identity.slot;
      if (s === 'f') return { fr: 'Court vers sa mère', en: 'Running to Mum' };
      if (s === 'm') return { fr: 'Court vers son père', en: 'Running to Dad' };
      return { fr: 'Rentre en courant', en: 'Running home' };
    }
    case 'go': return { fr: 'Repart', en: 'Moving on' };
    case 'wait': return { fr: 'Attend un signe', en: 'Waiting for a sign' };
    default: return null;
  }
}
