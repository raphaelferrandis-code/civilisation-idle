"use strict";

import { localizeData } from '../core/i18n.js';

export const ACTIVE_RUIN_RUPTURE_START = 0.10;
export const ACTIVE_RUIN_FOOD_ENGINE_COST_MULT = 1.20;
export const ACTIVE_RUIN_GOLD_PROD_MULT = 0.75;
export const ACTIVE_RUIN_USURE_MULT = 1.10;
const ACTIVE_RUIN_RUIN_GAIN_PER_MALUS = 0.10;

// ── Les six fardeaux qui étaient des « slots futurs » ────────────────────────
// Principe commun, et c'est ce qui fait d'Antée une décision : porter un Héritage
// comme fardeau, c'est en GARDER LE POUVOIR mais en PERDRE LE CONTRÔLE. Le malus
// n'est jamais une taxe arbitraire — c'est le don lui-même, qui se déclenche sans
// toi. La question posée au joueur devient donc : « lesquels de mes pouvoirs
// puis-je me permettre de laisser partir tout seuls ? »
// Sisyphe : le rocher reprend sa pente, PAR BÂTIMENT acheté — un lot de 100 vaut
// 100 crans, au même prix que 100 achats un par un (forme fermée, cost.js). Le
// cran se prenait une fois par APPEL : un Max valait 1 cran, « Tout acheter » et
// les automates 1 par unité (×7,4 après 500 unités) — audit 2026-10-05, BUG-35,
// choix A de Raph. Compté juste à l'ancien ×1,004, la cible de 180 bâtiments
// (~1 330 unités) aurait coûté ×204 : retuné à ×1,0008 (≈ ×3), et plafonné à ×20
// en filet (cran et hydratation, state.js) tant qu'un cycle avec automates et une
// absence de 8 h n'ont pas validé la constante.
export const ACTIVE_RUIN_SISYPHE_CREEP    = 1.0008;
export const ACTIVE_RUIN_SISYPHE_MULT_CAP = 20;
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
    // Les sources suivent les noms anglais des Mythes (audit du 05/10, I18N-11) :
    // l'anglais recopiait le français (« Énée », « Phénix »…).
    source: { fr: "Énée", en: "Aeneas" },
    bonus: { fr: "Boost de départ actif (+10% par effondrement, jusqu'à +100%).", en: "Active starting boost (+10% per collapse, up to +100%)." },
    malus: { fr: `Rupture initiale +${Math.round(ACTIVE_RUIN_RUPTURE_START * 100)}.`, en: `Initial Rupture +${Math.round(ACTIVE_RUIN_RUPTURE_START * 100)}.` }
  },
  {
    id: "promethee",
    stateKey: "prometheeBraisiers",
    title: { fr: "Braisiers ancestraux", en: "Ancestral Braziers" },
    source: { fr: "Prométhée", en: "Prometheus" },
    bonus: { fr: "Bonus Nourriture x2 actif en début de cycle.", en: "Active Food bonus x2 at the start of the cycle." },
    malus: { fr: `Chaque moteur de Nourriture coûte ${Math.round((ACTIVE_RUIN_FOOD_ENGINE_COST_MULT - 1) * 100)}% plus cher.`, en: `Each Food engine costs ${Math.round((ACTIVE_RUIN_FOOD_ENGINE_COST_MULT - 1) * 100)}% more.` }
  },
  {
    id: "age_or",
    stateKey: "orHeritage",
    title: { fr: "Équilibre Doré", en: "Golden Balance" },
    source: { fr: "Âge d'Or", en: "Golden Age" },
    bonus: { fr: "Le Comptoir de marchandage est ouvert.", en: "The Trading Post is open." },
    malus: { fr: `La production de Trésor démarre ${Math.round((1 - ACTIVE_RUIN_GOLD_PROD_MULT) * 100)}% plus lente.`, en: `Treasury production starts ${Math.round((1 - ACTIVE_RUIN_GOLD_PROD_MULT) * 100)}% slower.` }
  },
  {
    id: "hephaistos",
    stateKey: "hephHeritage",
    title: { fr: "Automates ancestraux", en: "Ancestral Automatons" },
    source: { fr: "Héphaïstos", en: "Hephaestus" },
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
    source: { fr: "Sisyphe", en: "Sisyphus" },
    bonus: { fr: "L'inflation naturelle des coûts croît plus lentement, pour toujours.", en: "Natural cost inflation grows more slowly, forever." },
    malus: { fr: `Chaque bâtiment acheté réinflate tous les coûts de ${((ACTIVE_RUIN_SISYPHE_CREEP - 1) * 100).toFixed(2).replace(".", ",")} % (jusqu'à ×${ACTIVE_RUIN_SISYPHE_MULT_CAP}) : le rocher reprend sa pente.`, en: `Each building bought re-inflates all costs by ${((ACTIVE_RUIN_SISYPHE_CREEP - 1) * 100).toFixed(2)}% (up to ×${ACTIVE_RUIN_SISYPHE_MULT_CAP}): the boulder rolls back.` }
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
    source: { fr: "Icare", en: "Icarus" },
    bonus: { fr: "L'Aile disponible pendant les cycles normaux.", en: "The Wing available during normal cycles." },
    malus: { fr: `L'Aile monte toute seule dès que la Rupture atteint ${Math.round(ACTIVE_RUIN_ICARE_AUTO_BURN * 100)} % : tu gardes le vol, tu perds le moment.`, en: `The Wing climbs on its own once Rupture reaches ${Math.round(ACTIVE_RUIN_ICARE_AUTO_BURN * 100)}%: you keep the flight, you lose the timing.` }
  },
  {
    id: "phenix",
    stateKey: "phoenixHeritage",
    title: { fr: "Bûcher programmé", en: "Scheduled Pyre" },
    source: { fr: "Phénix", en: "Phoenix" },
    bonus: { fr: "Script d'effondrement automatique disponible.", en: "Automatic collapse script available." },
    malus: { fr: `Le bûcher s'allume de force au bout de ${Math.round(ACTIVE_RUIN_PHENIX_FORCED_SEC / 60)} minutes de cycle, quels que soient tes réglages.`, en: `The pyre lights itself after ${Math.round(ACTIVE_RUIN_PHENIX_FORCED_SEC / 60)} minutes of cycle, whatever your settings.` }
  },
  {
    id: "atrides",
    stateKey: "atridesHeritage",
    title: { fr: "Pacte signé d'office", en: "Pact Signed For You" },
    source: { fr: "Atrides", en: "Atreides" },
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
