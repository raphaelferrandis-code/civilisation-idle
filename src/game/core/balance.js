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

// Multiplicateur gagné à chaque Grand Reset : base^count. DEUX bases DISTINCTES
// (2026-07-18) — auparavant une seule servait à la fois la production et la
// moisson de Ruines, ce qui rendait la base intouchable : la monter pour rendre
// le sceau attractif multipliait AUSSI la moisson, dont le stock re-entre dans
// ruinMultiplier et unspentRuinsPower, et le rééquilibrage s'annulait lui-même
// (à base 3,5 sur 11 sceaux, la moisson prenait ×1300 au passage). Découplées,
// les deux se règlent séparément.
//
// PROD : rehaussée de 2 à 3,5 en contrepartie de l'affaiblissement des termes de
// Ruines (foundation_ghosts 0.01 → 0.0001, cf. upgrades.js). REDISTRIBUTION à
// multiplicateur total constant : le sceau pèse plus, la falaise du reset pèse
// moins, le rythme d'achat ne bouge pas (mesuré, cf. scratch/sim-gr-exposant-glouton).
// RUIN : laissée à 2 — c'est elle qui gouverne la vitesse de remontée après un
// sceau, déjà largement suffisante (un seul effondrement retrouve le stock).
//
// Chacune reste la SOURCE DE VÉRITÉ de son côté, lue par le moteur ET par les
// libellés d'UI, pour qu'un rééquilibrage ne fasse jamais mentir l'affichage.
// NB : ne comprennent PAS la garde mythe_du_chaos ni le bonus Ragnarök — ceux-ci
// restent locaux à leur contexte.
export const GRAND_RESET_PROD_BASE = 3.5;
export const grandResetProductionMult = (count) =>
  Math.pow(GRAND_RESET_PROD_BASE, Math.max(0, count || 0));

export const GRAND_RESET_RUIN_BASE = 2;
export const grandResetRuinGainMult = (count) =>
  Math.pow(GRAND_RESET_RUIN_BASE, Math.max(0, count || 0));

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
// Plafond : la réforme va jusqu'à FOYER_REFORM_CAP (0.72, combiné relief +
// réforme + politique dans pressureBreakdown) ; l'apaisement seul reste borné à
// FOYER_RELIEF_CAP (0.45) à son dépôt. (Avant le rework cadence late-game, les
// deux partageaient 0.45 pour garantir la chute par la Rupture ; c'est désormais
// l'USURE qui la garantit.) Une cité pleinement réformée peut donc passer sous
// 1.0 et tenir sur l'horloge d'Usure.
// `add` = part déposée par clic (cumulée vers le plafond commun) ;
// `seconds` = coût en secondes de production courante (cf. crisisCosts) ;
// `resource` = ressource ponctionnée (trésor/savoir = « réduction du trésor »).
export const FOYER_REFORM = {
  scarcity:   { add: 0.15, seconds: 140, resource: 'food',      label: { fr: "Réserve d'État", en: 'State Reserve' } },
  inequality: { add: 0.15, seconds: 160, resource: 'gold',      label: { fr: 'Charte des communs', en: 'Charter of the Commons' } },
  complexity: { add: 0.15, seconds: 180, resource: 'knowledge', label: { fr: 'Grand cadastre', en: 'Great Cadastre' } },
  dissent:    { add: 0.15, seconds: 160, resource: 'gold',      label: { fr: "Panthéon d'État", en: 'State Pantheon' } }
};
// ── Crises « qui comptent » (pilote 2026-10, cf. CRISIS_POOL dans world.js) ──
// Par palier de crise (0.25 / 0.5 / 0.75) :
//   TREAT  : part retirée au foyer de la crise jusqu'à la chute (« traiter »,
//            payé en production par l'option elle-même) ;
//   PROFIT : part ajoutée à ce foyer (« profiter ») ;
//   PROFIT_PREP : préparation de chute gagnée en profitant (« Ruines +X % »,
//            même réservoir que les édits terminaux, plafond COLLAPSE_PREP_MAX).
// Calibré par bench-crises.js (2026-10-03, 24 h de partie neuve, 6 graines) sur
// les 3 crises pilotes : traiter toujours ≈ 1 669 Ruines, profiter toujours
// ≈ 1 590, lire sa marge (profiter si la cible reste sous 50 % malgré la dette,
// ou si traiter ne la ramène pas sous 100 %) ≈ 1 869. Revalidé sur les 15 crises
// au tirage normal : 1 701 / 1 583 / 1 843 (lire sa marge gagne 5 graines sur 6).
// Durée MINIMALE d'un cycle avant qu'un minuteur d'effondrement automatique
// (Édit d'effondrement « temps », règle « minutes » du Script du Phénix) puisse
// le faire tomber. 10 min = l'âge où la patience atteint 1 (prestige.js) : plus
// tôt, le plancher et le bonus plat de Ruines ne sont pas mûrs. Avant : 30 s /
// 1 min, ce qui permettait une rente AFK de chutes éclair.
export const AUTO_COLLAPSE_MIN_SECONDS = 600;
// Vœu du cycle ROMPU ou MANQUÉ : la moisson de la chute est multipliée par ce
// facteur (data/vows.js). Sans coût d'échec, on prenait toujours le vœu le plus
// gros ; ne rien prêter reste gratuit.
export const VOW_FAIL_MULT = 0.9;
export const CRISIS_TREAT_SHIFT = { 0.25: 0.05, 0.5: 0.06, 0.75: 0.07 };
export const CRISIS_PROFIT_SHIFT = { 0.25: 0.05, 0.5: 0.06, 0.75: 0.07 };
export const CRISIS_PROFIT_PREP = { 0.25: 0.15, 0.5: 0.20, 0.75: 0.30 };
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

// La Clémence (rabais de mise sur série noire) a disparu avec la mise libre
// (2026-10-04, lot 1 des gains « vrai casino ») : un rabais sur une mise que le
// joueur choisit lui-même n'a plus de sens. Les cadeaux du rang la remplaceront
// (lot 2, docs/PLAN-GAINS-CASINO.md).
export const GAMBLE_HISTORY_LEN = 5;   // jets mémorisés par table (affichage)
// Second jet (« quitte ou double ») : chance FIXE, sans avantage de la maison, et
// il ne s'inscrit pas dans l'historique des jets.
export const AUGURY_DOUBLE_P = 0.5;

// ── Table des prises des osselets (5 issues) ─────────────────────────────────
// Le tirage n'est pas binaire : la masse GAGNANTE (p effective) se répartit
// Vénus/Triple/Paire, la masse PERDANTE en Creux/Chien. Lecture des os
// (1·3·4·6, les AS sont funestes) : quatre différentes = Vénus, triple haut =
// grand présage, paire haute = présage, paire d'as = creux, quatre as = le Chien.
export const AUGURY_TIER_SHARES = { venus: 0.15, triple: 0.25 }; // parts de la masse gagnante (reste = paire)
export const AUGURY_HOLLOW_SHARE = 0.6; // part de la masse perdante en creux (reste = Chien)

// LE CARRÉ DE SIX (2026-07-22) — le jackpot de la table. Une part des Coups de
// Vénus tombe en QUATRE six et rafle la cagnotte du temple AU PRORATA DE LA MISE
// (potRake, exactement comme Icare).
//
// Ce n'est PAS une 6e issue : le tier reste `venus` pour TOUTE l'économie
// (paytable, historique, chronique) — seuls les dés affichés et la rafle changent.
//
// ⚠ POURQUOI C'EST GRATUIT CÔTÉ RTP — à comprendre AVANT d'y toucher. La preuve
// du temple (actions/templePot.js) suppose DÉJÀ que la cagnotte revient
// INTÉGRALEMENT au joueur : rtp_total = rtp_base + recycle × (1 − rtp_base) < 1.
// Le garde-fou A9 du bench compte même tout ce que les augures VERSENT au pot
// comme rendu au joueur, précisément parce qu'ils « ne peuvent JAMAIS rafler ».
// Leur ouvrir une porte de sortie ne change donc pas le rendement, seulement le
// TEMPO — même arbitrage que les serres. Ce qui casserait l'invariant, ce serait
// de MINTER le jackpot au lieu de le PRÉLEVER sur le pot : ne jamais faire ça.
//
// La rareté ressentie vient du produit : au rite ancestral, Vénus sort à 7,1 %, donc
// le carré tombe ~0,7 % des jets.
export const AUGURY_JACKPOT_SHARE = 0.10; // part des Vénus qui tombent en carré de six

// ── LA TABLE DE LA MAISON — un vrai casino (lot 1, 2026-10-04) ──────────────
// Arbitrage de Raph (2026-10-03, docs/PLAN-GAINS-CASINO.md) : « plutôt que
// d'augmenter les odds de gagner, choisir la mise et tenter de gagner de plus en
// plus de sous, comme un vrai casino ». Trois règles en découlent :
//   1. les COTES sont fixes pour toujours : aucun achat ne touche aux chances ni
//      à l'avantage de la maison, et AUCUN jeu ne rend plus de 100 % (la bascule
//      de juillet, l'« imprimante volontaire », est supprimée) ;
//   2. la MISE est libre, entre la limite basse et la limite haute de la table ;
//   3. ce qui grandit, c'est la Maison : ses RECETTES suivent la ville, et la
//      limite haute suit les recettes. Le rang (lot 2) ouvrira des tables ×10.
//
// LES RECETTES (ex-tronc des offrandes, même caisse, même geste « Relever ») :
//     recettes/h = BASE × max(1, (seuil de l'ère record / POP_REF) ^ EXP)
// BASE = l'ancien tronc (2/min) à l'Ère II, où la Maison ouvre. La population
// gagne ~×10 par ère, donc les recettes ~×1,4 par ère : 2 247/h au Bourg des
// artisans, 62 000/h au Royaume diplomate, 6 M/h à la Singularité. L'ère RECORD
// (bestEraIndex) et non la population du moment : un effondrement ne vide pas la
// salle, le Grand Reset si (comme la Faveur). Calcul en log10 : les seuils des
// ères transcendantes dépassent 1e308 (actions/maisonTable.js).
export const MAISON_RECETTES_BASE_H = 120;   // Faveur/h à l'Ère II (l'ancien tronc)
export const MAISON_RECETTES_POP_REF = 4000; // ~ seuil de population de l'Ère II (Abris)
export const MAISON_RECETTES_EXP = 0.15;     // ~×1,4 par ère
export const CAISSE_CAP_H = 0.5;             // la caisse se remplit en 30 min, puis attend
export const CAISSE_INITIAL = 60;            // pleine au déblocage (amorce, comme l'ancien tronc)
// LES LIMITES DE TABLE. Haute = 15 min de recettes (30 Faveur à l'Ère II, l'ancienne
// grosse mise valait 25), arrondie à deux chiffres significatifs. Basse = 1 : on
// joue petit si l'on veut.
export const TABLE_MAX_H = 0.25;
export const TABLE_MIN = 1;
// Les cadrans de mise des automatisations : une part de la limite haute de la SALLE
// COMMUNE (la limite grandit avec la ville, une mise absolue deviendrait vite
// dérisoire ; le rang, lui, n'ouvre que les tables où l'on joue à la main).
export const AUTO_STAKE_STEPS = { min: 0, quart: 0.25, moitie: 0.5, max: 1 };

// ── LE RANG DE LA MAISON (lot 2 des gains « vrai casino ») ───────────────────
// La RÉPUTATION est la perte théorique du joueur, comme dans un vrai casino : chaque
// mise PAYÉE y ajoute mise × avantage de la Maison, comptée en HEURES DE RECETTES
// (la même à toute ère : ce que la Maison a gagné sur toi, en temps de caisse). Les
// coups offerts (vols, tours gratuits, relance de la cella) n'y comptent pas. Elle
// ne se perd jamais : ni à l'effondrement, ni au Grand Reset.
// Chaque rang multiplie par 10 la limite haute des tables (la salle commune des
// automatisations reste à ×1) et offre ses CADEAUX, qui ne s'achètent plus :
// artefacts et automatisations (ids de data/artifacts.js) et des vols offerts à la
// limite de la salle commune. Seuils en heures de recettes : à la limite de base et
// 3 % d'avantage, Familier vient en ~70 grosses mises ; Prince quand la Maison t'a
// pris ~75 h de recettes.
export const MAISON_RANKS = [
  { id: "habitue", threshold: 0, mult: 1, flights: 0, gifts: [] },
  { id: "familier", threshold: 0.5, mult: 10, flights: 3, gifts: ["colombier", "mesure", "autoOsselets", "autoIcare"] },
  { id: "notable", threshold: 3, mult: 100, flights: 5, gifts: ["echelle", "coin", "autoGratteux", "autoVingtEtUn"] },
  { id: "mecene", threshold: 15, mult: 1000, flights: 8, gifts: ["interdit", "solaires"] },
  { id: "prince", threshold: 75, mult: 10000, flights: 8, gifts: ["serres"] }
];
// L'automatisation offerte, par id de nœud de l'arbre → jeu de templeAuto.
export const RANK_GIFT_AUTOS = { autoOsselets: "osselets", autoIcare: "icarus", autoGratteux: "gratteux", autoVingtEtUn: "vingtetun" };

// ── Les osselets à cotes fixes : chaque RITE est un PARI ─────────────────────
// La mise étant libre, le rite ne fixe plus le prix : il fixe le RISQUE. `p` = la
// chance de gagner, `profile` = les paiements RELATIFS des trois issues gagnantes,
// normalisés pour que chaque rite rende AUGURY_RTP (vol offert de Vénus compris,
// cf. auguryPaytable). `spread` répartit Vénus/Chien comme avant. Prototypé le
// 2026-10-03 : prudent ×1,37-2,11, ancestral ×1,54-3,08, grand ×1,85-4,62,
// interdit ×1,95-9,37 (paire-Vénus) ; écart-type 0,74 / 1,02 / 1,45 / 2,41 mise.
// `interdit` reste gaté par l'artefact « Le rite interdit » (lot 2 : par le rang).
export const AUGURY_RTP = 0.97;
export const AUGURY_RITE_BETS = {
  prudent: { p: 0.62, spread: 0.55, profile: { venus: 2, triple: 1.5, pair: 1.3 } },
  classique: { p: 0.475, spread: 1, profile: { venus: 3, triple: 2, pair: 1.5 } },
  grand: { p: 0.32, spread: 1.7, profile: { venus: 5, triple: 3, pair: 2 } },
  interdit: { p: 0.18, spread: 2.5, profile: { venus: 12, triple: 4, pair: 2.5 } }
};

// ── LA CAGNOTTE DU TEMPLE — financée par l'EDGE, jamais par la mise ──────────
// (refonte 2026-07-17 ; cf. actions/templePot.js et le garde-fou A9)
//
// LE VICE QU'ON CORRIGE. Les parts d'avant (AUGURY_POT_SHARE_HOLLOW 0.25 / _DOG
// 0.5, ICARUS_POT_SHARE 0.4, SCRATCH_POT_SHARE 0.3, BLACKJACK_POT_SHARE 0.3,
// TOUTES SUPPRIMÉES) prélevaient sur la MISE alors que l'edge ne prend que 0,02
// (blackjack) à 0,18 (Icare) de cette même mise. Or la cagnotte n'est PAS un
// puits : en solo, tout ce qui y entre revient au MÊME joueur (elle se rafle à
// Icare). C'est un PAIEMENT DIFFÉRÉ. On rendait donc plus qu'on ne prenait, et
// six configurations sur neuf IMPRIMAIENT (Icare ×10 à 118,7 % dès le 1er jour).
//
// LA RÈGLE. Rien n'est créé hors du tronc. Le pot ne peut être financé que sur ce
// qui a été DÉTRUIT, c'est-à-dire l'edge :
//     feed = mise × recycle × (1 − rtp_base)
// d'où, pour tout jeu, tout niveau, tout artefact et toute mise :
//     rtp_total = rtp_base + recycle × (1 − rtp_base) < 1   ⟺   recycle < 1
// L'anti-imprimante devient vrai par ALGÈBRE, comme la loi C = (1−e)/U d'Icare,
// et non plus par réglage. Verrouillé par A9 (le calcul) et A10 (recycle < 1).
//
// ⚠ Ce qui NE marche PAS, et qui a déjà été essayé : borner la SORTIE. Rafler au
// prorata de la mise, ou retirer un rafleur, ne change RIEN au RTP long terme —
// le pot converge vers un équilibre où sortie = entrée par définition, donc tout
// ce qui est versé revient. Seule l'ENTRÉE compte. (Démonstration en tête de la
// section A9 de bench-temple.js.)
export const TEMPLE_POT_RECYCLE = 0.6;      // part de l'EDGE reversée à la cagnotte
export const TEMPLE_POT_RECYCLE_CAP = 0.85; // borne dure < 1 : LE point de défaillance unique (A10)
// Plafond de la cagnotte : 24 h de recettes (elle grandit avec la Maison), jamais
// sous l'ancien plafond fixe.
export const POT_CAP_MIN = 5000;
export const POT_CAP_H = 24;
// Coup de Vénus (et autres) : un vol d'Icare offert, à la mise du coup qui l'a gagné.
export const ICARUS_FREE_FLIGHTS_MAX = 5;

// ── Boutique de Faveur (dépenser la Faveur) ──────────────────────────────────
// Les dés pipés, les ailes cirées, les planches du graveur et les Coffres ont
// disparu au lot 1 (2026-10-04) : ils achetaient des CHANCES ou une imprimante.
// La Faveur dépensée a été remboursée (migration 4 → 5 de state.js, qui garde les
// anciens prix). Restent les achats qui ne touchent pas aux cotes.
// Stylet du gratteux (2026-07-17, demande Raphaël) — rang 1 de la lignée
// gratteux : chaque niveau ÉLARGIT le grattoir. C'est un augment de GESTE, zéro
// impact math : le rayon de base a été volontairement réduit (26/22/17 → 13/11/9,
// « le grattage était un interrupteur ») et le stylet REVEND ce confort. Au max
// (+6), on reste sous l'ancien rayon : 19/17/15.
export const STYLET_RADIUS_STEP = 2;      // +2 px de rayon par niveau
export const STYLET_MAX_LEVEL = 3;
export const STYLET_COST_BASE = 120;
export const STYLET_COST_GROWTH = 1.7;
// Bénédiction — bonus TEMPORAIRE de production (multiplicateur GLOBAL, N s) :
// le pont vers le cœur du jeu. Re-jouable, effet temporaire remis à zéro à
// l'effondrement. Son prix suit les recettes de la Maison (30 min de recettes :
// 60 à l'Ère II comme avant), sinon il deviendrait gratuit en milieu de partie.
export const BLESSING_MULT = 1.5;         // +50 % de production
export const BLESSING_DURATION_S = 180;   // 3 minutes
export const BLESSING_COST_H = 0.5;       // prix = 30 min de recettes

// ── Le Vol d'Icare (crash game du temple) ────────────────────────────────────
// Un multiplicateur grimpe en continu (m = e^(K·t)) ; le soleil frappe à un
// point tiré à l'envol : C = (1-EDGE)/U, U~uniforme — donc encaisser à une
// cible m réussit avec p = (1-EDGE)/m. Mise en FAVEUR, payout = mise × m → RTP =
// 1-EDGE par construction, quelle que soit la cible. Lot 1 (2026-10-04) : l'edge
// est FIXE à 3 % (Aviator), plus d'ailes cirées. Se poser à ×JACKPOT rafle la
// cagnotte, au prorata de la mise (la mise maximale de la table la rafle entière).
export const ICARUS_EDGE = 0.03;            // part de la maison, fixe
export const ICARUS_RTP = 1 - ICARUS_EDGE;  // valeur d'un vol offert, par Faveur de mise
export const ICARUS_CAP = 100;              // multiplicateur maximal (~33 s de vol)
export const ICARUS_K = Math.LN2 / 5;       // ×2 à 5 s, ×10 à ~16,6 s, ×100 à ~33 s
export const ICARUS_JACKPOT_MULT = 10;      // se poser à ×10+ rafle la cagnotte
export const ICARUS_HISTORY_LEN = 12;       // derniers points de crash affichés

// ── Tickets à gratter (jeu du temple) ────────────────────────────────────────
// Mise et gain en FAVEUR, le prix du ticket est la mise. Grille 3×3 : l'ISSUE
// (un symbole gagnant ou « blanc ») est tirée par UN seul Math.random pondéré,
// la grille est ensuite peinte pour matcher (le symbole 3 fois = gain). Un
// ticket nourrit la cagnotte PARTAGÉE (state.icarusPotFaveur) sur son EDGE, et
// cette table ne la rafle JAMAIS. Lot 1 (2026-10-04) : c'est la LOTERIE de la
// Maison, le pire pari et le plus gros rêve — 75 % de retour, un ticket sur
// quatre gagne, et le Soleil paie ×5 000 la mise (1 ticket sur 100 000).
export const SCRATCH_HISTORY_LEN = 12;       // derniers tickets affichés (bandeau)
// % de vernis gratté déclenchant l'auto-révélation. Relevé de 60 à 74 le
// 2026-07-17 : à 60 %, le ticket se déverrouillait avant que les 9 alvéoles soient
// lisibles (le joueur voyait l'issue tomber sans l'avoir découverte). Se règle AVEC
// SCRATCH_RADIUS (ScratchStage.jsx) : les deux décident du nombre de passes, et
// monter le seuil sans réduire le rayon ne fait qu'allonger le même interrupteur.
// Ne pas pousser trop haut : la dernière tranche, ce sont les coins arrondis, donc
// du geste sans information.
export const SCRATCH_REVEAL_PCT = 74;
// Table des lots — poids sur 1 000 000, payoutMult × la mise. Le « blank » (perte)
// domine. `venus` offre en plus un vol d'Icare à la mise du ticket. Le Soleil est le
// GROS LOT (il ne rafle pas la cagnotte : les tickets la nourrissent, Icare et la
// machine la prennent). Les poids somment à SCRATCH_WEIGHT_TOTAL (scratch.js).
//   olive ×1 (1 sur 8), amphore ×2 (1 sur 13), laurier ×4 (1 sur 29), trépied ×10
//   (1 sur 83), chouette ×50 (1 sur 500), Vénus ×250 + vol (1 sur 5 000), Soleil
//   ×5 000 (1 sur 100 000) → P(gain) 25,9 %, RTP 75,0 % (vol compté au RTP d'Icare).
export const SCRATCH_PRIZES = [
  { symbol: "blank", weight: 740790, payoutMult: 0 },
  { symbol: "olive", weight: 130000, payoutMult: 1 },
  { symbol: "amphore", weight: 80000, payoutMult: 2 },
  { symbol: "laurier", weight: 35000, payoutMult: 4 },
  { symbol: "trepied", weight: 12000, payoutMult: 10 },
  { symbol: "chouette", weight: 2000, payoutMult: 50 },
  { symbol: "venus", weight: 200, payoutMult: 250, freeFlight: true },
  { symbol: "soleil", weight: 10, payoutMult: 5000 }
];

// ── Vingt-et-un (jeu du temple) ──────────────────────────────────────────────
// Blackjack antique, mise et gain en FAVEUR. TOUR PAR TOUR (tirer/rester), PAS de
// timer — un rechargement en pleine main abandonne la mise (état module éphémère,
// comme le vol d'Icare). Le croupier (l'oracle) tire jusqu'à BLACKJACK_DEALER_STAND.
// Lot 1 (2026-10-04) : le DOUBLE et la REFENTE sont des règles de base (plus des
// artefacts), et le « naturel » (21 en 2 cartes) paie 6 contre 5 (×2,2) comme à Las
// Vegas : à 3 contre 2, le jeu parfait rendait 100,3 %. Chaque main nourrit la
// cagnotte PARTAGÉE sur son EDGE ; pas de rafle (jeu de skill, pas de jackpot).
export const BLACKJACK_HISTORY_LEN = 12;      // dernières mains affichées (bandeau)
// RTP de RÉFÉRENCE du vingt-et-un — MAJORE le meilleur jeu joignable : feedPot le
// lit (le sous-estimer gonflerait le versement à la cagnotte). MESURÉ le 2026-10-03
// (2 M de mains, règles du moteur : paquet unique rebattu, croupier S17, une
// refente, double après refente) : naïf 93,0 %, base 96,7 %, base + double 98,3 %,
// base + double + refente 98,9 % ± 0,16 pt. À re-mesurer si BLACKJACK_MULT,
// BLACKJACK_DEALER_STAND ou basicAction bougent.
export const BLACKJACK_RTP_REF = 0.995;
// RTP de l'AUTO (base + double, jamais de refente) — ne sert qu'au badge de débit.
export const BLACKJACK_RTP_AUTO = 0.983;
export const BLACKJACK_DEALER_STAND = 17;     // le croupier reste à 17+ (soft 17 compris)
export const BLACKJACK_MULT = { blackjack: 2.2, win: 2, push: 1, lose: 0 }; // × la mise (Faveur)

// ── La machine à sous (2026-10-03, demande de Raph : « avec des bonus type free spin
// et mini jeux, qui déclenche une roue » ; v2 le même soir : « 5 rouleaux, joker et Hold
// & Win ») ─────────────────────────────────────────────────────────────────────────
// Ouvre à la FONTE (ère 25, la Liberty Bell date de 1895) dans la salle des machines.
// Une VRAIE machine : CINQ rouleaux figés, trois rangées, VINGT lignes ; une ligne paie
// le plus long alignement depuis la gauche (3, 4 ou 5), le JOKER remplaçant les symboles
// (rouleaux 2 à 4 seulement : il ne paie jamais seul). Ce sont les ARRÊTS qui décident
// (un Math.random par rouleau). Le RTP se CALCULE (actions/slotsMath.js) — jamais saisi.
// Calibré le 2026-10-03 (disposition des bandes n° 218 d'une recherche, gains ronds) :
//   lignes 55,5 % · tours gratuits 11,5 % · roue 6,1 % · Hold & Win 19,0 %  →  92,0 %
//   (hors GRAND). Une ligne paie 41 % des tours (20 % rendent au moins la mise) ; tours
//   gratuits et roue chacun 1 tour sur 106 ; Hold & Win 1 sur 183 (×35 la mise en
//   moyenne), la grille pleine (le GRAND) dans 1 % des Hold & Win.
// Trois ÉTOILES ou plus n'importe où : 8 / 12 / 20 tours gratuits, gains ×2 (relances
// possibles). Trois ROUES : la roue (douze cases égales). Six PIÈCES : le HOLD & WIN — les
// pièces se figent, trois relances, chaque nouvelle pièce les recharge ; chaque pièce vaut
// ×1 à ×10 la mise, ou le MINI (×20) ou le MAJEUR (×100) ; remplir les quinze cases
// donne le GRAND : la cagnotte de la Maison au prorata de la mise (potRakeShare), comme
// la case JACKPOT de la roue. Le GRAND est un TRANSFERT : il n'entre pas dans le RTP de
// référence (seule l'ENTRÉE de la cagnotte compte, cf. TEMPLE_POT_RECYCLE).
// ⚠ Les bandes sont FIGÉES : en déplacer un symbole change les co-occurrences, et la
// fréquence du Hold & Win y est très sensible (1/116 à 1/308 pour les mêmes quantités) —
// le test recalcule et borne tout.
// Lot 1 (2026-10-04) : la mise est libre (toutes lignes comprises), et la machine
// garde son 92 % — c'est le pari le plus cher après les tickets, comme dans un vrai
// casino.
export const SLOTS_UNLOCK_ERA = 25;
// Ce que paie une ligne, × la mise totale, selon la longueur de l'alignement (index 3, 4, 5).
export const SLOTS_PAY = {
  cerise: [0, 0, 0, 0.2, 0.5, 2.5],
  citron: [0, 0, 0, 0.3, 1, 3],
  cloche: [0, 0, 0, 0.5, 1.5, 5],
  fer: [0, 0, 0, 1, 2.5, 10],
  bar: [0, 0, 0, 1.5, 5, 20],
  sept: [0, 0, 0, 3, 10, 50]
};
// Les vingt lignes : la rangée vue sur chacun des cinq rouleaux.
export const SLOTS_LINES = [
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [0, 1, 1, 1, 0],
  [2, 1, 1, 1, 2], [1, 0, 1, 2, 1], [1, 2, 1, 0, 1], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2],
  [1, 1, 0, 1, 1], [1, 1, 2, 1, 1], [0, 2, 0, 2, 0], [2, 0, 2, 0, 2], [0, 2, 2, 2, 0]
];
export const SLOTS_REELS = [
  ["cerise", "citron", "cerise", "citron", "piece", "cloche", "cerise", "fer", "cloche", "fer", "piece", "fer", "citron", "cerise", "etoile", "cloche", "piece", "citron", "sept", "bar", "cerise", "cloche", "citron", "piece", "cerise", "cerise", "citron", "bar", "roue"],
  ["cerise", "piece", "sept", "fer", "cloche", "citron", "citron", "piece", "fer", "cloche", "citron", "roue", "fer", "cerise", "bar", "etoile", "cerise", "cerise", "cloche", "citron", "joker", "citron", "bar", "piece", "joker", "cloche", "cerise", "piece", "cerise"],
  ["sept", "citron", "citron", "citron", "bar", "piece", "citron", "cloche", "cerise", "joker", "cloche", "cerise", "cerise", "cloche", "bar", "roue", "etoile", "piece", "cerise", "cloche", "fer", "piece", "cerise", "joker", "cerise", "fer", "piece", "fer", "citron"],
  ["fer", "cloche", "roue", "citron", "joker", "fer", "bar", "cerise", "cerise", "joker", "cloche", "sept", "citron", "cloche", "bar", "piece", "piece", "etoile", "cerise", "fer", "piece", "piece", "cerise", "cerise", "citron", "cloche", "citron", "citron", "cerise"],
  ["cerise", "cerise", "citron", "etoile", "fer", "bar", "cloche", "piece", "sept", "cloche", "cerise", "piece", "citron", "piece", "cloche", "cerise", "fer", "piece", "citron", "cloche", "cerise", "bar", "fer", "citron", "cerise", "cerise", "citron", "citron", "roue"]
];
export const SLOTS_WILD = "joker";
// Tours gratuits selon le nombre d'étoiles (index = étoiles vues) ; gains ×SLOTS_FREE_MULT.
export const SLOTS_FREE_SPINS = [0, 0, 0, 8, 12, 20];
export const SLOTS_FREE_MULT = 2;
// La roue : douze cases ÉGALES (ce qu'on voit est ce qui tombe). Un nombre : × la mise.
// « tours » offre SLOTS_WHEEL_SPINS tours ; « jackpot » est le GRAND (la cagnotte).
export const SLOTS_WHEEL = [2, 5, "coffres", 3, "tours", 10, 2, "coffres", 3, "vol", 20, "jackpot"];
export const SLOTS_WHEEL_AT = 3;
export const SLOTS_WHEEL_SPINS = 8;
// Le mini-jeu des coffres : trois coffres fermés, un seul s'ouvre (× la mise).
export const SLOTS_CHESTS = [3, 6, 20];
// Le HOLD & WIN : dès `trigger` pièces ; `respins` relances (rechargées à chaque nouvelle
// pièce) ; chaque case vide reçoit une pièce avec la probabilité `pNew` à chaque relance.
// Les valeurs : × la mise, `w` le poids ; MINI et MAJEUR sont des pièces comme les autres.
export const SLOTS_HW = {
  trigger: 6,
  respins: 3,
  pNew: 0.07,
  values: [
    { v: 1, w: 40 }, { v: 2, w: 25 }, { v: 3, w: 14 }, { v: 5, w: 10 }, { v: 10, w: 6 },
    { v: 20, w: 3.5, jp: "mini" }, { v: 100, w: 0.5, jp: "majeur" }
  ]
};
// Le vol d'Icare de la roue se joue à la mise du tour qui l'a gagné.
export const SLOTS_HISTORY_LEN = 12;

// ── Automatisation du Temple (moteur passif : jouer aux cadrans) ─────────────
// Une fois débloquées (échoppe/arbre d'artefacts) et activées, les
// automatisations jouent À LA PLACE du joueur au tick, gouvernées comme
// l'Intendance : cooldown par jeu (anti-verrou, cf. STEWARD_COOLDOWN_MS), UNE
// partie par tick, plancher de FAVEUR = réserve à ne pas entamer. Monnaie
// fermée (2026-07-16) : les autos de JEU (osselets, Icare) jouent À PERTE en
// espérance (edge maison) — un divertissement automatisé qui chasse Vénus et
// nourrit la cagnotte, pas un revenu ; l'AUTO-RELÈVE vide les offrandes avant
// qu'elles ne débordent (elle ne crée rien, elle évite du gaspillage). ONLINE
// pour l'instant (crédit offline = hook dédié).
export const AUTO_AUGURY_INTERVAL_MS = 8_000;   // délai min entre 2 auto-lancers d'osselets
export const AUTO_ICARUS_INTERVAL_MS = 12_000;  // délai min entre 2 auto-vols (~5 s de vol + repli)
export const AUTO_SCRATCH_INTERVAL_MS = 10_000; // délai min entre 2 tickets auto
export const AUTO_BLACKJACK_INTERVAL_MS = 10_000; // délai min entre 2 mains auto
export const AUTO_ICARUS_TARGET_MIN = 1.2;      // cadran cible : bas = revenu régulier
export const AUTO_ICARUS_TARGET_MAX = ICARUS_JACKPOT_MULT; // 10 = mise max auto (gros payout, faibles odds) ; cagnotte + jalon GR VII restent MANUELS
export const AUTO_TEMPLE_FAVEUR_FLOOR_DEFAULT = 30;  // réserve de Faveur sous laquelle une auto de jeu se met en veille
export const AUTO_TEMPLE_FAVEUR_FLOOR_MAX = 2000;    // curseur plancher de Faveur
// TEMPO des automatisations (arbitrage Raphaël 2026-07-17 : « paramétrable selon
// des critères de gain, temps ou risques ») : multiplie l'intervalle de base.
// recueilli = moitié moins de parties, fervent = deux fois plus. Le tempo ne
// change RIEN à l'espérance par partie (edge inchangé) : il règle le DÉBIT, donc
// la vitesse à laquelle l'auto consomme ou distrait. Les trois cadrans par jeu :
// la mise/le rite (risque), le tempo (temps), le plancher de Faveur (gain gardé).
export const AUTO_TEMPO_MULT = { recueilli: 2, mesure: 1, fervent: 0.5 };
// Déblocage des automatisations (coût en Faveur, durci 2026-07-16). Payer
// débloque ET active d'emblée. TOUS les jeux ont leur automatisation en capstone
// (arbitrage Raphaël 2026-07-17), le vingt-et-un compris : son auto joue la
// stratégie de base (basicAction) avec le double, jamais la refente, et ne compte
// ni série ni historique (parité avec l'auto-Icare qui ne rafle pas : la main se
// joue aussi à la main).
export const AUTO_OSSELETS_UNLOCK_COST = 700;        // Faveur pour l'auto-lancé des osselets
export const AUTO_ICARUS_UNLOCK_COST = 350;          // Faveur pour l'autopush d'Icare
// 350 → 520 (phase 6) : compense le robinet doublé — (520 − 60)/2 = 230 min,
// A5 exige ≥ 3,5 h d'épargne stricte avant l'auto-relève.
export const AUTO_TRUNK_UNLOCK_COST = 520;           // Faveur pour l'auto-relève du tronc des offrandes
export const AUTO_SCRATCH_UNLOCK_COST = 500;         // Faveur pour l'auto-gratteux
export const AUTO_BLACKJACK_UNLOCK_COST = 700;       // Faveur pour l'auto-vingt-et-un

// ── Artefacts du Temple (Phase 4 : arbre de lignées, refontes de RISQUE) ──────
// Débloqués en Faveur, ÉTERNELS (state.templeArtifacts, cf. GR_PERSISTENT_FIELDS).
// Ce sont des PROFILS DE RISQUE (pas des sticks de stats). Lot 1 (2026-10-04) : le
// dé d'ivoire (il déformait les chances) a disparu, le double et la refente du 21
// sont devenus des règles de base — tous trois remboursés (migration 4 → 5).
// Chaque lignée se termine par son automatisation (rang capstone).
export const TEMPLE_ARTIFACT_IDS = [
  "noye", "echelle", "interdit",                          // lignée osselets
  "plumes", "souffle", "solaires", "serres", "colombier", // lignée Icare
  "coin", "relance",                                      // lignée gratteux
  "voix", "mesure",                                       // lignée vingt-et-un
  "char", "corne", "oeil"                                 // les Reliques (le trésor)
];
// Osselet du noyé — ⚠ SÉMANTIQUE CHANGÉE le 2026-07-17. Il multipliait la part de
// la MISE versée à la cagnotte ; il multiplie désormais le RECYCLE de l'edge, et il
// est CLAMPÉ par TEMPLE_POT_RECYCLE_CAP (0.6 × 2 = 1.2 → 0.85). L'effet ressenti
// est le même (les revers engraissent bien plus vite la cella) mais l'invariant
// recycle < 1 tient, donc l'artefact ne peut plus faire imprimer la table. Une save
// existante garde l'artefact avec cette sémantique neuve : son texte a été réécrit.
export const NOYE_POT_MULT = 2;
// Plumes de secours — ⚠ La consolation est PRÉLEVÉE SUR LA CAGNOTTE depuis le
// 2026-07-17, elle n'est plus créée. Avant, elle mintait round(mise × 0.5) à CHAQUE
// crash, hors de tout paiement, et P(crash) → 1 quand la cible monte : c'était le
// poste le plus lourd de toute l'imprimante (+51 pts de RTP à ×50, devant la
// cagnotte elle-même). Contrepartie à assumer, et le texte de l'artefact le dit :
// une cella vide ne rend rien. En échange, le pot gagne enfin une bonde à BASSE
// variance (il ne se vidait qu'à ×10, soit 8,2 % des vols).
export const PLUMES_CONSOLATION_MULT = 0.5;
// Le second souffle (rang au-dessus des plumes) : consolation 0.5 → 0.7. Peut
// scaler LIBREMENT parce que le filet est PRÉLEVÉ sur la cella (drawFromPot),
// jamais créé — c'est exactement le contenu que l'invariant de la phase 4 a
// rendu possible. Une cella vide ne rend toujours rien.
export const SOUFFLE_CONSOLATION_MULT = 0.7;
export const ICARUS_CAP_SOLAR = 200;    // ailes solaires : plafond du multiplicateur relevé (×100 → ×200)
// Les serres : la part de cagnotte emportée par une rafle monte de moitié
// (potRakeShare ×1.5 : un dixième de la limite emporte 15 % au lieu de 10 %).
// SORTIE de pot uniquement : on a démontré (cf. templePot.js / bench A9) que la
// sortie ne change pas le RTP long terme — c'est un achat de TEMPO, pas de rendement.
export const SERRES_RAKE_MULT = 1.5;
// Le colombier du guetteur : la file de vols offerts passe de 5 à 8 (les billets
// gagnés ne se perdent plus quand elle est pleine) et le guetteur note 24 vols
// au lieu de 12 (l'historique des pastilles est la meilleure lecture de l'edge).
export const FLIGHTS_MAX_COLOMBIER = 8;
export const ICARUS_HISTORY_COLOMBIER = 24;
export const ARTIFACT_NOYE_COST = 260;     // Faveur
export const ARTIFACT_PLUMES_COST = 380;
export const ARTIFACT_SOLAIRES_COST = 520;
export const ARTIFACT_ECHELLE_COST = 350;  // osselets : le quitte ou double s'enchaîne
export const ARTIFACT_INTERDIT_COST = 500; // osselets : le 4e rite (le pari le plus risqué)
export const ARTIFACT_SOUFFLE_COST = 450;
export const ARTIFACT_SERRES_COST = 550;
export const ARTIFACT_COLOMBIER_COST = 200;
export const ARTIFACT_COIN_COST = 240;     // gratteux : une case arrive dégagée
export const ARTIFACT_RELANCE_COST = 420;  // gratteux : la cella rejoue un ticket perdant
export const ARTIFACT_VOIX_COST = 150;     // vingt-et-un : l'oracle parle (séries)
export const ARTIFACT_MESURE_COST = 250;   // vingt-et-un : le conseil de la mesure
// Le quitte ou double des osselets s'enchaîne jusqu'à N crans avec l'Échelle de
// Vénus (1 sans elle). Chaque cran est à EV EXACTEMENT nulle (p = 0.5, gain =
// +wager) : enchaîner ne déplace pas le RTP d'un dixième, A9 intact par
// construction. C'est un achat de DÉCISION et de variance, le seul vrai levier
// stratégique de la table.
export const AUGURY_DOUBLE_MAX_CRANS = 3;
// (Les Coffres du temple — mise ×10 par rang — ont disparu au lot 1 : la limite
// haute des tables suit désormais les recettes de la Maison, et le rang du lot 2
// ouvrira les tables plus hautes.)

// ── LES RELIQUES (le trésor du temple, 2026-07-17) ───────────────────────────
// Les puits légendaires qui donnent un sens aux grands chiffres : des objets
// uniques à prix exponentiels, qui paient DANS LA CITÉ (l'arbitrage Raphaël :
// les jeux financent la production). Effets multiplicatifs, éternels
// (templeArtifacts → GR_PERSISTENT_FIELDS).
export const RELIC_CHAR_COST = 1e6;       // le Char du Soleil : Bénédiction PERMANENTE
export const RELIC_CORNE_COST = 1e9;      // la Corne du temple : production ×2
export const RELIC_OEIL_COST = 1e12;      // l'Œil d'or : production ×4
export const RELIC_CORNE_PROD_MULT = 2;
export const RELIC_OEIL_PROD_MULT = 4;

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
// ── Chantiers de voirie ──────────────────────────────────────────────────────
// L'achat de routes n'est plus « +1 tuile » à coût géométrique (mur exponentiel
// contre un besoin linéaire) : 1 achat = 1 CHANTIER, un objet fini — raccord
// d'un moteur entier d'abord, élargissement du tronçon le plus emprunté quand
// tout est relié. Le coût est ∝ tuiles du chantier, ancré sur l'ère ; la
// CADENCE vient du temps de pose (une équipe, une petite file), pas du prix.
export const ROAD_WORK_QUEUE_MAX = 3;            // chantier actif + file d'attente
// Le prix de la tuile est coté à l'ÈRE OÙ LE SAVOIR COMMENCE À COULER, pas à
// l'ère 0. Mesuré sur partie neuve (achat glouton, sonde d'affordabilité) :
//   ère 0-2 → 0 savoir/s (aucun conteur payable) ; ère 3 → 14/s ; ère 4 → 293/s.
// Ancrer la puissance sur l'ère 0 revenait à demander 480 k de savoir à l'ère 3
// (9 h de production) et 5,3 M à l'ère 4 (5 h) : la rangée Voirie était morte
// toute la première heure — et une ville sans rue n'est pas un choix de jeu,
// c'est un décor raté. Ancrée à l'ère 3, elle vaut ~1 min de production à son
// ouverture, ~30 s à l'ère 4 : un vrai coût, jamais un mur.
export const ROAD_TILE_COST_BASE = 66;           // savoir par tuile à l'ère d'ancrage
export const ROAD_COST_ERA_ANCHOR = 3;           // ère où le savoir commence à couler
// Plancher : sous l'ancre la puissance devient négative et le prix tendrait vers
// zéro. Une tuile vaut au moins 1 savoir — les premières voiries restent un
// achat (≈ 12 savoir le chantier), jamais un clic gratuit.
export const ROAD_TILE_COST_MIN = 1;
// Croissance par ère SOUS celle de la production (~×13/ère) : la voirie devient
// relativement plus abordable en fin de partie, jamais un mur.
export const ROAD_TILE_COST_GROWTH = 11;
export const ROAD_WIDEN_COST_MULT = { avenue: 2, main: 4, twin: 6 };  // rang visé (twin = autoroute)
export const ROAD_TILE_SECONDS = 1.6;            // secondes de pose par tuile (ère 0)
// RACCORD PAR VAGUE (échelle late game, mesuré : 200 à 650 moteurs non reliés
// dans une grande ville — « 1 chantier = 1 moteur » ne passe pas l'échelle) :
// chaque chantier de raccord connecte la FRACTION la plus proche du manquant,
// minimum 1 → ~15 chantiers couvrent une ville, quelle que soit sa taille.
export const ROAD_LINK_WAVE_FRACTION = 0.25;
// L'équipe s'améliore avec l'ère (outils, engins) : le temps de pose PAR TUILE
// est divisé par (1 + taux × eraIndex) — sans quoi les grandes vagues du late
// game se poseraient en dizaines de minutes.
export const ROAD_CREW_SPEED_PER_ERA = 0.12;
// Durée d'un chantier = (base + tuiles × s/tuile ÷ vitesse d'équipe) × (1 +
// rampe × index), où l'index compte les chantiers de l'ÈRE COURANTE (achetés,
// file comprise) : le premier d'une ère se pose vite, le dixième se mérite —
// et la remontée éclair post-Effondrement, qui traverse les ères, ne traîne
// jamais la rampe du cycle entier. Plafond de sécurité.
export const ROAD_WORK_BASE_SECONDS = 8;
export const ROAD_WORK_TIME_RAMP = 0.35;
export const ROAD_WORK_TIME_MAX = 1800;
// RÉSERVE de chantiers : quand il n'y a plus rien à raccorder ni à élargir,
// l'achat se stocke (prix plat d'un chantier moyen) et se LANCE TOUT SEUL dès
// que de nouveaux bâtiments apparaissent — la rangée ne meurt jamais, la
// couverture se maintient d'elle-même pendant la croissance.
export const ROAD_WORKS_BANK_MAX = 25;
export const ROAD_NEXT_FALLBACK_TILES = 10;      // estimation avant le 1er calcul carte
export const ROAD_WIDEN_BONUS_EACH = 0.01;       // +1 % par tronçon élargi…
export const ROAD_WIDEN_BONUS_MAX = 0.08;        // …plafonné (la couverture fait +10 % à côté)

export const IDLE_BASE_CAP_SECONDS = 2 * 3600;        // cap gratuit pour tous
// Incrément de cap (secondes) débloqué par chaque palier de ruines. Cumulés à la
// base : 2h → 8h → 24h (Veille fondue dans Cycle & Crise → 2 paliers). Coûts dans upgrades.js.
export const IDLE_CAP_PALIERS = {
  veilleurs_nuit_1: 6 * 3600,   // 2h base + 6h → 8 h (absorbe l'ancien palier _2)
  veilleurs_nuit_4: 16 * 3600   // + 16h → 24 h (absorbe l'ancien palier _3)
};
// LA CLEPSYDRE (C7) : au-dessus du plafond, le temps d'absence n'est plus JETÉ,
// il se verse dans une réserve que le joueur vide quand il le décide.
// Sa contenance suit la réserve d'absence (× ce multiplicateur) au lieu d'être
// une constante à part : les « Veilleurs de nuit », qui achètent des heures
// d'absence, achètent du même coup des heures de clepsydre — un seul chiffre à
// comprendre, une seule chose à améliorer.
export const CLEPSYDRE_CAP_MULT = 1;
// Plafond ABSOLU (secondes), dérivé des paliers : sert de borne de normalisation
// à l'hydratation, où les upgrades du joueur ne sont pas encore lisibles. Le
// dériver (plutôt qu'un 24 h en dur) le garde vrai si un palier bouge.
export const CLEPSYDRE_HARD_MAX_SECONDS = CLEPSYDRE_CAP_MULT
  * (IDLE_BASE_CAP_SECONDS + Object.values(IDLE_CAP_PALIERS).reduce((a, b) => a + b, 0));
// En dessous, verser ne produirait rien de lisible (et le rapport de reprise se
// tait de toute façon sous REPORT_MIN_SEC).
export const CLEPSYDRE_MIN_POUR_SECONDS = 60;
// Borne DURE d'un lot d'achat, partagée par maxBuyAmount, buildingBatchCost et
// buyBuildingCore — les trois la clampaient chacun de leur côté avec un 500 en
// dur. Ce n'est pas un réglage d'équilibrage mais un garde-fou : la somme
// géométrique bascule en Decimal au-delà du float, et la carte révèle les
// habitations une par une. Le mode Max, lui, sonde au-delà (cf. maxBuyAmount).
export const MAX_BATCH_AMOUNT = 500;
// Borne du mode MAX, qui n'est pas un lot fixe mais « tout ce qui est payable ».
// Elle ne sert qu'à borner la sonde et le calcul de coût — les coûts croissant
// géométriquement, c'est le solde du joueur qui limite en pratique, jamais elle.
// ATTENTION : cette borne DOIT être celle de buildingBatchCost. Si le coût était
// clampé plus bas que la quantité réellement créditée, le joueur paierait un lot
// et en recevrait un plus gros.
export const MAX_BUY_HARD_CAP = 1e9;
// Plafond du nombre d'effondrements rejoués pendant une absence (farm v2, cf. §B.5).
// Borne perf + équilibre : pas de farm infini sur une absence de plusieurs jours.
export const OFFLINE_MAX_COLLAPSES = 20;
// Capstone « Phénix calendaire » : le plafond saute (borne perf seulement).
export const OFFLINE_UNCAPPED_COLLAPSES = 500;
// Plafonds de la MÉCANIQUE rejouée hors ligne (cf. isOfflineSim). Celui du Temple
// est PAR JEU et non global : un plafond global serait entièrement consommé par
// le premier jeu de la liste, et les quatre autres ne tourneraient jamais.
// NON NÉGOCIABLE côté équilibrage : l'économie de Faveur est en régime rtp
// supérieur à 1 assumé, bornée par la CADENCE. Rejouer des milliers de parties
// pendant une absence rouvrirait l'imprimante que templePot.js referme.
export const OFFLINE_MAX_TEMPLE_PLAYS_PER_GAME = 40;
// Idem pour les aubaines : leur cadence les borne déjà (nextBoonAt sur horloge
// virtuelle), ce plafond est la ceinture par-dessus la bretelle.
export const OFFLINE_MAX_BOONS = 30;

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
// ── « Le Comptoir » — héritage de l'Âge d'Or ─────────────────────────────────
// Onglet Marchandage : échange permanent au tarif du marchand. Sa MARGE est la
// contrepartie (le Comptoir dépanne, il n'enrichit pas) : acheter coûte 150 % de
// la valeur en Or, vendre n'en rend que 60 %. Lots ancrés sur la production
// courante (COMPTOIR_LOT_SECONDS) → utilisables à toutes les échelles. Molettes.
export const COMPTOIR_LOT_SECONDS = 60;
export const COMPTOIR_BUY_MARKUP  = 1.5;
export const COMPTOIR_SELL_RATE   = 0.6;

// Moisson de crise : pince de sûreté sur le bonus cumulé. Le nœud vaut +10 % par
// crise (upgrades.js), PAS +3 % comme l'annonçait ce commentaire. Le compteur
// cycleCrisesResolved est borné à 3 par construction (il n'existe que 3 paliers
// CRISIS_EVENTS, latchés dans state.crisisThresholds — crisis.js), donc le max
// atteignable vaut 3 × 0,10 = 0,30 : la pince ne rogne rien au-delà de l'epsilon
// flottant (3 × 0.1 === 0.30000000000000004). Elle protège d'un futur second nœud
// porteur du même effectType, que ruinEffectSum additionnerait.
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
