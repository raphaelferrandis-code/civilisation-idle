"use strict";

// La Table des augures — MOTEUR du mini-jeu de dés de la Maison des Plaisirs.
// La mise est en FAVEUR, LIBRE entre les limites de la table (actions/maisonTable.js).
// Lot 1 des gains « vrai casino » (2026-10-04, docs/PLAN-GAINS-CASINO.md) : les
// COTES sont fixes pour toujours — plus de dés pipés, plus de Clémence. Chaque RITE
// est un PARI : une chance de gagner (`p`) et des paiements, normalisés pour que
// chaque rite rende AUGURY_RTP (97 %). Le rite ne fixe plus le prix, il fixe le
// RISQUE : le prudent gagne 62 % du temps et paie peu, le rite interdit 18 % et
// paie gros.
// Une cérémonie en deux temps :
//   1. castAugury(id, rite, { stake }) — le JET DE TABLE : un tirage tranche,
//      5 issues (Vénus/Triple/Paire gagnantes, Creux/Chien perdantes) ; perdre =
//      mise perdue, la cagnotte reçoit sa part de l'avantage de la maison.
//   2. doubleAugury(id, stake) — le SECOND JET (« quitte ou double ») offert
//      après un gain : chance FIXE (AUGURY_DOUBLE_P), la mise est la Faveur
//      qu'on vient de gagner. Gagné → +wager Faveur ; perdu → reprise.
// Ni fatigue ni registre : la Maison est sa propre économie. L'effet est DIFFÉRÉ
// (option defer) jusqu'à la révélation par l'UI (anti-spoiler).

import { state, renderCache, render, gamePaused, collapseInProgress } from '../state.js';
import { regulationActionUnlocked } from '../mechanics.js';
import { REGULATION_ACTIONS_BY_ID } from '../../data/regulationActions.js';
import {
  GAMBLE_HISTORY_LEN,
  AUGURY_DOUBLE_P,
  AUGURY_TIER_SHARES,
  AUGURY_HOLLOW_SHARE,
  AUGURY_JACKPOT_SHARE,
  AUGURY_RTP,
  AUGURY_RITE_BETS,
  ICARUS_RTP
} from '../balance.js';
import { pushOutcomeFloat } from '../outcomeFloat.js';
import { fmt } from '../utils.js';
import { chronicle } from './utils.js';
import { hasTempleArtifact } from './templeArtifacts.js';
import { grantFreeFlight } from './templeFlights.js';
import { feedPot, payRound, potRake } from './templePot.js';
import { clampStake } from './maisonTable.js';
import { recordOsselets } from '../chronicleStats.js';

// Les RITES : quatre paris sur la même table. `p` = la chance de gagner, `spread`
// répartit Vénus/Chien (un gros spread gonfle Vénus DANS les gains et le Chien
// DANS les pertes), `profile` = les paiements relatifs des trois issues gagnantes
// avant normalisation (cf. auguryPaytable). Labels résolus par tr() côté UI.
export const AUGURY_RITES = {
  prudent: {
    id: "prudent", ...AUGURY_RITE_BETS.prudent,
    label: { fr: "Offrande prudente", en: "Cautious offering" },
    desc: {
      fr: "Une libation discrète : on gagne souvent, peu à la fois.",
      en: "A discreet libation: you win often, a little at a time."
    }
  },
  classique: {
    id: "classique", ...AUGURY_RITE_BETS.classique,
    label: { fr: "Rite ancestral", en: "Ancestral rite" },
    desc: {
      fr: "Le rite des anciens : une chance sur deux, des gains mesurés.",
      en: "The rite of the ancients: one chance in two, measured winnings."
    }
  },
  grand: {
    id: "grand", ...AUGURY_RITE_BETS.grand,
    label: { fr: "Grand sacrifice", en: "Great sacrifice" },
    desc: {
      fr: "Une hécatombe : on gagne rarement, mais Vénus paie gros.",
      en: "A hecatomb: you rarely win, but Venus pays big."
    }
  },
  // Le 4e rite, GATÉ par l'artefact « Le rite interdit » (lignée osselets, cf.
  // castAugury) — le lot 2 le rendra au rang.
  interdit: {
    id: "interdit", ...AUGURY_RITE_BETS.interdit, artifact: "interdit",
    label: { fr: "Rite interdit", en: "Forbidden rite" },
    desc: {
      fr: "Le rite que les prêtres taisent : presque toujours perdu, et Vénus paie au décuple.",
      en: "The rite the priests keep silent: almost always lost, and Venus pays tenfold."
    }
  }
};

// La Table des prises — 5 issues lues sur les dés. La masse gagnante (p) se
// répartit Vénus/Triple/Paire ; la masse perdante Creux/Chien. Labels pour l'UI.
export const AUGURY_TIER_LABELS = {
  venus: { fr: "Coup de Vénus", en: "Venus throw" },
  triple: { fr: "Triple", en: "Triple" },
  pair: { fr: "Paire haute", en: "High pair" },
  hollow: { fr: "Jet creux", en: "Hollow throw" },
  dog: { fr: "Le Chien", en: "The Dog" }
};

// La chance de gagner d'un rite (fixe : aucun achat ne la touche).
export function auguryRiteOdds(riteId = "classique") {
  return (AUGURY_RITES[riteId] || AUGURY_RITES.classique).p;
}

// Répartition des 5 issues pour une chance de gagner `p` et un `spread`.
// La frontière gagne/perd reste p ; le spread déplace la masse DANS chaque moitié.
export function auguryTierOdds(p, spread = 1) {
  const venusShare = Math.min(0.9, AUGURY_TIER_SHARES.venus * spread);
  const dogShare = Math.max(0, Math.min(0.95, (1 - AUGURY_HOLLOW_SHARE) * spread));
  const venus = p * venusShare;
  const triple = p * AUGURY_TIER_SHARES.triple;
  return {
    venus,
    triple,
    pair: Math.max(0, p - venus - triple),
    hollow: Math.max(0, (1 - p) * (1 - dogShare)),
    dog: (1 - p) * dogShare
  };
}

// Paytable d'un rite : les MULTIPLICATEURS de la mise par issue gagnante (la mise
// rendue comprise), normalisés pour que le rite rende EXACTEMENT AUGURY_RTP. Le Coup
// de Vénus offre en plus un vol d'Icare à la mise du jet, compté à sa valeur (la
// mise × le RTP d'Icare) : la Faveur versée et le vol frôlent ensemble la cible,
// jamais plus. Les gains sont servis par payRound (E[payRound(x)] = x) : le RTP est
// exact quelle que soit la mise. `rtp` (vol compris) est ce que lisent feedPot, le
// badge d'automatisation et le banc. `id` est gardé pour la forme (une seule table).
export function auguryPaytable(id, riteId = "classique") {
  const rite = AUGURY_RITES[riteId] || AUGURY_RITES.classique;
  const odds = auguryTierOdds(rite.p, rite.spread ?? 1);
  const flightShare = odds.venus * ICARUS_RTP;
  const P = rite.profile;
  const brut = odds.venus * P.venus + odds.triple * P.triple + odds.pair * P.pair;
  const k = brut > 0 ? (AUGURY_RTP - flightShare) / brut : 0;
  const mult = { venus: P.venus * k, triple: P.triple * k, pair: P.pair * k };
  const rtp = odds.venus * mult.venus + odds.triple * mult.triple + odds.pair * mult.pair + flightShare;
  return { riteId: rite.id, mult, rtp, p: rite.p, odds, flightShare };
}

// Répartition des 5 issues. UN SEUL Math.random() en tête (les tests le
// pilotent), les os cosmétiques sont générés ensuite.
function drawTier(p, spread = 1) {
  const r = Math.random();
  const odds = auguryTierOdds(p, spread);
  if (r < odds.venus) return "venus";
  if (r < odds.venus + odds.triple) return "triple";
  if (r < p) return "pair";
  if (r < p + odds.hollow) return "hollow";
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
// On tire un tier DANS la moitié correspondante, aux poids réels de la table (rite
// ancestral : le double n'a pas de rite), renormalisés sur cette moitié. L'issue
// est déjà décidée par le caller : ceci n'est QUE de l'habillage.
export function auguryDoubleBones(id, win) {
  const rite = AUGURY_RITES.classique;
  const o = auguryTierOdds(rite.p, rite.spread);
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

// Jet de table. La mise (Faveur, dans les limites de la table) est PAYÉE et l'issue
// TIRÉE immédiatement (les os sont figés pour l'animation), mais tous les EFFETS
// d'issue (gain de Faveur, cagnotte, float, chronique, historique) sont regroupés
// dans un `apply()` IDEMPOTENT. Sans option `defer`, apply() court aussitôt (chemin
// programmatique : automatisation, tests). Avec `defer: true`, l'UI le tient
// jusqu'à la chute des dés → aucun spoiler. `silent` coupe le float d'issue
// (auto-lancé passif). Options : `stake` (Faveur, ramenée dans les limites ; sous la
// limite basse, le jet est refusé). Retourne { win, tier, bones, riteId, p, stake,
// mult, note, freeFlight, faveurGain, jackpot, jackpotGain, apply } — faveurGain
// peuplé PAR apply() (sur le même objet), lu par l'UI après la révélation.
export function castAugury(id, riteId = "classique", options = {}) {
  const opts = (typeof options === "object" && options !== null) ? options : {};
  const { render: doRender = true, defer = false, silent = false } = opts;
  if (gamePaused || collapseInProgress) return null;
  if (state.crisisLimitAnnounced) return null; // la crise terminale a ses propres autels
  const a = REGULATION_ACTIONS_BY_ID[id];
  if (!a || a.kind !== "gamble") return null;
  if (!regulationActionUnlocked(id)) return null;
  const rite = AUGURY_RITES[riteId] || AUGURY_RITES.classique;
  // Un rite gaté par artefact (le rite interdit) exige de le POSSÉDER : la garde
  // vit dans le moteur, pas seulement dans l'UI (l'automatisation passe par ici).
  if (rite.artifact && !hasTempleArtifact(rite.artifact)) return null;
  const stake = clampStake(opts.stake);
  if (stake <= 0) return null;
  if ((state.faveur || 0) < stake) return null;
  state.faveur = Math.max(0, (state.faveur || 0) - stake);

  const pay = auguryPaytable(id, rite.id);
  const tier = drawTier(rite.p, rite.spread ?? 1);
  const win = tier === "venus" || tier === "triple" || tier === "pair";
  // Le carré de six : une part des Vénus rafle la cagnotte. Tiré ICI, avec les
  // os, pour que l'animation soit déjà figée quand apply() court (l'UI diffère
  // apply jusqu'à la chute des dés — décider plus tard spoilerait ou, pire,
  // afficherait un carré sans rafle).
  const jackpot = tier === "venus" && Math.random() < AUGURY_JACKPOT_SHARE;
  const bones = auguryTierBones(jackpot ? "jackpot" : tier);

  const result = {
    id, win, tier, bones, riteId: rite.id, p: rite.p, stake, mult: win ? pay.mult[tier] : 0,
    note: null, freeFlight: false, faveurGain: 0, jackpot, jackpotGain: 0
  };

  let applied = false;
  result.apply = () => {
    if (applied) return result; // idempotent : révélation OU flush à la fermeture
    applied = true;

    // Historique des jets (pastilles de la table) : ne bouge qu'à la révélation.
    const hist = state.gambleHistory || (state.gambleHistory = {});
    const rolls = Array.isArray(hist[id]) ? hist[id] : (hist[id] = []);
    rolls.push(win ? 1 : tier === "dog" ? 2 : 0);
    if (rolls.length > GAMBLE_HISTORY_LEN) rolls.splice(0, rolls.length - GAMBLE_HISTORY_LEN);

    if (win) {
      // payRound (E[payRound(x)] = x) : le RTP reste exact à toute mise.
      result.faveurGain = payRound(stake * (pay.mult[tier] || 0));
      state.faveur = Math.max(0, (state.faveur || 0) + result.faveurGain);
      if (tier === "venus") {
        // Le Coup de Vénus offre un vol d'Icare à la mise du jet (compté dans la
        // paytable). Une file pleine le perd : la table rend alors un peu moins.
        result.freeFlight = grantFreeFlight(stake);
        if (result.freeFlight) chronicle(`Coup de Vénus ! Les dés de « ${a.label} » tombent en trois six. La Maison offre un vol d'Icare.`);
        // LE CARRÉ DE SIX. Rafle au PRORATA DE LA MISE, jamais minté : ce qui sort
        // de la cella y a été versé par l'edge des tables. On n'incrémente PAS
        // state.icarusJackpots : ce compteur est le jalon « frôler le soleil » du
        // Grand Reset VII, il appartient à Icare.
        if (jackpot && (state.icarusPotFaveur || 0) > 0) {
          const { rake, left } = potRake(state.icarusPotFaveur, stake);
          result.jackpotGain = rake;
          state.faveur = Math.max(0, (state.faveur || 0) + rake);
          state.icarusPotFaveur = left;
          chronicle(left > 0
            ? `Le carré de six ! Les quatre dés de « ${a.label} » montrent la même face. La Maison cède sa part de la cagnotte (+${fmt(rake)} faveur) ; la cella en garde ${fmt(Math.round(left))}.`
            : `Le carré de six ! Les quatre dés de « ${a.label} » montrent la même face. La cella est vidée jusqu'à la dernière faveur (+${fmt(rake)}).`);
        }
      }
    }
    // La cagnotte est nourrie sur l'EDGE de la table, à CHAQUE jet — gagné comme
    // perdu (cf. feedPot) : rtp_total < 1 est vrai par algèbre.
    feedPot(stake, pay.rtp);
    // Registre de la Chronique : une partie d'osselets de plus (mise débitée, gain
    // net, temps forts Vénus/Chien).
    recordOsselets({ wagered: stake, won: result.faveurGain, tier });
    result.note = win ? (a.noteWin || a.note) : (a.noteFail || "Le pari tourne court, mais la table retient ton nom.");
    if (!silent) {
      // Le carré de six passe AVANT Vénus : c'est le même tier, mais l'annoncer
      // « Coup de Vénus » quand la cagnotte vient de tomber raterait l'événement.
      // Sur cella vide (rafle à 0) on retombe volontairement sur Vénus.
      const floatLabel = result.jackpotGain > 0 ? `🏺 Carré de six ! +${fmt(result.jackpotGain)} faveur`
        : tier === "venus" ? "🎲 Coup de Vénus !"
        : tier === "dog" ? "🎲 Le jet du Chien…"
        : win ? `🎲 +${fmt(result.faveurGain)} faveur`
        : `🎲 −${fmt(stake)} faveur`;
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
