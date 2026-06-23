"use strict";

import { state } from '../core/state.js';
import { log } from '../core/actions.js';
import { D } from '../core/num.js';

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

// ── Constantes Mythe d'Icare ─────────────────────────────────────────────────
export const ICARE_PROD_MULT     = 100;      // Multiplicateur global de production
export const ICARE_RUPTURE_MULT  = 30;       // Multiplicateur de vitesse de Rupture
export const ICARE_USURE_MULT    = 15;       // Multiplicateur de vitesse d'Usure
export const ICARE_INFRA_TARGET  = 5000;     // (obsolète — remplacé par le gain relatif ci-dessous)
export const ICARE_GAIN_SECONDS  = 40;       // Réussite : accumuler ce cycle ≥ 40 s de production d'Infra avant l'effondrement rapide (Rupture ×30 !)
export const SURCHAUFFE_PROD_MULT    = 5;       // Multiplicateur de production pendant Surchauffe
export const SURCHAUFFE_DURATION_MS  = 30_000;  // Durée de l'effet Surchauffe (30 secondes)
export const SURCHAUFFE_RUPTURE      = 0.25;    // Rupture instantanée à l'activation (+25%)
export const SURCHAUFFE_COOLDOWN_MS  = 120_000; // Cooldown Surchauffe (2 minutes)

// ── Constantes Mythe d'Atlas ─────────────────────────────────────────────────
export const ATLAS_USURE_MULT          = 4;           // Usure ×4 pendant le cycle
export const ATLAS_MIN_DURATION_MS     = 45 * 60_000; // Durée minimale de survie (45 minutes)
export const ATLAS_MIN_CRISIS_WAVES    = 10;          // Vagues de crises min (condition alternative)
export const ATLAS_USURE_REDUCTION     = 0.15;        // Héritage : -15% sur le taux d'Usure de base
export const ATLAS_LEGIT_PASSIVE_RATE  = 0.05;        // Légitimité gagnée par seconde (passive)
export const ATLAS_LEGIT_MAX_REDUCTION = 0.25;        // Réduction max des effets négatifs de crises (25%)

// ── Constantes Mythe de Sisyphe ──────────────────────────────────────────────
export const SISYPHE_MULT_PER_PURCHASE = 1.03;  // ×1.03 par achat de bâtiment
export const SISYPHE_BUILDING_TARGET   = 180;   // Réussite : pousser le rocher jusqu'à 180 bâtiments malgré l'inflation (×1.03^180 ≈ 230× le coût de base)
export const SISYPHE_SCALE_REDUCTION   = 0.10;  // Héritage : -10% sur le facteur de scaling

// ── Constantes Mythe de l'Âge d'Or ──────────────────────────────────────────
export const OR_RUPTURE_CAP           = 0.05;    // Rupture plafonnée à 5%
export const OR_POP_THRESHOLD         = 200;     // Seuil de rendements décroissants
export const OR_POP_PENALTY_PCT       = 0.005;   // -0.5% de production par habitant au-delà du seuil
export const OR_BALANCE_RATIO         = 0.25;    // Écart Nourriture/Trésor au-delà duquel il y a déséquilibre
export const OR_USURE_IMBALANCE_MULT  = 3;       // Usure ×3 pendant le déséquilibre
export const OR_GOLD_TARGET           = 75_000;  // (obsolète — remplacé par le gain relatif ci-dessous)
export const OR_GAIN_SECONDS          = 120;     // Réussite : accumuler ce cycle ≥ 120 s de production d'Or, pop plafonnée
export const OR_POP_CAP               = 300;     // Plancher absolu du plafond de pop (early game)
// Plafond de population RELATIF au départ du cycle : la pop ne doit pas croître
// de plus de (facteur-1) depuis le début. Corrige l'injouabilité post-GR (la pop
// gardée dépasse déjà 300) tout en gardant l'intention « cité dorée qui ne
// s'étale pas ». Plafond effectif = max(OR_POP_CAP, popDépart × OR_POP_CAP_GROWTH).
export const OR_POP_CAP_GROWTH        = 1.25;    // +25% de pop max pendant l'Âge d'Or
export const OR_HERITAGE_BALANCE_RATIO = 0.15;  // Héritage : seuil d'équilibre (<15% d'écart)
export const OR_HERITAGE_USURE_RED    = 0.20;   // Héritage : -20% Usure quand équilibré

// ── Constantes Mythe de Babel ─────────────────────────────────────────────────
export const BABEL_RUPTURE_MULT   = 2;       // Rupture ×2 pendant le cycle
export const BABEL_PROD_BASE_MULT = 1.05;    // Exponentielle par bâtiment du type choisi
export const BABEL_MULT_TARGET    = 30;      // Multiplicateur cible (~70 bâtiments du type) — la tour doit monter HAUT
export const BABEL_ADJ_BONUS      = 0.10;    // Héritage : +10% par voisin du même type
export const BABEL_CAT_LABELS     = { city: "Cité", knowledge: "Savoir", infra: "Infrastructure" };

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
export const PROMETHEE_FOOD_MULT       = 3;      // Multiplicateur de production de Nourriture
export const PROMETHEE_RUPTURE_PER_FOOD = 0.02;  // Rupture ajoutée par moteur de nourriture acheté (2%)
export const PROMETHEE_POP_MULT        = 100;    // Réussite : croître la pop ×100 depuis le départ AVANT la Rupture fatale (course du feu)
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
export const ATRIDES_GOAL_NET_GOLD          = 100_000; // (obsolète — remplacé par le gain net relatif ci-dessous)
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
export const CADMOS_POPULATION_THRESHOLDS = [25, 60, 140, 320, 750];
export const CADMOS_INFRASTRUCTURE_THRESHOLDS = [25, 80, 220, 600, 1500];
export const CADMOS_ORIENTATIONS = {
  food: {
    label: "Nourriture",
    article: "des",
    words: ["Granges", "Moissons", "Sillons", "Vergers", "Greniers", "Semences"],
    bonus: `+${Math.round(CADMOS_CYCLE_BONUS_PCT * 100)}% a la production de Nourriture pour le reste du cycle.`
  },
  gold: {
    label: "Tresor",
    article: "des",
    words: ["Comptoirs", "Marchands", "Caravanes", "Monnaies", "Quais", "Balances"],
    bonus: `+${Math.round(CADMOS_CYCLE_BONUS_PCT * 100)}% a la production de Tresor pour le reste du cycle.`
  },
  stability: {
    label: "Stabilite",
    article: "des",
    words: ["Veilleurs", "Sentinelles", "Lois", "Remparts", "Serments", "Archives"],
    bonus: `-${Math.round(CADMOS_CYCLE_BONUS_PCT * 100)}% a la vitesse de montee de la Rupture pour le reste du cycle.`
  }
};

const RAGNAROK_CONSTRAINTS = [
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
    name: "Le Mythe du Chaos",
    description: "Tous les bonus de méta-progression sont désactivés pour ce cycle : Ruines, Légitimité, Grand Reset. Chaque multiplicateur retombe à sa valeur de base (1x). Les upgrades restent achetés — ils sont simplement ignorés.",
    ragnarokSummary: "tous les bonus de méta-progression sont neutralisés ; appliqué en dernier.",
    objectif: `Gagner ${CHAOS_RAW_RUIN_TARGET} Ruines BRUTES en un seul cycle, tous bonus de méta-progression coupés (bâtir sans béquilles).`,
    heritageDescription: "Les Ruines gagnées lors d'un cycle Chaos comptent double dans le calcul du multiplicateur global de Ruines, en permanence.",

    onActivate() {
      // mechanics.js detecte state.activeMythId === "mythe_du_chaos" et neutralise
      // ruinEffects(), ruinMultiplier(), institutionMultiplier(), grandResetMultiplier().
      state.chaosReached = false;
    },

    onCollapse() {
      return Boolean(state.chaosReached);
    },

    applyHeritage() {
      state.chaosRuinsDouble = true;
    }
  },

  {
    id: "mythe_de_promethee",
    act: 1,
    name: "Le Mythe de Prométhée",
    description: `La production de Nourriture est multipliée par ${PROMETHEE_FOOD_MULT}x. Mais chaque moteur de Nourriture acheté ajoute ${Math.round(PROMETHEE_RUPTURE_PER_FOOD * 100)}% de Rupture instantanément. Plus la cité grandit, plus elle brûle.`,
    ragnarokSummary: `nourriture x${PROMETHEE_FOOD_MULT}, chaque moteur de nourriture ajoute de la Rupture.`,
    objectif: `Faire croître la population ×${PROMETHEE_POP_MULT} depuis le début du cycle AVANT que la Rupture ne dépasse ${Math.round(PROMETHEE_FATAL_RUPTURE * 100)}%. Dépasser le seuil fatal en premier = échec (la course du feu).`,
    heritageDescription: `Braisiers ancestraux : chaque cycle démarre avec un bonus de production de Nourriture x${BRAISIERS_FOOD_MULT} pendant ${BRAISIERS_DURATION_MS / 60_000} minutes.`,

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
    name: "Le Mythe d'Énée",
    description: `Le territoire de la cité se dégrade au fil du temps. Toutes les ${ENEE_TERRITORY_INTERVAL_MS / 60_000} minutes, il devient invivable : la production de Nourriture tombe à 0, le Trésor n'accumule plus d'Or, et l'Usure monte ${ENEE_USURE_DEGRADED_MULT}x plus vite. Pour résoudre la crise, vous devez migrer vers un nouveau territoire en abandonnant vos bâtiments.`,
    ragnarokSummary: `le territoire se dégrade toutes les ${ENEE_TERRITORY_INTERVAL_MS / 60_000} minutes et impose la migration.`,
    objectif: `Effectuer au moins ${ENEE_MIGRATIONS_TARGET} migrations avant l'effondrement.`,
    heritageDescription: `Migration fondatrice : chaque nouveau cycle démarre avec un boost de production globale (+${Math.round(ENEE_HERITAGE_BOOST_PER_COLLAPSE * 100)}% par effondrement passé, jusqu'à +${Math.round(ENEE_HERITAGE_MAX_COLLAPSES * ENEE_HERITAGE_BOOST_PER_COLLAPSE * 100)}%) pendant les ${ENEE_HERITAGE_DURATION_MS / 1000} premières secondes.`,

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
    name: "Le Mythe de Cadmos",
    description: "A chaque palier de Population ou d'Infrastructure, la cite doit nommer son Age. Trois noms sont proposes, chacun lie a une orientation: Nourriture, Tresor ou Stabilite. Le nom choisi rejoint la Chronique et accorde un bonus de cycle.",
    ragnarokSummary: "chaque palier Population/Infrastructure doit recevoir un Age nommé.",
    objectif: `Avoir nomme au moins ${CADMOS_AGE_NAME_TARGET} Ages dans la Chronique avant l'effondrement.`,
    heritageDescription: `Noms de Pouvoir : apres chaque run, graver un Age de la Chronique comme Epitaphe Permanente. Chaque Epitaphe donne +${Math.round(CADMOS_EPITAPH_BONUS_PCT * 100)}% permanent a son orientation, avec ${CADMOS_MAX_PERMANENT_EPITAPHS} Epitaphes actives maximum.`,

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
    name: "Le Mythe d'Héphaïstos",
    description: `${HEPH_POP_DECAY_START_MIN} min après le début du cycle, la Population commence à décroître (-${Math.round(HEPH_POP_DECAY_RATE * 100)}%/min). En contrepartie, les bâtiments d'Infrastructure voient leur production multipliée par un facteur croissant (x${HEPH_INFRA_MULT_BASE} au départ, +${HEPH_INFRA_MULT_GROWTH}/min). L'Usure monte x${HEPH_USURE_MULT} plus vite. Sous ${HEPH_POP_CRISIS_THRESHOLD} habitants, les crises narratives deviennent irrésolues.`,
    ragnarokSummary: `population en déclin, infrastructure amplifiée, Usure x${HEPH_USURE_MULT}.`,
    objectif: `Bâtir une Infrastructure d'au moins ${HEPH_INFRA_PER_PEAK}x le pic de Population, pendant que la Population décline d'au moins ${Math.round(HEPH_POP_DECLINE_PCT * 100)}% depuis ce pic (les machines remplacent les hommes).`,
    heritageDescription: `Automates ancestraux : débloque un panneau "Automates" dans les Options pour activer des automatisations permanentes dans toutes les runs futures (achat automatique de bâtiments, déclenchement de crises).`,

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
    name: "Le Mythe de Sisyphe",
    description: `Chaque achat de bâtiment augmente le coût de tous les bâtiments de +${Math.round((SISYPHE_MULT_PER_PURCHASE - 1) * 100)}% de façon cumulative. Ce multiplicateur de malédiction ne se réinitialise jamais en cours de cycle.`,
    ragnarokSummary: `chaque achat augmente tous les coûts de ${Math.round((SISYPHE_MULT_PER_PURCHASE - 1) * 100)}%.`,
    objectif: `Pousser le rocher jusqu'à ${SISYPHE_BUILDING_TARGET} bâtiments au total malgré l'inflation des coûts (chaque achat alourdit le suivant).`,
    heritageDescription: `Réduit de façon permanente le facteur de scaling des coûts de tous les bâtiments de ${Math.round(SISYPHE_SCALE_REDUCTION * 100)}% (l'inflation naturelle croît plus lentement pour toujours).`,

    onActivate() {
      state.sisypheMult = 1;
      state.sisypheReached = false;
    },

    onCollapse() {
      return Boolean(state.sisypheReached);
    },

    applyHeritage() {
      state.sisypheHeritage = true;
    }
  },

  {
    id: "mythe_de_babel",
    act: 2,
    name: "Le Mythe de Babel",
    description: `Seul le type de bâtiment choisi au lancement peut être acheté ce cycle. Chaque bâtiment du type concentre une puissance exponentielle : bonus x${BABEL_PROD_BASE_MULT}^N (N = nombre de bâtiments du type). En contrepartie, la Rupture monte x${BABEL_RUPTURE_MULT} plus vite.`,
    ragnarokSummary: `seuls les bâtiments du type choisi peuvent être achetés ; Rupture x${BABEL_RUPTURE_MULT}.`,
    objectif: `Porter le multiplicateur exponentiel jusqu'à x${BABEL_MULT_TARGET} (~${Math.ceil(Math.log(BABEL_MULT_TARGET) / Math.log(BABEL_PROD_BASE_MULT))} bâtiments du type choisi).`,
    heritageDescription: `Synergie d'Urbanisme : sur la carte, chaque bâtiment du même type placé côte à côte accorde +${Math.round(BABEL_ADJ_BONUS * 100)}% de production par voisin du même type (halo doré visible sur le canvas).`,

    buildChoiceHTML() {
      const cats = [
        { value: "city",      label: "Cite",          desc: "Nourriture, Commerce, Population" },
        { value: "knowledge", label: "Savoir",         desc: "Connaissance, Academies, Archives" },
        { value: "infra",     label: "Infrastructure", desc: "Aqueducs, Routes, Batisseurs" }
      ];
      return `
        <div class="myth-modal-row">
          <span class="myth-modal-label">Type de bâtiment</span>
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

    onActivate() {
      state.babelProdReached = false;
    },

    onCollapse() {
      return Boolean(state.babelProdReached);
    },

    applyHeritage() {
      state.babelHeritage = true;
    }
  },

  {
    id: "mythe_age_or",
    act: 2,
    name: "Le Mythe de l'Âge d'Or",
    description: `La Rupture est plafonnée à ${Math.round(OR_RUPTURE_CAP * 100)}% et toutes ses crises sont suspendues. Mais au-delà de ${OR_POP_THRESHOLD} habitants, chaque point de Population supprime ${OR_POP_PENALTY_PCT * 100}% de production globale. Si l'écart entre Nourriture et Trésor dépasse ${Math.round(OR_BALANCE_RATIO * 100)}%, l'Usure monte x${OR_USURE_IMBALANCE_MULT} plus vite.`,
    ragnarokSummary: `Rupture plafonnée à ${Math.round(OR_RUPTURE_CAP * 100)}%, population risquée et équilibre Nourriture/Trésor exigé.`,
    objectif: `Accumuler ${OR_GOLD_TARGET.toLocaleString()} de Trésor sans laisser la population croître de plus de ${Math.round((OR_POP_CAP_GROWTH - 1) * 100)}% depuis le début du cycle (une cité dorée qui ne s'étale pas).`,
    heritageDescription: `Équilibre Doré : quand l'écart entre Nourriture et Trésor est inférieur à ${Math.round(OR_HERITAGE_BALANCE_RATIO * 100)}%, l'Usure monte ${Math.round(OR_HERITAGE_USURE_RED * 100)}% plus lentement — en permanence, dans toutes les runs futures.`,

    onActivate() {
      state.orStartPop     = state.population;
      state.orPopPeak      = state.population;
      state.orGoldReached  = false;
      state.orUsureImbalance = false;
      state.mythStartGold  = D(state.gold);
    },

    onCollapse() {
      return Boolean(state.orGoldReached);
    },

    applyHeritage() {
      state.orHeritage = true;
    }
  },

  // ── Acte III · Apocalypse ─────────────────────────────────────────────────
  {
    id: "mythe_d_atlas",
    act: 3,
    name: "Le Mythe d'Atlas",
    description: `L'effondrement manuel est désactivé. L'Usure monte ${ATLAS_USURE_MULT}x plus vite. La Rupture ne peut plus être réduite par aucun moyen — les crises absorbent leur coût mais n'allègent plus l'instabilité.`,
    ragnarokSummary: `effondrement manuel bloqué, Usure x${ATLAS_USURE_MULT}, la Rupture ne baisse plus par les crises.`,
    objectif: `Survivre au moins ${ATLAS_MIN_DURATION_MS / 60_000} minutes de cycle actif, OU résister à ${ATLAS_MIN_CRISIS_WAVES} vagues de crises avant l'effondrement.`,
    heritageDescription: `1) L'Usure de base est réduite de ${Math.round(ATLAS_USURE_REDUCTION * 100)}% en permanence. 2) Débloque la jauge "Légitimité" (0-100, démarre à 50 chaque cycle). Quand elle est haute, les effets négatifs des crises sont atténués jusqu'à ${Math.round(ATLAS_LEGIT_MAX_REDUCTION * 100)}%.`,

    onActivate() {
      state.atlasCrisisCount = 0;
    },

    onCollapse() {
      const durationMs   = Date.now() - (state.cycleStartedAt || Date.now());
      const enoughTime   = durationMs >= ATLAS_MIN_DURATION_MS;
      const enoughCrises = (state.atlasCrisisCount || 0) >= ATLAS_MIN_CRISIS_WAVES;
      return enoughTime || enoughCrises;
    },

    applyHeritage() {
      state.atlasHeritage = true;
    }
  },

  {
    id: "mythe_d_icare",
    act: 3,
    name: "Le Mythe d'Icare",
    description: `La production globale est multipliée par ${ICARE_PROD_MULT}x. La Rupture monte ${ICARE_RUPTURE_MULT}x plus vite, l'Usure ${ICARE_USURE_MULT}x plus vite. L'effondrement manuel est désactivé — seul l'automatique peut terminer ce cycle.`,
    ragnarokSummary: `production x${ICARE_PROD_MULT}, Rupture x${ICARE_RUPTURE_MULT}, Usure x${ICARE_USURE_MULT}.`,
    objectif: `Atteindre ${ICARE_INFRA_TARGET} d'Infrastructure avant l'effondrement automatique.`,
    heritageDescription: `Surchauffe : débloque un bouton activable pendant les runs normaux. Active x${SURCHAUFFE_PROD_MULT} production pendant ${SURCHAUFFE_DURATION_MS / 1000}s (+${Math.round(SURCHAUFFE_RUPTURE * 100)}% Rupture instant). Cooldown : ${SURCHAUFFE_COOLDOWN_MS / 60_000} min.`,

    onActivate() {
      state.icareInfraReached = false;
      state.mythStartInfra = D(state.infrastructure);
    },

    onCollapse() {
      return state.icareInfraReached;
    },

    applyHeritage() {
      state.icareHeritage = true;
    }
  },

  {
    id: "mythe_du_phenix",
    act: 3,
    name: "Le Mythe du Phénix",
    description: `Renaître de ses cendres, vite, plusieurs fois. Après chaque effondrement, reconstruisez la cité jusqu'à ${PHENIX_REBIRTH_POP_MULT}× sa population de redémarrage en moins de ${PHENIX_REBIRTH_WINDOW_MS / 60_000} minutes. Réussissez ${PHENIX_RENAISSANCE_TARGET} renaissances D'AFFILÉE — rater une fenêtre brise la chaîne et vous repartez de zéro.`,
    ragnarokSummary: `reconstruction express à ${PHENIX_REBIRTH_POP_MULT}× la population en ${PHENIX_REBIRTH_WINDOW_MS / 60_000} min, ${PHENIX_RENAISSANCE_TARGET} fois de suite.`,
    objectif: `Réussir ${PHENIX_RENAISSANCE_TARGET} renaissances consécutives : à chaque cycle, atteindre ${PHENIX_REBIRTH_POP_MULT}× la population de départ en moins de ${PHENIX_REBIRTH_WINDOW_MS / 60_000} min, puis s'effondrer pour renaître.`,
    heritageDescription: `Script d'Automatisation : débloque un panneau dans les Options pour définir des conditions d'effondrement automatique dans toutes les runs futures (seuil de Rupture, seuil d'Usure, durée du cycle).`,

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
    name: "Le Mythe des Atrides",
    description: "Une dette maudite pèse sur la cité. La dette croît chaque seconde (+1% de la production par minute) et draine 10% de chaque ressource produite. Heureusement, vous commencez avec un trésor initial et un bonus global x3 de production pendant les 2 premières minutes.",
    ragnarokSummary: "dette initiale, croissance de dette et drain de ressources.",
    objectif: `Atteindre un Trésor net (Trésor moins Dette) de ${ATRIDES_GOAL_NET_GOLD.toLocaleString()} Or (× la puissance économique courante) avant de vous effondrer.`,
    heritageDescription: "Débloque le bouton 'Pacte des Atrides' en début de cycle normal (runs normales) pour doubler la production pendant 2 minutes en échange de -50% pendant la crise.",

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
    name: "Le Mythe d'Antee",
    description: "Au demarrage, choisissez parmi vos Heritages debloques ceux qui deviennent des Ruines actives. Chaque Ruine active conserve son bonus habituel mais ajoute son malus associe pour ce cycle.",
    ragnarokSummary: "les Ruines actives doivent être choisies et comptent comme malus de cycle.",
    objectif: `Porter au moins ${ANTEE_MIN_ACTIVE_RUINS} maluses simultanés (Héritages activés comme Ruines actives) ET, sous ce poids, faire croître la population ×${ANTEE_POP_MULT} depuis le départ — la force naît des fardeaux.`,
    heritageDescription: "Ruines actives : dans les runs futures, chaque debut de cycle propose de choisir volontairement des Heritages avec leur malus. Les Ruines gagnees a l'effondrement recoivent un multiplicateur proportionnel au nombre de malus actifs (placeholder).",
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
    name: "Ragnarok",
    description: "Le Mythe terminal. Toutes les contraintes des treize Mythes precedents s'appliquent simultanement en un seul cycle; Chaos ferme la marche et neutralise les bonus de meta-progression.",
    objectif: `Sous les 13 contraintes réunies : tenir au moins ${RAGNAROK_MIN_SURVIVAL_MS / 1000} s ET faire surgir la puissance ×${RAGNAROK_POWER_SURGE_MULT} depuis le début du cycle — un dernier embrasement avant la fin de toutes choses.`,
    heritageDescription: "La Fin des Dieux : debloque le 11e Grand Reset, qui donne un multiplicateur x4 aux Ruines, et grave un titre final permanent dans la Chronique.",
    requiresActiveRuinsChoice: true,

    async onActivate() {
      state.ragnarokEffectsApplied = false;
      state.ragnarokActiveConstraints = RAGNAROK_CONSTRAINTS
        .map(id => {
          const m = getMythById(id);
          if (!m) return "";
          const shortName = m.name.replace("Le Mythe de ", "").replace("Le Mythe d'", "");
          return `${shortName}: ${m.ragnarokSummary}`;
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
    log("Acte II — Les pactes anciens s'éveillent. De nouveaux défis se révèlent aux yeux du sage.");
  }
  if (allDone(byAct(2)) && byAct(3).length > 0 && !state.mythActsAnnounced.act3) {
    state.mythActsAnnounced.act3 = true;
    log("Acte III — L'épreuve finale approche. Les défis légendaires réclament un dernier sacrifice.");
  }
  const mainMythes = MYTHS.filter((m) => m.act === 1 || m.act === 2 || m.act === 3);
  const hasRagnarok = MYTHS.some((m) => m.act === "ragnarok");
  if (hasRagnarok && allDone(mainMythes) && !state.mythActsAnnounced.ragnarok) {
    state.mythActsAnnounced.ragnarok = true;
    log("Ragnarok — Le pacte ultime se brise. La fin de toutes choses vous attend.");
  }
}
