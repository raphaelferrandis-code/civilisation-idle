"use strict";

// LES SIGNES (docs/PLAN-ECOUTER-PARLER.md, lot 4).
//
// Un geste du joueur vers le passant désigné, choisi dans sa fiche : un souffle de vent
// autour de lui, la lumière plus forte sur lui, le feu le plus proche qui monte, une
// bête qui s'arrête et le fixe. Il réagit (il s'arrête, regarde, se retourne), puis une
// pensée dit ce qu'il en fait : par l'âge, par son caractère, par la répétition (la
// première fois la surprise, la deuxième une explication, la troisième « Ça suffit. »).
// C'est la seule limite : après la troisième, il ne se prête plus au jeu, la fiche ne
// lui propose plus de signe ; aucun délai de recharge, un autre passant attend.
// Rien ne change au jeu : le feu monte à l'écran, la production ne bouge pas.
//
// Ici ce qui se DÉCIDE : ce qu'on peut faire, le signe en cours (`CM.sign`), la
// réaction du passant (signTick, appelé à chaque frame par iso/isoSignes.js) et la
// pensée. Le dessin (le vent, la lumière, les flammes qui montent) est dans
// iso/isoSignes.js ; la bête se tourne dans son propre dessin (critters, isoVieTerre).
// ⛔ Des phénomènes naturels seulement (§ 5.4) : ni orbe, ni halo, ni anneau ; le feu
// passe par les flammes existantes. Muets jusqu'à la fin du chantier « ambiance sonore ».
import { CM } from '../layout.js';
import { screenToWorld } from '../iso/projection.js';
import { flameFires, FIRE_BOOST } from '../flameGlow.js';
import { CRITTER_DIR_OF_CAP } from '../critters.js';
import { identityOfPick } from '../citizenFocus.js';
import { listenContext, LISTEN } from './listen.js';
import { pickSign } from './pick.js';
import { parolesHeard, parolesNoteSign } from '../../core/paroles.js';
import { SIGN_KINDS } from '../../core/parolesState.js';

export { SIGN_KINDS };

// fireReach / beastReach : jusqu'où (en cases) on va chercher le feu, la bête.
// thoughtMs : la pensée vient après le geste (le temps de voir, de s'arrêter).
// holdMs : combien de temps il reste là (la troisième fois, il repart aussitôt).
export const SIGN = { fireReach: 8, beastReach: 5, thoughtMs: 1300, holdMs: 5200, enoughHoldMs: 1900 };
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__signs = (o) => { if (o) Object.assign(SIGN, o); return { ...SIGN, on: CM.sign ? CM.sign.kind : null }; };
}

const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const tile = () => CM.TILE || 32;
const bandNow = () => ((CM.layout && CM.layout.counts && CM.layout.counts.eraBand) | 0);
// Cap d'agent vers (dx, dy) monde : 0 +x (sud-est), 1 −x (nord-ouest), 2 +y (sud-ouest),
// 3 −y (nord-est), comme agents.js.
const dirOf = (dx, dy) => (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 1) : (dy > 0 ? 2 : 3));
const OPPOSITE = [1, 0, 3, 2];
const feetOf = (p) => ({ x: p.x + (p.lox || 0), y: p.y + (p.loy || 0) });

// Les bêtes, dans la langue de la pensée : « Ce chien me regarde. »
const BEAST_NAME = {
  dog: { fr: 'ce chien', Fr: 'Ce chien', en: 'that dog', En: 'That dog' },
  cat: { fr: 'ce chat', Fr: 'Ce chat', en: 'that cat', En: 'That cat' },
  goat: { fr: 'cette chèvre', Fr: 'Cette chèvre', en: 'that goat', En: 'That goat' },
  sheep: { fr: 'ce mouton', Fr: 'Ce mouton', en: 'that sheep', En: 'That sheep' },
  cow: { fr: 'cette vache', Fr: 'Cette vache', en: 'that cow', En: 'That cow' },
};

// ── CE QU'ON PEUT FAIRE ──────────────────────────────────────────────────────
// Un passant (ou un personnage de scène) qu'on voit, dehors, qui n'a pas encore dit
// « Ça suffit. ».
function signable(f) {
  if (!f || (f.kind !== 'citizen' && f.kind !== 'figure')) return false;
  const p = f.p;
  if (!p || p._nightHidden || p._dead || p._vanish !== undefined || p._enter) return false;
  if ((p.fade ?? 1) < 0.5 || (p._sleepFade ?? 1) < 0.5) return false;
  return (p._signN | 0) < 3;
}

// Le feu le plus proche : une des lueurs de feu peintes à la dernière frame
// (flameGlow.flameFires), ramenée au sol. `W` = son point de lueur en monde, ce qui
// permet de la retrouver frame après frame quelle que soit la caméra.
export function nearestFire(p, fires = flameFires()) {
  if (!p || !fires || !fires.length || !CM.cam) return null;
  const f = feetOf(p), T = tile(), reach = SIGN.fireReach * T;
  let best = null, bd = Infinity;
  for (const g of fires) {
    const W = screenToWorld(g.x, g.y);
    // La lueur est à mi-flamme : son pied est un peu plus bas à l'écran, plus au sud.
    const G = screenToWorld(g.x, g.y + g.r * 0.4);
    const d = Math.hypot(G.x - f.x, G.y - f.y);
    if (d < bd && d <= reach) { bd = d; best = { W, G, r: g.r }; }
  }
  return best;
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
    fire: !!nearestFire(p),
    beast: !!nearestBeast(p),
    busy: !!(S && S.p === p && now < S.thoughtAt),
  };
}

// ── LE GESTE ─────────────────────────────────────────────────────────────────
// Rend vrai si le signe est fait.
export function giveSign(kind, now = clock()) {
  const f = CM.focus;
  if (!SIGN_KINDS.includes(kind) || !signable(f)) return false;
  const p = f.p;
  const feet = feetOf(p);
  const fire = kind === 'fire' ? nearestFire(p) : null;
  const beast = kind === 'beast' ? nearestBeast(p) : null;
  if ((kind === 'fire' && !fire) || (kind === 'beast' && !beast)) return false;

  // Ce qui était en cours s'arrête là (la bête reprend sa pose, le feu retombe).
  endSign();
  const stage = Math.min(3, (p._signN | 0) + 1);
  p._signN = stage;

  // D'où vient ce qu'il regarde : le vent (il se tourne vers où il est venu), la
  // lumière (en haut à gauche, d'où vient le jour du jeu), le feu, la bête.
  const S = {
    kind, p, figure: f.kind === 'figure', stage, t0: now,
    thoughtAt: now + SIGN.thoughtMs,
    holdUntil: now + (stage >= 3 ? SIGN.enoughHoldMs : SIGN.holdMs),
    endAt: now + 6200,
    feet,
    face: 1,
  };
  if (kind === 'wind') {
    // Le sens du vent du moment, sinon un sens tiré : la rafale passe SUR lui.
    const wx = CM.windX || 0;
    const a = Math.abs(wx) > 0.15 ? (wx > 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 0.9 : Math.random() * Math.PI * 2;
    S.wind = { gx: Math.cos(a), gy: Math.sin(a), seed: (Math.random() * 1e9) >>> 0 };
    S.face = dirOf(-S.wind.gx, -S.wind.gy);
  } else if (kind === 'light') {
    S.face = 1;
  } else if (kind === 'fire') {
    S.fire = fire;
    S.face = dirOf(fire.G.x - feet.x, fire.G.y - feet.y);
  } else {
    S.beast = beast;
    S.face = dirOf(beast.x - feet.x, beast.y - feet.y);
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

  // La pensée : la situation de l'écoute, plus le signe, la fois, la bête.
  const ctx = listenContext('thought', p, f.kind);
  ctx.kind = 'sign';
  ctx.sign = kind;
  ctx.stage = stage;
  ctx.beast = beast ? beast.kind : null;
  if (beast) {
    const nm = BEAST_NAME[beast.kind];
    ctx.names.bete = { fr: nm.fr, en: nm.en };
    ctx.names.Bete = { fr: nm.Fr, en: nm.En };
    if (beast.master) {
      const id = identityOfPick('citizen', beast.master);
      if (id && id.given) ctx.names.maitre = id.given;
    }
  }
  const r = pickSign(ctx, parolesHeard());
  parolesNoteSign(kind, r ? r.id : null);
  if (r) {
    // Elle passe par l'écoute (la fiche l'affiche comme ses pensées), au moment venu.
    CM.listening = {
      p, q: null, kind: 'thought', id: r.id, lines: r.lines, t0: S.thoughtAt, lineMs: LISTEN.lineMs,
      names: { a: ctx.names.a, b: null }, sign: kind,
    };
  }
  return true;
}

// ── LA SCÈNE ─────────────────────────────────────────────────────────────────
// À chaque frame (iso/isoSignes.js) : il s'arrête et se tourne ; devant une bête, il
// suit son regard (il se retourne, il n'y a personne), puis la regarde de nouveau. Le
// feu attisé suit son enveloppe. Rend le signe en cours, ou null.
export const BEAST_BEATS = { turnAt: 1700, backAt: 3000 };
export function signEnvelope(S, now) {
  const t = now - S.t0;
  if (t <= 0) return 0;
  const up = Math.min(1, t / 300);
  const down = 1 - Math.max(0, Math.min(1, (t - 2600) / 1400));
  return Math.max(0, Math.min(up, down));
}
function hold(q, until, now) {
  if (!q) return;
  const s = (until - now) / 1000;
  if (s > 0 && (q.pauseT || 0) < s) q.pauseT = s;
}
export function signTick(now = clock()) {
  const S = CM.sign;
  if (!S) return null;
  if (now >= S.endAt) { endSign(); return null; }
  const t = now - S.t0;
  const p = S.p;
  // Il s'arrête un quart de seconde après le geste, le temps de le sentir ; le compagnon
  // arrête son meneur avec lui. Les personnages de scène suivent leur scène.
  if (!S.figure && t >= 250 && now < S.holdUntil) {
    hold(p, S.holdUntil, now);
    if (p.lead) hold(p.lead, S.holdUntil, now);
    let d = S.face;
    if (S.kind === 'beast' && t >= BEAST_BEATS.turnAt && t < BEAST_BEATS.backAt) d = OPPOSITE[d];
    p.dir = d;
  }
  if (S.beast && S.beast.master) hold(S.beast.master, S.endAt - 400, now);
  if (S.fire) {
    FIRE_BOOST.on = true;
    FIRE_BOOST.k = signEnvelope(S, now);
  }
  return S;
}
// Le signe s'arrête : la bête reprend sa pose, le feu retombe.
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
