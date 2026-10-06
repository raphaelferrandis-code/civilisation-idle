"use strict";

// LA MACHINE À SOUS — moteur (2026-10-03, demande de Raph : « une machine à sous, avec
// des bonus type free spin et mini jeux, qui déclenche une roue » ; v2 le même soir :
// « 5 rouleaux, joker et Hold & Win »). Constantes SLOTS_* de balance.js, mathématiques
// pures dans slotsMath.js. MONNAIE FERMÉE : mise et gains en FAVEUR.
//
//   - spinSlots(stake) : paie la mise (ou consomme un TOUR GRATUIT en attente), tire
//     les ARRÊTS des cinq rouleaux (un Math.random chacun), évalue les vingt lignes
//     (joker compris), les étoiles (tours gratuits), les roues (la roue), les pièces
//     (le Hold & Win).
//   - La ROUE et le HOLD & WIN sont tirés en même temps que les rouleaux, mais leurs
//     effets attendent leur révélation : `result.wheel.apply(choix)`,
//     `result.holdWin.apply()`. Fermer la machine les encaisse (la vue vide ce qui reste).
//   - Tout effet du tour passe par un apply() IDEMPOTENT (option `defer`).
// Les tours gratuits SURVIVENT à la fermeture (state.slotsFreeSpins) ; ils tombent à
// l'effondrement, comme les vols offerts.

import { state, render, gamePaused, collapseInProgress } from '../state.js';
import { regulationContext } from '../mechanics.js';
import { fmt } from '../utils.js';
import { tr } from '../i18n.js';
import {
  ICARUS_RTP,
  SLOTS_UNLOCK_ERA,
  SLOTS_PAY,
  SLOTS_LINES,
  SLOTS_REELS,
  SLOTS_WILD,
  SLOTS_FREE_SPINS,
  SLOTS_FREE_MULT,
  SLOTS_WHEEL,
  SLOTS_WHEEL_AT,
  SLOTS_WHEEL_SPINS,
  SLOTS_CHESTS,
  SLOTS_HW,
  SLOTS_GRAND_FLOOR,
  SLOTS_HISTORY_LEN
} from '../balance.js';
import { chronicle } from './utils.js';
import { grantFreeFlight } from './templeFlights.js';
import { feedPot, drawFromPot, payRound, potRake } from './templePot.js';
import { recordWager } from './maisonRang.js';
import { clampStake } from './maisonTable.js';
import { pushOutcomeFloat } from '../outcomeFloat.js';
import { recordSlots, recordSlotsBonus } from '../chronicleStats.js';
import { windowOf, evaluate, slotsOddsOf, SLOT_ROWS } from './slotsMath.js';

// La machine telle que la décrit balance.js, pour les mathématiques.
export const SLOTS_CFG = {
  reels: SLOTS_REELS, lines: SLOTS_LINES, pay: SLOTS_PAY, wild: SLOTS_WILD,
  scatter: 'etoile', bonus: 'roue', coin: 'piece',
  freeSpins: SLOTS_FREE_SPINS, freeMult: SLOTS_FREE_MULT,
  wheel: SLOTS_WHEEL, wheelAt: SLOTS_WHEEL_AT, wheelSpins: SLOTS_WHEEL_SPINS,
  chests: SLOTS_CHESTS, hw: SLOTS_HW, grandFloor: SLOTS_GRAND_FLOOR
};
export const SLOTS_CELLS = SLOTS_REELS.length * SLOT_ROWS;

export function slotsUnlocked(ctx = regulationContext()) {
  return ctx.bestEra >= SLOTS_UNLOCK_ERA;
}

export function slotsWindow(stops) {
  return windowOf(SLOTS_REELS, stops);
}

export function slotsEvaluate(grid) {
  return evaluate(grid, SLOTS_CFG);
}

// ── LE RTP DE RÉFÉRENCE, calculé (slotsMath.js) ─────────────────────────────────
// Les chances et le RTP exacts de la machine, calculés une fois et mémorisés (~20 ms).
// Le plancher du GRAND y compte (la machine le paie) ; sa part de cagnotte, transfert,
// non. La case « vol » de la roue offre un vol d'Icare À LA MISE DU TOUR : sa valeur
// vaut la mise × le RTP d'Icare, quelle que soit la mise.
let _odds = null;
export function slotsOdds() {
  if (!_odds) _odds = slotsOddsOf(SLOTS_CFG, ICARUS_RTP);
  return _odds;
}

// RTP de RÉFÉRENCE (hors cagnotte, qui est un transfert) — lu par feedPot.
export function slotsRtpRef() {
  return slotsOdds().rtp;
}

// Les jackpots du Hold & Win, en Faveur, pour une mise : MINI et MAJEUR fixes, GRAND
// = son plancher (×SLOTS_GRAND_FLOOR la mise) + la part de cagnotte que raflerait la
// mise (affichés sur la machine). Le GRAND passe toujours devant le MAJEUR.
export function slotsJackpots(stakeFaveur) {
  const mini = SLOTS_HW.values.find((c) => c.jp === 'mini');
  const majeur = SLOTS_HW.values.find((c) => c.jp === 'majeur');
  return {
    mini: Math.round((mini ? mini.v : 0) * stakeFaveur),
    majeur: Math.round((majeur ? majeur.v : 0) * stakeFaveur),
    grand: Math.round(SLOTS_GRAND_FLOOR * stakeFaveur) + potRake(state.icarusPotFaveur || 0, stakeFaveur).rake
  };
}

// ── Le tirage ───────────────────────────────────────────────────────────────────
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Une série de tours gratuits en cours : { left, stakeFaveur, won, total }.
export function slotsFreeSpins() {
  const f = state.slotsFreeSpins;
  return f && f.left > 0 ? f : null;
}

// `session` : la série dont un tour vient d'être joué — même à son DERNIER tour (left 0),
// de nouvelles étoiles la prolongent au lieu d'en ouvrir une autre.
function addFreeSpins(stakeFaveur, n, session = null) {
  const f = slotsFreeSpins() || (session && session === state.slotsFreeSpins ? session : null);
  if (f) { f.left += n; f.total += n; return f; }
  state.slotsFreeSpins = { left: n, stakeFaveur, won: 0, total: n };
  return state.slotsFreeSpins;
}
// Seule la série EXPLICITEMENT jouée encaisse : le bonus (roue, Hold & Win) d'un
// tour PAYÉ dont les étoiles viennent d'ouvrir une série n'appartient pas à
// celle-ci (sinon « ★ 0/8 · +2 000 » avant le premier tour gratuit).
function addToSeries(session, won) {
  const f = session && session === state.slotsFreeSpins ? session : null;
  if (f && won > 0) f.won += won;
}

// La roue, tirée d'avance ; son apply(choix) l'encaisse (choix : le coffre ouvert).
function drawWheel(stakeFaveur, session = null) {
  const index = Math.min(SLOTS_WHEEL.length - 1, Math.floor(Math.random() * SLOTS_WHEEL.length));
  const segment = SLOTS_WHEEL[index];
  const wheel = { index, segment, stakeFaveur, chests: segment === 'coffres' ? shuffle(SLOTS_CHESTS.slice()) : null, faveurGain: 0, jackpotFaveur: 0, flight: false, freeSpins: 0, chestPick: null };
  let applied = false;
  wheel.apply = (pick = 0) => {
    if (applied) return wheel;
    applied = true;
    if (typeof segment === 'number') wheel.faveurGain = payRound(stakeFaveur * segment);
    else if (segment === 'coffres') {
      wheel.chestPick = Math.max(0, Math.min(2, pick | 0));
      wheel.faveurGain = payRound(stakeFaveur * wheel.chests[wheel.chestPick]);
    } else if (segment === 'tours') {
      wheel.freeSpins = SLOTS_WHEEL_SPINS;
      addFreeSpins(stakeFaveur, SLOTS_WHEEL_SPINS, session);
    } else if (segment === 'vol') {
      wheel.flight = grantFreeFlight(stakeFaveur);
    } else if (segment === 'jackpot') {
      // La case « JP » : la CAGNOTTE, au prorata de la mise (la limite de base la rafle
      // entière). Pas de plancher ici : cette case tombe bien plus souvent que le GRAND.
      const { rake } = potRake(state.icarusPotFaveur || 0, stakeFaveur);
      wheel.jackpotFaveur = drawFromPot(rake);
      if (wheel.jackpotFaveur > 0) {
        chronicle(tr({
          fr: `La roue de la machine à sous tombe sur la cagnotte de la Maison : elle verse ${fmt(wheel.jackpotFaveur)} faveur.`,
          en: `The slot machine's wheel lands on the House pot: it pays out ${fmt(wheel.jackpotFaveur)} favor.`
        }));
      }
    }
    const won = wheel.faveurGain + wheel.jackpotFaveur;
    if (won > 0) state.faveur = Math.max(0, (state.faveur || 0) + won);
    addToSeries(session, won);
    recordSlotsBonus({ won, jackpot: wheel.jackpotFaveur });
    pushOutcomeFloat({
      label: wheel.jackpotFaveur > 0 ? tr({ fr: `🎰 Cagnotte +${fmt(wheel.jackpotFaveur)} faveur`, en: `🎰 Pot +${fmt(wheel.jackpotFaveur)} favor` })
        : wheel.freeSpins ? tr({ fr: `🎰 +${wheel.freeSpins} tours gratuits`, en: `🎰 +${wheel.freeSpins} free spins` })
          : wheel.flight ? tr({ fr: '🎰 vol d’Icare offert', en: '🎰 free flight of Icarus' })
            : tr({ fr: `🎰 +${fmt(wheel.faveurGain)} faveur`, en: `🎰 +${fmt(wheel.faveurGain)} favor` }),
      kind: 'gain'
    });
    render();
    return wheel;
  };
  return wheel;
}

// Une pièce du Hold & Win : { v (× la mise), jp }.
function drawCoin() {
  const tot = SLOTS_HW.values.reduce((s, c) => s + c.w, 0);
  let r = Math.random() * tot;
  for (const c of SLOTS_HW.values) { r -= c.w; if (r < 0) return { v: c.v, jp: c.jp || null }; }
  const last = SLOTS_HW.values[SLOTS_HW.values.length - 1];
  return { v: last.v, jp: last.jp || null };
}

// LE HOLD & WIN, tiré d'avance : les pièces de départ (leurs valeurs), puis chaque relance
// (les cases qui reçoivent une pièce, les relances qui restent). La vue le rejoue ;
// apply() l'encaisse. `board[case]` : la pièce finale de chaque case (case = rouleau × 3 + rangée).
function drawHoldWin(stakeFaveur, coinCells, session = null) {
  const board = new Array(SLOTS_CELLS).fill(null);
  for (const c of coinCells) board[c] = drawCoin();
  const rounds = [];
  let respins = SLOTS_HW.respins, filled = coinCells.length;
  while (respins > 0 && filled < SLOTS_CELLS) {
    const add = [];
    for (let c = 0; c < SLOTS_CELLS; c += 1) if (!board[c] && Math.random() < SLOTS_HW.pNew) { board[c] = drawCoin(); add.push(c); }
    filled += add.length;
    respins = add.length ? SLOTS_HW.respins : respins - 1;
    rounds.push({ add, respins });
  }
  const total = board.reduce((s, c) => s + (c ? c.v : 0), 0);
  const hw = {
    stakeFaveur, initial: coinCells.slice(), board, rounds, total,
    full: filled >= SLOTS_CELLS,
    minis: board.filter((c) => c && c.jp === 'mini').length,
    majeurs: board.filter((c) => c && c.jp === 'majeur').length,
    faveurGain: 0, grandFaveur: 0
  };
  let applied = false;
  hw.apply = () => {
    if (applied) return hw;
    applied = true;
    hw.faveurGain = payRound(stakeFaveur * total);
    if (hw.full) {
      // Le GRAND : son plancher (payé par la machine), plus la part de cagnotte de la mise.
      const { rake } = potRake(state.icarusPotFaveur || 0, stakeFaveur);
      hw.grandFaveur = payRound(stakeFaveur * SLOTS_GRAND_FLOOR) + drawFromPot(rake);
      chronicle(tr({
        fr: `Hold & Win : les quinze cases de la machine à sous ! Le GRAND verse ${fmt(hw.grandFaveur)} faveur.`,
        en: `Hold & Win: all fifteen cells of the slot machine! The GRAND pays out ${fmt(hw.grandFaveur)} favor.`
      }));
    } else if (hw.majeurs) {
      // La valeur du MAJEUR se lit dans la table des pièces (elle était écrite ici à
      // ×100), et chaque MAJEUR tombé compte (BUG-85). Math.round, pas payRound : une
      // annonce ne tire pas d'aléa (il décalerait les tirages suivants).
      const mj = SLOTS_HW.values.find((c) => c.jp === 'majeur');
      const montant = fmt(Math.round(stakeFaveur * (mj ? mj.v : 0) * hw.majeurs));
      chronicle(hw.majeurs > 1 ? tr({
        fr: `Hold & Win : ${hw.majeurs} MAJEURS tombent à la machine à sous (+${montant} faveur).`,
        en: `Hold & Win: ${hw.majeurs} MAJORS land at the slot machine (+${montant} favor).`
      }) : tr({
        fr: `Hold & Win : le MAJEUR tombe à la machine à sous (+${montant} faveur).`,
        en: `Hold & Win: the MAJOR lands at the slot machine (+${montant} favor).`
      }));
    }
    const won = hw.faveurGain + hw.grandFaveur;
    state.faveur = Math.max(0, (state.faveur || 0) + won);
    addToSeries(session, won);
    recordSlotsBonus({ won, jackpot: hw.grandFaveur });
    pushOutcomeFloat({
      label: hw.full
        ? tr({ fr: `🎰 GRAND +${fmt(won)} faveur`, en: `🎰 GRAND +${fmt(won)} favor` })
        : tr({ fr: `🎰 Hold & Win +${fmt(won)} faveur`, en: `🎰 Hold & Win +${fmt(won)} favor` }),
      kind: 'gain'
    });
    render();
    return hw;
  };
  return hw;
}

// Un tour. Retourne { stops, grid, lines, pay, free, mult, stakeFaveur, stars,
// wheels, coins, faveurGain, freeSpinsWon, freeLeft, wheel, holdWin, apply } —
// faveurGain/freeSpinsWon/freeLeft remplis par apply().
export function spinSlots(stake, options = {}) {
  const opts = (typeof options === 'object' && options !== null) ? options : {};
  const { render: doRender = true, defer = false, silent = false } = opts;
  if (gamePaused || collapseInProgress) return null;
  if (state.crisisLimitAnnounced) return null;
  if (!slotsUnlocked()) return null;

  // Un tour gratuit en attente passe AVANT la mise choisie : il se joue à SA mise.
  const fs = slotsFreeSpins();
  let stakeFaveur;
  if (fs) {
    // Re-bornée par la table : une save trafiquée ne joue pas une série plus haut que
    // la limite (même garde que les vols offerts d'Icare).
    stakeFaveur = clampStake(fs.stakeFaveur) || 1;
    fs.left -= 1;
  } else {
    stakeFaveur = clampStake(stake);
    if (stakeFaveur <= 0) return null;
    if ((state.faveur || 0) < stakeFaveur) return null;
    state.faveur = Math.max(0, (state.faveur || 0) - stakeFaveur);
  }

  const stops = SLOTS_REELS.map((reel) => Math.min(reel.length - 1, Math.floor(Math.random() * reel.length)));
  const grid = slotsWindow(stops);
  const ev = slotsEvaluate(grid);
  const mult = fs ? SLOTS_FREE_MULT : 1;
  const result = {
    stops, grid, lines: ev.lines, pay: ev.pay, free: Boolean(fs), mult,
    stakeFaveur, stars: ev.stars, wheels: ev.wheels, coins: ev.coins,
    faveurGain: 0, freeSpinsWon: 0,
    freeLeft: fs ? fs.left : 0,
    wheel: ev.wheel ? drawWheel(stakeFaveur, fs) : null,
    holdWin: ev.holdWin ? drawHoldWin(stakeFaveur, ev.coinCells, fs) : null
  };

  let applied = false;
  result.apply = () => {
    if (applied) return result;
    applied = true;
    const hist = Array.isArray(state.slotsHistory) ? state.slotsHistory : (state.slotsHistory = []);
    hist.push(ev.holdWin ? 'pieces' : ev.wheel ? 'roue' : ev.freeSpins ? 'tours' : ev.pay > 0 ? 'gain' : 'perte');
    if (hist.length > SLOTS_HISTORY_LEN) hist.splice(0, hist.length - SLOTS_HISTORY_LEN);

    if (ev.pay > 0) {
      result.faveurGain = payRound(stakeFaveur * ev.pay * mult);
      state.faveur = Math.max(0, (state.faveur || 0) + result.faveurGain);
    }
    if (fs && fs === state.slotsFreeSpins) fs.won += result.faveurGain;
    if (ev.freeSpins) {
      result.freeSpinsWon = ev.freeSpins;
      addFreeSpins(stakeFaveur, ev.freeSpins, fs);
      chronicle(tr({
        fr: `${ev.stars} étoiles à la machine à sous : ${ev.freeSpins} tours gratuits.`,
        en: `${ev.stars} stars at the slot machine: ${ev.freeSpins} free spins.`
      }));
    }
    result.freeLeft = slotsFreeSpins() ? slotsFreeSpins().left : 0;
    // La cagnotte est nourrie sur l'EDGE d'un tour PAYÉ ; tours gratuits, roue et Hold &
    // Win sont dans le RTP de référence (ils n'en nourrissent donc pas une seconde fois).
    // La réputation (lot 2), elle aussi sur les seuls tours PAYÉS.
    if (!fs) { feedPot(stakeFaveur, slotsRtpRef()); recordWager(stakeFaveur, slotsRtpRef()); }
    recordSlots({ wagered: fs ? 0 : stakeFaveur, won: result.faveurGain, freeSpins: ev.freeSpins > 0, wheel: ev.wheel, holdWin: ev.holdWin });

    if (!silent) {
      const label = ev.holdWin ? tr({ fr: '🎰 Hold & Win !', en: '🎰 Hold & Win!' })
        : ev.freeSpins ? tr({ fr: `🎰 ${ev.freeSpins} tours gratuits`, en: `🎰 ${ev.freeSpins} free spins` })
          : result.faveurGain > 0 ? tr({ fr: `🎰 +${fmt(result.faveurGain)} faveur`, en: `🎰 +${fmt(result.faveurGain)} favor` })
            : ev.wheel ? tr({ fr: '🎰 la roue !', en: '🎰 the wheel!' }) : tr({ fr: '🎰 rien', en: '🎰 nothing' });
      pushOutcomeFloat({ label, kind: result.faveurGain > 0 || ev.freeSpins || ev.wheel || ev.holdWin ? 'gain' : 'cost' });
    }
    if (doRender) render();
    return result;
  };

  if (!defer) result.apply();
  return result;
}
