"use strict";

// Recorders du REGISTRE DE LA CHRONIQUE (state.chronicleStats) — le seul endroit
// qui MUTE les stats à vie. Les sites de jeu/effondrement/GR/mythe appellent ces
// fonctions ; la forme, les defaults et la normalisation vivent dans state.js
// (defaultChronicleStats / normalizeChronicleStats). Tout est plat
// (number/string/map) : `biggestRuinGain` est une string Decimal, lue/écrite via
// D().toString() sans coercition native (le fil-piège valueOf de num.js).
//
// Robustesse : chaque recorder tolère un state.chronicleStats absent (save
// mi-migration, state de test brut) en le régénérant — jamais de throw dans un
// chemin de jeu. Les valeurs négatives/NaN sont clampées à 0 avant cumul.

import { state, defaultChronicleStats } from './state.js';
import { D } from './num.js';

// Le registre courant (régénéré si absent). Retourne null seulement si state
// lui-même n'existe pas encore (import très précoce) — les recorders no-op alors.
function reg() {
  if (!state) return null;
  if (!state.chronicleStats) state.chronicleStats = defaultChronicleStats();
  return state.chronicleStats;
}

const pos = (n) => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : 0;
};

// Cœur commun d'un jeu : une partie de plus, mise cumulée, gain cumulé + record
// du plus gros gain unique, et la Faveur gagnée versée à l'économie à vie.
function bumpGame(game, wagered, won) {
  const s = reg();
  if (!s) return null;
  const g = s.games[game];
  if (!g) return null;
  g.plays += 1;
  g.wagered += pos(wagered);
  const w = pos(won);
  if (w > 0) {
    g.won += w;
    if (w > g.biggest) g.biggest = w;
    s.faveurEarned += w;
  }
  return g;
}

// ── Jeux du temple ───────────────────────────────────────────────────────────

// Osselets (table des augures). `tier` = issue tirée (venus/triple/pair/hollow/dog).
export function recordOsselets({ wagered = 0, won = 0, tier = null } = {}) {
  const g = bumpGame("osselets", wagered, won);
  if (!g) return;
  if (tier === "venus") g.venus += 1;
  else if (tier === "dog") g.dog += 1;
}

// Vol d'Icare, à la RÉSOLUTION (cash-out, crash, ou auto headless). `won` inclut
// déjà le jackpot éventuel ; `jackpot` sert au décompte/records de rafle.
export function recordIcarus({ wagered = 0, won = 0, mult = 0, jackpot = 0, crashed = false } = {}) {
  const s = reg();
  const g = bumpGame("icarus", wagered, won);
  if (!g || !s) return;
  if (crashed) g.crashes += 1;
  const m = Number(mult);
  if (Number.isFinite(m) && m > g.bestMult) g.bestMult = m;
  const jp = pos(jackpot);
  if (jp > 0) {
    g.jackpots += 1;
    if (jp > g.biggestJackpot) g.biggestJackpot = jp;
    if (jp > s.biggestPotRaked) s.biggestPotRaked = jp;
  }
}

// Ticket à gratter. `symbol` = symbole d'issue (venus/soleil marqués en temps fort).
export function recordScratch({ wagered = 0, won = 0, symbol = null } = {}) {
  const g = bumpGame("scratch", wagered, won);
  if (!g) return;
  if (symbol === "venus") g.venus += 1;
  else if (symbol === "soleil") g.soleil += 1;
}

// Vingt-et-un, à la résolution d'une donne. `natural` = blackjack naturel servi ;
// `streak` = la série de victoires courante (on garde le record).
export function recordBlackjack({ wagered = 0, won = 0, natural = false, streak = 0 } = {}) {
  const g = bumpGame("blackjack", wagered, won);
  if (!g) return;
  if (natural) g.naturals += 1;
  const st = pos(streak);
  if (st > g.bestStreak) g.bestStreak = st;
}

// ── Économie de Faveur ───────────────────────────────────────────────────────

// Faveur récoltée au tronc des offrandes (compte aussi comme Faveur gagnée à vie).
export function recordOffering(gain) {
  const s = reg();
  if (!s) return;
  const g = pos(gain);
  s.offeringsCollected += g;
  s.faveurEarned += g;
}

// Faveur dépensée à la Boutique de Faveur (augments, bénédiction, artefacts).
export function recordShopSpend(cost) {
  const s = reg();
  if (!s) return;
  s.faveurSpentShop += pos(cost);
}

// ── Records & superlatifs ────────────────────────────────────────────────────

// À l'effondrement : plus gros gain de ruines, plus long cycle tenu, plus de
// crises stabilisées en un cycle. `ruinGain` peut être Decimal/number/string.
export function recordCollapse({ ruinGain = 0, cycleSec = 0, crises = 0 } = {}) {
  const s = reg();
  if (!s) return;
  if (D(ruinGain).gt(D(s.biggestRuinGain))) s.biggestRuinGain = D(ruinGain).toString();
  const sec = pos(cycleSec);
  if (sec > s.longestCycleSec) s.longestCycleSec = sec;
  const c = pos(crises);
  if (c > s.mostCrisesInCycle) s.mostCrisesInCycle = Math.floor(c);
}

// Montée d'ère la plus rapide : le plus court temps de cycle pour décrocher un
// nouvel âge record. Ignoré hors-ligne (elapsed non pertinent).
export function recordEraGain(elapsedSec) {
  const s = reg();
  if (!s) return;
  const sec = pos(elapsedSec);
  if (sec <= 0) return;
  if (s.fastestEraGainSec === 0 || sec < s.fastestEraGainSec) s.fastestEraGainSec = sec;
}

// ── Horodatages (horloge à vie) ──────────────────────────────────────────────

function grTiming(gr) {
  const s = reg();
  if (!s) return null;
  if (!s.grTimings[gr]) s.grTimings[gr] = { discovered: null, performed: null };
  return s.grTimings[gr];
}

// Jalon du GR n° `gr` découvert (atteint pour la 1re fois) : on grave l'instant
// à vie, une seule fois.
export function recordGrDiscovered(gr) {
  const t = grTiming(gr);
  if (!t) return;
  if (t.discovered == null) t.discovered = reg().lifetimePlaySec;
}

// GR n° `gr` effectué : on grave l'instant à vie (et la découverte si elle
// manquait — un GR effectué a forcément été découvert).
export function recordGrPerformed(gr) {
  const t = grTiming(gr);
  if (!t) return;
  const now = reg().lifetimePlaySec;
  if (t.discovered == null) t.discovered = now;
  t.performed = now;
}

// Mythe accompli : instant à vie + durée du run gagnant + ordre d'accomplissement.
// Idempotent (un mythe ne s'accomplit qu'une fois — on n'écrase pas le 1er sacre).
export function recordMythCompleted(mythId, act, runSec) {
  const s = reg();
  if (!s || typeof mythId !== "string") return;
  if (s.mythTimings[mythId]) return;
  s.mythTimings[mythId] = {
    at: s.lifetimePlaySec,
    runSec: pos(runSec),
    order: Object.keys(s.mythTimings).length + 1,
    act: (typeof act === "number" || typeof act === "string") ? act : 0
  };
}
