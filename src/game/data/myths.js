"use strict";

import { state } from '../core/state.js';
import { log } from '../core/actions.js';
import { D } from '../core/num.js';
import { tr, localizeData } from '../core/i18n.js';
import { buildings } from './buildings.js';

// Compte des bâtiments de la catégorie choisie pour Babel — la « hauteur » de la
// tour. Utilisé par onCollapse (donc par checkMythLiveCompletion à chaque tick)
// et par la carte de statut de la Cité.
export function babelTowerCount() {
  if (!state.babelCategory) return 0;
  return buildings
    .filter((b) => b.category === state.babelCategory)
    .reduce((sum, b) => sum + (state.buildings[b.id] || 0), 0);
}

// Score de « puissance » agrégé (Antée, Ragnarok) : somme pondérée des
// ressources principales, en Decimal pour survivre au-delà du float.
function mythPowerScore() {
  return D(state.population).max(0)
    .add(D(state.food).max(0).mul(0.05))
    .add(D(state.gold).max(0).mul(0.1))
    .add(D(state.knowledge).max(0).mul(0.25))
    .add(D(state.infrastructure).max(0));
}
import {
  ANTEE_MIN_ACTIVE_RUINS,
  ANTEE_POP_MULT,
  activeRuinCount
} from './activeRuins.js';

// Mythe du Chaos : tous les bonus de méta étant neutralisés, on joue à la
// puissance de BASE → un seuil PLAT de Ruines gagnées ce cycle est une difficulté
// constante et juste (≠ l'ancienne « banque ≥ 50 » qui ne testait rien).
export const CHAOS_RAW_RUIN_TARGET = 12;         // Ruines BRUTES à gagner ce cycle (sans aucun bonus → un seul chiffre/dizaine est déjà un vrai cycle)
// Héritage « Né du néant » (refonte 2026-07-20) : +25 % sur TOUTES les récoltes
// de Ruines, pour toujours (facteur de ruinGain, prestige.js). Remplace la
// « banque » chaosRuinsBonus : les ruines d'un cycle SANS bonus (~12-40) ajoutées
// au total effectif étaient indétectables à vie — un héritage mort-né.
export const CHAOS_RUIN_HERITAGE_MULT = 1.25;
export const RAGNAROK_ID = "mythe_du_ragnarok";
// Finale « survie + sursaut » sous les 13 contraintes : tenir un plancher de
// temps ET faire surgir la puissance ×K depuis le départ (il faut bâtir vite
// dans la fenêtre ~2 min que laisse la Rupture ×30 irréductible d'Atlas/Icare).
export const RAGNAROK_MIN_SURVIVAL_MS  = 90_000;   // tenir ≥ 90 s
// La fenêtre forcée (~2 min, Rupture ×30 irréductible) + l'économie déjà au pic
// (ressources gardées) ne laissent croître la puissance que ~×2-4 ; ×3 exige donc
// d'optimiser sa croissance malgré les 13 contraintes, sans être injouable.
export const RAGNAROK_POWER_SURGE_MULT = 3;        // puissance ≥ 3× le départ du cycle (sursaut sous le chaos)
export const RAGNAROK_FINAL_TITLE = "Sous le regard du Ragnarok";

// ── Constantes Mythe d'Icare — « le vol par paliers » ────────────────────────
// Refonte 2026-07-19 (décision Raph) : les ×100/×30/×15 SUBIS disparaissent. Le
// joueur MONTE lui-même — chaque montée double la production, coûte de la Rupture
// immédiate, et fait grimper la Rupture plus vite. À l'altitude 0 le cycle est
// normal : la pression, c'est le joueur qui l'allume. L'héritage (l'Aile) rend le
// même verbe dans les cycles normaux, SANS plafond — libre au joueur de se
// saboter s'il n'a pas compris le principe. La Surchauffe est REMPLACÉE.
export const ICARE_ALTITUDE_TARGET     = 5;    // Réussite : atteindre l'altitude 5
export const ICARE_CLIMB_PROD_MULT     = 2;    // ×2 production par altitude (cumulatif)
export const ICARE_CLIMB_RUPTURE       = 0.15; // Rupture immédiate par montée
export const ICARE_CLIMB_RUPTURE_HASTE = 0.5;  // +50 % de vitesse de Rupture par altitude

// ── Constantes Mythe d'Atlas ─────────────────────────────────────────────────
// ── Constantes Mythe d'Atlas — « le poids du ciel » ──────────────────────────
// Refonte 2026-07-19 (décision Raph) : l'endurance passive (45 min, Usure ×4, les
// crises qui ne calment plus rien) DISPARAÎT. Une jauge, le Fardeau, monte sans
// arrêt ; un bouton, ÉPAULER, la fait redescendre mais a un temps de récupération.
// À 100 %, le ciel écrase la cité (échec). La jauge est 0-100 et le geste en retire
// une fraction fixe → même difficulté à toute échelle. L'héritage (l'Épaule) retourne
// la jauge de Légitimité passive en verbe : ÉPAULER la monte, une Légitimité haute
// adoucit les crises. L'effondrement manuel reste coupé pendant le défi.
// ⚠ Anti-spam (retour Raph 2026-07-19) : sans seuil, cliquer dès que le bouton se
// réactive était TOUJOURS la bonne action — un métronome, pas une décision. Une
// épaulée ne COMPTE que si le Fardeau est en zone rouge (≥ ATLAS_COUNT_THRESHOLD) ;
// en dessous elle soulage mais ne compte pas, et consomme quand même la récup.
// Le jeu devient : laisser monter volontairement dans le rouge, rattraper avant 100.
export const ATLAS_SHOULDER_TARGET     = 12;      // Réussite : épauler 12 fois à pleine charge
export const ATLAS_COUNT_THRESHOLD     = 70;      // Une épaulée ne compte qu'à partir de ce Fardeau
// ⚠ Calibrage clé : sur un cooldown (CD/1000 s), le Fardeau monte de RISE×CD.
// Il faut que ÉPAULER (−RELIEF) compense, sinon le joueur est condamné d'avance :
// 3/s × 15 s = 45 = RELIEF → dérive NULLE quand on épaule à temps. La difficulté
// est l'attention soutenue (une seconde d'inattention et le Fardeau grimpe).
export const ATLAS_FARDEAU_RISE        = 3;       // Montée du Fardeau par seconde (0→100 en ~33 s si laissé seul)
export const ATLAS_SHOULDER_RELIEF     = 45;      // Points de Fardeau retirés par ÉPAULER
export const ATLAS_SHOULDER_CD_MS      = 15_000;  // Récupération entre deux ÉPAULER (15 s)
// Héritage (l'Épaule) : « Atlas prend le coup » — un choix supplémentaire dans les
// gestions de crise, qui fait passer la crise SANS EFFET, une fois par cycle
// (state.atlasSkipUsed). La décision n'est pas d'appuyer, mais de choisir LAQUELLE :
// griller le coup sur la crise de 25 % ou le garder pour la grosse. Voir crisis.js.

// ── Constantes Mythe de Sisyphe ──────────────────────────────────────────────
// « La Montée » (refonte 2026-07-20) : le rocher se hisse par CRANS payés en
// ressources — chaque matière ré-employée dans la même montée DOUBLE son prix
// (1×, 2×, 4×…). Bâtir pendant la montée lâche le rocher (retour au pied, prix
// de base). Le premier sommet retombe TOUJOURS — c'est le mythe même : il faut
// hisser le rocher deux fois. Casse-tête froid à information complète : aucune
// horloge, aucun aléa — préparer ses stocks, choisir sa répartition, pousser
// d'une traite. Contrepoint voulu d'Atlas (le mythe du temps réel).
export const SISYPHE_CRANS          = 6;   // crans du pied au sommet
export const SISYPHE_MONTEES_TARGET = 2;   // le premier sommet trahit, le second scelle
// Coût de base d'un cran par matière (absolu, calibré acte II). Tout payer dans
// une seule matière coûte 63× sa base (2^6−1) ; répartir 2-2-2 coûte 3× la base
// de chacune. La répartition optimale dépend des stocks du joueur — c'est le puzzle.
export const SISYPHE_STEP_BASE = { food: 5000, knowledge: 1000, infrastructure: 120 };
export const SISYPHE_SCALE_REDUCTION   = 0.10;  // Héritage : -10% sur le facteur de scaling

// ── Constantes Mythe de l'Âge d'Or — « les Caravanes » ───────────────────────
// Refonte 2026-07-19 (décision Raph) : le plafond de population et sa pénalité
// par habitant DISPARAISSENT (des maths invisibles). Le Mythe devient un mini-jeu
// de NÉGOCIATION : des marchands vendent des lots de ressources contre de l'Or,
// on peut marchander (le prix baisse) mais leur patience est cachée — un marchand
// vexé s'en va. La paix dorée (Rupture plafonnée) et l'Usure ×3 en déséquilibre
// restent : les achats déplacent la balance Nourriture/Trésor, tout se répond.
export const OR_RUPTURE_CAP           = 0.05;  // Rupture plafonnée à 5 % (la paix dorée)
export const OR_BALANCE_RATIO         = 0.25;  // Écart Nourriture/Trésor du déséquilibre
export const OR_USURE_IMBALANCE_MULT  = 3;     // Usure ×3 pendant le déséquilibre
export const OR_DEALS_TARGET          = 8;     // Réussite : conclure 8 marchés
export const OR_DEAL_LOT_SECONDS      = 90;    // Taille du lot vendu : 90 s de production de la ressource
export const OR_DEAL_ASK_MARKUP       = 1.6;   // Prix demandé : 160 % de la valeur (en s de prod d'Or)
export const OR_DEAL_HAGGLE_STEP      = 0.85;  // Chaque marchandage : le prix baisse à 85 %
export const OR_DEAL_PATIENCE_MIN     = 2;     // Patience cachée du marchand : 2 à 4 marchandages
export const OR_DEAL_PATIENCE_MAX     = 4;

// ── Constantes Mythe de Babel ─────────────────────────────────────────────────
// Refonte 2026-07-20 (retour Raph : « reviens aux défis plus simples ») : la
// contrainte reste (verrou de catégorie + Rupture ×2 + concentration ×1.05^N),
// mais l'objectif « multiplicateur ×30 » — illisible — devient sa traduction
// directe : ÉRIGER LA TOUR, 70 bâtiments de la catégorie choisie, compteur
// visible et sacre en direct (onCollapse compte, checkMythLiveCompletion sacre).
export const BABEL_RUPTURE_MULT   = 2;       // Rupture ×2 pendant le cycle
export const BABEL_PROD_BASE_MULT = 1.05;    // Concentration : ×1.05 par bâtiment du type choisi
export const BABEL_TOWER_TARGET   = 70;      // La tour : 70 bâtiments de la catégorie (≈ l'ancien ×30)
// Héritage « la Langue commune » : 1×/cycle, DÉCLARER une catégorie — elle
// produit +20 % jusqu'à la fin du cycle. Remplace la Synergie d'Urbanisme
// (adjacence sur la carte : invisible, et le placement est procédural — le
// joueur ne contrôlait rien).
export const BABEL_COMMON_TONGUE_MULT = 1.20;
export const BABEL_CAT_LABELS     = {
  city:      { fr: "Cité", en: "City" },
  knowledge: { fr: "Savoir", en: "Knowledge" },
  infra:     { fr: "Infrastructure", en: "Infrastructure" }
};

// ── Constantes Mythe du Phénix (refonte : « Renaissances chronométrées ») ─────
// Renaître de ses cendres, vite, plusieurs fois D'AFFILÉE. Après chaque
// effondrement, reconstruire la cité à PHENIX_REBIRTH_POP_MULT × la population de
// redémarrage (le reliquat post-effondrement) en moins de PHENIX_REBIRTH_WINDOW_MS.
// Réussir PHENIX_RENAISSANCE_TARGET renaissances de suite. Rater une fenêtre brise
// la chaîne (retour à 0). Auto-échelonné (cible relative au reliquat) et borné.
export const PHENIX_RENAISSANCE_TARGET = 3;          // 3 renaissances réussies consécutives
export const PHENIX_REBIRTH_WINDOW_MS  = 3 * 60_000; // fenêtre de reconstruction (3 min)
export const PHENIX_REBIRTH_POP_MULT   = 60;         // reconstruire à 60× le reliquat post-effondrement

// ── Constantes Mythe d'Héphaïstos ────────────────────────────────────────────
// Refonte (le calibrage d'origine était devenu injouable : la production de pop
// de l'économie actuelle annulait le déclin). Le fantasme « les machines
// remplacent les hommes » est désormais mécanisé : pendant le déclin, la
// production de population est ÉTOUFFÉE (HEPH_POP_PROD_MULT) → la pop chute
// réellement (≈ HEPH_POP_DECAY_RATE/min), indépendamment de la courbe de prod.
// L'objectif d'infra n'est plus un seuil absolu trivial mais un RATIO
// « machines par habitant au pic » (HEPH_INFRA_PER_PEAK), qui garde du sens à
// toutes les échelles. Cf. analyse-mythe-hephaistos.md.
export const HEPH_POP_DECAY_START_MIN  = 3;      // Déclin pop démarre après 3 min de cycle
export const HEPH_POP_DECAY_RATE       = 0.008;  // 0.8% de la pop actuelle perdue par minute
export const HEPH_POP_PROD_MULT        = 0.0;    // Production de pop étouffée pendant le déclin (0 = les machines remplacent les hommes)
export const HEPH_INFRA_MULT_BASE      = 2.0;    // Bonus infra x2 au départ
export const HEPH_INFRA_MULT_GROWTH    = 0.15;   // +0.15 par minute de cycle
// Usure abaissée 2,5 → 1,6 : à 2,5 la cité tombait par l'Usure (~14 min) AVANT
// que le déclin de 20% (~28 min) ne soit atteint → Mythe injouable. À 1,6, un
// cycle bien mité (infra/légitimité) survit les ~25-30 min nécessaires.
export const HEPH_USURE_MULT           = 1.6;    // Usure x1.6 (était 2.5)
export const HEPH_POP_CRISIS_THRESHOLD = 50;     // Pop en-dessous de ce seuil → crises irrésolubles
export const HEPH_INFRA_PER_PEAK       = 1.0;    // Ratio cible infra / pic de population (placeholder, calibré par simulation)
export const HEPH_POP_DECLINE_PCT      = 0.20;   // Déclin requis depuis le pic (20% ≈ 25 min à 0,8%/min après le départ)

// ── Constantes Mythe de Prométhée ────────────────────────────────────────────
// Le ×3 Nourriture a été RETIRÉ (décision Raph 2026-07-19) : il rendait le défi
// trop facile en finançant lui-même la course. La contrainte est désormais nue —
// chaque moteur de Nourriture rapproche de la mort, sans compensation.
export const PROMETHEE_RUPTURE_PER_FOOD = 0.02;  // Rupture ajoutée par moteur de nourriture acheté (2%)
// Cible ABSOLUE (décision Raph 2026-07-19) : l'ancien « ×100 depuis la re-fondation »
// était illisible — le joueur ne savait pas par rapport à quoi, et la réponse exigeait
// un paragraphe. « Porter la population à 1000 » se comprend seul. Une cité farmée qui
// démarre au-dessus valide d'emblée : assumé, c'est la récompense de la progression.
export const PROMETHEE_POP_TARGET      = 1000;   // Réussite : 1000 habitants AVANT la Rupture fatale (course du feu)
export const PROMETHEE_FATAL_RUPTURE   = 0.80;   // Seuil de Rupture fatal (80%)
export const BRAISIERS_DURATION_MS     = 120_000; // Durée du bonus Braisiers en ms (2 minutes)
export const BRAISIERS_FOOD_MULT       = 2;      // Multiplicateur Nourriture pendant les Braisiers

// ── Constantes Mythe des Atrides ──────────────────────────────────────────────
export const ATRIDES_STARTING_DEBT          = 5000;
export const ATRIDES_STARTING_GOLD          = 2000;
export const ATRIDES_DEBT_PAYBACK_FACTOR    = 1.2;
export const ATRIDES_RENEGOTIATE_COOLDOWN_MS = 120_000;
export const ATRIDES_RENEGOTIATE_DURATION_MS = 30_000;
export const ATRIDES_RENEGOTIATE_MULT        = 0.3;
export const ATRIDES_GAIN_SECONDS           = 150;     // Réussite : Trésor NET gagné ce cycle ≥ 150 s de production d'Or (malgré la dette)
export const ATRIDES_NEXT_RUN_PENALTY_MULT  = 0.8;

// ── Constantes Mythe d'Énée ──────────────────────────────────────────────────
export const ENEE_TERRITORY_INTERVAL_MS       = 6 * 60_000;  // 6 minutes
export const ENEE_MIGRATIONS_TARGET           = 3;           // 3 migrations
export const ENEE_USURE_DEGRADED_MULT         = 2;           // Usure x2
export const ENEE_HERITAGE_DURATION_MS        = 30_000;      // 30 secondes
export const ENEE_HERITAGE_MAX_COLLAPSES      = 10;          // 10 effondrements max
export const ENEE_HERITAGE_BOOST_PER_COLLAPSE = 0.10;         // +10% de production par effondrement

// Cadmos - placeholders de calibration.
export const CADMOS_AGE_NAME_TARGET = 3;
export const CADMOS_CYCLE_BONUS_PCT = 0.08;
export const CADMOS_EPITAPH_BONUS_PCT = 0.02;
export const CADMOS_MAX_PERMANENT_EPITAPHS = 3;
// Paliers de Cadmos : seuils ABSOLUS, volontairement (décision Raph 2026-07-18).
// Une cité qui a farmé les franchit instantanément, et c'est le but : un vieux défi
// doit pouvoir être balayé en une seconde par un joueur qui en a les moyens. Ce
// n'est pas un oubli d'échelle, c'est la récompense de la progression.
// ⚠ Le vrai problème n'est pas là : c'est que franchir dix paliers d'un coup ouvre
// dix modales BLOQUANTES à la file. Cf. le regroupement dans mythTicks.js.
export const CADMOS_POPULATION_THRESHOLDS = [25, 60, 140, 320, 750];
export const CADMOS_INFRASTRUCTURE_THRESHOLDS = [25, 80, 220, 600, 1500];
export const CADMOS_ORIENTATIONS = {
  food: {
    label: { fr: "Nourriture", en: "Food" },
    article: { fr: "des", en: "of" },
    words: [
      { fr: "Granges", en: "Barns" },
      { fr: "Moissons", en: "Harvests" },
      { fr: "Sillons", en: "Furrows" },
      { fr: "Vergers", en: "Orchards" },
      { fr: "Entrepôts", en: "Warehouses" },
      { fr: "Semences", en: "Seeds" }
    ],
    bonus: {
      fr: `+${Math.round(CADMOS_CYCLE_BONUS_PCT * 100)}% a la production de Nourriture pour le reste du cycle.`,
      en: `+${Math.round(CADMOS_CYCLE_BONUS_PCT * 100)}% to Food production for the rest of the cycle.`
    }
  },
  gold: {
    label: { fr: "Tresor", en: "Treasury" },
    article: { fr: "des", en: "of" },
    words: [
      { fr: "Comptoirs", en: "Counting-Houses" },
      { fr: "Marchands", en: "Merchants" },
      { fr: "Caravanes", en: "Caravans" },
      { fr: "Monnaies", en: "Coinages" },
      { fr: "Quais", en: "Wharves" },
      { fr: "Balances", en: "Scales" }
    ],
    bonus: {
      fr: `+${Math.round(CADMOS_CYCLE_BONUS_PCT * 100)}% a la production de Tresor pour le reste du cycle.`,
      en: `+${Math.round(CADMOS_CYCLE_BONUS_PCT * 100)}% to Treasury production for the rest of the cycle.`
    }
  },
  stability: {
    label: { fr: "Stabilite", en: "Stability" },
    article: { fr: "des", en: "of" },
    words: [
      { fr: "Veilleurs", en: "Watchers" },
      { fr: "Sentinelles", en: "Sentinels" },
      { fr: "Lois", en: "Laws" },
      { fr: "Remparts", en: "Ramparts" },
      { fr: "Serments", en: "Oaths" },
      { fr: "Archives", en: "Archives" }
    ],
    bonus: {
      fr: `-${Math.round(CADMOS_CYCLE_BONUS_PCT * 100)}% a la vitesse de montee de la Rupture pour le reste du cycle.`,
      en: `-${Math.round(CADMOS_CYCLE_BONUS_PCT * 100)}% to the rate of Rupture rise for the rest of the cycle.`
    }
  }
};

export const RAGNAROK_CONSTRAINTS = [
  "mythe_de_promethee",
  "mythe_d_enee",
  "mythe_de_cadmos",
  "mythe_de_sisyphe",
  "mythe_de_babel",
  "mythe_age_or",
  "mythe_d_hephaistos",
  "mythe_d_atlas",
  "mythe_d_icare",
  "mythe_du_phenix",
  "mythe_atrides",
  "mythe_d_antee",
  "mythe_du_chaos"
];

export const MYTHS = [
  // ── Acte I · Fondation ────────────────────────────────────────────────────
  {
    id: "mythe_du_chaos",
    act: 1,
    name: { fr: "Le Mythe du Chaos", en: "The Myth of Chaos" },
    description: {
      fr: "Tous les bonus de méta-progression sont coupés pour ce cycle : Ruines, arbre des Ruines, Grand Reset — chaque multiplicateur retombe à ×1. Les upgrades restent achetés, ils sont simplement ignorés.",
      en: "All meta-progression bonuses are cut off for this cycle: Ruins, Ruins tree, Grand Reset — every multiplier falls back to ×1. Upgrades stay purchased, they are simply ignored."
    },
    ragnarokSummary: {
      fr: "tous les bonus de méta-progression sont neutralisés ; appliqué en dernier.",
      en: "all meta-progression bonuses are neutralized; applied last."
    },
    objectif: {
      fr: `Gagner ${CHAOS_RAW_RUIN_TARGET} Ruines brutes en un seul cycle, sans aucun bonus.`,
      en: `Earn ${CHAOS_RAW_RUIN_TARGET} raw Ruins in a single cycle, without any bonus.`
    },
    heritageDescription: {
      fr: `Né du néant : toutes les récoltes de Ruines sont augmentées de ${Math.round((CHAOS_RUIN_HERITAGE_MULT - 1) * 100)} %, pour toujours.`,
      en: `Born of the Void: all Ruin harvests are increased by ${Math.round((CHAOS_RUIN_HERITAGE_MULT - 1) * 100)}%, forever.`
    },

    onActivate() {
      // mechanics.js detecte state.activeMythId === "mythe_du_chaos" et neutralise
      // ruinEffects(), ruinMultiplier(), grandResetMultiplier().
      state.chaosReached = false;
    },

    onCollapse() {
      return Boolean(state.chaosReached);
    },

    applyHeritage() {
      state.chaosHeritage = true;
    }
  },

  {
    id: "mythe_de_promethee",
    act: 1,
    name: { fr: "Le Mythe de Prométhée", en: "The Myth of Prometheus" },
    description: {
      fr: `Chaque moteur de Nourriture acheté ajoute ${Math.round(PROMETHEE_RUPTURE_PER_FOOD * 100)} % de Rupture instantanément. Plus la cité grandit, plus elle brûle.`,
      en: `Each Food engine purchased adds ${Math.round(PROMETHEE_RUPTURE_PER_FOOD * 100)}% Rupture instantly. The larger the city grows, the more it burns.`
    },
    ragnarokSummary: {
      fr: "chaque moteur de nourriture ajoute de la Rupture.",
      en: "each food engine adds Rupture."
    },
    objectif: {
      fr: `Porter la population à ${PROMETHEE_POP_TARGET} habitants avant que la Rupture n'atteigne ${Math.round(PROMETHEE_FATAL_RUPTURE * 100)} % (la course du feu).`,
      en: `Bring the population to ${PROMETHEE_POP_TARGET} inhabitants before Rupture reaches ${Math.round(PROMETHEE_FATAL_RUPTURE * 100)}% (the race of fire).`
    },
    heritageDescription: {
      fr: `Braisiers ancestraux : chaque cycle démarre avec un bonus de production de Nourriture x${BRAISIERS_FOOD_MULT} pendant ${BRAISIERS_DURATION_MS / 60_000} minutes.`,
      en: `Ancestral embers: each cycle starts with a Food production bonus of x${BRAISIERS_FOOD_MULT} for ${BRAISIERS_DURATION_MS / 60_000} minutes.`
    },

    onActivate() {
      state.prometheeFailed    = false;
      state.prometheePopReached = false;
      state.mythStartPop        = D(state.population).max(1);
    },

    onCollapse() {
      return state.prometheePopReached && !state.prometheeFailed;
    },

    applyHeritage() {
      state.prometheeBraisiers = true;
    }
  },

  {
    id: "mythe_d_enee",
    act: 1,
    name: { fr: "Le Mythe d'Énée", en: "The Myth of Aeneas" },
    description: {
      fr: `Le territoire de la cité se dégrade au fil du temps. Toutes les ${ENEE_TERRITORY_INTERVAL_MS / 60_000} minutes, il devient invivable : la production de Nourriture tombe à 0, le Trésor n'accumule plus d'Or, et l'Usure monte ${ENEE_USURE_DEGRADED_MULT}x plus vite. Pour résoudre la crise, vous devez migrer vers un nouveau territoire en abandonnant vos bâtiments.`,
      en: `The city's territory degrades over time. Every ${ENEE_TERRITORY_INTERVAL_MS / 60_000} minutes it becomes unlivable: Food production drops to 0, the Treasury accrues no more Gold, and Wear rises ${ENEE_USURE_DEGRADED_MULT}x faster. To resolve the crisis, you must migrate to a new territory, abandoning your buildings.`
    },
    ragnarokSummary: {
      fr: `le territoire se dégrade toutes les ${ENEE_TERRITORY_INTERVAL_MS / 60_000} minutes et impose la migration.`,
      en: `the territory degrades every ${ENEE_TERRITORY_INTERVAL_MS / 60_000} minutes and forces migration.`
    },
    objectif: {
      fr: `Effectuer au moins ${ENEE_MIGRATIONS_TARGET} migrations avant l'effondrement.`,
      en: `Carry out at least ${ENEE_MIGRATIONS_TARGET} migrations before the collapse.`
    },
    heritageDescription: {
      fr: `Migration fondatrice : chaque nouveau cycle démarre avec un boost de production globale (+${Math.round(ENEE_HERITAGE_BOOST_PER_COLLAPSE * 100)}% par effondrement passé, jusqu'à +${Math.round(ENEE_HERITAGE_MAX_COLLAPSES * ENEE_HERITAGE_BOOST_PER_COLLAPSE * 100)}%) pendant les ${ENEE_HERITAGE_DURATION_MS / 1000} premières secondes.`,
      en: `Founding migration: each new cycle starts with a global production boost (+${Math.round(ENEE_HERITAGE_BOOST_PER_COLLAPSE * 100)}% per past collapse, up to +${Math.round(ENEE_HERITAGE_MAX_COLLAPSES * ENEE_HERITAGE_BOOST_PER_COLLAPSE * 100)}%) during the first ${ENEE_HERITAGE_DURATION_MS / 1000} seconds.`
    },

    onActivate() {
      state.eneeMigrations = 0;
      state.eneeDegraded = false;
      state.eneeTerritoryStartedAt = Date.now();
    },

    onCollapse() {
      return (state.eneeMigrations || 0) >= ENEE_MIGRATIONS_TARGET;
    },

    applyHeritage() {
      state.eneeHeritage = true;
      state.eneeCollapseCount = 0;
    }
  },

  // ── Acte I · Fondation ────────────────────────────────────────────────────
  {
    id: "mythe_de_cadmos",
    act: 1,
    name: { fr: "Le Mythe de Cadmos", en: "The Myth of Cadmus" },
    description: {
      fr: "A chaque palier de Population ou d'Infrastructure, la cite doit nommer son Age. Trois noms sont proposes, chacun lie a une orientation: Nourriture, Tresor ou Stabilite. Le nom choisi rejoint la Chronique et accorde un bonus de cycle.",
      en: "At each Population or Infrastructure milestone, the city must name its Age. Three names are offered, each tied to an orientation: Food, Treasury or Stability. The chosen name joins the Chronicle and grants a cycle bonus."
    },
    ragnarokSummary: {
      fr: "chaque palier Population/Infrastructure doit recevoir un Age nommé.",
      en: "each Population/Infrastructure milestone must be given a named Age."
    },
    objectif: {
      fr: `Avoir nomme au moins ${CADMOS_AGE_NAME_TARGET} Ages dans la Chronique avant l'effondrement.`,
      en: `Have named at least ${CADMOS_AGE_NAME_TARGET} Ages in the Chronicle before the collapse.`
    },
    heritageDescription: {
      fr: `Noms de Pouvoir : apres chaque run, graver un Age de la Chronique comme Epitaphe Permanente. Chaque Epitaphe donne +${Math.round(CADMOS_EPITAPH_BONUS_PCT * 100)}% permanent a son orientation, avec ${CADMOS_MAX_PERMANENT_EPITAPHS} Epitaphes actives maximum.`,
      en: `Names of Power: after each run, engrave one Age of the Chronicle as a Permanent Epitaph. Each Epitaph grants a permanent +${Math.round(CADMOS_EPITAPH_BONUS_PCT * 100)}% to its orientation, with ${CADMOS_MAX_PERMANENT_EPITAPHS} Epitaphs active at most.`
    },

    onActivate() {
      state.cadmosChronicle = [];
      state.cadmosCycleBonuses = { food: 0, gold: 0, stability: 0 };
      state.cadmosTriggeredMilestones = {};
      state.cadmosPromptPending = false;
      state.cadmosLastChosenOrientation = null;
      state.cadmosRecentWords = [];
    },

    onCollapse() {
      return (state.cadmosChronicle || []).length >= CADMOS_AGE_NAME_TARGET;
    },

    applyHeritage() {
      state.cadmosHeritage = true;
    }
  },

  // Héphaïstos est placé en Acte I (et non II) pour offrir l'automatisation
  // d'achat/crise tôt : les panneaux d'automatisation étaient sinon hors de
  // portée pendant l'essentiel de la partie (cf. déblocage en cascade des actes).
  {
    id: "mythe_d_hephaistos",
    act: 1,
    name: { fr: "Le Mythe d'Héphaïstos", en: "The Myth of Hephaestus" },
    description: {
      fr: `${HEPH_POP_DECAY_START_MIN} min après le début du cycle, la Population commence à décroître (-${Math.round(HEPH_POP_DECAY_RATE * 100)}%/min). En contrepartie, les bâtiments d'Infrastructure voient leur production multipliée par un facteur croissant (x${HEPH_INFRA_MULT_BASE} au départ, +${HEPH_INFRA_MULT_GROWTH}/min). L'Usure monte x${HEPH_USURE_MULT} plus vite. Sous ${HEPH_POP_CRISIS_THRESHOLD} habitants, les crises narratives deviennent irrésolues.`,
      en: `${HEPH_POP_DECAY_START_MIN} min after the start of the cycle, Population begins to decline (-${Math.round(HEPH_POP_DECAY_RATE * 100)}%/min). In exchange, Infrastructure buildings see their production multiplied by a growing factor (x${HEPH_INFRA_MULT_BASE} at the start, +${HEPH_INFRA_MULT_GROWTH}/min). Wear rises x${HEPH_USURE_MULT} faster. Below ${HEPH_POP_CRISIS_THRESHOLD} inhabitants, narrative crises become unsolvable.`
    },
    ragnarokSummary: {
      fr: `population en déclin, infrastructure amplifiée, Usure x${HEPH_USURE_MULT}.`,
      en: `population in decline, infrastructure amplified, Wear x${HEPH_USURE_MULT}.`
    },
    objectif: {
      fr: `Bâtir une Infrastructure d'au moins ${HEPH_INFRA_PER_PEAK}x le pic de Population, pendant que la Population décline d'au moins ${Math.round(HEPH_POP_DECLINE_PCT * 100)}% depuis ce pic (les machines remplacent les hommes).`,
      en: `Build Infrastructure of at least ${HEPH_INFRA_PER_PEAK}x the Population peak, while Population declines by at least ${Math.round(HEPH_POP_DECLINE_PCT * 100)}% from that peak (the machines replace men).`
    },
    heritageDescription: {
      fr: `Automates ancestraux : débloque un panneau "Automates" dans les Options pour activer des automatisations permanentes dans toutes les runs futures (achat automatique de bâtiments, déclenchement de crises).`,
      en: `Ancestral automatons: unlocks an "Automatons" panel in the Options to enable permanent automations in all future runs (automatic building purchase, crisis triggering).`
    },

    onActivate() {
      state.hephPopPeak     = state.population;
      state.hephGoalReached = false;
    },

    onCollapse() {
      return Boolean(state.hephGoalReached);
    },

    applyHeritage() {
      state.hephHeritage = true;
    }
  },

  // ── Acte II · Domination ──────────────────────────────────────────────────
  {
    id: "mythe_de_sisyphe",
    act: 2,
    name: { fr: "Le Mythe de Sisyphe", en: "The Myth of Sisyphus" },
    description: {
      fr: `Le rocher attend au pied : ${SISYPHE_CRANS} crans jusqu'au sommet. POUSSER paie le cran dans une matière au choix — chaque matière ré-employée double son prix. Bâtir pendant la montée lâche le rocher. Au premier sommet, le rocher retombe. Toujours.`,
      en: `The boulder waits at the foot: ${SISYPHE_CRANS} notches to the summit. PUSH pays the notch in a material of your choice — each reused material doubles its price. Building during the climb lets go of the boulder. At the first summit, the boulder rolls back down. Always.`
    },
    ragnarokSummary: {
      fr: "bâtir lâche le rocher en pleine montée.",
      en: "building lets go of the boulder mid-climb."
    },
    objectif: {
      fr: `Hisser le rocher au sommet ${SISYPHE_MONTEES_TARGET} fois (${SISYPHE_CRANS} crans), sans bâtir pendant la montée.`,
      en: `Haul the boulder to the summit ${SISYPHE_MONTEES_TARGET} times (${SISYPHE_CRANS} notches), without building during the climb.`
    },
    heritageDescription: {
      fr: `Réduit de façon permanente le facteur de scaling des coûts de tous les bâtiments de ${Math.round(SISYPHE_SCALE_REDUCTION * 100)}% (l'inflation naturelle croît plus lentement pour toujours).`,
      en: `Permanently reduces the cost scaling factor of all buildings by ${Math.round(SISYPHE_SCALE_REDUCTION * 100)}% (natural inflation grows more slowly forever).`
    },

    onActivate() {
      state.sisypheCran = 0;
      state.sisypheMontees = 0;
      state.sisypheUsages = { food: 0, knowledge: 0, infrastructure: 0 };
    },

    onCollapse() {
      return (state.sisypheMontees || 0) >= SISYPHE_MONTEES_TARGET;
    },

    applyHeritage() {
      state.sisypheHeritage = true;
    }
  },

  {
    id: "mythe_de_babel",
    act: 2,
    name: { fr: "Le Mythe de Babel", en: "The Myth of Babel" },
    description: {
      fr: `Seule la catégorie choisie au lancement peut être construite ce cycle, et chaque bâtiment du type concentre la puissance (×${BABEL_PROD_BASE_MULT} cumulé). La Rupture monte ×${BABEL_RUPTURE_MULT} plus vite.`,
      en: `Only the category chosen at launch can be built this cycle, and each building of the type concentrates power (×${BABEL_PROD_BASE_MULT} compounding). Rupture rises ×${BABEL_RUPTURE_MULT} faster.`
    },
    ragnarokSummary: {
      fr: `seuls les bâtiments du type choisi peuvent être achetés ; Rupture x${BABEL_RUPTURE_MULT}.`,
      en: `only buildings of the chosen type can be purchased; Rupture x${BABEL_RUPTURE_MULT}.`
    },
    objectif: {
      fr: `Ériger la tour : ${BABEL_TOWER_TARGET} bâtiments de la catégorie choisie.`,
      en: `Raise the tower: ${BABEL_TOWER_TARGET} buildings of the chosen category.`
    },
    heritageDescription: {
      fr: `La Langue commune : une fois par cycle, déclare une langue — la catégorie choisie produit +${Math.round((BABEL_COMMON_TONGUE_MULT - 1) * 100)} % jusqu'à la fin du cycle. Réglable en automatique.`,
      en: `The Common Tongue: once per cycle, declare a language — the chosen category produces +${Math.round((BABEL_COMMON_TONGUE_MULT - 1) * 100)}% until the end of the cycle. Can be set to automatic.`
    },

    buildChoiceHTML() {
      const cats = [
        { value: "city",      label: tr({ fr: "Cite", en: "City" }),                   desc: tr({ fr: "Nourriture, Commerce, Population", en: "Food, Commerce, Population" }) },
        { value: "knowledge", label: tr({ fr: "Savoir", en: "Knowledge" }),           desc: tr({ fr: "Connaissance, Academies, Archives", en: "Learning, Academies, Archives" }) },
        { value: "infra",     label: tr({ fr: "Infrastructure", en: "Infrastructure" }), desc: tr({ fr: "Aqueducs, Routes, Batisseurs", en: "Aqueducts, Roads, Builders" }) }
      ];
      return `
        <div class="myth-modal-row">
          <span class="myth-modal-label">${tr({ fr: "Type de bâtiment", en: "Building type" })}</span>
          <div class="babel-category-choice">
            ${cats.map((c, i) => `
              <label class="babel-cat-option">
                <input type="radio" name="babelCategory" value="${c.value}"${i === 0 ? " checked" : ""}>
                <span class="babel-cat-name">${c.label}</span>
                <span class="babel-cat-desc">${c.desc}</span>
              </label>
            `).join("")}
          </div>
        </div>
      `;
    },

    readChoice(dialog) {
      const checked = dialog.querySelector('[name="babelCategory"]:checked');
      state.babelCategory = checked ? checked.value : "city";
    },

    onActivate() {},

    onCollapse() {
      return babelTowerCount() >= BABEL_TOWER_TARGET;
    },

    applyHeritage() {
      state.babelHeritage = true;
    }
  },

  {
    id: "mythe_age_or",
    act: 2,
    name: { fr: "Le Mythe de l'Âge d'Or", en: "The Myth of the Golden Age" },
    description: {
      fr: `La paix dorée : Rupture plafonnée à ${Math.round(OR_RUPTURE_CAP * 100)} %, crises suspendues. Des caravanes proposent des lots contre de l'Or — on peut marchander, mais un marchand vexé s'en va. Si l'écart Nourriture/Trésor dépasse ${Math.round(OR_BALANCE_RATIO * 100)} %, l'Usure monte ×${OR_USURE_IMBALANCE_MULT}.`,
      en: `The golden peace: Rupture capped at ${Math.round(OR_RUPTURE_CAP * 100)}%, crises suspended. Caravans offer lots for Gold — you can haggle, but an offended merchant walks away. If the Food/Treasury gap exceeds ${Math.round(OR_BALANCE_RATIO * 100)}%, Wear rises ×${OR_USURE_IMBALANCE_MULT}.`
    },
    ragnarokSummary: {
      fr: "les caravanes exigent leur dû ; le déséquilibre brûle l'Usure.",
      en: "the caravans demand their due; imbalance burns Wear."
    },
    objectif: {
      fr: `Conclure ${OR_DEALS_TARGET} marchés avec les caravanes.`,
      en: `Close ${OR_DEALS_TARGET} deals with the caravans.`
    },
    heritageDescription: {
      fr: "Le Comptoir : débloque l'onglet Marchandage — échanger de l'Or contre des ressources (et vendre son surplus), en permanence, au tarif du marchand.",
      en: "The Trading Post: unlocks the Trading tab — exchange Gold for resources (and sell your surplus), permanently, at the merchant's rate."
    },

    onActivate() {
      state.orDealsClosed = 0;
      state.orUsureImbalance = false;
    },

    onCollapse() {
      return (state.orDealsClosed || 0) >= OR_DEALS_TARGET;
    },

    applyHeritage() {
      state.orHeritage = true;
    }
  },

  // ── Acte III · Apocalypse ─────────────────────────────────────────────────
  {
    id: "mythe_d_atlas",
    act: 3,
    name: { fr: "Le Mythe d'Atlas", en: "The Myth of Atlas" },
    description: {
      fr: `Le ciel pèse. Le Fardeau monte sans arrêt : ÉPAULER le fait redescendre, mais seul un ciel LOURD compte — sous ${ATLAS_COUNT_THRESHOLD} %, le geste soulage sans compter et gaspille la récupération. À 100 %, le ciel écrase la cité. L'effondrement manuel est coupé — on ne repose pas le monde.`,
      en: `The sky bears down. The Burden rises relentlessly: SHOULDER pushes it back, but only a HEAVY sky counts — below ${ATLAS_COUNT_THRESHOLD}%, the act relieves without counting and wastes the recovery. At 100%, the sky crushes the city. Manual collapse is disabled — one does not put the world down.`
    },
    ragnarokSummary: {
      fr: "le Fardeau du ciel écrase qui cesse de l'épauler.",
      en: "the sky's Burden crushes whoever stops shouldering it."
    },
    objectif: {
      fr: `Épauler ${ATLAS_SHOULDER_TARGET} fois le ciel à pleine charge (Fardeau ≥ ${ATLAS_COUNT_THRESHOLD} %), sans être écrasé.`,
      en: `Shoulder the sky at full weight ${ATLAS_SHOULDER_TARGET} times (Burden ≥ ${ATLAS_COUNT_THRESHOLD}%), without being crushed.`
    },
    heritageDescription: {
      fr: "L'Épaule : une fois par cycle, « Atlas prend le coup » — une gestion de crise au choix passe sans aucun effet.",
      en: "The Shoulder: once per cycle, \"Atlas takes the hit\" — one crisis management of your choice passes with no effect at all."
    },

    onActivate() {
      state.atlasFardeau = 0;
      state.atlasEpaules = 0;
      state.atlasCrushed = false;
      state.atlasShoulderCdEnd = 0;
    },

    onCollapse() {
      return (state.atlasEpaules || 0) >= ATLAS_SHOULDER_TARGET && !state.atlasCrushed;
    },

    applyHeritage() {
      state.atlasHeritage = true;
    }
  },

  {
    id: "mythe_d_icare",
    act: 3,
    name: { fr: "Le Mythe d'Icare", en: "The Myth of Icarus" },
    description: {
      fr: `Le bouton MONTER apparaît. Chaque montée : production ×${ICARE_CLIMB_PROD_MULT}, +${Math.round(ICARE_CLIMB_RUPTURE * 100)} % de Rupture immédiate, et la Rupture grimpe ${Math.round(ICARE_CLIMB_RUPTURE_HASTE * 100)} % plus vite par altitude.`,
      en: `The CLIMB button appears. Each climb: production ×${ICARE_CLIMB_PROD_MULT}, +${Math.round(ICARE_CLIMB_RUPTURE * 100)}% instant Rupture, and Rupture rises ${Math.round(ICARE_CLIMB_RUPTURE_HASTE * 100)}% faster per altitude.`
    },
    ragnarokSummary: {
      fr: "chaque montée d'altitude embrase la Rupture.",
      en: "each altitude climb inflames Rupture."
    },
    objectif: {
      fr: `Atteindre l'altitude ${ICARE_ALTITUDE_TARGET}.`,
      en: `Reach altitude ${ICARE_ALTITUDE_TARGET}.`
    },
    heritageDescription: {
      fr: "L'Aile : MONTER et redescendre restent disponibles dans les cycles normaux, sans plafond. La production grimpe, la Rupture s'emballe — à toi de choisir ton altitude.",
      en: "The Wing: CLIMB and descend remain available in normal cycles, uncapped. Production soars, Rupture races — you choose your altitude."
    },

    onActivate() {
      state.icareAltitude = 0;
    },

    onCollapse() {
      return (state.icareAltitude || 0) >= ICARE_ALTITUDE_TARGET;
    },

    applyHeritage() {
      state.icareHeritage = true;
    }
  },

  {
    id: "mythe_du_phenix",
    act: 3,
    name: { fr: "Le Mythe du Phénix", en: "The Myth of the Phoenix" },
    description: {
      fr: `Renaître de ses cendres, vite, plusieurs fois. Après chaque effondrement, reconstruisez la cité jusqu'à ${PHENIX_REBIRTH_POP_MULT}× sa population de redémarrage en moins de ${PHENIX_REBIRTH_WINDOW_MS / 60_000} minutes. Réussissez ${PHENIX_RENAISSANCE_TARGET} renaissances d'affilée. Rater une fenêtre brise la chaîne et vous repartez de zéro.`,
      en: `Rise from your ashes, fast, several times over. After each collapse, rebuild the city to ${PHENIX_REBIRTH_POP_MULT}× its restart population in under ${PHENIX_REBIRTH_WINDOW_MS / 60_000} minutes. Achieve ${PHENIX_RENAISSANCE_TARGET} rebirths in a row. Missing a window breaks the chain and you start over from zero.`
    },
    ragnarokSummary: {
      fr: `reconstruction express à ${PHENIX_REBIRTH_POP_MULT}× la population en ${PHENIX_REBIRTH_WINDOW_MS / 60_000} min, ${PHENIX_RENAISSANCE_TARGET} fois de suite.`,
      en: `express rebuild to ${PHENIX_REBIRTH_POP_MULT}× the population in ${PHENIX_REBIRTH_WINDOW_MS / 60_000} min, ${PHENIX_RENAISSANCE_TARGET} times in a row.`
    },
    objectif: {
      fr: `Réussir ${PHENIX_RENAISSANCE_TARGET} renaissances consécutives : à chaque cycle, atteindre ${PHENIX_REBIRTH_POP_MULT}× la population de départ en moins de ${PHENIX_REBIRTH_WINDOW_MS / 60_000} min, puis s'effondrer pour renaître.`,
      en: `Achieve ${PHENIX_RENAISSANCE_TARGET} consecutive rebirths: each cycle, reach ${PHENIX_REBIRTH_POP_MULT}× the starting population in under ${PHENIX_REBIRTH_WINDOW_MS / 60_000} min, then collapse to be reborn.`
    },
    heritageDescription: {
      fr: `Script d'Automatisation : débloque un panneau dans les Options pour définir des conditions d'effondrement automatique dans toutes les runs futures (seuil de Rupture, seuil d'Usure, durée du cycle).`,
      en: `Automation Script: unlocks a panel in the Options to set automatic collapse conditions in all future runs (Rupture threshold, Wear threshold, cycle duration).`
    },

    onActivate() {
      state.phoenixCycleCount  = 0;
      state.phoenixTotalRuins  = D(0);
      state.phoenixRenaissances = 0;
      // Cible de la 1re renaissance : 60× la population de démarrage actuelle.
      state.phoenixRebirthTargetPop = D(state.population).mul(PHENIX_REBIRTH_POP_MULT);
      state.phoenixNextForceAt = null;
    },

    onCollapse() {
      return (state.phoenixRenaissances || 0) >= PHENIX_RENAISSANCE_TARGET;
    },

    applyHeritage() {
      state.phoenixHeritage = true;
    }
  },

  {
    id: "mythe_atrides",
    act: 3,
    name: { fr: "Le Mythe des Atrides", en: "The Myth of the Atreides" },
    description: {
      fr: "Une dette maudite pèse sur la cité. La dette croît chaque seconde (+1% de la production par minute) et draine 10% de chaque ressource produite. Heureusement, vous commencez avec un trésor initial et un bonus global x3 de production pendant les 2 premières minutes.",
      en: "A cursed debt weighs on the city. The debt grows every second (+1% of production per minute) and drains 10% of every resource produced. Mercifully, you start with an initial treasury and a global x3 production bonus for the first 2 minutes."
    },
    ragnarokSummary: {
      fr: "dette initiale, croissance de dette et drain de ressources.",
      en: "initial debt, debt growth and resource drain."
    },
    objectif: {
      fr: `Dégager, malgré la dette, un Trésor net (Trésor moins Dette) gagné ce cycle égal à ${ATRIDES_GAIN_SECONDS} s de ta production d'Or avant de vous effondrer.`,
      en: `Clear, despite the debt, a net Treasury (Treasury minus Debt) gained this cycle worth ${ATRIDES_GAIN_SECONDS}s of your Gold output before you collapse.`
    },
    heritageDescription: {
      fr: "Débloque le bouton 'Pacte des Atrides' en début de cycle normal (runs normales) pour doubler la production pendant 2 minutes en échange de -50% pendant la crise.",
      en: "Unlocks the 'Pact of the Atreides' button at the start of normal cycles (normal runs) to double production for 2 minutes in exchange for -50% during the crisis."
    },

    onActivate() {
      state.atridesDebt = ATRIDES_STARTING_DEBT;
      state.gold = D(state.gold).max(ATRIDES_STARTING_GOLD);
      state.atridesDrainDisabled = false;
      state.atridesDebtGrowthMultiplier = 1;
      state.atridesRenegotiateActiveUntil = 0;
      state.atridesRenegotiateCooldownEnd = 0;
      state.atridesReached = false;
      state.mythStartGold = D(state.gold);
    },

    onCollapse() {
      return Boolean(state.atridesReached);
    },

    applyHeritage() {
      state.atridesHeritage = true;
    }
  },

  {
    id: "mythe_d_antee",
    act: 3,
    name: { fr: "Le Mythe d'Antee", en: "The Myth of Antaeus" },
    description: {
      fr: "Au demarrage, choisissez parmi vos Heritages debloques ceux qui deviennent des Ruines actives. Chaque Ruine active conserve son bonus habituel mais ajoute son malus associe pour ce cycle.",
      en: "At the start, choose from your unlocked Legacies those that become active Ruins. Each active Ruin keeps its usual bonus but adds its associated penalty for this cycle."
    },
    ragnarokSummary: {
      fr: "les Ruines actives doivent être choisies et comptent comme malus de cycle.",
      en: "active Ruins must be chosen and count as cycle penalties."
    },
    objectif: {
      fr: `Porter au moins ${ANTEE_MIN_ACTIVE_RUINS} maluses simultanés (Héritages activés comme Ruines actives) et, sous ce poids, faire croître la population ×${ANTEE_POP_MULT} depuis le départ.`,
      en: `Carry at least ${ANTEE_MIN_ACTIVE_RUINS} simultaneous penalties (Legacies activated as active Ruins) and, under that weight, grow the population ×${ANTEE_POP_MULT} from the start.`
    },
    heritageDescription: {
      fr: "Ruines actives : dans les runs futures, chaque debut de cycle propose de choisir volontairement des Heritages avec leur malus. Les Ruines gagnees a l'effondrement recoivent un multiplicateur proportionnel au nombre de malus actifs (placeholder).",
      en: "Active Ruins: in future runs, the start of each cycle offers to voluntarily choose Legacies along with their penalty. The Ruins earned at collapse receive a multiplier proportional to the number of active penalties (placeholder)."
    },
    requiresActiveRuinsChoice: true,

    onActivate() {
      state.activeRuinIds = [];
      state.pendingActiveRuinsChoice = true;
      state.mythStartPop = D(state.population).max(1);
    },

    onCollapse() {
      // Porter ≥4 maluses ET prospérer malgré eux : pic de pop ≥ 50× le départ.
      const peakPop = D(state.cyclePeaks?.population || state.population);
      return activeRuinCount(state) >= ANTEE_MIN_ACTIVE_RUINS &&
             peakPop.gte(D(state.mythStartPop || 1).mul(ANTEE_POP_MULT));
    },

    applyHeritage() {
      state.anteeHeritage = true;
    }
  },

  {
    id: RAGNAROK_ID,
    act: "ragnarok",
    name: { fr: "Ragnarok", en: "Ragnarok" },
    description: {
      fr: "Le Mythe terminal. Toutes les contraintes des treize Mythes precedents s'appliquent simultanement en un seul cycle; Chaos ferme la marche et neutralise les bonus de meta-progression.",
      en: "The terminal Myth. All the constraints of the thirteen preceding Myths apply simultaneously in a single cycle; Chaos brings up the rear and neutralizes the meta-progression bonuses."
    },
    objectif: {
      fr: `Sous les 13 contraintes réunies : tenir au moins ${RAGNAROK_MIN_SURVIVAL_MS / 1000} s et faire surgir la puissance ×${RAGNAROK_POWER_SURGE_MULT} depuis le début du cycle.`,
      en: `Under all 13 constraints combined: hold out for at least ${RAGNAROK_MIN_SURVIVAL_MS / 1000} s and surge power ×${RAGNAROK_POWER_SURGE_MULT} from the start of the cycle.`
    },
    heritageDescription: {
      fr: "La Fin des Dieux : debloque le 11e Grand Reset, qui donne un multiplicateur x4 aux Ruines, et grave un titre final permanent dans la Chronique.",
      en: "The Twilight of the Gods: unlocks the 11th Grand Reset, which grants a x4 multiplier to Ruins, and engraves a permanent final title in the Chronicle."
    },
    requiresActiveRuinsChoice: true,

    async onActivate() {
      state.ragnarokEffectsApplied = false;
      state.ragnarokActiveConstraints = RAGNAROK_CONSTRAINTS
        .map(id => {
          const m = getMythById(id);
          if (!m) return "";
          // Article-aware : « Le Mythe du Chaos / des Atrides / d'Énée » — le
          // strip « de »/« d' » seul laissait « du/des » en FR (bug live sur
          // Chaos/Phénix/Atrides). Regex couvrant de/du/des/d' (FR) + of/of the (EN).
          const shortName = tr(m.name)
            .replace(/^Le Mythe d(e |u |es |')/, "")
            .replace(/^The Myth of (the )?/, "");
          return `${shortName}: ${tr(m.ragnarokSummary)}`;
        })
        .filter(Boolean);
      state.babelCategory = state.babelCategory || "city";
      const ordered = RAGNAROK_CONSTRAINTS
        .map((id) => getMythById(id))
        .filter(Boolean)
        .filter((myth) => myth.id !== "mythe_du_chaos");
      for (const myth of ordered) {
        if (typeof myth.onActivate === "function") await myth.onActivate();
      }
      const chaos = getMythById("mythe_du_chaos");
      if (chaos && typeof chaos.onActivate === "function") await chaos.onActivate();
      state.activeMythId = RAGNAROK_ID;
      state.ragnarokEffectsApplied = true;
      // Le cycle (et le chrono de survie) démarre maintenant ; on fige la
      // puissance de départ pour mesurer le sursaut ×K.
      state.cycleStartedAt = Date.now();
      state.ragnarokStartPower = mythPowerScore().max(1);
    },

    onCollapse() {
      // Survie + sursaut : tenir le plancher de temps ET avoir multiplié la
      // puissance ×RAGNAROK_POWER_SURGE_MULT depuis le départ du cycle.
      const age = Date.now() - (state.cycleStartedAt || Date.now());
      const surged = mythPowerScore().gte(D(state.ragnarokStartPower || 1).mul(RAGNAROK_POWER_SURGE_MULT));
      return age >= RAGNAROK_MIN_SURVIVAL_MS && surged;
    },

    applyHeritage() {
      state.ragnarokHeritage = true;
      state.finalChronicleTitle = RAGNAROK_FINAL_TITLE;
      if (!state.history.some((entry) => entry.includes(RAGNAROK_FINAL_TITLE))) {
        state.history = [`${RAGNAROK_FINAL_TITLE}: tous les Mythes sont accomplis.`, ...state.history].slice(0, 48);
      }
    }
  }
];

// ── Helpers d'état ───────────────────────────────────────────────────────────

export function getMythById(id) {
  return MYTHS.find((m) => m.id === id) || null;
}

export function isMythCompleted(id) {
  return Boolean(state.mythsCompleted && state.mythsCompleted[id]);
}

export function isMythActive(id) {
  return state.activeMythId === id;
}

export function isMythEffectActive(id) {
  if (state.activeMythId === id) return true;
  return state.activeMythId === RAGNAROK_ID &&
    state.ragnarokEffectsApplied &&
    RAGNAROK_CONSTRAINTS.includes(id);
}

export function isMythUnlocked(myth) {
  if ((state.grandResetCount || 0) < 1) return false;
  if (myth.act === 1) return true;
  if (myth.act === 2) {
    const act1 = MYTHS.filter((m) => m.act === 1);
    return act1.length > 0 && act1.every((m) => isMythCompleted(m.id));
  }
  if (myth.act === 3) {
    const act2 = MYTHS.filter((m) => m.act === 2);
    return act2.length > 0 && act2.every((m) => isMythCompleted(m.id));
  }
  if (myth.act === "ragnarok") {
    const mainMythes = MYTHS.filter((m) => m.act === 1 || m.act === 2 || m.act === 3);
    return mainMythes.length > 0 && mainMythes.every((m) => isMythCompleted(m.id));
  }
  return false;
}

// ── Déblocage des actes ──────────────────────────────────────────────────────

export function checkActUnlocks() {
  if (!MYTHS.length) return;
  if ((state.grandResetCount || 0) < 1) return;

  const byAct = (n) => MYTHS.filter((m) => m.act === n);
  const allDone = (arr) => arr.length > 0 && arr.every((m) => isMythCompleted(m.id));

  if (!state.mythActsAnnounced) state.mythActsAnnounced = {};

  if (allDone(byAct(1)) && byAct(2).length > 0 && !state.mythActsAnnounced.act2) {
    state.mythActsAnnounced.act2 = true;
    log(tr({ fr: "Acte II : les pactes anciens s'éveillent. De nouveaux défis se révèlent aux yeux du sage.", en: "Act II: the ancient pacts awaken. New trials reveal themselves to the eyes of the wise." }));
  }
  if (allDone(byAct(2)) && byAct(3).length > 0 && !state.mythActsAnnounced.act3) {
    state.mythActsAnnounced.act3 = true;
    log(tr({ fr: "Acte III : l'épreuve finale approche. Les défis légendaires réclament un dernier sacrifice.", en: "Act III: the final ordeal approaches. The legendary trials demand one last sacrifice." }));
  }
  const mainMythes = MYTHS.filter((m) => m.act === 1 || m.act === 2 || m.act === 3);
  const hasRagnarok = MYTHS.some((m) => m.act === "ragnarok");
  if (hasRagnarok && allDone(mainMythes) && !state.mythActsAnnounced.ragnarok) {
    state.mythActsAnnounced.ragnarok = true;
    log(tr({ fr: "Ragnarok : le pacte ultime se brise. La fin de toutes choses vous attend.", en: "Ragnarok: the ultimate pact shatters. The end of all things awaits you." }));
  }
}

// Filet de sécurité : aplatit les champs de données { fr, en } des mythes (name,
// description, objectif, heritageDescription, ragnarokSummary) en chaînes de la
// langue courante. Rend inoffensif tout consommateur d'affichage non enveloppé
// de tr(). CADMOS_ORIENTATIONS reste géré via tr() (ses `words` servent aussi de
// clés internes). Les fonctions des mythes sont préservées (cf. localizeData).
localizeData(MYTHS);
