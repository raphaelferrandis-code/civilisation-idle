"use strict";

// Les tickets à gratter — MOTEUR du jeu de grattage du temple (cf. constantes
// SCRATCH_* de balance.js). Jeu du temple DÉCOUPLÉ (comme osselets/Icare) : la
// mise est en OR (le puits, ancrée en secondes de prod), le GAIN est de la
// FAVEUR (monnaie méta). INSTANTANÉ (pas de timer moteur comme Icare) → calqué
// sur augures.js : l'issue est tirée tout de suite, mais l'EFFET est DIFFÉRÉ
// (option defer + apply() idempotent) jusqu'à ce que l'UI ait fini de « gratter »
// les 9 cases — zéro spoiler, float + Faveur synchronisés à la révélation.
//   - playScratch(stakeId) : paie la mise (or), tire UN symbole d'issue contre
//     les poids de SCRATCH_PRIZES, génère une grille 3×3 COSMÉTIQUE qui matche
//     (le symbole gagnant y apparaît 3 fois ; une perte n'aligne aucun triple).
//   - Gagner = secondes × payoutMult × ICARUS_FAVEUR_K en Faveur ; `venus`
//     offre en plus un vol d'Icare, `soleil` RAFLE la cagnotte PARTAGÉE du temple
//     (state.icarusPotFaveur). Un ticket perdant l'épaissit (SCRATCH_POT_FEED).
// Ni fatigue ni registre : le temple est sa propre économie. L'edge maison
// (~18 %, cf. balance.js) est le seul frein — recyclé en cagnotte.

import { state, render, gamePaused, collapseInProgress } from '../state.js';
import { rates, regulationContext } from '../mechanics.js';
import { D } from '../num.js';
import { fmt } from '../utils.js';
import {
  ICARUS_FAVEUR_K,
  ICARUS_POT_CAP_FAVEUR,
  ICARUS_FREE_FLIGHTS_MAX,
  SCRATCH_STAKES,
  SCRATCH_PRIZES,
  SCRATCH_POT_FEED,
  SCRATCH_HISTORY_LEN
} from '../balance.js';
import { chronicle } from './utils.js';
import { pushOutcomeFloat } from '../outcomeFloat.js';

// Les symboles sont rendus par des SPRITES pixel-art (PixelLab) côté scène
// (ScratchStage → /pixelart/ui/scratch/<symbol>.png). `tesson` est un symbole
// INERTE de remplissage : jamais une issue, il épaissit seulement les grilles
// sans créer de triple.

const SCRATCH_WEIGHT_TOTAL = SCRATCH_PRIZES.reduce((s, p) => s + p.weight, 0);
const SCRATCH_BY_SYMBOL = Object.fromEntries(SCRATCH_PRIZES.map((p) => [p.symbol, p]));
// Cases de remplissage cosmétique (tous les symboles à lot + le tesson inerte),
// jamais utilisées pour DÉCIDER l'issue.
const FILL_SYMBOLS = ["olive", "amphore", "laurier", "trepied", "chouette", "venus", "soleil", "tesson"];

export function scratchUnlocked(ctx = regulationContext()) {
  return ctx.bestEra >= 2;
}

// Mises proposées : N secondes de production d'or courante (plancher plat pour
// les débuts de cycle où la production est faible — comme icarusStakes).
export function scratchStakes() {
  const goldRate = D(rates().gold).max(0);
  return SCRATCH_STAKES.map((s) => ({
    ...s,
    gold: goldRate.mul(s.seconds).max(s.floor).floor()
  }));
}

// Tirage de l'issue : UN SEUL Math.random() (les tests le pilotent). Retourne
// l'entrée de SCRATCH_PRIZES (`blank` ou un symbole gagnant).
function drawPrize() {
  const r = Math.random() * SCRATCH_WEIGHT_TOTAL;
  let acc = 0;
  for (const p of SCRATCH_PRIZES) {
    acc += p.weight;
    if (r < acc) return p;
  }
  return SCRATCH_PRIZES[0];
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Grille 3×3 (9 cases) PEINTE pour matcher l'issue déjà tirée : si `winSymbol`
// (≠ null), il apparaît EXACTEMENT 3 fois et aucun autre symbole n'atteint 3 ;
// si null (perte), aucun symbole n'atteint 3 (near-miss ≤2 autorisé pour le
// suspense). Cosmétique pur — n'utilise le hasard qu'APRÈS le tirage d'issue
// (les tests stubbent le 1er random, celui de drawPrize, et laissent celui-ci).
export function scratchGrid(winSymbol) {
  const cells = new Array(9).fill(null);
  const counts = {};
  if (winSymbol) {
    for (const p of shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]).slice(0, 3)) cells[p] = winSymbol;
    counts[winSymbol] = 3;
  }
  for (let i = 0; i < 9; i++) {
    if (cells[i]) continue;
    // Fillers : ≤2 par symbole (aucun second triple) et jamais le gagnant (il
    // reste figé à 3). Le tesson inerte est le repli quand tout est plafonné.
    const pool = shuffle(FILL_SYMBOLS.filter((s) => s !== winSymbol && (counts[s] || 0) < 2));
    const s = pool[0] || "tesson";
    cells[i] = s;
    counts[s] = (counts[s] || 0) + 1;
  }
  return cells;
}

// Achat + jet d'un ticket. Le coût est PAYÉ et l'issue TIRÉE immédiatement (la
// grille est figée pour le grattage), mais tous les EFFETS (Faveur, cagnotte,
// vol offert, float, chronique, historique) sont regroupés dans un `apply()`
// IDEMPOTENT. Sans option `defer`, apply() court aussitôt (chemin programmatique,
// tests). Avec `defer: true`, l'UI le tient jusqu'à la révélation par grattage
// → aucun spoiler. Retourne { stakeId, symbol, win, payoutMult, grid, seconds,
// faveurGain, jackpotFaveur, freeFlight, sweep, apply } — faveurGain/jackpotFaveur
// peuplés PAR apply() (sur le même objet), lus par l'UI après la révélation.
export function playScratch(stakeId, options = {}) {
  const opts = (typeof options === "object" && options !== null) ? options : {};
  const { render: doRender = true, defer = false } = opts;
  if (gamePaused || collapseInProgress) return null;
  if (state.crisisLimitAnnounced) return null; // la crise terminale a ses propres autels
  if (!scratchUnlocked()) return null;
  const stake = scratchStakes().find((s) => s.id === stakeId);
  if (!stake) return null;
  if (D(state.gold).lt(stake.gold)) return null;
  state.gold = D(state.gold).sub(stake.gold);

  const prize = drawPrize();                 // ← LE seul random d'issue
  const win = prize.symbol !== "blank";
  const grid = scratchGrid(win ? prize.symbol : null);

  const result = {
    stakeId,
    symbol: prize.symbol,
    win,
    payoutMult: prize.payoutMult,
    grid,
    seconds: stake.seconds,
    faveurGain: 0,
    jackpotFaveur: null,
    freeFlight: false,
    sweep: Boolean(prize.sweep)
  };

  let applied = false;
  result.apply = () => {
    if (applied) return result; // idempotent : révélation OU flush à la fermeture
    applied = true;

    const hist = Array.isArray(state.scratchHistory) ? state.scratchHistory : (state.scratchHistory = []);
    hist.push(prize.symbol);
    if (hist.length > SCRATCH_HISTORY_LEN) hist.splice(0, hist.length - SCRATCH_HISTORY_LEN);

    if (win) {
      result.faveurGain = Math.round(stake.seconds * prize.payoutMult * ICARUS_FAVEUR_K);
      state.faveur = Math.max(0, (state.faveur || 0) + result.faveurGain);
      if (prize.freeFlight) {
        // Trois Vénus → vol d'Icare offert (mise Plume payée par le temple),
        // comme le Coup de Vénus aux osselets.
        state.icarusFreeFlights = Math.min(ICARUS_FREE_FLIGHTS_MAX, (state.icarusFreeFlights || 0) + 1);
        result.freeFlight = true;
        chronicle(`Trois Vénus sous le vernis : le temple offre un vol d'Icare.`);
      }
      if (prize.sweep && (state.icarusPotFaveur || 0) > 0) {
        // Trois Soleils → rafle la cagnotte PARTAGÉE du temple (nourrie par les
        // vols brûlés d'Icare, les jets creux d'osselets et les tickets perdants).
        result.jackpotFaveur = Math.round(Math.max(0, state.icarusPotFaveur || 0));
        state.faveur += result.jackpotFaveur;
        state.icarusPotFaveur = 0;
        chronicle(`Trois Soleils ! La cagnotte du temple se déverse (+${fmt(result.jackpotFaveur)} faveur).`);
      }
    } else {
      // Ticket perdant : la mise (en secondes) épaissit la cagnotte partagée.
      const potFeed = stake.seconds * SCRATCH_POT_FEED;
      state.icarusPotFaveur = Math.min(ICARUS_POT_CAP_FAVEUR, Math.max(0, state.icarusPotFaveur || 0) + potFeed);
    }

    const totalFaveur = result.faveurGain + (result.jackpotFaveur || 0);
    const floatLabel = win
      ? (result.jackpotFaveur ? `🎟️ CAGNOTTE +${fmt(totalFaveur)} faveur` : `🎟️ +${fmt(result.faveurGain)} faveur`)
      : "🎟️ vernis nu";
    pushOutcomeFloat({ label: floatLabel, kind: win ? "gain" : "cost" });
    if (doRender) render();
    return result;
  };

  if (!defer) result.apply();
  return result;
}

// Faveur qu'aurait payée une case gagnante pour un symbole donné et une mise en
// secondes (utile à l'UI pour la légende des lots). Pur.
export function scratchPayout(symbol, seconds) {
  const p = SCRATCH_BY_SYMBOL[symbol];
  if (!p || p.payoutMult <= 0) return 0;
  return Math.round(seconds * p.payoutMult * ICARUS_FAVEUR_K);
}
