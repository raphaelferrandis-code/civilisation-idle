"use strict";

// LES FAITS DIVERS — le registre et le rythme (docs/PLAN-FAITS-DIVERS.md).
//
// SEULE source de mutation de `state.faitsDivers` (même modèle que chronicleStats.js) :
// la carte demande « qu'est-ce qui peut apparaître maintenant ? » (fdCandidates) et,
// quand le joueur clique une scène, « inscris ce chapitre » (fdInscrire…). Le reste —
// où la scène se pose, comment elle se dessine — vit dans src/game/map/faitsDivers/.
//
// LE RYTHME (« étalé dans le temps », Raph 2026-10-04 : l'effet de surprise vient
// quand le joueur COMMENCE à comprendre qu'il y a ça dans le jeu) :
//   · rien avant `firstMin` minutes de jeu à vie — le joueur apprend d'abord le jeu ;
//   · une histoire NOUVELLE au plus toutes les `newGapMin` minutes ;
//   · le chapitre suivant d'une histoire commencée attend son `delayMin` ;
//   · Nancy et William n'arrivent qu'une fois deux histoires découvertes ;
//   · les curiosités (gags) après la première histoire, espacées entre elles.
// Toutes les durées sont en temps de jeu À VIE (chronicleStats.lifetimePlaySec) :
// elles traversent les rechargements, les effondrements et le Grand Reset.
import { state } from './state.js';
import { defaultFaitsDivers } from './faitsDiversState.js';
import { FD_STORY_LIST, FD_STORIES, FD_CURIOS, fdNightOf } from '../data/faitsDivers.js';
import { AMOUREUX } from '../data/faitsDiversAmoureux.js';

export const FD_TUNE = {
  on: true,
  firstMin: 25,        // minutes à vie avant la toute première scène
  newGapMin: 35,       // minutes entre deux histoires découvertes
  curioGapMin: 25,     // minutes entre deux curiosités
  curioNeed: 1,        // histoires découvertes avant la première curiosité
  loversAfterMin: 75,  // Nancy et William : pas avant…
  loversNeed: 2,       // … ni avant deux histoires découvertes
  loversBand: 2,       // … ni avant le village de pierre (des bâtiments à visiter)
  delayK: 1,           // multiplicateur de tous les délais (banc d'essai)
};

// Ordre de préférence des PREMIÈRES rencontres (le metteur en scène le suit sept
// fois sur dix) : la secte d'abord — un feu la nuit à la lisière accroche l'œil sans
// rien expliquer —, puis ce qui se voit de plus en plus.
export const FD_INTRO = { secte: 1, musicien: 2, tortue: 3, monstre: 4, cynique: 5, chevre: 6, borne: 7, volant: 8 };

const listeners = new Set();
export function onFaitsDivers(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() {
  for (const fn of listeners) {
    try { fn(); } catch { /* abonné démonté entre-temps */ }
  }
}

export function fdState() {
  if (!state.faitsDivers) state.faitsDivers = defaultFaitsDivers();
  return state.faitsDivers;
}
export const fdLifeSec = () => (state.chronicleStats && state.chronicleStats.lifetimePlaySec) || 0;
export const fdCycle = () => (state.cycles | 0) + 1000 * (state.grandResetCount | 0);

// ── LIRE ─────────────────────────────────────────────────────────────────────
export function fdSeen(storyId, chId) {
  const s = fdState().seen[storyId];
  return !!(s && s[chId]);
}
// Où en est une histoire : combien de chapitres vus (dans l'ordre), quand le dernier.
export function fdProgress(story) {
  const seen = fdState().seen[story.id] || {};
  let n = 0, lastAt = null;
  for (const ch of story.chapters) {
    const r = seen[ch.id];
    if (!r) break;
    n += 1;
    lastAt = r.at;
  }
  return { n, lastAt, done: n >= story.chapters.length };
}
export function fdLoversProgress() {
  const L = fdState().lovers;
  return { n: L.step, lastAt: L.at, done: L.step >= AMOUREUX.steps.length };
}
// Nombre d'histoires dont au moins un chapitre a été vu (Nancy et William compris).
export function fdDiscovered() {
  const seen = fdState().seen;
  let n = 0;
  for (const s of FD_STORY_LIST) if (seen[s.id] && Object.keys(seen[s.id]).length) n += 1;
  if (fdState().lovers.step > 0) n += 1;
  return n;
}
function lastCurioAt() {
  let t = null;
  for (const r of Object.values(fdState().curios)) if (t == null || r.at > t) t = r.at;
  return t;
}

// ── CE QUI PEUT APPARAÎTRE ──────────────────────────────────────────────────
// `ctx` = { band, nightF, life } (life : temps à vie en s, par défaut le vrai).
// Rend la liste des candidats, sans rien tirer : le metteur en scène de la carte
// choisit, place, et garde sa propre mémoire de ce qu'il a déjà montré.
// Nuit : un chapitre « de nuit » demande nightF ≥ 0,5 ; « de jour », nightF ≤ 0,3 ;
// « au soir » (le banc), nightF ≥ 0,12.
export function fdNightOk(night, nightF) {
  if (night === true) return nightF >= 0.5;
  if (night === false) return nightF <= 0.3;
  if (night === 'soir') return nightF >= 0.12;
  return true;
}
export function fdCandidates(ctx) {
  const out = [];
  if (!FD_TUNE.on) return out;
  const fd = fdState();
  const life = ctx.life != null ? ctx.life : fdLifeSec();
  const band = ctx.band | 0, nightF = ctx.nightF || 0;
  const K = 60 * Math.max(0, FD_TUNE.delayK);
  if (life < FD_TUNE.firstMin * K) return out;
  const newOk = fd.lastNewAt == null || life - fd.lastNewAt >= FD_TUNE.newGapMin * K;
  for (const story of FD_STORY_LIST) {
    const pr = fdProgress(story);
    if (pr.done) continue;
    const ch = story.chapters[pr.n];
    if (band < ch.band) continue;
    if (pr.n === 0 ? !newOk : life - (pr.lastAt || 0) < ch.delayMin * K) continue;
    if (!fdNightOk(fdNightOf(story, ch), nightF)) continue;
    out.push({ kind: 'story', story, ch, idx: pr.n, isNew: pr.n === 0, intro: FD_INTRO[story.id] || 9 });
  }
  // Nancy et William.
  const L = fd.lovers;
  if (L.step < AMOUREUX.steps.length) {
    const st = AMOUREUX.steps[L.step];
    let ok;
    if (L.step === 0) {
      ok = newOk && band >= FD_TUNE.loversBand && life >= FD_TUNE.loversAfterMin * K
        && fdDiscovered() >= FD_TUNE.loversNeed;
    } else {
      ok = life - (L.at || 0) >= st.delayMin * K;
    }
    if (ok && fdNightOk(st.dusk ? 'soir' : st.night, nightF)) {
      out.push({ kind: 'lovers', step: st, idx: L.step, isNew: L.step === 0, intro: 4.5 });
    }
  }
  // Les curiosités.
  if (fdDiscovered() >= FD_TUNE.curioNeed) {
    const lc = lastCurioAt();
    if (lc == null || life - lc >= FD_TUNE.curioGapMin * K) {
      for (const g of FD_CURIOS) {
        if (fd.curios[g.id] || band < g.band || !fdNightOk(g.night, nightF)) continue;
        out.push({ kind: 'curio', curio: g });
      }
    }
  }
  return out;
}

// ── INSCRIRE ─────────────────────────────────────────────────────────────────
// Le premier clic sur une scène inscrit son chapitre. Rend true si c'est nouveau.
export function fdInscrire(storyId, chId, band) {
  const story = FD_STORIES[storyId];
  if (!story || !story.chapters.some((c) => c.id === chId)) return false;
  const fd = fdState();
  const life = fdLifeSec();
  const seen = fd.seen[storyId] || (fd.seen[storyId] = {});
  if (seen[chId]) return false;
  const isNew = Object.keys(seen).length === 0;
  seen[chId] = { band: band | 0, at: life };
  if (isNew) fd.lastNewAt = life;
  if (fd.firstAt == null) fd.firstAt = life;
  fd.rev += 1;
  emit();
  return true;
}
export function fdInscrireCurio(gagId, band) {
  if (!FD_CURIOS.some((g) => g.id === gagId)) return false;
  const fd = fdState();
  const life = fdLifeSec();
  const prev = fd.curios[gagId];
  if (prev) { prev.n += 1; return false; }
  fd.curios[gagId] = { band: band | 0, at: life, n: 1 };
  if (fd.firstAt == null) fd.firstAt = life;
  fd.rev += 1;
  emit();
  return true;
}
// Nancy et William : le rendez-vous trouvé. `rec` = ce que la scène retient pour la
// suite — { place, type, next, piste, firstFound }. Le rendez-vous est aussi rangé
// dans `seen.amoureux` (même forme que les autres histoires, pour la Chronique).
export function fdLoversInscrire(stepId, band, rec = {}) {
  const fd = fdState();
  const L = fd.lovers;
  const st = AMOUREUX.steps[L.step];
  if (!st || st.id !== stepId) return false;
  const life = fdLifeSec();
  const seen = fd.seen.amoureux || (fd.seen.amoureux = {});
  seen[stepId] = { band: band | 0, at: life };
  if (L.step === 0) {
    fd.lastNewAt = life;
    if (rec.type) L.first = rec.type;
  }
  if (fd.firstAt == null) fd.firstAt = life;
  L.step += 1;
  L.at = life;
  L.cycle = fdCycle();
  L.next = rec.next || null;
  L.piste = rec.piste | 0;
  L.place = rec.place || null;
  if (rec.firstFound) L.firstFound = rec.firstFound;
  fd.rev += 1;
  emit();
  return true;
}

// Pour la Chronique : les histoires rencontrées, dans l'ordre de leur découverte,
// avec leurs chapitres vus. Rien sur ce qui reste (décision de Raph : aucun indice).
export function fdChronicle() {
  const fd = fdState();
  const out = [];
  const add = (id, title, chapters, trace) => {
    const seen = fd.seen[id];
    if (!seen) return;
    const list = [];
    for (const ch of chapters) {
      const r = seen[ch.id];
      if (r) list.push({ ch, at: r.at, band: r.band });
    }
    if (!list.length) return;
    out.push({ id, title, chapters: list, done: list.length >= chapters.length, trace, firstAt: list[0].at });
  };
  for (const s of FD_STORY_LIST) add(s.id, s.title, s.chapters, s.trace);
  add('amoureux', AMOUREUX.title, AMOUREUX.steps, AMOUREUX.trace);
  out.sort((a, b) => a.firstAt - b.firstAt);
  const curios = FD_CURIOS.filter((g) => fd.curios[g.id])
    .map((g) => ({ g, at: fd.curios[g.id].at, band: fd.curios[g.id].band }))
    .sort((a, b) => a.at - b.at);
  return { stories: out, curios };
}
