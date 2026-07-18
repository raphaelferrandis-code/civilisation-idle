"use strict";

// Le Vol d'Icare — MOTEUR du crash game du temple (cf. constantes ICARUS_* de
// balance.js pour la loi du jeu). MONNAIE FERMÉE (2026-07-16) : mise et gain
// en FAVEUR — payout = mise × m, donc RTP = 1-EDGE par construction (< 1 sans
// normalisation). Les ailes cirées abaissent l'edge : le WIN RATE monte, les
// paiements ne bougent pas (même contrat que les dés pipés aux osselets).
// Le vol est un état MODULE (éphémère : un rechargement en plein vol abandonne
// la mise — le vol dure ~5-30 s) ; le point de crash est tiré à l'envol et un
// setTimeout AUTORITAIRE résout la chute même si le dialogue est fermé. L'UI
// (IcarusDialog) ne fait que lire icarusMultiplier()/icarusLastOutcome().
//   - launchIcarus(stakeId) : paie la mise (Faveur), tire C = (1-EDGE)/U et
//     programme la chute à t = ln(C)/K.
//   - cashOutIcarus() : si m(now) < C, paie round(mise × m) ; à ×JACKPOT ou
//     plus, rafle la cagnotte du temple. Révèle C (near-miss).
//   - La chute nourrit la cagnotte (part de la mise) et l'historique des
//     crashs (state.icarusHistory).
// PAS une action de régulation : ni fatigue, ni compteurs de crise — le seul
// frein est l'espérance négative (recyclée en cagnotte).

import { state, render, gamePaused, collapseInProgress } from '../state.js';
import { regulationContext } from '../mechanics.js';
import { fmt } from '../utils.js';
import {
  ICARUS_EDGE,
  ICARUS_CAP,
  ICARUS_K,
  ICARUS_JACKPOT_MULT,
  ICARUS_HISTORY_LEN,
  ICARUS_HISTORY_COLOMBIER,
  SOUFFLE_CONSOLATION_MULT,
  ICARUS_STAKES,
  WING_STEP,
  WING_MAX_LEVEL,
  ICARUS_EDGE_FLOOR,
  ICARUS_CAP_SOLAR,
  PLUMES_CONSOLATION_MULT
} from '../balance.js';
import { chronicle } from './utils.js';
import { hasTempleArtifact } from './templeArtifacts.js';
import { potRake, feedPot, drawFromPot, payRound, clampStakeMult } from './templePot.js';
import { consumeFreeFlight } from './templeFlights.js';
import { pushOutcomeFloat } from '../outcomeFloat.js';
import { recordIcarus } from '../chronicleStats.js';

let flight = null;      // { stakeFaveur, crashPoint, takeoffAt, timer, resolved }
let lastOutcome = null; // { type:'crash'|'cashout', m?, crashPoint, faveur?, jackpotFaveur?, potGainFaveur?, stakeFaveur }

export function icarusUnlocked(ctx = regulationContext()) {
  return ctx.bestEra >= 3;
}

// Edge EFFECTIF : l'edge de base abaissé par les ailes cirées (boutique de
// Faveur), avec un plancher. Un edge plus bas = odds meilleures.
export function icarusEffectiveEdge() {
  const reduction = Math.min(WING_MAX_LEVEL, state.wingLevel || 0) * WING_STEP;
  return Math.max(ICARUS_EDGE_FLOOR, ICARUS_EDGE - reduction);
}

// Plafond EFFECTIF du multiplicateur : relevé par l'artefact « Ailes solaires ».
// Choke point PARTAGÉ (courbe + tirage crashPoint + clamp cible + UI), comme
// icarusEffectiveEdge — à lire PARTOUT où ICARUS_CAP servait, sinon l'invariant
// crashPoint ≤ cap (ou l'aperçu visuel) casse.
export function icarusEffectiveCap() {
  return hasTempleArtifact("solaires") ? ICARUS_CAP_SOLAR : ICARUS_CAP;
}

// Plumes de secours (artefact) : un CRASH rend une part de la mise en Faveur
// (consolation, PRÉLEVÉE sur la cella — cf. drawFromPot). 0 sans l'artefact. Le
// second souffle (rang au-dessus) porte la part à 0.7 : il peut scaler librement
// parce que c'est un transfert, jamais un mint. Lu par resolveCrash (interactif)
// ET par la branche crash de resolveIcarusHeadless → parité stricte.
export function icarusCrashConsolation(stakeFaveur) {
  if (!hasTempleArtifact("plumes")) return 0;
  const mult = hasTempleArtifact("souffle") ? SOUFFLE_CONSOLATION_MULT : PLUMES_CONSOLATION_MULT;
  return Math.round((stakeFaveur || 0) * mult);
}

// Longueur de l'historique des pastilles : le colombier fait noter 24 vols au
// guetteur au lieu de 12 — l'historique est la meilleure lecture de l'edge du jeu
// (≈ 2 braises sur 12 aux ailes 0, 0,5 aux ailes 6).
export function icarusHistoryLen() {
  return hasTempleArtifact("colombier") ? ICARUS_HISTORY_COLOMBIER : ICARUS_HISTORY_LEN;
}

// Mises proposées (FAVEUR, fixes — cf. ICARUS_STAKES).
export function icarusStakes() {
  return ICARUS_STAKES.map((s) => ({ ...s }));
}

export function icarusFlying() {
  return Boolean(flight && !flight.resolved);
}

export function icarusTakeoffAt() {
  return flight && !flight.resolved ? flight.takeoffAt : 0;
}

// La mise du vol EN COURS (id + Faveur payée), pour qu'une scène rouverte en plein
// vol restaure la bonne mise (rejeu « Revoler » correct + aperçu de gain juste).
// null si aucun vol actif.
export function icarusFlightInfo() {
  return flight && !flight.resolved ? { stakeId: flight.stakeId, stakeFaveur: flight.stakeFaveur } : null;
}

// Multiplicateur du vol en cours (1 si aucun vol). Courbe partagée avec l'UI.
export function icarusMultiplierAt(elapsedMs) {
  return Math.min(icarusEffectiveCap(), Math.exp(ICARUS_K * Math.max(0, elapsedMs) / 1000));
}

export function icarusMultiplier(nowMs = Date.now()) {
  if (!flight || flight.resolved) return 1;
  return icarusMultiplierAt(nowMs - flight.takeoffAt);
}

export function icarusLastOutcome() {
  return lastOutcome;
}

// Cagnotte du temple, EN FAVEUR (arrondie pour l'affichage).
export function icarusPotFaveur() {
  return Math.round(Math.max(0, state.icarusPotFaveur || 0));
}

function pushIcarusHistory(crashPoint) {
  const rounded = Math.round(crashPoint * 100) / 100;
  state.icarusHistory = [...(state.icarusHistory || []), rounded].slice(-icarusHistoryLen());
}

function resolveCrash() {
  if (!flight || flight.resolved) return;
  flight.resolved = true;
  clearTimeout(flight.timer);
  // Plumes de secours (artefact) : PRÉLEVÉES SUR LA CELLA, plus mintées. Le filet
  // est financé par les crashs précédents ; une cella vide ne rend rien. Avant le
  // versement, comme la rafle du cash-out : on prend ce qui est là, PUIS le temple
  // prélève sa part de cette mise-ci.
  const refundFaveur = drawFromPot(icarusCrashConsolation(flight.stakeFaveur));
  if (refundFaveur > 0) state.faveur = Math.max(0, (state.faveur || 0) + refundFaveur);
  // La cire fond : la cagnotte est nourrie sur l'EDGE du vol (cf. feedPot), plus sur
  // une part de la MISE. L'ancien 0.4 × mise contre un edge de 0.18 faisait d'Icare
  // l'imprimante la plus lourde du temple (118,7 % à la cible ×10).
  const potGainFaveur = feedPot(flight.stakeFaveur, 1 - icarusEffectiveEdge());
  // Registre de la Chronique : vol brûlé (une plume de secours reste une Faveur
  // reçue). Pas de multiplicateur réalisé — le record de mult n'est pas touché.
  recordIcarus({
    wagered: flight.freeFlight ? 0 : flight.stakeFaveur,
    won: refundFaveur,
    crashed: true
  });
  pushIcarusHistory(flight.crashPoint);
  lastOutcome = {
    type: "crash",
    crashPoint: flight.crashPoint,
    potGainFaveur,
    refundFaveur,
    stakeFaveur: flight.stakeFaveur
  };
  // Le crash pousse un float, comme le cash-out (:199). Sans lui, la mise brûlait
  // EN SILENCE : le timer tire même scène fermée, et le joueur ne savait ni que son
  // vol avait fini, ni à combien. Pas de chronique en revanche — le cash-out n'en
  // écrit que sur le JACKPOT, et chroniquer chaque chute (≥ 18 % des vols) noierait
  // le fil. Le float dit la Faveur, jamais le multiplicateur : à C = 1 (edge % des
  // vols) il n'y a pas eu de vol, un « ×1.00 » se lirait comme un gain nul.
  const crashLabel = refundFaveur > 0
    ? `🪽 la cire fond : +${fmt(refundFaveur)} faveur (plumes)`
    : `🪽 la cire fond : ${fmt(flight.stakeFaveur)} faveur perdue`;
  pushOutcomeFloat({ label: crashLabel, kind: refundFaveur > 0 ? "gain" : "cost" });
  render();
}

export function launchIcarus(stakeId, options = {}) {
  const opts = (typeof options === "object" && options !== null) ? options : {};
  if (flight && !flight.resolved) return null;
  if (gamePaused || collapseInProgress || state.crisisLimitAnnounced) return null;
  if (!icarusUnlocked()) return null;
  const stake = icarusStakes().find((s) => s.id === stakeId);
  if (!stake) return null;
  // LES COFFRES : mise × 10^rang (clampée au moteur). Le payout mise × m scale
  // tout seul. Un vol OFFERT ne vaut que pour la mise DE BASE (un billet est un
  // billet) : au coffre > ×1, la Faveur est débitée normalement.
  const mult = clampStakeMult(opts.stakeMult ?? 1);
  const stakeFaveur = stake.faveur * mult;
  // Vol OFFERT (mise payée par le temple ; le gain éventuel reste calculé sur cette
  // mise). Les Coups de Vénus donnent une Plume, le Soleil du gratteux un billet à
  // la hauteur du ticket : la file porte donc N'IMPORTE QUELLE mise, plus seulement
  // « plume » (c'était un compteur d'entiers avant le 2026-07-17).
  const freeFlight = mult === 1 && consumeFreeFlight(stakeId);
  if (!freeFlight) {
    if ((state.faveur || 0) < stakeFaveur) return null;
    state.faveur = Math.max(0, (state.faveur || 0) - stakeFaveur);
  }

  // Point de crash : C = (1-EDGE)/U — EDGE % des vols brûlent au décollage
  // (C=1). L'edge est abaissé par les ailes cirées (boutique de Faveur).
  const u = Math.random();
  const crashPoint = Math.min(icarusEffectiveCap(), Math.max(1, (1 - icarusEffectiveEdge()) / Math.max(u, 1e-9)));
  const takeoffAt = Date.now();
  const crashInMs = (Math.log(crashPoint) / ICARUS_K) * 1000;
  flight = {
    stakeId,
    stakeFaveur,
    // Vol OFFERT : la mise n'est pas sortie de la poche du joueur → le registre
    // de la Chronique ne la compte pas comme misée (le gain, lui, reste gagné).
    freeFlight,
    crashPoint,
    takeoffAt,
    resolved: false,
    timer: setTimeout(resolveCrash, crashInMs + 4)
  };
  lastOutcome = null;
  render();
  return { ok: true, takeoffAt };
}

export function cashOutIcarus() {
  if (!flight || flight.resolved) return null;
  const m = icarusMultiplier();
  if (m >= flight.crashPoint) {
    // Trop tard : le soleil a déjà frappé (le timer n'avait pas encore tiré).
    resolveCrash();
    return lastOutcome;
  }
  flight.resolved = true;
  clearTimeout(flight.timer);
  const mR = Math.floor(m * 100) / 100;
  // Gain EN FAVEUR : la mise × le multiplicateur encaissé. Arrondi NON BIAISÉ
  // (payRound) : Math.round rendait le RTP de base SUPÉRIEUR À 1 sur les petites
  // mises (round(4 × 1,4) = 6 au lieu de 5,6 → 102,6 % aux ailes 6), ce qu'aucun
  // recyclage ne peut rattraper. E[payRound(x)] = x, donc le RTP redevient PLAT en
  // cible, exactement ce que la loi C = (1−e)/U promet.
  const faveur = payRound(flight.stakeFaveur * mR);
  state.faveur = Math.max(0, (state.faveur || 0) + faveur);
  // Jackpot : frôler le soleil (×10+) rafle la cagnotte de Faveur du temple, AU
  // PRORATA DE LA MISE (potRakeShare) — une Plume à 4 en emporte 16 %, une
  // Hécatombe à 25 la vide. Avant, n'importe quelle mise emportait TOUT : Icare
  // ciblé ×10 rendait alors 118,7 % dès le 1er jour (A9), et la petite mise
  // dominait strictement puisque le seul terme non linéaire du jeu ignorait la
  // mise. Ce qui reste dans la cella survit à la rafle.
  let jackpotFaveur = null;
  if (mR >= ICARUS_JACKPOT_MULT && (state.icarusPotFaveur || 0) > 0) {
    const { rake, left } = potRake(state.icarusPotFaveur, flight.stakeFaveur);
    jackpotFaveur = rake;
    state.faveur += jackpotFaveur;
    state.icarusPotFaveur = left;
    // Jalon du Grand Reset VII : décrocher un jackpot (compteur remis à 0 au GR).
    state.icarusJackpots = (state.icarusJackpots || 0) + 1;
    chronicle(left > 0
      ? `Icare frôle le soleil sans fondre : il emporte sa part de la cagnotte du temple (+${fmt(jackpotFaveur)} faveur). La cella en garde ${fmt(Math.round(left))}.`
      : `Icare frôle le soleil sans fondre : la cagnotte de Faveur du temple se déverse (+${fmt(jackpotFaveur)} faveur).`);
  }
  // La cagnotte est nourrie sur l'EDGE à CHAQUE résolution, y compris gagnée : le
  // versement ne dépend plus de l'issue, et c'est ce qui rend l'espérance exacte et
  // l'invariant démontrable en une ligne (cf. feedPot). APRÈS la rafle : on emporte
  // sa part de ce qui était là, puis le temple prend sa part de cette mise-ci.
  feedPot(flight.stakeFaveur, 1 - icarusEffectiveEdge());
  // Registre de la Chronique : vol encaissé (gain = payout + rafle éventuelle,
  // plus haut multiplicateur réalisé, jackpot compté à part). Mise nulle si le
  // vol était offert.
  recordIcarus({
    wagered: flight.freeFlight ? 0 : flight.stakeFaveur,
    won: faveur + (jackpotFaveur || 0),
    mult: mR,
    jackpot: jackpotFaveur || 0,
    crashed: false
  });
  pushIcarusHistory(flight.crashPoint);
  lastOutcome = {
    type: "cashout",
    m: mR,
    crashPoint: flight.crashPoint,
    faveur,
    jackpotFaveur,
    stakeFaveur: flight.stakeFaveur
  };
  pushOutcomeFloat({ label: `🪽 ×${mR.toFixed(2)} : +${fmt(faveur)} faveur`, kind: "gain" });
  render();
  return lastOutcome;
}

// Résolution HEADLESS d'un vol à un multiplicateur cible T (autopush du moteur
// d'automatisation). Rejoue la MÊME loi que launchIcarus + cashOutIcarus /
// resolveCrash — mêmes tirage, payout, jackpot et nourriture de cagnotte — mais
// SANS état de vol, SANS timer, SANS float, SANS historique ni lastOutcome
// (silencieux, pour ne pas polluer le jeu interactif) : un seul appel synchrone.
// GAIN ⟺ T < crashPoint (STRICT, fidèle à cashOut qui traite m>=crashPoint comme
// une chute). Ne perturbe JAMAIS un vol interactif en cours. Ne rend PAS (le
// caller rend). Retourne l'issue (pour le débit de Faveur et les tests), ou null.
export function resolveIcarusHeadless(stakeId, targetMult, options = {}) {
  const opts = (typeof options === "object" && options !== null) ? options : {};
  if (flight && !flight.resolved) return null; // ne pas résoudre par-dessus un vol interactif
  if (gamePaused || collapseInProgress || state.crisisLimitAnnounced) return null;
  if (!icarusUnlocked()) return null;
  const stake = icarusStakes().find((s) => s.id === stakeId);
  if (!stake) return null;
  // LES COFFRES : parité stricte avec launchIcarus (mise ×, vol offert au ×1 seul).
  const mult = clampStakeMult(opts.stakeMult ?? 1);
  const stakeFaveur = stake.faveur * mult;
  // Vol OFFERT si la file en porte un À CETTE MISE ; sinon débit de Faveur.
  const freeFlight = mult === 1 && consumeFreeFlight(stakeId);
  if (!freeFlight) {
    if ((state.faveur || 0) < stakeFaveur) return null;
    state.faveur = Math.max(0, (state.faveur || 0) - stakeFaveur);
  }
  const u = Math.random();
  const crashPoint = Math.min(icarusEffectiveCap(), Math.max(1, (1 - icarusEffectiveEdge()) / Math.max(u, 1e-9)));
  const T = Math.min(icarusEffectiveCap(), Math.max(1, Number(targetMult) || 1));
  if (T < crashPoint) {
    // GAIN : payout de base identique à cashOutIcarus (mR = floor au centième).
    // NB : le JACKPOT (rafle de la cagnotte + jalon GR VII) reste RÉSERVÉ au jeu
    // INTERACTIF — l'auto encaisse le multiplicateur mais ne rafle PAS la cagnotte
    // ni ne décroche le jalon (le gros coup se joue à la main). Les PERTES auto,
    // elles, nourrissent la cagnotte comme les autres.
    const mR = Math.floor(T * 100) / 100;
    const faveur = payRound(stakeFaveur * mR); // parité stricte avec cashOutIcarus
    state.faveur = Math.max(0, (state.faveur || 0) + faveur);
    // La cagnotte est nourrie sur l'EDGE à CHAQUE résolution, gagnée comprise
    // (parité stricte avec resolveCrash/cashOut, et c'est ce qui rend l'espérance
    // exacte — cf. feedPot).
    feedPot(stakeFaveur, 1 - icarusEffectiveEdge());
    // Registre de la Chronique : encaissement auto (pas de jackpot en headless).
    recordIcarus({ wagered: freeFlight ? 0 : stakeFaveur, won: faveur, mult: mR, crashed: false });
    return { type: "cashout", m: mR, crashPoint, faveur, jackpotFaveur: null, freeFlight, stakeFaveur };
  }
  // PERTE : la mise brûle. Plumes PRÉLEVÉES SUR LA CELLA puis versement sur l'edge
  // — parité stricte avec resolveCrash, ordre compris.
  const refundFaveur = drawFromPot(icarusCrashConsolation(stakeFaveur));
  if (refundFaveur > 0) state.faveur = Math.max(0, (state.faveur || 0) + refundFaveur);
  const potGainFaveur = feedPot(stakeFaveur, 1 - icarusEffectiveEdge());
  recordIcarus({ wagered: freeFlight ? 0 : stakeFaveur, won: refundFaveur, crashed: true });
  return { type: "crash", crashPoint, potGainFaveur, refundFaveur, freeFlight, stakeFaveur };
}

// Faveur qu'aurait payée un retrait ~1 s avant la chute (le couteau dans la
// plaie, affiché par l'UI après un crash). Null si le vol a brûlé au décollage.
export function icarusAlmostPayout(outcome) {
  if (!outcome || outcome.type !== "crash" || outcome.crashPoint <= 1.05) return null;
  const mBefore = Math.floor(Math.max(1, outcome.crashPoint / Math.exp(ICARUS_K)) * 100) / 100;
  return { m: mBefore, faveur: Math.round((outcome.stakeFaveur || 0) * mBefore) };
}

// Réservé aux tests : purge le vol en cours et le dernier résultat.
export function __resetIcarusForTests() {
  if (flight?.timer) clearTimeout(flight.timer);
  flight = null;
  lastOutcome = null;
}
