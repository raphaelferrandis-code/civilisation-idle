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
// Relevée (0.00003 → 0.000045, ×1.5) pour rendre l'effondrement par le TEMPS
// plus inexorable, et compenser la baisse de pression liée au ré-ancrage du
// trésor (le temps devient le moteur garanti de la chute).
export const TIME_WEAR_BASE_RATE = 0.000045;  // vitesse de base de l'Usure du temps

// Plafond de la préparation à l'effondrement accumulée (actions terminales) :
// borne le bonus de Ruines obtenu en préparant sa chute.
export const COLLAPSE_PREP_MAX = 2.4; // plafond de préparation à l'effondrement

// Multiplicateur de production & de Ruines gagné à chaque Grand Reset : base^count.
// SOURCE DE VÉRITÉ unique — lue par grandResetMultiplier (production),
// grandResetRuinMultiplier (prestige) ET tous les libellés/dialogues d'UI, pour
// qu'un rééquilibrage de la base ne fasse jamais mentir l'affichage (les 6+ sites
// recopiaient `Math.pow(2, count)` à la main). NB : ne comprend PAS la garde
// mythe_du_chaos ni le bonus Ragnarök — ceux-ci restent locaux à leur contexte.
export const GRAND_RESET_PROD_BASE = 2;
export const grandResetProductionMult = (count) =>
  Math.pow(GRAND_RESET_PROD_BASE, Math.max(0, count || 0));

// Population de référence pour normaliser la profondeur d'ère dans ruinGain().
// C'est l'ancien seuil de la dernière ère ("Singularité civique", 1.5e11),
// figé volontairement : le gain de Ruines ne doit PAS dépendre de la longueur
// de la courbe des ères (l'extension à 35 paliers / 10^35 avait nerfé ~33 %
// l'early game par effet de bord — attrapé par le golden test).
export const RUIN_REFERENCE_POP = 1.5e11;

// ── Anti-dégénérescence de la Rupture (rééquilibrage post-simulation) ────────
// Deux dégénérescences mesurées en fin de partie : (1) cité sur-stabilisée
// (actions de crise + Usure gelée) → ineffondrable ; (2) cité sur-puissante →
// Rupture à 100 % en <120 s → effondrement à gain nul. Les constantes ci-dessous
// corrigent les deux sans toucher au cœur des formules.

// Quand la cible de pression dépasse 1, la dérive de la jauge accélère
// proportionnellement au dépassement (plafonné) : une cité dont la pression
// réelle vaut 3× le seuil ne peut plus être tenue indéfiniment par des actions.
export const INSTABILITY_OVERSHOOT_CAP = 3;

// Montée incompressible : la jauge ne peut pas gagner plus de 0,6 %/s, quelle que
// soit la pression. Garantit qu'une cité NON gérée respire (cycle plancher ~167 s
// au lieu de 100 s) le temps que les pics se reconstruisent. Baissé (0.01 → 0.006)
// dans le rework « cadence late-game » : la Rupture devient une jauge maîtrisable
// (l'Usure porte désormais l'anti-immortalité), donc ce plafond n'a plus à imposer
// un métronome serré — il ne borne que la chute d'une cité laissée à l'abandon.
export const INSTABILITY_MAX_RISE_PER_SEC = 0.006;

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
export const FOYER_RELIEF_CAP = 0.45;        // plafond de l'APAISEMENT temporaire (déclinant)
// Plafond du recul DURABLE (réformes de fond). Découplé de l'apaisement temporaire
// (rework cadence late-game) : maintenant que l'USURE porte l'anti-immortalité,
// une cité PLEINEMENT réformée peut ramener ses foyers bien plus bas (0.72 vs 0.45)
// → cible sous 1.0 atteignable avec les bons réglages → coast sur l'horloge d'Usure.
// L'apaisement temporaire reste borné à FOYER_RELIEF_CAP ; c'est la réforme (coût
// lourd, choix durable) qui débloque le recul profond. Combiné (relief+réforme+
// politique) plafonné à cette valeur dans pressureBreakdown().
export const FOYER_REFORM_CAP = 0.72;
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
  scarcity:   { add: 0.15, seconds: 140, resource: 'food',      label: { fr: "Réserve d'État", en: 'State Reserve' } },
  inequality: { add: 0.15, seconds: 160, resource: 'gold',      label: { fr: 'Charte des communs', en: 'Charter of the Commons' } },
  complexity: { add: 0.15, seconds: 180, resource: 'knowledge', label: { fr: 'Grand cadastre', en: 'Great Cadastre' } },
  dissent:    { add: 0.15, seconds: 160, resource: 'gold',      label: { fr: "Panthéon d'État", en: 'State Pantheon' } }
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

// ── Fatigue de régulation (anti-matraquage) ──────────────────────────────────
// Chaque action de régulation (apaisement/réforme/pari) monte une fatigue
// globale [0..1] qui (a) réduit l'EFFICACITÉ des actions et (b) augmente leur
// COÛT, puis redescend avec le temps. Le jeu optimal devient « intervenir au bon
// moment » plutôt que « spammer ». Généralisation lisible de l'ancien
// CRISIS_ACTION_DECAY (jamais branché en code). Ne peut que RÉDUIRE l'effet des
// actions → aucun risque côté anti-immortalité.
export const FATIGUE_PER_ACTION = 0.14;     // hausse de fatigue par action
export const FATIGUE_EFFECT_PENALTY = 0.5;  // à fatigue 100 % : efficacité −50 %
export const FATIGUE_COST_PENALTY = 1.0;    // à fatigue 100 % : coût ×2
export const FATIGUE_HALF_LIFE_S = 18;      // demi-vie de décroissance (s)

// ── Clémence des augures (pitié sur série noire) ─────────────────────────────
// Chaque pari PERDU d'une même table augmente la chance du prochain (streak de
// revers consécutifs), remise à zéro au premier gain. Rend le risque GÉRABLE
// (pseudo-pité) sans le supprimer : p reste bornée < 1. NB : « Clémence » est
// distincte de la FAVEUR (la monnaie gagnée aux jeux, cf. FAVEUR_* plus bas).
// L'historique des 5 derniers jets (state.gambleHistory) est reset au cycle.
export const CLEMENCY_PER_LOSS = 0.05; // +5 pts de chance par revers consécutif
export const GAMBLE_P_MAX = 0.9;       // plafond dur : un pari reste un pari
export const GAMBLE_HISTORY_LEN = 5;   // jets mémorisés par table (affichage)
// Odds RÉDUITS en early game (arbitrage Raph) : la proba de base des paris est
// mise à l'échelle par ce facteur — on remonte ensuite via les boosters
// permanents achetés en Faveur (dés-reliques, ailes d'Icare). Seam booster :
// state.oddsBoost s'ajoute par-dessus (0 tant que la boutique n'existe pas).
export const GAMBLE_ODDS_SCALE = 0.5;  // 55 % → ~28 % de base au départ (très lent early)
// Second jet (« quitte ou double ») : chance FIXE — la Clémence ne joue pas
// (les dieux se lassent) et il ne s'inscrit pas dans l'historique des jets.
export const AUGURY_DOUBLE_P = 0.5;

// ── Table des prises des osselets (5 issues) ─────────────────────────────────
// Le tirage n'est pas binaire : la masse GAGNANTE (p effective) se répartit
// Vénus/Triple/Paire, la masse PERDANTE en Creux/Chien. Lecture des os
// (1·3·4·6, les AS sont funestes) : quatre différentes = Vénus, triple haut =
// grand présage, paire haute = présage, paire d'as = creux, quatre as = le Chien.
export const AUGURY_TIER_SHARES = { venus: 0.15, triple: 0.25 }; // parts de la masse gagnante (reste = paire)
export const AUGURY_HOLLOW_SHARE = 0.6; // part de la masse perdante en creux (reste = Chien)
export const AUGURY_DOG_CLEMENCY_CRANS = 2; // pitié : un Chien compte double dans la Clémence

// ── FAVEUR — la monnaie des jeux (arbitrage Raph : jeux DÉCOUPLÉS) ────────────
// Les paris ne calment plus la Rupture : leur GAIN est de la FAVEUR, monnaie
// méta dépensée (à venir) en Bénédictions temporaires et boosters d'odds
// permanents. Persiste aux effondrements (comme les ruines), effacée au GR.
// Osselets : Faveur par ISSUE, les gains ×costMult du rite (grosse mise = gros
// gain) ; la consolation (creux/chien) est PLATE (perdre gros ne « rapporte »
// pas). Le Chien donne un peu plus que le creux (les dieux notent la souffrance).
export const AUGURY_FAVEUR = { venus: 20, triple: 8, pair: 3, hollow: 1, dog: 2 };
// Icare : Faveur au retrait = secondes de mise × multiplicateur × K (la mise
// reste en OR — le puits — mais le GAIN est de la Faveur).
export const ICARUS_FAVEUR_K = 0.15;
// Cagnotte du temple, désormais EN FAVEUR : nourrie par les vols brûlés (part
// de la mise) et les revers d'osselets, raflée en se posant à ×JACKPOT.
export const ICARUS_POT_FEED = 0.6;          // Faveur/seconde de mise versée à la cagnotte sur un vol brûlé
export const AUGURY_POT_FEED_HOLLOW = 0.5;   // Faveur/seconde de mise versée sur un jet creux
export const AUGURY_POT_FEED_DOG = 1.2;      // …et sur le Chien (revers plus lourd → plus de cagnotte)
export const ICARUS_POT_CAP_FAVEUR = 5000;   // plafond de la cagnotte (Faveur)
// Coup de Vénus : le temple offre un vol d'Icare (mise « Plume », en attente).
export const ICARUS_FREE_FLIGHTS_MAX = 5;

// ── Boutique de Faveur (couche 2 : dépenser la Faveur) ───────────────────────
// Dés pipés — boost PERMANENT des chances aux osselets (+STEP par niveau,
// plafonné). Justifie les odds volontairement bas en early game. AUGMENT
// ÉTERNEL : survit aux effondrements ET au Grand Reset (cf. GR_PERSISTENT_FIELDS).
// La Faveur (le carburant), elle, se re-gagne au GR. Coût croissant.
export const DICE_BOOST_STEP = 0.02;      // +2 pts d'odds par dé
export const DICE_BOOST_MAX_LEVEL = 10;   // jusqu'à +20 pts
export const DICE_COST_BASE = 40;         // Faveur pour le 1er dé
export const DICE_COST_GROWTH = 1.6;      // coût ×1.6 par niveau
// Ailes cirées — abaisse PERMANENT l'edge du Vol d'Icare (−STEP par niveau,
// plancher ICARUS_EDGE_FLOOR).
export const WING_STEP = 0.023;           // −2.3 pts d'edge par aile
export const WING_MAX_LEVEL = 6;          // edge 18 % → ~4 % (plancher) au max
export const ICARUS_EDGE_FLOOR = 0.04;    // edge minimal atteignable
export const WING_COST_BASE = 60;
export const WING_COST_GROWTH = 1.7;
// Bénédiction — bonus TEMPORAIRE de production (multiplicateur GLOBAL, N s) :
// le pont vers le cœur du jeu. Re-jouable (coût fixe), effet temporaire remis à
// zéro à l'effondrement.
export const BLESSING_MULT = 1.5;         // +50 % de production
export const BLESSING_DURATION_S = 180;   // 3 minutes
export const BLESSING_COST = 45;          // Faveur par bénédiction

// ── Le Vol d'Icare (crash game du temple) ────────────────────────────────────
// Un multiplicateur grimpe en continu (m = e^(K·t)) ; le soleil frappe à un
// point tiré à l'envol : C = (1-EDGE)/U, U~uniforme — donc encaisser à une
// cible m réussit avec p = (1-EDGE)/m. EDGE volontairement ÉLEVÉ en early game
// (arbitrage Raph : odds bas au départ) — abaissé plus tard par les ailes
// d'Icare (booster). La mise reste en OR (le puits) ; le GAIN est de la FAVEUR.
// Se poser à ×JACKPOT rafle la cagnotte du temple (en Faveur).
export const ICARUS_EDGE = 0.18;            // part de la maison (très bas odds early ; abaissée par les ailes cirées, booster)
export const ICARUS_CAP = 100;              // multiplicateur maximal (~33 s de vol)
export const ICARUS_K = Math.LN2 / 5;       // ×2 à 5 s, ×10 à ~16,6 s, ×100 à ~33 s
export const ICARUS_JACKPOT_MULT = 10;      // se poser à ×10+ rafle la cagnotte
export const ICARUS_HISTORY_LEN = 12;       // derniers points de crash affichés
export const ICARUS_STAKES = [              // mises en SECONDES de production d'or
  { id: "plume", seconds: 30, floor: 50, label: { fr: "Plume", en: "Feather" } },
  { id: "aile", seconds: 90, floor: 200, label: { fr: "Aile", en: "Wing" } },
  { id: "hecatombe", seconds: 300, floor: 1000, label: { fr: "Hécatombe", en: "Hecatomb" } }
];

// ── Tickets à gratter (jeu du temple) ────────────────────────────────────────
// Mise en OR (le puits, ancrée en secondes de prod comme Icare) ; GAIN en FAVEUR.
// Grille 3×3 : l'ISSUE (un symbole gagnant ou « blanc ») est tirée par UN seul
// Math.random pondéré, la grille est ensuite peinte pour matcher (le symbole 3
// fois = gain). Un ticket perdant nourrit la cagnotte PARTAGÉE (state.icarusPot-
// Faveur) ; le Soleil la rafle. Gain de Faveur = secondes × payoutMult ×
// ICARUS_FAVEUR_K. Espérance NÉGATIVE calée sur l'edge d'Icare : E[payoutMult] =
// 0.82 → edge maison ≈ 18 %, 27 % de tickets gagnants (la plupart PERDANTS).
export const SCRATCH_HISTORY_LEN = 12;       // derniers tickets affichés (bandeau)
export const SCRATCH_POT_FEED = 0.5;         // Faveur/s de mise versée à la cagnotte sur un ticket perdant (cf. AUGURY_POT_FEED_HOLLOW)
export const SCRATCH_REVEAL_PCT = 60;        // % de vernis gratté déclenchant l'auto-révélation
export const SCRATCH_STAKES = [              // mises en SECONDES de production d'or (cf. ICARUS_STAKES)
  { id: "obole", seconds: 15, floor: 40, label: { fr: "Obole", en: "Obol" } },
  { id: "drachme", seconds: 45, floor: 150, label: { fr: "Drachme", en: "Drachma" } },
  { id: "talent", seconds: 150, floor: 700, label: { fr: "Talent", en: "Talent" } }
];
// Table des lots — poids /1000, payoutMult (×secondes×K pour la Faveur). Le
// « blank » (perte) domine. `venus` offre en plus un vol d'Icare (mise Plume) ;
// `soleil` RAFLE la cagnotte partagée. Les poids somment à SCRATCH_WEIGHT_TOTAL.
export const SCRATCH_PRIZES = [
  { symbol: "blank", weight: 730, payoutMult: 0, sweep: false },
  { symbol: "olive", weight: 138, payoutMult: 1.2, sweep: false },
  { symbol: "amphore", weight: 70, payoutMult: 2.4, sweep: false },
  { symbol: "laurier", weight: 36, payoutMult: 4.5, sweep: false },
  { symbol: "trepied", weight: 17, payoutMult: 8, sweep: false },
  { symbol: "chouette", weight: 5, payoutMult: 16, sweep: false },
  { symbol: "venus", weight: 2, payoutMult: 40, sweep: false, freeFlight: true },
  { symbol: "soleil", weight: 2, payoutMult: 15, sweep: true }
];

// ── Vingt-et-un (jeu du temple) ──────────────────────────────────────────────
// Blackjack antique : mise en OR (secondes de prod, comme Icare), GAIN en FAVEUR.
// TOUR PAR TOUR (tirer/rester), PAS de timer — un rechargement en pleine main
// abandonne la mise (état module éphémère, comme le vol d'Icare). Le croupier
// (l'oracle) tire jusqu'à BLACKJACK_DEALER_STAND. Un « naturel » (21 en 2 cartes)
// paie 3:2. Une main perdue nourrit la cagnotte PARTAGÉE ; pas de rafle (jeu de
// skill, pas de jackpot). Gain de Faveur = secondes × mult × ICARUS_FAVEUR_K.
export const BLACKJACK_HISTORY_LEN = 12;      // dernières mains affichées (bandeau)
export const BLACKJACK_POT_FEED = 0.5;        // Faveur/s de mise versée à la cagnotte sur une main perdue
export const BLACKJACK_DEALER_STAND = 17;     // le croupier reste à 17+ (soft 17 compris)
export const BLACKJACK_MULT = { blackjack: 2.5, win: 2, push: 1, lose: 0 }; // × secondes × ICARUS_FAVEUR_K
export const BLACKJACK_STAKES = [             // mises en SECONDES de production d'or (cf. ICARUS_STAKES)
  { id: "legere", seconds: 40, floor: 60, label: { fr: "Mise légère", en: "Light bet" } },
  { id: "pleine", seconds: 120, floor: 300, label: { fr: "Mise pleine", en: "Full bet" } },
  { id: "royale", seconds: 350, floor: 1200, label: { fr: "Grand jeu", en: "High stakes" } }
];

// ── Automatisation du Temple (moteur passif : jouer aux cadrans) ─────────────
// Une fois débloquées (arbre d'artefacts, Phase 4) et activées, les
// automatisations jouent À LA PLACE du joueur au tick, gouvernées comme
// l'Intendance : cooldown par jeu (anti-verrou, cf. STEWARD_COOLDOWN_MS), UNE
// partie par tick, plancher d'or = réserve à ne pas entamer. La mise coûte de
// l'OR → le moteur est un CONVERTISSEUR borné par l'économie, pas de l'argent
// gratuit. Réglé bas = revenu de fond régulier ; réglé haut = la machine tente
// les gros coups. ONLINE pour l'instant (le crédit offline serait un hook dédié).
export const AUTO_AUGURY_INTERVAL_MS = 8_000;   // délai min entre 2 auto-lancers d'osselets
export const AUTO_ICARUS_INTERVAL_MS = 12_000;  // délai min entre 2 auto-vols (~5 s de vol + repli)
export const AUTO_ICARUS_TARGET_MIN = 1.2;      // cadran cible : bas = revenu régulier
export const AUTO_ICARUS_TARGET_MAX = ICARUS_JACKPOT_MULT; // 10 = mise max auto (gros payout, faibles odds) ; cagnotte + jalon GR VII restent MANUELS
export const AUTO_TEMPLE_GOLD_FLOOR_DEFAULT_S = 120; // réserve d'or (2 min de prod) sous laquelle l'auto se met en veille
export const AUTO_TEMPLE_GOLD_FLOOR_MAX_S = 600;      // curseur plancher d'or : 0 → 600 s de prod
// Déblocage des automatisations (Phase 3 — coût en Faveur ; la Phase 4 les
// intégrera à l'arbre d'artefacts). Payer débloque ET active d'emblée.
export const AUTO_OSSELETS_UNLOCK_COST = 200;        // Faveur pour l'auto-lancé des osselets
export const AUTO_ICARUS_UNLOCK_COST = 350;          // Faveur pour l'autopush d'Icare

// ── Artefacts du Temple (Phase 4 : arbre de lignées, refontes de RISQUE) ──────
// Débloqués en Faveur, ÉTERNELS (state.templeArtifacts, cf. GR_PERSISTENT_FIELDS).
// Ce sont des PROFILS DE RISQUE (pas des sticks de stats). Lignée OSSELETS :
// dé d'ivoire (coupe la queue du Chien + plus de Vénus, à taux de victoire égal)
// → osselet du noyé (les revers nourrissent DOUBLE la cagnotte). Lignée ICARE :
// plumes de secours (consolation Faveur au crash) → ailes solaires (plafond
// relevé). Chaque lignée se termine par son automatisation (rang capstone).
export const TEMPLE_ARTIFACT_IDS = ["ivoire", "noye", "plumes", "solaires"];
export const IVORY_DOG_CUT = 0.20;      // dé d'ivoire : dogShare 0.4 → 0.2 (moitié moins de Chiens)
export const IVORY_VENUS_BONUS = 0.10;  // …et venusShare 0.15 → 0.25 (plus de Vénus), à pEff constant
export const NOYE_POT_MULT = 2;         // osselet du noyé : les revers nourrissent ×2 la cagnotte
export const PLUMES_CONSOLATION_MULT = 0.5; // plumes : un crash rend round(sec × ICARUS_FAVEUR_K × 0.5) en Faveur
export const ICARUS_CAP_SOLAR = 200;    // ailes solaires : plafond du multiplicateur relevé (×100 → ×200)
export const ARTIFACT_IVOIRE_COST = 300;   // Faveur
export const ARTIFACT_NOYE_COST = 260;
export const ARTIFACT_PLUMES_COST = 380;
export const ARTIFACT_SOLAIRES_COST = 520;

// ── Intendance (consignes conditionnelles, onglet Régulation) ────────────────
// Délégation configurable : « si la Rupture dépasse X % → lancer telle action
// d'apaisement ». L'intendance clique COMME LE JOUEUR (mêmes coûts croissants,
// même fatigue) et n'agit jamais sur la cible → anti-immortalité intact, c'est
// du lissage de micro-gestion. Elle se met en veille quand l'administration
// est fatiguée (gate) et respecte un cooldown par consigne (anti-verrou, comme
// AUTO_CRISIS_COOLDOWN_MS pour protocoles_urgence).
export const STEWARD_MAX_CLAUSES = 2;        // consignes maximum (slots gatés ère/mythe)
export const STEWARD_COOLDOWN_MS = 20_000;   // délai minimal entre deux exécutions d'une consigne
export const STEWARD_FATIGUE_GATE = 0.5;     // au-delà : l'intendance laisse l'administration souffler
export const STEWARD_THRESHOLDS = [0.5, 0.65, 0.8]; // seuils de Rupture proposés
// Registre des édits (annales) : entrées conservées (cap dur, reset par cycle).
export const REGUL_LEDGER_MAX = 24;

// ── Lissage du foyer Subsistance (anti-volatilité) ───────────────────────────
// Le foyer scarcity lit un STOCK instantané (déficit de nourriture) → très
// volatil (pics brefs sans impact réel, la bille n'a pas le temps de suivre).
// On lisse l'entrée par un filtre passe-bas (EMA) : un creux bref est amorti, un
// déficit DURABLE monte progressivement → la Subsistance compte enfin. Demi-vie
// à régler au ressenti. Curseur unique, n'affecte que ce foyer.
export const SCARCITY_EASE_HALF_LIFE_S = 8;

// ── Inégalités ancrées sur la RÉSERVE D'OR (anti-saturation du trésor) ────────
// Mesuré (scratch/sim-gold-anchor.js) : l'or explose (10^74 en fin de partie),
// donc gold/pop et gold/infra saturent les Inégalités. Seule mesure stable : la
// réserve d'or en SECONDES DE REVENU (gold / revenu_or), bornée ~120-640 s sur
// toute la partie. Inégalités = excédent de réserve au-delà de REF, /SCALE.
// → l'or n'est plus une taxe automatique ; thésauriser le punit, dépenser le soulage.
export const INEQUALITY_RESERVE_REF_S = 60;     // réserve « normale » (≈1 min) : Inégalités nulles en deçà
export const INEQUALITY_RESERVE_SCALE_S = 200;  // échelle de montée au-delà de REF (raide → contributeur modéré ~0.1-0.3)
export const INEQUALITY_EASE_HALF_LIFE_S = 10;  // demi-vie du lissage EMA de la réserve (s)
// Borne de la réserve : en fin de partie l'or dépasse massivement tous les puits
// (sur-accumulation forcée) → sans borne, les Inégalités re-satureraient à 0.55.
// À 600 s (10 min de revenu), l'inégalité « forcée » plafonne à ~0.32 → reste un
// contributeur MODÉRÉ partout. (Vrai correctif de fond = ajouter des puits d'or.)
export const INEQUALITY_RESERVE_CAP_S = 600;

// Plafond de la mitigation d'Usure (infra/savoir/légitimité). Non bornée, elle
// gelait l'Usure en fin de partie (taux mesuré ~0.002) : l'Usure redevient une
// deadline garantie — toute civilisation finit par tomber par le temps.
// Abaissé (8 → 5) : on ne peut plus repousser l'Usure aussi loin → deadline plus
// rapprochée, l'effondrement par le temps devient inexorable plus tôt.
export const TIME_WEAR_MITIGATION_CAP = 5;

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

// Gating doux des Grand Resets par les Mythes : à partir de MYTH_GATE_START_GR,
// chaque GR exige un Mythe complété de plus (GR3 : 1, GR4 : 2, … GR10 : 8).
// Les Mythes deviennent les chapitres de la route principale au lieu d'un
// contenu optionnel contournable (le bot a atteint GR10 avec 1 seul Mythe).
export const MYTH_GATE_START_GR = 3;

// Récompense de la « rafale d'ères » post-GR : chaque palier d'ère maximale
// jamais atteint ajoute un bonus PLAT de ruines à chaque effondrement. La
// retraversée express des ères devient une pluie de gains visibles.
export const ERA_RUIN_BONUS_PER_INDEX = 1;

// Ancre de normalisation du bonus de prod par ère (recurring_ages, cf.
// globalMultiplier). Figée sur la longueur d'ORIGINE de la courbe (35 ères →
// 34 intervalles) et NON sur eras.length : ainsi les ères transcendantes
// ajoutées au-delà de 34 PAIENT en production au lieu de diluer le bonus
// (sans ça, ×(19/(eras.length-1)) rétrécit l'incrément à chaque ère ajoutée →
// nerf de tout le jeu). Pour bestEraIndex ≤ 34, valeur bit-à-bit identique à
// l'ancienne (golden-safe).
export const RECURRING_AGE_ERA_ANCHOR = 34;

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
// Relevé 6 → 8 (calibrage 2026-07) : COMPENSATION PARTIELLE de la suppression du
// terme de légitimité (+legitimacy×0.16 dans institutionalLog) — récupère ~40-45 %
// du barrage perdu en mid-game ; la Rupture reste un peu plus exigeante qu'avant.
export const INFRA_COVERAGE_MITIGATION_MULT = 8;
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

// ── Gain idle : production + Usure capées sur le temps d'absence ──────────────
// (cf. CE-spec-idle-crises.md §B). Pendant l'absence, la cité produit à son taux
// courant ET vieillit (Usure), tous deux bornés par le MÊME cap de temps. Au-delà
// du cap : tout gèle (ni prod, ni Usure) — évite de revenir sur une cité plus
// vieille que ce qu'elle a produit (l'ancien hors-ligne ne faisait QUE vieillir).
// Le cap commence à 2 h GRATUITES (corrige « ferme l'onglet → rien » dès le départ),
// puis les upgrades « Veilleurs de nuit » l'étendent. Le rendement idle scalant
// déjà ~×13/ère, on ne vend que des HEURES (pas besoin de scaler le cap par ère).
export const IDLE_BASE_CAP_SECONDS = 2 * 3600;        // cap gratuit pour tous
// Incrément de cap (secondes) débloqué par chaque palier de ruines. Cumulés à la
// base : 2h → 8h → 24h (Veille fondue dans Cycle & Crise → 2 paliers). Coûts dans upgrades.js.
export const IDLE_CAP_PALIERS = {
  veilleurs_nuit_1: 6 * 3600,   // 2h base + 6h → 8 h (absorbe l'ancien palier _2)
  veilleurs_nuit_4: 16 * 3600   // + 16h → 24 h (absorbe l'ancien palier _3)
};
// Plafond du nombre d'effondrements rejoués pendant une absence (farm v2, cf. §B.5).
// Borne perf + équilibre : pas de farm infini sur une absence de plusieurs jours.
export const OFFLINE_MAX_COLLAPSES = 20;
// Capstone « Phénix calendaire » : le plafond saute (borne perf seulement).
export const OFFLINE_UNCAPPED_COLLAPSES = 500;

// ── Refonte Arbre des Ruines (docs/REFONTE-ARBRE-RUINES.md) ──────────────────
// Sève de braise : le scaling méta ne vient plus des nœuds « +X % ressource »
// (supprimés) mais de l'arbre lui-même — prod globale × (1 + PER_NODE×nœuds
// possédés + LOG_SPENT×log10(1+ruines dépensées)). Curseurs d'équilibrage
// principaux de l'arbre ; « Machine chronique » amplifie ce bonus de +50 %.
export const RUIN_BRAISE_PER_NODE = 0.08;
export const RUIN_BRAISE_LOG_SPENT_COEF = 0.25;
// Nécropole vivante : +vestigePower par vestige, nombre de vestiges plafonné.
export const VESTIGE_POWER_CAP = 10;
// Cendres fertiles : fenêtre de sur-régime post-effondrement (prod ×(1+amount)).
export const REGROWTH_RUSH_MS = 3 * 60_000;
// Rites du feu court : durée max d'un cycle « court » (bonus de ruines).
export const RUIN_SHORT_CYCLE_SEC = 15 * 60;
// Moisson de crise : plafond du bonus cumulé (+3 %/crise résolue, cap +30 %).
export const CRISIS_RESOLVE_RUIN_CAP = 0.30;
// Stagnation féconde : secondes de stagnation qui chargent une aubaine.
export const STAGNATION_BOON_EVERY_SEC = 480;
// Fêtes de jalon : secondes de production créditées par l'aubaine dorée.
export const MILESTONE_BOON_SECONDS = 240;
// Abîme assumé (dogme) : seuil de Rupture et bonus de production au-dessus.
export const ABYSS_DOGMA_THRESHOLD = 0.7;
export const ABYSS_DOGMA_PROD_BONUS = 0.2;
// Enracinement (dogme) : surcoût de tous les bâtiments (contrepartie de la fin
// de l'entretien A2).
export const ENRACINEMENT_COST_MULT = 1.15;
// Préparations funèbres : l'effet de préparation terminale est renforcé ×1.5.
export const PREP_FUNEBRE_BOOST = 1.5;

// ── A1 · Démesure (hubris d'échelle) ─────────────────────────────────────────
// Problème : tous les foyers de Rupture sont plafonnés en doux et la mitigation
// (couverture d'infra + légitimité) peut ramener la cible sous 1.0 → « tout
// acheter » fige la jauge et l'effondrement par Rupture devient impossible.
// La Démesure est un SOCLE d'instabilité qui croît avec la taille de la cité,
// ajouté APRÈS la mitigation (la couverture/légitimité ne peut pas l'effacer) et
// SANS plafond : la grandeur elle-même engendre une tension irréductible. Sous
// DEMESURE_FREE_LOG_POP habitants (10^4 = 10 000), aucune Démesure → l'early game
// et le début de chaque cycle restent intacts.
export const DEMESURE_FREE_LOG_POP = 4;   // pop sous 10^4 : Démesure nulle
// Abaissé 0.06 → 0.05 (calibrage 2026-07) : COMPENSATION PARTIELLE du levier de
// légitimité disparu (log10(1+legit)×0.11 de demesureCut, ~0.17 en mid-game).
// −17 % de pression brute ≈ le levier perdu AVANT la politique « Gouvernance
// impériale » ; les porteurs de la politique restent un cran plus tendus qu'avant.
export const DEMESURE_COEF = 0.05;        // pression par décade de population au-delà du seuil
// Rework cadence late-game : la Démesure était NON bornée et NON réductible → à
// 10^30 elle valait 1.56 à elle seule, épinglant la cible à 2-4× le seuil quoi que
// fasse le joueur (cycle métronome ~2 min, « aucun moyen de gérer »). Désormais :
//   1. BORNÉE par un soft cap (Michaelis-Menten) → contribution max ~DEMESURE_SOFT_CAP.
//   2. RÉDUCTIBLE par la GOUVERNANCE : la Légitimité (institutions qui administrent
//      l'empire, terme log) + la politique « Gouvernance impériale » (demesureDamp).
// L'anti-immortalité ne repose plus sur la Démesure mais sur l'USURE (deadline de
// plusieurs heures) : une cité bien gouvernée ramène sa cible sous 1.0 et coaste
// sur l'Usure ; une cité négligée s'effondre toujours vite par la Rupture.
export const DEMESURE_SOFT_CAP = 0.9;          // contribution max de la Démesure (soft cap)
export const DEMESURE_CUT_CAP = 0.85;          // fraction max de Démesure retirable par la gouvernance

// ── A2 · Entretien de l'infrastructure (résorption du surplus) ───────────────
// L'infra n'est jamais consommée : sur un long cycle, son stock dépasse
// mécaniquement la demande et sature la couverture (Rupture éteinte, cf.
// INFRA_COVERAGE_EFFECTIVE_CAP). On fait DÉGRADER l'infra excédentaire — au-delà
// de INFRA_UPKEEP_TOLERANCE × la demande de couverture — à INFRA_UPKEEP_DECAY_RATE
// par seconde. Une cité bien dimensionnée n'est pas touchée ; une cité
// sur-équipée (ou laissée seule pendant que sa population fond) perd son surplus
// → la couverture ne peut plus trivialiser la jauge, et l'entretien redevient
// une préoccupation active. Ne touche JAMAIS l'infra « utile » (sous le seuil) :
// pas de spirale de mort pour une cité sous-équipée.
export const INFRA_UPKEEP_TOLERANCE = 3;     // surplus toléré : 3× la demande (aligné sur la couverture effective max)
export const INFRA_UPKEEP_DECAY_RATE = 0.03; // 3 %/s de résorption de la part excédentaire

// ── A6 · Stagnation (Usure accélérée d'une cité sur-stabilisée) ──────────────
// Une cité qui maintient sa Rupture durablement basse se sclérose : le temps
// (Usure) s'accélère. Punir la « tortue » sur-stabilisée, complément de la
// Démesure (qui, elle, vise les grosses cités). La jauge de stagnation monte
// d'1 s par seconde passée sous le seuil de Rupture, et redescend
// STAGNATION_RECOVER_MULT× plus vite dès que la tension repasse au-dessus.
export const STAGNATION_RUPTURE_THRESHOLD = 0.5; // sous ce niveau de Rupture, la cité « stagne »
export const STAGNATION_USURE_RAMP_SEC = 300;    // 5 min de calme ⇒ +1.0 au multiplicateur d'Usure
export const STAGNATION_USURE_MAX_BONUS = 2;     // plafond : Usure ×3 au maximum
export const STAGNATION_RECOVER_MULT = 3;        // vitesse de retombée de la jauge quand la Rupture remonte

// ── Apparition ÉCONOMIQUE des bâtiments en boutique ──────────────────────────
// Remplace l'ancien palier « x/10 du bâtiment précédent » (unlockBuilding),
// jugé trop visible : un bâtiment jamais possédé se révèle quand le PIC du
// cycle dans sa devise (cyclePeaks) atteint cette fraction de son coût de
// base. La production seule ouvre la boutique — aucun compteur affiché ; le
// seul verrou explicite qui reste est le cycle (unlockCycles). Le pic étant
// monotone sur le cycle, pas de clignotement quand on dépense.
export const BUILDING_REVEAL_PEAK_FRACTION = 0.25;

// ── B2 · Aubaines (petites récompenses ponctuelles) ──────────────────────────
// Fenêtre aléatoire entre deux aubaines : un cadeau « gratuit » toutes les
// ~5-30 min, indexé sur la production courante (cf. boons.js) → pertinent à
// toutes les échelles. Rythme volontairement espacé pour rester un petit
// événement qu'on remarque, pas un flux. L'horloge (state.nextBoonAt) court en
// temps RÉEL et n'est PAS réinitialisée à l'effondrement : indépendante du cycle.
export const BOON_INTERVAL_MIN_SEC = 300;   // 5 min
export const BOON_INTERVAL_MAX_SEC = 1800;  // 30 min
