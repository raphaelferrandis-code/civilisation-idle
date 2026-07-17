"use strict";

// Le Vingt-et-un — MOTEUR du blackjack du temple (cf. constantes BLACKJACK_* de
// balance.js). MONNAIE FERMÉE (2026-07-16) : mise et gain en FAVEUR — gain =
// round(mise × mult), le push (mult 1) rend exactement la mise. TOUR PAR TOUR,
// sans timer : l'état de la main est un état MODULE éphémère (comme le vol
// d'Icare) — un rechargement en pleine main abandonne la mise (déjà payée). Le
// croupier (l'oracle) tire jusqu'à BLACKJACK_DEALER_STAND ; un « naturel »
// (21 en 2 cartes) paie 3:2.
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
import { regulationContext } from '../mechanics.js';
import { fmt } from '../utils.js';
import {
  BLACKJACK_STAKES,
  BLACKJACK_MULT,
  BLACKJACK_RTP_REF,
  BLACKJACK_DEALER_STAND,
  BLACKJACK_HISTORY_LEN
} from '../balance.js';
import { feedPot, payRound, clampStakeMult } from './templePot.js';
import { hasTempleArtifact } from './templeArtifacts.js';
import { pushOutcomeFloat } from '../outcomeFloat.js';

// Les 4 « couleurs » = emblèmes antiques (mêmes icônes que le scratch, cf.
// ScratchSym.jsx). Le rang porte la valeur ; la couleur est purement
// cosmétique (aucune règle ne dépend de la couleur au blackjack).
export const BLACKJACK_SUITS = ["olive", "amphore", "laurier", "chouette"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

// Main en cours (état module ÉPHÉMÈRE) et dernier résultat, lus par l'UI.
let hand = null;      // { deck, player:[card], dealer:[card], stakeFaveur, phase:'player'|'done', resolved }
let lastOutcome = null; // { result, mult, faveurGain, playerValue, dealerValue, player, dealer }

export function blackjackUnlocked(ctx = regulationContext()) {
  return ctx.bestEra >= 3;
}

// Mises proposées (FAVEUR, fixes — cf. BLACKJACK_STAKES).
export function blackjackStakes() {
  return BLACKJACK_STAKES.map((s) => ({ ...s }));
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

// Rang « de refente » : les figures comptent comme des 10 (deux mains ne se
// refendent que sur des rangs de MÊME VALEUR, la convention classique).
function splitRank(c) {
  return (c.rank === "10" || c.rank === "J" || c.rank === "Q" || c.rank === "K") ? "10" : c.rank;
}

// La main ACTIVE (multi-mains depuis la refente, 2026-07-17 : hand.hands est un
// tableau, hand.active l'index en cours — une main simple est un tableau de 1).
function activeHand() {
  return hand ? hand.hands[hand.active] : null;
}

// Instantané de la main pour l'UI (copies défensives). La scène masque la carte
// cachée du croupier tant que phase === 'player'. `player` reste la main ACTIVE
// (compatibilité) ; `hands` expose tout pour l'affichage de la refente.
export function blackjackHand() {
  if (!hand) return null;
  const act = activeHand();
  return {
    player: act.cards.slice(),
    dealer: hand.dealer.slice(),
    phase: hand.phase,
    resolved: hand.resolved,
    playerValue: handValue(act.cards),
    dealerValue: handValue(hand.dealer),
    stakeFaveur: act.stake,
    doubled: Boolean(act.doubled),
    split: hand.hands.length > 1,
    active: hand.active,
    hands: hand.hands.map((h) => ({ cards: h.cards.slice(), stake: h.stake, doubled: Boolean(h.doubled), value: handValue(h.cards) })),
    // Le double n'est proposé QUE sur les 2 premières cartes de la main active,
    // avec l'artefact, et s'il reste de quoi doubler SA mise.
    canDouble: hand.phase === "player" && !act.doubled && act.cards.length === 2
      && hasTempleArtifact("double") && (state.faveur || 0) >= act.stake,
    // La refente : une seule fois, sur la main initiale, deux cartes de même
    // valeur, avec l'artefact, et de quoi payer la seconde mise.
    canSplit: hand.phase === "player" && hand.hands.length === 1 && act.cards.length === 2
      && splitRank(act.cards[0]) === splitRank(act.cards[1])
      && hasTempleArtifact("refente") && (state.faveur || 0) >= act.stake
  };
}

export function blackjackActive() {
  return handLive();
}

export function blackjackLastOutcome() {
  return lastOutcome;
}

// Valeur de la carte VISIBLE de l'oracle (l'As compte 11) — pour la stratégie.
function upValue(c) {
  if (!c) return 0;
  if (c.rank === "A") return 11;
  if (c.rank === "10" || c.rank === "J" || c.rank === "Q" || c.rank === "K") return 10;
  return Number(c.rank);
}
// Main SOUPLE : un As y compte encore 11.
function isSoftHand(cards) {
  let total = 0, aces = 0;
  for (const c of cards) {
    if (c.rank === "A") { aces += 1; total += 11; }
    else total += upValue(c) === 11 ? 11 : upValue(c);
  }
  while (total > 21 && aces > 0) { total -= 10; aces -= 1; }
  return aces > 0;
}

// LA STRATÉGIE DE BASE (S17, sans refente) — fonction PURE : 'hit' | 'stand' |
// 'double'. C'est la mesure exacte du plafond de skill de cette table (98,2 %
// sans le double, ~99,5 % avec — mesuré au bench, cf. BLACKJACK_RTP_REF).
// Trois consommateurs : le conseil de la Mesure gravée (artefact, UI),
// l'automatisation (qui joue hit/stand, jamais le double), et le bench.
// `allowDouble` n'est proposé que sur les 2 premières cartes.
export function basicAction(player, dealerUp, opts = {}) {
  const allowDouble = Boolean(opts.allowDouble) && player.length === 2;
  const v = handValue(player);
  const u = upValue(dealerUp);
  if (isSoftHand(player)) {
    if (allowDouble) {
      if ((v === 13 || v === 14) && u >= 5 && u <= 6) return "double"; // A2-A3
      if ((v === 15 || v === 16) && u >= 4 && u <= 6) return "double"; // A4-A5
      if ((v === 17 || v === 18) && u >= 3 && u <= 6) return "double"; // A6-A7
    }
    if (v >= 19) return "stand";
    if (v === 18) return u >= 9 ? "hit" : "stand";
    return "hit";
  }
  if (allowDouble) {
    if (v === 9 && u >= 3 && u <= 6) return "double";
    if (v === 10 && u >= 2 && u <= 9) return "double";
    if (v === 11 && u >= 2 && u <= 10) return "double"; // S17 : pas contre l'As
  }
  if (v >= 17) return "stand";
  if (v >= 13) return u >= 7 ? "hit" : "stand";
  if (v === 12) return (u < 4 || u > 6) ? "hit" : "stand";
  return "hit";
}

function resolve() {
  if (!hand || hand.resolved) return;
  hand.resolved = true;
  hand.phase = "done";
  const split = hand.hands.length > 1;
  const hist = Array.isArray(state.blackjackHistory) ? state.blackjackHistory : (state.blackjackHistory = []);
  let totalGain = 0, totalStake = 0;
  const results = hand.hands.map((h) => {
    let result = blackjackResult(h.cards, hand.dealer);
    // Convention classique : un 21 en 2 cartes APRÈS refente n'est PAS un
    // naturel — il gagne ×2, pas ×2,5 (c'est cette règle qui tient la refente
    // à 100,3 % mesurés et pas plus).
    if (split && result === "blackjack") result = "win";
    const mult = BLACKJACK_MULT[result] ?? 0;
    // Arrondi NON BIAISÉ (payRound, parité avec Icare) : seul le naturel de la
    // royale est fractionnaire (25 × 2,5 = 62,5) — Math.round offrait +0,09 pt.
    const faveurGain = payRound(h.stake * mult);
    if (faveurGain > 0) state.faveur = Math.max(0, (state.faveur || 0) + faveurGain);
    // La cagnotte est nourrie sur l'EDGE de CHAQUE main (gagnée comme perdue, cf.
    // feedPot). Au sommet (double + refente : REF > 1), feedPot clampe à 0 : la
    // table n'a plus d'edge à recycler, et c'est exact.
    feedPot(h.stake, BLACKJACK_RTP_REF);
    hist.push(result);
    // La série (la Voix de l'oracle) : les victoires comptent enfin, main par
    // main ; le push ne compte pas. L'auto n'y touche jamais.
    if (result === "win" || result === "blackjack") state.blackjackStreak = (state.blackjackStreak || 0) + 1;
    else if (result === "lose") state.blackjackStreak = 0;
    totalGain += faveurGain;
    totalStake += h.stake;
    return { result, faveurGain, stake: h.stake, cards: h.cards.slice(), value: handValue(h.cards) };
  });
  if (hist.length > BLACKJACK_HISTORY_LEN) hist.splice(0, hist.length - BLACKJACK_HISTORY_LEN);
  // Issue AGRÉGÉE pour l'UI : une main simple garde son résultat exact ; une
  // refente se lit au NET (gagné si les deux mains rendent plus que les mises).
  const result = !split ? results[0].result
    : totalGain > totalStake ? "win" : totalGain < totalStake ? "lose" : "push";
  lastOutcome = {
    result,
    split,
    results,
    faveurGain: totalGain,
    stakeFaveur: totalStake,
    playerValue: results[0].value,
    dealerValue: handValue(hand.dealer),
    player: hand.hands[0].cards.slice(),
    dealer: hand.dealer.slice()
  };
  const label = result === "blackjack" ? `🃏 Vingt-et-un ! +${fmt(totalGain)} faveur`
    : result === "win" ? `🃏 +${fmt(totalGain)} faveur`
      : result === "push" ? "🃏 égalité"
        : "🃏 main perdue";
  pushOutcomeFloat({ label, kind: totalGain > 0 ? "gain" : "cost" });
  render();
}

// Fin de la main ACTIVE : passe à la suivante (refente) ou fait jouer l'oracle
// puis résout tout. L'oracle ne tire que s'il reste une main vivante.
function advanceOrResolve() {
  if (hand.active < hand.hands.length - 1) {
    hand.active += 1;
    render();
    return;
  }
  if (hand.hands.some((h) => handValue(h.cards) <= 21)) {
    while (handValue(hand.dealer) < BLACKJACK_DEALER_STAND) hand.dealer.push(hand.deck.shift());
  }
  resolve();
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
  // LES COFFRES : mise × 10^rang (clampée au moteur), gains au prorata.
  const mult = clampStakeMult(opts.stakeMult ?? 1);
  const stakeFaveur = stake.faveur * mult;
  if ((state.faveur || 0) < stakeFaveur) return null;
  state.faveur = Math.max(0, (state.faveur || 0) - stakeFaveur);

  const deck = Array.isArray(opts.deck) ? opts.deck.slice() : buildDeck();
  const player = [deck.shift(), deck.shift()];
  const dealer = [deck.shift(), deck.shift()];
  hand = {
    deck,
    dealer,
    hands: [{ cards: player, stake: stakeFaveur, doubled: false }],
    active: 0,
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
  const act = activeHand();
  act.cards.push(hand.deck.shift());
  if (handValue(act.cards) > 21) advanceOrResolve(); // crevé : main suivante ou résolution
  else render();
  return blackjackHand();
}

export function standBlackjack() {
  if (!handLive() || hand.phase !== "player") return null;
  advanceOrResolve();
  return blackjackHand();
}

// LE DOUBLE (artefact « Le double », 2026-07-17) : sur les 2 premières cartes de
// la main ACTIVE, doubler SA mise, recevoir UNE carte, et passer. Un achat gaté
// par le SKILL : ~+1,3 pt de RTP bien joué (la Mesure sait quand), NÉGATIF mal
// joué. Autorisé APRÈS refente (DAS) : c'est la règle mesurée à 100,3 %.
export function doubleBlackjack() {
  if (!handLive() || hand.phase !== "player") return null;
  const act = activeHand();
  if (act.doubled || act.cards.length !== 2) return null;
  if (!hasTempleArtifact("double")) return null;
  if ((state.faveur || 0) < act.stake) return null;
  state.faveur = Math.max(0, (state.faveur || 0) - act.stake);
  act.stake *= 2;
  act.doubled = true;
  act.cards.push(hand.deck.shift());
  advanceOrResolve(); // une carte, on passe (crevé ou non — la résolution tranche)
  return blackjackHand();
}

// LA REFENTE (artefact « La refente », 2026-07-17) — LA BASCULE DU 21. Deux
// cartes de même valeur se séparent en DEUX mains, chacune avec sa mise (la
// seconde est débitée ici) et sa seconde carte. Une seule refente par donne,
// le double reste permis sur chaque main (DAS), un 21 en 2 cartes refendu paie
// ×2 et non ×2,5. Mesurée à 100,3 % de RTP de base en jeu parfait : c'est le
// rang d'IMPRIMANTE du vingt-et-un (cf. BLACKJACK_RTP_REF et A14).
export function splitBlackjack() {
  if (!handLive() || hand.phase !== "player") return null;
  if (hand.hands.length > 1) return null; // une seule refente
  const act = activeHand();
  if (act.cards.length !== 2 || splitRank(act.cards[0]) !== splitRank(act.cards[1])) return null;
  if (!hasTempleArtifact("refente")) return null;
  if ((state.faveur || 0) < act.stake) return null;
  state.faveur = Math.max(0, (state.faveur || 0) - act.stake);
  const [c1, c2] = act.cards;
  hand.hands = [
    { cards: [c1, hand.deck.shift()], stake: act.stake, doubled: false },
    { cards: [c2, hand.deck.shift()], stake: act.stake, doubled: false }
  ];
  hand.active = 0;
  render();
  return blackjackHand();
}

// Main HEADLESS pour l'automatisation : joue la STRATÉGIE DE BASE (hit/stand,
// jamais le double ni la refente — les cadrans le disent), sans toucher la main
// interactive, sans float, sans historique, sans série (parité avec l'auto-Icare
// qui ne rafle pas : ce qui se savoure se joue à la main). Retourne l'issue ou null.
export function resolveBlackjackHeadless(stakeId, options = {}) {
  const opts = (typeof options === "object" && options !== null) ? options : {};
  if (gamePaused || collapseInProgress || state.crisisLimitAnnounced) return null;
  if (!blackjackUnlocked()) return null;
  const stake = blackjackStakes().find((s) => s.id === stakeId);
  if (!stake) return null;
  // LES COFFRES : parité stricte avec dealBlackjack.
  const mult = clampStakeMult(opts.stakeMult ?? 1);
  const stakeFaveur = stake.faveur * mult;
  if ((state.faveur || 0) < stakeFaveur) return null;
  state.faveur = Math.max(0, (state.faveur || 0) - stakeFaveur);

  const deck = buildDeck();
  const player = [deck.shift(), deck.shift()];
  const dealer = [deck.shift(), deck.shift()];
  if (handValue(player) !== 21 && handValue(dealer) !== 21) {
    while (handValue(player) <= 21 && basicAction(player, dealer[0]) === "hit") player.push(deck.shift());
    if (handValue(player) <= 21) {
      while (handValue(dealer) < BLACKJACK_DEALER_STAND) dealer.push(deck.shift());
    }
  }
  const result = blackjackResult(player, dealer);
  const faveurGain = payRound(stakeFaveur * (BLACKJACK_MULT[result] ?? 0));
  if (faveurGain > 0) state.faveur = Math.max(0, (state.faveur || 0) + faveurGain);
  feedPot(stakeFaveur, BLACKJACK_RTP_REF);
  return { result, faveurGain, stakeFaveur };
}

// Réservé aux tests : purge la main en cours et le dernier résultat.
export function __resetBlackjackForTests() {
  hand = null;
  lastOutcome = null;
}
