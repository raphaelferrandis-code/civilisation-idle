"use strict";
// La machine à sous (2026-10-03) — moteur. Trois rouleaux, cinq lignes ; trois étoiles
// = tours gratuits (gains ×2), trois roues = la roue (multiplicateurs, coffres, tours,
// vol d'Icare, JACKPOT). Le RTP de référence est CALCULÉ (énumération exacte + équation
// des bonus) : la simulation doit le retrouver.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, invalidateRenderCache } from "../state.js";
import { spinSlots, slotsOdds, slotsRtpRef, slotsWindow, slotsEvaluate, slotsFreeSpins, slotsUnlocked } from "../actions/slots.js";
import { SLOTS_STAKES, SLOTS_REELS, SLOTS_FREE_SPINS, SLOTS_FREE_MULT, SLOTS_WHEEL, SLOTS_UNLOCK_ERA, SLOTS_PAY } from "../balance.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const FAVEUR_START = 10000;
const stakeOf = (id) => SLOTS_STAKES.find((s) => s.id === id).faveur;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  state.bestEraIndex = SLOTS_UNLOCK_ERA;
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

// Trouve des arrêts qui produisent une fenêtre voulue (ex. trois étoiles), puis les
// traduit en valeurs de Math.random (une par rouleau).
function stopsWhere(pred) {
  const [A, B, C] = SLOTS_REELS.map((r) => r.length);
  for (let a = 0; a < A; a += 1) for (let b = 0; b < B; b += 1) for (let c = 0; c < C; c += 1) {
    if (pred(slotsEvaluate(slotsWindow([a, b, c])), [a, b, c])) return [a, b, c];
  }
  return null;
}
const rnd = (stops) => stops.map((s, r) => (s + 0.5) / SLOTS_REELS[r].length);
function spinWith(stops, stakeId = "jeton", tail = [], opts = {}) {
  const seq = [...rnd(stops), ...tail];
  vi.spyOn(Math, "random").mockImplementation(() => (seq.length ? seq.shift() : 0.999));
  const res = spinSlots(stakeId, opts);
  Math.random.mockRestore();
  return res;
}

describe("Machine à sous — calibrage", () => {
  it("ouvre à la Fonte, pas avant", () => {
    expect(slotsUnlocked()).toBe(true);
    state.bestEraIndex = SLOTS_UNLOCK_ERA - 1;
    expect(slotsUnlocked()).toBe(false);
    expect(spinSlots("jeton")).toBeNull();
  });

  it("le RTP calculé est sous 1 et proche de 92 % pour chaque mise", () => {
    for (const s of SLOTS_STAKES) {
      const rtp = slotsRtpRef(s.id);
      expect(rtp, s.id).toBeLessThan(0.96);
      expect(rtp, s.id).toBeGreaterThan(0.88);
    }
  });

  it("une ligne gagnante un tour sur six, tours gratuits et roue ni rares ni banals", () => {
    const o = slotsOdds("jeton");
    expect(o.hit).toBeGreaterThan(0.12);
    expect(o.hit).toBeLessThan(0.22);
    for (const p of [o.pS, o.pW]) { expect(p).toBeGreaterThan(1 / 150); expect(p).toBeLessThan(1 / 60); }
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

  it("la simulation retrouve le RTP calculé (tours gratuits et roue compris, jackpot exclu)", () => {
    // Hasard à graine : 150 000 tours payés, chaque roue encaissée (coffre au hasard).
    let seed = 12345;
    vi.spyOn(Math, "random").mockImplementation(() => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; });
    state.faveur = 1e12;
    let paid = 0, back = 0;
    for (let i = 0; i < 150000; i += 1) {
      const before = state.faveur;
      const free = Boolean(slotsFreeSpins());
      const r = spinSlots("rouleau", { render: false, silent: true });
      if (!free) paid += stakeOf("rouleau");
      if (r.wheel) r.wheel.apply(Math.floor(Math.random() * 3));
      back += state.faveur - before + (free ? 0 : stakeOf("rouleau"));
      state.icarusFreeFlights = [];
      state.icarusPotFaveur = 0;           // le jackpot (un transfert) ne compte pas
    }
    const rtp = back / paid;
    // Le vol d'Icare est compté au plancher d'edge dans la référence et vaut 0 ici :
    // on le retire de la référence pour comparer ce qui est comparable.
    const o = slotsOdds("rouleau");
    const volShare = (o.pW + o.pS * o.spins * o.pW) * (1 / SLOTS_WHEEL.length) * ((10 * 1.04) / 10);
    expect(Math.abs(rtp - (o.rtp - volShare))).toBeLessThan(0.03);
  });
});

describe("Machine à sous — un tour", () => {
  it("paie la mise, paie les lignes, refuse sans solde", () => {
    const stops = stopsWhere((ev) => ev.lines.length === 1 && ev.lines[0].symbol === "cerise" && !ev.freeSpins && !ev.wheel);
    const res = spinWith(stops, "rouleau");
    expect(res.lines[0].symbol).toBe("cerise");
    expect(res.faveurGain).toBe(stakeOf("rouleau") * SLOTS_PAY.cerise);
    expect(state.faveur).toBe(FAVEUR_START - stakeOf("rouleau") + res.faveurGain);
    state.faveur = 3;
    expect(spinSlots("jeton")).toBeNull();
  });

  it("trois étoiles : une série de tours gratuits, jouée à SA mise, gains doublés", () => {
    const star = stopsWhere((ev) => ev.freeSpins && !ev.wheel && ev.pay === 0);
    spinWith(star, "lingot");
    const fs = slotsFreeSpins();
    expect(fs.left).toBe(SLOTS_FREE_SPINS);
    expect(fs.stakeId).toBe("lingot");
    const win = stopsWhere((ev) => ev.lines.length === 1 && ev.lines[0].symbol === "cerise" && !ev.freeSpins && !ev.wheel);
    const before = state.faveur;
    const res = spinWith(win, "jeton");             // la mise choisie est ignorée : c'est un tour de la série
    expect(res.free).toBe(true);
    expect(res.faveurGain).toBe(stakeOf("lingot") * SLOTS_PAY.cerise * SLOTS_FREE_MULT);
    expect(state.faveur).toBe(before + res.faveurGain);
    expect(slotsFreeSpins().left).toBe(SLOTS_FREE_SPINS - 1);
    expect(slotsFreeSpins().won).toBe(res.faveurGain);
  });

  it("trois roues : la roue est tirée d'avance, encaissée à sa révélation", () => {
    const wh = stopsWhere((ev) => ev.wheel && !ev.freeSpins);
    const idx = SLOTS_WHEEL.indexOf(20);
    const res = spinWith(wh, "jeton", [(idx + 0.5) / SLOTS_WHEEL.length], { defer: true });
    res.apply();
    const before = state.faveur;
    expect(res.wheel.segment).toBe(20);
    res.wheel.apply();
    res.wheel.apply();                                // idempotent
    expect(state.faveur).toBe(before + stakeOf("jeton") * 20);
  });

  it("la roue : coffres au choix, tours gratuits, vol d'Icare, JACKPOT au prorata de la mise", () => {
    const wh = stopsWhere((ev) => ev.wheel && !ev.freeSpins);
    const at = (seg) => [(SLOTS_WHEEL.indexOf(seg) + 0.5) / SLOTS_WHEEL.length];
    // Les coffres : le coffre choisi est payé.
    let res = spinWith(wh, "jeton", at("coffres"));
    let before = state.faveur;
    res.wheel.apply(2);
    expect(state.faveur - before).toBe(stakeOf("jeton") * res.wheel.chests[2]);
    // Les tours.
    res = spinWith(wh, "rouleau", at("tours"));
    res.wheel.apply();
    expect(slotsFreeSpins().left).toBe(SLOTS_FREE_SPINS);
    state.slotsFreeSpins = null;
    // Le vol d'Icare, à la hauteur de la mise.
    res = spinWith(wh, "lingot", at("vol"));
    res.wheel.apply();
    expect(state.icarusFreeFlights).toContain("hecatombe");
    // Le jackpot : le lingot (25) rafle toute la cagnotte, le jeton (4) une part.
    state.icarusPotFaveur = 1000;
    res = spinWith(wh, "lingot", at("jackpot"));
    before = state.faveur;
    const potBefore = state.icarusPotFaveur;
    res.wheel.apply();
    expect(state.faveur - before).toBe(Math.floor(potBefore));
    expect(state.icarusPotFaveur).toBeLessThan(1);
    state.icarusPotFaveur = 1000;
    res = spinWith(wh, "jeton", at("jackpot"));
    res.wheel.apply();
    expect(state.icarusPotFaveur).toBeGreaterThan(500);
  });

  it("la série survit à la sauvegarde, tombe à l'effondrement", () => {
    const star = stopsWhere((ev) => ev.freeSpins && !ev.wheel);
    spinWith(star, "rouleau");
    const saved = JSON.parse(JSON.stringify(state));
    const back = hydrateState(saved);
    expect(back.slotsFreeSpins.left).toBe(SLOTS_FREE_SPINS);
    expect(hydrateState({ ...saved, slotsFreeSpins: { left: 3, stakeId: "triche" } }).slotsFreeSpins).toBeNull();
  });
});
