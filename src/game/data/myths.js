"use strict";

import { state, gamePaused } from '../core/state.js';
import { fmt } from '../core/utils.js';
import { eras } from './world.js';
import { log, activateMyth } from '../core/actions.js';

// Seuil de Ruines requis pour réussir le Mythe du Chaos — à calibrer.
export const CHAOS_RUIN_THRESHOLD = 50;

// ── Constantes Mythe d'Icare ─────────────────────────────────────────────────
export const ICARE_PROD_MULT     = 100;      // Multiplicateur global de production
export const ICARE_RUPTURE_MULT  = 30;       // Multiplicateur de vitesse de Rupture
export const ICARE_USURE_MULT    = 15;       // Multiplicateur de vitesse d'Usure
export const ICARE_INFRA_TARGET  = 5000;     // Infrastructure cible pour réussir le Mythe
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
export const SISYPHE_GOLD_TARGET       = 50_000; // Trésor cible pour réussir (placeholder)
export const SISYPHE_SCALE_REDUCTION   = 0.10;  // Héritage : -10% sur le facteur de scaling

// ── Constantes Mythe de l'Âge d'Or ──────────────────────────────────────────
export const OR_RUPTURE_CAP           = 0.05;    // Rupture plafonnée à 5%
export const OR_POP_THRESHOLD         = 200;     // Seuil de rendements décroissants
export const OR_POP_PENALTY_PCT       = 0.005;   // -0.5% de production par habitant au-delà du seuil
export const OR_BALANCE_RATIO         = 0.25;    // Écart Nourriture/Trésor au-delà duquel il y a déséquilibre
export const OR_USURE_IMBALANCE_MULT  = 3;       // Usure ×3 pendant le déséquilibre
export const OR_GOLD_TARGET           = 75_000;  // Trésor cible pour réussir
export const OR_POP_CAP               = 300;     // Population max autorisée pour valider
export const OR_HERITAGE_BALANCE_RATIO = 0.15;  // Héritage : seuil d'équilibre (<15% d'écart)
export const OR_HERITAGE_USURE_RED    = 0.20;   // Héritage : -20% Usure quand équilibré

// ── Constantes Mythe de Babel ─────────────────────────────────────────────────
export const BABEL_RUPTURE_MULT   = 2;       // Rupture ×2 pendant le cycle
export const BABEL_PROD_BASE_MULT = 1.05;    // Exponentielle par bâtiment du type choisi
export const BABEL_MULT_TARGET    = 5;       // Multiplicateur cible pour réussite
export const BABEL_ADJ_BONUS      = 0.10;    // Héritage : +10% par voisin du même type
export const BABEL_CAT_LABELS     = { city: "Cite", knowledge: "Savoir", infra: "Infrastructure" };

// ── Constantes Mythe du Phénix ───────────────────────────────────────────────
export const PHENIX_CYCLE_COUNT    = 20;           // Nombre total de cycles forcés
export const PHENIX_FORCE_INTERVAL = 5 * 60_000;  // 5 minutes entre chaque effondrement forcé
export const PHENIX_RUIN_TARGET    = 400;          // Ruines cumulées pour réussir

// ── Constantes Mythe d'Héphaïstos ────────────────────────────────────────────
export const HEPH_POP_DECAY_START_MIN  = 3;      // Déclin pop démarre après 3 min de cycle
export const HEPH_POP_DECAY_RATE       = 0.008;  // 0.8% de la pop actuelle perdue par minute
export const HEPH_INFRA_MULT_BASE      = 2.0;    // Bonus infra x2 au départ
export const HEPH_INFRA_MULT_GROWTH    = 0.15;   // +0.15 par minute de cycle
export const HEPH_USURE_MULT           = 2.5;    // Usure x2.5
export const HEPH_POP_CRISIS_THRESHOLD = 50;     // Pop en-dessous de ce seuil → crises irrésolubles
export const HEPH_INFRA_TARGET         = 1500;   // Infrastructure cible pour réussir
export const HEPH_POP_DECLINE_PCT      = 0.25;   // Déclin requis depuis le pic (25%)

// ── Constantes Mythe de Prométhée ────────────────────────────────────────────
export const PROMETHEE_FOOD_MULT       = 3;      // Multiplicateur de production de Nourriture
export const PROMETHEE_RUPTURE_PER_FOOD = 0.02;  // Rupture ajoutée par moteur de nourriture acheté (2%)
export const PROMETHEE_POP_TARGET      = 500;    // Population cible pour réussir le Mythe
export const PROMETHEE_FATAL_RUPTURE   = 0.80;   // Seuil de Rupture fatal (80%)
export const BRAISIERS_DURATION_MS     = 120_000; // Durée du bonus Braisiers en ms (2 minutes)
export const BRAISIERS_FOOD_MULT       = 2;      // Multiplicateur Nourriture pendant les Braisiers

export const MYTHS = [
  // ── Acte I · Fondation ────────────────────────────────────────────────────
  {
    id: "mythe_du_chaos",
    act: 1,
    name: "Le Mythe du Chaos",
    description: "Tous les bonus de meta-progression sont desactives pour ce cycle : Ruines, Legitimite, Grand Reset. Chaque multiplicateur retombe a sa valeur de base (1x). Les upgrades restent achetes — ils sont simplement ignores.",
    objectif: `Atteindre ${CHAOS_RUIN_THRESHOLD} Ruines sans aucun bonus de meta-progression.`,
    heritageDescription: "Les Ruines gagnees lors d'un cycle Chaos comptent double dans le calcul du multiplicateur global de Ruines, en permanence.",

    onActivate() {
      // mechanics.js detecte state.activeMythId === "mythe_du_chaos" et neutralise
      // ruinEffects(), ruinMultiplier(), institutionMultiplier(), grandResetMultiplier().
      // On invalide uniquement le cache pour forcer un recalcul immédiat.
      // Modifié en export pour mechanics.js
    },

    onCollapse() {
      return state.ruins >= CHAOS_RUIN_THRESHOLD;
    },

    applyHeritage() {
      state.chaosRuinsDouble = true;
    }
  },

  {
    id: "mythe_de_promethee",
    act: 1,
    name: "Le Mythe de Promethee",
    description: `La production de Nourriture est multipliee par ${PROMETHEE_FOOD_MULT}x. Mais chaque moteur de Nourriture achete ajoute ${Math.round(PROMETHEE_RUPTURE_PER_FOOD * 100)}% de Rupture instantanement. Plus la cite grandit, plus elle brule.`,
    objectif: `Atteindre ${PROMETHEE_POP_TARGET} habitants AVANT que la Rupture ne depasse ${Math.round(PROMETHEE_FATAL_RUPTURE * 100)}%. Depasser le seuil fatal en premier = echec.`,
    heritageDescription: `Braisiers ancestraux : chaque cycle demarre avec un bonus de production de Nourriture x${BRAISIERS_FOOD_MULT} pendant ${BRAISIERS_DURATION_MS / 60_000} minutes.`,

    onActivate() {
      state.prometheeFailed    = false;
      state.prometheePopReached = false;
    },

    onCollapse() {
      return state.prometheePopReached && !state.prometheeFailed;
    },

    applyHeritage() {
      state.prometheeBraisiers = true;
    }
  },

  // ── Acte II · Domination ──────────────────────────────────────────────────
  {
    id: "mythe_de_sisyphe",
    act: 2,
    name: "Le Mythe de Sisyphe",
    description: `Chaque achat de batiment augmente le cout de tous les batiments de +${Math.round((SISYPHE_MULT_PER_PURCHASE - 1) * 100)}% de facon cumulative. Ce multiplicateur de malediction ne se reinitialise jamais en cours de cycle.`,
    objectif: `Accumuler ${SISYPHE_GOLD_TARGET.toLocaleString()} de Tresor malgre l'inflation des couts.`,
    heritageDescription: `Reduit de facon permanente le facteur de scaling des couts de tous les batiments de ${Math.round(SISYPHE_SCALE_REDUCTION * 100)}% (l'inflation naturelle croît plus lentement pour toujours).`,

    onActivate() {
      state.sisypheMult = 1;
    },

    onCollapse() {
      return state.gold >= SISYPHE_GOLD_TARGET;
    },

    applyHeritage() {
      state.sisypheHeritage = true;
    }
  },

  {
    id: "mythe_de_babel",
    act: 2,
    name: "Le Mythe de Babel",
    description: `Seul le type de batiment choisi au lancement peut etre achete ce cycle. Chaque batiment du type concentre une puissance exponentielle : bonus x${BABEL_PROD_BASE_MULT}^N (N = nombre de batiments du type). En contrepartie, la Rupture monte x${BABEL_RUPTURE_MULT} plus vite.`,
    objectif: `Porter le multiplicateur exponentiel jusqu'a x${BABEL_MULT_TARGET} (~${Math.ceil(Math.log(BABEL_MULT_TARGET) / Math.log(BABEL_PROD_BASE_MULT))} batiments du type choisi).`,
    heritageDescription: `Synergie d'Urbanisme : sur la carte, chaque batiment du meme type place cote a cote accorde +${Math.round(BABEL_ADJ_BONUS * 100)}% de production par voisin du meme type (halo dore visible sur le canvas).`,

    buildChoiceHTML() {
      const cats = [
        { value: "city",      label: "Cite",          desc: "Nourriture, Commerce, Population" },
        { value: "knowledge", label: "Savoir",         desc: "Connaissance, Academies, Archives" },
        { value: "infra",     label: "Infrastructure", desc: "Aqueducs, Routes, Batisseurs" }
      ];
      return `
        <div class="myth-modal-row">
          <span class="myth-modal-label">Type de batiment</span>
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
    name: "Le Mythe de l'Age d'Or",
    description: `La Rupture est plafonnee a ${Math.round(OR_RUPTURE_CAP * 100)}% et toutes ses crises sont suspendues. Mais au-dela de ${OR_POP_THRESHOLD} habitants, chaque point de Population supprime ${OR_POP_PENALTY_PCT * 100}% de production globale. Si l'ecart entre Nourriture et Tresor depasse ${Math.round(OR_BALANCE_RATIO * 100)}%, l'Usure monte x${OR_USURE_IMBALANCE_MULT} plus vite.`,
    objectif: `Accumuler ${OR_GOLD_TARGET.toLocaleString()} de Tresor en ayant la population qui n'a jamais depasse ${OR_POP_CAP} habitants.`,
    heritageDescription: `Equilibre Dore : quand l'ecart entre Nourriture et Tresor est inferieur a ${Math.round(OR_HERITAGE_BALANCE_RATIO * 100)}%, l'Usure monte ${Math.round(OR_HERITAGE_USURE_RED * 100)}% plus lentement — en permanence, dans toutes les runs futures.`,

    onActivate() {
      state.orPopPeak      = state.population;
      state.orGoldReached  = false;
      state.orUsureImbalance = false;
    },

    onCollapse() {
      return Boolean(state.orGoldReached);
    },

    applyHeritage() {
      state.orHeritage = true;
    }
  },

  {
    id: "mythe_d_hephaistos",
    act: 2,
    name: "Le Mythe d'Hephaistos",
    description: `${HEPH_POP_DECAY_START_MIN} min apres le debut du cycle, la Population commence a decroitre (-${Math.round(HEPH_POP_DECAY_RATE * 100)}%/min). En contrepartie, les batiments d'Infrastructure voient leur production multipliee par un facteur croissant (x${HEPH_INFRA_MULT_BASE} au depart, +${HEPH_INFRA_MULT_GROWTH}/min). L'Usure monte x${HEPH_USURE_MULT} plus vite. Sous ${HEPH_POP_CRISIS_THRESHOLD} habitants, les crises narratives deviennent irresolues.`,
    objectif: `Atteindre ${HEPH_INFRA_TARGET} d'Infrastructure avec une Population ayant decline d'au moins ${Math.round(HEPH_POP_DECLINE_PCT * 100)}% depuis son pic.`,
    heritageDescription: `Automates ancestraux : debloque un panneau "Automates" dans les Options pour activer des automatisations permanentes dans toutes les runs futures (achat automatique de batiments, declenchement de crises).`,

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

  // ── Acte III · Apocalypse ─────────────────────────────────────────────────
  {
    id: "mythe_d_atlas",
    act: 3,
    name: "Le Mythe d'Atlas",
    description: `L'effondrement manuel est desactive. L'Usure monte ${ATLAS_USURE_MULT}x plus vite. La Rupture ne peut plus etre reduite par aucun moyen — les crises absorbent leur cout mais n'allegent plus l'instabilite.`,
    objectif: `Survivre au moins ${ATLAS_MIN_DURATION_MS / 60_000} minutes de cycle actif, OU resister a ${ATLAS_MIN_CRISIS_WAVES} vagues de crises avant l'effondrement.`,
    heritageDescription: `1) L'Usure de base est reduite de ${Math.round(ATLAS_USURE_REDUCTION * 100)}% en permanence. 2) Debloque la jauge "Legitimite" (0-100, demarre a 50 chaque cycle). Quand elle est haute, les effets negatifs des crises sont attenues jusqu'a ${Math.round(ATLAS_LEGIT_MAX_REDUCTION * 100)}%.`,

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
    description: `La production globale est multipliee par ${ICARE_PROD_MULT}x. La Rupture monte ${ICARE_RUPTURE_MULT}x plus vite, l'Usure ${ICARE_USURE_MULT}x plus vite. L'effondrement manuel est desactive — seul l'automatique peut terminer ce cycle.`,
    objectif: `Atteindre ${ICARE_INFRA_TARGET} d'Infrastructure avant l'effondrement automatique.`,
    heritageDescription: `Surchauffe : debloque un bouton activable pendant les runs normaux. Active x${SURCHAUFFE_PROD_MULT} production pendant ${SURCHAUFFE_DURATION_MS / 1000}s (+${Math.round(SURCHAUFFE_RUPTURE * 100)}% Rupture instant). Cooldown : ${SURCHAUFFE_COOLDOWN_MS / 60_000} min.`,

    onActivate() {
      state.icareInfraReached = false;
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
    name: "Le Mythe du Phenix",
    description: `La civilisation s'effondre de force toutes les ${PHENIX_FORCE_INTERVAL / 60_000} minutes (temps reel), quoi qu'il arrive. Le pacte dure ${PHENIX_CYCLE_COUNT} cycles (forces ou manuels). L'effondrement manuel reste disponible.`,
    objectif: `Sur ${PHENIX_CYCLE_COUNT} cycles, accumuler un total de ${PHENIX_RUIN_TARGET} Ruines.`,
    heritageDescription: `Script d'Automatisation : debloque un panneau dans les Options pour definir des conditions d'effondrement automatique dans toutes les runs futures (seuil de Rupture, seuil d'Usure, duree du cycle).`,

    onActivate() {
      state.phoenixCycleCount  = 0;
      state.phoenixTotalRuins  = 0;
      state.phoenixNextForceAt = Date.now() + PHENIX_FORCE_INTERVAL;
    },

    onCollapse() {
      return state.phoenixCycleCount >= PHENIX_CYCLE_COUNT &&
             (state.phoenixTotalRuins || 0) >= PHENIX_RUIN_TARGET;
    },

    applyHeritage() {
      state.phoenixHeritage = true;
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

export function isMythUnlocked(myth) {
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

  const byAct = (n) => MYTHS.filter((m) => m.act === n);
  const allDone = (arr) => arr.length > 0 && arr.every((m) => isMythCompleted(m.id));

  if (!state.mythActsAnnounced) state.mythActsAnnounced = {};

  if (allDone(byAct(1)) && byAct(2).length > 0 && !state.mythActsAnnounced.act2) {
    state.mythActsAnnounced.act2 = true;
    log("Acte II — Les pactes anciens s'eveillent. De nouveaux defis se revelent aux yeux du sage.");
  }
  if (allDone(byAct(2)) && byAct(3).length > 0 && !state.mythActsAnnounced.act3) {
    state.mythActsAnnounced.act3 = true;
    log("Acte III — L'epreuve finale approche. Les defis legendaires reclament un dernier sacrifice.");
  }
  const mainMythes = MYTHS.filter((m) => m.act === 1 || m.act === 2 || m.act === 3);
  const hasRagnarok = MYTHS.some((m) => m.act === "ragnarok");
  if (hasRagnarok && allDone(mainMythes) && !state.mythActsAnnounced.ragnarok) {
    state.mythActsAnnounced.ragnarok = true;
    log("Ragnarok — Le pacte ultime se brise. La fin de toutes choses vous attend.");
  }
}
