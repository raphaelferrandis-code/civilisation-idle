"use strict";
/* ============================================================================
 * regulationActions.js — Actions de régulation DÉBLOCABLES (paliers 3-5).
 *
 * Les actions de base (Rationner, Réserve d'État, Jeux civiques, Recenser,
 * Réformes, Catastrophes, Culte des ancêtres + les 4 réformes de fond) restent
 * câblées dans crisis.js / balance.js. Ce registre ajoute les paliers
 * SUPÉRIEURS, qui se débloquent au fur et à mesure des ÈRES (bestEra), des
 * PALIERS et des MYTHES complétés → la gestion de crise s'enrichit avec la partie.
 *
 * Modèle purement DÉCLARATIF (aucun import du moteur → pas de cycle) : les
 * prédicats `unlock` lisent un `ctx` fourni par regulationContext() (mechanics).
 *
 *  kind 'soothe'  : apaisement temporaire (relief décline) — comme les actions de base.
 *  kind 'reform'  : recul DURABLE (dépose foyerReform, partage le plafond) — premium.
 *  Effets éco optionnels : infraAdd (× nb bâtiments) et legitAdd (plat) → la
 *  gestion de crise devient aussi un moteur de croissance.
 *
 *  cost = { res, seconds } : ancré sur la production (cf. crisisCosts).
 * ========================================================================== */

export const REGULATION_ACTIONS = [
  // ─── 🌾 Subsistance (scarcity) ──────────────────────────────────────────────
  {
    id: "granariesCommunal", foyer: "scarcity", tier: 3, kind: "soothe",
    label: "Greniers communaux",
    note: "Des greniers de quartier sont ouverts à tous : nul ne dort le ventre vide, et la peur de manquer reflue.",
    unlock: (c) => c.bestEra >= 2, unlockLabel: "Ère II",
    cost: { res: "food", seconds: 35 },
    relief: 0.22, malusRes: "food", malusPct: 0.10, counter: "rationing"
  },
  {
    id: "royalIrrigation", foyer: "scarcity", tier: 4, kind: "soothe",
    label: "Irrigation royale",
    note: "De grands canaux d'irrigation sont creusés : les champs verdissent et l'ouvrage profite à toute la cité.",
    unlock: (c) => c.bestEra >= 4, unlockLabel: "Ère IV",
    cost: { res: "food", seconds: 55 },
    relief: 0.14, counter: "rationing", infraAdd: 0.10
  },
  {
    id: "cornucopia", foyer: "scarcity", tier: 5, kind: "reform",
    label: "Corne d'abondance",
    note: "Un système de réserves perpétuelles est institué : la disette devient un souvenir, et nos ouvrages perdurent.",
    unlock: (c) => c.mythCount >= 1, unlockLabel: "1 mythe",
    cost: { res: "food", seconds: 150 },
    reformAdd: 0.18, infraAdd: 0.12
  },

  // ─── ⚖️ Inégalités (inequality) ─────────────────────────────────────────────
  {
    id: "sumptuaryLaws", foyer: "inequality", tier: 3, kind: "soothe",
    label: "Lois somptuaires",
    note: "Le faste des puissants est bridé par décret : l'étalage des fortunes cesse, la rue se sent moins méprisée.",
    unlock: (c) => c.bestEra >= 2, unlockLabel: "Ère II",
    cost: { res: "gold", seconds: 40 },
    relief: 0.24, malusRes: "gold", malusPct: 0.12, counter: "festivals"
  },
  {
    id: "stateMecenat", foyer: "inequality", tier: 4, kind: "soothe",
    label: "Mécénat d'État",
    note: "Les grandes maisons financent des travaux publics pour graver leur nom : leur or sert enfin la cité.",
    unlock: (c) => c.bestEra >= 4, unlockLabel: "Ère IV",
    cost: { res: "gold", seconds: 60 },
    relief: 0.16, counter: "festivals", infraAdd: 0.12
  },
  {
    id: "evergetism", foyer: "inequality", tier: 5, kind: "reform",
    label: "Évergétisme",
    note: "Le devoir de générosité des riches devient loi sacrée : le partage s'institutionnalise pour de bon.",
    unlock: (c) => c.mythCount >= 1, unlockLabel: "1 mythe",
    cost: { res: "gold", seconds: 150 },
    reformAdd: 0.18, legitAdd: 0.5
  },

  // ─── 🏛️ Complexité (complexity) ─────────────────────────────────────────────
  {
    // LEVIER B — convertit le trésor en infrastructure (l'outil anti-rupture le
    // plus sain : l'infra porte la charge structurelle et absorbe la complexité).
    id: "publicWorks", foyer: "complexity", tier: 4, kind: "soothe",
    label: "Travaux publics",
    note: "Le trésor public finance routes, aqueducs et halles : la cité se dote des ouvrages qui la rendent gouvernable.",
    unlock: (c) => c.bestEra >= 3, unlockLabel: "Ère III",
    cost: { res: "gold", seconds: 60 },
    relief: 0.10, counter: "reforms", infraAdd: 0.30
  },
  {
    id: "celestialChancery", foyer: "complexity", tier: 5, kind: "reform",
    label: "Chancellerie céleste",
    note: "Une administration parfaite, calquée sur l'ordre des astres, est gravée dans le bronze : la cité ne s'égare plus dans sa propre taille.",
    unlock: (c) => c.mythCount >= 1, unlockLabel: "1 mythe",
    cost: { res: "knowledge", seconds: 160 },
    reformAdd: 0.18, infraAdd: 0.15
  },

  // ─── 📜 Dissidence (dissent) ────────────────────────────────────────────────
  {
    id: "monumentalFetes", foyer: "dissent", tier: 4, kind: "soothe",
    label: "Fêtes monumentales",
    note: "De somptueuses fêtes publiques scellent l'unité du peuple sous les bannières de la dynastie.",
    unlock: (c) => c.bestEra >= 3, unlockLabel: "Ère III",
    cost: { res: "gold", seconds: 45 },
    relief: 0.20, malusRes: "gold", malusPct: 0.12, counter: "festivals"
  },
  {
    id: "stateOracle", foyer: "dissent", tier: 5, kind: "reform",
    label: "Oracle d'État",
    note: "Un oracle officiel donne un sens commun à chaque épreuve : la mémoire et la foi du peuple s'unissent durablement.",
    unlock: (c) => c.mythCount >= 1, unlockLabel: "1 mythe",
    cost: { res: "knowledge", seconds: 150 },
    reformAdd: 0.18, legitAdd: 0.5
  }
];

export const REGULATION_ACTIONS_BY_ID = Object.fromEntries(
  REGULATION_ACTIONS.map((a) => [a.id, a])
);

// id → foyer (miroir d'ACTION_FOYER pour les actions déblocables).
export const REGULATION_ACTION_FOYER = Object.fromEntries(
  REGULATION_ACTIONS.map((a) => [a.id, a.foyer])
);

/* ── Levier C — POLITIQUES PERMANENTES (toggles) ──────────────────────────────
 * Tant qu'une politique est active, elle RALENTIT LA MONTÉE de la Rupture
 * (`riseSlow`, ajouté à orderSlow dans tick.js, plafonné en commun à 0.8) contre
 * un COÛT DE PRODUCTION CONTINU et RÉCUPÉRABLE (`cost`, replié dans
 * crisisProductionMultiplier → revient à 1 dès qu'on désactive). C'est le levier
 * le plus SÛR : il n'agit ni sur la valeur ni sur la cible, il ne fait que gagner
 * du temps → il ne peut JAMAIS empêcher l'effondrement quand la cible ≥ 1.0.
 * Nombre de politiques actives borné (POLICY_MAX_ACTIVE) → budget de stabilité.
 *   cost: { global?, food?, gold?, knowledge?, infrastructure? } en fraction [0..1].
 */
export const REGULATION_POLICIES = [
  {
    id: "curfew", label: "Couvre-feu", tier: 1,
    desc: "Les rues se vident à la nuit tombée : la colère monte plus lentement, mais le commerce souffre.",
    riseSlow: 0.25, cost: { global: 0.10 },
    unlock: () => true, unlockLabel: null
  },
  {
    id: "martialLaw", label: "Loi martiale", tier: 2,
    desc: "La garde tient la cité d'une main de fer : la rupture ne progresse plus qu'à peine, au prix d'une économie bridée.",
    riseSlow: 0.45, cost: { global: 0.20 },
    unlock: (c) => c.bestEra >= 2, unlockLabel: "Ère II"
  },
  {
    id: "permanentCouncil", label: "Conseil permanent", tier: 3,
    desc: "Un conseil siège sans relâche et étouffe les tensions naissantes, mobilisant scribes et trésor.",
    riseSlow: 0.35, cost: { knowledge: 0.25, gold: 0.15 },
    unlock: (c) => c.bestEra >= 4, unlockLabel: "Ère IV"
  },
  {
    id: "paxDivina", label: "Pax Divina", tier: 4,
    desc: "La paix des dieux s'étend sur la cité : le temps lui-même semble suspendre la rupture.",
    riseSlow: 0.55, cost: { global: 0.15 },
    unlock: (c) => c.mythCount >= 1, unlockLabel: "1 mythe"
  }
];

export const POLICY_BY_ID = Object.fromEntries(
  REGULATION_POLICIES.map((p) => [p.id, p])
);
