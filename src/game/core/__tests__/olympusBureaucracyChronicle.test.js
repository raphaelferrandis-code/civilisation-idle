"use strict";
// Héritage de l'Olympe « Bureaucratie Sacrée » (audit du 2026-10-05, BUG-26) :
// chaque acte de régulation — y compris chaque édit de l'Intendance, un toutes
// les 20 s par consigne — écrivait sa ligne « +3 savoirs » dans la Chronique,
// plafonnée à 48 lignes : les vraies entrées du Journal en étaient chassées.
// Le savoir reste versé à CHAQUE acte ; la Chronique n'en garde qu'une ligne par
// minute au plus, qui cumule les versements, et la chute écrit le reliquat du
// cycle qui tombe. Montants indexés sur la production (décision de Raph, b) :
// Bureaucratie = max(3, 2 s de Savoir) par acte ; Sommeil = 10 % du Savoir
// produit pendant l'inactivité.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, setOfflineSim, invalidateRenderCache } from "../state.js";
import { D, Decimal } from "../num.js";
import { fmt } from "../utils.js";
import { rates } from "../mechanics.js";
import { registerOlympusCrisisResolved, registerOlympusCollapse, tickOlympus } from "../actions/olympus.js";
import { OLYMPUS_IDLE_THRESHOLD_MS } from "../../data/olympus.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const bureaucracyLines = () => (state.history || []).filter((l) => l.includes("Bureaucratie Sacrée"));

// Le cumul vit en mémoire de module : chaque test part d'une heure bien plus
// tardive que le précédent, pour que la minute du test d'avant soit échue.
let base = FIXED_NOW;

beforeEach(() => {
  base += 24 * 3600 * 1000;
  vi.useFakeTimers();
  vi.setSystemTime(base);
  setState(hydrateState(MID_GAME_FIXTURE));
  state.olympus.unlockedProfile = "bureaucracy";
  state.olympus.lastInteractionAt = base; // pas d'inactivité : rien d'autre ne bouge
  state.history = [];
});

afterEach(() => {
  setOfflineSim(false);
  vi.useRealTimers();
});

describe("Bureaucratie Sacrée : une ligne de Chronique par minute (BUG-26)", () => {
  it("dix édits d'affilée : dix versements, une seule ligne, puis le cumul à la minute suivante", () => {
    const k0 = D(state.knowledge);
    registerOlympusCrisisResolved();
    const perAct = D(state.knowledge).sub(k0).toNumber();
    expect(perAct).toBeGreaterThanOrEqual(3); // plancher de l'héritage
    expect(bureaucracyLines()).toHaveLength(1);

    for (let i = 0; i < 9; i++) {
      vi.setSystemTime(base + (i + 1) * 5000); // un édit toutes les 5 s
      registerOlympusCrisisResolved();
    }
    // Chaque acte a versé son savoir…
    expect(D(state.knowledge).sub(k0).toNumber()).toBe(perAct * 10);
    // … mais la minute n'est pas échue : toujours une seule ligne.
    expect(bureaucracyLines()).toHaveLength(1);
    expect(state.olympus.crisesResolved).toBeGreaterThanOrEqual(10);

    // La minute passe : le tick écrit le cumul des 9 actes, sans nouvel édit.
    vi.setSystemTime(base + 61_000);
    tickOlympus(1);
    const lines = bureaucracyLines();
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("9 crises");
    expect(lines[1]).toContain(`+${fmt(D(perAct * 9))} savoirs`);

    // Rien en attente : un tick plus tard n'écrit rien.
    vi.setSystemTime(base + 200_000);
    tickOlympus(1);
    expect(bureaucracyLines()).toHaveLength(2);
  });

  it("la chute écrit le reliquat du cycle qui tombe, sans attendre la minute", () => {
    registerOlympusCrisisResolved(); // première ligne, immédiate
    vi.setSystemTime(base + 10_000);
    registerOlympusCrisisResolved();
    registerOlympusCrisisResolved();
    expect(bureaucracyLines()).toHaveLength(1);
    registerOlympusCollapse("auto_collapse");
    const lines = bureaucracyLines();
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("2 crises");
  });

  it("hors ligne : le savoir est versé, mais rien ne s'écrit dans un Journal jeté", () => {
    registerOlympusCrisisResolved(); // ligne immédiate, rien en attente ensuite
    const k0 = D(state.knowledge);
    state.history = [];
    setOfflineSim(true);
    vi.setSystemTime(base + 120_000);
    registerOlympusCrisisResolved();
    registerOlympusCrisisResolved();
    tickOlympus(1);
    expect(D(state.knowledge).gt(k0)).toBe(true);
    expect(bureaucracyLines()).toHaveLength(0);
    setOfflineSim(false);
    // De retour en ligne, rien ne remonte de l'absence.
    vi.setSystemTime(base + 300_000);
    tickOlympus(1);
    expect(bureaucracyLines()).toHaveLength(0);
  });

  it("sans le profil Bureaucratie : ni savoir ni ligne", () => {
    state.olympus.unlockedProfile = "abyss";
    const k0 = D(state.knowledge);
    registerOlympusCrisisResolved();
    expect(D(state.knowledge).eq(k0)).toBe(true);
    expect(bureaucracyLines()).toHaveLength(0);
  });
});

// Une cité qui produit beaucoup de Savoir : le plancher de 3 n'y joue plus.
function bigKnowledgeCity() {
  state.buildings = { ...state.buildings, scribes: 5000, storytellers: 5000 };
  state.grandResetCount = 10;
  invalidateRenderCache("all");
}

describe("Héritages de l'Olympe indexés sur la production (BUG-26)", () => {
  it("Bureaucratie : max(3, 2 s de production de Savoir) par acte", () => {
    const rate = D(rates().knowledge).max(0);
    const expected = rate.mul(2).max(3).round();
    const k0 = D(state.knowledge);
    registerOlympusCrisisResolved();
    expect(D(state.knowledge).sub(k0).sub(expected).abs().lte(expected.mul(1e-9))).toBe(true);
  });

  it("Bureaucratie : dans une grande cité, un acte vaut 2 s de production, plus le forfait de 3", () => {
    bigKnowledgeCity();
    const rate = D(rates().knowledge);
    expect(rate.gt(1000)).toBe(true);
    const k0 = D(state.knowledge);
    registerOlympusCrisisResolved();
    expect(D(state.knowledge).sub(k0).div(rate.mul(2)).toNumber()).toBeCloseTo(1, 3);
  });

  it("Bureaucratie : en Decimal au-delà du float (stock à 1e400)", () => {
    state.knowledge = new Decimal("1e400");
    invalidateRenderCache("all");
    registerOlympusCrisisResolved();
    expect(D(state.knowledge).gte(new Decimal("1e400"))).toBe(true);
    expect(Number.isNaN(D(state.knowledge).mantissa)).toBe(false);
  });

  it("Sommeil : 10 % du Savoir produit pendant l'inactivité, rien quand le joueur est là", () => {
    state.olympus.unlockedProfile = "sleep";
    bigKnowledgeCity(); // la fixture ne produit pas encore de Savoir
    const r = rates();
    // Joueur présent : rien.
    let k0 = D(state.knowledge);
    tickOlympus(10, r);
    expect(D(state.knowledge).eq(k0)).toBe(true);
    // Plus de 3 min sans geste : 10 % de la production du pas.
    vi.setSystemTime(base + OLYMPUS_IDLE_THRESHOLD_MS + 1000);
    k0 = D(state.knowledge);
    tickOlympus(10, r);
    const expected = D(r.knowledge).max(0).mul(0.1 * 10);
    expect(expected.gt(0)).toBe(true);
    expect(D(state.knowledge).sub(k0).div(expected).toNumber()).toBeCloseTo(1, 6);
  });
});
