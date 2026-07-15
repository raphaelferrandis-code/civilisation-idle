"use strict";

// La Table des augures — MOTEUR du mini-jeu de paris (onglet Régulation).
// Jeux DÉCOUPLÉS (arbitrage Raph 2026-07-14) : la mise est en RESSOURCES (le
// puits/risque), le GAIN est de la FAVEUR (monnaie méta) — plus de relief ni
// de Rupture. Une cérémonie en deux temps :
//   1. castAugury(id, rite) — le JET DE TABLE : le RITE module la mise (coût)
//      et le gain de Faveur (×costMult) ; un tirage tranche (p effective =
//      base réduite + Clémence, cf. clemencyBonus). 5 issues (Vénus/Triple/
//      Paire gagnantes, Creux/Chien perdantes) ; perdre = mise sacrifiée +
//      petite consolation de Faveur + la cagnotte d'Icare s'épaissit.
//   2. doubleAugury(id, stake) — le SECOND JET (« quitte ou double ») offert
//      après un gain : chance FIXE (AUGURY_DOUBLE_P, sans Clémence), la mise
//      est la Faveur qu'on vient de gagner. Gagné → +wager Faveur ; perdu →
//      la Faveur gagnée est reprise.
// Ni fatigue ni registre : le temple est sa propre économie. L'effet est
// DIFFÉRÉ (option defer) jusqu'à la révélation par l'UI (anti-spoiler).

import { state, renderCache, render, gamePaused, collapseInProgress } from '../state.js';
import {
  crisisCosts,
  clemencyBonus,
  regulationActionUnlocked
} from '../mechanics.js';
import { canPayCost, payCost } from '../utils.js';
import { D } from '../num.js';
import { REGULATION_ACTIONS_BY_ID } from '../../data/regulationActions.js';
import {
  GAMBLE_P_MAX,
  GAMBLE_HISTORY_LEN,
  GAMBLE_ODDS_SCALE,
  DICE_BOOST_STEP,
  DICE_BOOST_MAX_LEVEL,
  AUGURY_DOUBLE_P,
  AUGURY_TIER_SHARES,
  AUGURY_HOLLOW_SHARE,
  AUGURY_FAVEUR,
  AUGURY_POT_FEED_HOLLOW,
  AUGURY_POT_FEED_DOG,
  ICARUS_POT_CAP_FAVEUR,
  ICARUS_FREE_FLIGHTS_MAX
} from '../balance.js';
import { pushOutcomeFloat } from '../outcomeFloat.js';
import { chronicle } from './utils.js';
import { ivoryDogCut, ivoryVenusBonus, noyePotMult } from './templeArtifacts.js';

// Les trois RITES : trois formes de risque pour la même table. `costMult` scale
// la MISE (ressources) ET le gain de Faveur (grosse mise = gros gain). `spread`
// déforme la VARIANCE (fusion 2026-07-15) : >1 fatten les queues (plus de Vénus
// DANS les gains, plus de Chiens DANS les pertes) ; <1 les calme. La frontière
// gagne/perd (les ODDS) NE bouge PAS avec la mise — elle est pilotée par les
// items (dés pipés) et la Clémence. Jeux découplés : perdre ne coûte que la mise
// (plus de retour de bâton sur la Rupture). Labels résolus par tr() côté UI.
export const AUGURY_RITES = {
  prudent: {
    id: "prudent", costMult: 0.6, spread: 0.55,
    label: { fr: "Offrande prudente", en: "Cautious offering" },
    desc: {
      fr: "Une libation discrète : mise réduite, Faveur modeste, sort plus sage (moins de Chiens).",
      en: "A discreet libation: reduced stake, modest Favor, calmer fate (fewer Dogs)."
    }
  },
  classique: {
    id: "classique", costMult: 1, spread: 1,
    label: { fr: "Rite ancestral", en: "Ancestral rite" },
    desc: {
      fr: "Le rite tel que les anciens le pratiquaient — mise, Faveur et variance d'aplomb.",
      en: "The rite as the ancients practiced it — balanced stake, Favor and variance."
    }
  },
  grand: {
    id: "grand", costMult: 2, spread: 1.7,
    label: { fr: "Grand sacrifice", en: "Great sacrifice" },
    desc: {
      fr: "Une hécatombe : mise doublée, Faveur magnifiée, sort EXTRÊME — plus de Vénus, mais plus de Chiens.",
      en: "A hecatomb: doubled stake, magnified Favor, EXTREME fate — more Venus, but more Dogs."
    }
  }
};

// La Table des prises — 5 issues lues sur les os (1·3·4·6, les AS sont
// funestes). La masse gagnante (p effective, Faveur comprise) se répartit
// Vénus/Triple/Paire ; la masse perdante Creux/Chien. Labels pour l'UI.
export const AUGURY_TIER_LABELS = {
  venus: { fr: "Coup de Vénus", en: "Venus throw" },
  triple: { fr: "Triple", en: "Triple" },
  pair: { fr: "Paire haute", en: "High pair" },
  hollow: { fr: "Jet creux", en: "Hollow throw" },
  dog: { fr: "Le Chien", en: "The Dog" }
};

// Chance de base EFFECTIVE d'un pari : la proba de l'action réduite par le
// facteur early (GAMBLE_ODDS_SCALE) + le bonus PERMANENT des dés pipés
// (state.diceLevel, boutique de Faveur). C'est cette base (hors Clémence) qu'affiche
// l'UI ; la Clémence s'ajoute par-dessus au tirage.
export function auguryBaseOdds(a) {
  const p = (a && typeof a === "object") ? (a.p ?? 0.5) : (REGULATION_ACTIONS_BY_ID[a]?.p ?? 0.5);
  const diceBonus = Math.min(DICE_BOOST_MAX_LEVEL, state.diceLevel || 0) * DICE_BOOST_STEP;
  return Math.max(0, Math.min(GAMBLE_P_MAX, p * GAMBLE_ODDS_SCALE + diceBonus));
}

// Répartition des 5 issues. `spread` (la mise, cf. AUGURY_RITES) déforme la
// variance SANS toucher la frontière gagne/perd : la masse gagnante reste pEff,
// la perdante 1-pEff, mais un gros `spread` gonfle la part de Vénus DANS les
// gains et de Chien DANS les pertes (au détriment de la paire et du creux).
// spread=1 → répartition historique exacte (rétro-compatible).
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

// Tirage du tier : UN SEUL Math.random() en tête (les tests le pilotent), les
// os cosmétiques sont générés ensuite.
function drawTier(pEff, spread = 1) {
  const r = Math.random();
  const odds = auguryTierOdds(pEff, spread);
  if (r < odds.venus) return "venus";
  if (r < odds.venus + odds.triple) return "triple";
  if (r < pEff) return "pair";
  if (r < pEff + odds.hollow) return "hollow";
  return "dog";
}

// Os canoniques d'un tier (convention lisible : paire/triple de HAUTES = gains,
// paire d'as = creux, quatre as = Chien, quatre différentes = Vénus).
const HIGH_FACES = [3, 4, 6];
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
  if (tier === "venus") return shuffle([1, 3, 4, 6]);
  if (tier === "dog") return [1, 1, 1, 1];
  if (tier === "triple") {
    const v = pick(HIGH_FACES);
    return shuffle([v, v, v, pick([1, 3, 4, 6].filter((x) => x !== v))]);
  }
  if (tier === "pair") {
    const v = pick(HIGH_FACES);
    const rest = shuffle([1, 3, 4, 6].filter((x) => x !== v));
    return shuffle([v, v, rest[0], rest[1]]);
  }
  const rest = shuffle([...HIGH_FACES]);
  return shuffle([1, 1, rest[0], rest[1]]);
}

// Coût d'un jet pour un rite : le coût de table (ancré production, escaladé
// par l'usage et la fatigue — cf. crisisCosts) × le multiplicateur du rite.
export function auguryCost(id, riteId = "classique") {
  const base = crisisCosts()[id];
  if (!base) return null;
  const rite = AUGURY_RITES[riteId] || AUGURY_RITES.classique;
  const out = {};
  for (const [res, amount] of Object.entries(base)) {
    out[res] = D(amount).mul(rite.costMult);
  }
  return out;
}

// Jet de table. Le coût est PAYÉ et l'issue TIRÉE immédiatement (les os sont
// figés pour l'animation), mais tous les EFFETS d'issue (relief, instabilité,
// cagnotte, float, chronique, registre, Faveur…) sont regroupés dans un
// `apply()` IDEMPOTENT. Sans option `defer`, apply() court aussitôt (chemin
// programmatique : runCrisisAction, tests). Avec `defer: true`, l'UI le tient
// jusqu'à la chute des dés → aucun spoiler (jauges + float synchronisés à la
// révélation). `by` = magistrat de l'Intendance (non utilisé pour les paris).
// Retourne { win, tier, bones, riteId, pEff, note, freeFlight, faveurGain,
// apply } — faveurGain peuplé PAR apply() (sur le même objet), lu par l'UI
// après la révélation. Jeux DÉCOUPLÉS : le gain est de la FAVEUR (plus de
// relief/Rupture) ; perdre ne coûte que la mise (déjà payée) + nourrit la
// cagnotte. Ni fatigue ni registre : le temple est sa propre économie.
export function castAugury(id, riteId = "classique", options = {}) {
  const opts = (typeof options === "object" && options !== null) ? options : {};
  // `silent` : coupe le float d'issue (auto-lancé du moteur d'automatisation —
  // un jeu passif ne doit pas spammer l'écran de « +N faveur »).
  const { render: doRender = true, defer = false, silent = false } = opts;
  if (gamePaused || collapseInProgress) return null;
  if (state.crisisLimitAnnounced) return null; // la crise terminale a ses propres autels
  const a = REGULATION_ACTIONS_BY_ID[id];
  if (!a || a.kind !== "gamble") return null;
  if (!regulationActionUnlocked(id)) return null;
  const rite = AUGURY_RITES[riteId] || AUGURY_RITES.classique;
  const cost = auguryCost(id, rite.id);
  if (!cost || !canPayCost(cost)) return null;
  payCost(cost);

  // Chance de base réduite (early) + Clémence (pitié sur série noire).
  const pBase = auguryBaseOdds(a);
  const pEff = Math.min(GAMBLE_P_MAX, pBase + clemencyBonus(id, pBase));
  const tier = drawTier(pEff, rite.spread ?? 1);
  const win = tier === "venus" || tier === "triple" || tier === "pair";
  const bones = auguryTierBones(tier);

  const result = { id, win, tier, bones, riteId: rite.id, pEff, note: null, freeFlight: false, faveurGain: 0 };

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
      // Gain de FAVEUR : base de l'issue × mise (costMult du rite).
      result.faveurGain = Math.round((AUGURY_FAVEUR[tier] || 0) * rite.costMult);
      state.faveur = Math.max(0, (state.faveur || 0) + result.faveurGain);
      if (tier === "venus") {
        // Le Coup de Vénus offre en plus un vol d'Icare (mise Plume).
        state.icarusFreeFlights = Math.min(ICARUS_FREE_FLIGHTS_MAX, (state.icarusFreeFlights || 0) + 1);
        result.freeFlight = true;
        chronicle(`Coup de Vénus ! Les os de « ${a.label} » tombent en quatre faces parfaites — le temple offre un vol d'Icare.`);
      }
    } else {
      // Consolation PLATE (perdre gros ne rapporte pas) ; le revers nourrit la
      // cagnotte de Faveur du temple (le Chien, plus lourd, en verse davantage).
      result.faveurGain = AUGURY_FAVEUR[tier] || 0;
      state.faveur = Math.max(0, (state.faveur || 0) + result.faveurGain);
      const potFeed = (a.cost?.seconds || 0) * rite.costMult * (tier === "dog" ? AUGURY_POT_FEED_DOG : AUGURY_POT_FEED_HOLLOW) * noyePotMult();
      state.icarusPotFaveur = Math.min(ICARUS_POT_CAP_FAVEUR, Math.max(0, state.icarusPotFaveur || 0) + potFeed);
    }
    result.note = win ? (a.noteWin || a.note) : (a.noteFail || "Le pari tourne court, mais la table retient ton nom.");
    if (!silent) {
      const floatLabel = tier === "venus" ? "🎲 Coup de Vénus !"
        : tier === "dog" ? "🎲 Le jet du Chien…"
        : `🎲 +${result.faveurGain} faveur`;
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
// gagnée est REPRISE. Chance FIXE (sans Clémence), gratuit en ressources.
export function doubleAugury(id, stake, options = {}) {
  const opts = (typeof options === "object" && options !== null) ? options : {};
  const { render: doRender = true, defer = false } = opts;
  if (gamePaused || collapseInProgress) return null;
  if (state.crisisLimitAnnounced) return null;
  const a = REGULATION_ACTIONS_BY_ID[id];
  if (!a || a.kind !== "gamble") return null;
  const wager = Math.max(0, Math.round(Number(stake) || 0));
  if (wager <= 0) return null;

  // Issue tirée maintenant (pour l'animation), effet différé comme castAugury.
  const win = Math.random() < AUGURY_DOUBLE_P;
  const result = { id, win, wager };
  let applied = false;
  result.apply = () => {
    if (applied) return result;
    applied = true;
    if (win) {
      state.faveur = Math.max(0, (state.faveur || 0) + wager);
      chronicle(`Défiés une seconde fois sur « ${a.label} », les dieux sourient encore : la Faveur redouble.`);
    } else {
      state.faveur = Math.max(0, (state.faveur || 0) - wager);
      chronicle(`Les dieux se lassent d'être éprouvés : la Faveur de « ${a.label} » leur revient.`);
    }
    pushOutcomeFloat({ label: win ? `🎲 +${wager} faveur !` : "🎲 Le jet du Chien…", kind: win ? "gain" : "cost" });
    if (doRender) render();
    return result;
  };
  if (!defer) result.apply();
  return result;
}
