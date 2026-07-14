"use strict";

// Le Vol d'Icare — MOTEUR du crash game du temple (cf. constantes ICARUS_* de
// balance.js pour la loi du jeu). Le vol est un état MODULE (éphémère : un
// rechargement en plein vol abandonne la mise — le vol dure ~5-30 s) ; le
// point de crash est tiré à l'envol et un setTimeout AUTORITAIRE résout la
// chute même si le dialogue est fermé. L'UI (IcarusDialog) ne fait que lire
// icarusMultiplier()/icarusLastOutcome() et mettre en scène.
//   - launchIcarus(stakeId) : paie la mise (or, ancrée en secondes de prod),
//     tire C = (1-EDGE)/U et programme la chute à t = ln(C)/K.
//   - cashOutIcarus() : si m(now) < C, paie mise × m (arrondi au centième) ;
//     à ×JACKPOT ou plus, rafle la cagnotte du temple. Révèle C (near-miss).
//   - La chute nourrit la cagnotte (state.icarusPotS, en SECONDES de prod
//     d'or — anti-inflation) et l'historique des crashs (state.icarusHistory).
// PAS une action de régulation : ni fatigue, ni compteurs de crise — le seul
// frein est l'espérance négative (recyclée en cagnotte). Dilapider l'or fait
// fondre la réserve (goldReserveEase) → apaise les Inégalités en prime.

import { state, render, gamePaused, collapseInProgress } from '../state.js';
import { rates, regulationContext } from '../mechanics.js';
import { D } from '../num.js';
import { fmt } from '../utils.js';
import {
  ICARUS_EDGE,
  ICARUS_CAP,
  ICARUS_K,
  ICARUS_JACKPOT_MULT,
  ICARUS_FAVEUR_K,
  ICARUS_POT_FEED,
  ICARUS_POT_CAP_FAVEUR,
  ICARUS_HISTORY_LEN,
  ICARUS_STAKES,
  WING_STEP,
  WING_MAX_LEVEL,
  ICARUS_EDGE_FLOOR
} from '../balance.js';
import { chronicle } from './utils.js';
import { pushOutcomeFloat } from '../outcomeFloat.js';

// Jeux DÉCOUPLÉS (arbitrage Raph) : la mise reste en OR (le puits), mais le
// GAIN est de la FAVEUR (monnaie méta). La cagnotte du temple est en Faveur.
let flight = null;      // { stakeGold:Decimal, stakeSeconds, crashPoint, takeoffAt, timer, resolved }
let lastOutcome = null; // { type:'crash'|'cashout', m?, crashPoint, faveur?, jackpotFaveur?, potGainFaveur?, stakeSeconds }

export function icarusUnlocked(ctx = regulationContext()) {
  return ctx.bestEra >= 3;
}

// Edge EFFECTIF : l'edge de base abaissé par les ailes cirées (boutique de
// Faveur), avec un plancher. Un edge plus bas = odds meilleures.
export function icarusEffectiveEdge() {
  const reduction = Math.min(WING_MAX_LEVEL, state.wingLevel || 0) * WING_STEP;
  return Math.max(ICARUS_EDGE_FLOOR, ICARUS_EDGE - reduction);
}

// Mises proposées : N secondes de production d'or courante (plancher plat pour
// les débuts de cycle où la production est faible).
export function icarusStakes() {
  const goldRate = D(rates().gold).max(0);
  return ICARUS_STAKES.map((s) => ({
    ...s,
    gold: goldRate.mul(s.seconds).max(s.floor).floor()
  }));
}

export function icarusFlying() {
  return Boolean(flight && !flight.resolved);
}

export function icarusTakeoffAt() {
  return flight && !flight.resolved ? flight.takeoffAt : 0;
}

// Multiplicateur du vol en cours (1 si aucun vol). Courbe partagée avec l'UI.
export function icarusMultiplierAt(elapsedMs) {
  return Math.min(ICARUS_CAP, Math.exp(ICARUS_K * Math.max(0, elapsedMs) / 1000));
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
  state.icarusHistory = [...(state.icarusHistory || []), rounded].slice(-ICARUS_HISTORY_LEN);
}

function resolveCrash() {
  if (!flight || flight.resolved) return;
  flight.resolved = true;
  clearTimeout(flight.timer);
  // La cire fond : une part de la mise (en secondes) rejoint la cagnotte de Faveur.
  const potGainFaveur = flight.stakeSeconds * ICARUS_POT_FEED;
  state.icarusPotFaveur = Math.min(ICARUS_POT_CAP_FAVEUR, Math.max(0, state.icarusPotFaveur || 0) + potGainFaveur);
  pushIcarusHistory(flight.crashPoint);
  lastOutcome = {
    type: "crash",
    crashPoint: flight.crashPoint,
    potGainFaveur,
    stakeSeconds: flight.stakeSeconds
  };
  render();
}

export function launchIcarus(stakeId) {
  if (flight && !flight.resolved) return null;
  if (gamePaused || collapseInProgress || state.crisisLimitAnnounced) return null;
  if (!icarusUnlocked()) return null;
  const stake = icarusStakes().find((s) => s.id === stakeId);
  if (!stake) return null;
  // Coup de Vénus aux osselets → vol OFFERT (mise « Plume » payée par le
  // temple ; le gain éventuel reste calculé sur cette mise).
  const freeFlight = stakeId === "plume" && (state.icarusFreeFlights || 0) > 0;
  if (freeFlight) {
    state.icarusFreeFlights -= 1;
  } else {
    if (D(state.gold).lt(stake.gold)) return null;
    state.gold = D(state.gold).sub(stake.gold);
  }

  // Point de crash : C = (1-EDGE)/U — EDGE % des vols brûlent au décollage
  // (C=1). L'edge est abaissé par les ailes cirées (boutique de Faveur).
  const u = Math.random();
  const crashPoint = Math.min(ICARUS_CAP, Math.max(1, (1 - icarusEffectiveEdge()) / Math.max(u, 1e-9)));
  const takeoffAt = Date.now();
  const crashInMs = (Math.log(crashPoint) / ICARUS_K) * 1000;
  flight = {
    stakeGold: stake.gold,
    stakeSeconds: stake.seconds,
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
  // Gain EN FAVEUR : secondes de mise × multiplicateur × K.
  const faveur = Math.round(flight.stakeSeconds * mR * ICARUS_FAVEUR_K);
  state.faveur = Math.max(0, (state.faveur || 0) + faveur);

  // Jackpot : frôler le soleil (×10+) rafle la cagnotte de Faveur du temple.
  let jackpotFaveur = null;
  if (mR >= ICARUS_JACKPOT_MULT && (state.icarusPotFaveur || 0) > 0) {
    jackpotFaveur = icarusPotFaveur();
    state.faveur += jackpotFaveur;
    state.icarusPotFaveur = 0;
    // Jalon du Grand Reset VII : décrocher un jackpot (compteur remis à 0 au GR).
    state.icarusJackpots = (state.icarusJackpots || 0) + 1;
    chronicle(`Icare frôle le soleil sans fondre : la cagnotte de Faveur du temple se déverse (+${fmt(jackpotFaveur)} faveur).`);
  }
  pushIcarusHistory(flight.crashPoint);
  lastOutcome = {
    type: "cashout",
    m: mR,
    crashPoint: flight.crashPoint,
    faveur,
    jackpotFaveur,
    stakeSeconds: flight.stakeSeconds
  };
  pushOutcomeFloat({ label: `🪽 ×${mR.toFixed(2)} : +${fmt(faveur)} faveur`, kind: "gain" });
  render();
  return lastOutcome;
}

// Faveur qu'aurait payée un retrait ~1 s avant la chute (le couteau dans la
// plaie, affiché par l'UI après un crash). Null si le vol a brûlé au décollage.
export function icarusAlmostPayout(outcome) {
  if (!outcome || outcome.type !== "crash" || outcome.crashPoint <= 1.05) return null;
  const mBefore = Math.floor(Math.max(1, outcome.crashPoint / Math.exp(ICARUS_K)) * 100) / 100;
  return { m: mBefore, faveur: Math.round((outcome.stakeSeconds || 0) * mBefore * ICARUS_FAVEUR_K) };
}

// Réservé aux tests : purge le vol en cours et le dernier résultat.
export function __resetIcarusForTests() {
  if (flight?.timer) clearTimeout(flight.timer);
  flight = null;
  lastOutcome = null;
}
