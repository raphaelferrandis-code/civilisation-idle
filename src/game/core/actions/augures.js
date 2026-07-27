"use strict";

// La Table des augures — MOTEUR du mini-jeu de paris (onglet Régulation).
// MONNAIE FERMÉE (arbitrage Raph 2026-07-16) : la mise est en FAVEUR (plus
// d'or), financée par le tronc des offrandes (offeringTrunk.js). Le temple est
// un casino à jetons : l'edge maison est obligatoire (sinon imprimante), les
// gains sont NORMALISÉS sur un RTP cible < 1 (auguryPaytable) — modèle chiffré
// et validé par bench-temple.js (rapport : temple-faveur-impact.md).
// Une cérémonie en deux temps :
//   1. castAugury(id, rite) — le JET DE TABLE : le RITE fixe la mise
//      (AUGURY_STAKES) et déforme la variance (spread) ; un tirage tranche
//      (p = auguryBaseOdds, SANS Clémence — cf. plus bas). 5 issues
//      (Vénus/Triple/Paire gagnantes, Creux/Chien perdantes) ; perdre = mise
//      sacrifiée (rien en retour), une PART de la mise nourrit la cagnotte.
//   2. doubleAugury(id, stake) — le SECOND JET (« quitte ou double ») offert
//      après un gain : chance FIXE (AUGURY_DOUBLE_P), la mise est la Faveur
//      qu'on vient de gagner. Gagné → +wager Faveur ; perdu → reprise.
// La CLÉMENCE (revers consécutifs) est un RABAIS DE MISE (gains au prorata →
// RTP inchangé) : l'ancien bonus d'odds rendait la table exploitable en
// monnaie fermée (RTP 124 % mesuré au « sniper »).
// Ni fatigue ni registre : le temple est sa propre économie. L'effet est
// DIFFÉRÉ (option defer) jusqu'à la révélation par l'UI (anti-spoiler).

import { state, renderCache, render, gamePaused, collapseInProgress } from '../state.js';
import { clemencyCrans, regulationActionUnlocked } from '../mechanics.js';
import { REGULATION_ACTIONS_BY_ID } from '../../data/regulationActions.js';
import {
  GAMBLE_P_MAX,
  GAMBLE_HISTORY_LEN,
  GAMBLE_ODDS_SCALE,
  DICE_BOOST_STEP,
  DICE_BOOST_MAX_LEVEL,
  AUGURY_REF_DICE_LEVEL,
  AUGURY_DOUBLE_P,
  AUGURY_TIER_SHARES,
  AUGURY_HOLLOW_SHARE,
  AUGURY_STAKES,
  AUGURY_RTP_CAP,
  AUGURY_PAY_PROFILE,
  AUGURY_CLEMENCY_LADDER,
  AUGURY_JACKPOT_SHARE,
  FREE_FLIGHT_EV
} from '../balance.js';
import { pushOutcomeFloat } from '../outcomeFloat.js';
import { fmt } from '../utils.js';
import { chronicle } from './utils.js';
import { ivoryDogCut, ivoryVenusBonus, hasTempleArtifact } from './templeArtifacts.js';
import { grantFreeFlight } from './templeFlights.js';
import { feedPot, payRound, clampStakeMult, potRake } from './templePot.js';
import { recordOsselets } from '../chronicleStats.js';

// Les trois RITES : trois formes de risque pour la même table. La MISE (Faveur)
// vient d'AUGURY_STAKES[rite]. `spread` déforme la VARIANCE : >1 fatten les
// queues (plus de Vénus DANS les gains, plus de Chiens DANS les pertes) ; <1
// les calme. La frontière gagne/perd (les ODDS) NE bouge PAS avec le rite —
// elle est pilotée par les dés pipés. Le RTP, lui, est ÉGALISÉ entre rites par
// la normalisation (auguryPaytable) : le rite est un pur choix de variance.
// Labels résolus par tr() côté UI.
export const AUGURY_RITES = {
  prudent: {
    id: "prudent", spread: 0.55,
    label: { fr: "Offrande prudente", en: "Cautious offering" },
    desc: {
      fr: "Une libation discrète : mise réduite, Faveur modeste, moins de Chiens.",
      en: "A discreet libation: reduced stake, modest Favor, fewer Dogs."
    }
  },
  classique: {
    id: "classique", spread: 1,
    label: { fr: "Rite ancestral", en: "Ancestral rite" },
    desc: {
      fr: "Le rite des anciens : mise, Faveur et risques équilibrés.",
      en: "The rite of the ancients: balanced stake, Favor and risks."
    }
  },
  grand: {
    id: "grand", spread: 1.7,
    label: { fr: "Grand sacrifice", en: "Great sacrifice" },
    desc: {
      fr: "Une hécatombe : mise doublée, Faveur magnifiée, plus de Vénus et plus de Chiens.",
      en: "A hecatomb: doubled stake, magnified Favor, more Venus and more Dogs."
    }
  },
  // Le 4e rite (2026-07-17), GATÉ par l'artefact « Le rite interdit » (lignée
  // osselets, cf. castAugury). Pur achat de variance comme les trois autres : la
  // normalisation égalise le RTP, seules les queues gonflent (spread 2.5 : le
  // Chien mange presque toute la masse perdante, clampé à 0.95 par auguryTierOdds).
  interdit: {
    id: "interdit", spread: 2.5, artifact: "interdit",
    label: { fr: "Rite interdit", en: "Forbidden rite" },
    desc: {
      fr: "Le rite que les prêtres taisent : mise lourde, Vénus abondantes, et le Chien règne sur les revers.",
      en: "The rite the priests keep silent: heavy stake, abundant Venus, and the Dog rules the setbacks."
    }
  }
};

// La Table des prises — 5 issues lues sur les os (1·3·4·6, les AS sont
// funestes). La masse gagnante (p effective) se répartit Vénus/Triple/Paire ;
// la masse perdante Creux/Chien. Labels pour l'UI.
export const AUGURY_TIER_LABELS = {
  venus: { fr: "Coup de Vénus", en: "Venus throw" },
  triple: { fr: "Triple", en: "Triple" },
  pair: { fr: "Paire haute", en: "High pair" },
  hollow: { fr: "Jet creux", en: "Hollow throw" },
  dog: { fr: "Le Chien", en: "The Dog" }
};

// Chance de base EFFECTIVE d'un pari : la proba de l'action réduite par le
// facteur early (GAMBLE_ODDS_SCALE) + le bonus PERMANENT des dés pipés
// (state.diceLevel, boutique de Faveur). C'est cette base que le tirage
// applique — la Clémence ne touche PLUS les odds (elle allège la mise).
export function auguryBaseOdds(a) {
  const p = (a && typeof a === "object") ? (a.p ?? 0.5) : (REGULATION_ACTIONS_BY_ID[a]?.p ?? 0.5);
  const diceBonus = Math.min(DICE_BOOST_MAX_LEVEL, state.diceLevel || 0) * DICE_BOOST_STEP;
  return Math.max(0, Math.min(GAMBLE_P_MAX, p * GAMBLE_ODDS_SCALE + diceBonus));
}

// Répartition des 5 issues. `spread` (le rite) déforme la variance SANS toucher
// la frontière gagne/perd : la masse gagnante reste pEff, la perdante 1-pEff,
// mais un gros `spread` gonfle la part de Vénus DANS les gains et de Chien DANS
// les pertes (au détriment de la paire et du creux).
export function auguryTierOdds(pEff, spread = 1) {
  // Dé d'ivoire (artefact) : relève Vénus DANS les gains et coupe le Chien DANS
  // les pertes, de façon DÉCOUPLÉE (le spread multiplie les deux ensemble ;
  // l'ivoire les découple). pEff — le taux de victoire — reste INTOUCHÉ.
  const venusShare = Math.min(0.9, AUGURY_TIER_SHARES.venus * spread + ivoryVenusBonus());
  const dogShare = Math.max(0, Math.min(0.95, (1 - AUGURY_HOLLOW_SHARE) * spread - ivoryDogCut()));
  const venus = pEff * venusShare;
  const triple = pEff * AUGURY_TIER_SHARES.triple;
  return {
    venus,
    triple,
    pair: Math.max(0, pEff - venus - triple),
    hollow: Math.max(0, (1 - pEff) * (1 - dogShare)),
    dog: (1 - pEff) * dogShare
  };
}

// Win rate de RÉFÉRENCE : les odds au NIVEAU MAX des dés pipés. La paytable
// est normalisée LÀ-DESSUS (sur AUGURY_RTP_CAP) → les PAIEMENTS sont FIXES à
// travers les niveaux de dés (arbitrage Raph 2026-07-16 : « le winrate
// augmente et le paiement doit rester identique ») ; le RTP effectif MONTE
// avec les dés (≈ cap × pEff/pRef), borné au cap par construction.
function auguryRefOdds(a) {
  const p = (a && typeof a === "object") ? (a.p ?? 0.5) : (REGULATION_ACTIONS_BY_ID[a]?.p ?? 0.5);
  // L'ANCRE est GELÉE à AUGURY_REF_DICE_LEVEL (10), PAS au max de l'échelle : les
  // dés 11-13 (la bascule) poussent pEff AU-DELÀ de pRef, et la linéarité
  // rtp = rtpRef × pEff/pRef porte le RTP au-dessus du cap SANS toucher un seul
  // paiement (A8 intact). C'est tout le mécanisme de l'imprimante des osselets.
  return Math.max(0, Math.min(GAMBLE_P_MAX, p * GAMBLE_ODDS_SCALE + AUGURY_REF_DICE_LEVEL * DICE_BOOST_STEP));
}

// Paytable NORMALISÉE d'un rite : les gains exacts (mise × profil × k, avec k
// calé sur AUGURY_RTP_CAP au win rate de RÉFÉRENCE) sont arrondis en cherchant
// la meilleure combinaison ENTIÈRE SOUS le cap — RTP < 1 garanti par
// construction, quels que soient le spread du rite, les dés pipés ou l'ivoire
// (garde-fous A1-A3 du bench). Les dés ne changent PAS les gains (référence
// fixe) ; l'ivoire, lui, RECALCULE la table (artefact de refonte du risque —
// les parts bougent, la normalisation compense, le RTP reste au cap).
// Fenêtres de candidats larges sur les postes RARES (Vénus, Triple :
// granularité fine ≈ odds/mise par cran), serrées sur la Paire (le poste
// lourd) : c'est la marge qui permet de caler le RTP tout près sous le cap
// malgré des gains entiers et de petites mises. Chaque gain rend STRICTEMENT
// plus que la mise. Retourne aussi le RTP EFFECTIF courant (aux odds du
// moment, dés compris) — c'est lui que lisent le badge d'automatisation, les
// tests et le bench.
export function auguryPaytable(id, riteId = "classique") {
  const rite = AUGURY_RITES[riteId] || AUGURY_RITES.classique;
  const stake = AUGURY_STAKES[rite.id] || AUGURY_STAKES.classique;
  const pRef = auguryRefOdds(id);
  const oddsRef = auguryTierOdds(pRef, rite.spread ?? 1);
  // LE VOL OFFERT COMPTE (2026-07-17). Chaque Vénus offre un vol d'Icare, dont
  // l'espérance (FREE_FLIGHT_EV, comptée au plancher d'edge : elle MAJORE la
  // valeur réelle) sortait de tout budget : à dés 10 + ivoire, elle valait
  // jusqu'à +8,5 pts AU-DESSUS du cap — une imprimante que ni A1 ni A9 ne
  // voyaient tant qu'elle n'était pas comptée. Le budget des gains en FAVEUR
  // est donc réduit de la valeur du vol au point de référence : le TOTAL
  // (Faveur + vol) frôle le cap, jamais plus. Comme la part de Vénus et les
  // gains scalent tous deux avec pEff, la linéarité rtp = rtpRef × pEff/pRef
  // reste exacte, vol compris.
  const flightShareRef = (oddsRef.venus * FREE_FLIGHT_EV) / stake;
  const cashCap = Math.max(0.1, AUGURY_RTP_CAP - flightShareRef);
  const P = AUGURY_PAY_PROFILE;
  const rtpBrut = oddsRef.venus * P.venus + oddsRef.triple * P.triple + oddsRef.pair * P.pair;
  const k = rtpBrut > 0 ? cashCap / rtpBrut : 0;
  const cand = (tier, lo, hi) => {
    const exact = stake * P[tier] * k;
    const out = [];
    for (let d = lo; d <= hi; d++) {
      const v = Math.max(stake + 1, Math.floor(exact) + d);
      if (!out.includes(v)) out.push(v);
    }
    return out;
  };
  const cashRefOf = (venus, triple, pair) =>
    (oddsRef.venus * venus + oddsRef.triple * triple + oddsRef.pair * pair) / stake;
  let best = null;
  for (const venus of cand("venus", 0, 4)) for (const triple of cand("triple", 0, 2)) for (const pair of cand("pair", -1, 0)) {
    const cashRef = cashRefOf(venus, triple, pair);
    if (cashRef >= cashCap) continue; // jamais au-dessus du budget Faveur
    if (!best || cashRef > best.cashRef) best = { gains: { venus, triple, pair }, cashRef };
  }
  if (!best) {
    // Filet (toutes les combinaisons ≥ budget — petites mises) : plancher partout
    // puis on dégonfle les postes lourds jusqu'à repasser sous le budget.
    const g = { venus: cand("venus", 0, 0)[0], triple: cand("triple", 0, 0)[0], pair: cand("pair", -1, -1)[0] };
    while (cashRefOf(g.venus, g.triple, g.pair) >= cashCap && g.pair > stake + 1) g.pair--;
    while (cashRefOf(g.venus, g.triple, g.pair) >= cashCap && g.triple > stake + 1) g.triple--;
    best = { gains: g, cashRef: cashRefOf(g.venus, g.triple, g.pair) };
  }
  // RTP EFFECTIF aux odds COURANTES (les dés pipés le font monter vers rtpRef,
  // qui frôle le cap) — les gains, eux, ne bougent pas. `rtp` et `rtpRef` sont
  // des TOTAUX (Faveur + valeur du vol) : c'est ce que lisent feedPot (le
  // versement suit le vrai retour), le badge d'automatisation et le bench.
  const pEff = auguryBaseOdds(id);
  const odds = auguryTierOdds(pEff, rite.spread ?? 1);
  const rtp = (odds.venus * best.gains.venus + odds.triple * best.gains.triple + odds.pair * best.gains.pair
    + odds.venus * FREE_FLIGHT_EV) / stake;
  return { stake, gains: best.gains, rtp, rtpRef: best.cashRef + flightShareRef, rtpCap: AUGURY_RTP_CAP, pEff, pRef, odds };
}

// Mise d'un jet pour un rite : la mise pleine du rite, allégée par la Clémence.
// ÉCHELLE ENTIÈRE (2026-07-17) : la mise du cran N est LUE dans
// AUGURY_CLEMENCY_LADDER, plus calculée en pourcentage — l'ancien
// round(base × (1 − 10 % × crans)) rendait les crans 2 et 4 no-op EXACTS
// (round(4,8) = round(5,4) = 5) : la pitié ne bougeait pas un revers sur deux.
// Chaque cran descend désormais jusqu'au plancher (moitié de la mise pleine),
// vérifié par A13. Les gains restent servis au PRORATA de la mise payée
// (apply(), :294) : le RTP du prorata oscille d'un point par bruit d'arrondi,
// borné < 1 par A13 — et la pitié reste INEXPLOITABLE (A7, le sniper n'en tire
// rien). Retourne { base, rebate, stake } — stake = ce qui sera réellement
// débité, rebate = la part remise (pour les pastilles « offrande −N % » de l'UI).
export function auguryStake(id, riteId = "classique") {
  const rite = AUGURY_RITES[riteId] || AUGURY_RITES.classique;
  const base = AUGURY_STAKES[rite.id] || AUGURY_STAKES.classique;
  const ladder = AUGURY_CLEMENCY_LADDER[rite.id] || AUGURY_CLEMENCY_LADDER.classique;
  const stake = ladder[Math.min(ladder.length - 1, clemencyCrans(id))];
  return { base, rebate: 1 - stake / base, stake };
}

// Part remise par la Clémence (0..~0.5), au rite classique — pour les pastilles
// génériques de l'UI (le rabais exact PAR RITE vit dans auguryStake).
export function auguryRebate(id) {
  return auguryStake(id, "classique").rebate;
}

// Répartition des 5 issues. UN SEUL Math.random() en tête (les tests le
// pilotent), les os cosmétiques sont générés ensuite.
function drawTier(pEff, spread = 1) {
  const r = Math.random();
  const odds = auguryTierOdds(pEff, spread);
  if (r < odds.venus) return "venus";
  if (r < odds.venus + odds.triple) return "triple";
  if (r < pEff) return "pair";
  if (r < pEff + odds.hollow) return "hollow";
  return "dog";
}

// Dés canoniques d'un tier. 2026-07-22 : les astragales (faces 1·3·4·6) sont
// remplacés par des DÉS D'OS à six faces — des *tesserae* romaines, que
// l'Antiquité jouait à côté des osselets. Le vocabulaire de la table survit tel
// quel au changement, à une nuance de définition près :
//   · VÉNUS était « les quatre osselets tous différents » aux tali ; aux
//     tesserae c'est le TRIPLE SIX, et c'était déjà le meilleur coup. On prend
//     celle-là — « quatre différentes » sur un d6 tombe 28 % du temps au lieu
//     de 9 %, le coup n'aurait plus rien d'exceptionnel à l'œil du joueur ;
//   · LE CHIEN (canis) reste les quatre as, à l'identique.
// Rappel : ces combinaisons sont de l'HABILLAGE. L'issue est tirée avant, par
// auguryRollTier, à partir de probabilités écrites à la main — ce qui suit ne
// fait que l'illustrer de façon plausible. Aucun RTP n'en dépend.
const HIGH_FACES = [2, 3, 4, 5, 6];
const TRIPLE_FACES = [2, 3, 4, 5]; // pas le 6 : un 6-6-6 se lirait « Vénus »
const ALL_FACES = [1, 2, 3, 4, 5, 6];
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function pick(arr) {
  return arr[Math.min(arr.length - 1, Math.floor(Math.random() * arr.length))];
}
export function auguryTierBones(tier) {
  // LE CARRÉ DE SIX — le jackpot. Pseudo-tier d'AFFICHAGE : l'économie le traite
  // en Vénus (cf. AUGURY_JACKPOT_SHARE), seuls les dés le distinguent.
  if (tier === "jackpot") return [6, 6, 6, 6];
  // VÉNUS — le triple six. Le 4e dé n'est jamais un six : ce serait le carré,
  // qui est réservé au jackpot et paierait bien davantage.
  if (tier === "venus") return shuffle([6, 6, 6, pick([1, 2, 3, 4, 5])]);
  // LE CHIEN — les quatre as.
  if (tier === "dog") return [1, 1, 1, 1];
  if (tier === "triple") {
    const v = pick(TRIPLE_FACES);
    return shuffle([v, v, v, pick(ALL_FACES.filter((x) => x !== v))]);
  }
  if (tier === "pair") {
    // Paire HAUTE + deux dés dépareillés : `rest` est tiré sans remise dans les
    // faces restantes, donc jamais de triple ni de seconde paire par accident.
    const v = pick(HIGH_FACES);
    const rest = shuffle(ALL_FACES.filter((x) => x !== v));
    return shuffle([v, v, rest[0], rest[1]]);
  }
  // JET CREUX — une paire d'AS et deux dés dépareillés : perdant, sans être le Chien.
  const rest = shuffle([...HIGH_FACES]);
  return shuffle([1, 1, rest[0], rest[1]]);
}

// Os du QUITTE OU DOUBLE. Le second jet est un pur pile ou face (AUGURY_DOUBLE_P),
// il n'a donc pas de tier propre : il faut quand même lui donner des os PLAUSIBLES.
// Avant, la scène passait auguryTierBones(win ? 'triple' : 'dog') — tout double
// gagné montrait un triple et tout double perdu montrait exactement 1-1-1-1. Sur le
// pari le plus rejoué du temple (le seul à EV nulle), le motif sautait aux yeux.
// Ici on tire un tier DANS la moitié correspondante, aux poids réels de la table
// (rite classique : le double n'a pas de rite), renormalisés sur cette moitié.
// L'issue est déjà décidée par le caller : ceci n'est QUE de l'habillage.
export function auguryDoubleBones(id, win) {
  const pEff = auguryBaseOdds(REGULATION_ACTIONS_BY_ID[id] || {});
  const o = auguryTierOdds(pEff, 1);
  const half = win
    ? [["venus", o.venus], ["triple", o.triple], ["pair", o.pair]]
    : [["hollow", o.hollow], ["dog", o.dog]];
  const total = half.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [tier, w] of half) {
    r -= w;
    if (r < 0) return auguryTierBones(tier);
  }
  return auguryTierBones(half[half.length - 1][0]);
}

// Jet de table. La mise (Faveur, rabais Clémence compris) est PAYÉE et l'issue
// TIRÉE immédiatement (les os sont figés pour l'animation), mais tous les
// EFFETS d'issue (gain de Faveur, cagnotte, float, chronique, historique) sont
// regroupés dans un `apply()` IDEMPOTENT. Sans option `defer`, apply() court
// aussitôt (chemin programmatique : automatisation, tests). Avec `defer: true`,
// l'UI le tient jusqu'à la chute des dés → aucun spoiler. `silent` coupe le
// float d'issue (auto-lancé passif). Retourne { win, tier, bones, riteId,
// pEff, stake, rebate, note, freeFlight, faveurGain, apply } — faveurGain
// peuplé PAR apply() (sur le même objet), lu par l'UI après la révélation.
// Perdre ne rend RIEN (pas de consolation en monnaie fermée) : une part de la
// mise nourrit la cagnotte d'Icare. Les gains d'une mise allégée par la
// Clémence sont servis au PRORATA (RTP inchangé).
export function castAugury(id, riteId = "classique", options = {}) {
  const opts = (typeof options === "object" && options !== null) ? options : {};
  const { render: doRender = true, defer = false, silent = false, stakeMult = 1 } = opts;
  if (gamePaused || collapseInProgress) return null;
  if (state.crisisLimitAnnounced) return null; // la crise terminale a ses propres autels
  const a = REGULATION_ACTIONS_BY_ID[id];
  if (!a || a.kind !== "gamble") return null;
  if (!regulationActionUnlocked(id)) return null;
  const rite = AUGURY_RITES[riteId] || AUGURY_RITES.classique;
  // Un rite gaté par artefact (le rite interdit) exige de le POSSÉDER : la garde
  // vit dans le moteur, pas seulement dans l'UI (l'automatisation passe par ici).
  if (rite.artifact && !hasTempleArtifact(rite.artifact)) return null;
  const pay = auguryPaytable(id, rite.id);
  // LES COFFRES : la mise × 10^rang possédé (clampé au moteur). Les gains suivent
  // AUTOMATIQUEMENT — le prorata gains × stake/pay.stake, déjà en place pour la
  // Clémence, scale n'importe quelle mise. Le vol de Vénus, lui, ne se multiplie
  // pas (min(1, ratio) : UN vol, sa valeur devient négligeable à l'échelle).
  const mult = clampStakeMult(stakeMult);
  const { rebate, stake: baseStake } = auguryStake(id, rite.id);
  const stake = baseStake * mult;
  if ((state.faveur || 0) < stake) return null;
  state.faveur = Math.max(0, (state.faveur || 0) - stake);

  const pEff = pay.pEff; // la Clémence n'entre plus dans le tirage
  const tier = drawTier(pEff, rite.spread ?? 1);
  const win = tier === "venus" || tier === "triple" || tier === "pair";
  // Le carré de six : une part des Vénus rafle la cagnotte. Tiré ICI, avec les
  // os, pour que l'animation soit déjà figée quand apply() court (l'UI diffère
  // apply jusqu'à la chute des dés — décider plus tard spoilerait ou, pire,
  // afficherait un carré sans rafle).
  const jackpot = tier === "venus" && Math.random() < AUGURY_JACKPOT_SHARE;
  const bones = auguryTierBones(jackpot ? "jackpot" : tier);

  const result = { id, win, tier, bones, riteId: rite.id, pEff, stake, rebate, note: null, freeFlight: false, faveurGain: 0, jackpot, jackpotGain: 0 };

  let applied = false;
  result.apply = () => {
    if (applied) return result; // idempotent : révélation OU flush à la fermeture
    applied = true;

    // Clémence (historique) : ne bouge qu'à la révélation (pas de spoiler).
    const hist = state.gambleHistory || (state.gambleHistory = {});
    const rolls = Array.isArray(hist[id]) ? hist[id] : (hist[id] = []);
    rolls.push(win ? 1 : tier === "dog" ? 2 : 0);
    if (rolls.length > GAMBLE_HISTORY_LEN) rolls.splice(0, rolls.length - GAMBLE_HISTORY_LEN);

    if (win) {
      // Gain de la paytable, au PRORATA EXACT de la mise réellement payée :
      // payRound (E[payRound(x)] = x) et non Math.round — sur une mise en
      // Clémence, round() arrondissait des gains VERS LE HAUT (round(4,5) = 5)
      // et suffisait, à dés 10, à faire passer le jet au-dessus de 1 (A13).
      result.faveurGain = payRound((pay.gains[tier] || 0) * stake / pay.stake);
      state.faveur = Math.max(0, (state.faveur || 0) + result.faveurGain);
      if (tier === "venus") {
        // Le Coup de Vénus offre un vol d'Icare — AU PRORATA lui aussi : le vol
        // est un gain, il suit la mise payée. Fixe pendant que la mise fondait,
        // sa valeur PAR FAVEUR MISÉE gonflait en Clémence (jusqu'à ×2 au
        // plancher) : c'était l'autre moitié de l'imprimante attrapée par A13.
        // Accordé avec probabilité mise/mise pleine → l'espérance du jet en
        // Clémence est EXACTEMENT celle du jet plein, par construction. min(1, …) :
        // un coffre ne multiplie pas les vols.
        result.freeFlight = Math.random() < Math.min(1, stake / pay.stake) && grantFreeFlight("plume");
        if (result.freeFlight) chronicle(`Coup de Vénus ! Les dés de « ${a.label} » tombent en trois six. Le temple offre un vol d'Icare.`);
        // LE CARRÉ DE SIX. Rafle au PRORATA DE LA MISE, jamais minté : ce qui
        // sort de la cella y a été versé par l'edge des tables. Aucun prorata à
        // réappliquer ici — potRakeShare est DÉJÀ fonction de la mise payée,
        // donc une mise allégée par la Clémence emporte mécaniquement moins.
        // On n'incrémente PAS state.icarusJackpots : ce compteur est le jalon
        // « frôler le soleil » du Grand Reset VII, il appartient à Icare.
        if (jackpot && (state.icarusPotFaveur || 0) > 0) {
          const { rake, left } = potRake(state.icarusPotFaveur, stake);
          result.jackpotGain = rake;
          state.faveur = Math.max(0, (state.faveur || 0) + rake);
          state.icarusPotFaveur = left;
          chronicle(left > 0
            ? `Le carré de six ! Les quatre dés de « ${a.label} » montrent la même face. Le temple cède sa part de la cagnotte (+${fmt(rake)} faveur) ; la cella en garde ${fmt(Math.round(left))}.`
            : `Le carré de six ! Les quatre dés de « ${a.label} » montrent la même face. La cella est vidée jusqu'à la dernière faveur (+${fmt(rake)}).`);
        }
      }
    }
    // La cagnotte est nourrie sur l'EDGE de la table, à CHAQUE jet — gagné comme
    // perdu (cf. feedPot). Avant, elle prenait 25 à 50 % de la MISE perdue alors que
    // l'edge n'en prend que ~3 % à dés 10 : la table imprimait (133,4 % avec le
    // noyé). Le versement ne dépend plus du tier, donc plus de « le Chien nourrit
    // double » ; en échange rtp_total < 1 est vrai par algèbre.
    feedPot(stake, pay.rtp);
    // Registre de la Chronique : une partie d'osselets de plus (mise réellement
    // débitée, gain net, temps forts Vénus/Chien).
    recordOsselets({ wagered: stake, won: result.faveurGain, tier });
    result.note = win ? (a.noteWin || a.note) : (a.noteFail || "Le pari tourne court, mais la table retient ton nom.");
    if (!silent) {
      // Le carré de six passe AVANT Vénus : c'est le même tier, mais l'annoncer
      // « Coup de Vénus » quand la cagnotte vient de tomber raterait l'événement.
      // Sur cella vide (rafle à 0) on retombe volontairement sur Vénus.
      const floatLabel = result.jackpotGain > 0 ? `🏺 Carré de six ! +${result.jackpotGain} faveur`
        : tier === "venus" ? "🎲 Coup de Vénus !"
        : tier === "dog" ? "🎲 Le jet du Chien…"
        : win ? `🎲 +${result.faveurGain} faveur`
        : `🎲 −${stake} faveur`;
      pushOutcomeFloat({ label: floatLabel, kind: win ? "gain" : "cost" });
    }
    renderCache._frameRatesVer = -1;
    if (doRender) render();
    return result;
  };

  result.note = win ? (a.noteWin || a.note) : (a.noteFail || "Le pari tourne court, mais la table retient ton nom.");
  if (!defer) result.apply();
  return result;
}

// Second jet — quitte ou double. `stake` = la FAVEUR gagnée au jet de table
// (outcome.faveurGain). Gagné → +wager Faveur de plus ; perdu → la Faveur
// gagnée est REPRISE. Chance FIXE à 50/50, gratuite : le seul pari que le
// temple ne taxe pas (EV nulle, pure variance — les dieux ne prélèvent pas
// sur l'audace).
export function doubleAugury(id, stake, options = {}) {
  const opts = (typeof options === "object" && options !== null) ? options : {};
  const { render: doRender = true, defer = false } = opts;
  if (gamePaused || collapseInProgress) return null;
  if (state.crisisLimitAnnounced) return null;
  const a = REGULATION_ACTIONS_BY_ID[id];
  if (!a || a.kind !== "gamble") return null;
  const wager = Math.max(0, Math.round(Number(stake) || 0));
  if (wager <= 0) return null;
  // Garde MOTEUR : la mise doit être sur la table au moment du jet. Sans elle,
  // un solde déjà entamé jouait quand même un double à mise pleine.
  if ((state.faveur || 0) < wager) return null;

  // Issue tirée maintenant (pour l'animation), effet différé comme castAugury.
  const win = Math.random() < AUGURY_DOUBLE_P;
  // Les os sortent du MOTEUR, comme dans castAugury : la scène ne les invente plus.
  const result = { id, win, wager, bones: auguryDoubleBones(id, win) };
  let applied = false;
  result.apply = () => {
    if (applied) return result;
    applied = true;
    // Mise EFFECTIVE bornée au solde de la RÉSOLUTION : entre le jet et la chute
    // des dés (~1,8 s), les automatisations du temple peuvent débiter la Faveur.
    // Avant, seule la PERTE était écrêtée au solde (le gain payait plein) : EV
    // positive dès que le solde passait sous le wager. Symétrique désormais.
    const wagerEff = Math.min(wager, Math.max(0, Math.round(state.faveur || 0)));
    if (win) {
      state.faveur = Math.max(0, (state.faveur || 0) + wagerEff);
      chronicle(`Défiés une seconde fois sur « ${a.label} », les dieux sourient encore : la Faveur redouble.`);
    } else {
      state.faveur = Math.max(0, (state.faveur || 0) - wagerEff);
      chronicle(`Les dieux se lassent d'être éprouvés : la Faveur de « ${a.label} » leur revient.`);
    }
    // Registre de la Chronique — le double n'avait AUCUN compteur : ses gains et
    // pertes étaient invisibles de faveurEarned et de games.osselets.
    recordOsselets({ wagered: win ? 0 : wagerEff, won: win ? wagerEff : 0 });
    pushOutcomeFloat({ label: win ? `🎲 +${wagerEff} faveur !` : "🎲 Le jet du Chien…", kind: win ? "gain" : "cost" });
    if (doRender) render();
    return result;
  };
  if (!defer) result.apply();
  return result;
}
