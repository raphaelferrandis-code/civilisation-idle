"use strict";
// Régression des mécaniques d'anti-stabilisation (A1/A2/A6) et de récompense
// (B1/B2) ajoutées pour redonner une menace d'effondrement et du « peps ». Le
// golden-master fige déjà la valeur numérique de la Démesure à la fixture ; ici
// on couvre les COMPORTEMENTS que le golden ne voit pas : décroissance de l'infra
// excédentaire, accélération de l'Usure par la stagnation, jalons et aubaines.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

import { state, setState, hydrateState, invalidateRenderCache } from "../state.js";
import { Decimal, D } from "../num.js";
import { pressureBreakdown, timeWearRate } from "../mechanics.js";
import { tick } from "../actions/tick.js";
import { CRISIS_EVENTS } from "../../data/world.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";
import {
  DEMESURE_SOFT_CAP,
  STAGNATION_USURE_RAMP_SEC,
  STAGNATION_USURE_MAX_BONUS
} from "../balance.js";

const zeroBuildings = () =>
  Object.fromEntries(Object.keys(state.buildings).map((id) => [id, 0]));

beforeAll(() => {
  vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
});

afterAll(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  setState(hydrateState(MID_GAME_FIXTURE));
  // Neutralise les paliers de crise : ils ouvrent un dialogue UI (openChoiceDialog)
  // absent en environnement de test.
  state.crisisThresholds = Object.fromEntries(CRISIS_EVENTS.map((e) => [e.id, true]));
  invalidateRenderCache("all");
});

// Rework cadence late-game : la Démesure est désormais BORNÉE (soft cap) et
// RÉDUCTIBLE par la gouvernance (légitimité + politique). L'anti-immortalité est
// portée par l'USURE, plus par un socle de Rupture irréductible.
describe("A1 — Démesure (tension d'échelle bornée & gouvernable)", () => {
  it("est nulle sous le seuil, croît avec l'échelle, mais reste BORNÉE par le soft cap", () => {
    state.population = new Decimal(1e4); // = 10^DEMESURE_FREE_LOG_POP
    invalidateRenderCache("all");
    expect(pressureBreakdown().demesure).toBe(0);

    state.population = new Decimal(1e10);
    invalidateRenderCache("all");
    const d10 = pressureBreakdown().demesure;
    state.population = new Decimal(1e30);
    invalidateRenderCache("all");
    const d30 = pressureBreakdown().demesure;
    expect(d10).toBeGreaterThan(0);
    expect(d30).toBeGreaterThan(d10);            // croît avec la taille de la cité
    expect(d30).toBeLessThan(DEMESURE_SOFT_CAP); // mais ne dépasse jamais le soft cap
  });

  it("n'est PAS effacée par l'infra, mais EST réductible par la gouvernance (légitimité)", () => {
    state.population = new Decimal(1e12);
    state.infrastructure = new Decimal(1e9);
    state.legitimacy = 50;
    invalidateRenderCache("all");
    const dLowLegit = pressureBreakdown().demesure;
    expect(dLowLegit).toBeGreaterThan(0);

    // La légitimité (institutions qui administrent l'empire) réduit la Démesure —
    // c'est le levier de gouvernance du rework cadence late-game.
    state.legitimacy = 100000;
    invalidateRenderCache("all");
    const dHighLegit = pressureBreakdown().demesure;
    expect(dHighLegit).toBeLessThan(dLowLegit); // gouverner l'empire réduit la tension d'échelle
    expect(dHighLegit).toBeGreaterThan(0);      // jamais totalement effacée (DEMESURE_CUT_CAP)

    // total porte toujours (au moins) la Démesure résiduelle.
    expect(pressureBreakdown().total).toBeGreaterThanOrEqual(dHighLegit - 1e-9);
  });

  it("reste finie et bornée au-delà du plafond float", () => {
    state.population = new Decimal("1e320");
    invalidateRenderCache("all");
    const d = pressureBreakdown().demesure;
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(DEMESURE_SOFT_CAP);
  });
});

describe("A2 — Entretien de l'infrastructure", () => {
  it("résorbe l'infra fortement excédentaire", () => {
    state.population = new Decimal(1000);
    state.buildings = zeroBuildings();
    state.buildings.foragers = 5; // produisent pop/food, aucune infra
    state.infrastructure = new Decimal(1e6); // >> tolérance × demande
    invalidateRenderCache("all");
    const before = D(state.infrastructure);
    for (let i = 0; i < 600; i += 1) tick(1);
    const after = D(state.infrastructure);
    expect(after.lt(before)).toBe(true);
    expect(after.lt(before.mul(0.05))).toBe(true); // décroissance massive du surplus
    expect(after.toNumber()).toBeGreaterThan(0);   // mais ne tombe pas à zéro
  });

  it("ne grignote PAS l'infra utile d'une cité sous-équipée", () => {
    state.population = new Decimal(100000);
    state.buildings = zeroBuildings(); // aucune prod d'infra → on isole la décroissance
    state.infrastructure = new Decimal(50); // bien sous la demande de couverture
    invalidateRenderCache("all");
    const before = D(state.infrastructure);
    for (let i = 0; i < 30; i += 1) tick(1);
    expect(D(state.infrastructure).gte(before)).toBe(true);
  });
});

describe("A6 — Stagnation (Usure accélérée)", () => {
  it("majore l'Usure proportionnellement à la stagnation, jusqu'au plafond", () => {
    state.stagnationSec = 0;
    const base = timeWearRate();
    expect(base).toBeGreaterThan(0);

    state.stagnationSec = STAGNATION_USURE_RAMP_SEC; // +1.0
    expect(timeWearRate() / base).toBeCloseTo(2, 6);

    state.stagnationSec = STAGNATION_USURE_RAMP_SEC * 50; // plafonné
    expect(timeWearRate() / base).toBeCloseTo(1 + STAGNATION_USURE_MAX_BONUS, 6);
  });

  it("monte sous le seuil de Rupture et redescend au-dessus", () => {
    state.instability = 0.1;
    state.stagnationSec = 0;
    invalidateRenderCache("all");
    tick(1);
    expect(state.stagnationSec).toBeGreaterThan(0);

    state.instability = 0.9;
    state.stagnationSec = 100;
    invalidateRenderCache("all");
    tick(1);
    expect(state.stagnationSec).toBeLessThan(100);
  });
});

describe("B1 — Jalons de population", () => {
  it("enregistre chaque puissance de 10 franchie, une seule fois", () => {
    state.population = new Decimal(1e5);
    state.popMilestoneExp = 3;
    invalidateRenderCache("all");
    tick(0.001); // dt minuscule : la pop ne change pas de décade
    expect(state.popMilestoneExp).toBe(5);
  });
});

describe("B2 — Aubaines", () => {
  it("se déclenche à l'échéance, crédite la ressource et reprogramme l'horloge", () => {
    state.nextBoonAt = FIXED_NOW - 1; // échéance dépassée → déclenche au prochain tick
    const rnd = vi.spyOn(Math, "random").mockReturnValue(0); // BOONS[0] = caravane (or)
    const goldBefore = D(state.gold);
    tick(0.001); // production négligeable devant l'aubaine (≈110 s de revenu)
    expect(D(state.gold).gt(goldBefore)).toBe(true);
    expect(state.nextBoonAt).toBeGreaterThan(FIXED_NOW);
    rnd.mockRestore();
  });

  it("ne se déclenche pas avant l'échéance", () => {
    state.nextBoonAt = FIXED_NOW + 60_000; // dans le futur
    const before = D(state.gold);
    tick(0.001);
    // Sur dt=0.001 s, seule une production infime s'ajoute (~quelques unités d'or)
    // — très loin du saut d'une aubaine (~110 s de revenu, ordre du million ici).
    expect(D(state.gold).sub(before).lt(1000)).toBe(true);
    expect(state.nextBoonAt).toBe(FIXED_NOW + 60_000); // horloge inchangée
  });
});
