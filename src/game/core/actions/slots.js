"use strict";

// LA MACHINE À SOUS — moteur (2026-10-03, demande de Raph : « une machine à sous, avec
// des bonus type free spin et mini jeux, qui déclenche une roue »). Constantes SLOTS_*
// de balance.js. MONNAIE FERMÉE : mise et gains en FAVEUR, comme les quatre autres jeux.
//
//   - spinSlots(stakeId) : paie la mise (ou consomme un TOUR GRATUIT en attente), tire
//     les ARRÊTS des trois rouleaux (un Math.random chacun — c'est une vraie machine :
//     l'issue est la fenêtre, pas un lot repeint après coup), évalue les cinq lignes,
//     les étoiles (tours gratuits) et les roues (le bonus de la roue).
//   - La ROUE est tirée en même temps que les rouleaux (une case sur douze, égales) mais
//     son effet attend sa révélation : `result.wheel.apply(choix)`. Le mini-jeu des
//     COFFRES se joue au choix du joueur (les trois valeurs sont battues : le choix ne
//     change pas l'espérance, il la raconte).
//   - Tout effet passe par un apply() IDEMPOTENT (option `defer`), comme le gratteux :
//     l'UI le tient jusqu'à l'arrêt des rouleaux ; fermer la machine le vide.
// Les tours gratuits SURVIVENT à la fermeture de la machine (state.slotsFreeSpins) : on
// les retrouve en revenant. Ils tombent à l'effondrement, comme les vols offerts.

import { state, render, gamePaused, collapseInProgress } from '../state.js';
import { regulationContext } from '../mechanics.js';
import { fmt } from '../utils.js';
import {
  ICARUS_STAKES,
  ICARUS_EDGE_FLOOR,
  SLOTS_UNLOCK_ERA,
  SLOTS_STAKES,
  SLOTS_PAY,
  SLOTS_LINES,
  SLOTS_REELS,
  SLOTS_FREE_SPINS,
  SLOTS_FREE_MULT,
  SLOTS_WHEEL,
  SLOTS_CHESTS,
  SLOTS_FLIGHT,
  SLOTS_HISTORY_LEN
} from '../balance.js';
import { chronicle } from './utils.js';
import { grantFreeFlight } from './templeFlights.js';
import { feedPot, drawFromPot, payRound, clampStakeMult, potRake } from './templePot.js';
import { pushOutcomeFloat } from '../outcomeFloat.js';
import { recordSlots, recordSlotsBonus } from '../chronicleStats.js';

export function slotsUnlocked(ctx = regulationContext()) {
  return ctx.bestEra >= SLOTS_UNLOCK_ERA;
}

export function slotsStakes() {
  return SLOTS_STAKES.map((s) => ({ ...s }));
}

// La fenêtre : grid[rouleau][rangée], la rangée 1 étant celle de l'arrêt.
export function slotsWindow(stops) {
  return SLOTS_REELS.map((reel, r) => [0, 1, 2].map((row) => reel[(stops[r] + row - 1 + reel.length) % reel.length]));
}

// Ce que paie une fenêtre : les lignes gagnantes (× la mise), et les déclencheurs.
export function slotsEvaluate(grid) {
  const lines = [];
  let pay = 0;
  SLOTS_LINES.forEach((ln, i) => {
    const a = grid[0][ln[0]], b = grid[1][ln[1]], c = grid[2][ln[2]];
    if (a === b && b === c && SLOTS_PAY[a]) { lines.push({ line: i, symbol: a, pay: SLOTS_PAY[a] }); pay += SLOTS_PAY[a]; }
  });
  let stars = 0, wheels = 0;
  for (const col of grid) for (const s of col) { if (s === 'etoile') stars += 1; else if (s === 'roue') wheels += 1; }
  return { lines, pay, stars, wheels, freeSpins: stars >= 3, wheel: wheels >= 3 };
}

// ── LE RTP DE RÉFÉRENCE, calculé et jamais saisi ────────────────────────────────
// Énumération des 27³ arrêts : espérance des lignes (L), probabilités des étoiles (pS)
// et des roues (pW). Puis, en une équation : une série de tours gratuits F (avec ses
// relances et ses roues) et une roue W (dont une case offre une série) se répondent :
//   F = n·(m·L + pW·W),  n = N / (1 − N·pS)        (relances : processus de branchement)
//   W = (Σ nombres + coffres + vol + cases « tours » × F) / 12
// d'où W, puis RTP = L + pS·F + pW·W. Le vol d'Icare est compté au plancher d'edge
// (majorant, comme le gratteux) ; le jackpot est un transfert, il ne compte pas.
let _base = null;
function baseStats() {
  if (_base) return _base;
  const [A, B, C] = SLOTS_REELS.map((r) => r.length);
  let L = 0, pS = 0, pW = 0, hit = 0;
  for (let a = 0; a < A; a += 1) for (let b = 0; b < B; b += 1) for (let c = 0; c < C; c += 1) {
    const ev = slotsEvaluate(slotsWindow([a, b, c]));
    L += ev.pay; if (ev.pay > 0) hit += 1;
    if (ev.freeSpins) pS += 1;
    if (ev.wheel) pW += 1;
  }
  const n = A * B * C;
  _base = { L: L / n, pS: pS / n, pW: pW / n, hit: hit / n };
  return _base;
}

export function slotsOdds(stakeId) {
  const { L, pS, pW, hit } = baseStats();
  const stake = SLOTS_STAKES.find((s) => s.id === stakeId) || SLOTS_STAKES[0];
  const flightStake = ICARUS_STAKES.find((s) => s.id === SLOTS_FLIGHT[stake.id]);
  const flight = flightStake ? (flightStake.faveur * (1 - ICARUS_EDGE_FLOOR)) / stake.faveur : 0;
  const N = SLOTS_FREE_SPINS, m = SLOTS_FREE_MULT;
  const spins = N / (1 - N * pS);
  const chest = SLOTS_CHESTS.reduce((s, v) => s + v, 0) / SLOTS_CHESTS.length;
  const seg = SLOTS_WHEEL.length;
  let c = 0, nT = 0;
  for (const s of SLOTS_WHEEL) {
    if (typeof s === 'number') c += s;
    else if (s === 'coffres') c += chest;
    else if (s === 'vol') c += flight;
    else if (s === 'tours') nT += 1;
  }
  c /= seg;
  const d = nT / seg, a = spins * m * L, bF = spins * pW;
  const W = (c + d * a) / (1 - d * bF);
  const F = a + bF * W;
  return { L, pS, pW, hit, spins, F, W, rtp: L + pS * F + pW * W };
}

export function slotsRtpRef(stakeId) {
  return slotsOdds(stakeId).rtp;
}

// ── Le tirage ───────────────────────────────────────────────────────────────────
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Une série de tours gratuits en cours : { left, stakeId, stakeFaveur, won, total }.
export function slotsFreeSpins() {
  const f = state.slotsFreeSpins;
  return f && f.left > 0 ? f : null;
}

// `session` : la série dont un tour vient d'être joué — même à son DERNIER tour (left 0),
// trois étoiles la prolongent au lieu d'en ouvrir une autre (ses gains restent comptés).
function addFreeSpins(stakeId, stakeFaveur, n, session = null) {
  const f = slotsFreeSpins() || (session && session === state.slotsFreeSpins ? session : null);
  if (f) { f.left += n; f.total += n; return f; }
  state.slotsFreeSpins = { left: n, stakeId, stakeFaveur, won: 0, total: n };
  return state.slotsFreeSpins;
}

// La roue, tirée d'avance ; son apply(choix) l'encaisse (choix : le coffre ouvert).
function drawWheel(stakeId, stakeFaveur, session = null) {
  const index = Math.min(SLOTS_WHEEL.length - 1, Math.floor(Math.random() * SLOTS_WHEEL.length));
  const segment = SLOTS_WHEEL[index];
  const wheel = { index, segment, stakeId, stakeFaveur, chests: segment === 'coffres' ? shuffle(SLOTS_CHESTS.slice()) : null, faveurGain: 0, jackpotFaveur: 0, flight: false, freeSpins: 0, chestPick: null };
  let applied = false;
  wheel.apply = (pick = 0) => {
    if (applied) return wheel;
    applied = true;
    if (typeof segment === 'number') wheel.faveurGain = payRound(stakeFaveur * segment);
    else if (segment === 'coffres') {
      wheel.chestPick = Math.max(0, Math.min(2, pick | 0));
      wheel.faveurGain = payRound(stakeFaveur * wheel.chests[wheel.chestPick]);
    } else if (segment === 'tours') {
      wheel.freeSpins = SLOTS_FREE_SPINS;
      addFreeSpins(stakeId, stakeFaveur, SLOTS_FREE_SPINS, session);
    } else if (segment === 'vol') {
      wheel.flight = grantFreeFlight(SLOTS_FLIGHT[stakeId] || 'plume');
    } else if (segment === 'jackpot') {
      // La cagnotte, au prorata de la mise (potRakeShare) : le lingot la rafle entière.
      const { rake } = potRake(state.icarusPotFaveur || 0, stakeFaveur);
      wheel.jackpotFaveur = drawFromPot(rake);
      if (wheel.jackpotFaveur > 0) chronicle(`JACKPOT à la machine à sous : la cagnotte de la Maison verse ${fmt(wheel.jackpotFaveur)} faveur.`);
    }
    const won = wheel.faveurGain + wheel.jackpotFaveur;
    if (won > 0) {
      state.faveur = Math.max(0, (state.faveur || 0) + won);
      const f = slotsFreeSpins() || (session && session === state.slotsFreeSpins ? session : null);
      if (f) f.won += won;
    }
    recordSlotsBonus({ won, jackpot: wheel.jackpotFaveur });
    pushOutcomeFloat({
      label: wheel.jackpotFaveur > 0 ? `🎰 JACKPOT +${fmt(wheel.jackpotFaveur)} faveur`
        : wheel.freeSpins ? `🎰 +${wheel.freeSpins} tours gratuits`
          : wheel.flight ? '🎰 vol d’Icare offert'
            : `🎰 +${fmt(wheel.faveurGain)} faveur`,
      kind: 'gain'
    });
    render();
    return wheel;
  };
  return wheel;
}

// Un tour. Retourne { stops, grid, lines, pay, free, mult, stakeId, stakeFaveur,
// faveurGain, freeSpinsWon, wheel, apply } — faveurGain/freeSpinsWon remplis par apply().
export function spinSlots(stakeId, options = {}) {
  const opts = (typeof options === 'object' && options !== null) ? options : {};
  const { render: doRender = true, defer = false, silent = false, stakeMult = 1 } = opts;
  if (gamePaused || collapseInProgress) return null;
  if (state.crisisLimitAnnounced) return null;
  if (!slotsUnlocked()) return null;

  // Un tour gratuit en attente passe AVANT la mise choisie : il se joue à SA mise.
  const fs = slotsFreeSpins();
  let stake, stakeFaveur;
  if (fs) {
    stake = SLOTS_STAKES.find((s) => s.id === fs.stakeId) || SLOTS_STAKES[0];
    stakeFaveur = fs.stakeFaveur;
    fs.left -= 1;
  } else {
    stake = SLOTS_STAKES.find((s) => s.id === stakeId);
    if (!stake) return null;
    stakeFaveur = stake.faveur * clampStakeMult(stakeMult);
    if ((state.faveur || 0) < stakeFaveur) return null;
    state.faveur = Math.max(0, (state.faveur || 0) - stakeFaveur);
  }

  const stops = SLOTS_REELS.map((reel) => Math.min(reel.length - 1, Math.floor(Math.random() * reel.length)));
  const grid = slotsWindow(stops);
  const ev = slotsEvaluate(grid);
  const mult = fs ? SLOTS_FREE_MULT : 1;
  const result = {
    stops, grid, lines: ev.lines, pay: ev.pay, free: Boolean(fs), mult,
    stakeId: stake.id, stakeFaveur,
    faveurGain: 0, freeSpinsWon: 0,
    freeLeft: fs ? fs.left : 0,
    wheel: ev.wheel ? drawWheel(stake.id, stakeFaveur, fs) : null
  };

  let applied = false;
  result.apply = () => {
    if (applied) return result;
    applied = true;
    const hist = Array.isArray(state.slotsHistory) ? state.slotsHistory : (state.slotsHistory = []);
    hist.push(ev.wheel ? 'roue' : ev.freeSpins ? 'tours' : ev.pay > 0 ? 'gain' : 'perte');
    if (hist.length > SLOTS_HISTORY_LEN) hist.splice(0, hist.length - SLOTS_HISTORY_LEN);

    if (ev.pay > 0) {
      result.faveurGain = payRound(stakeFaveur * ev.pay * mult);
      state.faveur = Math.max(0, (state.faveur || 0) + result.faveurGain);
    }
    if (fs && fs === state.slotsFreeSpins) fs.won += result.faveurGain;
    if (ev.freeSpins) {
      result.freeSpinsWon = SLOTS_FREE_SPINS;
      addFreeSpins(stake.id, stakeFaveur, SLOTS_FREE_SPINS, fs);
      chronicle(`Trois étoiles à la machine à sous : ${SLOTS_FREE_SPINS} tours gratuits.`);
    }
    result.freeLeft = slotsFreeSpins() ? slotsFreeSpins().left : 0;
    // La cagnotte est nourrie sur l'EDGE d'un tour PAYÉ, tours gratuits et roue compris
    // dans le RTP de référence (ils n'en nourrissent donc pas une seconde fois).
    if (!fs) feedPot(stakeFaveur, slotsRtpRef(stake.id));
    recordSlots({ wagered: fs ? 0 : stakeFaveur, won: result.faveurGain, freeSpins: ev.freeSpins, wheel: ev.wheel });

    if (!silent) {
      const label = ev.freeSpins ? `🎰 ${SLOTS_FREE_SPINS} tours gratuits`
        : result.faveurGain > 0 ? `🎰 +${fmt(result.faveurGain)} faveur`
          : ev.wheel ? '🎰 la roue !' : '🎰 rien';
      pushOutcomeFloat({ label, kind: result.faveurGain > 0 || ev.freeSpins || ev.wheel ? 'gain' : 'cost' });
    }
    if (doRender) render();
    return result;
  };

  if (!defer) result.apply();
  return result;
}
