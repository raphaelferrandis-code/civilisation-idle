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
// Chaque pari PERDU d'une même table compte un « cran » (streak de revers
// consécutifs, le Chien compte double), remis à zéro au premier gain. En
// monnaie fermée (mise en Faveur, 2026-07-16), la pitié est un RABAIS DE MISE
// (gains au prorata) : l'ancien bonus d'odds rendait la table exploitable
// (RTP mesuré 124 % — cf. bench-temple.js / temple-faveur-impact.md).
// ⚠ « RTP inchangé » était FAUX (le commentaire l'a affirmé jusqu'au 2026-07-16).
// Le prorata passe par deux arrondis ENTIERS (la mise, puis chaque gain), donc le
// RTP OSCILLE. Mesuré au classique, dés 0 (mise 6, gains 30/14/7) :
//   cran 0 → mise 6, RTP 55,92 %   cran 3 → mise 4, RTP 56,72 %  (la pitié BAISSE le RTP)
//   cran 1 → mise 5, RTP 56,93 %   cran 4 → round(3,6) = 4 : NO-OP EXACT
//   cran 2 → round(4,8) = 5 : NO-OP EXACT      cran 5 → mise 3, RTP 58,67 %
// Deux crans sur cinq ne bougent RIEN (le joueur voit sa mise figée un revers sur
// deux) et l'échelle n'est pas monotone. Ce qui est vrai, et que A7 mesure, c'est
// que la Clémence reste INEXPLOITABLE : le sniper ne peut rien en tirer.
// NB : « Clémence » est distincte de la FAVEUR (la monnaie des jeux, plus bas).
// L'historique des 5 derniers jets (state.gambleHistory) est reset au cycle.
// ÉCHELLE DE MISES ENTIÈRES depuis le 2026-07-17 (phase 7). L'ancien rabais en
// POURCENTAGE (−10 %/cran, cap 50 %, cf. le bloc ci-dessus) passait par round() :
// les crans 2 et 4 étaient des NO-OP EXACTS (round(4,8) = round(5,4) = 5) — la
// mise ne bougeait pas un revers sur deux, et l'échelle n'était pas monotone.
// Chaque cran est désormais DÉCLARÉ : la mise descend à chaque revers jusqu'au
// plancher (la moitié de la mise pleine), puis y reste. Strictement décroissante
// jusqu'au plancher — verrouillé par A13 (aucun cran no-op, prorata borné < 1).
// Indexée par clemencyCrans (le Chien compte double), clampée au dernier cran.
export const AUGURY_CLEMENCY_LADDER = {
  prudent: [4, 3, 2, 2, 2, 2],
  classique: [6, 5, 4, 3, 3, 3],
  grand: [12, 10, 8, 7, 6, 6],
  interdit: [20, 17, 14, 12, 10, 10]
};
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

// LE CARRÉ DE SIX (2026-07-22) — le jackpot de la table. Une part des Coups de
// Vénus tombe en QUATRE six et rafle la cagnotte du temple AU PRORATA DE LA MISE
// (potRake, exactement comme Icare).
//
// Ce n'est PAS une 6e issue : le tier reste `venus` pour TOUTE l'économie
// (paytable, Clémence, historique, chronique) — seuls les dés affichés et la
// rafle changent. C'est ce qui permet de l'ajouter sans toucher à la recherche
// exhaustive d'auguryPaytable, qui est câblée sur exactement 3 postes payants et
// exploserait si on lui en donnait un 4e.
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
// La rareté ressentie vient du produit : à dés 10, Vénus sort à 7,1 %, donc le
// carré tombe ~0,7 % des jets (un toutes les ~2-3 h à cadence soutenable).
export const AUGURY_JACKPOT_SHARE = 0.10; // part des Vénus qui tombent en carré de six

// ── FAVEUR — la monnaie des jeux (2026-07-16 : MONNAIE FERMÉE aux osselets) ──
// Les osselets se MISENT en Faveur (plus d'or) : le temple est un casino à
// jetons, financé par le TRONC DES OFFRANDES (goutte-à-goutte passif plafonné).
// En monnaie fermée l'edge maison est OBLIGATOIRE (sinon imprimante) : les
// gains sont normalisés sur un RTP cible < 1 — modèle chiffré et validé par
// bench-temple.js (rapport : temple-faveur-impact.md). La Faveur persiste aux
// effondrements (comme les ruines), effacée au GR (le tronc repart plein).
// LE ROBINET (phase 6, 2026-07-17). À 1/min cap 30, le tronc finançait 23 jets
// classiques par heure pour 1,79 s d'animation chacun : le joueur jouait 61
// secondes par heure (duty cycle 1,1 %), et un tronc plein valait 5 jets, soit
// 20 secondes de jeu puis 30 minutes de rien. On avait réglé le RTP au dixième
// de point en laissant le débit à un niveau qui rendait le réglage sans objet.
// Doublé : le burst d'ouverture passe à 10 jets, la cadence soutenable à ~45/h.
// ⚠ COMPENSATION A5 OBLIGATOIRE : le simulateur du bench démarre le tronc PLEIN,
// donc tout seuil d'achat précoce doit rester > TRUNK_CAP, sinon il est offert à
// t = 0 (c'est DICE_COST_BASE 130 et AUTO_TRUNK_UNLOCK_COST 520 qui rattrapent —
// arithmétique posée : 1er dé à (130−60)/2 = 35 min ≥ 30, auto-relève à
// (520−60)/2 = 230 min ≥ 3,5 h).
export const TRUNK_RATE_PER_S = 2 / 60;  // tronc : +2 Faveur/min (+120/h)
export const TRUNK_CAP = 60;             // plafond du tronc (plein en 30 min)
// Mises des osselets par rite (le ratio ~0.6/1/2 des anciens costMult). PAS en
// dessous de 4 : l'arrondi des gains entiers ferait dériver le RTP de plusieurs
// points (granularité ≈ odds.pair/mise — cf. garde-fou A2 du bench).
// `interdit` (2026-07-17) : le 4e rite, gaté par l'artefact « Le rite interdit »
// (lignée osselets). Pur achat de VARIANCE comme les trois autres : la
// normalisation d'auguryPaytable égalise le RTP, le spread 2.5 gonfle les queues.
export const AUGURY_STAKES = { prudent: 4, classique: 6, grand: 12, interdit: 20 };
// RTP au WIN RATE MAXIMAL (dés pipés au niveau max) : la paytable est
// normalisée sur CE point de référence → les PAIEMENTS sont FIXES à travers
// les niveaux de dés (arbitrage Raph 2026-07-16 : « le winrate augmente et le
// paiement doit rester identique »). Le RTP effectif MONTE donc avec les dés —
// ≈ cap × 27,5/47,5 ≈ 57 % à dés 0 → ~99 % au niveau 10 — sans jamais
// atteindre 1 (anti-imprimante par construction, cf. auguryPaytable).
//
// ⚠ CE CAP EST LE PLAFOND DE CE QUE LES AUGMENTS PEUVENT ACHETER. Comme
// rtp_eff ≈ cap × pEff/pRef et que pEff = pRef à dés 10, « dés 10 » ET « le cap »
// sont le MÊME point : les 26 704 Faveur de dés ne battent pas la maison, elles
// rachètent le handicap de départ jusqu'à cette valeur, et pas plus.
// Relevé de 0.97 à 0.99 le 2026-07-17 pour réparer une INVERSION D'ÉCHELLE : le
// vingt-et-un rend 98,2 % GRATUITEMENT et n'a aucun augment, si bien que les deux
// lignées PAYANTES (osselets 97,0 % pour 26 704 Faveur, Icare 95,8 % pour 3 715)
// finissaient SOUS le jeu qu'on obtient sans rien payer. Effet de bord voulu : à
// dés 0 l'early ne bouge quasiment pas (55,9 % → 57,3 %), le gain est concentré là
// où le joueur a payé.
// ⚠ Plus le cap est haut, moins la recherche exhaustive a de marge pour caler un
// entier juste en dessous : RELIRE A2 au bench après toute retouche, et redescendre
// à 0.985 plutôt que forcer.
export const AUGURY_RTP_CAP = 0.99;
// Profil RELATIF des paiements (multiples de mise, avant normalisation RTP).
// Creux/Chien ne paient RIEN (les consolations plates n'avaient de sens qu'en
// mise-or) : le revers nourrit la cagnotte à la place (cf. feedPot).
//
// Rééquilibré de { venus: 5, triple: 2.5, pair: 1.2 } le 2026-07-17. Ce n'est PAS un
// buff : la normalisation absorbe tout, le RTP ne bouge pas d'un quart de point
// (57,3 % à dés 0). C'est un TRANSFERT du poste rare vers le poste lourd, à espérance
// constante. La paire pèse 60 % des victoires (16,5 % sur 27,5 %) et payait mise + 1
// dans les SIX combinaisons rite × ivoire : six victoires sur dix valaient +1 Faveur
// après 1,79 s d'animation. Désormais +3 / +4 / +5 net. Vénus tombe de ×5 à ×3,3 de
// la mise : on échange un fantasme vu 4 fois sur 100 contre une récompense vue 17
// fois sur 100, et l'écart-type par jet baisse (moins de masse sur la queue), ce qui
// allonge la survie de la bankroll early SANS toucher au RTP.
//
// ⚠ CE PROFIL EST LOAD-BEARING POUR LE CAP À 0.99, ce que je n'avais pas prévu : des
// gains plus gros sur le poste lourd rendent la granularité de l'arrondi ENTIER
// relativement plus fine, donc la recherche exhaustive se cale bien plus près du cap.
// Mesuré : A2 passe de 2,55 pts (limite 3, avec l'ancien profil) à 0,56 pt, et surtout
// « prudent + ivoire » cesse de tomber à 96,5 % — l'ivoire à 300 Faveur FAISAIT PERDRE
// 2,3 points à ce rite. Les deux réglages sont couplés : ne pas remonter le cap sans
// relire A2, ni revenir à l'ancien profil sans redescendre le cap.
export const AUGURY_PAY_PROFILE = { venus: 3, triple: 2, pair: 1.5 };

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
export const ICARUS_POT_CAP_FAVEUR = 5000;  // plafond de la cagnotte (Faveur)
// Coup de Vénus : le temple offre un vol d'Icare (mise « Plume », en attente).
export const ICARUS_FREE_FLIGHTS_MAX = 5;

// ── Boutique de Faveur (couche 2 : dépenser la Faveur) ───────────────────────
// Dés pipés — DOUBLE effet PERMANENT aux osselets : +STEP d'odds (gagner plus
// souvent) ET +AUGURY_RTP_PER_DICE de RTP (la table prélève moins). Justifie
// les odds/l'edge volontairement durs en early game. AUGMENT ÉTERNEL : survit
// aux effondrements ET au Grand Reset (cf. GR_PERSISTENT_FIELDS). La Faveur
// (le carburant), elle, se re-gagne au GR. Coûts DURCIS 2026-07-16 (arbitrage
// Raph : progression longue et chère — cf. temple-faveur-impact.md).
export const DICE_BOOST_STEP = 0.02;      // +2 pts d'odds par dé
// ── LA BASCULE (2026-07-17, arbitrage Raphaël : « au bout d'un moment le joueur
// gagne plus qu'il ne dépense ») ────────────────────────────────────────────────
// Le temple DEVIENT une imprimante volontaire aux rangs profonds. Le mécanisme :
// l'ANCRE de normalisation reste GELÉE à AUGURY_REF_DICE_LEVEL (les paiements ne
// bougent jamais, contrat A8), mais l'échelle des dés continue AU-DELÀ — et la
// linéarité rtp = rtpRef × pEff/pRef fait le reste : dés 11 ≈ 103 %, 12 ≈ 107 %,
// 13 ≈ 112 %. Sous l'ancre, rien ne change (early dur, RTP < 1 strict, garde-fou
// A9) ; au-dessus, le débit d'impression est un ROBINET borné par la cadence des
// autos (net/h = parties/h × mise × marge) — mesuré et calibré par A14.
export const AUGURY_REF_DICE_LEVEL = 10;  // l'ancre des paiements (NE PLUS BOUGER)
export const DICE_BOOST_MAX_LEVEL = 13;   // dés 11-13 : les rangs d'imprimante
// Phase 6 (2026-07-17) : à 60 × 1.8, les 10 dés coûtaient 26 704 Faveur, soit
// 445 h de tronc PUR — le scénario « dés 10, RTP 99 % » décrivait un contenu que
// personne n'atteindrait jamais (plafond réel du joueur : dés 5-6 à vie). À
// 130 × 1.45 : 11 594 Faveur les 10, ~97 h au nouveau robinet — une promesse,
// plus un décor. ⚠ La BASE monte de 60 à 130 pour compenser le robinet doublé :
// le bench démarre le tronc plein (60), un seuil ≤ TRUNK_CAP serait offert à
// t = 0 et A5 casserait mécaniquement.
export const DICE_COST_BASE = 130;        // Faveur pour le 1er dé (~35 min de tronc + burst)
export const DICE_COST_GROWTH = 1.45;     // coût ×1.45 par niveau (~11,6k les 10)
// Ailes cirées — abaisse PERMANENT l'edge du Vol d'Icare (−STEP par niveau,
// plancher ICARUS_EDGE_FLOOR).
// ⚠ WING_STEP × WING_MAX_LEVEL EST LE PLAFOND DE CETTE LIGNÉE : l'edge résiduel à
// ailes 6 vaut ICARUS_EDGE − WING_STEP × 6, et le RTP d'Icare vaut 1 − edge. C'est
// donc ici, et nulle part ailleurs, que se décide ce que les 3 715 Faveur d'ailes
// peuvent acheter. Relevé de 0.023 à 0.027 le 2026-07-17 : à 0.023, le sommet PAYANT
// (95,8 %) finissait sous le vingt-et-un GRATUIT (98,2 %, aucun augment) — un
// investissement qui laissait le joueur moins bien que celui qui n'achetait rien.
// À 0.027 : edge 0.18 − 0.162 = 0.018 → 98,2 %, l'échelle payante rejoint le sommet
// du skill, pour le même prix.
export const WING_STEP = 0.027;           // −2.7 pts d'edge par aile
// Ailes 7-8 : les rangs d'IMPRIMANTE (la bascule, 2026-07-17). L'edge devient
// NÉGATIF : ailes 7 → −0,9 % (RTP 100,9 %), ailes 8 → −3,6 % (RTP 103,6 %).
// La loi C = (1−e)/U l'encaisse naturellement : à e < 0, P(C = 1) = 0 — la cire
// est PARFAITE, plus jamais de braise au décollage, et c'est exactement le récit
// du sommet. Sous ailes 6 (la bascule d'Icare), rien ne change.
export const WING_MAX_LEVEL = 8;
export const WING_BASCULE_LEVEL = 6;      // ≤ 6 : RTP < 1 strict (garde-fou A9)
// Le plancher est devenu le PLAFOND DE L'IMPRIMANTE : l'edge ne descend jamais
// sous −4 %, quel que soit ce qu'une future retouche empilera. C'est LA borne
// dure du robinet d'Icare (ailes 8 → −3,6 %, le plancher ne mord pas encore).
export const ICARUS_EDGE_FLOOR = -0.04;
export const WING_COST_BASE = 90;
export const WING_COST_GROWTH = 1.8;
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
// le pont vers le cœur du jeu. Re-jouable (coût fixe), effet temporaire remis à
// zéro à l'effondrement.
export const BLESSING_MULT = 1.5;         // +50 % de production
export const BLESSING_DURATION_S = 180;   // 3 minutes
export const BLESSING_COST = 60;          // Faveur par bénédiction (~1 h de tronc)

// ── Le Vol d'Icare (crash game du temple) ────────────────────────────────────
// Un multiplicateur grimpe en continu (m = e^(K·t)) ; le soleil frappe à un
// point tiré à l'envol : C = (1-EDGE)/U, U~uniforme — donc encaisser à une
// cible m réussit avec p = (1-EDGE)/m. MONNAIE FERMÉE (2026-07-16) : mise en
// FAVEUR, payout = mise × m → RTP = 1-EDGE par construction (déjà borné < 1,
// aucune normalisation requise). Les ailes cirées abaissent l'edge → le WIN
// RATE monte, les paiements (mise × cible) ne bougent pas — même contrat que
// les dés pipés aux osselets. Se poser à ×JACKPOT rafle la cagnotte.
export const ICARUS_EDGE = 0.18;            // part de la maison (très bas odds early ; abaissée par les ailes cirées, booster)
export const ICARUS_CAP = 100;              // multiplicateur maximal (~33 s de vol)
export const ICARUS_K = Math.LN2 / 5;       // ×2 à 5 s, ×10 à ~16,6 s, ×100 à ~33 s
export const ICARUS_JACKPOT_MULT = 10;      // se poser à ×10+ rafle la cagnotte
// Mise qui rafle la cagnotte ENTIÈRE (cf. potRakeShare, actions/templePot.js). En
// dessous, la rafle est au PRORATA : Plume 4 → 16 %, Hécatombe 25 → 100 %. Avant,
// la rafle ignorait la mise et une Plume à 4 emportait tout — ce qui faisait d'Icare
// ciblé ×10 une imprimante à 118,7 % dès le 1er jour (mesuré par A9) et rendait la
// petite mise strictement dominante. Calée sur la mise haute d'Icare et du 21.
export const RAFLE_MISE_PLEINE = 25;
export const ICARUS_HISTORY_LEN = 12;       // derniers points de crash affichés
export const ICARUS_STAKES = [              // mises en FAVEUR
  { id: "plume", faveur: 4, label: { fr: "Plume", en: "Feather" } },
  { id: "aile", faveur: 10, label: { fr: "Aile", en: "Wing" } },
  { id: "hecatombe", faveur: 25, label: { fr: "Hécatombe", en: "Hecatomb" } }
];
// Valeur COMPTABLE d'un vol offert (mise Plume), pour la normalisation des
// osselets (cf. auguryPaytable). Un vol offert paie sans que le joueur mise :
// son espérance vaut mise × (1 − edge), et l'edge du joueur dépend de ses ailes.
// On compte au PLANCHER (l'edge le plus bas possible) : la valeur comptée MAJORE
// toujours la valeur réelle, donc la table reste sous le cap quel que soit
// l'équipement — même logique conservatrice que le majorant A9.
export const FREE_FLIGHT_EV = 4 * (1 - ICARUS_EDGE_FLOOR);

// ── Tickets à gratter (jeu du temple) ────────────────────────────────────────
// MONNAIE FERMÉE (2026-07-16) : mise et gain en FAVEUR. Grille 3×3 : l'ISSUE
// (un symbole gagnant ou « blanc ») est tirée par UN seul Math.random pondéré,
// la grille est ensuite peinte pour matcher (le symbole 3 fois = gain). Un
// ticket nourrit la cagnotte PARTAGÉE (state.icarusPotFaveur) sur son EDGE, et
// cette table ne la rafle JAMAIS (le Soleil a cessé de rafler le 2026-07-17 : il
// offre un vol). Gain = round(mise × payoutMult). Espérance NÉGATIVE par
// construction : E[payoutMult] = 0.82 → edge maison ≈ 18 %, 27 % de tickets
// gagnants (la plupart PERDANTS) — le jeu le plus dur du temple, assumé.
export const SCRATCH_HISTORY_LEN = 12;       // derniers tickets affichés (bandeau)
// % de vernis gratté déclenchant l'auto-révélation. Relevé de 60 à 74 le
// 2026-07-17 : à 60 %, le ticket se déverrouillait avant que les 9 alvéoles soient
// lisibles (le joueur voyait l'issue tomber sans l'avoir découverte). Se règle AVEC
// SCRATCH_RADIUS (ScratchStage.jsx) : les deux décident du nombre de passes, et
// monter le seuil sans réduire le rayon ne fait qu'allonger le même interrupteur.
// Ne pas pousser trop haut : la dernière tranche, ce sont les coins arrondis, donc
// du geste sans information.
export const SCRATCH_REVEAL_PCT = 74;
export const SCRATCH_STAKES = [              // mises en FAVEUR
  { id: "obole", faveur: 4, label: { fr: "Obole", en: "Obol" } },
  { id: "drachme", faveur: 8, label: { fr: "Drachme", en: "Drachma" } },
  { id: "talent", faveur: 20, label: { fr: "Talent", en: "Talent" } }
];
// Table des lots — poids /1000, payoutMult (×secondes×K pour la Faveur). Le
// « blank » (perte) domine. `venus` offre en plus un vol d'Icare (mise Plume) ;
// `soleil` RENVOIE À ICARE avec un billet à la hauteur du ticket (sunFlight).
// Les poids somment à SCRATCH_WEIGHT_TOTAL.
//
// ⚠ Le Soleil NE RAFLE PLUS la cagnotte (2026-07-17). Cette seule case causait
// cinq problèmes : (1) elle raflait le pot ENTIER quelle que soit la mise, donc
// l'obole à 4 achetait le même magot que le talent à 20 et le dominait strictement
// (le ticket haut de gamme était mort) ; (2) elle ouvrait le spam d'obole sur pot
// gras ; (3) elle bradait à 4 Faveur et deux clics ce qu'Icare réserve
// explicitement au jeu manuel et tendu ; (4) elle était annoncée quatre fois comme
// la mécanique vedette pour un événement à 2/1000 ; (5) elle faisait du gratteux
// un rafleur alors qu'il est le puits le plus pur du temple. Icare redevient le
// SEUL rafleur, conformément à l'intention déjà écrite dans son propre code.
// (le champ `sweep` a disparu avec la rafle : plus personne ne le lisait.)
export const SCRATCH_PRIZES = [
  { symbol: "blank", weight: 730, payoutMult: 0 },
  { symbol: "olive", weight: 138, payoutMult: 1.2 },
  { symbol: "amphore", weight: 70, payoutMult: 2.4 },
  { symbol: "laurier", weight: 36, payoutMult: 4.5 },
  { symbol: "trepied", weight: 17, payoutMult: 8 },
  { symbol: "chouette", weight: 5, payoutMult: 16 },
  { symbol: "venus", weight: 2, payoutMult: 40, freeFlight: true },
  { symbol: "soleil", weight: 2, payoutMult: 15, sunFlight: true }
];
// Le billet du Soleil suit la mise du ticket : il envoie à Icare avec de quoi
// rafler à la hauteur du risque pris (cf. potRakeShare, templePot.js). C'est ce qui
// rend enfin la mise du gratteux décidable — avant, la rafle ignorait la mise.
export const SCRATCH_SUN_FLIGHT = { obole: "plume", drachme: "aile", talent: "hecatombe" };

// Les planches du graveur (2026-07-17, arbitrage Raphaël) — LA courbe de
// rendement du gratteux, qui n'en avait aucune (83,9 % à vie, seul jeu du temple
// sans échelle). Chaque niveau déplace GRAVEUR_WEIGHT_SHIFT points de poids du
// « blank » vers les symboles gagnants, au prorata de leurs poids : LE WINRATE
// MONTE, LES PAIEMENTS NE BOUGENT PAS — exactement le contrat des dés pipés.
// À 5 niveaux × 6 points : P(gain) 27 % → 30 %, RTP ~84 % → ~93 % (le gratteux
// reste le jeu dur du temple, sous les échelles à 98-99 %). La table effective
// et le RTP de référence vivent dans scratch.js (scratchPrizesEff/scratchRtpRef :
// ils dépendent du niveau, une constante ne suffit plus — feedPot doit lire le
// VRAI rendement du joueur, vols offerts compris, sinon le versement à la
// cagnotte serait trop gros et rongerait l'invariant).
// NB : « tesson » aurait été le nom naturel mais c'est déjà le symbole INERTE
// des grilles — le graveur frappe les planches, il ne polit pas les tessons.
// Niveaux 6-10 : les rangs d'IMPRIMANTE du gratteux (la bascule, 2026-07-17).
// Au niveau 10, 60 points de poids ont migré (blank 730 → 670, toujours
// dominant) : P(gain) ≈ 33 %, RTP obole ≈ 102,5 %, talent ≈ 100,8 %. Sous le
// niveau 5 (la bascule du gratteux), rien ne change.
export const GRAVEUR_MAX_LEVEL = 10;
export const GRAVEUR_BASCULE_LEVEL = 5;   // ≤ 5 : RTP < 1 strict (garde-fou A9)
export const GRAVEUR_WEIGHT_SHIFT = 6;    // points de poids /1000 déplacés par niveau
export const GRAVEUR_COST_BASE = 200;
export const GRAVEUR_COST_GROWTH = 1.6;   // 200..1311 les 5 premiers, ~13,7k le 10e

// ── Vingt-et-un (jeu du temple) ──────────────────────────────────────────────
// Blackjack antique : MONNAIE FERMÉE (2026-07-16), mise et gain en FAVEUR.
// TOUR PAR TOUR (tirer/rester), PAS de timer — un rechargement en pleine main
// abandonne la mise (état module éphémère, comme le vol d'Icare). Le croupier
// (l'oracle) tire jusqu'à BLACKJACK_DEALER_STAND. Un « naturel » (21 en 2 cartes)
// paie ×2,5. Chaque main nourrit la cagnotte PARTAGÉE sur son EDGE ; pas de rafle
// (jeu de skill, pas de jackpot). Gain = round(mise × mult) — push (1) rend la mise.
export const BLACKJACK_HISTORY_LEN = 12;      // dernières mains affichées (bandeau)
// RTP de RÉFÉRENCE du vingt-et-un — le plafond du MEILLEUR jeu joignable, celui
// que feedPot doit connaître (le sous-estimer gonflerait le versement à la
// cagnotte). MESURÉ, pas estimé : bench-temple.js (1 M de mains, fonctions pures
// du moteur) donne stratégie de base 98,2 %, + LE DOUBLE 99,57 %, + LA REFENTE
// 100,3 % ± 0,13 pt. La constante MAJORE ce meilleur jeu (garde-fou A11).
// LA REFENTE EST LA BASCULE DU 21 (2026-07-17, arbitrage Raphaël) : refusée tant
// que l'imprimante était un bug, elle devient le rang d'imprimante du jeu
// maintenant qu'elle est un DESIGN — 100,3 % de base, la plus fine des quatre
// marges. REF > 1 : feedPot clampe (1 − rtp ≤ 0), cette table ne verse plus rien
// à la cagnotte au sommet, ce qui est exact : elle n'a plus d'edge à recycler.
// À re-mesurer si BLACKJACK_MULT ou BLACKJACK_DEALER_STAND bougent.
export const BLACKJACK_RTP_REF = 1.01;
// RTP de l'AUTO — distinct de la référence ci-dessus. `resolveBlackjackHeadless`
// appelle `basicAction` sans `allowDouble` et ne refend jamais : l'auto joue la
// base SEULE, qui est SOUS 1. Prendre BLACKJACK_RTP_REF pour son badge inversait
// le signe (badge +195 ✦/h à la royale, réalité −351 ✦/h) : un joueur qui suivait
// l'UI perdait de la Faveur en croyant en gagner. MESURÉ comme le reste, sur le
// chemin exact de l'auto (3 × 1 M de mains, fonctions pures du moteur) :
// 98,057 / 97,939 / 98,095 % → 98,03 % ± 0,08. Ne sert QU'au badge : feedPot
// continue de lire REF (majorer le meilleur jeu est ce qui borne le versement).
// À re-mesurer si basicAction, BLACKJACK_MULT ou BLACKJACK_DEALER_STAND bougent.
export const BLACKJACK_RTP_AUTO = 0.980;
export const BLACKJACK_DEALER_STAND = 17;     // le croupier reste à 17+ (soft 17 compris)
export const BLACKJACK_MULT = { blackjack: 2.5, win: 2, push: 1, lose: 0 }; // × la mise (Faveur)
export const BLACKJACK_STAKES = [             // mises en FAVEUR
  { id: "legere", faveur: 4, label: { fr: "Mise légère", en: "Light bet" } },
  { id: "pleine", faveur: 10, label: { fr: "Mise pleine", en: "Full bet" } },
  { id: "royale", faveur: 25, label: { fr: "Grand jeu", en: "High stakes" } }
];

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
// stratégie de base (basicAction), jamais le double, et ne compte ni série ni
// historique (parité avec l'auto-Icare qui ne rafle pas : la main se joue aussi
// à la main).
export const AUTO_OSSELETS_UNLOCK_COST = 700;        // Faveur pour l'auto-lancé des osselets (late : n'a de sens qu'à edge adouci)
export const AUTO_ICARUS_UNLOCK_COST = 350;          // Faveur pour l'autopush d'Icare
// 350 → 520 (phase 6) : compense le robinet doublé — (520 − 60)/2 = 230 min,
// A5 exige ≥ 3,5 h d'épargne stricte avant l'auto-relève.
export const AUTO_TRUNK_UNLOCK_COST = 520;           // Faveur pour l'auto-relève du tronc des offrandes
export const AUTO_SCRATCH_UNLOCK_COST = 500;         // Faveur pour l'auto-gratteux
export const AUTO_BLACKJACK_UNLOCK_COST = 700;       // Faveur pour l'auto-vingt-et-un

// ── Artefacts du Temple (Phase 4 : arbre de lignées, refontes de RISQUE) ──────
// Débloqués en Faveur, ÉTERNELS (state.templeArtifacts, cf. GR_PERSISTENT_FIELDS).
// Ce sont des PROFILS DE RISQUE (pas des sticks de stats). Lignée OSSELETS :
// dé d'ivoire (coupe la queue du Chien + plus de Vénus, à taux de victoire égal)
// → osselet du noyé (les revers nourrissent DOUBLE la cagnotte). Lignée ICARE :
// plumes de secours (consolation Faveur au crash) → ailes solaires (plafond
// relevé). Chaque lignée se termine par son automatisation (rang capstone).
export const TEMPLE_ARTIFACT_IDS = [
  "ivoire", "noye", "echelle", "interdit",               // lignée osselets
  "plumes", "souffle", "solaires", "serres", "colombier", // lignée Icare
  "coin", "relance",                                      // lignée gratteux
  "voix", "mesure", "double", "refente",                  // lignée vingt-et-un
  "char", "corne", "oeil"                                 // les Reliques (le trésor)
];
export const IVORY_DOG_CUT = 0.20;      // dé d'ivoire : dogShare 0.4 → 0.2 (moitié moins de Chiens)
export const IVORY_VENUS_BONUS = 0.10;  // …et venusShare 0.15 → 0.25 (plus de Vénus), à pEff constant
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
// (potRakeShare ×1.5 : Plume 16 → 24 %, Aile 40 → 60 %). SORTIE de pot
// uniquement : on a démontré (cf. templePot.js / bench A9) que la sortie ne
// change pas le RTP long terme — c'est un achat de TEMPO, pas de rendement.
export const SERRES_RAKE_MULT = 1.5;
// Le colombier du guetteur : la file de vols offerts passe de 5 à 8 (les billets
// gagnés ne se perdent plus quand elle est pleine) et le guetteur note 24 vols
// au lieu de 12 (l'historique des pastilles est la meilleure lecture de l'edge).
export const FLIGHTS_MAX_COLOMBIER = 8;
export const ICARUS_HISTORY_COLOMBIER = 24;
export const ARTIFACT_IVOIRE_COST = 300;   // Faveur
export const ARTIFACT_NOYE_COST = 260;
export const ARTIFACT_PLUMES_COST = 380;
export const ARTIFACT_SOLAIRES_COST = 520;
export const ARTIFACT_ECHELLE_COST = 350;  // osselets : le quitte ou double s'enchaîne
export const ARTIFACT_INTERDIT_COST = 500; // osselets : le 4e rite (mise 20, spread 2.5)
export const ARTIFACT_SOUFFLE_COST = 450;
export const ARTIFACT_SERRES_COST = 550;
export const ARTIFACT_COLOMBIER_COST = 200;
export const ARTIFACT_COIN_COST = 240;     // gratteux : une case arrive dégagée
export const ARTIFACT_RELANCE_COST = 420;  // gratteux : la cella rejoue un ticket perdant
export const ARTIFACT_VOIX_COST = 150;     // vingt-et-un : l'oracle parle (séries)
export const ARTIFACT_MESURE_COST = 250;   // vingt-et-un : le conseil de la mesure
export const ARTIFACT_DOUBLE_COST = 1200;  // vingt-et-un : le double (skill-gaté, cf. BLACKJACK_RTP_REF)
// Le quitte ou double des osselets s'enchaîne jusqu'à N crans avec l'Échelle de
// Vénus (1 sans elle). Chaque cran est à EV EXACTEMENT nulle (p = 0.5, gain =
// +wager) : enchaîner ne déplace pas le RTP d'un dixième, A8/A9 intacts par
// construction. C'est un achat de DÉCISION et de variance, le seul vrai levier
// stratégique de la table.
export const AUGURY_DOUBLE_MAX_CRANS = 3;
// La refente : le rang d'IMPRIMANTE du vingt-et-un (cf. BLACKJACK_RTP_REF).
export const ARTIFACT_REFENTE_COST = 4000;

// ── LES COFFRES DU TEMPLE (la mise multipliée, 2026-07-17) ───────────────────
// Le moteur exponentiel de l'arbitrage « imprimante à vie » : chaque rang
// MULTIPLIE PAR 10 la mise maximale des quatre jeux (gains au prorata — la
// machinerie existe déjà partout : payout = mise × mult). Le débit d'impression
// est donc net/h = cadence × mise × marge : ×10 par rang de coffre. LE FREIN qui
// rend l'exponentielle jouable : le rang suivant coûte ~10× le précédent, donc
// chaque palier se farme en un temps À PEU PRÈS CONSTANT (~une demi-journée au
// meilleur build, « classique » — calibré par A14 au bench). Les chiffres
// deviennent absurdes, mais par paliers GAGNÉS.
export const COFFRE_MAX_LEVEL = 8;        // mise ×10^8 au sommet (extensible)
export const COFFRE_COST_BASE = 16_000;   // rang 1 ≈ 12 h au meilleur débit ×1
export const COFFRE_COST_GROWTH = 10;     // suit le débit : temps de farm constant

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
