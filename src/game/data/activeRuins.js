"use strict";

import { localizeData } from '../core/i18n.js';

export const ACTIVE_RUIN_RUPTURE_START = 0.10;
export const ACTIVE_RUIN_FOOD_ENGINE_COST_MULT = 1.20;
export const ACTIVE_RUIN_GOLD_PROD_MULT = 0.75;
export const ACTIVE_RUIN_USURE_MULT = 1.10;
export const ACTIVE_RUIN_RUIN_GAIN_PER_MALUS = 0.10;

// ── Les six fardeaux qui étaient des « slots futurs » ────────────────────────
// Principe commun, et c'est ce qui fait d'Antée une décision : porter un Héritage
// comme fardeau, c'est en GARDER LE POUVOIR mais en PERDRE LE CONTRÔLE. Le malus
// n'est jamais une taxe arbitraire — c'est le don lui-même, qui se déclenche sans
// toi. La question posée au joueur devient donc : « lesquels de mes pouvoirs
// puis-je me permettre de laisser partir tout seuls ? »
export const ACTIVE_RUIN_SISYPHE_CREEP    = 1.004; // Sisyphe : le rocher reprend sa pente, par achat
export const ACTIVE_RUIN_BABEL_COST_MULT  = 1.25;  // Babel : la catégorie dominante coûte plus cher
export const ACTIVE_RUIN_ICARE_AUTO_BURN  = 0.60;  // Icare : la Surchauffe part seule à cette Rupture
export const ACTIVE_RUIN_PHENIX_FORCED_SEC = 900;  // Phénix : le bûcher s'allume à heure fixe
// Antée — « la force des fardeaux » : porter PLUSIEURS maluses simultanés (4) ET
// prospérer malgré eux (faire croître la pop ×ANTEE_POP_MULT depuis le départ).
export const ANTEE_MIN_ACTIVE_RUINS = 4;       // 4 maluses simultanés (était 2)
export const ANTEE_POP_MULT = 50;              // Réussite : pic de pop ≥ 50× le départ, sous le poids des 4 maluses

export const ACTIVE_RUIN_DEFINITIONS = [
  {
    id: "enee",
    stateKey: "eneeHeritage",
    title: { fr: "Migration fondatrice", en: "Founding Migration" },
    source: { fr: "Énée", en: "Énée" },
    bonus: { fr: "Boost de départ actif (+10% par effondrement, jusqu'à +100%).", en: "Active starting boost (+10% per collapse, up to +100%)." },
    malus: { fr: `Rupture initiale +${Math.round(ACTIVE_RUIN_RUPTURE_START * 100)}.`, en: `Initial Rupture +${Math.round(ACTIVE_RUIN_RUPTURE_START * 100)}.` }
  },
  {
    id: "promethee",
    stateKey: "prometheeBraisiers",
    title: { fr: "Braisiers ancestraux", en: "Ancestral Braziers" },
    source: { fr: "Prométhée", en: "Prométhée" },
    bonus: { fr: "Bonus Nourriture x2 actif en début de cycle.", en: "Active Food bonus x2 at the start of the cycle." },
    malus: { fr: `Chaque moteur de Nourriture coûte ${Math.round((ACTIVE_RUIN_FOOD_ENGINE_COST_MULT - 1) * 100)}% plus cher.`, en: `Each Food engine costs ${Math.round((ACTIVE_RUIN_FOOD_ENGINE_COST_MULT - 1) * 100)}% more.` }
  },
  {
    id: "age_or",
    stateKey: "orHeritage",
    title: { fr: "Equilibre Dore", en: "Golden Balance" },
    source: { fr: "Âge d'Or", en: "Golden Age" },
    bonus: { fr: "Le Comptoir de marchandage est ouvert.", en: "The Trading Post is open." },
    malus: { fr: `La production de Trésor démarre ${Math.round((1 - ACTIVE_RUIN_GOLD_PROD_MULT) * 100)}% plus lente.`, en: `Treasury production starts ${Math.round((1 - ACTIVE_RUIN_GOLD_PROD_MULT) * 100)}% slower.` }
  },
  {
    id: "hephaistos",
    stateKey: "hephHeritage",
    title: { fr: "Automates ancestraux", en: "Ancestral Automatons" },
    source: { fr: "Héphaïstos", en: "Héphaïstos" },
    bonus: { fr: "Automatisations permanentes actives.", en: "Permanent automations active." },
    malus: { fr: `L'Usure monte ${Math.round((ACTIVE_RUIN_USURE_MULT - 1) * 100)}% plus vite.`, en: `Wear rises ${Math.round((ACTIVE_RUIN_USURE_MULT - 1) * 100)}% faster.` }
  },
  {
    id: "atlas",
    stateKey: "atlasHeritage",
    title: { fr: "Fardeau du ciel", en: "Sky Burden" },
    source: { fr: "Atlas", en: "Atlas" },
    bonus: { fr: "« Atlas prend le coup » reste disponible : une gestion de crise passe sans effet chaque cycle.", en: "\"Atlas takes the hit\" remains available: one crisis management passes with no effect each cycle." },
    malus: { fr: "Atlas prend le PREMIER coup, pas celui que tu choisis : le skip part d'office sur la première crise du cycle.", en: "Atlas takes the FIRST hit, not the one you choose: the skip fires on the cycle's first crisis, automatically." }
  },
  {
    id: "sisyphe",
    stateKey: "sisypheHeritage",
    title: { fr: "Pente du rocher", en: "The Slope" },
    source: { fr: "Sisyphe", en: "Sisyphe" },
    bonus: { fr: "L'inflation naturelle des coûts croît plus lentement, pour toujours.", en: "Natural cost inflation grows more slowly, forever." },
    malus: { fr: `Chaque achat réinflate tous les coûts de ${((ACTIVE_RUIN_SISYPHE_CREEP - 1) * 100).toFixed(1)} % : le rocher reprend sa pente.`, en: `Each purchase re-inflates all costs by ${((ACTIVE_RUIN_SISYPHE_CREEP - 1) * 100).toFixed(1)}%: the boulder rolls back.` }
  },
  {
    id: "babel",
    stateKey: "babelHeritage",
    title: { fr: "Confusion des langues", en: "Confusion of Tongues" },
    source: { fr: "Babel", en: "Babel" },
    bonus: { fr: "La Langue commune reste disponible : une catégorie déclarée produit +20 % chaque cycle.", en: "The Common Tongue remains available: a declared category produces +20% each cycle." },
    malus: { fr: `La catégorie sur laquelle tu t'appuies le plus coûte ${Math.round((ACTIVE_RUIN_BABEL_COST_MULT - 1) * 100)} % plus cher.`, en: `The category you lean on most costs ${Math.round((ACTIVE_RUIN_BABEL_COST_MULT - 1) * 100)}% more.` }
  },
  {
    id: "icare",
    stateKey: "icareHeritage",
    title: { fr: "Cire fondante", en: "Melting Wax" },
    source: { fr: "Icare", en: "Icare" },
    bonus: { fr: "L'Aile disponible pendant les cycles normaux.", en: "The Wing available during normal cycles." },
    malus: { fr: `L'Aile monte toute seule dès que la Rupture atteint ${Math.round(ACTIVE_RUIN_ICARE_AUTO_BURN * 100)} % : tu gardes le vol, tu perds le moment.`, en: `The Wing climbs on its own once Rupture reaches ${Math.round(ACTIVE_RUIN_ICARE_AUTO_BURN * 100)}%: you keep the flight, you lose the timing.` }
  },
  {
    id: "phenix",
    stateKey: "phoenixHeritage",
    title: { fr: "Bûcher programmé", en: "Scheduled Pyre" },
    source: { fr: "Phénix", en: "Phénix" },
    bonus: { fr: "Script d'effondrement automatique disponible.", en: "Automatic collapse script available." },
    malus: { fr: `Le bûcher s'allume de force au bout de ${Math.round(ACTIVE_RUIN_PHENIX_FORCED_SEC / 60)} minutes de cycle, quels que soient tes réglages.`, en: `The pyre lights itself after ${Math.round(ACTIVE_RUIN_PHENIX_FORCED_SEC / 60)} minutes of cycle, whatever your settings.` }
  },
  {
    id: "atrides",
    stateKey: "atridesHeritage",
    title: { fr: "Pacte signé d'office", en: "Pact Signed For You" },
    source: { fr: "Atrides", en: "Atrides" },
    bonus: { fr: "Pacte des Atrides disponible en début de cycle.", en: "Pact of the Atreides available at cycle start." },
    malus: { fr: "Le pacte est signé sans toi au lancement : tu prends le doublement, donc tu prendras la moitié pendant la crise.", en: "The pact is signed without you at launch: you take the doubling, so you will take the halving during the crisis." }
  }
];

export function unlockedActiveRuinDefinitions(state) {
  return ACTIVE_RUIN_DEFINITIONS.filter((definition) => Boolean(state[definition.stateKey]));
}

export function activeRuinIds(state) {
  return Array.isArray(state.activeRuinIds) ? state.activeRuinIds : [];
}

export function hasActiveRuin(state, id) {
  return activeRuinIds(state).includes(id);
}

export function activeRuinCount(state) {
  return activeRuinIds(state).length;
}

export function activeRuinMultiplier(state) {
  return 1 + activeRuinCount(state) * ACTIVE_RUIN_RUIN_GAIN_PER_MALUS;
}

// Aplatit les feuilles { fr, en } (title/source/bonus/malus) en chaînes (i18n.js).
localizeData(ACTIVE_RUIN_DEFINITIONS);
