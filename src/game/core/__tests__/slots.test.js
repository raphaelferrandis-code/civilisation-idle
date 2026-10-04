"use strict";
// La machine à sous (2026-10-03 ; v2 : 5 rouleaux, joker, Hold & Win) — moteur. Le RTP de
// référence est CALCULÉ (slotsMath.js) : la simulation doit le retrouver. Lot 1 des gains
// « vrai casino » (2026-10-04) : la mise est LIBRE entre les limites de la table (toutes
// lignes comprises) ; une série de tours gratuits garde SA mise (un montant), la case
// « vol » de la roue offre un vol d'Icare à la mise du tour.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, invalidateRenderCache } from "../state.js";
import { spinSlots, slotsOdds, slotsRtpRef, slotsWindow, slotsEvaluate, slotsFreeSpins, slotsUnlocked, SLOTS_CFG, SLOTS_CELLS } from "../actions/slots.js";
import { lineWin, hwOutlook, slotsOddsOf } from "../actions/slotsMath.js";
import { tableLimits } from "../actions/maisonTable.js";
import { ICARUS_RTP, TEMPLE_POT_RECYCLE, SLOTS_REELS, SLOTS_FREE_SPINS, SLOTS_FREE_MULT, SLOTS_WHEEL, SLOTS_UNLOCK_ERA, SLOTS_PAY, SLOTS_HW, SLOTS_WILD } from "../balance.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const FAVEUR_START = 100000;
// Les trois anciennes mises fixes (jeton, rouleau, lingot), jouées en mise libre.
const JETON = 4;
const ROULEAU = 10;
const LINGOT = 25;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  state.bestEraIndex = SLOTS_UNLOCK_ERA; // la Fonte : limite haute 75 000
  state.faveur = FAVEUR_START;
  state.icarusPotFaveur = 0;
  state.slotsHistory = [];
  state.slotsFreeSpins = null;
  state.icarusFreeFlights = [];
  invalidateRenderCache("all");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Des arrêts qui donnent une fenêtre voulue (recherche dans un sous-ensemble : 29⁵ est
// trop grand pour tout parcourir, on balaie les trois premiers rouleaux et on teste
// quelques arrêts des deux derniers).
function stopsWhere(pred) {
  const L = SLOTS_REELS.map((r) => r.length);
  for (let a = 0; a < L[0]; a += 1) for (let b = 0; b < L[1]; b += 1) for (let c = 0; c < L[2]; c += 1) {
    for (let d = 0; d < L[3]; d += 3) for (let e = 0; e < L[4]; e += 3) {
      const st = [a, b, c, d, e];
      if (pred(slotsEvaluate(slotsWindow(st)), st)) return st;
    }
  }
  return null;
}
const rnd = (stops) => stops.map((s, r) => (s + 0.5) / SLOTS_REELS[r].length);
function spinWith(stops, stake = JETON, tail = [], opts = {}, rest = 0.999) {
  const seq = [...rnd(stops), ...tail];
  vi.spyOn(Math, "random").mockImplementation(() => (seq.length ? seq.shift() : rest));
  const res = spinSlots(stake, opts);
  Math.random.mockRestore();
  return res;
}

describe("Machine à sous — la machine", () => {
  it("ouvre à la Fonte, pas avant", () => {
    expect(slotsUnlocked()).toBe(true);
    state.bestEraIndex = SLOTS_UNLOCK_ERA - 1;
    expect(slotsUnlocked()).toBe(false);
    expect(spinSlots(JETON)).toBeNull();
  });

  it("cinq rouleaux ; le joker n'est que sur les trois du milieu", () => {
    expect(SLOTS_REELS).toHaveLength(5);
    expect(SLOTS_REELS[0]).not.toContain(SLOTS_WILD);
    expect(SLOTS_REELS[4]).not.toContain(SLOTS_WILD);
    for (const r of [1, 2, 3]) expect(SLOTS_REELS[r]).toContain(SLOTS_WILD);
  });

  it("une ligne paie le plus long alignement depuis la gauche, joker compris", () => {
    expect(lineWin(["cerise", "joker", "cerise", "citron", "bar"], SLOTS_PAY, SLOTS_WILD)).toEqual({ symbol: "cerise", count: 3, pay: SLOTS_PAY.cerise[3] });
    expect(lineWin(["sept", "joker", "joker", "joker", "sept"], SLOTS_PAY, SLOTS_WILD)).toEqual({ symbol: "sept", count: 5, pay: SLOTS_PAY.sept[5] });
    expect(lineWin(["citron", "citron", "bar", "citron", "citron"], SLOTS_PAY, SLOTS_WILD)).toBeNull();
    expect(lineWin(["etoile", "etoile", "etoile", "cerise", "cerise"], SLOTS_PAY, SLOTS_WILD)).toBeNull();
  });

  it("jamais deux étoiles ni deux roues sur un même rouleau dans la fenêtre", () => {
    SLOTS_REELS.forEach((reel, r) => {
      for (let s = 0; s < reel.length; s += 1) {
        const col = [-1, 0, 1].map((d) => reel[(s + d + reel.length) % reel.length]);
        expect(col.filter((x) => x === "etoile").length, `rouleau ${r} arrêt ${s}`).toBeLessThanOrEqual(1);
        expect(col.filter((x) => x === "roue").length, `rouleau ${r} arrêt ${s}`).toBeLessThanOrEqual(1);
      }
    });
  });
});

describe("Machine à sous — le calcul", () => {
  it("le RTP calculé est sous 1 et proche de 92 %, quelle que soit la mise", () => {
    const rtp = slotsRtpRef();
    expect(rtp).toBeLessThan(0.96);
    expect(rtp).toBeGreaterThan(0.88);
  });

  it("la case « vol » de la roue est comptée à la mise du tour × le RTP d'Icare", () => {
    // Le vol offert se joue à la mise du tour : sa valeur, en mises, est le RTP d'Icare.
    // C'est ce total que lit feedPot (le sous-estimer gonflerait le versement).
    const rtp = slotsRtpRef();
    expect(rtp).toBeCloseTo(slotsOddsOf(SLOTS_CFG, ICARUS_RTP).rtp, 12);
    expect(rtp).toBeGreaterThan(slotsOddsOf(SLOTS_CFG, 0).rtp);
    // Plus de bascule : la cagnotte comprise, la machine reste sous 1.
    expect(rtp + TEMPLE_POT_RECYCLE * (1 - rtp)).toBeLessThan(1);
  });

  it("des bonus ni rares ni banals", () => {
    const o = slotsOdds();
    for (const p of [o.pS, o.pW]) { expect(p).toBeGreaterThan(1 / 150); expect(p).toBeLessThan(1 / 70); }
    expect(o.pH).toBeGreaterThan(1 / 260);
    expect(o.pH).toBeLessThan(1 / 120);
    expect(o.H).toBeGreaterThan(15);
  });

  it("le Hold & Win : la programmation dynamique retrouve la simulation", () => {
    let seed = 99;
    vi.spyOn(Math, "random").mockImplementation(() => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; });
    for (const k0 of [6, 9]) {
      let coins = 0, full = 0;
      const N = 30000;
      for (let t = 0; t < N; t += 1) {
        let k = k0, r = SLOTS_HW.respins;
        while (r > 0 && k < SLOTS_CELLS) {
          let add = 0;
          for (let c = 0; c < SLOTS_CELLS - k; c += 1) if (Math.random() < SLOTS_HW.pNew) add += 1;
          k += add; r = add ? SLOTS_HW.respins : r - 1;
        }
        coins += k; if (k >= SLOTS_CELLS) full += 1;
      }
      const o = hwOutlook(k0, SLOTS_HW);
      expect(Math.abs(coins / N - o.coins) / o.coins, `k=${k0}`).toBeLessThan(0.01);
      expect(Math.abs(full / N - o.full), `k=${k0}`).toBeLessThan(0.01);
    }
  });

  it("la simulation retrouve le RTP calculé (tours, roue, Hold & Win compris ; vol et GRAND exclus)", () => {
    let seed = 2024;
    vi.spyOn(Math, "random").mockImplementation(() => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; });
    state.faveur = 1e12;
    let paid = 0, back = 0;
    for (let i = 0; i < 200000; i += 1) {
      const before = state.faveur;
      const free = Boolean(slotsFreeSpins());
      const r = spinSlots(ROULEAU, { render: false, silent: true });
      if (r.wheel) r.wheel.apply(Math.floor(Math.random() * 3));
      if (r.holdWin) r.holdWin.apply();
      if (!free) paid += ROULEAU;
      back += state.faveur - before + (free ? 0 : ROULEAU);
      state.icarusFreeFlights = [];
      state.icarusPotFaveur = 0;           // le GRAND (un transfert) ne compte pas
    }
    const ref = slotsOddsOf(SLOTS_CFG, 0).rtp;   // le vol d'Icare vaut 0 ici
    expect(Math.abs(back / paid - ref)).toBeLessThan(0.035);
  });
});

describe("Machine à sous — un tour", () => {
  it("paie la mise, paie les lignes, refuse sans solde", () => {
    const st = stopsWhere((ev) => ev.lines.length === 1 && ev.lines[0].symbol === "cerise" && ev.lines[0].count === 3 && !ev.freeSpins && !ev.wheel && !ev.holdWin);
    const res = spinWith(st, ROULEAU);
    expect(res.faveurGain).toBe(Math.floor(ROULEAU * SLOTS_PAY.cerise[3] + 0.0001));
    expect(state.faveur).toBe(FAVEUR_START - ROULEAU + res.faveurGain);
    state.faveur = 3;
    expect(spinSlots(JETON)).toBeNull();
  });

  it("la mise est libre : refusée sous 1, plafonnée à la limite haute", () => {
    // Sous la limite basse (ou illisible, comme un ancien id de mise) : pas de tour.
    for (const bad of [0, 0.5, -4, NaN, "jeton"]) expect(spinSlots(bad), String(bad)).toBeNull();
    expect(state.faveur).toBe(FAVEUR_START);
    expect(state.slotsHistory).toEqual([]);
    // Au-dessus de la limite haute : le tour coûte la limite, pas plus.
    const { max } = tableLimits();
    const st = stopsWhere((ev) => ev.pay === 0 && !ev.freeSpins && !ev.wheel && !ev.holdWin);
    const res = spinWith(st, max * 10);
    expect(res.stakeFaveur).toBe(max);
    expect(state.faveur).toBe(FAVEUR_START - max);
  });

  it("trois étoiles : 8 tours, joués à LEUR mise, gains doublés ; quatre : 12", () => {
    const three = stopsWhere((ev) => ev.stars === 3 && !ev.wheel && !ev.holdWin && ev.pay === 0);
    spinWith(three, LINGOT);
    // La série porte un MONTANT (plus d'id de mise).
    expect(slotsFreeSpins()).toEqual({ left: SLOTS_FREE_SPINS[3], stakeFaveur: LINGOT, won: 0, total: SLOTS_FREE_SPINS[3] });
    const win = stopsWhere((ev) => ev.lines.length === 1 && ev.lines[0].count === 3 && ev.lines[0].symbol === "bar" && !ev.freeSpins && !ev.wheel && !ev.holdWin);
    const before = state.faveur;
    const res = spinWith(win, JETON); // le tour gratuit passe AVANT la mise demandée
    expect(res.free).toBe(true);
    expect(res.stakeFaveur).toBe(LINGOT);
    expect(res.faveurGain).toBe(Math.round(LINGOT * SLOTS_PAY.bar[3] * SLOTS_FREE_MULT));
    expect(state.faveur).toBe(before + res.faveurGain); // rien n'est débité
    expect(slotsFreeSpins().won).toBe(res.faveurGain);
    state.slotsFreeSpins = null;
    const four = stopsWhere((ev) => ev.stars === 4 && !ev.wheel && !ev.holdWin);
    if (four) { spinWith(four, JETON); expect(slotsFreeSpins().left).toBe(SLOTS_FREE_SPINS[4]); }
  });

  it("trois roues : la roue est tirée d'avance, encaissée à sa révélation", () => {
    const wh = stopsWhere((ev) => ev.wheel && !ev.freeSpins && !ev.holdWin);
    const idx = SLOTS_WHEEL.indexOf(20);
    const res = spinWith(wh, JETON, [(idx + 0.5) / SLOTS_WHEEL.length], { defer: true });
    res.apply();
    const before = state.faveur;
    expect(res.wheel.segment).toBe(20);
    res.wheel.apply();
    res.wheel.apply();
    expect(state.faveur).toBe(before + JETON * 20);
  });

  it("la case « vol » de la roue offre un vol d'Icare À LA MISE du tour", () => {
    const wh = stopsWhere((ev) => ev.wheel && !ev.freeSpins && !ev.holdWin);
    const idx = SLOTS_WHEEL.indexOf("vol");
    const res = spinWith(wh, ROULEAU, [(idx + 0.5) / SLOTS_WHEEL.length], { defer: true });
    res.apply();
    expect(res.wheel.segment).toBe("vol");
    expect(state.icarusFreeFlights).toEqual([]); // le billet attend la révélation
    const before = state.faveur;
    res.wheel.apply();
    res.wheel.apply(); // idempotent : un seul billet
    expect(res.wheel.flight).toBe(true);
    expect(state.icarusFreeFlights).toEqual([ROULEAU]);
    expect(state.faveur).toBe(before); // un billet, pas de la Faveur
  });

  it("six pièces : le Hold & Win, tiré d'avance, cohérent, encaissé à la fin", () => {
    const st = stopsWhere((ev) => ev.holdWin && !ev.wheel && !ev.freeSpins);
    expect(st).toBeTruthy();
    const res = spinWith(st, ROULEAU, [], { defer: true }, 0.5);
    const hw = res.holdWin;
    expect(hw.initial.length).toBeGreaterThanOrEqual(SLOTS_HW.trigger);
    for (const c of hw.initial) expect(hw.board[c]).toBeTruthy();
    // Les relances s'arrêtent à zéro (ou grille pleine) ; le total est la somme des pièces.
    const last = hw.rounds[hw.rounds.length - 1];
    expect(hw.full || last.respins === 0).toBe(true);
    expect(hw.total).toBe(hw.board.reduce((s, c) => s + (c ? c.v : 0), 0));
    res.apply();
    const before = state.faveur;
    hw.apply();
    hw.apply();
    expect(state.faveur - before).toBe(Math.round(ROULEAU * hw.total));
  });

  it("les quinze cases : le GRAND rafle la cagnotte au prorata de la mise", () => {
    const st = stopsWhere((ev) => ev.holdWin && !ev.wheel && !ev.freeSpins);
    const { max } = tableLimits(); // la mise maximale de la table rafle tout
    state.icarusPotFaveur = 1000;
    // Tout aléa sous pNew : chaque case vide reçoit une pièce dès la première relance.
    const res = spinWith(st, max, [], { defer: true }, 0.001);
    expect(res.holdWin.full).toBe(true);
    res.apply();                                     // le tour payé nourrit d'abord la cagnotte
    const pot = Math.floor(state.icarusPotFaveur), before = state.faveur;
    res.holdWin.apply();
    expect(res.holdWin.grandFaveur).toBe(pot);
    expect(state.faveur - before).toBe(Math.round(max * res.holdWin.total) + pot);
    expect(state.icarusPotFaveur).toBeLessThan(1);
  });

  it("à un dixième de la limite, le GRAND n'emporte qu'un dixième de la cagnotte", () => {
    const st = stopsWhere((ev) => ev.holdWin && !ev.wheel && !ev.freeSpins);
    const stake = tableLimits().max / 10;
    state.icarusPotFaveur = 1000;
    const res = spinWith(st, stake, [], { defer: true }, 0.001);
    expect(res.holdWin.full).toBe(true);
    res.apply();
    const pot = state.icarusPotFaveur;
    res.holdWin.apply();
    expect(res.holdWin.grandFaveur).toBe(Math.round(pot * 0.1));
    expect(state.icarusPotFaveur).toBeCloseTo(pot - res.holdWin.grandFaveur, 9); // le reste demeure en cella
  });

  it("la série survit à la sauvegarde (en montant), tombe si sa mise est invalide", () => {
    const three = stopsWhere((ev) => ev.stars === 3 && !ev.wheel && !ev.holdWin);
    spinWith(three, ROULEAU);
    const saved = JSON.parse(JSON.stringify(state));
    expect(hydrateState(saved).slotsFreeSpins).toEqual({ left: SLOTS_FREE_SPINS[3], stakeFaveur: ROULEAU, won: 0, total: SLOTS_FREE_SPINS[3] });
    // Une série d'avant le lot 1 portait déjà son montant à côté de l'id : elle garde
    // le montant, l'id tombe.
    const avant = { left: 3, stakeId: "lingot", stakeFaveur: LINGOT, won: 12, total: 8 };
    expect(hydrateState({ ...saved, slotsFreeSpins: avant }).slotsFreeSpins).toEqual({ left: 3, stakeFaveur: LINGOT, won: 12, total: 8 });
    // Une série sans montant valide (save trafiquée) tombe.
    expect(hydrateState({ ...saved, slotsFreeSpins: { left: 3, stakeId: "triche" } }).slotsFreeSpins).toBeNull();
    expect(hydrateState({ ...saved, slotsFreeSpins: { left: 3, stakeFaveur: -5 } }).slotsFreeSpins).toBeNull();
  });
});
