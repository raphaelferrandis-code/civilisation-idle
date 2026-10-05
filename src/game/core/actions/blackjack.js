"use strict";

// Le Vingt-et-un — MOTEUR du blackjack du temple (cf. constantes BLACKJACK_* de
// balance.js). Mise et gain en FAVEUR — gain = payRound(mise × mult), le push
// (mult 1) rend exactement la mise. La mise est LIBRE entre les limites de la table
// (lot 1 des gains « vrai casino », 2026-10-04). TOUR PAR TOUR, sans timer : l'état
// de la main est un état MODULE éphémère (comme le vol d'Icare) — un rechargement
// en pleine main abandonne la mise (déjà payée). Le croupier (l'oracle) tire
// jusqu'à BLACKJACK_DEALER_STAND ; un « naturel » (21 en 2 cartes) paie 6:5. Le
// double et la refente sont des règles de base.
//   - dealBlackjack(stake) : paie la mise, bat le sabot, donne 2+2 (une carte
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
import { tr } from '../i18n.js';
import {
  BLACKJACK_MULT,
  BLACKJACK_RTP_REF,
  BLACKJACK_DEALER_STAND,
  BLACKJACK_HISTORY_LEN,
  BLACKJACK_SABOT_JEUX,
  BLACKJACK_SABOT_PENETRATION
} from '../balance.js';
import { feedPot, payRound } from './templePot.js';
import { recordWager } from './maisonRang.js';
import { clampStake } from './maisonTable.js';
import { pushOutcomeFloat } from '../outcomeFloat.js';
import { recordBlackjack } from '../chronicleStats.js';
import { videurBarre, observerMise } from './videur.js';

// Les 4 « couleurs » = emblèmes antiques (mêmes icônes que le scratch, cf.
// ScratchSym.jsx). Le rang porte la valeur ; la couleur est purement
// cosmétique (aucune règle ne dépend de la couleur au blackjack).
export const BLACKJACK_SUITS = ["olive", "amphore", "laurier", "chouette"];
// Exporté pour que l'habillage (cardSprites.js) et son test balaient EXACTEMENT
// les rangs que le sabot contient : un rang ajouté ici doit faire tomber le test
// des sprites, pas produire une carte sans image en jeu.
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

// Main en cours (état module ÉPHÉMÈRE) et dernier résultat, lus par l'UI.
let hand = null;      // { deck, player:[card], dealer:[card], stakeFaveur, phase:'player'|'done', resolved }
let lastOutcome = null; // { result, mult, faveurGain, playerValue, dealerValue, player, dealer }

export function blackjackUnlocked(ctx = regulationContext()) {
  return ctx.bestEra >= 3;
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

// LE SABOT (2026-10-04, lot 4 de docs/PLAN-NUIT-DES-PLAISIRS.md) : BLACKJACK_SABOT_JEUX
// jeux battus ensemble ; la carte de coupe laisse le dernier quart dans le sabot. Les
// cartes sorties ne reviennent qu'au battage suivant : le sabot a une MÉMOIRE, et le
// joueur attentif peut compter (Hi-Lo : +1 pour 2 à 6, −1 pour les 10, figures et As).
// Le videur regarde les mises (videur.js). Les mains des automatisations n'y touchent
// pas (un paquet neuf chacune). Mémoire de module : un rechargement bat un sabot neuf.
let sabot = null; // { cartes, total, coupe, compte, neuf }
const BAS = new Set(["2", "3", "4", "5", "6"]), HAUTS = new Set(["10", "J", "Q", "K", "A"]);
export const hiLo = (c) => (!c ? 0 : BAS.has(c.rank) ? 1 : HAUTS.has(c.rank) ? -1 : 0);
function nouveauSabot() {
  const cartes = [];
  for (let d = 0; d < BLACKJACK_SABOT_JEUX; d += 1) {
    for (const suit of BLACKJACK_SUITS) for (const rank of RANKS) cartes.push({ rank, suit });
  }
  for (let i = cartes.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cartes[i], cartes[j]] = [cartes[j], cartes[i]];
  }
  return { cartes, total: cartes.length, coupe: Math.round(cartes.length * (1 - BLACKJACK_SABOT_PENETRATION)), compte: 0, neuf: true };
}
// Une carte : du paquet injecté (tests), sinon du sabot (compté au passage).
function tirer(src) {
  if (src && src.deck) return src.deck.shift();
  if (!sabot || !sabot.cartes.length) sabot = nouveauSabot();
  const c = sabot.cartes.shift();
  sabot.compte += hiLo(c);
  return c;
}
// Le VRAI compte : le compte courant par jeu restant dans le sabot. Le moteur le sait,
// la table ne le montre pas (c'est au joueur de compter).
export function vraiCompte() {
  if (!sabot || !sabot.cartes.length) return 0;
  return sabot.compte / (sabot.cartes.length / 52);
}
// Ce que la table montre du sabot : la part qui reste avant la carte de coupe, et s'il
// vient d'être battu.
export function blackjackSabot() {
  if (!sabot) return { reste: 1, neuf: true };
  const plein = sabot.total - sabot.coupe, avant = Math.max(0, sabot.cartes.length - sabot.coupe);
  return { reste: plein > 0 ? avant / plein : 0, neuf: sabot.neuf };
}
// Bat un sabot neuf (le videur après un compteur, les tests).
export function battreSabot() {
  sabot = nouveauSabot();
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
    // et s'il reste de quoi doubler SA mise (règle de base depuis le lot 1).
    canDouble: hand.phase === "player" && !act.doubled && act.cards.length === 2
      && (state.faveur || 0) >= act.stake,
    // La refente : une seule fois, sur la main initiale, deux cartes de même
    // valeur, et de quoi payer la seconde mise (règle de base depuis le lot 1).
    canSplit: hand.phase === "player" && hand.hands.length === 1 && act.cards.length === 2
      && splitRank(act.cards[0]) === splitRank(act.cards[1])
      && (state.faveur || 0) >= act.stake
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

// LA STRATÉGIE DE BASE (S17) — fonction PURE : 'hit' | 'stand' | 'double' |
// 'split'. Mesures du lot 1 (naturel à 6 contre 5, 2 M de mains) : 96,7 % sans
// le double, 98,3 % avec, 98,9 % avec la refente en plus (le jeu parfait, que
// BLACKJACK_RTP_REF majore). Le chemin avec le double est celui de l'auto : son
// RTP vit dans BLACKJACK_RTP_AUTO.
// Trois consommateurs : le conseil de la Mesure gravée (artefact, UI),
// l'automatisation (qui double quand il le faut, ne refend jamais), et le bench.
// `allowDouble` n'est proposé que sur les 2 premières cartes. `allowSplit` ne
// sert qu'au conseil (audit du 05/10, BUG-83 : la refente est une règle de base
// depuis le lot 1, et la Mesure conseillait de tirer sur A-A ou 8-8) : il ne
// vaut que sur deux cartes de même rang de refente. L'auto et le bench
// continuent sans lui.
export function basicAction(player, dealerUp, opts = {}) {
  const allowDouble = Boolean(opts.allowDouble) && player.length === 2;
  const v = handValue(player);
  const u = upValue(dealerUp);
  if (opts.allowSplit && player.length === 2 && splitRank(player[0]) === splitRank(player[1])) {
    // Table des paires S17, double permis après refente (DAS). 10-10 et 5-5 ne
    // se refendent jamais : ils retombent sur les mains dures plus bas.
    const r = splitRank(player[0]);
    if (r === "A" || r === "8") return "split";
    if ((r === "2" || r === "3" || r === "7") && u >= 2 && u <= 7) return "split";
    if (r === "6" && u >= 2 && u <= 6) return "split";
    if (r === "9" && ((u >= 2 && u <= 6) || u === 8 || u === 9)) return "split";
    if (r === "4" && (u === 5 || u === 6)) return "split";
  }
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
    // naturel — il gagne comme une main simple (×2), pas comme le naturel.
    if (split && result === "blackjack") result = "win";
    const mult = BLACKJACK_MULT[result] ?? 0;
    // Arrondi NON BIAISÉ (payRound, parité avec Icare) : le naturel à ×2,2 est
    // souvent fractionnaire — Math.round biaiserait le RTP.
    const faveurGain = payRound(h.stake * mult);
    if (faveurGain > 0) state.faveur = Math.max(0, (state.faveur || 0) + faveurGain);
    // La cagnotte est nourrie sur l'EDGE de CHAQUE main (gagnée comme perdue, cf.
    // feedPot) — calculé sur REF, qui MAJORE le jeu parfait : le versement ne peut
    // jamais dépasser ce que la table a vraiment pris.
    feedPot(h.stake, BLACKJACK_RTP_REF);
    // La réputation (lot 2), main par main (doubles et refentes compris).
    recordWager(h.stake, BLACKJACK_RTP_REF);
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
  // Registre de la Chronique : une donne de plus (mises et gains cumulés sur
  // toutes les mains de la refente), naturel servi, et record de série.
  recordBlackjack({
    wagered: totalStake,
    won: totalGain,
    natural: results.some((r) => r.result === "blackjack"),
    streak: state.blackjackStreak || 0
  });
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
  const label = result === "blackjack" ? tr({ fr: `🃏 Vingt-et-un ! +${fmt(totalGain)} faveur`, en: `🃏 Twenty-One! +${fmt(totalGain)} favor` })
    : result === "win" ? tr({ fr: `🃏 +${fmt(totalGain)} faveur`, en: `🃏 +${fmt(totalGain)} favor` })
      : result === "push" ? tr({ fr: "🃏 égalité", en: "🃏 push" })
        : tr({ fr: "🃏 main perdue", en: "🃏 hand lost" });
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
    while (handValue(hand.dealer) < BLACKJACK_DEALER_STAND) hand.dealer.push(tirer(hand));
  }
  resolve();
}

// Donne une main. `options.deck` (tests) : paquet injecté (tiré du DÉBUT) au lieu du
// sabot. Résout tout de suite un naturel (joueur et/ou croupier). Refusée tant que le
// videur a fermé la table au joueur — et le videur peut la refuser ici même (la mise
// n'est pas prise).
export function dealBlackjack(stake, options = {}) {
  const opts = (typeof options === "object" && options !== null) ? options : {};
  if (handLive()) return null;                  // une main VIVANTE à la fois (une main de cycle mort n'en est pas une)
  if (gamePaused || collapseInProgress) return null;
  if (state.crisisLimitAnnounced) return null;  // la crise terminale a ses propres autels
  if (!blackjackUnlocked()) return null;
  const injecte = Array.isArray(opts.deck);
  if (!injecte && videurBarre()) return null;
  const stakeFaveur = clampStake(stake);
  if (stakeFaveur <= 0) return null;
  if ((state.faveur || 0) < stakeFaveur) return null;
  if (!injecte) {
    // Le sabot se bat neuf à la carte de coupe ; le videur regarde la mise.
    if (!sabot || sabot.cartes.length <= sabot.coupe) sabot = nouveauSabot();
    else sabot.neuf = false;
    if (observerMise(stakeFaveur, vraiCompte()) === 'porte') {
      sabot = nouveauSabot();
      render();
      return null;
    }
  }
  state.faveur = Math.max(0, (state.faveur || 0) - stakeFaveur);

  const src = { deck: injecte ? opts.deck.slice() : null };
  const player = [tirer(src), tirer(src)];
  const dealer = [tirer(src), tirer(src)];
  hand = {
    deck: src.deck,
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
  act.cards.push(tirer(hand));
  if (handValue(act.cards) > 21) advanceOrResolve(); // crevé : main suivante ou résolution
  else render();
  return blackjackHand();
}

export function standBlackjack() {
  if (!handLive() || hand.phase !== "player") return null;
  advanceOrResolve();
  return blackjackHand();
}

// LE DOUBLE (règle de base depuis le lot 1) : sur les 2 premières cartes de la
// main ACTIVE, doubler SA mise, recevoir UNE carte, et passer. ~+1,6 pt de RTP bien
// joué (la Mesure sait quand), NÉGATIF mal joué. Autorisé APRÈS refente (DAS).
export function doubleBlackjack() {
  if (!handLive() || hand.phase !== "player") return null;
  const act = activeHand();
  if (act.doubled || act.cards.length !== 2) return null;
  if ((state.faveur || 0) < act.stake) return null;
  state.faveur = Math.max(0, (state.faveur || 0) - act.stake);
  act.stake *= 2;
  act.doubled = true;
  act.cards.push(tirer(hand));
  advanceOrResolve(); // une carte, on passe (crevé ou non — la résolution tranche)
  return blackjackHand();
}

// LA REFENTE (règle de base depuis le lot 1). Deux cartes de même valeur se
// séparent en DEUX mains, chacune avec sa mise (la seconde est débitée ici) et sa
// seconde carte. Une seule refente par donne, le double reste permis sur chaque
// main (DAS), un 21 en 2 cartes refendu paie comme un gain simple. Jeu parfait
// mesuré à 98,9 % (cf. BLACKJACK_RTP_REF).
export function splitBlackjack() {
  if (!handLive() || hand.phase !== "player") return null;
  if (hand.hands.length > 1) return null; // une seule refente
  const act = activeHand();
  if (act.cards.length !== 2 || splitRank(act.cards[0]) !== splitRank(act.cards[1])) return null;
  if ((state.faveur || 0) < act.stake) return null;
  state.faveur = Math.max(0, (state.faveur || 0) - act.stake);
  const [c1, c2] = act.cards;
  hand.hands = [
    { cards: [c1, tirer(hand)], stake: act.stake, doubled: false },
    { cards: [c2, tirer(hand)], stake: act.stake, doubled: false }
  ];
  hand.active = 0;
  render();
  return blackjackHand();
}

// Main HEADLESS pour l'automatisation : joue la STRATÉGIE DE BASE avec le double
// (si la Faveur couvre la seconde mise SANS entamer la réserve `floor` de l'auto),
// jamais la refente, sans toucher la main interactive, sans float, sans historique,
// sans série (parité avec l'auto-Icare qui ne rafle pas : ce qui se savoure se joue
// à la main). Retourne l'issue ou null.
export function resolveBlackjackHeadless(stake, options = {}) {
  if (gamePaused || collapseInProgress || state.crisisLimitAnnounced) return null;
  if (!blackjackUnlocked()) return null;
  const base = clampStake(stake);
  if (base <= 0) return null;
  if ((state.faveur || 0) < base) return null;
  state.faveur = Math.max(0, (state.faveur || 0) - base);
  let stakeFaveur = base;

  const deck = Array.isArray(options && options.deck) ? options.deck.slice() : buildDeck();
  const player = [deck.shift(), deck.shift()];
  const dealer = [deck.shift(), deck.shift()];
  if (handValue(player) !== 21 && handValue(dealer) !== 21) {
    const floor = Math.max(0, Number(options && options.floor) || 0);
    if (basicAction(player, dealer[0], { allowDouble: true }) === "double" && (state.faveur || 0) - base >= floor) {
      state.faveur = Math.max(0, (state.faveur || 0) - base);
      stakeFaveur = base * 2;
      player.push(deck.shift());
    } else {
      while (handValue(player) <= 21 && basicAction(player, dealer[0]) === "hit") player.push(deck.shift());
    }
    if (handValue(player) <= 21) {
      while (handValue(dealer) < BLACKJACK_DEALER_STAND) dealer.push(deck.shift());
    }
  }
  const result = blackjackResult(player, dealer);
  const faveurGain = payRound(stakeFaveur * (BLACKJACK_MULT[result] ?? 0));
  if (faveurGain > 0) state.faveur = Math.max(0, (state.faveur || 0) + faveurGain);
  feedPot(stakeFaveur, BLACKJACK_RTP_REF);
  recordWager(stakeFaveur, BLACKJACK_RTP_REF);
  // Registre de la Chronique : les donnes auto comptent aussi (mise, gain,
  // naturel) ; l'auto ne construit pas de série, donc pas de record de streak.
  recordBlackjack({ wagered: stakeFaveur, won: faveurGain, natural: result === "blackjack", streak: 0 });
  return { result, faveurGain, stakeFaveur, doubled: stakeFaveur > base };
}

// Purge la main EN COURS et le dernier résultat. Appelée au Grand Reset : sinon la
// main survit au reset et — comme state.cycles y repart aussi à 0 — hand.cycle === 0
// reste vrai (handLive), si bien qu'une main misée sur la cité effacée se résout dans
// la run neuve, mintant de la Faveur (blackjack.js:104 de l'audit).
export function purgeBlackjackHand() {
  hand = null;
  lastOutcome = null;
}

// Réservé aux tests : purge la main, et le sabot.
export function __resetBlackjackForTests() {
  purgeBlackjackHand();
  sabot = null;
}
