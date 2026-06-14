"use strict";

// Constantes d'équilibrage structurantes du jeu, regroupées et documentées.
// Ne change AUCUNE valeur ici sans intention d'équilibrage : ces nombres
// pilotent les courbes de progression et les seuils d'effondrement.

// Multiplicateur de production tiré des Ruines accumulées :
//   base = 1 + ruins^RUIN_POWER_EXP * RUIN_POWER_COEF
// L'exposant < 1 donne des rendements décroissants (chaque ruine compte moins
// que la précédente) ; le coefficient règle l'ampleur globale du bonus.
export const RUIN_POWER_EXP = 0.62;   // exposant de la courbe du multiplicateur de Ruines
export const RUIN_POWER_COEF = 0.09;  // coefficient associé

// Vitesse à laquelle la jauge de Rupture (instabilité) converge vers sa cible
// à chaque tick : plus la valeur est haute, plus la cité réagit vite.
export const INSTABILITY_DRIFT_SPEED = 0.045; // vitesse de convergence de la Rupture vers sa cible

// Vitesse de base de l'Usure du temps (avant tous les modificateurs).
export const TIME_WEAR_BASE_RATE = 0.00003;   // vitesse de base de l'Usure du temps

// Plafond de la préparation à l'effondrement accumulée (actions terminales) :
// borne le bonus de Ruines obtenu en préparant sa chute.
export const COLLAPSE_PREP_MAX = 2.4; // plafond de préparation à l'effondrement

// Population de référence pour normaliser la profondeur d'ère dans ruinGain().
// C'est l'ancien seuil de la dernière ère ("Singularité civique", 1.5e11),
// figé volontairement : le gain de Ruines ne doit PAS dépendre de la longueur
// de la courbe des ères (l'extension à 35 paliers / 10^35 avait nerfé ~33 %
// l'early game par effet de bord — attrapé par le golden test).
export const RUIN_REFERENCE_POP = 1.5e11;

// Multiplicateur d'institutions tiré de la Légitimité :
//   1 + legitimacy^LEGITIMACY_POWER_EXP * LEGITIMACY_COEF
export const LEGITIMACY_POWER_EXP = 0.7;  // exposant du multiplicateur d'institutions
export const LEGITIMACY_COEF = 0.22;      // coefficient associé

// ── Anti-dégénérescence de la Rupture (rééquilibrage post-simulation) ────────
// Deux dégénérescences mesurées en fin de partie : (1) cité sur-stabilisée
// (actions de crise + Usure gelée) → ineffondrable ; (2) cité sur-puissante →
// Rupture à 100 % en <120 s → effondrement à gain nul. Les constantes ci-dessous
// corrigent les deux sans toucher au cœur des formules.

// Quand la cible de pression dépasse 1, la dérive de la jauge accélère
// proportionnellement au dépassement (plafonné) : une cité dont la pression
// réelle vaut 3× le seuil ne peut plus être tenue indéfiniment par des actions.
export const INSTABILITY_OVERSHOOT_CAP = 3;

// Montée incompressible : la jauge ne peut pas gagner plus de 1 %/s, quelle que
// soit la pression. Garantit un cycle d'au moins ~2-3 minutes, le temps que les
// pics (population) se reconstruisent et que la patience de ruinGain() compte.
export const INSTABILITY_MAX_RISE_PER_SEC = 0.01;

// Rendements décroissants des actions de crise : chaque usage du même type
// multiplie la baisse de Rupture par ce facteur (0.9^n). Tenir la jauge devient
// une stratégie de délai, plus une stratégie d'immortalité.
export const CRISIS_ACTION_DECAY = 0.9;

// ── Coût des actions de régulation : ancré sur la PRODUCTION, pas la population ──
// Ancien défaut : coût ∝ population (croissance lente) alors que les stocks
// suivent la production exponentielle → le coût devenait dérisoire (mesuré
// ~5e-6 du stock en fin de partie : 5e24 trésor pour 9e32 en réserve).
// Nouveau modèle (crisisCosts() dans mechanics.js) : coût = N secondes de
// production COURANTE de la ressource. Choix de design : les stocks ne valent
// qu'~1-2 min de production, donc « N s de prod » est une part réelle de la
// réserve — et devient INPAYABLE si le joueur a tout dépensé. C'est voulu : il
// faut rester attentif et garder une réserve pour pouvoir réguler, plutôt que
// de tout claquer dès que possible. Reste sensible à toutes les échelles.
// N (secondes de production) par action — les actions à fort effet coûtent +.
export const CRISIS_COST_SECONDS = {
  rationing: 25,
  festivals: 30,
  census: 40,
  reformsGold: 45,
  reformsKnowledge: 45,
  archiveCrisis: 32,
  ancestorCrisis: 42
};
// Escalade par usage cumulé d'actions dans le cycle : coût ×(1 + n·k).
export const CRISIS_COST_ACTION_GROWTH = 0.08;

// ── Relief temporaire par foyer (Étape 2) — « jonglage » entre les 4 foyers ──
// Chaque action de régulation calme SON foyer (et fait descendre SA barre), puis
// l'apaisement DÉCLINE (demi-vie ci-dessous) : il faut ré-intervenir, on ne
// matraque plus un seul bouton. Le relief est MULTIPLICATIF (réduit le foyer
// d'un %), plafonné < 1 : un foyer garde toujours une part irréductible → tenir
// la jauge reste un délai, jamais une immortalité (anti-effondrement à gain nul).
export const FOYER_RELIEF_HALF_LIFE_S = 30;  // demi-vie du déclin (s)
// Plafond du relief par foyer. Mesuré : à 0.6, maxer les 4 foyers ramène la
// cible late-game sous 1.0 (≈0.82) → la jauge se stabilise et n'atteint plus
// jamais 100 % (immortalité via Rupture, contre l'intention « délai »). À 0.45
// la cible max reste ≥ ~1.0 : on temporise fort, sans figer la jauge. Valeur de
// départ — affinée par simulation à l'Étape 5.
export const FOYER_RELIEF_CAP = 0.45;        // un foyer ne descend jamais sous 55 % de sa valeur
// Part d'apaisement ajoutée par clic (cumulée vers le plafond) — actions fortes +.
export const FOYER_RELIEF_ADD = {
  rationing: 0.18,      // → Subsistance (scarcity)
  festivals: 0.20,      // → Inégalités (inequality)
  census: 0.16,         // → Complexité (complexity)
  reforms: 0.28,        // → Complexité (action forte)
  archiveCrisis: 0.16,  // → Dissidence (dissent)
  ancestorCrisis: 0.24  // → Dissidence (action forte)
};
// Coup instantané sur la jauge globale, pour la réactivité du clic (la dérive
// vers la cible n'est que ~1.3 %/s) : nudge = FOYER_RELIEF_ADD[id] × ce facteur.
// Le gros de l'effet, lui, vient du relief de foyer décroissant ci-dessus.
export const FOYER_RELIEF_INSTANT_FACTOR = 0.4;

// ── Contrepartie de production (Étape 3) — le « sacrifice ressenti » ──
// Chaque action impose un malus de production TEMPORAIRE (jusqu'au prochain
// effondrement, comme les événements de crise), via addProductionPenalty :
// multiplicatif, cumulatif, plancher 0.1 (max 90 % de malus). But : chaque clic
// se paie dans les taux à l'écran → réguler n'est plus gratuit, et sur-réguler
// crève l'économie du cycle. La ressource pénalisée diffère (en partie) de celle
// que le foyer calme, pour créer un arbitrage.
export const FOYER_MALUS_RESOURCE = {
  rationing: "food",          // on se serre la ceinture
  festivals: "gold",          // le trésor finance les jeux
  census: "knowledge",        // les scribes sont mobilisés
  reforms: "gold",            // des réformes coûteuses à appliquer
  archiveCrisis: "knowledge", // les archivistes sont accaparés
  ancestorCrisis: "food"      // offrandes et festins rituels
};
export const FOYER_MALUS_PCT = {
  rationing: 0.10,
  festivals: 0.10,
  census: 0.10,
  reforms: 0.15,
  archiveCrisis: 0.10,
  ancestorCrisis: 0.13
};

// ── Réforme de fond (recul DURABLE des foyers) — la couche « gestion de crise »
// la plus impactante quand on la joue bien ──────────────────────────────────
// Problème résolu : l'apaisement (FOYER_RELIEF_*) DÉCLINE → « ça revient
// toujours », jamais de terrain gagné. La réforme dépose un recul PERMANENT
// (sur le run, remis à zéro à l'effondrement) sur SON foyer, contre un coût
// LOURD (≈5× l'apaisement, payé surtout en trésor/savoir).
//
// Garde-fou anti-immortalité (mesuré, cf. measure-foyers.js) : réforme et
// apaisement PARTAGENT le plafond FOYER_RELIEF_CAP (la réduction combinée d'un
// foyer ne dépasse jamais 0.45). À ce plafond la cible late maxée reste ~1.016
// ≥ 1.0 → l'effondrement reste garanti. La réforme n'augmente donc PAS le
// plafond : elle rend le recul DURABLE (et tenable sur les 4 foyers à la fois,
// ce que le clic décroissant ne permet pas) → c'est là qu'est l'impact réel.
// `add` = part déposée par clic (cumulée vers le plafond commun) ;
// `seconds` = coût en secondes de production courante (cf. crisisCosts) ;
// `resource` = ressource ponctionnée (trésor/savoir = « réduction du trésor »).
export const FOYER_REFORM = {
  scarcity:   { add: 0.15, seconds: 140, resource: 'food',      label: "Réserve d'État" },
  inequality: { add: 0.15, seconds: 160, resource: 'gold',      label: 'Charte des communs' },
  complexity: { add: 0.15, seconds: 180, resource: 'knowledge', label: 'Grand cadastre' },
  dissent:    { add: 0.15, seconds: 160, resource: 'gold',      label: "Panthéon d'État" }
};
// id d'action de réforme → foyer ciblé (miroir de ACTION_FOYER pour l'apaisement).
export const REFORM_ACTION_FOYER = {
  reformScarcity: 'scarcity',
  reformInequality: 'inequality',
  reformComplexity: 'complexity',
  reformDissent: 'dissent'
};

// Cooldown des actions automatiques de protocoles_urgence : l'automation ne
// doit pas pouvoir verrouiller la jauge sous le seuil de crise à elle seule.
export const AUTO_CRISIS_COOLDOWN_MS = 60_000;

// Levier C — nombre maximum de politiques permanentes actives simultanément
// (budget de stabilité : on choisit quelles tensions l'économie peut soutenir).
export const POLICY_MAX_ACTIVE = 2;

// Plafond de la mitigation d'Usure (infra/savoir/légitimité). Non bornée, elle
// gelait l'Usure en fin de partie (taux mesuré ~0.002) : l'Usure redevient une
// deadline garantie — toute civilisation finit par tomber par le temps.
export const TIME_WEAR_MITIGATION_CAP = 8;

// Plancher du gain de Ruines basé sur l'ÉCHELLE (pic de population), pas
// seulement l'âge du cycle : floor(log10(peakPop)/DIV). Une cité d'un million
// d'habitants qui tombe en 90 s n'a pas « rien construit ».
export const RUIN_GAIN_SCALE_FLOOR_LOG_DIV = 4;

// Grâce de fondation : portée étendue (65 → 80 bâtiments) mais décroissance
// quadratique — sortie progressive au lieu d'un mur binaire.
export const FOUNDING_GRACE_BUILDINGS = 80;

// ── « Impression d'évoluer » (rééquilibrage cadence des jalons) ──────────────
// Mesure de référence (simulation) : désert sans jalon de 14 min à 1j15h, puis
// GR1→GR10 en 1j14h et 1820 dynasties spammées. Objectifs : un jalon visible
// toutes les ~30-60 min, des boucles de prestige à coût croissant, pas de spam.

// Profondeur de population dans ruinGain() : référence abaissée et exposant
// relevé pour que l'arbre de ruines ne stagne plus pendant des centaines de
// cycles en début de partie (revenu mesuré : 2-5 ruines/cycle face à des nœuds
// à 110-840).
export const RUIN_POP_DEPTH_REF = 15000;  // population de référence (ancien : 25000)
export const RUIN_POP_DEPTH_EXP = 0.45;   // exposant (ancien : 0.42)

// Fondation de dynastie : seuil d'entrée abaissé (visible dès ~8-12 h de jeu au
// lieu de 1j15h) mais croissant à chaque fondation depuis le dernier Grand Reset
// (× growth^n) — les premières dynasties d'une boucle restent un rituel
// accessible, le spam (1820 fondations mesurées) devient impossible.
export const DYNASTY_BASE_RUINS = 120;    // seuil de ruines de la 1re fondation (ancien : 300 fixe)
export const DYNASTY_COST_GROWTH = 1.4;   // multiplicateur du seuil par fondation depuis le dernier GR

// Grand Reset à coût croissant : le 1er est payé par l'upgrade « grand_reset »,
// chaque suivant consomme BASE × 2^(n-1) légitimité (GR2 : 600, GR3 : 1200…).
// La récompense double à chaque GR, le coût doit suivre — sinon les 10 GR
// tombent en 1j14h (mesuré) et cessent d'être ressentis comme des sommets.
export const GRAND_RESET_LEGIT_BASE = 300;

// Gating doux des Grand Resets par les Mythes : à partir de MYTH_GATE_START_GR,
// chaque GR exige un Mythe complété de plus (GR3 : 1, GR4 : 2, … GR10 : 8).
// Les Mythes deviennent les chapitres de la route principale au lieu d'un
// contenu optionnel contournable (le bot a atteint GR10 avec 1 seul Mythe).
export const MYTH_GATE_START_GR = 3;

// Récompense de la « rafale d'ères » post-GR : chaque palier d'ère maximale
// jamais atteint ajoute un bonus PLAT de ruines à chaque effondrement. La
// retraversée express des ères devient une pluie de gains visibles.
export const ERA_RUIN_BONUS_PER_INDEX = 1;

// ── Rupture : l'infrastructure jugée en RATIO, plafonds doux ─────────────────
// Problème mesuré : l'infra n'agissait que via log10(infra×0.018)×0.22 plafonné
// à 0.75 → effet nul au-delà de ~1e5 d'infra, et les sources saturaient en
// plafonds durs → en fin de partie AUCUN achat ne bougeait la jauge. La recette
// qui marche à toutes les échelles est celle de la nourriture : un RATIO.

// Couverture d'infrastructure : infra / max(MIN_BASE, pop×POP_F + bâtiments×BLD_F).
// ≈1 quand la cité est bien équipée pour sa taille — discriminant de l'an 0 à la
// Singularité, c'est le cœur du rééquilibrage.
export const INFRA_COVERAGE_POP_FACTOR = 0.012;
export const INFRA_COVERAGE_BUILDING_FACTOR = 1.5;
export const INFRA_COVERAGE_MIN_BASE = 30;

// Couverture EFFECTIVE plafonnée en doux (cap·x/(x+cap)) : le stock d'infra
// n'est jamais consommé, donc sur un long cycle il dépasse mécaniquement la
// demande (couverture 16 mesurée → Rupture morte). L'infra aide jusqu'à « bien
// équipée ×3 », l'accumulation passive ne trivialise plus la jauge.
export const INFRA_COVERAGE_EFFECTIVE_CAP = 3;

// Mitigation : log10(1 + couvertureEff×MULT + légitimité×0.16) × COEF, plafond
// relevé (0.75 → 1.1). Relever le plafond ne recrée pas la cité ineffondrable :
// l'Usure (mitigation plafonnée ×8) reste la deadline garantie. Rupture = jauge
// pilotée par les choix du joueur ; Usure = horloge inévitable.
export const INFRA_COVERAGE_MITIGATION_MULT = 6;
export const MITIGATION_LOG_COEF = 0.30;
export const MITIGATION_CAP = 1.1;

// Amortissement de la charge structurelle par la couverture : structural est
// divisé par (1 + couvertureEff×DAMP) — réduction max ~×2.5, pas l'annulation.
export const STRUCTURAL_COVERAGE_DAMP = 0.5;

// Bâtiments stabilisants (égouts, tribunaux… instabilité négative) : prise
// DIRECTE sur la charge structurelle, au lieu d'être compressés dans le log de
// mitigation. Facteur ×6 : leurs valeurs nominales (-0.003…-0.01) sont petites
// face à la masse d'instabilité positive accumulée (l'ancien système les
// multipliait ×12 dans le log) — assez investir en ordre civil peut annuler la
// charge structurelle, les autres sources de pression restent.
export const STABILIZER_DIRECT_FACTOR = 6;

// Complexity : le dénominateur 26 devient 26 × (1 + couvertureEff×ABSORB) — une
// cité bien équipée digère sa taille administrative (absorption max ~×2.5).
export const COMPLEXITY_COVERAGE_ABSORB = 0.5;
