"use strict";

// LA ROULETTE — la table du SALON (lot 3 des gains « vrai casino », 2026-10-04,
// docs/PLAN-GAINS-CASINO.md). Une roue européenne à UN zéro : 37 cases, et chaque pari
// rend 36/37 de la mise sur la durée (97,3 %), quelle que soit sa nature — le plein
// paie 35 contre 1, les chances simples 1 contre 1, douzaines et colonnes 2 contre 1.
// On pose ses jetons sur plusieurs cases du tapis ; la mise TOTALE va de la limite
// basse à la limite haute de la table (que le titre ouvre, comme ailleurs). Le salon,
// et donc la roulette, s'ouvre au titre de Familier (maisonRang.js).
//
//   - spinRoulette(paris) : débite la mise, tire la case, nourrit la cagnotte et la
//     réputation ; son apply() (option `defer`) encaisse le gain à la révélation,
//     quand la bille s'arrête.

import { state, render, gamePaused, collapseInProgress } from '../state.js';
import { ROULETTE_RTP, ROULETTE_UNLOCK_RANK, ROULETTE_HISTORY_LEN } from '../balance.js';
import { tableLimits, maisonRank } from './maisonTable.js';
import { feedPot } from './templePot.js';
import { recordWager } from './maisonRang.js';
import { recordRoulette } from '../chronicleStats.js';
import { pushOutcomeFloat } from '../outcomeFloat.js';
import { fmt } from '../utils.js';

// L'ordre des cases sur la roue européenne, dans le sens horaire depuis le zéro.
export const ROULETTE_WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const ROUGES = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const couleurOf = (n) => (n === 0 ? "vert" : ROUGES.has(n) ? "rouge" : "noir");

const SIMPLES = ["rouge", "noir", "pair", "impair", "manque", "passe"];

// Les paris, par clé : 'n0'…'n36' le plein ; 'rouge', 'noir', 'pair', 'impair',
// 'manque' (1-18), 'passe' (19-36) les chances simples ; 'd1'…'d3' les douzaines ;
// 'c1'…'c3' les colonnes (c1 = 1, 4, 7…). Le zéro ne fait gagner que son plein.
export function betCovers(key, n) {
  if (typeof key !== "string" || !Number.isInteger(n) || n < 0 || n > 36) return false;
  if (/^n\d{1,2}$/.test(key)) return Number(key.slice(1)) === n;
  if (n === 0) return false;
  switch (key) {
    case "rouge": return ROUGES.has(n);
    case "noir": return !ROUGES.has(n);
    case "pair": return n % 2 === 0;
    case "impair": return n % 2 === 1;
    case "manque": return n <= 18;
    case "passe": return n >= 19;
    case "d1": return n <= 12;
    case "d2": return n >= 13 && n <= 24;
    case "d3": return n >= 25;
    case "c1": return n % 3 === 1;
    case "c2": return n % 3 === 2;
    case "c3": return n % 3 === 0;
    default: return false;
  }
}

// Ce que paie un pari gagnant, mise comprise (0 : clé inconnue).
export function betPayout(key) {
  if (typeof key !== "string") return 0;
  if (/^n\d{1,2}$/.test(key)) {
    const v = Number(key.slice(1));
    return v >= 0 && v <= 36 ? 36 : 0;
  }
  if (SIMPLES.includes(key)) return 2;
  if (/^[dc][123]$/.test(key)) return 3;
  return 0;
}
export const isBetKey = (key) => betPayout(key) > 0;

export function rouletteUnlocked() {
  return maisonRank() >= ROULETTE_UNLOCK_RANK;
}

// Les paris assainis : clés connues, montants entiers ≥ 1.
export function cleanBets(bets) {
  const out = {};
  if (!bets || typeof bets !== "object") return out;
  for (const [k, v] of Object.entries(bets)) {
    const a = Math.floor(Number(v));
    if (isBetKey(k) && Number.isFinite(a) && a >= 1) out[k] = a;
  }
  return out;
}
export function betsTotal(bets) {
  return Object.values(cleanBets(bets)).reduce((s, v) => s + v, 0);
}

// Ce que paient ces paris si la bille tombe sur `n` (mise comprise).
export function payoutFor(bets, n) {
  let g = 0;
  for (const [k, v] of Object.entries(cleanBets(bets))) if (betCovers(k, n)) g += v * betPayout(k);
  return g;
}

export function rouletteHistory() {
  return Array.isArray(state.rouletteHistory) ? state.rouletteHistory.slice() : [];
}

// Un tour de roue. Rend { n, couleur, bets, stakeFaveur, faveurGain, wins, apply } ou
// null (table fermée, mise hors limites, Faveur insuffisante).
export function spinRoulette(bets, options = {}) {
  const opts = (typeof options === "object" && options !== null) ? options : {};
  const { render: doRender = true, defer = false, silent = false } = opts;
  if (gamePaused || collapseInProgress || state.crisisLimitAnnounced) return null;
  if (!rouletteUnlocked()) return null;
  const clean = cleanBets(bets);
  const total = betsTotal(clean);
  const { min, max } = tableLimits();
  if (total < min || total > max) return null;
  if ((state.faveur || 0) < total) return null;
  state.faveur = Math.max(0, (state.faveur || 0) - total);
  const n = Math.min(36, Math.floor(Math.random() * 37));
  const faveurGain = payoutFor(clean, n);
  // La cagnotte sur l'avantage, la réputation sur la mise : à chaque tour, gagné comme
  // perdu (cf. feedPot, recordWager).
  feedPot(total, ROULETTE_RTP);
  recordWager(total, ROULETTE_RTP);
  const result = {
    n, couleur: couleurOf(n), bets: clean, stakeFaveur: total, faveurGain,
    wins: Object.keys(clean).filter((k) => betCovers(k, n))
  };
  let applied = false;
  result.apply = () => {
    if (applied) return result;
    applied = true;
    if (faveurGain > 0) state.faveur = Math.max(0, (state.faveur || 0) + faveurGain);
    const hist = Array.isArray(state.rouletteHistory) ? state.rouletteHistory : (state.rouletteHistory = []);
    hist.push(n);
    if (hist.length > ROULETTE_HISTORY_LEN) hist.splice(0, hist.length - ROULETTE_HISTORY_LEN);
    recordRoulette({ wagered: total, won: faveurGain, number: n });
    if (!silent) {
      pushOutcomeFloat({ label: faveurGain > 0 ? `🎡 ${n} : +${fmt(faveurGain)} faveur` : `🎡 ${n}`, kind: faveurGain > 0 ? "gain" : "cost" });
    }
    if (doRender) render();
    return result;
  };
  if (!defer) result.apply();
  return result;
}
