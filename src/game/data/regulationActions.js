"use strict";

import { localizeData } from '../core/i18n.js';

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
    label: { fr: "Greniers communaux", en: "Communal Granaries" },
    note: { fr: "Des greniers de quartier sont ouverts à tous : nul ne dort le ventre vide, et la peur de manquer reflue.", en: "District granaries are opened to all: none sleep on an empty stomach, and the fear of want recedes." },
    unlock: (c) => c.bestEra >= 2, unlockLabel: { fr: "Ère II", en: "Era II" },
    cost: { res: "food", seconds: 35 },
    relief: 0.22, malusRes: "food", malusPct: 0.10, counter: "rationing"
  },
  {
    id: "royalIrrigation", foyer: "scarcity", tier: 4, kind: "soothe",
    label: { fr: "Irrigation royale", en: "Royal Irrigation" },
    note: { fr: "De grands canaux d'irrigation sont creusés : les champs verdissent et l'ouvrage profite à toute la cité.", en: "Great irrigation canals are dug: the fields turn green and the work benefits the whole city." },
    unlock: (c) => c.bestEra >= 4, unlockLabel: { fr: "Ère IV", en: "Era IV" },
    cost: { res: "food", seconds: 55 },
    relief: 0.14, counter: "rationing", infraAdd: 0.10
  },
  {
    id: "cornucopia", foyer: "scarcity", tier: 5, kind: "reform",
    label: { fr: "Corne d'abondance", en: "Cornucopia" },
    note: { fr: "Un système de réserves perpétuelles est institué : la disette devient un souvenir, et nos ouvrages perdurent.", en: "A system of perpetual reserves is established: famine becomes a memory, and our works endure." },
    unlock: (c) => c.mythCount >= 1, unlockLabel: { fr: "1 mythe", en: "1 myth" },
    cost: { res: "food", seconds: 150 },
    reformAdd: 0.18, infraAdd: 0.12
  },

  // ─── ⚖️ Inégalités (inequality) ─────────────────────────────────────────────
  {
    id: "sumptuaryLaws", foyer: "inequality", tier: 3, kind: "soothe",
    label: { fr: "Lois somptuaires", en: "Sumptuary Laws" },
    note: { fr: "Le faste des puissants est bridé par décret : l'étalage des fortunes cesse, la rue se sent moins méprisée.", en: "The pomp of the powerful is curbed by decree: the display of fortunes ceases, and the street feels less scorned." },
    unlock: (c) => c.bestEra >= 2, unlockLabel: { fr: "Ère II", en: "Era II" },
    cost: { res: "gold", seconds: 40 },
    relief: 0.24, malusRes: "gold", malusPct: 0.12, counter: "festivals"
  },
  {
    id: "stateMecenat", foyer: "inequality", tier: 4, kind: "soothe",
    label: { fr: "Mécénat d'État", en: "State Patronage" },
    note: { fr: "Les grandes maisons financent des travaux publics pour graver leur nom : leur or sert enfin la cité.", en: "The great houses fund public works to engrave their name: their gold finally serves the city." },
    unlock: (c) => c.bestEra >= 4, unlockLabel: { fr: "Ère IV", en: "Era IV" },
    cost: { res: "gold", seconds: 60 },
    relief: 0.16, counter: "festivals", infraAdd: 0.12
  },
  {
    id: "evergetism", foyer: "inequality", tier: 5, kind: "reform",
    label: { fr: "Évergétisme", en: "Euergetism" },
    note: { fr: "Le devoir de générosité des riches devient loi sacrée : le partage s'institutionnalise pour de bon.", en: "The duty of generosity of the rich becomes sacred law: sharing is institutionalized for good." },
    unlock: (c) => c.mythCount >= 1, unlockLabel: { fr: "1 mythe", en: "1 myth" },
    cost: { res: "gold", seconds: 150 },
    reformAdd: 0.18, legitAdd: 0.5
  },

  // ─── 🏛️ Complexité (complexity) ─────────────────────────────────────────────
  {
    // LEVIER B — convertit le trésor en infrastructure (l'outil anti-rupture le
    // plus sain : l'infra porte la charge structurelle et absorbe la complexité).
    id: "publicWorks", foyer: "complexity", tier: 4, kind: "soothe",
    label: { fr: "Travaux publics", en: "Public Works" },
    note: { fr: "Le trésor public finance routes, aqueducs et halles : la cité se dote des ouvrages qui la rendent gouvernable.", en: "The public treasury funds roads, aqueducs and markets: the city builds the works that make it governable." },
    unlock: (c) => c.bestEra >= 3, unlockLabel: { fr: "Ère III", en: "Era III" },
    cost: { res: "gold", seconds: 60 },
    relief: 0.10, counter: "reforms", infraAdd: 0.30
  },
  {
    id: "celestialChancery", foyer: "complexity", tier: 5, kind: "reform",
    label: { fr: "Chancellerie céleste", en: "Celestial Chancery" },
    note: { fr: "Une administration parfaite, calquée sur l'ordre des astres, est gravée dans le bronze : la cité ne s'égare plus dans sa propre taille.", en: "A perfect administration, modeled on the order of the stars, is engraved in bronze: the city no longer loses itself in its own size." },
    unlock: (c) => c.mythCount >= 1, unlockLabel: { fr: "1 mythe", en: "1 myth" },
    cost: { res: "knowledge", seconds: 160 },
    reformAdd: 0.18, infraAdd: 0.15
  },

  // ─── 📜 Dissidence (dissent) ────────────────────────────────────────────────
  {
    id: "monumentalFetes", foyer: "dissent", tier: 4, kind: "soothe",
    label: { fr: "Fêtes monumentales", en: "Monumental Festivals" },
    note: { fr: "De somptueuses fêtes publiques scellent l'unité du peuple sous les bannières de la dynastie.", en: "Lavish public festivals seal the unity of the people under the banners of the dynasty." },
    unlock: (c) => c.bestEra >= 3, unlockLabel: { fr: "Ère III", en: "Era III" },
    cost: { res: "gold", seconds: 45 },
    relief: 0.20, malusRes: "gold", malusPct: 0.12, counter: "festivals"
  },
  {
    id: "stateOracle", foyer: "dissent", tier: 5, kind: "reform",
    label: { fr: "Oracle d'État", en: "State Oracle" },
    note: { fr: "Un oracle officiel donne un sens commun à chaque épreuve : la mémoire et la foi du peuple s'unissent durablement.", en: "An official oracle gives a shared meaning to every ordeal: the memory and faith of the people unite for good." },
    unlock: (c) => c.mythCount >= 1, unlockLabel: { fr: "1 mythe", en: "1 myth" },
    cost: { res: "knowledge", seconds: 150 },
    reformAdd: 0.18, legitAdd: 0.5
  },

  // ─── 🎲 PARIS (kind: gamble) — gros apaisement OU retour de bâton ────────────
  // `p` = proba de succès ; `relief` = apaisement si succès ; `failInstability` =
  // hausse de Rupture si échec. Pas cher : un style de jeu « joueur » vs prudent.
  {
    id: "prayForRain", foyer: "scarcity", tier: 3, kind: "gamble",
    label: { fr: "Prière pour la pluie", en: "Prayer for Rain" },
    note: { fr: "On implore le ciel pour les récoltes.", en: "The sky is implored for the harvests." },
    noteWin: { fr: "Les pluies viennent : les champs reverdissent et la faim recule d'un coup.", en: "The rains come: the fields turn green again and hunger recedes at once." },
    noteFail: { fr: "Le ciel reste muet ; la sécheresse persiste et la colère enfle.", en: "The sky stays silent; the drought persists and anger swells." },
    unlock: (c) => c.bestEra >= 2, unlockLabel: { fr: "Ère II", en: "Era II" },
    cost: { res: "food", seconds: 28 },
    p: 0.55, relief: 0.30, failInstability: 0.05, counter: "rationing"
  },
  {
    id: "publicLottery", foyer: "inequality", tier: 3, kind: "gamble",
    label: { fr: "Loterie publique", en: "Public Lottery" },
    note: { fr: "Une grande loterie est organisée pour redistribuer le hasard.", en: "A grand lottery is held to redistribute chance." },
    noteWin: { fr: "La loterie enflamme la cité : chacun rêve, l'envie des riches s'efface un temps.", en: "The lottery sets the city ablaze: everyone dreams, and envy of the rich fades for a time." },
    noteFail: { fr: "La loterie tourne au scandale de favoritisme : la rancœur redouble.", en: "The lottery turns into a scandal of favoritism: resentment redoubles." },
    unlock: (c) => c.bestEra >= 3, unlockLabel: { fr: "Ère III", en: "Era III" },
    cost: { res: "gold", seconds: 30 },
    p: 0.55, relief: 0.26, failInstability: 0.05, counter: "festivals"
  },
  {
    id: "scapegoat", foyer: "dissent", tier: 3, kind: "gamble",
    label: { fr: "Bouc émissaire", en: "Scapegoat" },
    note: { fr: "On désigne un coupable aux malheurs de la cité.", en: "A culprit is named for the city's misfortunes." },
    noteWin: { fr: "La foule tient son coupable : la colère se déverse ailleurs et l'unité revient.", en: "The crowd has its culprit: anger pours out elsewhere and unity returns." },
    noteFail: { fr: "L'accusation se retourne contre le pouvoir : la défiance grandit.", en: "The accusation turns against the rulers: distrust grows." },
    unlock: (c) => c.bestEra >= 2, unlockLabel: { fr: "Ère II", en: "Era II" },
    cost: { res: "gold", seconds: 32 },
    p: 0.60, relief: 0.28, failInstability: 0.06, counter: "festivals"
  }
];

export const REGULATION_ACTIONS_BY_ID = Object.fromEntries(
  REGULATION_ACTIONS.map((a) => [a.id, a])
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
 * Effets possibles (cumulables) — tous ne font que GAGNER DU TEMPS, jamais empêcher
 * l'effondrement (cible ≥ 1.0 le force toujours) :
 *   riseSlow      : ralentit la montée de la jauge (plafond commun 0.8).
 *   overshootDamp : atténue la SURCHARGE (accélération quand la cible dépasse 100 %).
 *   foyerDamp     : { foyer: part } étouffe un foyer EN CONTINU (sous le plafond partagé).
 */
export const REGULATION_POLICIES = [
  {
    id: "curfew", label: { fr: "Couvre-feu", en: "Curfew" }, tier: 1,
    desc: { fr: "Les rues se vident à la nuit tombée : la colère monte plus lentement, mais le commerce souffre.", en: "The streets empty at nightfall: anger rises more slowly, but trade suffers." },
    riseSlow: 0.25, cost: { global: 0.10 },
    unlock: () => true, unlockLabel: null
  },
  {
    id: "martialLaw", label: { fr: "Loi martiale", en: "Martial Law" }, tier: 2,
    desc: { fr: "La garde tient la cité d'une main de fer : la rupture ne progresse plus qu'à peine, au prix d'une économie bridée.", en: "The guard holds the city with an iron hand: Rupture barely advances, at the cost of a stifled economy." },
    riseSlow: 0.45, cost: { global: 0.20 },
    unlock: (c) => c.bestEra >= 2, unlockLabel: { fr: "Ère II", en: "Era II" }
  },
  {
    id: "permanentCouncil", label: { fr: "Conseil permanent", en: "Permanent Council" }, tier: 3,
    desc: { fr: "Un conseil siège sans relâche et étouffe les tensions naissantes, mobilisant scribes et trésor.", en: "A council sits tirelessly and smothers nascent tensions, drawing on scribes and treasury." },
    riseSlow: 0.35, cost: { knowledge: 0.25, gold: 0.15 },
    unlock: (c) => c.bestEra >= 4, unlockLabel: { fr: "Ère IV", en: "Era IV" }
  },
  {
    id: "paxDivina", label: { fr: "Pax Divina", en: "Pax Divina" }, tier: 4,
    desc: { fr: "La paix des dieux s'étend sur la cité : le temps lui-même semble suspendre la rupture.", en: "The peace of the gods spreads over the city: time itself seems to suspend Rupture." },
    riseSlow: 0.55, cost: { global: 0.15 },
    unlock: (c) => c.mythCount >= 1, unlockLabel: { fr: "1 mythe", en: "1 myth" }
  },
  {
    id: "crisisDiplomacy", label: { fr: "Diplomatie de crise", en: "Crisis Diplomacy" }, tier: 3,
    desc: { fr: "Une chancellerie désamorce les emballements : même très au-dessus du seuil, la rupture s'emballe moins vite. Mobilise les scribes.", en: "A chancery defuses runaway crises: even far above the threshold, Rupture spirals more slowly. Draws on the scribes." },
    overshootDamp: 0.5, cost: { knowledge: 0.20 },
    unlock: (c) => c.bestEra >= 4, unlockLabel: { fr: "Ère IV", en: "Era IV" }
  },
  {
    id: "neighborhoodMilitia", label: { fr: "Milice de quartier", en: "Neighborhood Militia" }, tier: 3,
    desc: { fr: "Des milices locales étouffent la fronde en continu, tant qu'on les finance et les nourrit.", en: "Local militias smother dissent continuously, as long as they are funded and fed." },
    foyerDamp: { dissent: 0.20 }, cost: { gold: 0.12, food: 0.08 },
    unlock: (c) => c.bestEra >= 3, unlockLabel: { fr: "Ère III", en: "Era III" }
  }
];

export const POLICY_BY_ID = Object.fromEntries(
  REGULATION_POLICIES.map((p) => [p.id, p])
);

// Aplatit les feuilles { fr, en } en chaînes (cf. i18n.js). Les maps _BY_ID
// partagent les mêmes références d'objets → résoudre les tableaux les résout.
localizeData(REGULATION_ACTIONS);
localizeData(REGULATION_POLICIES);
