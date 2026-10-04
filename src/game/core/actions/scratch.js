"use strict";

// Les tickets à gratter — MOTEUR du jeu de grattage du temple (cf. constantes
// SCRATCH_* de balance.js). Mise et gain en FAVEUR ; la mise (le prix du ticket)
// est LIBRE entre les limites de la table depuis le lot 1 des gains « vrai casino »
// (2026-10-04). INSTANTANÉ (pas de timer moteur comme Icare) → calqué sur augures.js :
// l'issue est tirée tout de suite, mais l'EFFET est DIFFÉRÉ (option defer +
// apply() idempotent) jusqu'à ce que l'UI ait fini de « gratter » les 9 cases
// — zéro spoiler, float + Faveur synchronisés à la révélation.
//   - playScratch(stake) : paie la mise (Faveur), tire UN symbole d'issue
//     contre les poids de SCRATCH_PRIZES, génère une grille 3×3 COSMÉTIQUE qui
//     matche (le symbole gagnant y apparaît 3 fois ; une perte n'aligne aucun
//     triple).
//   - Gagner = payRound(mise × payoutMult) en Faveur ; `venus` offre en plus un
//     vol d'Icare à la mise du ticket ; `soleil` est le GROS LOT (×5 000).
//     Chaque ticket nourrit la cagnotte sur son edge, sans jamais la rafler.
// Ni fatigue ni registre : la Maison est sa propre économie. L'edge maison
// (25 %, la loterie) est le seul frein — recyclé en partie en cagnotte.

import { state, render, gamePaused, collapseInProgress } from '../state.js';
import { regulationContext } from '../mechanics.js';
import { fmt } from '../utils.js';
import {
  ICARUS_RTP,
  SCRATCH_PRIZES,
  SCRATCH_HISTORY_LEN
} from '../balance.js';
import { chronicle } from './utils.js';
import { grantFreeFlight } from './templeFlights.js';
import { feedPot, drawFromPot, payRound } from './templePot.js';
import { recordWager } from './maisonRang.js';
import { clampStake } from './maisonTable.js';
import { hasTempleArtifact } from './templeArtifacts.js';
import { pushOutcomeFloat } from '../outcomeFloat.js';
import { recordScratch } from '../chronicleStats.js';

// Les symboles sont rendus par des icônes pixel-art RÉUTILISÉES du jeu côté
// scène (scratchSymbols.js mappe chaque clé sur un sprite existant). `tesson`
// est un symbole INERTE de remplissage : jamais une issue, il épaissit
// seulement les grilles sans créer de triple.

const SCRATCH_WEIGHT_TOTAL = SCRATCH_PRIZES.reduce((s, p) => s + p.weight, 0);
const SCRATCH_BY_SYMBOL = Object.fromEntries(SCRATCH_PRIZES.map((p) => [p.symbol, p]));
// Cases de remplissage cosmétique (tous les symboles à lot + le tesson inerte),
// jamais utilisées pour DÉCIDER l'issue.
const FILL_SYMBOLS = ["olive", "amphore", "laurier", "trepied", "chouette", "venus", "soleil", "tesson"];

export function scratchUnlocked(ctx = regulationContext()) {
  return ctx.bestEra >= 2;
}

// La table des lots (fixe : aucun achat ne la touche depuis le lot 1).
export function scratchPrizes() {
  return SCRATCH_PRIZES;
}

// Chance d'un lot sur un ticket (0..1), pour l'aide « ? ».
export function scratchOdds(symbol) {
  const p = SCRATCH_BY_SYMBOL[symbol];
  return p ? p.weight / SCRATCH_WEIGHT_TOTAL : 0;
}

// RTP de RÉFÉRENCE, DÉRIVÉ de la table — jamais saisi à la main. Il inclut : (1) le
// payout NOMINAL exact (payRound est d'espérance exacte) ; (2) la VALEUR du vol
// offert de Vénus (la mise du ticket × le RTP d'Icare). C'est ce total-là que
// feedPot doit connaître : le sous-estimer gonflerait le versement à la cagnotte et
// rongerait l'invariant rtp_base + recycle × (1 − rtp_base) < 1. Indépendant de la
// mise (tout est proportionnel).
export function scratchRtpRef() {
  let rtp = 0;
  for (const p of SCRATCH_PRIZES) {
    if (p.symbol === "blank") continue;
    const w = p.weight / SCRATCH_WEIGHT_TOTAL;
    rtp += w * p.payoutMult;
    if (p.freeFlight) rtp += w * ICARUS_RTP;
  }
  return rtp;
}

// Tirage de l'issue : UN SEUL Math.random() (les tests le pilotent). Retourne
// l'entrée de la table EFFECTIVE (`blank` ou un symbole gagnant).
function drawPrize() {
  const prizes = SCRATCH_PRIZES;
  const r = Math.random() * SCRATCH_WEIGHT_TOTAL;
  let acc = 0;
  for (const p of prizes) {
    acc += p.weight;
    if (r < acc) return p;
  }
  return prizes[0];
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
  if (winSymbol) {
    for (const p of shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]).slice(0, 3)) cells[p] = winSymbol;
  }
  // NEAR-MISS CONTRÔLÉ (2026-07-17, phase 7). L'ancien remplissage (« ≤2 par
  // symbole, repli tesson ») forçait ~2,94 paires sur CHAQUE ticket perdant
  // contre ~1,57 sur un gagnant : le presque-gagné était un bruit de fond
  // constant, et un PERDANT paraissait plus chaud qu'un gagnant. Le nombre de
  // paires-leurres est désormais TIRÉ dans la même distribution des deux côtés
  // (0 : 25 %, 1 : 55 %, 2 : 20 %) : la paire redevient un signal, et il pointe
  // dans le bon sens. Toujours cosmétique pur — appelé APRÈS drawPrize, aucun
  // triple accidentel possible (paires à 2 exactement, le reste en symboles
  // distincts, tesson en repli).
  const r = Math.random();
  // Un PERDANT remplit 9 cases avec 8 symboles : zéro paire y est impossible —
  // son plancher est 1 (le gagnant, à 6 cases libres, peut être net).
  const pairsTarget = Math.max(winSymbol ? 0 : 1, r < 0.25 ? 0 : r < 0.80 ? 1 : 2);
  const pool = shuffle(FILL_SYMBOLS.filter((s) => s !== winSymbol));
  const fillers = [];
  for (let i = 0; i < pairsTarget && i < pool.length; i++) fillers.push(pool[i], pool[i]);
  let si = pairsTarget;
  const empties = shuffle(cells.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0));
  for (const idx of empties) {
    cells[idx] = fillers.length ? fillers.shift() : (pool[si++] ?? "tesson");
  }
  return cells;
}

// Achat + jet d'un ticket. La mise (Faveur) est PAYÉE et l'issue TIRÉE
// immédiatement (la grille est figée pour le grattage), mais tous les EFFETS
// (Faveur, cagnotte, vol offert, float, chronique, historique) sont regroupés
// dans un `apply()` IDEMPOTENT. Sans option `defer`, apply() court aussitôt
// (chemin programmatique, tests). Avec `defer: true`, l'UI le tient jusqu'à la
// révélation par grattage → aucun spoiler. `stake` = le prix du ticket en Faveur
// (ramené dans les limites ; sous la limite basse, refusé). Retourne { symbol, win,
// payoutMult, grid, stakeFaveur, faveurGain, freeFlight, apply } — faveurGain et
// freeFlight peuplés PAR apply() (sur le même objet), lus par l'UI après la
// révélation. Ce jeu ne touche jamais à la cagnotte, il la nourrit.
export function playScratch(stake, options = {}) {
  const opts = (typeof options === "object" && options !== null) ? options : {};
  const { render: doRender = true, defer = false, silent = false, potFunded = false } = opts;
  if (gamePaused || collapseInProgress) return null;
  if (state.crisisLimitAnnounced) return null; // la crise terminale a ses propres autels
  if (!scratchUnlocked()) return null;
  const stakeFaveur = clampStake(stake);
  if (stakeFaveur <= 0) return null;
  if (potFunded) {
    // LA RELANCE (artefact, 2026-07-17) : la CELLA paie la mise, pas le joueur.
    // C'est un TRANSFERT (drawFromPot), jamais un mint — A9-neutre par
    // construction. STRICT : si la cella ne couvre pas la mise ENTIÈRE, pas de
    // relance (un financement partiel minterait la différence).
    if (!hasTempleArtifact("relance")) return null;
    if (Math.floor(Math.max(0, state.icarusPotFaveur || 0)) < stakeFaveur) return null;
    drawFromPot(stakeFaveur);
  } else {
    if ((state.faveur || 0) < stakeFaveur) return null;
    state.faveur = Math.max(0, (state.faveur || 0) - stakeFaveur);
  }

  const prize = drawPrize();                 // ← LE seul random d'issue
  const win = prize.symbol !== "blank";
  const grid = scratchGrid(win ? prize.symbol : null);

  const result = {
    symbol: prize.symbol,
    win,
    payoutMult: prize.payoutMult,
    grid,
    stakeFaveur,
    potFunded: Boolean(potFunded),
    faveurGain: 0,
    freeFlight: false
  };

  let applied = false;
  result.apply = () => {
    if (applied) return result; // idempotent : révélation OU flush à la fermeture
    applied = true;

    const hist = Array.isArray(state.scratchHistory) ? state.scratchHistory : (state.scratchHistory = []);
    hist.push(prize.symbol);
    if (hist.length > SCRATCH_HISTORY_LEN) hist.splice(0, hist.length - SCRATCH_HISTORY_LEN);

    if (win) {
      // payRound : E exact (E[payRound(x)] = x), quelle que soit la mise.
      result.faveurGain = payRound(stakeFaveur * prize.payoutMult);
      state.faveur = Math.max(0, (state.faveur || 0) + result.faveurGain);
      if (prize.freeFlight) {
        // Trois Vénus → vol d'Icare offert à la mise du ticket, comme le Coup de
        // Vénus aux osselets.
        result.freeFlight = grantFreeFlight(stakeFaveur);
        if (result.freeFlight) chronicle(`Trois Vénus sous le vernis : la Maison offre un vol d'Icare.`);
      }
      if (prize.symbol === "soleil") {
        chronicle(`Trois Soleils sous le vernis : le gros lot ! La Maison paie ${fmt(result.faveurGain)} faveur.`);
      }
    }
    // La cagnotte est nourrie sur l'EDGE du ticket, à CHAQUE tirage (gagné comme
    // perdu, cf. feedPot). Cette table ne reprend JAMAIS ce qu'elle verse.
    feedPot(stakeFaveur, scratchRtpRef());
    // La réputation (lot 2) : une relance payée par la cella n'en donne pas.
    recordWager(potFunded ? 0 : stakeFaveur, scratchRtpRef());
    // Registre de la Chronique : un ticket de plus (mise, gain, temps forts
    // trois-Vénus / trois-Soleils via le symbole d'issue). Une relance payée par
    // la CELLA (potFunded) n'est pas une mise du joueur — sa Faveur n'a pas bougé,
    // comme la branche freeFlight d'Icare.
    recordScratch({ wagered: potFunded ? 0 : stakeFaveur, won: result.faveurGain, symbol: prize.symbol });

    if (!silent) {
      const floatLabel = win
        ? (result.freeFlight ? `🎟️ +${fmt(result.faveurGain)} faveur · vol offert` : `🎟️ +${fmt(result.faveurGain)} faveur`)
        : "🎟️ vernis nu";
      pushOutcomeFloat({ label: floatLabel, kind: win ? "gain" : "cost" });
    }
    if (doRender) render();
    return result;
  };

  if (!defer) result.apply();
  return result;
}

// Faveur qu'aurait payée une case gagnante pour un symbole donné et une mise
// en Faveur (utile à l'UI pour la légende des lots). Pur.
export function scratchPayout(symbol, stakeFaveur) {
  const p = SCRATCH_BY_SYMBOL[symbol];
  if (!p || p.payoutMult <= 0) return 0;
  return Math.round((stakeFaveur || 0) * p.payoutMult);
}
