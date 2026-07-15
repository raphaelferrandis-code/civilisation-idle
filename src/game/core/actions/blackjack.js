"use strict";

// Le Vingt-et-un — MOTEUR du blackjack du temple (cf. constantes BLACKJACK_* de
// balance.js). Jeu du temple DÉCOUPLÉ : la mise est en OR (le puits, ancrée en
// secondes de prod), le GAIN est de la FAVEUR. TOUR PAR TOUR, sans timer : l'état
// de la main est un état MODULE éphémère (comme le vol d'Icare) — un rechargement
// en pleine main abandonne la mise (déjà payée). Le croupier (l'oracle) tire
// jusqu'à BLACKJACK_DEALER_STAND ; un « naturel » (21 en 2 cartes) paie 3:2.
//   - dealBlackjack(stakeId) : paie la mise, bat le sabot, donne 2+2 (une carte
//     du croupier cachée) et résout tout de suite un éventuel naturel.
//   - hitBlackjack() : le joueur tire ; s'il crève (>21), la main se résout.
//   - standBlackjack() : le croupier joue, puis la main se résout.
// L'issue (gain de Faveur) est appliquée à la RÉSOLUTION — pas de « defer » : le
// joueur voit ses cartes tomber, aucun spoiler à masquer. Une main perdue
// nourrit la cagnotte PARTAGÉE (state.icarusPotFaveur) ; pas de rafle (skill).
// La main est TAMPONNÉE avec le cycle (hand.cycle) : un effondrement en pleine
// main (state.cycles change) la rend AUTOMATIQUEMENT inactive — la mise est
// abandonnée, on ne peut plus la résoudre dans le cycle suivant (invariant
// « changer de cycle en pleine main abandonne la mise », sans reset inter-module).

import { state, render, gamePaused, collapseInProgress } from '../state.js';
import { rates, regulationContext } from '../mechanics.js';
import { D } from '../num.js';
import { fmt } from '../utils.js';
import {
  ICARUS_FAVEUR_K,
  ICARUS_POT_CAP_FAVEUR,
  BLACKJACK_STAKES,
  BLACKJACK_MULT,
  BLACKJACK_POT_FEED,
  BLACKJACK_DEALER_STAND,
  BLACKJACK_HISTORY_LEN
} from '../balance.js';
import { pushOutcomeFloat } from '../outcomeFloat.js';

// Les 4 « couleurs » = emblèmes antiques (sprites RÉUTILISÉS du scratch,
// /pixelart/ui/scratch/<suit>.png). Le rang porte la valeur ; la couleur est
// purement cosmétique (aucune règle ne dépend de la couleur au blackjack).
export const BLACKJACK_SUITS = ["olive", "amphore", "laurier", "chouette"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

// Main en cours (état module ÉPHÉMÈRE) et dernier résultat, lus par l'UI.
let hand = null;      // { deck, player:[card], dealer:[card], stakeGold, stakeSeconds, phase:'player'|'done', resolved }
let lastOutcome = null; // { result, mult, faveurGain, playerValue, dealerValue, player, dealer }

export function blackjackUnlocked(ctx = regulationContext()) {
  return ctx.bestEra >= 3;
}

// Mises proposées : N secondes de production d'or courante (plancher plat pour
// les débuts de cycle — comme icarusStakes).
export function blackjackStakes() {
  const goldRate = D(rates().gold).max(0);
  return BLACKJACK_STAKES.map((s) => ({
    ...s,
    gold: goldRate.mul(s.seconds).max(s.floor).floor()
  }));
}

// Valeur d'une main : les As valent 11, dégradés à 1 tant que la main crève.
export function handValue(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === "A") { aces += 1; total += 11; }
    else if (c.rank === "10" || c.rank === "J" || c.rank === "Q" || c.rank === "K") total += 10;
    else total += Number(c.rank);
  }
  while (total > 21 && aces > 0) { total -= 10; aces -= 1; }
  return total;
}

export function isBlackjack(cards) {
  return cards.length === 2 && handValue(cards) === 21;
}

// Issue d'une main (fonction PURE, testable) : 'blackjack' | 'win' | 'push' | 'lose'.
export function blackjackResult(player, dealer) {
  const pv = handValue(player);
  const dv = handValue(dealer);
  const pNat = isBlackjack(player);
  const dNat = isBlackjack(dealer);
  if (pv > 21) return "lose";                 // le joueur crève : perdu quoi qu'il arrive
  if (pNat && dNat) return "push";
  if (pNat) return "blackjack";
  if (dNat) return "lose";
  if (dv > 21) return "win";                  // le croupier crève
  if (pv > dv) return "win";
  if (pv < dv) return "lose";
  return "push";
}

function buildDeck() {
  const deck = [];
  for (const suit of BLACKJACK_SUITS) {
    for (const rank of RANKS) deck.push({ rank, suit });
  }
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// Une main est VIVANTE si elle existe, n'est pas résolue ET appartient au cycle
// courant (un effondrement l'abandonne, cf. en-tête).
function handLive() {
  return Boolean(hand && !hand.resolved && hand.cycle === (state.cycles || 0));
}

// Instantané de la main pour l'UI (copies défensives). La scène masque la carte
// cachée du croupier tant que phase === 'player'.
export function blackjackHand() {
  if (!hand) return null;
  return {
    player: hand.player.slice(),
    dealer: hand.dealer.slice(),
    phase: hand.phase,
    resolved: hand.resolved,
    playerValue: handValue(hand.player),
    dealerValue: handValue(hand.dealer)
  };
}

export function blackjackActive() {
  return handLive();
}

export function blackjackLastOutcome() {
  return lastOutcome;
}

function resolve() {
  if (!hand || hand.resolved) return;
  hand.resolved = true;
  hand.phase = "done";
  const result = blackjackResult(hand.player, hand.dealer);
  const mult = BLACKJACK_MULT[result] ?? 0;
  const faveurGain = Math.round(hand.stakeSeconds * mult * ICARUS_FAVEUR_K);
  if (faveurGain > 0) state.faveur = Math.max(0, (state.faveur || 0) + faveurGain);
  if (result === "lose") {
    // Main perdue : la mise (en secondes) épaissit la cagnotte partagée du temple.
    const potFeed = hand.stakeSeconds * BLACKJACK_POT_FEED;
    state.icarusPotFaveur = Math.min(ICARUS_POT_CAP_FAVEUR, Math.max(0, state.icarusPotFaveur || 0) + potFeed);
  }
  const hist = Array.isArray(state.blackjackHistory) ? state.blackjackHistory : (state.blackjackHistory = []);
  hist.push(result);
  if (hist.length > BLACKJACK_HISTORY_LEN) hist.splice(0, hist.length - BLACKJACK_HISTORY_LEN);
  lastOutcome = {
    result,
    mult,
    faveurGain,
    playerValue: handValue(hand.player),
    dealerValue: handValue(hand.dealer),
    player: hand.player.slice(),
    dealer: hand.dealer.slice()
  };
  const label = result === "blackjack" ? `🃏 Vingt-et-un ! +${fmt(faveurGain)} faveur`
    : result === "win" ? `🃏 +${fmt(faveurGain)} faveur`
      : result === "push" ? "🃏 égalité"
        : "🃏 main perdue";
  pushOutcomeFloat({ label, kind: faveurGain > 0 ? "gain" : "cost" });
  render();
}

// Donne une main. `options.deck` (tests) : sabot injecté (tiré du DÉBUT) au lieu
// du sabot battu. Résout tout de suite un naturel (joueur et/ou croupier).
export function dealBlackjack(stakeId, options = {}) {
  const opts = (typeof options === "object" && options !== null) ? options : {};
  if (handLive()) return null;                  // une main VIVANTE à la fois (une main de cycle mort n'en est pas une)
  if (gamePaused || collapseInProgress) return null;
  if (state.crisisLimitAnnounced) return null;  // la crise terminale a ses propres autels
  if (!blackjackUnlocked()) return null;
  const stake = blackjackStakes().find((s) => s.id === stakeId);
  if (!stake) return null;
  if (D(state.gold).lt(stake.gold)) return null;
  state.gold = D(state.gold).sub(stake.gold);

  const deck = Array.isArray(opts.deck) ? opts.deck.slice() : buildDeck();
  const player = [deck.shift(), deck.shift()];
  const dealer = [deck.shift(), deck.shift()];
  hand = {
    deck,
    player,
    dealer,
    stakeGold: stake.gold,
    stakeSeconds: stake.seconds,
    phase: "player",
    resolved: false,
    cycle: state.cycles || 0 // tampon de cycle : un effondrement abandonne la main
  };
  lastOutcome = null;
  if (isBlackjack(player) || isBlackjack(dealer)) resolve(); // naturel → résolution immédiate
  else render();
  return blackjackHand();
}

export function hitBlackjack() {
  if (!handLive() || hand.phase !== "player") return null; // main morte (cycle) → refusée
  hand.player.push(hand.deck.shift());
  if (handValue(hand.player) > 21) resolve(); // le joueur crève
  else render();
  return blackjackHand();
}

export function standBlackjack() {
  if (!handLive() || hand.phase !== "player") return null;
  while (handValue(hand.dealer) < BLACKJACK_DEALER_STAND) hand.dealer.push(hand.deck.shift());
  resolve();
  return blackjackHand();
}

// Réservé aux tests : purge la main en cours et le dernier résultat.
export function __resetBlackjackForTests() {
  hand = null;
  lastOutcome = null;
}
