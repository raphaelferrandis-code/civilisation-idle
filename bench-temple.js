"use strict";
/* ============================================================================
 * bench-temple.js - Rapport d'equilibrage des JEUX DU TEMPLE EN FAVEUR.
 *
 * Valide le systeme CABLE dans le jeu (2026-07-16) : mise des osselets en
 * FAVEUR (monnaie fermee), financee par le tronc des offrandes ; gains
 * NORMALISES sur un RTP cible < 1 (anti-imprimante), Clemence = rabais de
 * mise. TOUT vient du vrai code : auguryPaytable / auguryBaseOdds /
 * auguryTierOdds / clemencyCrans (src/game/core/**) et les constantes de
 * balance.js - le rapport se regenere apres chaque retouche d'equilibrage.
 *   1. Analytique EXACTE : RTP par rite x des pipes x ivoire, paytables
 *      affichees, deviation d'arrondi, assertion anti-imprimante.
 *   2. Monte Carlo seede : sessions actives de 8 h (tronc + politiques de
 *      joueur), temps d'acces aux achats, exploit du mode Clemence-odds
 *      (contrefactuel : pourquoi le rabais a ete retenu).
 *
 * Sortie : temple-faveur-impact.md (+ tables console).
 * Usage  : node bench-temple.js
 * ========================================================================== */
import fs from "fs";

// --- Stubs DOM (avant imports jeu) -----------------------------------------
global.window = {};
global.localStorage = { getItem() { return null; }, setItem() {} };
Object.defineProperty(global, "navigator", { value: { clipboard: { writeText() {} } }, writable: true, configurable: true });
const stubEl = () => ({ className: "", dataset: {}, innerHTML: "", textContent: "", disabled: false, value: "", checked: false, style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, addEventListener() {}, setAttribute() {}, showModal() {}, remove() {}, click() {}, appendChild() {}, querySelector() { return stubEl(); }, querySelectorAll() { return []; } });
global.document = { addEventListener() {}, documentElement: { style: { setProperty() {} } }, body: { appendChild() {} }, querySelector() { return stubEl(); }, querySelectorAll() { return []; }, createElement() { return stubEl(); }, getElementById() { return stubEl(); } };
global.Audio = class { constructor() { this.volume = 1; } addEventListener() {} play() { return Promise.resolve(); } pause() {} };
global.render = () => {}; global.save = () => {};

// --- Imports jeu ------------------------------------------------------------
const stateModule = await import("./src/game/core/state.js");
const { state, defaultState, setState } = stateModule;
const { clemencyCrans } = await import("./src/game/core/mechanics.js");
// actions.js d'abord : ordre d'evaluation du jeu reel (cycle augures <-> templeAutomation).
await import("./src/game/core/actions.js");
const { auguryTierOdds, auguryBaseOdds, auguryPaytable, AUGURY_RITES } = await import("./src/game/core/actions/augures.js");
// Les 3 autres jeux (A9) : fonctions PURES + lecteurs d'artefacts du vrai code.
const { potRecycle } = await import("./src/game/core/actions/templePot.js");
const { icarusEffectiveEdge, icarusEffectiveCap } = await import("./src/game/core/actions/icarus.js");
const { scratchRtpRef, scratchPrizesEff } = await import("./src/game/core/actions/scratch.js");
const { blackjackResult, handValue, isBlackjack, BLACKJACK_SUITS } = await import("./src/game/core/actions/blackjack.js");
const bal = await import("./src/game/core/balance.js");
const {
  GAMBLE_P_MAX, GAMBLE_HISTORY_LEN,
  DICE_BOOST_MAX_LEVEL,
  AUGURY_STAKES, AUGURY_RTP_CAP,
  AUGURY_CLEMENCY_LADDER,
  TRUNK_RATE_PER_S, TRUNK_CAP,
  DICE_COST_BASE, DICE_COST_GROWTH,
  WING_COST_BASE, WING_COST_GROWTH, BLESSING_COST,
  AUTO_OSSELETS_UNLOCK_COST, AUTO_TRUNK_UNLOCK_COST,
  // A9 : lois des 3 autres jeux (le versement passe par potRecycle() du vrai code).
  WING_MAX_LEVEL,
  ICARUS_STAKES, ICARUS_JACKPOT_MULT,
  SCRATCH_PRIZES, SCRATCH_STAKES, SCRATCH_SUN_FLIGHT,
  BLACKJACK_STAKES, BLACKJACK_RTP_REF, BLACKJACK_MULT, BLACKJACK_DEALER_STAND,
  // LA BASCULE (2026-07-17, arbitrage Raphael « imprimante volontaire ») : les
  // niveaux au-dela desquels chaque table IMPRIME deliberement, et le robinet
  // (coffres + reliques) qu'A14 calibre.
  AUGURY_REF_DICE_LEVEL, WING_BASCULE_LEVEL, GRAVEUR_BASCULE_LEVEL, GRAVEUR_MAX_LEVEL,
  COFFRE_COST_BASE, COFFRE_COST_GROWTH, COFFRE_MAX_LEVEL,
  RELIC_CHAR_COST, RELIC_CORNE_COST, RELIC_OEIL_COST,
  AUTO_AUGURY_INTERVAL_MS, AUTO_ICARUS_INTERVAL_MS, AUTO_SCRATCH_INTERVAL_MS
} = bal;

const NOW = 1_000_000_000_000;
Date.now = () => NOW;
setState(defaultState());

/* ============================================================================
 * Les curseurs VALIDES ici sont ceux de balance.js (cables 2026-07-16 -
 * arbitrage Raph : jouer tot et souvent, MAIS bonus etales dans le temps et
 * chers ; early peu rentable, de mieux en mieux via les augments). L'objet
 * PROPOSAL n'est qu'un alias local lisible vers ces constantes.
 * ========================================================================== */
const PROPOSAL = {
  TRUNK_PER_S: TRUNK_RATE_PER_S,
  TRUNK_CAP,
  STAKES: AUGURY_STAKES,
  RTP_CAP: AUGURY_RTP_CAP,
  CLEMENCY_LADDER: AUGURY_CLEMENCY_LADDER, // echelle ENTIERE (2026-07-17)
  DICE_COST: { base: DICE_COST_BASE, growth: DICE_COST_GROWTH },
  WING_COST: { base: WING_COST_BASE, growth: WING_COST_GROWTH },
  BLESSING: BLESSING_COST,
  AUTO_COLLECT: AUTO_TRUNK_UNLOCK_COST,
  AUTO_PLAY: AUTO_OSSELETS_UNLOCK_COST
};
// L'ancienne Clemence (bonus d'odds, +5 pts/cran) n'existe plus dans le jeu -
// gardee ICI seulement pour la simulation CONTREFACTUELLE du mode "odds"
// (documente pourquoi le rabais de mise a ete retenu).
const LEGACY_CLEMENCY_PER_LOSS = 0.05;
const AUGURY_ID = "prayForRain"; // id interne de la table (conserve)

// --- PRNG seede (rapport stable entre runs -> diffs git propres) ------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Contexte de calcul (mute state pour les vraies formules) ---------------
function setContext(diceLevel = 0, ivory = false) {
  state.diceLevel = diceLevel;
  state.templeArtifacts = ivory ? { ivoire: true } : {};
}

// pEff2 du mode "odds" CONTREFACTUEL (l'ancienne Clemence, retiree du jeu).
function pEffWithCrans(pEff, crans) {
  return Math.min(GAMBLE_P_MAX, pEff + crans * LEGACY_CLEMENCY_PER_LOSS);
}
// Validation : le comptage local des crans du MC == la vraie clemencyCrans
// (historique synthetique : les Chiens comptent double).
{
  for (let c = 0; c <= 10; c++) {
    const dogs = Math.max(0, c - GAMBLE_HISTORY_LEN);
    const hollows = Math.min(GAMBLE_HISTORY_LEN, c) - dogs;
    state.gambleHistory = { [AUGURY_ID]: [...Array(dogs).fill(2), ...Array(hollows).fill(0)] };
    if (clemencyCrans(AUGURY_ID) !== c) throw new Error(`crans divergents a ${c}: ${clemencyCrans(AUGURY_ID)}`);
  }
  state.gambleHistory = {};
}

/* ============================================================================
 * 1. ANALYTIQUE - paytable normalisee et RTP exacts
 * ========================================================================== */

// Paytable d'un (rite, des, ivoire) : la VRAIE auguryPaytable du jeu (gains
// entiers FIXES a travers les niveaux de des, normalises SOUS AUGURY_RTP_CAP
// au win rate de REFERENCE = des max - cf. actions/augures.js). Le bench ne
// duplique plus l'algo : il valide le code cable. rtpReal = RTP EFFECTIF aux
// odds courantes (monte avec les des) ; rtpRef = RTP au point de reference.
function payTable(riteId, diceLevel, ivory) {
  setContext(diceLevel, ivory);
  const pay = auguryPaytable(AUGURY_ID, riteId);
  return {
    riteId, stake: pay.stake, diceLevel, ivory, pEff: pay.pEff, odds: pay.odds,
    gains: { ...pay.gains, hollow: 0, dog: 0 }, rtpRef: pay.rtpRef, rtpCap: pay.rtpCap, rtpReal: pay.rtp
  };
}

// Le rite interdit entre dans TOUS les balayages (analytique, A9, Monte Carlo
// des tables) : auguryPaytable ne gate pas (seul castAugury exige l'artefact),
// donc le bench mesure la table telle qu'un possesseur la jouera.
const RITES = ["prudent", "classique", "grand", "interdit"];
const DICE_STEPS = [0, 3, 5, 8, 10, 11, 13]; // 11-13 : la bascule (rtp > 1 assume)
const analytic = [];
for (const r of RITES) for (const d of DICE_STEPS) analytic.push(payTable(r, d, false));
const analyticIvory = [];
for (const r of RITES) for (const d of DICE_STEPS) analyticIvory.push(payTable(r, d, true));

// Garde-fous analytiques.
const guards = [];
{
  let worst = { dev: 0 }; let printer = null; let weakGain = null; let payDrift = null; let noBascule = null;
  for (const r of RITES) for (const iv of [false, true]) {
    const base = payTable(r, 0, iv);
    for (let d = 0; d <= DICE_BOOST_MAX_LEVEL; d++) {
      const t = payTable(r, d, iv);
      // SOUS L'ANCRE (des <= AUGURY_REF_DICE_LEVEL) : jamais imprimante. AU-DELA
      // (la bascule, 2026-07-17) : rtp > 1 est VOULU — c'est le debit de
      // l'imprimante, calibre par A14, pas une fuite.
      if (d <= AUGURY_REF_DICE_LEVEL && (t.rtpReal >= 1 || t.rtpRef >= t.rtpCap)) printer = printer || t;
      if (t.rtpRef >= t.rtpCap) printer = printer || t; // l'ancre elle-meme ne bouge jamais
      const dev = t.rtpCap - t.rtpRef; // sous-performance d'arrondi au point de reference
      if (dev > worst.dev) worst = { dev, t };
      // LE CONTRAT (arbitrage Raph 2026-07-16) : les paiements ne bougent pas avec les des.
      if (t.gains.venus !== base.gains.venus || t.gains.triple !== base.gains.triple || t.gains.pair !== base.gains.pair) {
        payDrift = payDrift || t;
      }
      for (const tier of ["venus", "triple", "pair"]) {
        if (t.gains[tier] <= t.stake) weakGain = weakGain || { t, tier };
      }
    }
    // Et la bascule EXISTE : au niveau max, la table imprime bien (sinon les
    // dés 11-13 vendent du vent).
    if (payTable(r, DICE_BOOST_MAX_LEVEL, iv).rtpReal <= 1) noBascule = noBascule || r;
  }
  guards.push({
    id: "A1 anti-imprimante SOUS L'ANCRE (des <= " + AUGURY_REF_DICE_LEVEL + ")", pass: !printer && !noBascule,
    note: printer
      ? `RTP eff ${printer.rtpReal.toFixed(3)} ou ref ${printer.rtpRef.toFixed(3)} hors borne (${printer.riteId}, des ${printer.diceLevel}, ivoire ${printer.ivory})`
      : noBascule
        ? `la bascule n'existe pas au rite ${noBascule} : rtp <= 1 a des ${DICE_BOOST_MAX_LEVEL}`
        : `RTP effectif < 1 jusqu'a l'ancre (des ${AUGURY_REF_DICE_LEVEL}) et rtpRef < cap partout ; des ${DICE_BOOST_MAX_LEVEL} : la bascule imprime (voulu, cf. A14)`
  });
  guards.push({
    id: "A2 arrondi", pass: worst.dev <= 0.03,
    note: `pire deviation d'arrondi ${(worst.dev * 100).toFixed(2)} pts sous le cap (${worst.t.riteId}${worst.t.ivory ? ", ivoire" : ""}) - tolerance 3 pts (toujours SOUS)`
  });
  guards.push({
    id: "A3 gagner paie", pass: !weakGain,
    note: weakGain
      ? `gain ${weakGain.tier} <= mise (${weakGain.t.riteId}, des ${weakGain.t.diceLevel})`
      : "chaque issue gagnante rend STRICTEMENT plus que la mise, partout"
  });
  guards.push({
    id: "A8 paiements FIXES vs des", pass: !payDrift,
    note: payDrift
      ? `la paytable bouge avec les des (${payDrift.riteId}, des ${payDrift.diceLevel}${payDrift.ivory ? ", ivoire" : ""})`
      : "les des pipes ne changent AUCUN paiement : seul le win rate monte (contrat Raph)"
  });
}

/* ============================================================================
 * 1 bis. A9 - RTP TOTAL, CAGNOTTE COMPRISE, POUR LES 4 JEUX
 *
 * POURQUOI CE GARDE-FOU EXISTE. A1..A8 passent TOUS par auguryPaytable : ils ne
 * voient qu'un jeu sur quatre, et ils ignorent la cagnotte. Or la cagnotte
 * n'est PAS un puits. En solo, tout ce qui y entre revient au MEME joueur (elle
 * se rafle a Icare a x10 et aux trois Soleils du gratteux). C'est un PAIEMENT
 * DIFFERE, pas un prelevement. Le RTP reel n'est donc pas rtp_base mais :
 *
 *     rtp_total = rtp_base + part_versee_au_pot + consolations_mintees
 *
 * LE VICE DE CONSTRUCTION : la part est prelevee sur la MISE (0.25 a 0.5) alors
 * que l'edge ne prend que 0.02 a 0.18 de cette meme mise. On rend plus que ce
 * qu'on prend. Les plumes minttent en plus round(mise x 0.5) a chaque crash.
 *
 * HYPOTHESE, ASSUMEE ET CONSERVATRICE : le joueur finit par vider le pot. Elle
 * MAJORE le RTP, ce qui est exactement ce qu'un anti-imprimante doit faire. Ce
 * n'est pas une approximation pessimiste, c'est la strategie dominante mesuree
 * (gonfler le pot au vingt-et-un, le rafler en vols a 4 Faveur). C'est pour
 * cela que le vingt-et-un apparait ici au-dessus de 1 alors qu'il ne peut
 * JAMAIS rafler : il REMPLIT un pot que le joueur reprendra a une autre table.
 *
 * POURQUOI potRakeShare N'APPARAIT PAS DANS CE CALCUL (contre-intuitif, et c'est
 * le point le plus important du fichier). La rafle au PRORATA de la mise (phase 2,
 * actions/templePot.js) ne change RIEN a ce RTP, parce qu'elle ne borne que le
 * DEBIT de sortie, jamais l'ENTREE. Le pot converge vers un equilibre stable
 *     pot* = (1-p) x part_versee x mise / (p x rake_share)
 * (~112 Faveur pour une Plume a la cible x10 : le plafond ICARUS_POT_CAP_FAVEUR ne
 * mord jamais), et A CET EQUILIBRE sortie = entree PAR DEFINITION. Donc tout ce qui
 * est verse revient, quelle que soit la part raflee, tant qu'elle est > 0.
 * Le prorata repare une DECISION (la mise cesse d'etre neutre, la petite mise cesse
 * de dominer) ; il ne repare pas l'economie. Le seul correctif possible est de
 * borner ce qui ENTRE dans le pot par l'EDGE et non par la mise (phase 4, feedPot) :
 *     rtp_total = rtp_base + recycle x (1 - rtp_base) < 1  pour tout recycle < 1
 * Corollaire a ne pas oublier : mettre rake_share a 0 ne serait PAS un correctif
 * non plus, ce serait juste un pot qui gonfle jusqu'au plafond et jette le surplus.
 *
 * Ce bloc remplace l'hypothese qui a laisse passer les imprimantes : « leurs
 * lois sont deja bornees par construction ». Elle etait fausse.
 * ========================================================================== */

const SCRATCH_W_TOTAL = SCRATCH_PRIZES.reduce((s, p) => s + p.weight, 0);

// Pose le contexte d'artefacts lu par le VRAI code (hasTempleArtifact).
function setArtifacts(ids = []) {
  state.templeArtifacts = Object.fromEntries(ids.map((id) => [id, true]));
}

// Le versement du VRAI code (feedPot), en part de mise : recycle x (1 - rtp_base).
// On lit potRecycle() du jeu, donc l'osselet du noye et le clamp sont pris en
// compte tels qu'ils sont CABLES, pas tels qu'on les imagine.
function potFeedShare(rtpBase) {
  return potRecycle() * Math.max(0, 1 - rtpBase);
}

// --- Osselets ---------------------------------------------------------------
// rtp_base = la vraie paytable ; le pot est nourri sur l'EDGE, a chaque jet.
// Depuis le 2026-07-17, pay.rtp INCLUT la valeur du vol offert par Venus
// (normalisation flight-aware d'auguryPaytable, comptee au plancher d'edge) :
// le trou « +8,5 pts hors budget a des 10 + ivoire » est ferme A LA SOURCE,
// ce modele n'a donc rien a rajouter.
function a9Augures() {
  const rows = [];
  for (const r of RITES) for (const ivory of [false, true]) for (const noye of [false, true]) {
    for (let d = 0; d <= DICE_BOOST_MAX_LEVEL; d++) {
      const t = payTable(r, d, ivory);                 // setContext() pose les des + l'ivoire
      setArtifacts([...(ivory ? ["ivoire"] : []), ...(noye ? ["noye"] : [])]);
      const potFeed = potFeedShare(t.rtpReal);         // le noye boost le recycle (clampe)
      rows.push({
        jeu: "osselets", mise: t.stake,
        config: `${r}, des ${d}${ivory ? ", ivoire" : ""}${noye ? ", noye" : ""}`,
        bascule: d > AUGURY_REF_DICE_LEVEL,            // des 11-13 : l'imprimante voulue
        rtpBase: t.rtpReal, potFeed, mint: 0, rtpTotal: t.rtpReal + potFeed
      });
    }
  }
  setArtifacts([]);
  return rows;
}

// --- Icare ------------------------------------------------------------------
// C = max(1, (1-e)/U) est une loi de Pareto : P(C > T) = (1-e)/T, donc le payout
// mise x T rend un rtp_base PLAT en T (= 1-e). Tout ce qui n'est pas plat vient
// d'ailleurs : la part versee au pot, les plumes, et l'arrondi du payout.
// Les cibles balayees incluent le x10 (rafle) et les crans du cadran auto.
const A9_ICARUS_TARGETS = [1.2, 1.4, 1.9, 2, 5, ICARUS_JACKPOT_MULT, 25, 50];
function a9Icare() {
  const rows = [];
  for (const plumes of [false, true]) for (const solaires of [false, true]) {
    for (let w = 0; w <= WING_MAX_LEVEL; w++) {
      state.wingLevel = w;
      setArtifacts([...(plumes ? ["plumes"] : []), ...(solaires ? ["solaires"] : [])]);
      const e = icarusEffectiveEdge();
      const cap = icarusEffectiveCap();
      for (const stake of ICARUS_STAKES) for (const T of A9_ICARUS_TARGETS) {
        if (T > cap) continue;
        const pWin = Math.min(1, (1 - e) / T);          // P(C > T)
        // Payout : E[payRound(mise x T)] = mise x T EXACTEMENT (arrondi stochastique,
        // cf. templePot.js). Avec Math.round, ce terme depassait 1 tout seul sur les
        // petites mises (round(4 x 1.4) = 6 -> 102,6 % aux ailes 6) et aucun recyclage
        // ne pouvait le rattraper. Le RTP de base est desormais PLAT en cible = 1-e.
        const rtpBase = T * pWin;
        // Le versement suit l'EDGE DU JEU (1 - e), pas celui de la cible : c'est la
        // loi de feedPot, et elle ne depend pas de l'issue.
        const potFeed = potFeedShare(1 - e);
        // Les PLUMES ne mintent plus : elles PRELEVENT sur le pot. Ce qui sort du pot
        // est deja compte dans potFeed (tout ce qui y entre revient), donc la
        // consolation n'ajoute RIEN au RTP. C'etait +51 pts avant.
        const mint = 0;
        rows.push({
          jeu: "icare", mise: stake.faveur,
          config: `${stake.id}, cible x${T}, ailes ${w}${plumes ? ", plumes" : ""}${solaires ? ", solaires" : ""}`,
          bascule: w > WING_BASCULE_LEVEL,             // ailes 7-8 : edge negatif voulu
          rtpBase, potFeed, mint, rtpTotal: rtpBase + potFeed + mint
        });
      }
    }
  }
  state.wingLevel = 0;
  setArtifacts([]);
  return rows;
}

// --- Gratteux ---------------------------------------------------------------
// Le RTP vient de scratchRtpRef, LA fonction que feedPot lit dans le vrai code :
// table effective (planches du graveur, state.graveurLevel), arrondi reel du
// payout, ET valeur des vols offerts au plancher d'edge (majorant). Le balayage
// couvre les 6 niveaux du graveur — c'est la courbe de rendement du jeu
// (~84 % -> ~93 %), paiements FIXES (garde-fou A12).
// NB : cette table ne reprend JAMAIS la cagnotte (le Soleil ne rafle plus) ;
// ce qu'elle verse revient au joueur A UNE AUTRE TABLE (Icare x10) — d'ou le
// potFeed compte quand meme, cf. l'en-tete.
function a9Gratteux() {
  const rows = [];
  state.wingLevel = 0;
  setArtifacts([]);
  for (let lvl = 0; lvl <= bal.GRAVEUR_MAX_LEVEL; lvl++) {
    state.graveurLevel = lvl;
    for (const stake of SCRATCH_STAKES) {
      const rtpBase = scratchRtpRef(stake.id);
      const potFeed = potFeedShare(rtpBase);
      rows.push({
        jeu: "gratteux", mise: stake.faveur, config: `${stake.id}, graveur ${lvl}`,
        bascule: lvl > GRAVEUR_BASCULE_LEVEL,          // planches 6-10 : l'imprimante voulue
        rtpBase, potFeed, mint: 0, rtpTotal: rtpBase + potFeed
      });
    }
  }
  state.graveurLevel = 0;
  return rows;
}

// A12 — le contrat des planches du graveur : les PAIEMENTS ne bougent a AUCUN
// niveau (seuls les poids glissent du blank vers les gagnants) et la masse
// totale des poids est conservee (le tirage garde sa base de 1000).
function a12GraveurGuard() {
  let payDrift = null, massDrift = null;
  const base = SCRATCH_PRIZES;
  for (let lvl = 0; lvl <= bal.GRAVEUR_MAX_LEVEL; lvl++) {
    state.graveurLevel = lvl;
    const eff = scratchPrizesEff();
    for (let i = 0; i < base.length; i++) {
      if (eff[i].payoutMult !== base[i].payoutMult || eff[i].symbol !== base[i].symbol) payDrift = payDrift || lvl;
    }
    const tot = eff.reduce((s, p) => s + p.weight, 0);
    if (Math.abs(tot - SCRATCH_W_TOTAL) > 1e-9) massDrift = massDrift || lvl;
  }
  state.graveurLevel = 0;
  const ok = payDrift === null && massDrift === null;
  return {
    id: "A12 graveur : paiements FIXES, masse conservee",
    pass: ok,
    note: ok
      ? `payoutMult identiques et poids sommant a ${SCRATCH_W_TOTAL} sur les ${bal.GRAVEUR_MAX_LEVEL + 1} niveaux (contrat des des pipes)`
      : `derive au niveau ${payDrift ?? massDrift} (${payDrift !== null ? "PAIEMENT modifie" : "masse de poids alteree"})`
  };
}

// --- Vingt-et-un ------------------------------------------------------------
// Pas de forme fermee : Monte Carlo seede sur les fonctions PURES du vrai code
// (blackjackResult, handValue). Deux joueurs : la strategie de base (le plafond
// reel du skill) et le naif qui imite l'oracle (tire sous 17). Le sabot est
// rebattu a chaque main, comme buildDeck.
// 1 M de mains : sigma de la moyenne ~0,13 pt. Necessaire depuis le double —
// « base + double » frole 1 (99,5 %), une mesure a 200 k (±0,26 pt) ne suffit
// plus a garantir de quel cote du bord on est.
const A9_BJ_HANDS = 1_000_000;
const A9_BJ_SEED = 20260716 + 99; // SIM n'est declare que plus bas (TDZ) : graine locale.
const BJ_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
function bjDeck(rng) {
  const d = [];
  for (const suit of BLACKJACK_SUITS) for (const rank of BJ_RANKS) d.push({ rank, suit });
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}
function isSoft(cards) {
  let total = 0, aces = 0;
  for (const c of cards) {
    if (c.rank === "A") { aces++; total += 11; }
    else if (["10", "J", "Q", "K"].includes(c.rank)) total += 10;
    else total += Number(c.rank);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return aces > 0; // un as compte encore 11
}
function upValue(c) {
  if (c.rank === "A") return 11;
  if (["10", "J", "Q", "K"].includes(c.rank)) return 10;
  return Number(c.rank);
}
// Strategie de base SANS double ni refente (le jeu n'en propose pas).
function basicHits(player, up) {
  const v = handValue(player);
  const u = upValue(up);
  if (isSoft(player)) {
    if (v >= 19) return false;
    if (v === 18) return u >= 9;   // soft 18 : tire contre 9, 10, A
    return true;
  }
  if (v >= 17) return false;
  if (v >= 13) return u >= 7;
  if (v === 12) return u < 4 || u > 6;
  return true;
}
// Le DOUBLE de la strategie de base (S17, sans surrender) : sur les 2 premieres
// cartes uniquement. Rend true si la main doit DOUBLER (une carte puis on reste).
function basicDoubles(player, up) {
  if (player.length !== 2) return false;
  const v = handValue(player);
  const u = upValue(up);
  if (isSoft(player)) {
    if (v >= 13 && v <= 14) return u >= 5 && u <= 6;  // A2-A3
    if (v >= 15 && v <= 16) return u >= 4 && u <= 6;  // A4-A5
    if (v >= 17 && v <= 18) return u >= 3 && u <= 6;  // A6-A7
    return false;
  }
  if (v === 9) return u >= 3 && u <= 6;
  if (v === 10) return u >= 2 && u <= 9;
  if (v === 11) return u >= 2 && u <= 10; // S17 : pas de double contre l'As
  return false;
}
// La REFENTE de la strategie de base (paires a scinder, S17).
function basicSplits(player, up) {
  if (player.length !== 2) return false;
  const r = (c) => (["10", "J", "Q", "K"].includes(c.rank) ? "10" : c.rank);
  if (r(player[0]) !== r(player[1])) return false;
  const u = upValue(up);
  const pr = r(player[0]);
  if (pr === "A" || pr === "8") return true;
  if (pr === "9") return u !== 7 && u <= 9;
  if (pr === "7") return u <= 7;
  if (pr === "6") return u <= 6;
  if (pr === "4") return u === 5 || u === 6;
  if (pr === "2" || pr === "3") return u <= 7;
  return false; // 5 et 10 : jamais
}

// Joue UNE main (post-naturels) avec la politique donnee, rend le NET en unites
// de mise (ex. +1 = mise rendue x2). Gere double (mise x2 sur la main) et refente
// (2 mains, 1 seule refente, pas de naturel apres refente — regles classiques).
function bjPlayHand(deck, player, dealer, { double = false, split = false }) {
  const hands = [];
  if (split && basicSplits(player, dealer[0])) {
    const h1 = [player[0], deck.shift()];
    const h2 = [player[1], deck.shift()];
    hands.push({ cards: h1, mult: 1 }, { cards: h2, mult: 1 });
  } else {
    hands.push({ cards: player, mult: 1 });
  }
  for (const h of hands) {
    if (double && basicDoubles(h.cards, dealer[0])) {
      h.mult = 2;
      h.cards.push(deck.shift());
      continue; // une carte, on reste
    }
    while (handValue(h.cards) <= 21 && basicHits(h.cards, dealer[0])) h.cards.push(deck.shift());
  }
  if (hands.some((h) => handValue(h.cards) <= 21)) {
    while (handValue(dealer) < BLACKJACK_DEALER_STAND) dealer.push(deck.shift());
  }
  let net = 0;
  for (const h of hands) {
    // Pas de naturel apres refente : un 21 en 2 cartes d'une main refendue paie x2.
    const res = hands.length > 1 && isBlackjack(h.cards) ? (handValue(dealer) === 21 && dealer.length === 2 ? "push" : "win") : blackjackResult(h.cards, dealer);
    net += ((BLACKJACK_MULT[res] ?? 0) - 1) * h.mult;
  }
  return net;
}

// Les politiques EMBARQUÉES (jouables en jeu) entrent dans la porte A9. La
// REFENTE est LEGALISEE depuis le 2026-07-17 (arbitrage Raphael : c'est le rang
// d'imprimante du vingt-et-un, ~100,3 % de base en jeu parfait) : elle entre
// dans les mesures comme politique legale, FLAGGEE bascule (hors porte A9,
// comptee par A14). L'auto, elle, joue la base seule (jamais double ni refente).
const A9_BJ_POLICIES = [
  ["naif (imite l'oracle)", { naive: true }],
  ["strategie de base", {}],
  ["base + double", { double: true }],
  ["base + double + refente (bascule)", { double: true, split: true, bascule: true }]
];

function bjMeasure(opts) {
  const rng = mulberry32(A9_BJ_SEED);
  let net = 0;
  for (let i = 0; i < A9_BJ_HANDS; i++) {
    const deck = bjDeck(rng);
    const player = [deck.shift(), deck.shift()];
    const dealer = [deck.shift(), deck.shift()];
    if (handValue(player) === 21 || handValue(dealer) === 21) {
      const res = blackjackResult(player, dealer);
      net += (BLACKJACK_MULT[res] ?? 0) - 1;
      continue;
    }
    if (opts.naive) {
      while (handValue(player) < BLACKJACK_DEALER_STAND) player.push(deck.shift());
      if (handValue(player) <= 21) {
        while (handValue(dealer) < BLACKJACK_DEALER_STAND) dealer.push(deck.shift());
      }
      net += (BLACKJACK_MULT[blackjackResult(player, dealer)] ?? 0) - 1;
      continue;
    }
    net += bjPlayHand(deck, player, dealer, opts);
  }
  return 1 + net / A9_BJ_HANDS; // RTP (retour brut / mise de base)
}

let bjMeasured = {}; // politique -> rtp mesure (repris par le rapport MD)
function a9Blackjack() {
  const rows = [];
  bjMeasured = {};
  for (const [policy, opts] of A9_BJ_POLICIES) {
    const rtpBase = bjMeasure(opts);
    bjMeasured[policy] = rtpBase;
    for (const stake of BLACKJACK_STAKES) {
      const potFeed = potFeedShare(BLACKJACK_RTP_REF);
      rows.push({
        jeu: "vingt-et-un", mise: stake.faveur, config: `${stake.id}, ${policy}`,
        bascule: Boolean(opts.bascule),                // la refente : l'imprimante du 21
        rtpBase, potFeed, mint: 0, rtpTotal: rtpBase + potFeed
      });
    }
  }
  return rows;
}

// Garde-fou A11 : BLACKJACK_RTP_REF (la constante que feedPot lit) doit MAJORER
// la meilleure strategie jouable — refente comprise depuis qu'elle est legale —
// sinon feedPot verserait sur un edge surestime. Depuis la bascule, REF >= 1 est
// LEGAL (1.01) : feedPot clampe a 0 (plus d'edge a recycler), l'assertion < 1
// est tombee. Marge 3 sigma (~0,4 pt a 1 M de mains).
function a9BlackjackRefGuard() {
  const best = Math.max(...A9_BJ_POLICIES.map(([p]) => bjMeasured[p] ?? 0));
  const sigma3 = 0.004;
  const ok = BLACKJACK_RTP_REF >= best;
  return {
    id: "A11 BLACKJACK_RTP_REF majore le meilleur jeu (refente comprise)",
    pass: ok,
    note: ok
      ? `REF ${BLACKJACK_RTP_REF} >= meilleur mesure ${(best * 100).toFixed(2)} % (marge ${((BLACKJACK_RTP_REF - best) * 100).toFixed(2)} pt, viser >= ${(sigma3 * 100).toFixed(1)} pt) ; REF >= 1 -> feedPot clampe a 0, la table ne nourrit plus le pot`
      : `REF ${BLACKJACK_RTP_REF} SOUS le meilleur jeu mesure ${(best * 100).toFixed(2)} % : feedPot verse trop, relever la constante`
  };
}

const a9Rows = [...a9Augures(), ...a9Icare(), ...a9Gratteux(), ...a9Blackjack()];
guards.push(a9BlackjackRefGuard());
guards.push(a12GraveurGuard());

// A13 — l'echelle de Clemence ENTIERE (2026-07-17) : (a) chaque cran DESCEND
// strictement jusqu'au plancher (= dernier cran, la moitie de la mise pleine),
// aucun no-op — c'etait le vice du rabais en pourcentage (round() figeait les
// crans 2 et 4) ; (b) le RTP du prorata (gains arrondis sur la mise reduite,
// vol de Venus compris) reste < 1 pour rite x cran x des 0/10 x ivoire.
{
  let ladderBad = null, printer = null;
  for (const r of RITES) {
    const ladder = AUGURY_CLEMENCY_LADDER[r];
    const full = AUGURY_STAKES[r];
    const floorVal = ladder[ladder.length - 1];
    if (!ladder || ladder[0] !== full) ladderBad = ladderBad || `${r} : cran 0 (${ladder && ladder[0]}) != mise pleine ${full}`;
    for (let i = 0; i + 1 < ladder.length; i++) {
      if (ladder[i + 1] > ladder[i]) ladderBad = ladderBad || `${r} : cran ${i + 1} REMONTE`;
      if (ladder[i] > floorVal && ladder[i + 1] >= ladder[i]) ladderBad = ladderBad || `${r} : cran ${i + 1} NO-OP avant le plancher`;
    }
    // Depuis le prorata EXACT (payRound sur les gains + vol de Venus accorde avec
    // probabilite mise/mise pleine), l'esperance d'un jet en Clemence est
    // IDENTIQUE a celle du jet plein : gains_ev = g x ratio, vol_ev = vol x ratio,
    // le tout divise par stake x ratio → rtp_c = rtp_full, par algebre. L'ancien
    // Math.round + vol fixe faisait 104 % au cran 1 du prudent a des 10.
    // Le prorata doit rester EXACT a tous les niveaux (bascule comprise) ; la
    // borne < 1, elle, ne vaut que SOUS l'ancre — au-dela, l'imprimante est
    // voulue et la Clemence n'y change rien (meme rtp que le jet plein).
    for (const d of [0, AUGURY_REF_DICE_LEVEL, DICE_BOOST_MAX_LEVEL]) for (const iv of [false, true]) {
      const t = payTable(r, d, iv);
      setArtifacts(iv ? ["ivoire"] : []);
      const o = auguryTierOdds(t.pEff, AUGURY_RITES[r].spread ?? 1);
      const rtpFull = (o.venus * t.gains.venus + o.triple * t.gains.triple + o.pair * t.gains.pair + o.venus * bal.FREE_FLIGHT_EV) / t.stake;
      for (let c = 0; c < ladder.length; c++) {
        const ratio = ladder[c] / t.stake;
        const rtpC = (o.venus * t.gains.venus * ratio + o.triple * t.gains.triple * ratio + o.pair * t.gains.pair * ratio
          + o.venus * bal.FREE_FLIGHT_EV * ratio) / ladder[c];
        if (Math.abs(rtpC - rtpFull) > 1e-9) printer = printer || `${r} cran ${c}, des ${d}${iv ? " ivoire" : ""} : prorata NON exact (${(rtpC * 100).toFixed(2)} vs ${(rtpFull * 100).toFixed(2)} %)`;
        if (d <= AUGURY_REF_DICE_LEVEL && rtpC >= 1) printer = printer || `${r} cran ${c}, des ${d}${iv ? " ivoire" : ""} : ${(rtpC * 100).toFixed(1)} %`;
      }
    }
  }
  setArtifacts([]);
  const ok = !ladderBad && !printer;
  guards.push({
    id: "A13 Clemence entiere : echelle stricte, prorata EXACT",
    pass: ok,
    note: ok
      ? `chaque cran descend jusqu'au plancher (moitie) sans no-op ; l'esperance du jet en Clemence = jet plein (payRound + vol au prorata), < 1 partout`
      : (ladderBad || printer)
  });
}
// LA PORTE A9 NE JUGE QUE LE SOUS-BASCULE (2026-07-17). Au-dela (des 11+,
// ailes 7+, planches 6+, refente), rtp > 1 est le PRODUIT VENDU — l'imprimante
// volontaire, dont A14 calibre le debit. Une fuite reste une fuite : toute
// config SOUS-bascule >= 1 est un FAIL, exactement comme avant.
const a9Sous = a9Rows.filter((r) => !r.bascule);
const a9Supra = a9Rows.filter((r) => r.bascule);
const a9Fail = a9Sous.filter((r) => r.rtpTotal >= 1).sort((a, b) => b.rtpTotal - a.rtpTotal);
const a9WorstByGame = ["osselets", "icare", "gratteux", "vingt-et-un"].map((j) => {
  const rows = a9Sous.filter((r) => r.jeu === j);
  return rows.reduce((m, r) => (r.rtpTotal > m.rtpTotal ? r : m), rows[0]);
});
guards.push({
  id: "A9 anti-imprimante SOUS-BASCULE (cagnotte comprise, 4 jeux)",
  pass: a9Fail.length === 0,
  note: a9Fail.length === 0
    ? `rtp_total < 1 pour les ${a9Sous.length} configurations sous-bascule (des <= ${AUGURY_REF_DICE_LEVEL}, ailes <= ${WING_BASCULE_LEVEL}, planches <= ${GRAVEUR_BASCULE_LEVEL}, sans refente) ; ${a9Supra.length} configs supra-bascule impriment VOLONTAIREMENT (cf. A14)`
    : `${a9Fail.length}/${a9Sous.length} configurations SOUS-BASCULE impriment. Pire : ${a9Fail[0].jeu} (${a9Fail[0].config}) a ${(a9Fail[0].rtpTotal * 100).toFixed(1)} %`
});

/* ============================================================================
 * A14 - LE ROBINET DE L'IMPRIMANTE (la bascule, 2026-07-17)
 *
 * L'arbitrage Raphael : « au bout d'un moment le joueur gagne plus qu'il ne
 * depense », « des chiffres absurdement gros », « temps de farm classique,
 * gain exponentiel a vie ». Le debit est borne par la CADENCE DE L'AUTO :
 *     net/h = parties/h x mise x marge, marge = rtp - 1 (feedPot clampe a 0)
 * et le COFFRE (mise x10^rang, prix x10/rang) rend le temps de farm d'un rang
 * CONSTANT : farm = COFFRE_COST_BASE / net_h(x1), quel que soit le rang.
 * A14 verifie : (a) chaque table supra-bascule imprime bien en auto (le produit
 * existe) ; (b) le temps de farm d'un rang de coffre tient dans [4 h, 24 h]
 * (le « temps de farm classique ») ; (c) les reliques restent des objectifs en
 * JOURS (rapport informatif). Cadence FERVENT (le meilleur debit legal).
 * ========================================================================== */
const a14 = (() => {
  const perH = (intervalMs) => 3600_000 / (intervalMs * 0.5); // tempo fervent x0.5
  // Osselets au sommet : des 13, rite interdit (la plus grosse mise), auto.
  setContext(DICE_BOOST_MAX_LEVEL, false);
  setArtifacts(["interdit"]);
  const payTop = auguryPaytable(AUGURY_ID, "interdit");
  const oss = { jeu: "osselets", config: `interdit, des ${DICE_BOOST_MAX_LEVEL}, fervent`, marge: payTop.rtp - 1, netH: (payTop.rtp - 1) * payTop.stake * perH(AUTO_AUGURY_INTERVAL_MS) };
  // Icare au sommet : ailes max (edge NEGATIF, plancher ICARUS_EDGE_FLOOR),
  // hecatombe. Le rtp est PLAT en cible (Pareto) : marge = -edge, quelle que
  // soit la cible du cadran.
  setArtifacts([]);
  state.wingLevel = WING_MAX_LEVEL;
  const eTop = icarusEffectiveEdge();
  const ic = { jeu: "icare", config: `hecatombe, ailes ${WING_MAX_LEVEL}, fervent`, marge: -eTop, netH: -eTop * 25 * perH(AUTO_ICARUS_INTERVAL_MS) };
  state.wingLevel = 0;
  // Gratteux au sommet : planches max, talent.
  state.graveurLevel = GRAVEUR_MAX_LEVEL;
  const scRtp = scratchRtpRef("talent");
  const sc = { jeu: "gratteux", config: `talent, graveur ${GRAVEUR_MAX_LEVEL}, fervent`, marge: scRtp - 1, netH: (scRtp - 1) * 20 * perH(AUTO_SCRATCH_INTERVAL_MS) };
  state.graveurLevel = 0;
  // Vingt-et-un : l'imprimante est MANUELLE (l'auto joue la base, sous 1 —
  // la refente et le double restent des gestes). Marge du jeu parfait mesure.
  const bj = { jeu: "vingt-et-un (manuel)", config: "refente + double, royale", marge: (bjMeasured["base + double + refente (bascule)"] ?? 1) - 1, netH: null };
  const games = [oss, ic, sc];
  const best = games.reduce((m, g) => (g.netH > m.netH ? g : m), games[0]);
  // Temps de farm d'un rang de coffre : constant par construction (prix x10,
  // debit x10). Les reliques, au coffre MAX : le vrai « jours de farm ».
  const farmH = COFFRE_COST_BASE / best.netH;
  const coffreTotalH = Array.from({ length: COFFRE_MAX_LEVEL }, (_, i) => COFFRE_COST_BASE * Math.pow(COFFRE_COST_GROWTH, i) / (best.netH * Math.pow(10, i))).reduce((a, b) => a + b, 0);
  const relicH = (cost) => cost / (best.netH * Math.pow(10, COFFRE_MAX_LEVEL));
  return { oss, ic, sc, bj, best, farmH, coffreTotalH, relics: { char: relicH(RELIC_CHAR_COST), corne: relicH(RELIC_CORNE_COST), oeil: relicH(RELIC_OEIL_COST) } };
})();
setArtifacts([]);
{
  const allPrint = a14.oss.netH > 0 && a14.ic.netH > 0 && a14.sc.netH > 0 && a14.bj.marge > 0;
  const bandOk = a14.farmH >= 4 && a14.farmH <= 24;
  guards.push({
    id: "A14 robinet de la bascule : debit positif, farm d'un rang dans [4 h, 24 h]",
    pass: allPrint && bandOk,
    note: allPrint && bandOk
      ? `net/h x1 : osselets ${a14.oss.netH.toFixed(0)}, icare ${a14.ic.netH.toFixed(0)}, gratteux ${a14.sc.netH.toFixed(0)} (21 manuel : marge ${(a14.bj.marge * 100).toFixed(1)} pt) ; rang de coffre ~${a14.farmH.toFixed(1)} h au meilleur debit (${a14.best.jeu})`
      : !allPrint
        ? `une table supra-bascule n'imprime PAS : osselets ${a14.oss.netH.toFixed(1)}, icare ${a14.ic.netH.toFixed(1)}, gratteux ${a14.sc.netH.toFixed(1)}, 21 marge ${(a14.bj.marge * 100).toFixed(2)} pt`
        : `farm d'un rang de coffre ${a14.farmH.toFixed(1)} h HORS BANDE [4, 24] : ajuster COFFRE_COST_BASE ou les niveaux de bascule`
  });
}

// A10 — LE point de defaillance unique. Toute la preuve de A9 tient a recycle < 1 :
//   rtp_total = rtp_base + recycle x (1 - rtp_base) < 1  <=>  recycle < 1
// Le clamp est donc la seule ligne qui protege le temple. On le verifie AVEC
// l'osselet du noye (0.6 x 2 = 1.2 sans le clamp : la table imprimerait).
{
  setArtifacts([]);
  const plain = potRecycle();
  setArtifacts(["noye"]);
  const withNoye = potRecycle();
  setArtifacts([]);
  const ok = plain < 1 && withNoye < 1 && bal.TEMPLE_POT_RECYCLE_CAP < 1;
  guards.push({
    id: "A10 recycle < 1 (le clamp qui prouve A9)",
    pass: ok,
    note: ok
      ? `recycle ${plain} (nu) / ${withNoye} (noye, clampe depuis ${(bal.TEMPLE_POT_RECYCLE * bal.NOYE_POT_MULT).toFixed(2)}) ; cap ${bal.TEMPLE_POT_RECYCLE_CAP} < 1`
      : `recycle HORS BORNE : nu ${plain}, noye ${withNoye}, cap ${bal.TEMPLE_POT_RECYCLE_CAP} — A9 n'est plus demontrable`
  });
}

/* ============================================================================
 * 2. MONTE CARLO - sessions actives (tronc + politiques de joueur)
 * ========================================================================== */
const SIM = { HOURS: 8, RUNS: 400, SEED: 20260716, JET_CD_S: 12 };

// Politiques : quel rite jouer (ou null) selon bankroll/crans de Clemence.
const POLICIES = {
  epargnant: { label: "Epargnant (ne joue jamais)", pick: () => null },
  modere: { label: "Modere (classique, garde un matelas de 15)", cd: 20, pick: (bk) => (bk >= 15 ? "classique" : null) },
  flambeur: { label: "Flambeur (classique en continu)", cd: 12, pick: (bk) => (bk >= PROPOSAL.STAKES.classique ? "classique" : null) },
  hecatombe: { label: "Hecatombe (grand rite en continu)", cd: 12, pick: (bk) => (bk >= PROPOSAL.STAKES.grand ? "grand" : null) },
  sniper: {
    label: "Sniper (charge la Clemence en prudent, degaine le grand a 3+ crans)", cd: 12,
    pick: (bk, crans) => (crans >= 3 ? (bk >= PROPOSAL.STAKES.grand ? "grand" : null) : (bk >= PROPOSAL.STAKES.prudent ? "prudent" : null))
  }
};

// Seuils d'achat suivis (pure accumulation, aucun achat simule).
const THRESHOLDS = [
  { id: "de pipe 1", cost: PROPOSAL.DICE_COST.base },
  { id: "benediction", cost: PROPOSAL.BLESSING },
  { id: "aile ciree 1", cost: PROPOSAL.WING_COST.base },
  { id: "auto-releve du tronc", cost: PROPOSAL.AUTO_COLLECT },
  { id: "auto-jeu", cost: PROPOSAL.AUTO_PLAY }
];

// Une session : tronc plein au depart (retour apres pause), collecte manuelle
// quand le tronc frole le plafond (joueur attentif), 1 jet max / cooldown.
// clemencyMode : "rebate" (PROPOSAL) ou "odds" (statu quo, pour mesurer l'exploit).
function simulateSession(policyId, { diceLevel = 0, ivory = false, clemencyMode = "rebate", rng }) {
  const pol = POLICIES[policyId];
  const tables = {};   // par rite : paytable + seuils de tirage par crans
  for (const r of RITES) {
    const t = payTable(r, diceLevel, ivory);
    const spread = AUGURY_RITES[r].spread ?? 1;
    const byCrans = [];
    for (let c = 0; c <= 10; c++) {
      const p2 = clemencyMode === "odds" ? pEffWithCrans(t.pEff, c) : t.pEff;
      const o = auguryTierOdds(p2, spread);
      // Seuils cumules du tirage (repliquent drawTier, non exporte) :
      byCrans.push({ venus: o.venus, triple: o.venus + o.triple, win: p2, hollow: p2 + o.hollow });
    }
    tables[r] = { ...t, byCrans };
  }
  const seconds = SIM.HOURS * 3600;
  let trunk = PROPOSAL.TRUNK_CAP, bankroll = 0;
  let wagered = 0, returned = 0, jets = 0, dryS = 0;
  const hist = []; // fenetre GAMBLE_HISTORY_LEN (1 gain, 0 creux, 2 chien)
  const firstAt = {}; const netAtH = {};
  const cd = pol.cd || SIM.JET_CD_S;
  let nextJet = 0;
  for (let s = 0; s < seconds; s++) {
    trunk = Math.min(PROPOSAL.TRUNK_CAP, trunk + PROPOSAL.TRUNK_PER_S);
    if (trunk >= PROPOSAL.TRUNK_CAP * 0.9) { bankroll += trunk; trunk = 0; }
    let crans = 0;
    for (let i = hist.length - 1; i >= 0 && hist[i] !== 1; i--) crans += hist[i] === 2 ? 2 : 1;
    const riteId = s >= nextJet ? pol.pick(bankroll, crans) : null;
    if (riteId) {
      const t = tables[riteId];
      // Clemence "rebate" : ECHELLE ENTIERE (2026-07-17) — la mise du cran est LUE
      // dans le ladder, comme auguryStake du vrai code. Gains au prorata.
      const ladder = PROPOSAL.CLEMENCY_LADDER[riteId] || PROPOSAL.CLEMENCY_LADDER.classique;
      const stake = clemencyMode === "rebate" ? ladder[Math.min(ladder.length - 1, crans)] : t.stake;
      const ratio = stake / t.stake;
      if (bankroll >= stake) {
        nextJet = s + cd;
        bankroll -= stake; wagered += stake; jets++;
        const th = t.byCrans[Math.min(10, crans)];
        const r = rng();
        const tier = r < th.venus ? "venus" : r < th.triple ? "triple" : r < th.win ? "pair" : r < th.hollow ? "hollow" : "dog";
        const win = tier === "venus" || tier === "triple" || tier === "pair";
        // payRound du vrai code : arrondi stochastique NON biaise (E = x exactement).
        if (win) { const x = t.gains[tier] * ratio; const g = Math.floor(x) + (rng() < x - Math.floor(x) ? 1 : 0); bankroll += g; returned += g; }
        hist.push(win ? 1 : tier === "dog" ? 2 : 0);
        if (hist.length > GAMBLE_HISTORY_LEN) hist.splice(0, hist.length - GAMBLE_HISTORY_LEN);
      }
    }
    if (bankroll < PROPOSAL.STAKES.classique) dryS++;
    for (const th of THRESHOLDS) if (firstAt[th.id] === undefined && bankroll >= th.cost) firstAt[th.id] = s;
    if ((s + 1) % 3600 === 0) netAtH[(s + 1) / 3600] = bankroll;
  }
  return { bankroll, wagered, returned, jets, dryS, firstAt, netAtH };
}

function quantiles(arr, qs) {
  const a = [...arr].sort((x, y) => x - y);
  return qs.map((q) => a[Math.min(a.length - 1, Math.floor(q * a.length))]);
}
function runConfig(policyId, opts = {}) {
  const rng = mulberry32(SIM.SEED + (opts.seedShift || 0));
  const runs = [];
  for (let i = 0; i < SIM.RUNS; i++) runs.push(simulateSession(policyId, { ...opts, rng }));
  const med = (get) => quantiles(runs.map(get), [0.5])[0];
  const [p10h1, p50h1, p90h1] = quantiles(runs.map((r) => r.netAtH[1]), [0.1, 0.5, 0.9]);
  const wagered = med((r) => r.wagered);
  const returned = med((r) => r.returned);
  const t = (id) => {
    const arr = runs.map((r) => r.firstAt[id]).filter((x) => x !== undefined);
    if (arr.length < SIM.RUNS / 2) return null; // pas atteint en mediane
    return quantiles(arr, [0.5])[0];
  };
  return {
    policyId, opts,
    jetsH: med((r) => r.jets) / SIM.HOURS,
    rtp: wagered > 0 ? returned / wagered : null,
    h1: { p10: p10h1, p50: p50h1, p90: p90h1 },
    h8p50: med((r) => r.netAtH[8]),
    dryPct: (med((r) => r.dryS) / (SIM.HOURS * 3600)) * 100,
    lossPerH: (wagered - returned) / SIM.HOURS,
    lossPerJet: (wagered - returned) / Math.max(1, med((r) => r.jets)),
    tTo: Object.fromEntries(THRESHOLDS.map((th) => [th.id, t(th.id)]))
  };
}

console.log("Monte Carlo (" + SIM.RUNS + " runs x " + SIM.HOURS + " h par config)...");
const t0 = performance.now();
const mc = {
  epargnant: runConfig("epargnant"),
  modere: runConfig("modere", { seedShift: 1 }),
  flambeur0: runConfig("flambeur", { seedShift: 2 }),
  hecatombe: runConfig("hecatombe", { seedShift: 3 }),
  sniperOdds: runConfig("sniper", { clemencyMode: "odds", seedShift: 4 }),
  sniperRebate: runConfig("sniper", { seedShift: 5 }),
  flambeur5: runConfig("flambeur", { diceLevel: 5, seedShift: 6 }),
  flambeur10: runConfig("flambeur", { diceLevel: 10, seedShift: 7 }),
  flambeur10ivory: runConfig("flambeur", { diceLevel: 10, ivory: true, seedShift: 8 })
};
console.log(`... fait en ${((performance.now() - t0) / 1000).toFixed(1)} s`);

// Garde-fous Monte Carlo.
guards.push({
  id: "A4 early peu rentable", pass: mc.flambeur0.h1.p50 <= mc.epargnant.h1.p50 * 0.5,
  note: `net 1 h median : flambeur ${Math.round(mc.flambeur0.h1.p50)} vs epargnant ${Math.round(mc.epargnant.h1.p50)} Faveur`
});
const tDice = mc.epargnant.tTo["de pipe 1"];
const tAuto = mc.epargnant.tTo["auto-releve du tronc"];
guards.push({
  id: "A5 bonus etales", pass: tDice !== null && tDice >= 30 * 60 && tAuto !== null && tAuto >= 3.5 * 3600,
  note: `epargne stricte : 1er de a ${fmtDur(tDice)}, auto-releve a ${fmtDur(tAuto)}`
});
guards.push({
  id: "A6 progression sensible", pass: mc.flambeur10.lossPerJet <= mc.flambeur0.lossPerJet * 0.33,
  note: `perte mediane PAR JET du flambeur : ${mc.flambeur0.lossPerJet.toFixed(2)} Faveur (des 0) -> ${mc.flambeur10.lossPerJet.toFixed(2)} (des 10)`
});
guards.push({
  id: "A7 Clemence saine (mode rabais)", pass: mc.sniperRebate.rtp < 1,
  note: `RTP realise du sniper : rabais ${(mc.sniperRebate.rtp * 100).toFixed(1)} % (borne) ; statu quo odds ${(mc.sniperOdds.rtp * 100).toFixed(1)} % -> ${mc.sniperOdds.rtp >= 1 ? "EXPLOITABLE, disqualifie" : "sous 100 % ici mais non borne"}`
});

/* ============================================================================
 * 3. RAPPORT
 * ========================================================================== */
function fmtDur(s) {
  if (s === null || s === undefined) return "> " + SIM.HOURS + " h";
  if (s < 3600) return Math.round(s / 60) + " min";
  return (s / 3600).toFixed(1).replace(".0", "") + " h";
}
const pct = (x) => (x * 100).toFixed(1) + " %";
const F = (x) => (Math.round(x * 10) / 10).toString();

const totalDice = Array.from({ length: DICE_BOOST_MAX_LEVEL }, (_, i) => Math.round(PROPOSAL.DICE_COST.base * Math.pow(PROPOSAL.DICE_COST.growth, i))).reduce((a, b) => a + b, 0);

let md = `# Jeux du temple en Faveur - rapport d'equilibrage (systeme cable)

> Genere par \`bench-temple.js\` (seed ${SIM.SEED}, ${SIM.RUNS} runs x ${SIM.HOURS} h par config). Valide le
> systeme CABLE (2026-07-16) - mises des osselets en **Faveur** (plus d'or), **tronc des
> offrandes** passif, gains **normalises sur un RTP cible < 1** (anti-imprimante),
> Clemence = **rabais de mise**. Tout vient du vrai code (\`auguryPaytable\`,
> \`auguryBaseOdds\`, \`auguryTierOdds\`, \`clemencyCrans\`) et des constantes de
> \`balance.js\` - a regenerer apres chaque retouche d'equilibrage (\`node bench-temple.js\`).

## Parametres cables (balance.js)

| Parametre | Avant (mise-or, 2026-07-15) | Cable |
|---|---|---|
| Mise osselets | 30 s de prod d'or x rite (0.6/1/2) | **Faveur : ${PROPOSAL.STAKES.prudent} / ${PROPOSAL.STAKES.classique} / ${PROPOSAL.STAKES.grand}** (prudent/classique/grand) |
| Gains osselets | plats : Venus 20, Triple 8, Paire 3 (x costMult) | **normalises sur RTP cible** (cf. paytables) |
| Consolations Creux/Chien | 1 / 2 Faveur | **0** (le pot d'Icare reste nourri par une part des mises perdues) |
| RTP (edge maison) | - (mise en or : EV toujours positive en Faveur) | **paiements FIXES normalises a ${pct(PROPOSAL.RTP_CAP)} au win rate MAX** -> RTP effectif ~${pct(PROPOSAL.RTP_CAP * (0.275 / 0.475))} a des 0, ~${pct(PROPOSAL.RTP_CAP)} a des 10 |
| Odds (win rate) | p 0.55 x scale 0.5 = 27.5 % (+2 pts / de) | inchange - LE levier de progression (les paiements ne bougent pas) |
| Clemence | +5 pts d'odds / cran (Chien double) | **echelle de mises ENTIERES** : classique ${PROPOSAL.CLEMENCY_LADDER.classique.join("/")} par cran (plancher = moitie, aucun cran no-op — A13) |
| NOUVEAU : tronc des offrandes | - | **+${(PROPOSAL.TRUNK_PER_S * 3600).toFixed(0)} Faveur/h**, plafond ${PROPOSAL.TRUNK_CAP}, plein au deblocage, releve manuelle |
| Des pipes (prix) | 40 x 1.6 | **${PROPOSAL.DICE_COST.base} x ${PROPOSAL.DICE_COST.growth}** (niv. 10 : ~${Math.round(PROPOSAL.DICE_COST.base * Math.pow(PROPOSAL.DICE_COST.growth, 9))} ; total 10 niv. ~${totalDice}) |
| Ailes cirees (prix) | 60 x 1.7 | **${PROPOSAL.WING_COST.base} x ${PROPOSAL.WING_COST.growth}** |
| Benediction | 45 | **${PROPOSAL.BLESSING}** |
| Automatisations | osselets 200 (mise l'or, plancher d'or) | **tronc ${PROPOSAL.AUTO_COLLECT} (auto-releve) / osselets ${PROPOSAL.AUTO_PLAY} (auto-jeu, plancher de Faveur)** ; Icare 350 inchange (or) |

## Garde-fous

`;
for (const g of guards) md += `- ${g.pass ? "**PASS**" : "**FAIL**"} - ${g.id} : ${g.note}\n`;

md += `
## A9 : RTP total, cagnotte comprise (les 4 jeux)

> **La cagnotte n'est pas un puits.** En solo, tout ce qui y entre revient au MEME
> joueur (elle se rafle a Icare a x${ICARUS_JACKPOT_MULT}) : c'est un **paiement differe**. Donc
> \`rtp_total = rtp_base + part_versee\`, et A1..A8 n'en voyaient rien (ils passent
> tous par \`auguryPaytable\`, donc un jeu sur quatre, cagnotte exclue).
>
> **Depuis le 2026-07-17, le pot est finance par l'EDGE et non par la mise :**
> \`feed = mise x recycle x (1 - rtp_base)\`, d'ou
> \`rtp_total = rtp_base + recycle x (1 - rtp_base) < 1\` pour tout \`recycle < 1\`.
> L'anti-imprimante est vrai par ALGEBRE, quels que soient le jeu, le niveau, la mise
> et les artefacts. Recycle cable : ${bal.TEMPLE_POT_RECYCLE} (${bal.TEMPLE_POT_RECYCLE_CAP} avec l'osselet du noye, clampe
> depuis ${(bal.TEMPLE_POT_RECYCLE * bal.NOYE_POT_MULT).toFixed(2)}). A10 verrouille ce clamp : c'est le point de defaillance UNIQUE.
>
> Avant, la part etait prelevee sur la MISE (0.25 a 0.5) alors que l'edge ne prend que
> 0.018 (vingt-et-un) a ${bal.ICARUS_EDGE} (Icare) de cette meme mise : on rendait plus qu'on ne
> prenait, et **746 configurations sur 813 imprimaient** (Icare x10 a 118,7 % des le
> 1er jour, x50+plumes a 186 %).
>
> Hypothese assumee et conservatrice : le joueur finit par vider le pot. Elle MAJORE
> le RTP, ce qu'un anti-imprimante doit faire.

**Sous-bascule : ${a9Fail.length} configuration${a9Fail.length > 1 ? "s" : ""} sur ${a9Sous.length} imprime${a9Fail.length > 1 ? "nt" : ""}** (des <= ${AUGURY_REF_DICE_LEVEL}, ailes <= ${WING_BASCULE_LEVEL}, planches <= ${GRAVEUR_BASCULE_LEVEL}, sans refente).
Les ${a9Supra.length} configurations SUPRA-bascule impriment volontairement (cf. la section bascule). Pire cas sous-bascule par jeu :

| Jeu | Configuration | Mise | RTP base | Part versee | Consolations | **RTP total** |
|---|---|---|---|---|---|---|
`;
for (const r of a9WorstByGame) {
  md += `| ${r.jeu} | ${r.config} | ${r.mise} | ${pct(r.rtpBase)} | +${pct(r.potFeed)} | +${pct(r.mint)} | **${pct(r.rtpTotal)}** |\n`;
}
// Les « ailes solaires » ne relevent que le PLAFOND (x100 -> x200) : sous une cible
// de x100 elles ne mordent jamais et dupliquent chaque ligne. On les garde dans le
// balayage (couverture) mais on dedoublonne a l'AFFICHAGE, sinon la table ment par
// repetition.
const a9Seen = new Set();
const a9Top = [...a9Sous].sort((a, b) => b.rtpTotal - a.rtpTotal).filter((r) => {
  const key = `${r.jeu}|${r.config.replace(/, solaires/, "")}`;
  if (a9Seen.has(key)) return false;
  a9Seen.add(key);
  return true;
}).slice(0, 12);
md += `
Les 12 configurations sous-bascule les plus proches du bord, tous jeux confondus :

| Jeu | Configuration | RTP base | Part versee | **RTP total** |
|---|---|---|---|---|
`;
for (const r of a9Top) {
  md += `| ${r.jeu} | ${r.config} | ${pct(r.rtpBase)} | +${pct(r.potFeed)} | **${pct(r.rtpTotal)}** |\n`;
}

md += `
## La bascule : l'imprimante volontaire (A14)

> Arbitrage Raphael (2026-07-17) : « au bout d'un moment le joueur gagne plus
> qu'il ne depense », « des chiffres absurdement gros », « temps de farm
> classique, gain exponentiel a vie ». Passe la bascule (des ${AUGURY_REF_DICE_LEVEL + 1}+, ailes ${WING_BASCULE_LEVEL + 1}+,
> planches ${GRAVEUR_BASCULE_LEVEL + 1}+, la refente au 21), rtp > 1 est le PRODUIT VENDU. Le debit est
> borne par la cadence de l'auto (net/h = parties/h x mise x marge) et le COFFRE
> (mise x10^rang, prix x${COFFRE_COST_GROWTH}/rang) rend le temps de farm d'un rang CONSTANT.

| Table au sommet | Marge (rtp - 1) | Net/h (coffre x1, fervent) |
|---|---|---|
| ${a14.oss.config} | +${pct(a14.oss.marge)} | ~${Math.round(a14.oss.netH)} Faveur/h |
| ${a14.ic.config} | +${pct(a14.ic.marge)} | ~${Math.round(a14.ic.netH)} Faveur/h |
| ${a14.sc.config} | +${pct(a14.sc.marge)} | ~${Math.round(a14.sc.netH)} Faveur/h |
| ${a14.bj.config} | +${pct(a14.bj.marge)} | manuel (l'auto joue la base, sous 1) |

- **Un rang de coffre** se farme en ~${a14.farmH.toFixed(1)} h au meilleur debit (${a14.best.jeu}) — constant a chaque rang (prix x${COFFRE_COST_GROWTH}, debit x10).
- **Les ${COFFRE_MAX_LEVEL} rangs** : ~${(a14.coffreTotalH / 24).toFixed(1)} jours de farm cumules.
- **Les reliques** (au coffre max) : le Char ~${a14.relics.char < 1 ? "moins d'une heure" : a14.relics.char.toFixed(1) + " h"}, la Corne ~${a14.relics.corne.toFixed(1)} h, l'Oeil d'or ~${(a14.relics.oeil / 24).toFixed(1)} jours — apres les ~${(a14.coffreTotalH / 24).toFixed(1)} jours de coffres : les objets a « jours de farm » demandes.
`;
md += `
> Lecture : plus \`rtp_base\` est haut, MOINS la table peut recycler — le vingt-et-un
> n'a que 1,8 point d'edge, donc il ne verse presque rien, et c'est correct. Les
> configurations du haut de ce tableau sont celles ou il reste le moins de marge : ce
> sont elles qu'il faut relire si \`AUGURY_RTP_CAP\` ou \`WING_STEP\` montent.
>
> Les **plumes de secours** n'apparaissent plus : elles PRELEVENT desormais sur la
> cella au lieu de minter \`round(mise x ${bal.PLUMES_CONSOLATION_MULT})\` a chaque crash. Ce qui sort du pot est
> deja compte dans la part versee, donc la consolation n'ajoute plus rien au RTP —
> c'etait le poste le plus lourd de l'imprimante (+51 pts a la cible x50).
> L'**osselet du noye** ne double plus une part de mise : il booste le recycle, et le
> clamp le tient sous 1 (A10).

## RTP analytique (hors Clemence)

> Paiements FIXES (normalises au win rate MAX sur le cap) : le RTP EFFECTIF suit le
> win rate courant (rtp = rtpRef x pEff/pRef) - il monte avec les des, jamais au-dela
> du cap. L'ivoire (artefact) redistribue la variance : la table est RECALCULEE a
> l'achat, le RTP reste sous le cap.

| Rite | Des | Win rate | RTP ref (des max) | RTP effectif | RTP eff (ivoire) | Perte moy./jet |
|---|---|---|---|---|---|---|
`;
for (let i = 0; i < analytic.length; i++) {
  const t = analytic[i], tiv = analyticIvory[i];
  md += `| ${t.riteId} | ${t.diceLevel} | ${pct(t.pEff)} | ${pct(t.rtpRef)} | ${pct(t.rtpReal)} | ${pct(tiv.rtpReal)} | ${F(t.stake * (1 - t.rtpReal))} Faveur |\n`;
}

md += `
## Paytables affichees au joueur (FIXES a tous les niveaux de des)

| Rite | Mise | Venus | Triple | Paire |
|---|---|---|---|---|
`;
for (const r of RITES) {
  const t0r = payTable(r, 0, false);
  md += `| ${r} | ${t0r.stake} | ${t0r.gains.venus} | ${t0r.gains.triple} | ${t0r.gains.pair} |\n`;
}
md += `
> Contrat (arbitrage Raph 2026-07-16) : les des pipes montent le WIN RATE
> (+2 pts/niveau), les paiements ne bougent JAMAIS - verrouille par A8.
`;

md += `
## Clemence : pourquoi le rabais de mise (et pas le bonus d'odds)

En monnaie fermee, l'ancienne Clemence (+${LEGACY_CLEMENCY_PER_LOSS * 100} pts d'odds par cran, Chien double,
jusqu'a +50 pts) rendait la table **exploitable** : les gains etant normalises hors
Clemence, chaque cran multipliait le RTP effectif (~lineaire en p, les pertes payant 0).
Strategie mesuree ("sniper" : charger les crans en prudent, degainer le grand rite a 3+ crans) :

| Mode Clemence | RTP realise (sniper) | Net median 8 h | Verdict |
|---|---|---|---|
| Odds (ancien systeme, contrefactuel) | ${pct(mc.sniperOdds.rtp)} | ${Math.round(mc.sniperOdds.h8p50)} Faveur | ${mc.sniperOdds.rtp >= 1 ? "**EXPLOITABLE** - retire du jeu" : "borderline"} |
| Rabais de mise (CABLE) | ${pct(mc.sniperRebate.rtp)} | ${Math.round(mc.sniperRebate.h8p50)} Faveur | borne par construction |

L'echelle ENTIERE (2026-07-17 : classique ${PROPOSAL.CLEMENCY_LADDER.classique.join("/")} par cran, gains au prorata
de la mise payee) descend a CHAQUE revers jusqu'au plancher (la moitie) — l'ancien
rabais en pourcentage laissait les crans 2 et 4 no-op par round(). La serie noire
brule moins vite ("le temple allege l'offrande des eprouves"), le prorata reste
borne < 1 (A13) et inexploitable (A7).

## Sessions simulees (Monte Carlo, ${SIM.HOURS} h actives, mode rabais)

> Tronc plein a l'arrivee (burst de ~${Math.round(PROPOSAL.TRUNK_CAP / PROPOSAL.STAKES.classique)} jets classiques), releve manuelle au plafond,
> 1 jet / ${SIM.JET_CD_S} s max (rythme d'animation). "A sec" = bankroll sous la mise classique.

| Politique | Des | Jets/h | RTP realise | Net 1 h (p10/p50/p90) | Net 8 h (p50) | A sec |
|---|---|---|---|---|---|---|
`;
const rows = [
  ["epargnant", mc.epargnant, 0], ["modere", mc.modere, 0], ["flambeur", mc.flambeur0, 0],
  ["hecatombe", mc.hecatombe, 0], ["sniper (rabais)", mc.sniperRebate, 0],
  ["flambeur", mc.flambeur5, 5], ["flambeur", mc.flambeur10, 10], ["flambeur + ivoire", mc.flambeur10ivory, 10]
];
for (const [name, c, dice] of rows) {
  md += `| ${name} | ${dice} | ${Math.round(c.jetsH)} | ${c.rtp === null ? "-" : pct(c.rtp)} | ${Math.round(c.h1.p10)} / ${Math.round(c.h1.p50)} / ${Math.round(c.h1.p90)} | ${Math.round(c.h8p50)} | ${c.dryPct.toFixed(0)} % |\n`;
}

md += `
## Temps d'acces aux achats (mediane, pure accumulation)

| Achat | Prix | Epargnant | Modere |
|---|---|---|---|
`;
for (const th of THRESHOLDS) {
  md += `| ${th.id} | ${th.cost} | ${fmtDur(mc.epargnant.tTo[th.id])} | ${fmtDur(mc.modere.tTo[th.id])} |\n`;
}

md += `
## Verdict

- **Jouer vite** : burst d'entree de ~${Math.round(PROPOSAL.TRUNK_CAP / PROPOSAL.STAKES.classique)} jets classiques (tronc plein), puis le tronc (+${(PROPOSAL.TRUNK_PER_S * 3600).toFixed(0)}/h)
  finance ~${Math.round((PROPOSAL.TRUNK_PER_S * 3600) / (PROPOSAL.STAKES.classique * (1 - PROPOSAL.RTP_CAP * (0.275 / 0.475))))} jets classiques/h en regime permanent a des 0 (par vagues : un gain repaie ses jets).
- **Early peu rentable** : le flambeur finit l'heure a ~${Math.round(mc.flambeur0.h1.p50)} Faveur la ou l'epargnant
  en garde ~${Math.round(mc.epargnant.h1.p50)} - jouer coute, comme voulu ; la marge de progression est le moteur.
- **Bonus etales** : 1er de a ${fmtDur(mc.epargnant.tTo["de pipe 1"])} en epargne stricte (bien plus en jouant),
  automatisations a ${fmtDur(mc.epargnant.tTo["auto-releve du tronc"])} / ${fmtDur(mc.epargnant.tTo["auto-jeu"])}, les 10 des ~${totalDice} Faveur
  (~${Math.round(totalDice / (PROPOSAL.TRUNK_PER_S * 3600))} h de tronc) : progression long terme.
- **De mieux en mieux** : la perte de jeu du flambeur fond de ${mc.flambeur0.lossPerH.toFixed(0)} a ${mc.flambeur10.lossPerH.toFixed(0)} Faveur/h
  entre des 0 et des 10 (win rate 27.5 % -> 47.5 %, paiements INCHANGES : le RTP
  effectif grimpe de ~${pct(PROPOSAL.RTP_CAP * (0.275 / 0.475))} a ~${pct(PROPOSAL.RTP_CAP)}).
- **Clemence** : passer au rabais de mise (l'actuelle est exploitable en monnaie fermee).

### Suites possibles (hors du cable actuel)
- **La bascule est un CONTRAT en deux moities** : sous l'ancre (des <= ${AUGURY_REF_DICE_LEVEL},
  ailes <= ${WING_BASCULE_LEVEL}, planches <= ${GRAVEUR_BASCULE_LEVEL}, sans refente), l'anti-imprimante reste vrai par
  algebre (A9) ; au-dela, rtp > 1 est le produit vendu et son DEBIT est la seule
  chose a surveiller (A14 : cadence x mise x marge, coffres a prix x${COFFRE_COST_GROWTH}).
- Le RTP effectif des osselets a des 0 est DUR (~56 %) : c'est le choix "early peu
  rentable" pousse au bout - chaque de pipe rend ~+4 pts de RTP effectif, la
  progression se SENT. A adoucir via AUGURY_RTP_CAP ou DICE_BOOST_STEP si trop rude.
- Les couts d'artefacts, des coffres et des reliques restent ajustables au ressenti ;
  la bande [4 h, 24 h] du farm d'un rang (A14) est le curseur central.
`;

fs.writeFileSync("temple-faveur-impact.md", md);

// --- Console : resume -------------------------------------------------------
console.log("\n=== GARDE-FOUS ===");
for (const g of guards) console.log(`${g.pass ? "PASS" : "FAIL"}  ${g.id} - ${g.note}`);
console.log("\n=== A9 : RTP TOTAL sous-bascule (cagnotte comprise) - pire cas par jeu ===");
for (const r of a9WorstByGame) {
  console.log(`${r.jeu.padEnd(12)} ${(r.rtpTotal >= 1 ? "IMPRIME" : "ok     ")} ${pct(r.rtpTotal).padStart(7)}  = base ${pct(r.rtpBase)} + pot ${pct(r.potFeed)} + consol. ${pct(r.mint)}   [${r.config}]`);
}
console.log("\n=== A14 : LA BASCULE (imprimante volontaire) ===");
for (const g of [a14.oss, a14.ic, a14.sc]) {
  console.log(`${g.jeu.padEnd(12)} marge +${pct(g.marge).padStart(6)}  net/h x1 ~${Math.round(g.netH)}   [${g.config}]`);
}
console.log(`vingt-et-un  marge +${pct(a14.bj.marge)} (manuel : refente + double)`);
console.log(`coffre : ~${a14.farmH.toFixed(1)} h/rang (${a14.best.jeu}) ; ${COFFRE_MAX_LEVEL} rangs ~${(a14.coffreTotalH / 24).toFixed(1)} j ; Oeil d'or ~${(a14.relics.oeil / 24).toFixed(1)} j au coffre max`);
console.log("\n=== PAYTABLES (des 0) ===");
for (const r of RITES) {
  const t = payTable(r, 0, false);
  console.log(`${r.padEnd(10)} mise ${t.stake}  ->  Venus ${t.gains.venus} / Triple ${t.gains.triple} / Paire ${t.gains.pair}   (win ${pct(t.pEff)}, RTP ${pct(t.rtpReal)})`);
}
console.log("\n=== SESSIONS (mode rabais) ===");
for (const [name, c, dice] of rows) {
  console.log(`${name.padEnd(18)} des ${String(dice).padEnd(2)} jets/h ${String(Math.round(c.jetsH)).padStart(4)}  RTP ${c.rtp === null ? "  -  " : pct(c.rtp).padStart(6)}  net 1 h p50 ${String(Math.round(c.h1.p50)).padStart(5)}  net 8 h p50 ${String(Math.round(c.h8p50)).padStart(6)}`);
}
console.log("\nRapport ecrit : temple-faveur-impact.md");
